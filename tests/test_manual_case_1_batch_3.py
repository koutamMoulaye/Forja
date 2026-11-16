"""Manual case 1 bis, leftovers of the third batch (docs/manual-tests.md, MT-56 to MT-59).

On the synthetic attendance file (``tests.fixtures.attendance``), which holds three
museums of the same name in three cities, and on a small two-version file whose region
labels are written two ways.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from pathlib import Path

import duckdb
import pytest

from forja_api.state import AppState
from forja_core.agent.models import ClarificationAnswer, MartIteration
from forja_core.auth.models import Principal, User
from forja_core.jobs.models import JobStatus, JobType, RunRequest
from forja_core.models import Project, ProjectCreate
from forja_core.silver.review import ReviewRuleKind, review_rules
from forja_core.utils import utcnow
from tests.agent_eval.run import _wait, build_eval_museums
from tests.fixtures import attendance
from tests.shop import shop_settings

OWNER = Principal(
    user=User(id="eng", email="eng@exemple.fr", is_admin=True, created_at=utcnow()),
    via="password",
)


@pytest.fixture(scope="module")
def museums(tmp_path_factory: pytest.TempPathFactory) -> Iterator[tuple[AppState, Project]]:
    state, project = build_eval_museums(tmp_path_factory.mktemp("manual_case_1_batch_3"))
    yield state, project
    state.close()


def _ask(state: AppState, project: Project, question: str) -> MartIteration:
    request, job = state.marts.create(project.id, OWNER, question)
    latest = _wait(state, request, job.id).latest
    assert latest is not None
    return latest


def test_mt56_homonyms_are_never_added_up(museums: tuple[AppState, Project]) -> None:
    state, project = museums
    latest = _ask(state, project, "Fréquentation par musée en 2023")
    assert latest.spec is not None and latest.spec.axes == ["musee.nom_du_musee"]
    assert latest.sql
    warehouse = state.generator.warehouse_path(project.id)
    with duckdb.connect(str(warehouse), read_only=True) as con:
        rows = dict(con.execute(latest.sql).fetchall())
    homonyms = sorted(n for n in rows if n.startswith(attendance.HOMONYM))
    # One row per museum, told apart by its city.
    assert len(homonyms) == len(attendance.HOMONYMS)
    assert all(re.fullmatch(rf"{attendance.HOMONYM} \(.+\)", n) for n in homonyms)
    expected = {row.city: 0 for row in attendance.rows() if row.name == attendance.HOMONYM}
    for row in attendance.rows():
        if row.name == attendance.HOMONYM and row.year == 2023:
            expected[row.city] += row.total or 0
    assert sorted(rows[n] for n in homonyms) == sorted(expected.values())


def test_mt57_labelled_by_appellation_year(museums: tuple[AppState, Project]) -> None:
    state, project = museums
    request, job = state.marts.create(project.id, OWNER, "Nombre de musées labellisés par année")
    asked = _wait(state, request, job.id)
    clarification = asked.latest.clarification  # type: ignore[union-attr]
    assert clarification is not None
    options = {o.ref: o.label for o in clarification.options}
    assert options["dated:dateappellation"] == "Par année d'appellation"
    index = [o.ref for o in clarification.options].index("dated:dateappellation")
    again, job = state.marts.answer(asked.id, OWNER, ClarificationAnswer(option=index))
    answered = _wait(state, again, job.id).latest
    assert answered is not None and answered.spec is not None and answered.preview is not None
    assert answered.spec.time_dimension == "dateappellation"
    assert answered.spec.filters[0].operator.value == "not_null"
    years = [r["annee"] for r in answered.preview.rows]
    assert None not in years  # the museums without an appellation are not « labellisés »
    expected: dict[int, set[str]] = {}
    for row in attendance.rows():
        if row.appellation:
            expected.setdefault(int(row.appellation[-4:]), set()).add(row.entity)
    assert {r["annee"]: r["nb_musees"] for r in answered.preview.rows} == {
        y: len(e) for y, e in expected.items()
    }
    insight = answered.preview.insight
    assert insight is not None and insight.visual == "line"
    assert [p.label for p in insight.points] == [str(y) for y in sorted(expected)]


def test_mt59_short_synthesis(museums: tuple[AppState, Project]) -> None:
    state, project = museums
    latest = _ask(state, project, "Top 10 des musées les plus visités en 2023")
    insight = latest.preview.insight  # type: ignore[union-attr]
    assert insight is not None
    sentences = [s for s in re.split(r"(?<=\.) ", insight.sentence) if s]
    assert 1 < len(sentences) <= 3
    assert all(s[:1].isupper() for s in sentences), sentences
    assert insight.details and all(d[:1].isupper() for d in insight.details)
    series = _ask(state, project, "Fréquentation par année").preview.insight  # type: ignore[union-attr]
    assert series is not None and len(re.split(r"(?<=\.) ", series.sentence)) <= 3
    assert any("plus forte variation" in d.lower() for d in series.details)


# --- MT-58: one label written two ways across two versions ------------------------------


def _write(path: Path, regions: list[str]) -> None:
    lines = ["id;region;montant"] + [f"{i};{r};{i * 10}" for i, r in enumerate(regions, 1)]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def test_mt58_label_variants_harmonized_across_versions(tmp_path: Path) -> None:
    state = AppState.build(shop_settings(tmp_path / "root"))
    try:
        project = state.catalog.create_project(ProjectCreate(name="Variantes"))
        first, second = tmp_path / "v1", tmp_path / "v2"
        first.mkdir()
        second.mkdir()
        _write(first / "regions.csv", ["Île-de-France", "Bretagne", "Île-de-France"] * 4)
        [source] = state.ingestion.ingest_file(project.id, first / "regions.csv", "regions.csv")
        plan = state.catalog.get_plan(source.id)
        assert plan.column("region").harmonize == {}  # one spelling so far  # type: ignore[union-attr]
        # The second batch writes the same region another way.
        _write(second / "regions.csv", ["ILE DE FRANCE", "Bretagne", "ile-de-france"] * 2)
        state.ingestion.ingest_file(project.id, second / "regions.csv", "regions.csv")
        plan = state.catalog.get_plan(source.id)
        region = plan.column("region")
        assert region is not None
        assert region.harmonize == {
            "ILE DE FRANCE": "Île-de-France",
            "ile-de-france": "Île-de-France",
        }
        rules = [r for r in review_rules(plan) if r.kind is ReviewRuleKind.HARMONIZE]
        assert rules and "« Île-de-France »" in rules[0].explanation
        job = state.executor.create(project.id, RunRequest(type=JobType.BUILD_SILVER))
        state.runner.submit(job.id)
        assert state.catalog.get_job(job.id).status is JobStatus.SUCCEEDED
        warehouse = state.generator.warehouse_path(project.id)
        with duckdb.connect(str(warehouse), read_only=True) as con:
            regions = {
                r[0] for r in con.execute(f"select region from stg_{source.name}").fetchall()
            }
        assert regions == {"Île-de-France", "Bretagne"}
    finally:
        state.close()
