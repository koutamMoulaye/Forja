"""Manual test case 2 (docs/manual-tests.md, MT-44 to MT-55): a multi-source project.

The nine files of ``tests.fixtures.marketplace`` have the shape of a public e-commerce
export: order lines, payments and reviews of orders, customers with a stable
identifier, products with a translation table, sellers, and a table of coordinates tied
to nothing. Nothing here knows the dataset: the rules are generic (relation graph, key
roles, business vocabulary), and the single-file projects keep their own tests.
"""

from __future__ import annotations

import csv
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path
from typing import Any

import duckdb
import pytest

from forja_api.state import AppState
from forja_core.gold.context import GoldContext
from forja_core.gold.plan import Aggregation, FactJoin, GoldPlan, ScdType
from forja_core.gold.service import Alternative, GoldPlanService
from forja_core.gold.validation import validate_model
from forja_core.jobs.models import JobStatus, JobType, RunRequest
from forja_core.models import Project, ProjectCreate
from forja_core.relations.models import RelationStatus
from forja_core.semantic.models import MetricFormat
from forja_core.silver.tables import TableLayer
from forja_llm import LLMProvider, LLMSettings
from forja_llm.base import Completion
from forja_llm.gold import LLMGoldProposer
from tests.fixtures import marketplace as mp
from tests.shop import shop_settings

DATA = mp.build()


def _run(state: AppState, project: Project, job_type: JobType) -> None:
    job = state.executor.create(project.id, RunRequest(type=job_type))
    state.runner.submit(job.id)
    assert state.catalog.get_job(job.id).status is JobStatus.SUCCEEDED, state.catalog.job_logs(
        job.id
    )


@pytest.fixture(scope="module")
def case(tmp_path_factory: pytest.TempPathFactory) -> Iterator[tuple[AppState, Project, Path]]:
    root = tmp_path_factory.mktemp("manual_case_2")
    state = AppState.build(shop_settings(root, agent_today="2025-01-15"))
    project = state.catalog.create_project(ProjectCreate(name="Cas 2"))
    paths = mp.write(root / "in", DATA)
    for path in paths:
        state.ingestion.ingest_file(project.id, path, path.name)
    _run(state, project, JobType.BUILD_SILVER)
    yield state, project, root
    state.close()
    for path in paths:
        path.unlink(missing_ok=True)


@pytest.fixture(scope="module")
def proposed(case: tuple[AppState, Project, Path]) -> GoldPlan:
    """The proposal before any relation is reviewed."""
    state, project, _ = case
    return state.gold.propose(project.id, use_llm=False)


@pytest.fixture(scope="module")
def built(case: tuple[AppState, Project, Path], proposed: GoldPlan) -> GoldPlan:
    """Relations confirmed, model proposed again, approved and built."""
    state, project, _ = case
    for relation in state.catalog.list_relations(project.id):
        if relation.status is RelationStatus.SUGGESTED:
            state.relations.confirm(relation.id)
    plan = state.gold.propose(project.id, use_llm=False)
    assert plan.errors == [], plan.errors
    state.gold.approve(project.id)
    _run(state, project, JobType.BUILD_GOLD)
    return plan


def _query(state: AppState, project: Project, sql: str) -> list[tuple[Any, ...]]:
    warehouse = state.generator.warehouse_path(project.id)
    with duckdb.connect(str(warehouse), read_only=True) as con:
        return con.execute(sql).fetchall()


# --- P0: the key of a table of several rows per parent (MT-53) ---------------------------


def test_mt53_composite_keys_lose_no_row(case: tuple[AppState, Project, Path]) -> None:
    state, project, _ = case
    keys: dict[str, list[str]] = {}
    rows: dict[str, int] = {}
    for table in state.catalog.list_tables(project.id, TableLayer.SILVER):
        assert table.source_id is not None
        plan = state.catalog.get_plan(table.source_id, version=table.plan_version)
        keys[plan.source_name] = plan.primary_key.columns if plan.primary_key else []
        rows[plan.source_name] = table.row_count or 0
    # A sequence column with its parent, never the parent alone quasi unique.
    assert keys["olist_order_payments_dataset"] == ["order_id", "payment_sequential"]
    assert keys["olist_order_items_dataset"] == ["order_id", "order_item_id"]
    # A review identifier repeats on a few orders: the review and its order.
    assert sorted(keys["olist_order_reviews_dataset"]) == ["order_id", "review_id"]
    assert rows["olist_order_payments_dataset"] == len(DATA.payments)
    assert rows["olist_order_items_dataset"] == len(DATA.items)
    assert rows["olist_order_reviews_dataset"] == len(DATA.reviews)


# --- P0: the proposed model (MT-44 to MT-52) ----------------------------------------------


def test_mt44_suggested_relations_are_used_and_flagged(proposed: GoldPlan) -> None:
    assert {f.name for f in proposed.facts} == {"fct_ventes", "fct_paiements", "fct_avis"}
    to_confirm = [i for i in proposed.errors if i.code == "unconfirmed_relation"]
    assert to_confirm and all("à confirmer" in i.message for i in to_confirm)
    assert all(i.code == "unconfirmed_relation" for i in proposed.errors)
    assert any("à confirmer avant d'approuver" in w for w in proposed.warnings)


def test_mt45_facts_at_their_grain(built: GoldPlan) -> None:
    facts = {f.name: f for f in built.facts}
    sales = facts["fct_ventes"]
    assert (sales.source, sales.grain) == (
        "olist_order_items_dataset",
        ["order_id", "order_item_id"],
    )
    assert {m.name: m.aggregation for m in sales.measures} == {
        "price": Aggregation.SUM,
        "freight_value": Aggregation.SUM,
        "nb_lignes": Aggregation.SUM,
    }
    # The order header lends its dates and status; it is no dimension.
    assert "olist_orders_dataset" in {j.source for j in sales.joins}
    assert "order_status" in {d.name for d in sales.degenerate_dimensions}
    assert all(d.source != "olist_orders_dataset" for d in built.dimensions)
    # Payments and reviews: facts of their own, never joined to the order lines.
    payments = facts["fct_paiements"]
    assert payments.grain == ["order_id", "payment_sequential"]
    assert "olist_order_items_dataset" not in {j.source for j in payments.joins}
    assert facts["fct_avis"].grain in (["order_id", "review_id"], ["review_id", "order_id"])
    assert {m.name: m.aggregation for m in facts["fct_avis"].measures}["review_score"] is (
        Aggregation.AVG
    )


def test_mt46_joining_payments_to_lines_is_a_fan_out(
    case: tuple[AppState, Project, Path], built: GoldPlan
) -> None:
    state, project, _ = case
    ctx = state.gold.context(project.id)
    model = built.model()
    sales = next(f for f in model.facts if f.name == "fct_ventes")
    sales.joins.append(
        FactJoin(
            source="olist_order_payments_dataset",
            from_source="olist_order_items_dataset",
            from_column="order_id",
            to_column="order_id",
        )
    )
    fan_out = [i for i in validate_model(model, ctx) if i.code == "fan_out"]
    assert fan_out and "démultipliée" in fan_out[0].message
    assert "payment_sequential" in fan_out[0].message


def test_mt47_dimensions(built: GoldPlan) -> None:
    dims = {d.name: d for d in built.dimensions}
    assert set(dims) == {"dim_client", "dim_produit", "dim_vendeur"}
    client = dims["dim_client"]
    # The stable identifier is the business key; customer_id only attaches the orders.
    assert client.natural_key == ["customer_unique_id"] and client.extracted
    assert "customer_id" not in {a.column for a in client.attributes}
    sales = next(f for f in built.facts if f.name == "fct_ventes")
    fk = next(k for k in sales.foreign_keys if k.dimension == "dim_client")
    assert (fk.source, fk.column) == ("olist_customers_dataset", "customer_unique_id")
    # The main date is the purchase; the other dates are named by their role.
    roles = {k.column: k.role for k in sales.date_keys}
    assert sales.primary_date == "order_purchase_timestamp_key"
    assert roles["order_purchase_timestamp"] == "achat"
    assert roles["order_approved_at"] == "validation"
    assert roles["order_delivered_carrier_date"] == "remise transporteur"
    assert roles["order_delivered_customer_date"] == "livraison"
    assert roles["order_estimated_delivery_date"] == "livraison estimée"


def test_mt48_reference_table_merged(built: GoldPlan) -> None:
    product = next(d for d in built.dimensions if d.name == "dim_produit")
    [lookup] = product.lookups
    assert lookup.source == "product_category_name_translation"
    assert [a.column for a in lookup.attributes] == ["product_category_name_english"]
    assert all(d.source != lookup.source for d in built.dimensions)


def test_mt49_noisy_table_left_out_with_a_reason(built: GoldPlan) -> None:
    assert all("geolocation" not in d.source for d in built.dimensions)
    [reason] = [w for w in built.warnings if "olist_geolocation_dataset" in w]
    assert "exclue du modèle" in reason and "lignes par valeur" in reason


def test_mt50_scd1_unless_a_change_was_observed(
    case: tuple[AppState, Project, Path], built: GoldPlan
) -> None:
    assert all(d.scd is ScdType.SCD1 for d in built.dimensions)
    state, project, root = case
    # A second version of the sellers, one of them moved: historized from now on.
    moved = [dict(s) for s in DATA.sellers]
    moved[0]["seller_city"], moved[0]["seller_state"] = "curitiba", "PR"
    path = root / "in" / mp.SELLERS
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(moved[0]))
        writer.writeheader()
        writer.writerows(moved)
    source = next(
        s for s in state.catalog.list_sources(project.id) if s.name.startswith("olist_sellers")
    )
    [again] = state.ingestion.ingest_file(project.id, path, mp.SELLERS)
    assert again.id == source.id
    _run(state, project, JobType.BUILD_SILVER)
    plan = state.gold.propose(project.id, use_llm=False)
    scd = {d.name: d.scd for d in plan.dimensions}
    assert scd["dim_vendeur"] is ScdType.SCD2
    assert scd["dim_produit"] is ScdType.SCD1
    assert any("dim_vendeur" in w and "ont changé" in w for w in plan.warnings)


def test_mt51_unique_business_names(built: GoldPlan) -> None:
    names = [d.name for d in built.dimensions] + [f.name for f in built.facts]
    assert len(names) == len(set(names))
    assert not any("olist" in n or "dataset" in n for n in names)
    assert not [i for i in built.issues if i.code == "duplicate_name"]


def test_mt52_amounts_are_in_no_assumed_currency(
    case: tuple[AppState, Project, Path], built: GoldPlan
) -> None:
    state, project, _ = case
    layer = state.semantic.current(project.id)
    revenue = layer.metric("price")
    assert revenue is not None and revenue.label == "Chiffre d'affaires"
    assert revenue.format is MetricFormat.CURRENCY and revenue.unit is None
    assert "euro" not in revenue.description


# --- Totals of the built model --------------------------------------------------------------


def test_built_totals_match_the_sources(
    case: tuple[AppState, Project, Path], built: GoldPlan
) -> None:
    state, project, _ = case
    [(lines, revenue)] = _query(state, project, "select count(*), sum(price) from fct_ventes")
    assert lines == len(DATA.items)
    assert round(float(revenue), 2) == round(sum(float(i["price"]) for i in DATA.items), 2)
    [(payments, paid)] = _query(
        state, project, "select count(*), sum(payment_value) from fct_paiements"
    )
    assert payments == len(DATA.payments) and round(float(paid), 2) == DATA.paid_total()
    [(reviews,)] = _query(state, project, "select count(*) from fct_avis")
    assert reviews == len(DATA.reviews)


def _ask(state: AppState, project: Project, question: str) -> list[dict[str, Any]]:
    from forja_core.agent.models import MartRequest  # noqa: F401
    from tests.agent_eval.run import EVAL_USER, _wait

    request, job = state.marts.create(project.id, EVAL_USER, question)
    latest = _wait(state, request, job.id).latest
    assert latest is not None and latest.preview is not None, latest
    return list(latest.preview.rows)


def test_agent_answers_match_the_sources(
    case: tuple[AppState, Project, Path], built: GoldPlan
) -> None:
    state, project, _ = case
    by_type = {r["payment_type"]: r["payment_value"] for r in _ask(
        state, project, "Montant total payé par mode de paiement"
    )}  # fmt: skip
    assert {k: round(float(v), 2) for k, v in by_type.items()} == DATA.paid_by_type()
    states = {r["customer_state"]: r["nb_clients"] for r in _ask(
        state, project, "Nombre de clients par État"
    )}  # fmt: skip
    assert states == DATA.customers_by_state()
    months = {str(r["mois"])[:7]: r["price"] for r in _ask(
        state, project, "Chiffre d'affaires par mois en 2017"
    )}  # fmt: skip
    assert {k: round(float(v), 2) for k, v in months.items()} == DATA.revenue_by_month(2017)
    scores = {
        r["product_category_name"] or "Inconnu": r["review_score_moyen"]
        for r in _ask(state, project, "Note moyenne des avis par catégorie")
    }
    expected = DATA.score_by_category()
    assert {k: round(float(v), 4) for k, v in scores.items()} == expected


# --- P1: speed of the proposal, the language model on demand (MT-54, MT-55) ---------------


class _Scripted(LLMProvider):
    name = "scripted"

    def __init__(self, answer: str) -> None:
        super().__init__(LLMSettings(model="m", max_attempts=1), sleep=lambda _: None)
        self.answer = answer

    def _complete(
        self, *, system: str, prompt: str, response_schema: dict[str, Any], schema_name: str
    ) -> Completion:
        return Completion(self.answer, 1200, 800)


def test_mt55_compact_context(case: tuple[AppState, Project, Path], built: GoldPlan) -> None:
    state, project, _ = case
    proposer = LLMGoldProposer(_Scripted("{}"), state.catalog)
    ctx: GoldContext = state.gold.context(project.id)
    compact = proposer.context_tokens(ctx)
    full = proposer.context_tokens(ctx, compact=False)
    assert compact < full * 0.65, (compact, full)  # the task text (~1 400 tokens) included
    sent = proposer.context(ctx).model_dump_json()
    assert "review_comment_message" not in sent  # neither key, date nor measure
    assert "payment_value" in sent and "order_purchase_timestamp" in sent


def test_mt54_ai_proposal_is_an_alternative(
    case: tuple[AppState, Project, Path], built: GoldPlan
) -> None:
    state, project, _ = case
    current = state.catalog.latest_gold_plan(project.id)
    assert current is not None
    provider = _Scripted(current.model().model_dump_json())
    provider.journal = state.catalog.add_llm_call  # durations measured, as in production
    proposer = LLMGoldProposer(provider, state.catalog)
    service = GoldPlanService(state.catalog, proposer, data_dir=state.settings.data_dir)
    estimate = service.llm_estimate(project.id)
    assert estimate.available and estimate.context_tokens > 0
    alternative = service.propose_alternative(project.id)
    assert isinstance(alternative, Alternative) and alternative.origin == "llm:scripted/m"
    # Nothing changes until the alternative is adopted.
    assert state.catalog.latest_gold_plan(project.id).version == current.version  # type: ignore[union-attr]
    adopted = service.adopt(project.id, alternative)
    assert adopted.version == current.version + 1 and adopted.origin == "llm:scripted/m"
    # Measured on the call just made: the next estimate has a throughput.
    again = service.llm_estimate(project.id)
    assert again.tokens_per_second and again.estimated_seconds is not None


def test_mt54_heuristic_proposal_is_fast(case: tuple[AppState, Project, Path]) -> None:
    import time

    state, project, _ = case
    started = time.perf_counter()
    state.gold.propose(project.id, use_llm=False)
    assert time.perf_counter() - started < 10


def test_reversed_one_to_one_relation_is_read_as_stored(
    case: tuple[AppState, Project, Path], built: GoldPlan
) -> None:
    """A one-to-one relation stored from the customers to the orders (as detection may
    keep it): the proposal reads it towards the customers' key all the same."""
    state, project, _ = case
    ctx = state.gold.context(project.id)
    flipped = tuple(
        r.model_copy(
            update={
                "from_source": r.to_source, "from_column": r.to_column,
                "to_source": r.from_source, "to_column": r.from_column,
                "from_table": r.to_table, "to_table": r.from_table,
            }
        )
        if r.to_source == "olist_customers_dataset" else r
        for r in ctx.relations
    )  # fmt: skip
    from forja_core.gold.heuristic import propose_heuristic

    model, _ = propose_heuristic(replace(ctx, relations=flipped))
    assert {f.name for f in model.facts} == {"fct_ventes", "fct_paiements", "fct_avis"}
    assert "dim_client" in {d.name for d in model.dimensions}
