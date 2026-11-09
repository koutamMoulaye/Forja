"""Manual test case 1 bis, second batch of fixes (docs/manual-tests.md, MT-20 to MT-43).

The synthetic yearly attendance file of ``tests.fixtures.attendance`` now also holds a
museum with a generic name (« Musée de l'affiche »), two keys in conflict in 2021 (one
copy that only differs by blanks, one that disagrees) and a few rows of 2014 whose total
is not payant + gratuit. Nothing here knows about museums: the rules are generic, and
the e-commerce demo is checked by tests/test_agent.py and the evaluation set.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date

import duckdb
import pytest

from forja_api.state import AppState
from forja_core.agent.intents import plain_refusal
from forja_core.agent.models import ClarificationAnswer, MartRequest, MartStatus
from forja_core.agent.vocabulary import Vocabulary
from forja_core.auth.models import Principal, User
from forja_core.errors import PlanStateError
from forja_core.jobs.models import JobStatus, JobType, RunRequest
from forja_core.models import Project, ProjectCreate
from forja_core.semantic import labels
from forja_core.semantic.models import MetricAggregation
from forja_core.semantic.service import visible
from forja_core.semantic.text import words
from forja_core.silver.explain import DUPLICATE_KEY_REASON, LESS_COMPLETE_REASON
from forja_core.silver.plan import KeyResolution, PlanPatch
from forja_core.silver.review import review_rules
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
    root = tmp_path_factory.mktemp("manual_case_1_batch_2")
    state = AppState.build(shop_settings(root, agent_today="2025-01-15"))
    project = state.catalog.create_project(ProjectCreate(name="Cas 1 bis, lot 2"))
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


def _follow(state: AppState, request: MartRequest, text: str) -> MartRequest:
    state.marts.refine(request.id, OWNER, text)
    return state.catalog.get_mart_request(request.id)


# --- P0: understanding the question ----------------------------------------------------


def test_mt20_a_generic_word_is_never_a_value(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    latest = _ask(state, project, "Top 10 des musées les plus visités en 2023").latest
    assert latest is not None and latest.spec is not None
    spec = latest.spec
    # « musées » is the axis, never the value « Musée de l'affiche ».
    assert spec.filters == [] and spec.axes == ["musee.nom_du_musee"]
    assert spec.limit == 10 and spec.order_by[0].direction == "desc"
    assert latest.preview is not None and latest.preview.row_count == 10
    # A value is kept on a strong match only: the whole value, or quoted text.
    whole = _ask(state, project, f"Fréquentation du {attendance.GENERIC_NAME} en 2023").latest
    assert whole is not None and whole.spec is not None
    assert [(f.field, f.value) for f in whole.spec.filters] == [
        ("musee.nom_du_musee", attendance.GENERIC_NAME)
    ]
    quoted = _ask(state, project, "Fréquentation par année du musée « affiche »").latest
    assert quoted is not None and quoted.spec is not None
    assert [f.value for f in quoted.spec.filters] == [attendance.GENERIC_NAME]


def test_mt20_element_of_the_model_before_a_value() -> None:
    from forja_core.semantic.models import (
        Attribute,
        Metric,
        SemanticDimension,
        SemanticLayer,
    )

    layer = SemanticLayer(
        id="l",
        project_id="p",
        version=1,
        gold_plan_version=1,
        created_at=utcnow(),
        metrics=[
            Metric(name="n", label="Visites", fact="f", formula="sum(n)", additivity="additive")
        ],
        dimensions=[
            SemanticDimension(
                name="musee",
                label="Musée",
                kind="standard",
                fact="f",
                table="dim_musee",
                attributes=[Attribute(name="nom", column="nom", label="Nom", filterable=True)],
            )
        ],
    )
    vocabulary = Vocabulary.build(layer, {"musee.nom": ["Musée", "Musée de l'affiche"]})
    [match] = vocabulary.match(words("les musées"))
    assert match.refs == ("dimension:musee",)  # the dimension, not the value « Musée »


def test_mt21_count_of_an_entity(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    layer = state.semantic.current(project.id)
    count = layer.metric("nb_musees")
    assert count is not None and count.label == "Nombre de musées"
    assert count.aggregation is MetricAggregation.COUNT_DISTINCT and count.entity == "musee"
    assert "nombre de musées" in count.synonyms
    for question in ("Nombre de musées par région", "Combien de musées par région"):
        latest = _ask(state, project, question).latest
        assert latest is not None and latest.spec is not None, question
        assert latest.spec.metrics == ["nb_musees"] and latest.spec.axes == ["musee.region"]
        rows = {r["region"]: r["nb_musees"] for r in latest.preview.rows}  # type: ignore[union-attr]
        museums = {r.region: set() for r in attendance.rows()}
        for row in attendance.rows():
            museums[row.region].add(row.entity)
        assert rows == {region: len(ids) for region, ids in museums.items()}


def test_mt21_an_unknown_adjective_is_asked(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    asked = _ask(state, project, "Nombre de musées labellisés par année")
    latest = asked.latest
    assert latest is not None and latest.status == "clarification", latest
    clarification = latest.clarification
    assert clarification is not None and clarification.term == "labellisés"
    refs = [o.ref for o in clarification.options]
    assert refs == ["filled:dateappellation.date", "time:dateappellation", "ignore"]
    labels_ = [o.label for o in clarification.options]
    assert labels_[:2] == ["Avec une date d'appellation renseignée", "Par année d'appellation"]
    # Answered: the museums with a date of appellation, per attendance year.
    state.marts.answer(asked.id, OWNER, ClarificationAnswer(option=0))
    answered = state.catalog.get_mart_request(asked.id).latest
    assert answered is not None and answered.status == "previewed", answered
    assert answered.spec is not None and answered.spec.metrics == ["nb_musees"]
    assert answered.spec.filters[0].operator.value == "not_null"
    assert "avec une date d'appellation renseignée" in (answered.summary or "")
    by_year = {r["annee"]: r["nb_musees"] for r in answered.preview.rows}  # type: ignore[union-attr]
    expected: dict[int, set[str]] = {}
    for row in attendance.rows():
        if row.appellation:
            expected.setdefault(row.year, set()).add(row.entity)
    assert by_year == {year: len(ids) for year, ids in expected.items()}


def test_mt22_a_new_question_inherits_nothing(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    request = _ask(state, project, "Top 10 des musées les plus visités en 2023")
    after = _follow(state, request, "Nombre de musées par région")
    latest = after.latest
    assert latest is not None and latest.kind == "question" and not latest.refines
    assert latest.spec is not None
    assert latest.spec.period is None and latest.spec.limit is None
    assert latest.spec.order_by == [] and latest.spec.filters == []
    # An adjustment still works on the current data mart.
    adjusted = _follow(state, after, "seulement 2022").latest
    assert adjusted is not None and adjusted.kind == "refinement"
    assert adjusted.spec is not None and adjusted.spec.metrics == ["nb_musees"]
    assert adjusted.spec.period is not None and adjusted.spec.period.label == "2022"


def test_mt23_mixed_message_answers_and_declines(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    request = _ask(state, project, "ce cas parle de quoi ? et donne-moi la météo actuelle à Paris")
    latest = request.latest
    assert latest is not None and latest.status == "answered", latest
    assert latest.clarification is None and latest.spec is None
    answer = latest.answer or ""
    assert attendance.FILE in answer and "Année de fréquentation de 2013 à 2023" in answer
    assert "Je laisse de côté « donne-moi la météo actuelle à Paris »" in answer
    assert len(request.iterations) == 1 and request.status is MartStatus.DRAFTED
    # The same, with a language model configured: a value alone with an everyday subject
    # is still out of scope.
    from forja_core.agent.intents import read_message

    layer = visible(state.semantic.current(project.id))
    vocabulary = Vocabulary.build(layer, {"musee.ville": ["PARIS"]})
    reading = read_message(
        "et donne-moi la météo actuelle à Paris",
        vocabulary,
        has_period=lambda _: False,
        known=lambda _: False,
        values_in_scope=True,
    )
    assert [c.intent for c in reading.clauses] == ["out_of_scope"]


def test_mt23_refusals_read_plainly(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    layer = visible(state.semantic.current(project.id))
    rewritten = plain_refusal("La météo n'est pas dans la couche sémantique fournie.", layer)
    assert "couche" not in rewritten and "périmètre des données" in rewritten
    assert plain_refusal("La marge n'existe pas dans ce projet.", layer).startswith("La marge")


def test_mt24_an_empty_result_blocks_publication(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    request = _ask(state, project, "Fréquentation par région en 2030")
    latest = request.latest
    assert latest is not None and latest.preview is not None and latest.preview.row_count == 0
    [blocking] = [c for c in latest.preview.controls if c.status == "error"]
    assert blocking.code == "empty_period"
    assert "de 2013 à 2023" in blocking.message
    assert blocking.details["suggestions"] == ["Choisir une période de 2013 à 2023"]
    with pytest.raises(PlanStateError):
        state.marts.validate(request.id, OWNER)


def test_mt25_compound_measures(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    latest = _ask(state, project, "Évolution de la fréquentation payante et gratuite par année")
    spec = latest.latest.spec  # type: ignore[union-attr]
    assert spec is not None and spec.metrics == ["payant", "gratuit"]  # not « total »
    assert spec.time_grain is not None and spec.time_grain.value == "annee"


# --- P1: the answer in the conversation ------------------------------------------------


def test_mt26_every_series_is_drawn_and_compared(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    insight = _ask(
        state, project, "Évolution de la fréquentation payante et gratuite par année"
    ).latest.preview.insight  # type: ignore[union-attr]
    assert insight is not None and insight.visual == "line"
    assert [s.label for s in insight.series] == ["Entrées payantes", "Entrées gratuites"]
    assert all(len(s.points) == 11 for s in insight.series)
    assert "Entrées gratuites : de " in insight.sentence
    assert "Répartition sur la période : entrées payantes" in insight.sentence


def test_mt27_beyond_fifteen_members_top_ten_and_others(
    case: tuple[AppState, Project, str],
) -> None:
    state, project, _ = case
    insight = _ask(state, project, "Fréquentation par musée").latest.preview.insight  # type: ignore[union-attr]
    assert insight is not None and insight.visual == "bars"
    assert len(insight.points) == 11 and insight.points[-1].label == "Autres"
    assert insight.others == len(insight.ranking) - 10
    assert sum(p.value or 0 for p in insight.points) == pytest.approx(insight.total)
    assert "les 10 premiers" in insight.sentence


def test_mt28_time_series_high_low_and_largest_change(
    case: tuple[AppState, Project, str],
) -> None:
    state, project, _ = case
    insight = _ask(state, project, "Fréquentation par année").latest.preview.insight  # type: ignore[union-attr]
    assert insight is not None
    by_year: dict[int, int] = {}
    for row in [*attendance.rows()]:
        by_year[row.year] = by_year.get(row.year, 0) + (row.total or 0)
    # 2021 loses the divergent key (quarantined) and keeps one copy of the other.
    divergent = next(
        r for r in attendance.rows() if (r.entity, r.year) == (attendance.DIVERGENT, 2021)
    )
    by_year[2021] -= divergent.total or 0
    high = max(by_year, key=lambda y: by_year[y])
    low = min(by_year, key=lambda y: by_year[y])
    assert f"point haut en {high}" in insight.sentence
    assert f"point bas en {low}" in insight.sentence
    assert "plus forte variation en " in insight.sentence


def test_mt31_mart_named_by_its_business_label(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    latest = _ask(state, project, "Fréquentation totale par région en 2023").latest
    assert latest is not None and latest.spec is not None
    assert latest.spec.name == "frequentation_par_region_2023"


# --- P1: semantic layer ---------------------------------------------------------------


def test_mt33_row_count_is_technical(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    full = state.semantic.current(project.id)
    rows = full.metric("nb_lignes")
    assert rows is not None and rows.technical
    assert rows.label == "Nombre d'enregistrements musée-année"
    assert visible(full).metric("nb_lignes") is None  # analysts and the agent


def test_mt34_business_descriptions(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    layer = state.semantic.current(project.id)
    assert layer.metric("payant").description == "Nombre d'entrées payantes sur la période."  # type: ignore[union-attr]
    for metric in layer.metrics:
        assert "sum(" not in metric.description and "fct_" not in metric.description


def test_mt36_numbers_are_kept_in_labels() -> None:
    assert labels.label("_18_25_ans") == "18-25 ans"
    assert labels.label("moins_18_ans") == "Moins de 18 ans"
    assert labels.qualified_count("entrées", "_18_25_ans") == "Entrées 18-25 ans"
    assert labels.qualified_count("entrées", "moins_18_ans") == "Entrées moins de 18 ans"
    assert labels.qualified_count("entrées", "payant") == "Entrées payantes"


def test_mt37_geographic_hierarchy_for_the_agent(case: tuple[AppState, Project, str]) -> None:
    state, project, _ = case
    museum = state.semantic.current(project.id).dimension("musee")
    assert museum is not None
    assert [h.levels for h in museum.hierarchies] == [["region", "departement", "ville"]]
    latest = _ask(state, project, "Fréquentation par territoire en 2023").latest
    assert latest is not None and latest.spec is not None
    assert latest.spec.axes == ["musee.region"]  # the coarsest level


# --- P1: cleaning and quality ----------------------------------------------------------


def test_mt38_key_conflicts_shown_before_approval(case: tuple[AppState, Project, str]) -> None:
    state, _, source_id = case
    plan = state.catalog.get_plan(source_id)
    assert plan.primary_key is not None and plan.primary_key.resolution is KeyResolution.QUARANTINE
    conflicts = plan.primary_key.conflicts
    assert conflicts is not None
    assert (conflicts.keys, conflicts.rows) == (2, 4)
    assert (conflicts.near_identical_keys, conflicts.divergent_keys) == (1, 1)
    assert conflicts.by_period == {str(attendance.CONFLICT_YEAR): 2}
    [rule] = [r for r in review_rules(plan) if r.kind.value == "primary_key"]
    assert rule.affected == 4 and rule.conflicts == conflicts
    assert "1 clé aux lignes quasi identiques" in rule.explanation
    assert "toutes ses lignes vont en quarantaine" in rule.explanation


def test_mt38_near_identical_kept_divergent_quarantined(
    case: tuple[AppState, Project, str],
) -> None:
    state, project, source_id = case
    plan = state.catalog.get_plan(source_id)
    with duckdb.connect(str(state.generator.warehouse_path(project.id)), read_only=True) as con:
        kept = dict(
            con.execute(
                f"select idmuseofile, individuel from {plan.model_name} "
                f"where annee = {attendance.CONFLICT_YEAR} and idmuseofile in (?, ?)",
                [attendance.NEAR_IDENTICAL, attendance.DIVERGENT],
            ).fetchall()
        )
        reasons = dict(
            con.execute(
                f"select _reject_reason, count(*) from {plan.model_name}__rejects group by 1"
            ).fetchall()
        )
    # The most complete copy is kept (its « individuel » is filled), the divergent key is
    # quarantined whole, as chosen by default.
    assert set(kept) == {attendance.NEAR_IDENTICAL} and kept[attendance.NEAR_IDENTICAL]
    assert reasons[DUPLICATE_KEY_REASON] == 2


def test_mt38_divergent_rows_resolved_by_choice(
    tmp_path_factory: pytest.TempPathFactory,
) -> None:
    root = tmp_path_factory.mktemp("manual_case_1_key_choice")
    state = AppState.build(shop_settings(root))
    try:
        project = state.catalog.create_project(ProjectCreate(name="Choix de clé"))
        path = attendance.write(root / "in")
        [source] = state.ingestion.ingest_file(project.id, path, attendance.FILE)
        state.plans.patch(source.id, PlanPatch(key_resolution=KeyResolution.MOST_COMPLETE))
        state.plans.approve(source.id)
        _run(state, project, JobType.BUILD_SILVER)
        plan = state.catalog.get_plan(source.id)
        with duckdb.connect(str(state.generator.warehouse_path(project.id)), read_only=True) as con:
            [(kept,)] = con.execute(
                f"select count(*) from {plan.model_name} where annee = ? and idmuseofile = ?",
                [attendance.CONFLICT_YEAR, attendance.DIVERGENT],
            ).fetchall()
            [(set_aside,)] = con.execute(
                f"select count(*) from {plan.model_name}__rejects where _reject_reason = ?",
                [LESS_COMPLETE_REASON],
            ).fetchall()
        assert (kept, set_aside) == (1, 1)  # the museum is no longer lost for that year
    finally:
        state.close()


def test_mt39_total_against_its_parts(case: tuple[AppState, Project, str]) -> None:
    state, project, source_id = case
    report = state.catalog.latest_profiles(project.id)[source_id]
    [composition] = report.compositions
    gap = attendance.gap_rows() * attendance.GAP_PER_ROW
    assert (composition.total, composition.parts) == ("total", ["payant", "gratuit"])
    assert composition.mismatched_rows == attendance.gap_rows()
    assert composition.gap == gap and composition.period_column == "annee"
    assert composition.by_period == {str(attendance.GAP_YEAR): gap}
    latest = _ask(state, project, "Fréquentation payante et gratuite par année").latest
    [control] = [c for c in latest.preview.controls if c.code == "composition"]  # type: ignore[union-attr]
    assert control.status == "warning"
    assert f"{attendance.GAP_YEAR} : +" in control.message
    assert control.details["by_year"] == {str(attendance.GAP_YEAR): float(gap)}


def test_dates_of_the_fixture() -> None:
    # The questions above read years of the fixture: keep them in step.
    assert attendance.FIRST_YEAR == 2013 and attendance.LAST_YEAR == 2023
    assert date(attendance.CONFLICT_YEAR, 1, 1) < date(attendance.LAST_YEAR, 12, 31)
