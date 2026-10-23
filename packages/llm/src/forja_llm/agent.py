"""Interpretation of a business request by a language model.

The model receives the request and the pre-selected part of the semantic layer
(business names, synonyms, units), never a value of the data, and answers with an
:class:`AgentAnswer`: a MartSpec, a question back to the user, or a refusal. Forja
then validates the spec and compiles the SQL itself.
"""

from __future__ import annotations

from forja_core.agent.interpreter import InterpretationError, InterpretRequest
from forja_core.agent.preselect import ContextItem
from forja_core.agent.spec import AgentAnswer
from forja_core.jobs.scope import JobCancelledError
from forja_llm.base import LLMCancelledError, LLMError, LLMProvider, LLMRequest
from forja_llm.context import SemanticContext, SemanticField

AGENT_TASK = """\
Translate the user's request (in French) into an AgentAnswer JSON document, using
only the semantic layer below.
- kind "mart" when the request can be answered: mart.metrics are metric refs;
  mart.axes are attribute refs (dimension.attribute) the result is broken down by;
  mart.time_grain (jour, semaine, mois, trimestre, annee) for "par mois", "évolution";
  mart.period start/end as ISO dates, both included, when a period is named;
  mart.filters: field (attribute ref, or a metric ref for a condition on a total),
  operator (eq, neq, in, not_in, gt, gte, lt, lte, contains), value as written by
  the user (Forja matches it to the data); order_by and limit for "top N";
  mart.name: short snake_case.
- kind "clarification" when a word of the request fits several elements, or none
  clearly: question in French, term (the word), 2 to 4 options with a French label
  and ref "metric:<name>" or "attribute:<dimension.attribute>".
- kind "refusal" when the request is about something this layer does not hold:
  refusal_reason in French.
Never invent a ref, never guess between two meanings, never write SQL.
"""


class LLMMartInterpreter:
    def __init__(self, provider: LLMProvider) -> None:
        self.provider = provider
        self.origin = f"llm:{provider.name}/{provider.model}"

    @staticmethod
    def context(request: InterpretRequest) -> SemanticContext:
        selection = request.selection

        def field(item: ContextItem) -> SemanticField:
            return SemanticField(
                ref=item.ref,
                label=item.label,
                synonyms=list(item.synonyms),
                data_type=item.data_type,
                unit=item.unit,
            )

        return SemanticContext(
            project_name=request.project_name,
            metrics=[field(m) for m in selection.metrics],
            attributes=[field(a) for a in selection.attributes],
            time_dimensions=[field(t) for t in selection.time_dimensions],
            time_grains=selection.time_grains,
            today=request.today,
        )

    @staticmethod
    def task(request: InterpretRequest) -> str:
        task = AGENT_TASK + f"\nRequest: {request.instruction}\n"
        if request.base is not None:
            task += (
                "This request modifies the current mart (keep what it does not change):\n"
                f"{request.base.model_dump_json(exclude_defaults=True)}\n"
            )
        if request.bindings:
            answers = "; ".join(f"« {term} » = {ref}" for term, ref in request.bindings.items())
            task += f"The user already answered: {answers}\n"
        return task

    def interpret(self, request: InterpretRequest) -> AgentAnswer:
        try:
            return self.provider.generate(
                LLMRequest(
                    task=self.task(request),
                    context=self.context(request),
                    purpose="mart_request",
                    project_id=request.project_id,
                ),
                AgentAnswer,
            )
        except LLMCancelledError as exc:
            raise JobCancelledError("the request was cancelled") from exc
        except LLMError as exc:
            raise InterpretationError(f"{type(exc).__name__}: {exc}") from exc
