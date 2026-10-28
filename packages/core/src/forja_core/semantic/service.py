"""Lifecycle of the semantic layer: generation from the applied Gold plan, manual edits
that survive regeneration, synonym proposals, and local lookups of attribute values."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date

import duckdb

from forja_core.catalog import Catalog
from forja_core.errors import ForjaError, PlanStateError, PlanValidationError
from forja_core.gold.context import build_gold_context
from forja_core.locks import WarehouseLocks
from forja_core.logging import get_logger
from forja_core.semantic.generate import generate_layer
from forja_core.semantic.models import (
    Attribute,
    Metric,
    SemanticDimension,
    SemanticLayer,
    SemanticOverride,
    SynonymProposal,
)
from forja_core.silver.dbt.project import DbtProjectGenerator
from forja_core.silver.plan import PlanStatus
from forja_core.utils import quote_ident, utcnow

log = get_logger(__name__)

# Above this many values an attribute is not used to resolve filter values.
MAX_DISTINCT_VALUES = 5_000


def _apply(
    metrics: list[Metric], dimensions: list[SemanticDimension], overrides: list[SemanticOverride]
) -> list[SemanticOverride]:
    """Apply overrides in place; returns those whose target no longer exists."""
    orphans = []
    for override in overrides:
        target = find_target(metrics, dimensions, override.target)
        if target is None:
            orphans.append(override)
            continue
        if override.label is not None:
            target.label = override.label
        if override.description is not None:
            target.description = override.description
        if override.synonyms is not None:
            target.synonyms = list(override.synonyms)
        target.synonyms = list(dict.fromkeys([*target.synonyms, *override.add_synonyms]))
        if override.hidden is not None:
            target.hidden = override.hidden
    return orphans


def find_target(
    metrics: list[Metric], dimensions: list[SemanticDimension], target: str
) -> Metric | SemanticDimension | Attribute | None:
    kind, _, ref = target.partition(":")
    if kind == "metric":
        return next((m for m in metrics if m.name == ref), None)
    if kind == "dimension":
        return next((d for d in dimensions if d.name == ref), None)
    dimension_name, _, attribute_name = ref.partition(".")
    dim = next((d for d in dimensions if d.name == dimension_name), None)
    return None if dim is None else dim.attribute(attribute_name)


def visible(layer: SemanticLayer) -> SemanticLayer:
    """The layer without hidden elements (what analysts and the agent see)."""
    copy = layer.model_copy(deep=True)
    copy.metrics = [m for m in copy.metrics if not m.hidden]
    copy.dimensions = [d for d in copy.dimensions if not d.hidden]
    for dim in copy.dimensions:
        dim.attributes = [a for a in dim.attributes if not a.hidden]
    copy.overrides = []
    return copy


class SemanticService:
    def __init__(
        self, catalog: Catalog, generator: DbtProjectGenerator, locks: WarehouseLocks
    ) -> None:
        self.catalog = catalog
        self.generator = generator
        self.locks = locks
        self._values: dict[tuple[str, str, str, str], list[str]] = {}

    # --- Generation ------------------------------------------------------------------

    def regenerate(self, project_id: str, *, by: str | None = None) -> SemanticLayer:
        """A new version when the applied Gold plan or the overrides changed."""
        # The plan the Gold tables were built with: a newer plan, approved but not built
        # yet, does not describe the warehouse.
        applied = [
            p for p in self.catalog.list_gold_plans(project_id) if p.status is PlanStatus.APPLIED
        ]
        if not applied:
            raise PlanStateError(
                "the semantic layer is generated from the applied Gold plan: run build_gold"
            )
        plan, ctx = applied[-1], build_gold_context(self.catalog, project_id)
        metrics, dimensions, default_time = generate_layer(plan, ctx)
        overrides = self.catalog.list_semantic_overrides(project_id)
        orphans = _apply(metrics, dimensions, overrides)
        if orphans:
            log.warning(
                "semantic_overrides_orphaned",
                project_id=project_id,
                targets=[o.target for o in orphans],
            )
        latest = self.catalog.latest_semantic_layer(project_id)
        layer = SemanticLayer(
            id=uuid.uuid4().hex,
            project_id=project_id,
            version=(latest.version + 1) if latest else 1,
            gold_plan_version=plan.version,
            created_at=utcnow(),
            created_by=by,
            metrics=metrics,
            dimensions=dimensions,
            default_time_dimension=default_time,
            overrides=overrides,
        )
        if (
            latest is not None
            and latest.gold_plan_version == plan.version
            and latest.content() == layer.content()
        ):
            return latest
        self.catalog.add_semantic_layer(layer)
        self._values.clear()
        log.info("semantic_layer_generated", project_id=project_id, version=layer.version)
        return layer

    def current(self, project_id: str) -> SemanticLayer:
        return self.catalog.get_semantic_layer(project_id)

    # --- Manual edits ----------------------------------------------------------------

    def patch(
        self, project_id: str, overrides: list[SemanticOverride], *, by: str
    ) -> SemanticLayer:
        layer = self.current(project_id)
        existing = {o.target: o for o in self.catalog.list_semantic_overrides(project_id)}
        for override in overrides:
            if find_target(layer.metrics, layer.dimensions, override.target) is None:
                raise PlanValidationError(
                    f"unknown element '{override.target}' in the semantic layer",
                    details={"target": override.target},
                )
            merged = existing.get(override.target, SemanticOverride(target=override.target))
            update = override.model_dump(exclude_unset=True, exclude={"target"})
            if "add_synonyms" in update:
                update["add_synonyms"] = list(
                    dict.fromkeys([*merged.add_synonyms, *update["add_synonyms"]])
                )
            merged = merged.model_copy(update={**update, "updated_by": by, "updated_at": utcnow()})
            self.catalog.save_semantic_override(project_id, merged)
        return self.regenerate(project_id, by=by)

    # --- Synonym proposals -----------------------------------------------------------

    def propose_synonym(
        self,
        project_id: str,
        target: str,
        synonym: str,
        *,
        by: str,
        mart_request_id: str | None = None,
    ) -> SynonymProposal:
        layer = self.current(project_id)
        if find_target(layer.metrics, layer.dimensions, target) is None:
            raise PlanValidationError(f"unknown element '{target}' in the semantic layer")
        return self.catalog.save_synonym_proposal(
            SynonymProposal(
                id=uuid.uuid4().hex,
                project_id=project_id,
                target=target,
                synonym=synonym.strip(),
                proposed_by=by,
                mart_request_id=mart_request_id,
                created_at=utcnow(),
            )
        )

    def review_synonym(self, proposal_id: str, *, accept: bool, by: str) -> SynonymProposal:
        proposal = self.catalog.get_synonym_proposal(proposal_id)
        if proposal.status != "pending":
            raise PlanStateError(f"the proposal is already {proposal.status}")
        proposal.status = "accepted" if accept else "rejected"
        proposal.reviewed_by = by
        proposal.reviewed_at = utcnow()
        self.catalog.save_synonym_proposal(proposal)
        if accept:
            self.patch(
                proposal.project_id,
                [SemanticOverride(target=proposal.target, add_synonyms=[proposal.synonym])],
                by=by,
            )
        return proposal

    # --- Local lookups (never sent to a language model) ------------------------------

    @contextmanager
    def _warehouse(
        self, project_id: str, timeout: float = 60
    ) -> Iterator[duckdb.DuckDBPyConnection]:
        path = self.generator.warehouse_path(project_id)
        if not path.exists():
            raise ForjaError("the project warehouse does not exist: run build_gold first")
        with (
            self.locks.hold(project_id, timeout=timeout),
            duckdb.connect(str(path), read_only=True) as con,
        ):
            yield con

    def distinct_values(
        self, layer: SemanticLayer, dimension: SemanticDimension, attribute: Attribute
    ) -> list[str]:
        """Distinct values of a filterable attribute, read from the Gold table."""
        if not attribute.filterable:
            return []
        cache_key = (
            layer.project_id,
            str(layer.gold_plan_version),
            dimension.table,
            attribute.column,
        )
        if cache_key in self._values:
            return self._values[cache_key]
        with self._warehouse(layer.project_id) as con:
            rows = con.execute(
                f"SELECT DISTINCT CAST({quote_ident(attribute.column)} AS VARCHAR) "
                f"FROM {quote_ident(dimension.table)} "
                f"WHERE {quote_ident(attribute.column)} IS NOT NULL LIMIT {MAX_DISTINCT_VALUES + 1}"
            ).fetchall()
        values = sorted(str(r[0]) for r in rows)
        if len(values) > MAX_DISTINCT_VALUES:
            values = []
        values = [v for v in values if v != "Inconnu"]
        self._values[cache_key] = values
        return values

    def count_members(
        self, layer: SemanticLayer, dimension: SemanticDimension, attribute: Attribute, value: str
    ) -> int:
        """Members of a dimension having a value: « 1 284 clients » segment Professionnel."""
        counted = (
            dimension.table_key
            if dimension.kind != "degenerate" and dimension.table_key
            else next(
                (a.column for a in dimension.attributes if a.name == dimension.display_attribute),
                attribute.column,
            )
        )
        with self._warehouse(layer.project_id) as con:
            [(count,)] = con.execute(
                f"SELECT count(DISTINCT {quote_ident(counted)}) "
                f"FROM {quote_ident(dimension.table)} "
                f"WHERE CAST({quote_ident(attribute.column)} AS VARCHAR) = ?",
                [value],
            ).fetchall()
        return int(count)

    def scalar(self, project_id: str, sql: str) -> object | None:
        """First value of a read-only query on the warehouse (a total, a count)."""
        with self._warehouse(project_id) as con:
            row = con.execute(sql).fetchone()
        return None if row is None else row[0]

    def date_range(self, layer: SemanticLayer, time_dimension: str) -> tuple[date, date] | None:
        dim = layer.dimension(time_dimension)
        if dim is None or dim.fact_key is None:
            return None
        with self._warehouse(layer.project_id) as con:
            [(first, last)] = con.execute(
                f"SELECT min(d.date), max(d.date) FROM {quote_ident(dim.fact)} f "
                f"JOIN dim_date d ON d.date_key = f.{quote_ident(dim.fact_key)}"
            ).fetchall()
        return None if first is None else (first, last)
