"""Business agent on the e-commerce shop: pre-selection, parser, validation, SQL,
verification preview, lifecycle and publication of a data mart."""

from __future__ import annotations

import re
from collections.abc import Iterator
from datetime import date
from pathlib import Path
from typing import Any

import duckdb
import pytest

from forja_api.state import AppState
from forja_core.agent.compile import compile_spec
from forja_core.agent.models import (
    ClarificationAnswer,
    MartRequest,
    MartStatus,
    MartValidation,
    OptionCount,
    TermCorrection,
)
from forja_core.agent.parser import parse
from forja_core.agent.preselect import preselect
from forja_core.agent.spec import FilterOperator, MartFilter, MartSpec, Period
from forja_core.agent.validate import validate_spec
from forja_core.agent.vocabulary import Vocabulary
from forja_core.auth.models import Principal, User
from forja_core.errors import ConflictError, ForbiddenError, PlanStateError, PlanValidationError
from forja_core.jobs.models import JobStatus
from forja_core.models import Project
from forja_core.semantic.models import SemanticLayer
from forja_core.semantic.service import visible
from forja_core.semantic.text import words
from forja_core.silver.tables import TableLayer
from forja_core.utils import utcnow
from forja_llm.agent import LLMMartInterpreter
from forja_llm.base import Completion, LLMProvider
from forja_llm.settings import LLMSettings
from tests.agent_eval.cases import CASES, TODAY
from tests.fixtures import ecommerce as ec
from tests.shop import build_gold_shop, shop_settings

ENGINEER = Principal(
    user=User(id="eng", email="eng@exemple.fr", is_admin=True, created_at=utcnow()),
    via="password",
)
ANALYST = Principal(
    user=User(id="ana", email="ana@exemple.fr", created_at=utcnow()), via="password"
)


@pytest.fixture(scope="module")
def shop(
    tmp_path_factory: pytest.TempPathFactory, ecommerce_dir: Path
) -> Iterator[tuple[AppState, Project]]:
    settings = shop_settings(tmp_path_factory.mktemp("agent"), agent_today=TODAY)
    state, project = build_gold_shop(settings, ecommerce_dir)
    yield state, project
    state.close()


@pytest.fixture
def layer(shop: tuple[AppState, Project]) -> SemanticLayer:
    state, project = shop
    return visible(state.semantic.current(project.id))


def _parse(state: AppState, layer: SemanticLayer, question: str) -> Any:
    values = state.marts._values(layer)
    vocabulary = Vocabulary.build(layer, values)
    return parse(
        question, layer, vocabulary, values=values, bindings={},
        today=date(2025, 1, 15), default_year=2024,
    )  # fmt: skip


def _ask(
    state: AppState, project: Project, question: str, who: Principal = ENGINEER
) -> MartRequest:
    request, job = state.marts.create(project.id, who, question)
    assert state.catalog.get_job(job.id).status is JobStatus.SUCCEEDED, state.catalog.job_logs(
        job.id
    )
    return state.catalog.get_mart_request(request.id)


# --- Pre-selection: small context, no value of the data -------------------------------


def test_context_is_small_and_holds_no_value(
    shop: tuple[AppState, Project], layer: SemanticLayer
) -> None:
    state, _ = shop
    values = state.marts._values(layer)
    vocabulary = Vocabulary.build(layer, values)
    data_values = {v for v in ec.all_values() if len(v) >= 4 and not v.isdigit()}
    for case in CASES:
        selection = preselect(layer, vocabulary.match(words(case.question)))
        text = selection.render(TODAY)
        assert selection.tokens(TODAY) < 1500, case.id
        leaked = sorted(v for v in data_values if v in text and v not in case.question)
        assert leaked == [], (case.id, leaked)


class _Recording(LLMProvider):
    name = "recording"

    def __init__(self, answer: str) -> None:
        super().__init__(LLMSettings(model="m", max_attempts=1, cache=False))
        self.answer = answer
        self.prompts: list[str] = []

    def _complete(
        self, *, system: str, prompt: str, response_schema: dict[str, Any], schema_name: str
    ) -> Completion:
        self.prompts.append(system + prompt)
        return Completion(self.answer, 1500, 60)


def test_llm_receives_the_request_and_the_layer_only(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    provider = _Recording(
        '{"kind": "mart", "mart": {"metrics": ["montant"], "filters": '
        '[{"field": "client.ville", "value": "lyon"}], "name": "ca_lyon"}}'
    )
    state.marts.interpreter = LLMMartInterpreter(provider)
    try:
        request = _ask(state, project, "Combien les gens de Lyon ont-ils dépensé chez nous ?")
    finally:
        state.marts.interpreter = None
    [prompt] = provider.prompts
    assert "Combien les gens de Lyon" in prompt
    cities = {row[4] for row in ec.clients_rows(1)} - {"Lyon"}
    assert not any(city in prompt for city in cities)  # distinct values are never sent
    assert "jean.dupont@exemple.fr" not in prompt and "CMD-0" not in prompt
    iteration = request.latest
    assert iteration is not None and iteration.path is not None
    assert iteration.path.value == "llm" and iteration.status == "previewed"
    # The value written by the model is resolved locally against the data.
    assert iteration.spec is not None and iteration.spec.filters[0].value == "Lyon"


# --- Parser -----------------------------------------------------------------------------


@pytest.mark.parametrize("case", [c for c in CASES if c.category == "simple"], ids=lambda c: c.id)
def test_simple_requests_need_no_llm(
    shop: tuple[AppState, Project], layer: SemanticLayer, case: Any
) -> None:
    state, _ = shop
    outcome = _parse(state, layer, case.question)
    assert outcome.confident and outcome.answer is not None and outcome.answer.kind == "mart"


def test_unknown_words_are_not_guessed(
    shop: tuple[AppState, Project], layer: SemanticLayer
) -> None:
    state, _ = shop
    outcome = _parse(state, layer, "marge brute par catégorie")
    assert not outcome.confident and "marge" in outcome.unknown


# --- Validation ---------------------------------------------------------------------


def test_validation_resolves_values_and_refuses_guesses(
    shop: tuple[AppState, Project], layer: SemanticLayer
) -> None:
    state, _ = shop
    lookup = state.marts._lookup(layer)
    typo = validate_spec(
        MartSpec(metrics=["montant"], filters=[MartFilter(field="client.ville", value="Lyonn")]),
        layer,
        lookup,
    )
    assert typo.spec is not None and typo.spec.filters[0].value == "Lyon"

    unknown = validate_spec(MartSpec(metrics=["marge"]), layer, lookup)
    assert unknown.spec is None and (unknown.clarification or unknown.refusal)

    personal = validate_spec(
        MartSpec(metrics=["montant"], filters=[MartFilter(field="client.email", value="x")]),
        layer,
        lookup,
    )
    assert personal.refusal is not None and "personnelle" in personal.refusal

    nowhere = validate_spec(
        MartSpec(metrics=["montant"], filters=[MartFilter(field="client.ville", value="Tokyo")]),
        layer,
        lookup,
    )
    assert nowhere.spec is None


# --- Compilation and preview -------------------------------------------------------------


def test_sql_never_averages(shop: tuple[AppState, Project], layer: SemanticLayer) -> None:
    state, _ = shop
    lookup = state.marts._lookup(layer)
    spec = MartSpec(
        metrics=["montant", "quantite", "prix_moyen", "panier_moyen", "nb_commandes"],
        axes=["produit.categorie"],
        time_grain="trimestre",  # type: ignore[arg-type]
    )
    validated = validate_spec(spec, layer, lookup)
    assert validated.spec is not None and validated.fact is not None
    compiled = compile_spec(validated.spec, layer, validated.fact)
    assert "avg(" not in compiled.sql.lower()
    assert "cast(sum(_m_montant) as double) / nullif(sum(_m_quantite), 0)" in compiled.sql
    assert "count(distinct _m_nb_commandes)" in compiled.sql
    assert "{{ ref('fct_ventes') }}" in compiled.dbt_sql

    warehouse = state.generator.warehouse_path(layer.project_id)
    with duckdb.connect(str(warehouse), read_only=True) as con:
        rows = con.execute(compiled.sql).fetchall()
        [(revenue, quantity)] = con.execute(
            "SELECT sum(montant), sum(quantite) FROM fct_ventes"
        ).fetchall()
    assert sum(r[2] for r in rows) == revenue
    # The weighted price of each group is the ratio of its sums, not a mean of prices.
    for row in rows:
        assert row[4] == pytest.approx(float(row[2]) / row[3], abs=0.01)
    assert quantity == sum(r[3] for r in rows)


def test_preview_controls(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    request = _ask(state, project, "Chiffre d'affaires et nombre de commandes par ville en 2024")
    iteration = request.latest
    assert iteration is not None and iteration.preview is not None
    preview = iteration.preview
    assert iteration.summary == "Chiffre d'affaires et nombre de commandes par ville, sur 2024."
    assert preview.row_count == len(preview.rows) > 0
    reconciled = {c.details["metric"]: c for c in preview.controls if c.code == "reconciliation"}
    assert reconciled["montant"].status == "ok"  # mart total = fact total on the scope
    assert reconciled["nb_commandes"].status == "info"  # a distinct count is not additive
    # Two orders of an unknown client: their lines are attached to the unknown member.
    unknown = [c for c in preview.controls if c.code == "unknown_member"]
    client = next(c for c in unknown if c.details["dimension"] == "client")
    orphan_lines = sum(1 for r in ec.lignes_rows() if r[0] in ec.ORPHAN_CLIENT_ORDERS)
    assert client.status == "warning" and client.details["rows"] == orphan_lines
    assert any(row["ville"] == "Inconnu" for row in preview.rows)
    assert any(c.code == "null_column" and c.status == "ok" for c in preview.controls)
    assert iteration.sql is not None and "group by" in iteration.sql

    empty = _ask(state, project, "Chiffre d'affaires par mois en 2030")
    assert empty.latest is not None and empty.latest.preview is not None
    warning = next(c for c in empty.latest.preview.controls if c.code == "empty_period")
    assert warning.status == "warning" and "2024" in warning.message


def test_preview_pseudonymizes_personal_data(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    request = _ask(state, project, "Chiffre d'affaires par email", who=ANALYST)
    iteration = request.latest
    assert iteration is not None and iteration.preview is not None
    emails = [row["email"] for row in iteration.preview.rows if row["email"]]
    assert emails and all(re.fullmatch(r"[0-9a-f]{64}", e) for e in emails)
    assert iteration.preview.pseudonymized == ["email"]


# --- Lifecycle: clarification, refinement, validation, publication -----------------------


def test_clarification_refinement_and_publication(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    request = _ask(state, project, "Évolution des ventes en 2024", who=ANALYST)
    first = request.latest
    assert first is not None and first.status == "clarification" and first.clarification
    assert request.status is MartStatus.DRAFTED
    option = next(i for i, o in enumerate(first.clarification.options) if o.ref == "metric:montant")
    with pytest.raises(PlanStateError):
        state.marts.validate(request.id, ANALYST)

    state.marts.answer(request.id, ANALYST, ClarificationAnswer(option=option))
    answered = state.catalog.get_mart_request(request.id)
    second = answered.latest
    assert second is not None and second.version == 2 and second.status == "previewed"
    assert second.spec is not None and second.spec.metrics == ["montant"]
    assert second.spec.time_grain is not None and second.spec.time_grain.value == "mois"
    assert answered.bindings == {"vente": "metric:montant"}

    state.marts.refine(request.id, ANALYST, "seulement le T1")
    refined = state.catalog.get_mart_request(request.id)
    third = refined.latest
    assert third is not None and third.version == 3 and third.kind == "refinement"
    assert third.spec is not None
    assert third.spec.period == Period(
        start=date(2024, 1, 1), end=date(2024, 3, 31), label="T1 2024"
    )
    state.marts.refine(request.id, ANALYST, "ajoute le nombre de commandes")
    fourth = state.catalog.get_mart_request(request.id).latest
    assert fourth is not None and fourth.spec is not None
    assert fourth.spec.metrics == ["montant", "nb_commandes"]

    _, publish_job = state.marts.validate(request.id, ANALYST)
    assert publish_job is not None
    published = state.catalog.get_mart_request(request.id)
    assert state.catalog.get_job(publish_job.id).status is JobStatus.SUCCEEDED, (
        state.catalog.job_logs(publish_job.id)
    )
    assert published.status is MartStatus.PUBLISHED
    name = published.published_name
    assert name is not None and name.startswith("mart_montant_par_mois")
    table = state.catalog.get_table(published.published_table_id or "")
    assert table.layer is TableLayer.MART and table.owner_id == ANALYST.id and table.publish
    assert table.row_count == 3  # January to March

    dbt_model = state.generator.project_dir(project.id) / "models" / "marts" / f"{name}.sql"
    assert dbt_model.exists() and "ref('fct_ventes')" in dbt_model.read_text(encoding="utf-8")
    exports = {Path(e.path).suffix for e in published.exports}
    assert exports == {".parquet", ".csv"}
    serving = state.publisher.serving_path(project)
    with duckdb.connect(str(serving), read_only=True) as con:
        [(rows,)] = con.execute(f'SELECT count(*) FROM "{name}"').fetchall()
    assert rows == 3
    # A later build keeps the mart model in the regenerated dbt project.
    assert name in {m.name for m in state.marts.mart_models(project.id)}


def test_refinement_without_llm_does_not_guess(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    request = _ask(state, project, "CA par catégorie", who=ANALYST)
    state.marts.refine(request.id, ANALYST, "ajoute la marge")
    latest = state.catalog.get_mart_request(request.id).latest
    assert latest is not None and latest.status in ("clarification", "refused")
    assert latest.spec is None


def test_approval_required(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    state.settings.mart_require_approval = True
    try:
        request = _ask(state, project, "Quantité vendue par catégorie", who=ANALYST)
        validated, job = state.marts.validate(request.id, ANALYST)
        assert job is None and validated.status is MartStatus.VALIDATED
        approved, publish = state.marts.approve(request.id, ENGINEER)
        assert approved.approved_by == ENGINEER.id
        assert state.catalog.get_job(publish.id).status is JobStatus.SUCCEEDED
        assert state.catalog.get_mart_request(request.id).status is MartStatus.PUBLISHED
        rejected = _ask(state, project, "Panier moyen par segment", who=ANALYST)
        assert state.marts.reject(rejected.id, ENGINEER, "doublon").status is MartStatus.REJECTED
    finally:
        state.settings.mart_require_approval = False


def test_out_of_scope_without_llm(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    request = _ask(state, project, "Quel est le salaire moyen des employés ?")
    latest = request.latest
    assert latest is not None and latest.status == "refused" and latest.path is not None
    assert latest.path.value == "parser"


def test_filters_on_totals(shop: tuple[AppState, Project], layer: SemanticLayer) -> None:
    state, _ = shop
    validated = validate_spec(
        MartSpec(
            metrics=["montant"],
            axes=["client.ville"],
            filters=[MartFilter(field="montant", operator=FilterOperator.GT, value=100)],
        ),
        layer,
        state.marts._lookup(layer),
    )
    assert validated.spec is not None and validated.fact is not None
    compiled = compile_spec(validated.spec, layer, validated.fact)
    assert "having sum(_m_montant) > 100" in compiled.sql


def test_filters_found_locally_survive_the_model(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    # The model forgets the city; the parser matched « Lyon » in the data.
    provider = _Recording('{"kind": "mart", "mart": {"metrics": ["montant"], "name": "ca"}}')
    state.marts.interpreter = LLMMartInterpreter(provider)
    try:
        request = _ask(state, project, "Chiffre d'affaires des clients de Lyon chez nous")
    finally:
        state.marts.interpreter = None
    iteration = request.latest
    assert iteration is not None and iteration.path is not None
    assert iteration.path.value == "llm" and iteration.spec is not None
    assert [(f.field, f.value) for f in iteration.spec.filters] == [("client.ville", "Lyon")]
    assert "filter on client.ville" in provider.prompts[0]


def test_an_axis_the_filter_pins_is_removed_and_said(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    # The model groups by city and keeps only Lyon: a constant column.
    provider = _Recording(
        '{"kind": "mart", "mart": {"metrics": ["montant"], "axes": ["client.ville", '
        '"client.segment"], "filters": [{"field": "client.ville", "value": "lyon"}], '
        '"name": "ca_lyon"}}'
    )
    state.marts.interpreter = LLMMartInterpreter(provider)
    try:
        request = _ask(state, project, "Combien les gens de Lyon ont-ils dépensé, par segment ?")
    finally:
        state.marts.interpreter = None
    iteration = request.latest
    assert iteration is not None and iteration.status == "previewed"
    assert iteration.spec is not None and iteration.spec.axes == ["client.segment"]
    assert [(f.field, f.value) for f in iteration.spec.filters] == [("client.ville", "Lyon")]
    assert iteration.summary is not None
    assert iteration.summary.endswith("le filtre ne garde que Lyon.")
    assert "par ville" not in iteration.summary
    assert "".join(p.text for p in iteration.summary_parts) == iteration.summary


def test_an_axis_filtered_on_several_values_stays(
    shop: tuple[AppState, Project], layer: SemanticLayer
) -> None:
    state, _ = shop
    spec = MartSpec(
        metrics=["montant"],
        axes=["client.ville"],
        filters=[
            MartFilter(field="client.ville", operator=FilterOperator.IN, value=["Lyon", "Paris"])
        ],
    )
    validation = validate_spec(spec, layer, state.marts._lookup(layer))
    assert validation.spec is not None and validation.spec.axes == ["client.ville"]
    assert validation.notes == []


# --- Verification preview: terms, counts, suggestions, destination --------------------


def test_summary_terms_can_be_corrected(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    request = _ask(state, project, "Chiffre d'affaires par mois en 2024", who=ANALYST)
    first = request.latest
    assert first is not None and first.status == "previewed" and first.spec is not None
    assert "".join(p.text for p in first.summary_parts) == first.summary
    terms = {p.term.kind: (i, p.term) for i, p in enumerate(first.summary_parts) if p.term}
    assert {"metric", "grain", "period"} <= set(terms)
    for _, term in terms.values():
        assert term.current == 0 and len(term.options) >= 2 and term.question

    index, grain = terms["grain"]
    option = grain.options.index("par trimestre")
    state.marts.correct(
        request.id, ANALYST, TermCorrection(version=first.version, term=index, option=option)
    )
    corrected = state.catalog.get_mart_request(request.id).latest
    assert corrected is not None and corrected.kind == "correction"
    assert corrected.status == "previewed" and corrected.path is not None
    assert corrected.path.value == "parser" and corrected.spec is not None
    assert corrected.spec.time_grain is not None and corrected.spec.time_grain.value == "trimestre"
    assert corrected.spec.metrics == first.spec.metrics
    assert corrected.instruction == "par mois → par trimestre"

    index, metric = next(
        (i, p.term)
        for i, p in enumerate(corrected.summary_parts)
        if p.term and p.term.kind == "metric"
    )
    state.marts.correct(
        request.id,
        ANALYST,
        TermCorrection(
            version=corrected.version,
            term=index,
            option=metric.options.index("Nombre de commandes"),
        ),
    )
    latest = state.catalog.get_mart_request(request.id).latest
    assert latest is not None and latest.spec is not None
    assert latest.spec.metrics == ["nb_commandes"]
    # Only the latest preview can be corrected.
    with pytest.raises(ConflictError):
        state.marts.correct(
            request.id, ANALYST, TermCorrection(version=first.version, term=index, option=1)
        )
    with pytest.raises(PlanValidationError):
        state.marts.correct(
            request.id, ANALYST, TermCorrection(version=latest.version, term=0, option=40)
        )


def test_clarification_options_say_what_they_cover(
    shop: tuple[AppState, Project], layer: SemanticLayer
) -> None:
    state, project = shop
    request = _ask(state, project, "Évolution des ventes en 2024", who=ANALYST)
    asked = request.latest
    assert asked is not None and asked.clarification is not None
    assert len(asked.option_counts) == len(asked.clarification.options)
    by_ref = dict(
        zip((o.ref for o in asked.clarification.options), asked.option_counts, strict=True)
    )
    revenue = by_ref["metric:montant"]
    assert revenue is not None and revenue.format == "currency" and revenue.value > 0

    found = layer.attribute("produit.categorie")
    assert found is not None
    counts = [
        state.semantic.count_members(layer, *found, value)
        for value in state.semantic.distinct_values(layer, *found)
    ]
    assert counts and all(c >= 1 for c in counts)
    assert state.marts._option_count(layer, "attribute:produit.categorie") == OptionCount(
        value=len(counts), unit="catégories"
    )


def test_overview_suggests_questions_the_parser_answers(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    overview = state.marts.overview(project.id)
    assert overview.data_updated_at is not None and overview.gold_run_id
    assert 2 <= len(overview.suggestions) <= 4
    assert len(set(overview.suggestions)) == len(overview.suggestions)
    request = _ask(state, project, overview.suggestions[0], who=ANALYST)
    latest = request.latest
    assert latest is not None and latest.status == "previewed" and latest.path is not None
    assert latest.path.value == "parser"


def test_destination_and_engineer_self_approval(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    state.settings.mart_require_approval = True
    try:
        own = _ask(state, project, "Quantité vendue par mois", who=ENGINEER)
        validated, job = state.marts.validate(own.id, ENGINEER, MartValidation(destination="csv"))
        assert job is not None and validated.destination == "csv"
        assert validated.approved_by == ENGINEER.id
        assert state.catalog.get_job(job.id).status is JobStatus.SUCCEEDED
        assert state.catalog.get_mart_request(own.id).status is MartStatus.PUBLISHED

        asked = _ask(state, project, "Nombre de commandes par mois", who=ANALYST)
        waiting, none = state.marts.validate(
            asked.id, ANALYST, MartValidation(destination="powerbi")
        )
        assert none is None and waiting.approved_at is None
        assert waiting.status is MartStatus.VALIDATED and waiting.destination == "powerbi"
    finally:
        state.settings.mart_require_approval = False


def test_self_approval_follows_the_mode(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    assert state.settings.auth_mode == "local" and state.settings.mart_self_approval
    other = Principal(
        user=User(id="eng2", email="eng2@exemple.fr", is_admin=True, created_at=utcnow()),
        via="password",
    )
    state.settings.mart_require_approval = True
    state.settings.mart_allow_self_approval = False
    try:
        own = _ask(state, project, "Quantité vendue par segment", who=ENGINEER)
        waiting, job = state.marts.validate(own.id, ENGINEER)
        assert job is None and waiting.approved_at is None
        with pytest.raises(ForbiddenError):
            state.marts.approve(own.id, ENGINEER)
        approved, publish = state.marts.approve(own.id, other)
        assert approved.approved_by == "eng2" and approved.approved_by_email == "eng2@exemple.fr"
        assert approved.approved_at is not None and approved.validated_at is not None
        assert approved.approved_at > approved.validated_at
        assert state.catalog.get_job(publish.id).status is JobStatus.SUCCEEDED
    finally:
        state.settings.mart_require_approval = False
        state.settings.mart_allow_self_approval = None
    assert state.settings.model_copy(update={"auth_mode": "multi"}).mart_self_approval is False
