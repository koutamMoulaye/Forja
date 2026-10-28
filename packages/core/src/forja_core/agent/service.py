"""Business agent: from a request in French to a published data mart.

request → local pre-selection → deterministic parser (or the language model when
the parser is not confident) → MartSpec | Clarification | refusal → strict
validation → deterministic SQL → verification preview → user validation →
(engineer approval) → dbt model ``mart_<name>``, serving and exports.

Each step that needs the warehouse or a language model runs as a job; every new
question, answer or refinement is a new version of the request.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from datetime import date
from decimal import Decimal
from pathlib import Path

import duckdb

from forja_core.agent.compile import CompiledMart, compile_spec
from forja_core.agent.interpreter import InterpretationError, InterpretRequest, MartInterpreter
from forja_core.agent.models import (
    AgentOverview,
    AgentPath,
    ClarificationAnswer,
    LLMTrace,
    MartColumn,
    MartIteration,
    MartRequest,
    MartStatus,
    MartValidation,
    OptionCount,
    TermCorrection,
)
from forja_core.agent.parser import ParseOutcome, clarification, parse, refine
from forja_core.agent.preselect import preselect
from forja_core.agent.preview import build_preview
from forja_core.agent.spec import AgentAnswer, Clarification, MartSpec
from forja_core.agent.suggestions import suggestions
from forja_core.agent.summary import describe, summarize
from forja_core.agent.terms import correctable, corrected
from forja_core.agent.validate import validate_spec
from forja_core.agent.vocabulary import Vocabulary
from forja_core.auth.models import Action, Principal
from forja_core.catalog import Catalog
from forja_core.config import Settings
from forja_core.errors import (
    ConflictError,
    ForbiddenError,
    ForjaError,
    PlanStateError,
    PlanValidationError,
)
from forja_core.gold.build import gold_inputs
from forja_core.gold.publication import gold_treatments
from forja_core.jobs.errors import RunFailedError
from forja_core.jobs.models import (
    ExportFormat,
    Job,
    JobType,
    ModelRunMetrics,
    RunMetrics,
    RunRequest,
)
from forja_core.jobs.scope import JobCancelledError, report
from forja_core.locks import WarehouseLocks
from forja_core.logging import get_logger
from forja_core.models import ColumnSchema
from forja_core.profiling.models import PiiType
from forja_core.semantic.models import SemanticLayer
from forja_core.semantic.service import SemanticService, visible
from forja_core.semantic.text import key, words
from forja_core.serving import Publisher
from forja_core.silver.dbt.project import DbtProjectGenerator, MartModel
from forja_core.silver.dbt.runner import DbtRunner
from forja_core.silver.plan import PiiTreatment
from forja_core.silver.tables import TableLayer, WarehouseTable
from forja_core.utils import quote_ident, utcnow

log = get_logger(__name__)

CreateJob = Callable[[str, RunRequest, str], Job]
StartJob = Callable[[str], None]
Audit = Callable[..., object]


class MartService:
    def __init__(
        self,
        catalog: Catalog,
        semantic: SemanticService,
        generator: DbtProjectGenerator,
        dbt: DbtRunner,
        locks: WarehouseLocks,
        publisher: Publisher,
        settings: Settings,
        interpreter: MartInterpreter | None = None,
    ) -> None:
        self.catalog = catalog
        self.semantic = semantic
        self.generator = generator
        self.dbt = dbt
        self.locks = locks
        self.publisher = publisher
        self.settings = settings
        self.interpreter = interpreter
        # Wired by the application: create a queued job, then hand it to the runner.
        self.create_job: CreateJob | None = None
        self.start_job: StartJob | None = None
        self.audit: Audit | None = None
        generator.marts = self.mart_models
        publisher.mart_columns = self.mart_columns

    # --- Lifecycle -------------------------------------------------------------------

    def _today(self) -> date:
        return (
            date.fromisoformat(self.settings.agent_today)
            if self.settings.agent_today
            else date.today()
        )

    def _job(self, request: MartRequest, job_type: JobType, principal: Principal) -> Job:
        assert self.create_job is not None, "MartService.create_job is wired by the application"
        return self.create_job(
            request.project_id,
            RunRequest(type=job_type, mart_request_id=request.id),
            principal.id,
        )

    def _start(self, job: Job) -> None:
        assert self.start_job is not None
        self.start_job(job.id)

    def _queue(self, request: MartRequest, iteration: MartIteration, principal: Principal) -> Job:
        job = self._job(request, JobType.MART_REQUEST, principal)
        iteration.job_id = job.id
        request.iterations.append(iteration)
        request.status = MartStatus.DRAFTED
        request.updated_at = utcnow()
        self.catalog.save_mart_request(request)
        self._start(job)
        return job

    def _record(
        self, principal: Principal, action: str, request: MartRequest, **details: object
    ) -> None:
        if self.audit is not None:
            self.audit(
                principal,
                action,
                project_id=request.project_id,
                object_type="mart_request",
                object_id=request.id,
                details=details,
            )

    def create(
        self, project_id: str, principal: Principal, question: str
    ) -> tuple[MartRequest, Job]:
        self.semantic.current(project_id)  # fails clearly before Gold is built
        now = utcnow()
        request = MartRequest(
            id=uuid.uuid4().hex,
            project_id=project_id,
            owner_id=principal.id,
            owner_email=principal.user.email,
            question=question.strip(),
            owner_unmasked=principal.can(project_id, Action.DATA_UNMASKED),
            created_at=now,
            updated_at=now,
        )
        iteration = MartIteration(
            version=1, kind="question", instruction=request.question,
            effective=request.question, created_at=now,
        )  # fmt: skip
        job = self._queue(request, iteration, principal)
        self._record(principal, "agent.request", request, question=request.question)
        return self.catalog.get_mart_request(request.id), job

    def _owned(self, mart_id: str, principal: Principal) -> MartRequest:
        request = self.catalog.get_mart_request(mart_id)
        if request.owner_id != principal.id:
            raise ForbiddenError("only the author of the request can continue it")
        if request.status is MartStatus.REJECTED:
            raise PlanStateError("the request was rejected: ask a new question")
        return request

    def _busy(self, request: MartRequest) -> None:
        latest = request.latest
        if latest is not None and latest.status == "processing":
            raise ConflictError("the agent is still working on the previous version")

    def answer(
        self, mart_id: str, principal: Principal, answer: ClarificationAnswer
    ) -> tuple[MartRequest, Job]:
        request = self._owned(mart_id, principal)
        self._busy(request)
        latest = request.latest
        if latest is None or latest.status != "clarification" or latest.clarification is None:
            raise PlanStateError("no question is waiting for an answer")
        asked = latest.clarification
        effective = latest.effective
        if answer.option is not None:
            if answer.option >= len(asked.options):
                raise PlanValidationError(f"option {answer.option} does not exist")
            chosen = asked.options[answer.option]
            request.bindings[" ".join(key(asked.term))] = chosen.ref
            text = chosen.label
        elif answer.text:
            text = answer.text.strip()
            pattern = re.compile(re.escape(asked.term), re.IGNORECASE)
            effective = (
                pattern.sub(text, effective, count=1)
                if pattern.search(effective)
                else f"{effective} {text}"
            )
        else:
            raise PlanValidationError("answer with an option index or a text")
        iteration = MartIteration(
            version=len(request.iterations) + 1,
            kind="answer",
            instruction=text,
            effective=effective,
            refines=latest.refines,
            created_at=utcnow(),
        )
        job = self._queue(request, iteration, principal)
        self._record(principal, "agent.answer", request, answer=text)
        return self.catalog.get_mart_request(mart_id), job

    def refine(
        self, mart_id: str, principal: Principal, instruction: str
    ) -> tuple[MartRequest, Job]:
        request = self._owned(mart_id, principal)
        self._busy(request)
        if request.current_spec is None:
            raise PlanStateError("nothing to refine yet: answer the question or ask again")
        iteration = MartIteration(
            version=len(request.iterations) + 1,
            kind="refinement",
            instruction=instruction.strip(),
            effective=instruction.strip(),
            refines=True,
            created_at=utcnow(),
        )
        request.validated_at = request.approved_at = None
        request.approved_by = request.approved_by_email = None
        job = self._queue(request, iteration, principal)
        self._record(principal, "agent.refine", request, instruction=instruction)
        return self.catalog.get_mart_request(mart_id), job

    def correct(
        self, mart_id: str, principal: Principal, correction: TermCorrection
    ) -> tuple[MartRequest, Job]:
        """A term of the summary corrected: the chosen spec is previewed as is."""
        request = self._owned(mart_id, principal)
        self._busy(request)
        read = next((it for it in request.iterations if it.version == correction.version), None)
        if read is None or read.spec is None or read.status != "previewed":
            raise PlanStateError(f"version {correction.version} has no preview to correct")
        if read.spec != request.current_spec:
            raise ConflictError("a newer preview exists: correct the latest one")
        layer = visible(self.semantic.current(request.project_id))
        data_range = (
            self.semantic.date_range(layer, layer.default_time_dimension)
            if layer.default_time_dimension
            else None
        )
        parts = describe(read.spec, layer)
        found = corrected(
            read.spec, layer, parts, correction.term, correction.option,
            data_range=data_range, values=self._attribute_values(layer),
        )  # fmt: skip
        if found is None:
            raise PlanValidationError("this term or option does not exist")
        label, spec = found
        was = parts[correction.term]
        assert was.term is not None
        iteration = MartIteration(
            version=len(request.iterations) + 1,
            kind="correction",
            instruction=f"{was.text} → {label}",
            effective=label,
            refines=True,
            proposed=spec,
            created_at=utcnow(),
        )
        request.validated_at = request.approved_at = None
        request.approved_by = request.approved_by_email = None
        job = self._queue(request, iteration, principal)
        self._record(
            principal, "agent.correct", request, term=was.term.kind, was=was.text, chosen=label
        )
        return self.catalog.get_mart_request(mart_id), job

    def validate(
        self, mart_id: str, principal: Principal, choice: MartValidation | None = None
    ) -> tuple[MartRequest, Job | None]:
        request = self._owned(mart_id, principal)
        latest = request.latest
        if request.status is not MartStatus.PREVIEWED or latest is None or latest.preview is None:
            raise PlanStateError("validate a request once its preview is ready")
        errors = [c for c in latest.preview.controls if c.status == "error"]
        if errors:
            raise PlanStateError(
                "the preview has failed controls: " + "; ".join(c.message for c in errors),
                details={"controls": [c.model_dump() for c in errors]},
            )
        request.status = MartStatus.VALIDATED
        request.validated_at = utcnow()
        if choice is not None and choice.destination is not None:
            request.destination = choice.destination
        # An engineer approves their own request at once, unless another engineer must
        # (FORJA_MART_ALLOW_SELF_APPROVAL, false by default in multi mode).
        if (
            self.settings.mart_require_approval
            and self.settings.mart_self_approval
            and principal.can(request.project_id, Action.MART_APPROVE)
        ):
            request.approved_by = principal.id
            request.approved_by_email = principal.user.email
            request.approved_at = request.validated_at
        self.catalog.save_mart_request(request)
        self._record(
            principal, "mart.validate", request, version=latest.version,
            destination=request.destination,
        )  # fmt: skip
        if self.settings.mart_require_approval and request.approved_at is None:
            return request, None
        return self._publish(request, principal)

    def approve(self, mart_id: str, principal: Principal) -> tuple[MartRequest, Job]:
        request = self.catalog.get_mart_request(mart_id)
        if not self.settings.mart_require_approval:
            raise PlanStateError("approval is not required (FORJA_MART_REQUIRE_APPROVAL=false)")
        if request.status is not MartStatus.VALIDATED:
            raise PlanStateError(
                f"only a validated request can be approved (it is {request.status.value})"
            )
        if request.approved_at is not None:
            raise ConflictError("the request is already approved")
        if request.owner_id == principal.id and not self.settings.mart_self_approval:
            raise ForbiddenError("another engineer approves this data mart")
        request.approved_by = principal.id
        request.approved_by_email = principal.user.email
        request.approved_at = utcnow()
        self.catalog.save_mart_request(request)
        self._record(principal, "mart.approve", request)
        published, job = self._publish(request, principal)
        assert job is not None
        return published, job

    def reject(self, mart_id: str, principal: Principal, reason: str) -> MartRequest:
        request = self.catalog.get_mart_request(mart_id)
        if request.status is MartStatus.PUBLISHED:
            raise PlanStateError("a published mart cannot be rejected")
        request.status = MartStatus.REJECTED
        request.rejected_by = principal.id
        request.rejection_reason = reason
        request.updated_at = utcnow()
        self.catalog.save_mart_request(request)
        self._record(principal, "mart.reject", request, reason=reason)
        return request

    def _publish(self, request: MartRequest, principal: Principal) -> tuple[MartRequest, Job]:
        job = self._job(request, JobType.PUBLISH_MART, principal)
        request.publish_job_id = job.id
        self.catalog.save_mart_request(request)
        self._start(job)
        return self.catalog.get_mart_request(request.id), job

    # --- Interpretation (job) --------------------------------------------------------

    def _values(self, layer: SemanticLayer) -> dict[str, list[str]]:
        values: dict[str, list[str]] = {}
        for dim in layer.dimensions:
            if dim.kind == "time":
                continue
            for attribute in dim.attributes:
                if attribute.filterable:
                    values[f"{dim.name}.{attribute.name}"] = self.semantic.distinct_values(
                        layer, dim, attribute
                    )
        return values

    def overview(self, project_id: str) -> AgentOverview:
        """Freshness of the data and suggested questions, for the analyst's home page."""
        gold = [t for t in self.catalog.list_tables(project_id) if t.layer is TableLayer.GOLD]
        latest = max(gold, key=lambda t: t.built_at, default=None)
        layer = visible(self.semantic.current(project_id))
        values = self._values(layer)
        data_range = (
            self.semantic.date_range(layer, layer.default_time_dimension)
            if layer.default_time_dimension
            else None
        )
        today = self._today()
        return AgentOverview(
            data_updated_at=latest.built_at if latest else None,
            gold_run_id=latest.last_run_id if latest else None,
            semantic_version=layer.version,
            suggestions=suggestions(
                layer, Vocabulary.build(layer, values), values, self._lookup(layer),
                today=today, default_year=data_range[1].year if data_range else today.year,
            ),
        )  # fmt: skip

    def _attribute_values(self, layer: SemanticLayer) -> Callable[[str], list[str]]:
        def values(ref: str) -> list[str]:
            found = layer.attribute(ref)
            return self.semantic.distinct_values(layer, *found) if found else []

        return values

    def process(self, job: Job, log_line: Callable[[str], None]) -> RunMetrics:
        request = self.catalog.get_mart_request(job.params.mart_request_id or "")
        iteration = next((it for it in request.iterations if it.job_id == job.id), None)
        if iteration is None:
            iteration = request.iterations[-1]
            iteration.job_id = job.id
        try:
            return self._process(job, request, iteration, log_line)
        except BaseException as exc:
            # The version is closed whatever happened (cancellation, model or warehouse
            # failure), so the user can ask again.
            iteration.status = "failed"
            iteration.error = "annulée" if isinstance(exc, JobCancelledError) else str(exc)
            request.status = MartStatus.PREVIEWED if request.current_spec else MartStatus.DRAFTED
            request.updated_at = utcnow()
            self.catalog.save_mart_request(request)
            raise

    def _process(
        self,
        job: Job,
        request: MartRequest,
        iteration: MartIteration,
        log_line: Callable[[str], None],
    ) -> RunMetrics:
        full = self.semantic.current(request.project_id)
        layer = visible(full)
        request.semantic_version = full.version
        today = self._today()
        report("preselection", "lecture de la couche sémantique et des valeurs", 10)
        values = self._values(layer)
        vocabulary = Vocabulary.build(layer, values)
        data_range = (
            self.semantic.date_range(layer, layer.default_time_dimension)
            if layer.default_time_dimension
            else None
        )
        default_year = data_range[1].year if data_range else today.year
        base = request.current_spec if iteration.refines else None
        if base is not None:
            outcome = refine(
                base, iteration.effective, layer, vocabulary,
                values=values, bindings=request.bindings, today=today,
            )  # fmt: skip
        else:
            outcome = parse(
                iteration.effective, layer, vocabulary, values=values,
                bindings=request.bindings, today=today, default_year=default_year,
            )  # fmt: skip
        matches = vocabulary.match(words(iteration.effective))
        selection = preselect(
            layer, matches, unknown_words=outcome.unknown, base=base, bindings=request.bindings
        )
        iteration.selected = selection.refs
        iteration.context_tokens = selection.tokens(today.isoformat())
        log_line(
            f"pre-selection: {len(selection.refs)} element(s), ~{iteration.context_tokens} tokens; "
            f"parser {'confident' if outcome.confident else 'not confident'}"
            + (f" (unknown: {', '.join(outcome.unknown)})" if outcome.unknown else "")
        )

        answer = outcome.answer if outcome.confident else None
        iteration.path = AgentPath.PARSER
        if iteration.proposed is not None:
            answer = AgentAnswer(kind="mart", mart=iteration.proposed)
        if answer is None and self.interpreter is not None:
            report("llm", f"interprétation par {self.interpreter.origin}", 30)
            try:
                answer = self.interpreter.interpret(
                    InterpretRequest(
                        project_id=request.project_id,
                        project_name=self.catalog.get_project(request.project_id).name,
                        instruction=iteration.effective,
                        selection=selection,
                        today=today.isoformat(),
                        base=base,
                        bindings=request.bindings,
                        hints=_hints(outcome),
                    )
                )
            except InterpretationError as exc:
                iteration.error = f"le modèle n'a pas pu répondre ({exc})"
                log_line(iteration.error)
            iteration.path = AgentPath.LLM
            calls = self.catalog.list_llm_calls(request.project_id, job_id=job.id)
            if calls:
                cached = all(c.status == "cached" for c in calls)
                iteration.path = AgentPath.LLM_CACHE if cached else AgentPath.LLM
                iteration.llm = LLMTrace(
                    input_tokens=sum(c.input_tokens for c in calls),
                    output_tokens=sum(c.output_tokens for c in calls),
                    duration_ms=sum(c.duration_ms for c in calls),
                    cached=cached,
                )
        if answer is not None and iteration.path is not AgentPath.PARSER:
            answer = _keep_local_findings(answer, outcome)
        if answer is None:
            answer = self._fallback(layer, outcome)
        report("validation", "validation et compilation", 70)
        self._apply(request, iteration, answer, layer, data_range, log_line)
        request.updated_at = utcnow()
        self.catalog.save_mart_request(request)
        job.result = {
            "mart_request_id": request.id,
            "version": iteration.version,
            "status": iteration.status,
            "path": iteration.path.value if iteration.path else None,
            "context_tokens": iteration.context_tokens,
        }
        return RunMetrics()

    def _fallback(self, layer: SemanticLayer, outcome: ParseOutcome) -> AgentAnswer:
        """Without a language model: ask about the unknown word, or refuse."""
        if outcome.answer is not None and outcome.answer.kind != "mart":
            return outcome.answer
        if outcome.unknown:
            word = outcome.unknown[0]
            refs = selection_refs_for(layer, word)
            options = [*refs[:3], "ignore"]
            ask = clarification(
                layer, word, options, f"Je ne connais pas « {word} ». Voulez-vous dire :"
            )
            if ask is not None and len(refs) >= 1:
                for option in ask.options:
                    if option.ref == "ignore":
                        option.label = f"Ignorer « {word} »"
                return AgentAnswer(kind="clarification", clarification=ask)
            if outcome.answer is None:
                return AgentAnswer(
                    kind="refusal",
                    refusal_reason=(
                        f"La demande porte sur « {' '.join(outcome.unknown)} », absent des données "
                        "de ce projet."
                    ),
                )
            return AgentAnswer(
                kind="refusal",
                refusal_reason=f"Je ne connais pas « {word} » dans les données de ce projet : "
                "reformulez avec les mesures et dimensions disponibles.",
            )
        if outcome.answer is None:
            defaults = [f"metric:{m.name}" for m in layer.metrics if m.default and not m.hidden]
            ask = clarification(layer, "mesure", defaults, "Quelle mesure souhaitez-vous ?")
            if ask is not None:
                return AgentAnswer(kind="clarification", clarification=ask)
            return AgentAnswer(kind="refusal", refusal_reason="Aucune mesure reconnue.")
        return outcome.answer

    def _clean(self, layer: SemanticLayer, asked: Clarification) -> Clarification | None:
        """Options of a model's question must name real elements."""
        kept = []
        for option in asked.options:
            kind, _, name = option.ref.partition(":")
            if option.ref == "ignore" or (
                (kind == "metric" and layer.metric(name))
                or (kind == "attribute" and layer.attribute(name))
                or (kind == "value" and layer.attribute(name.partition("=")[0]))
                or (kind in ("dimension", "time") and layer.dimension(name))
            ):
                kept.append(option)
        if len(kept) < 2:
            return None
        return asked.model_copy(update={"options": kept[:4]})

    def _apply(
        self,
        request: MartRequest,
        iteration: MartIteration,
        answer: AgentAnswer,
        layer: SemanticLayer,
        data_range: tuple[date, date] | None,
        log_line: Callable[[str], None],
    ) -> None:
        previous = request.current_spec
        fallback_status = MartStatus.PREVIEWED if previous is not None else MartStatus.DRAFTED
        if answer.kind == "mart" and answer.mart is not None:
            validation = validate_spec(answer.mart, layer, self._lookup(layer))
            if validation.spec is not None and validation.fact is not None:
                self._preview(
                    request, iteration, validation.spec, validation.fact, layer, data_range
                )
                log_line(f"preview: {iteration.summary}")
                return
            answer = (
                AgentAnswer(kind="clarification", clarification=validation.clarification)
                if validation.clarification
                else AgentAnswer(kind="refusal", refusal_reason=validation.refusal)
            )
        if answer.kind == "clarification" and answer.clarification is not None:
            cleaned = self._clean(layer, answer.clarification)
            if cleaned is not None:
                iteration.status = "clarification"
                iteration.clarification = cleaned
                iteration.option_counts = [
                    self._option_count(layer, option.ref) for option in cleaned.options
                ]
                request.status = MartStatus.DRAFTED
                log_line(f"clarification: {cleaned.question}")
                return
            answer = AgentAnswer(
                kind="refusal",
                refusal_reason=f"Je ne sais pas à quoi correspond « {answer.clarification.term} » "
                "dans ce projet.",
            )
        iteration.status = "refused"
        iteration.refusal = answer.refusal_reason or "Demande hors du périmètre des données."
        request.status = fallback_status
        log_line(f"refusal: {iteration.refusal}")

    def _option_count(self, layer: SemanticLayer, ref: str) -> OptionCount | None:
        """What an option covers: members having the value, distinct values of an
        attribute, or the total of a metric over all the data."""
        kind, _, name = ref.partition(":")
        try:
            if kind == "value":
                attribute_ref, _, value = name.partition("=")
                found = layer.attribute(attribute_ref)
                if found is None:
                    return None
                dim, attribute = found
                count = self.semantic.count_members(layer, dim, attribute, value)
                return OptionCount(value=count, unit=_plural(dim.label.lower(), count))
            if kind == "attribute":
                found = layer.attribute(name)
                if found is None or not found[1].filterable:
                    return None
                count = len(self.semantic.distinct_values(layer, *found))
                return OptionCount(value=count, unit=_plural(found[1].label.lower(), count))
            if kind == "metric":
                metric = layer.metric(name)
                if metric is None:
                    return None
                compiled = compile_spec(MartSpec(metrics=[metric.name]), layer, metric.fact)
                total = self.semantic.scalar(layer.project_id, compiled.sql)
                if not isinstance(total, int | float | Decimal):
                    return None
                return OptionCount(value=float(total), format=metric.format.value)
        except (duckdb.Error, ForjaError) as exc:
            log.warning("option_count_failed", ref=ref, error=str(exc))
        return None

    def _lookup(self, layer: SemanticLayer) -> Callable[..., list[str]]:
        return lambda dim, attribute: self.semantic.distinct_values(layer, dim, attribute)

    def _treatments(
        self, request: MartRequest, compiled: CompiledMart, layer: SemanticLayer
    ) -> dict[str, PiiTreatment]:
        treatments = {c.name: PiiTreatment.HASH for c in compiled.columns if c.pii}
        if not request.owner_unmasked:
            return treatments
        inputs = gold_inputs(self.catalog, request.project_id)
        if inputs is None:
            return treatments
        by_table = gold_treatments(*inputs)
        for column in compiled.columns:
            if not column.pii:
                continue
            found = layer.attribute(column.ref.partition(":")[2])
            if found is None:
                continue
            dim, attribute = found
            treated = by_table.get(dim.table, {}).get(attribute.column)
            treatments[column.name] = treated.treatment if treated else PiiTreatment.HASH
        return treatments

    def _preview(
        self,
        request: MartRequest,
        iteration: MartIteration,
        spec: MartSpec,
        fact: str,
        layer: SemanticLayer,
        data_range: tuple[date, date] | None,
    ) -> None:
        compiled = compile_spec(spec, layer, fact)
        report("preview", "calcul de l'aperçu et des contrôles", 85)
        warehouse = self.generator.warehouse_path(request.project_id)
        with (
            self.locks.hold(request.project_id, timeout=600),
            duckdb.connect(str(warehouse), read_only=True) as con,
        ):
            preview = build_preview(
                con,
                compiled,
                spec,
                layer,
                sample_rows=self.settings.mart_preview_rows,
                salt=self.publisher.secrets.salt(request.project_id),
                treatments=self._treatments(request, compiled, layer),
                data_range=data_range,
            )
        iteration.spec = spec
        iteration.sql = compiled.sql
        iteration.summary = summarize(spec, layer)
        iteration.summary_parts = correctable(
            spec, layer, data_range=data_range, values=self._attribute_values(layer)
        )
        iteration.preview = preview
        iteration.status = "previewed"
        request.status = MartStatus.PREVIEWED

    # --- Publication (job) -----------------------------------------------------------

    def _mart_name(self, request: MartRequest, spec: MartSpec) -> str:
        if request.published_name:
            return request.published_name
        base = f"mart_{spec.name}"[:60]
        taken = {
            r.published_name
            for r in self.catalog.list_mart_requests(request.project_id)
            if r.published_name and r.id != request.id
        } | {t.name for t in self.catalog.list_tables(request.project_id)}
        name, index = base, 2
        while name in taken:
            name, index = f"{base}_{index}", index + 1
        return name

    def publish(self, job: Job, log_line: Callable[[str], None]) -> RunMetrics:
        request = self.catalog.get_mart_request(job.params.mart_request_id or "")
        if request.status is not MartStatus.VALIDATED:
            raise PlanStateError(f"the request is {request.status.value}, not validated")
        if self.settings.mart_require_approval and request.approved_at is None:
            raise PlanStateError("an engineer must approve the request before publication")
        spec = request.current_spec
        latest = request.latest
        if spec is None or latest is None:
            raise PlanStateError("the request has no previewed specification")
        layer = visible(self.semantic.current(request.project_id))
        validation = validate_spec(spec, layer, self._lookup(layer))
        if validation.spec is None or validation.fact is None:
            raise ForjaError(
                "the semantic layer changed since the preview: refine the request",
                details={
                    "clarification": bool(validation.clarification),
                    "refusal": validation.refusal,
                },
            )
        compiled = compile_spec(validation.spec, layer, validation.fact)
        name = self._mart_name(request, validation.spec)
        summary = latest.summary or summarize(validation.spec, layer)
        model = MartModel(
            name=name,
            sql=(
                f"-- Data mart requested by {request.owner_email or request.owner_id}: "
                f"{request.question}\n"
                f"-- {summary}\n"
                f"-- Generated by Forja from mart request {request.id} v{latest.version}.\n"
                "-- Do not edit: this file is regenerated on each build.\n\n"
                "{{ config(materialized='table') }}\n\n" + compiled.dbt_sql
            ),
            description=summary,
            columns=[_column_doc(c) for c in compiled.columns],
        )
        project = self.catalog.get_project(request.project_id)
        inputs = gold_inputs(self.catalog, request.project_id)
        report("dbt", f"construction du modèle {name}", 30)
        with self.locks.hold(request.project_id):
            generated = self.generator.generate(
                project,
                self.catalog.effective_plans(request.project_id),
                gold=inputs,
                extra_marts=[model],
            )
            result = self.dbt.build(
                generated.path, select=[name], variables={"forja_run_id": job.id}, log=log_line
            )
            metrics = RunMetrics(dbt_tests=result.tests)
            if result.succeeded:
                table = self._register(request, name, compiled, job.id)
                metrics.models.append(
                    ModelRunMetrics(name=name, rows=table.row_count, status="success")
                )
        if not result.succeeded:
            request.publish_error = f"dbt build failed (exit code {result.returncode})"
            self.catalog.save_mart_request(request)
            raise RunFailedError(request.publish_error + "; see the run logs", metrics)

        request.model_sql = model.sql
        request.model_columns = compiled.columns
        request.model_summary = summary
        request.published_name = name
        request.published_table_id = table.id
        self.catalog.save_mart_request(request)
        report("serving", "publication dans la base serving et exports", 70)
        serving = self.publisher.publish(request.project_id, log_line)
        exports = []
        directory = self.publisher.exports_dir(request.project_id)
        for fmt in (ExportFormat.PARQUET, ExportFormat.CSV):
            exported = self.publisher.export(
                table, fmt, directory / f"{name}.{fmt.value}", strict=True
            )
            exports.append(
                exported.model_copy(
                    update={"path": self.publisher.workspace.relative(Path(exported.path))}
                )
            )
            log_line(f"export: {exported.path} ({exported.rows} rows)")
        metrics.exports = exports
        metrics.serving_path = self.publisher.workspace.relative(serving)
        request.status = MartStatus.PUBLISHED
        request.published_at = utcnow()
        request.exports = exports
        request.publish_error = None
        request.updated_at = utcnow()
        self.catalog.save_mart_request(request)
        job.result = {"mart_request_id": request.id, "table_id": table.id, "name": name}
        if self.audit is not None:
            self.audit(
                None,
                "mart.publish",
                project_id=request.project_id,
                object_type="mart_request",
                object_id=request.id,
                details={"table": name, "rows": table.row_count, "run_id": job.id},
            )
        return metrics

    def _register(
        self, request: MartRequest, name: str, compiled: CompiledMart, run_id: str
    ) -> WarehouseTable:
        warehouse = self.generator.warehouse_path(request.project_id)
        with duckdb.connect(str(warehouse), read_only=True) as con:
            columns = [
                ColumnSchema(name=str(r[0]), type=str(r[1]))
                for r in con.execute(f"DESCRIBE {quote_ident(name)}").fetchall()
            ]
            [(rows,)] = con.execute(f"SELECT count(*) FROM {quote_ident(name)}").fetchall()
        existing = self.catalog.find_table(request.project_id, name)
        return self.catalog.save_table(
            WarehouseTable(
                id=existing.id if existing else uuid.uuid4().hex,
                project_id=request.project_id,
                layer=TableLayer.MART,
                name=name,
                plan_version=request.semantic_version or 0,
                row_count=int(rows),
                columns=columns,
                built_at=utcnow(),
                last_run_id=run_id,
                publish=True,
                owner_id=request.owner_id,
            )
        )

    # --- Hooks for the dbt generator and the publisher -------------------------------

    def mart_models(self, project_id: str) -> list[MartModel]:
        models = []
        # A published mart being refined keeps its model until it is published again.
        for request in self.catalog.list_mart_requests(project_id):
            if request.model_sql and request.published_name:
                models.append(
                    MartModel(
                        name=request.published_name,
                        sql=request.model_sql,
                        description=request.model_summary or "",
                        columns=[_column_doc(c) for c in request.model_columns],
                    )
                )
        return models

    def mart_columns(self, table: WarehouseTable) -> dict[str, PiiType]:
        for request in self.catalog.list_mart_requests(table.project_id):
            if request.published_table_id == table.id:
                return {c.name: PiiType(c.pii) for c in request.model_columns if c.pii}
        return {}


def _keep_local_findings(answer: AgentAnswer, outcome: ParseOutcome) -> AgentAnswer:
    """Filters the parser matched on real values (and its period) are kept when the model
    leaves them out: a value found in the data is stronger evidence than the model's
    reading. A field the model uses as an axis is left alone."""
    spec = answer.mart
    local = outcome.answer.mart if outcome.answer is not None else None
    if answer.kind != "mart" or spec is None or local is None:
        return answer
    taken = {f.field for f in spec.filters} | set(spec.axes)
    missing = [f for f in local.filters if f.field not in taken]
    update: dict[str, object] = {}
    if missing:
        update["filters"] = [*spec.filters, *missing]
    if spec.period is None and local.period is not None:
        update["period"] = local.period
    if not update:
        return answer
    return answer.model_copy(update={"mart": spec.model_copy(update=update)})


def _hints(outcome: ParseOutcome) -> list[str]:
    """Partial understanding of the parser, for the model: refs and periods only."""
    spec = outcome.answer.mart if outcome.answer is not None else None
    if spec is None:
        return []
    hints = [f"metric {m}" for m in spec.metrics]
    hints += [f"axis {a}" for a in spec.axes]
    hints += [
        f"filter on {f.field} ({f.operator.value}), value as written in the request"
        for f in spec.filters
    ]
    if spec.period is not None:
        hints.append(f"period {spec.period.start} to {spec.period.end}")
    if spec.time_grain is not None:
        hints.append(f"time grain {spec.time_grain.value}")
    return hints


def _plural(noun: str, count: float) -> str:
    """« client » → « clients »; French nouns in -s, -x, -z do not change."""
    if count < 2 or noun.endswith(("s", "x", "z")):
        return noun
    first, _, rest = noun.partition(" ")
    first += "x" if first.endswith(("au", "eu")) else "s"
    return f"{first} {rest}".strip()


def _column_doc(column: MartColumn) -> dict[str, object]:
    meta: dict[str, object] = {"kind": column.kind, "ref": column.ref}
    if column.additivity:
        meta["additivity"] = column.additivity
    if column.pii:
        meta["pii"] = column.pii
    return {"name": column.name, "description": column.label, "meta": meta}


def selection_refs_for(layer: SemanticLayer, word: str) -> list[str]:
    """Elements whose label or synonyms look like an unknown word (for a question back)."""
    from difflib import get_close_matches

    from forja_core.semantic.text import normalize

    labels: dict[str, str] = {}
    for metric in layer.metrics:
        for text in (metric.label, *metric.synonyms):
            labels.setdefault(normalize(text), f"metric:{metric.name}")
    for dim in layer.dimensions:
        for attribute in dim.attributes:
            for text in (attribute.label, *attribute.synonyms):
                labels.setdefault(normalize(text), f"attribute:{dim.name}.{attribute.name}")
    found = get_close_matches(normalize(word), list(labels), n=6, cutoff=0.6)
    return list(dict.fromkeys(labels[f] for f in found))
