"""Manual test case 1, made reproducible: a single denormalized yearly attendance file.

The synthetic file of ``tests.fixtures.attendance`` has the shape of the open-data
export the case was run on (an entity per year, an integer year, a sparse secondary
date, « Inconnu » placeholders, the entity's attributes repeated on every row). Each
test guards one point of the manual tests journal (docs/manual-tests.md, MT-3 to
MT-19); nothing here knows about museums: the rules are generic.
"""

from __future__ import annotations

from collections.abc import Iterator

import duckdb
import pytest

from forja_api.state import AppState
from forja_core.agent.insight import NARROW_SPACE, format_number
from forja_core.agent.models import ClarificationAnswer, MartRequest, MartStatus
from forja_core.auth.models import Principal, User
from forja_core.gold.plan import GoldPlanPatch
from forja_core.jobs.models import JobStatus, JobType, RunRequest
from forja_core.models import Project, ProjectCreate
from forja_core.semantic.models import MetricFormat, TimeGrain
from forja_core.semantic.service import visible
from forja_core.silver.plan import RuleKind, SilverType
from forja_core.silver.review import ReviewRuleKind, review_rules
from forja_core.utils import utcnow
from tests.fixtures import attendance
from tests.shop import shop_settings

OWNER = Principal(
    user=User(id="eng", email="eng@exemple.fr", is_admin=True, created_at=utcnow()),
    via="password",
)


def _run(state: AppState, project: Project, job_type: JobType) -> None:
    job = state.executor.create(project.id, RunRequest(type=job_type))
    state.runner.submit(job.id)
    assert state.catalog.get_job(job.id).status is JobStatus.SUCCEEDED, state.catalog.job_logs(
        job.id
    )


@pytest.fixture(scope="module")
def case(tmp_path_factory: pytest.TempPathFactory) -> Iterator[tuple[AppState, Project, str]]:
    """The file ingested and cleaned, the heuristic star schema built (no LLM)."""
    root = tmp_path_factory.mktemp("manual_case_1")
    state = AppState.build(shop_settings(root, agent_today="2025-01-15"))
    project = state.catalog.create_project(ProjectCreate(name="Cas 1 bis"))
    path = attendance.write(root / "in")
    [source] = state.ingestion.ingest_file(project.id, path, attendance.FILE)
    _run(state, project, JobType.BUILD_SILVER)
    state.gold.propose(project.id, use_llm=False)
    state.gold.approve(project.id)
    _run(state, project, JobType.BUILD_GOLD)
    yield state, project, source.id
    state.close()
    path.unlink()


def _ask(state: AppState, project: Project, question: str) -> MartRequest:
    request, job = state.marts.create(project.id, OWNER, question)
    assert state.catalog.get_job(job.id).status is JobStatus.SUCCEEDED
    return state.catalog.get_mart_request(request.id)


def _wait(state: AppState, request: MartRequest) -> MartRequest:
    latest = state.catalog.get_mart_request(request.id)
    assert latest.latest is not None and latest.latest.status != "processing"
    return latest


# --- Silver ---------------------------------------------------------------------------


def test_mt12_placeholders_are_treated_as_empty(case: tuple[AppState, Project, str]) -> None:
    state, _, source_id = case
    plan = state.catalog.get_plan(source_id)
    closure = plan.column("anneefermeture")
    school = plan.column("scolaires")
    assert closure is not None and school is not None
    # « Inconnu » and « NC » no longer turn numeric columns into text.
    assert closure.target_type is SilverType.BIGINT and "inconnu" in closure.cast.null_values
    assert school.target_type is SilverType.BIGINT and "nc" in school.cast.null_values
    rules = {r.id: r for r in review_rules(plan)}
    assert rules["sentinel:anneefermeture"].kind is ReviewRuleKind.SENTINEL
    assert "« inconnu »" in rules["sentinel:anneefermeture"].title


def test_mt13_unconvertible_values_quarantine_keys_only(
    case: tuple[AppState, Project, str],
) -> None:
    state, project, source_id = case
    plan = state.catalog.get_plan(source_id)
    individual = plan.column("individuel")
    year = plan.column("annee")
    assert individual is not None and year is not None
    assert individual.rule(RuleKind.CASTABLE).enabled is False  # type: ignore[union-attr]
    assert year.rule(RuleKind.CASTABLE).enabled is True  # type: ignore[union-attr]
    assert "mises à vide" in individual.rules[0].explanation
    with duckdb.connect(str(state.generator.warehouse_path(project.id)), read_only=True) as con:
        [(rejected,)] = con.execute(f"select count(*) from {plan.model_name}__rejects").fetchall()
        [(kept,)] = con.execute(
            f"select count(*) from {plan.model_name} where individuel is null"
        ).fetchall()
    assert rejected == 0  # « n.d. » in a non-key column: the row stays
    assert kept >= 1


def test_mt8_grain_is_entity_by_year(case: tuple[AppState, Project, str]) -> None:
    state, project, source_id = case
    plan = state.catalog.get_plan(source_id)
    assert plan.primary_key is not None
    assert plan.primary_key.columns == ["IDMuseofile", "annee"]  # not two measures
    report = state.catalog.latest_profiles(project.id)[source_id]
    identifiability = next(c for c in report.quality.components if c.name == "identifiability")
    assert identifiability.score == 1.0 and "entity x period" in identifiability.details


# --- Gold -----------------------------------------------------------------------------


def test_mt7_entity_dimension_extracted(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    plan = state.catalog.get_gold_plan(project.id)
    [dimension] = plan.dimensions
    assert dimension.name == "dim_musee" and dimension.extracted
    assert dimension.natural_key == ["idmuseofile"] and dimension.latest_by == "annee"
    attributes = {a.column for a in dimension.attributes}
    assert {"nom_du_musee", "ville", "departement", "region", "ferme"} <= attributes
    [fact] = plan.facts
    # The fact keeps the keys and the measures, not the entity's attributes.
    assert fact.degenerate_dimensions == []
    assert [fk.column for fk in fact.foreign_keys] == ["idmuseofile"]
    assert {m.name for m in fact.measures} >= {"payant", "gratuit", "total"}
    assert "Hiérarchie géographique : ville > departement > region" in dimension.explanation
    with duckdb.connect(str(state.generator.warehouse_path(project.id)), read_only=True) as con:
        [(members,)] = con.execute("select count(*) from dim_musee").fetchall()
    assert members == attendance.entity_count() + 1  # one per museum, plus the unknown
    layer = state.semantic.current(project.id)
    museum = layer.dimension("musee")
    assert museum is not None and museum.label == "Musée"
    assert [h.levels for h in museum.hierarchies] == [["region", "departement", "ville"]]


def test_mt3_year_column_is_the_main_date(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    [fact] = state.catalog.get_gold_plan(project.id).facts
    keys = {k.column: k for k in fact.date_keys}
    assert keys["annee"].grain == "year" and fact.primary_date == "annee_key"
    assert keys["dateappellation"].grain == "day" and keys["dateappellation"].role == "appellation"
    layer = state.semantic.current(project.id)
    assert layer.default_time_dimension == "annee"
    main = layer.dimension("annee")
    other = layer.dimension("dateappellation")
    assert main is not None and other is not None
    assert (main.label, main.time_level, main.primary) == (
        "Année de fréquentation",
        TimeGrain.YEAR,
        True,
    )
    assert other.label == "Date d'appellation" and not other.primary
    with duckdb.connect(str(state.generator.warehouse_path(project.id)), read_only=True) as con:
        [(years,)] = con.execute(
            "select count(distinct d.annee) from fct_frequentation f "
            "join dim_date d on d.date_key = f.annee_key"
        ).fetchall()
    assert years == attendance.LAST_YEAR - attendance.FIRST_YEAR + 1


def test_mt9_business_names_and_editable(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    plan = state.catalog.get_gold_plan(project.id)
    assert [f.name for f in plan.facts] == ["fct_frequentation"]
    renamed = plan.model().facts[0].model_copy(update={"name": "fct_visites"})
    draft = state.gold.patch(project.id, GoldPlanPatch(facts=[renamed]))
    assert draft.facts[0].name == "fct_visites" and not draft.errors
    # Back to the applied plan for the other tests: a draft is only a proposal.
    assert state.catalog.effective_gold_plan(project.id).facts[0].name == "fct_frequentation"  # type: ignore[union-attr]


# --- Semantic layer -------------------------------------------------------------------


def test_mt6_counts_are_not_money(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    layer = state.semantic.current(project.id)
    for name in ("total", "payant", "gratuit", "scolaires"):
        metric = layer.metric(name)
        assert metric is not None and metric.format is MetricFormat.INTEGER, name
        assert metric.unit == "entrées", name
    assert (
        format_number(1234567, "integer", "entrées")
        == f"1{NARROW_SPACE}234{NARROW_SPACE}567 entrées"
    )


def test_mt10_readable_labels(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    layer = state.semantic.current(project.id)
    museum = layer.dimension("musee")
    assert museum is not None
    labels = {a.name: a.label for a in museum.attributes}
    assert labels["region"] == "Région" and labels["nom_du_musee"] == "Nom du musée"
    assert labels["dateappellation"] == "Date d'appellation"
    assert layer.metric("nb_lignes").label == "Nombre de lignes"  # type: ignore[union-attr]
    request = _ask(state, project, "Fréquentation par région en 2023")
    preview = request.latest.preview  # type: ignore[union-attr]
    assert preview is not None
    assert [c.label for c in preview.columns] == ["Région", "Fréquentation"]
    assert all("(" not in c.label for c in preview.columns)


def test_mt11_count_synonyms(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    total = state.semantic.current(project.id).metric("total")
    assert total is not None and total.label == "Fréquentation" and total.default
    assert {"fréquentation", "entrées", "visiteurs", "total des entrées"} <= set(total.synonyms)


# --- Agent ----------------------------------------------------------------------------


def test_mt14_simple_question_without_language_model(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    assert state.marts.interpreter is None
    for question in (
        "Fréquentation totale par région en 2023",
        "Total des entrées par région en 2023",
    ):
        request = _ask(state, project, question)
        latest = request.latest
        assert latest is not None and latest.status == "previewed", (question, latest)
        assert latest.path is not None and latest.path.value == "parser"
        spec = latest.spec
        assert spec is not None
        assert spec.metrics == ["total"] and spec.axes == ["musee.region"]
        # A year said alone is a filter on the main date, not an axis.
        assert spec.time_grain is None and spec.time_dimension == "annee"
        assert spec.period is not None and spec.period.label == "2023"


def test_mt4_period_reads_the_main_date_and_says_it(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    request = _ask(state, project, "Fréquentation par région en 2023")
    latest = request.latest
    assert latest is not None and latest.spec is not None
    assert latest.spec.time_dimension == "annee"
    assert latest.summary == "Fréquentation par région, en 2023 (année de fréquentation)."
    # The totals match the file: the filter is on the year column.
    preview = latest.preview
    assert preview is not None
    expected = attendance.total_by_region(2023)
    assert {r["region"]: r["total"] for r in preview.rows} == expected


def test_mt4_several_plausible_dates_ask_back(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    # 2005: no attendance that year, but labels were granted: which date is meant?
    request = _ask(state, project, "Fréquentation par département en 2005")
    latest = request.latest
    assert latest is not None and latest.status == "clarification"
    assert latest.clarification is not None
    options = [(o.label, o.ref) for o in latest.clarification.options]
    assert options == [
        ("Année de fréquentation", "time:annee"),
        ("Date d'appellation", "time:dateappellation"),
    ]
    assert latest.clarification.options[1].detail == "colonne dateappellation"


def test_mt5_sparse_date_filter_is_flagged(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    asked = _ask(state, project, "Fréquentation par département en 2005")
    state.marts.answer(asked.id, OWNER, ClarificationAnswer(option=1))
    request = _wait(state, asked)
    latest = request.latest
    assert latest is not None and latest.status == "previewed", latest
    assert latest.spec is not None and latest.spec.time_dimension == "dateappellation"
    coherence = [c for c in latest.preview.controls if c.code == "time_coherence"]  # type: ignore[union-attr]
    warnings = [c for c in coherence if c.status == "warning"]
    assert warnings, coherence
    assert "remplie sur" in warnings[0].message and "Date d'appellation" in warnings[0].message
    # The main date on a year with data: nothing to flag.
    good = _ask(state, project, "Fréquentation par région en 2023").latest
    checks = [c for c in good.preview.controls if c.code == "time_coherence"]  # type: ignore[union-attr]
    assert [c.status for c in checks] == ["ok"]


def test_mt15_about_the_data_and_out_of_scope(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    about = _ask(state, project, "Ce cas parle de quoi ?").latest
    assert about is not None and about.status == "answered" and about.answer
    assert attendance.FILE in about.answer and "Fréquentation (en entrées)" in about.answer
    assert "Année de fréquentation de 2013 à 2023" in about.answer

    weather = _ask(state, project, "La météo à Paris demain").latest
    assert weather is not None and weather.status == "refused"
    assert "sort du périmètre des données" in (weather.refusal or "")

    mixed = _ask(state, project, "Fréquentation par région en 2023 et la météo à Paris").latest
    assert mixed is not None and mixed.status == "previewed"
    assert "Je laisse de côté « la météo à Paris »" in (mixed.summary or "")


def test_mt15_off_topic_never_refines_nor_blocks(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    request = _ask(state, project, "Fréquentation par région en 2023")
    version = request.latest.version  # type: ignore[union-attr]
    state.marts.refine(request.id, OWNER, "quel temps fera-t-il à Lyon ?")
    after = _wait(state, request)
    assert after.latest is not None and after.latest.status == "refused"
    assert after.status is MartStatus.PREVIEWED
    assert after.current_spec == request.latest.spec  # type: ignore[union-attr]
    validated, _ = state.marts.validate(request.id, OWNER)
    assert validated.status in (MartStatus.VALIDATED, MartStatus.PUBLISHED)
    assert validated.previewed is not None and validated.previewed.version == version


def test_mt16_pending_question_keeps_last_version_valid(
    case: tuple[AppState, Project, str],
) -> None:
    state, project, _ = case
    request = _ask(state, project, "Fréquentation par région en 2023")
    state.marts.refine(request.id, OWNER, "ajoute la fréquence")
    pending = _wait(state, request)
    assert pending.latest is not None and pending.latest.status == "clarification"
    assert pending.status is MartStatus.PREVIEWED  # the previous version stays ready
    validated, _ = state.marts.validate(request.id, OWNER)
    assert validated.status in (MartStatus.VALIDATED, MartStatus.PUBLISHED)


def test_mt17_options_read_well_with_business_units(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    latest = _ask(state, project, "Fréquentation par département en 2005").latest
    assert latest is not None and latest.clarification is not None
    for option in latest.clarification.options:
        assert "(" not in option.label and "entree" not in option.label.lower()
    layer = visible(state.semantic.current(project.id))
    count = state.marts._option_count(layer, "metric:total")
    assert count is not None and count.unit == "entrées" and count.format == "integer"


def test_mt18_answer_sentence_and_visual(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    expected = attendance.total_by_region(2023)
    total = sum(expected.values())
    top, top_value = max(expected.items(), key=lambda item: item[1])

    bars = _ask(state, project, "Fréquentation par région en 2023").latest.preview.insight  # type: ignore[union-attr]
    assert bars is not None and bars.visual == "bars"
    assert bars.points[0].label == top
    assert bars.total == total
    sentence = bars.sentence
    assert sentence.startswith("Fréquentation en 2023 : ")
    assert format_number(total, "integer", "entrées") in sentence
    assert f"{top} arrive en tête avec {format_number(top_value, 'integer', 'entrées')}" in sentence
    assert "€" not in sentence

    kpi = _ask(state, project, "Fréquentation en 2023").latest.preview.insight  # type: ignore[union-attr]
    assert kpi is not None and kpi.visual == "kpi" and kpi.total == total

    line = _ask(state, project, "Fréquentation par année").latest.preview.insight  # type: ignore[union-attr]
    assert line is not None and line.visual == "line"
    assert [p.label for p in line.points][:2] == ["2013", "2014"]
    assert "de " in line.sentence and "soit" in line.sentence

    table = _ask(state, project, "Fréquentation par musée").latest.preview.insight  # type: ignore[union-attr]
    assert table is not None and table.visual == "table"  # more than 15 members


def test_mt19_full_run_stops_cleanly_without_a_star_schema(
    tmp_path_factory: pytest.TempPathFactory,
) -> None:
    root = tmp_path_factory.mktemp("manual_case_1_run")
    state = AppState.build(shop_settings(root))
    try:
        project = state.catalog.create_project(ProjectCreate(name="Sans modèle"))
        path = attendance.write(root / "in")
        state.ingestion.ingest_file(project.id, path, attendance.FILE)
        job = state.executor.create(project.id, RunRequest(type=JobType.BUILD_ALL))
        state.runner.submit(job.id)
        done = state.catalog.get_job(job.id)
        assert done.status is JobStatus.SUCCEEDED, done.error
        assert done.result is not None and done.result["stopped_after"] == "silver"
        assert done.result["next_action"] == "propose_gold_plan"
        assert done.result["message"].startswith("Nettoyage terminé.")
    finally:
        state.close()
