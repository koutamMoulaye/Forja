from __future__ import annotations

from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

from forja_api.state import AppState
from forja_core.errors import PlanStateError, PlanValidationError
from forja_core.gold.context import GoldContext, build_gold_context
from forja_core.gold.heuristic import propose_heuristic
from forja_core.gold.plan import (
    Aggregation,
    DateKey,
    Fact,
    FactJoin,
    GoldModel,
    GoldPlanPatch,
    Measure,
    ScdType,
)
from forja_core.gold.service import GoldPlanService
from forja_core.gold.validation import validate_model
from forja_core.models import Project
from forja_core.relations.models import RelationStatus
from forja_core.silver.plan import PlanStatus
from forja_llm import LLMProvider, LLMSettings
from forja_llm.base import Completion, LLMRetryableError
from forja_llm.gold import LLMGoldProposer
from tests.auth import api_client
from tests.shop import build_shop, shop_settings
from tests.test_api import wait_for_run


@pytest.fixture(scope="module")
def shop(
    tmp_path_factory: pytest.TempPathFactory, ecommerce_dir: Path
) -> Iterator[tuple[AppState, Project]]:
    state, project = build_shop(shop_settings(tmp_path_factory.mktemp("gold")), ecommerce_dir)
    for relation in state.catalog.list_relations(project.id):
        state.relations.confirm(relation.id)
    yield state, project
    state.close()


@pytest.fixture
def ctx(shop: tuple[AppState, Project]) -> GoldContext:
    state, project = shop
    return build_gold_context(state.catalog, project.id)


@pytest.fixture
def model(ctx: GoldContext) -> GoldModel:
    return propose_heuristic(ctx)[0]


def _codes(model: GoldModel, ctx: GoldContext) -> set[str]:
    return {i.code for i in validate_model(model, ctx) if i.severity == "error"}


def _fact(model: GoldModel) -> Fact:
    return model.facts[0]


def test_heuristic_star_schema(model: GoldModel, ctx: GoldContext) -> None:
    dims = {d.name: d for d in model.dimensions}
    assert sorted(dims) == ["dim_clients", "dim_produits"]
    assert dims["dim_clients"].natural_key == ["id_client"]
    assert dims["dim_clients"].surrogate_key == "client_key"
    assert dims["dim_clients"].scd is ScdType.SCD2

    [fact] = model.facts
    assert (fact.name, fact.source, fact.grain) == (
        "fct_ventes", "lignes_commande", ["id_commande", "num_ligne"],
    )  # fmt: skip
    assert [(j.source, j.from_column) for j in fact.joins] == [("commandes", "id_commande")]
    assert sorted((fk.name, fk.source, fk.column) for fk in fact.foreign_keys) == [
        ("client_key", "commandes", "id_client"),
        ("produit_key", "lignes_commande", "code_produit"),
    ]
    assert [(d.name, d.source) for d in fact.date_keys] == [("date_commande_key", "commandes")]
    assert {d.name for d in fact.degenerate_dimensions} == {"id_commande", "num_ligne", "statut"}
    measures = {m.name: m for m in fact.measures}
    assert measures["montant"].expression == "quantite * prix_unitaire"
    assert measures["prix_unitaire"].aggregation is Aggregation.NONE  # never averaged
    assert measures["quantite"].aggregation is Aggregation.SUM
    assert "frais_port" not in measures
    assert model.date_dimension.enabled
    assert _codes(model, ctx) == set()


def test_heuristic_is_deterministic(ctx: GoldContext) -> None:
    assert propose_heuristic(ctx) == propose_heuristic(ctx)


def test_unconfirmed_relation_is_refused(model: GoldModel, ctx: GoldContext) -> None:
    suggested = tuple(
        r.model_copy(update={"status": RelationStatus.SUGGESTED}) if r.to_source == "clients" else r
        for r in ctx.relations
    )
    assert "unconfirmed_relation" in _codes(model, replace(ctx, relations=suggested))


def test_orphan_dimension(model: GoldModel, ctx: GoldContext) -> None:
    orphan = model.model_copy(deep=True)
    _fact(orphan).foreign_keys = [
        fk for fk in _fact(orphan).foreign_keys if fk.dimension != "dim_produits"
    ]
    assert "orphan_dimension" in _codes(orphan, ctx)


def test_reversed_join_is_a_fan_out(model: GoldModel, ctx: GoldContext) -> None:
    reversed_join = model.model_copy(deep=True)
    fact = _fact(reversed_join)
    fact.source, fact.grain = "commandes", ["id_commande"]
    fact.joins = [
        FactJoin(
            source="lignes_commande",
            from_source="commandes",
            from_column="id_commande",
            to_column="id_commande",
        )
    ]
    issues = validate_model(reversed_join, ctx)
    fan_out = [i for i in issues if i.code == "fan_out"]
    assert fan_out and "démultipliée" in fan_out[0].message


def test_summing_a_header_amount_is_a_fan_out(model: GoldModel, ctx: GoldContext) -> None:
    header = model.model_copy(deep=True)
    _fact(header).measures.append(
        Measure(name="frais", expression="commandes.frais_port", aggregation=Aggregation.SUM)
    )
    issues = [i for i in validate_model(header, ctx) if i.code == "fan_out"]
    assert issues and "multipliée" in issues[0].message
    _fact(header).measures[-1].aggregation = Aggregation.MAX
    assert "fan_out" not in _codes(header, ctx)


def test_grain_must_contain_the_primary_key(model: GoldModel, ctx: GoldContext) -> None:
    coarse = model.model_copy(deep=True)
    _fact(coarse).grain = ["id_commande"]
    assert "inconsistent_grain" in _codes(coarse, ctx)


@pytest.mark.parametrize(
    ("expression", "message"),
    [
        ("upper(code_produit)", "upper() n'est pas autorisé"),
        ("sum(quantite)", "l'agrégat sum()"),
        ("quantite * (select 1)", "sous-requête"),
        ("quantite * remise", "colonne inconnue « lignes_commande.remise »"),
        ("clients.nom", "table inconnue"),
    ],
)
def test_measure_expressions_are_checked(
    model: GoldModel, ctx: GoldContext, expression: str, message: str
) -> None:
    bad = model.model_copy(deep=True)
    _fact(bad).measures.append(Measure(name="x", expression=expression))
    errors = [i for i in validate_model(bad, ctx) if i.code == "invalid_expression"]
    assert errors and message in errors[0].message


def test_text_measures_cannot_be_summed(model: GoldModel, ctx: GoldContext) -> None:
    bad = model.model_copy(deep=True)
    _fact(bad).measures.append(Measure(name="x", expression="code_produit"))
    assert "not_numeric" in _codes(bad, ctx)


def test_date_keys_need_dates(model: GoldModel, ctx: GoldContext) -> None:
    bad = model.model_copy(deep=True)
    _fact(bad).date_keys.append(DateKey(name="x_key", source="commandes", column="statut"))
    assert "not_a_date" in _codes(bad, ctx)


def test_lifecycle(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    service = GoldPlanService(state.catalog)
    plan = service.propose(project.id)
    assert plan.status is PlanStatus.DRAFT and plan.origin == "heuristic"
    assert plan.facts[0].foreign_keys[0].relation_id is not None
    assert all(d.explanation for d in plan.dimensions)
    assert plan.facts[0].measures[0].explanation.endswith("par défaut.")
    assert any("frais_port" in w for w in plan.warnings)

    broken = service.patch(
        project.id,
        GoldPlanPatch(add_measures={"fct_ventes": [Measure(name="y", expression="upper(statut)")]}),
    )
    assert broken.version == plan.version + 1 and broken.errors
    with pytest.raises(PlanValidationError) as excinfo:
        service.approve(project.id)
    assert excinfo.value.details["issues"][0]["code"] == "invalid_expression"

    fixed = service.patch(
        project.id,
        GoldPlanPatch(
            remove_measures={"fct_ventes": ["y"]}, dimension_scd={"dim_produits": ScdType.SCD1}
        ),
    )
    assert not fixed.errors
    assert fixed.dimension("dim_produits").scd is ScdType.SCD1  # type: ignore[union-attr]
    approved = service.approve(project.id)
    assert approved.status is PlanStatus.APPROVED
    assert state.catalog.effective_gold_plan(project.id) == approved
    with pytest.raises(PlanStateError):
        service.approve(project.id)
    with pytest.raises(PlanValidationError):
        service.patch(project.id, GoldPlanPatch(dimension_scd={"dim_x": ScdType.SCD1}))


class _ScriptedProvider(LLMProvider):
    name = "scripted"

    def __init__(self, answers: list[str | Exception]) -> None:
        super().__init__(LLMSettings(model="m", max_attempts=1), sleep=lambda _: None)
        self.answers = answers
        self.prompts: list[str] = []

    def _complete(
        self, *, system: str, prompt: str, response_schema: dict[str, Any], schema_name: str
    ) -> Completion:
        self.prompts.append(prompt)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return Completion(answer, 100, 50)


def test_llm_proposal_is_validated_and_corrected(
    shop: tuple[AppState, Project], model: GoldModel
) -> None:
    state, project = shop
    invalid = model.model_copy(deep=True)
    _fact(invalid).measures.append(Measure(name="z", expression="sum(quantite)"))
    provider = _ScriptedProvider([invalid.model_dump_json(), model.model_dump_json()])
    service = GoldPlanService(state.catalog, LLMGoldProposer(provider, state.catalog))
    plan = service.propose(project.id)
    assert plan.origin == "llm:scripted/m"
    assert not plan.errors
    assert "rejected by validation" in provider.prompts[1]
    assert "invalid_expression" in provider.prompts[1]
    assert '"relations"' in provider.prompts[0] and "suggested" not in provider.prompts[0]


def test_llm_failure_falls_back_to_heuristic(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    provider = _ScriptedProvider([LLMRetryableError("down")])
    service = GoldPlanService(state.catalog, LLMGoldProposer(provider, state.catalog))
    plan = service.propose(project.id)
    assert plan.origin == "heuristic"
    assert any("Proposition par LLM impossible" in w for w in plan.warnings)
    assert service.propose(project.id, use_llm=False).origin == "heuristic"


def test_gold_api(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    state.close()
    try:
        with api_client(state.settings) as client:
            queued = client.post(f"/projects/{project.id}/gold-plan/propose", json={})
            assert queued.status_code == 202
            run = wait_for_run(client, queued.json()["id"])
            assert run["type"] == "gold_proposal" and run["status"] == "succeeded"
            assert run["result"]["origin"] == "heuristic"  # no provider configured
            version = run["result"]["gold_plan_version"]
            assert client.get(f"/projects/{project.id}/gold-plan").json()["version"] == version
            issues = client.get(f"/projects/{project.id}/gold-plan/issues")
            assert issues.status_code == 200
            assert not [i for i in issues.json() if i["severity"] == "error"]
            patched = client.patch(
                f"/projects/{project.id}/gold-plan",
                json={"dimension_scd": {"dim_clients": "scd1"}},
            )
            assert patched.json()["version"] == version + 1
            approved = client.post(f"/projects/{project.id}/gold-plan/approve")
            assert approved.status_code == 200 and approved.json()["status"] == "approved"
            assert client.post(f"/projects/{project.id}/gold-plan/approve").status_code == 409
            assert (
                client.get(f"/projects/{project.id}/gold-plan", params={"version": version}).json()[
                    "version"
                ]
                == version
            )
            assert len(client.get(f"/projects/{project.id}/gold-plans").json()) >= 2
            bad = client.patch(f"/projects/{project.id}/gold-plan", json={"unknown": 1})
            assert bad.status_code == 422
    finally:
        state.catalog = type(state.catalog)(state.settings.catalog_path)
