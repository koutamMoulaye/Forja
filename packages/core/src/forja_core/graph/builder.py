"""Assembly of the pipeline graph from the catalog, in one pass.

Each node gets a normalized state from its plan, its table and the runs touching it.
A run in progress marks the nodes it will build: pending until dbt (or the profiler)
starts them, running, then succeeded or failed as the job reports its items. Once
the run is over, its outcome stays on the node (``run``) and a failure turns the node
into an error until a later run succeeds.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path

from forja_core.agent.models import MartRequest, MartStatus
from forja_core.catalog import Catalog
from forja_core.errors import ProfileNotFoundError
from forja_core.gold.dbt import gold_nodes, snapshot_name
from forja_core.gold.plan import DATE_DIMENSION, ScdType
from forja_core.graph.models import (
    LANES,
    EdgeState,
    EdgeType,
    GraphEdge,
    GraphNode,
    Lane,
    LaneSummary,
    NodeCounts,
    NodeRun,
    NodeState,
    NodeType,
    ProjectGraph,
)
from forja_core.jobs.models import Job, JobStatus, JobType
from forja_core.models import Source
from forja_core.relations.models import Relation, RelationStatus
from forja_core.silver.plan import (
    Normalization,
    PiiTreatment,
    PlanStatus,
    SilverType,
    TransformationPlan,
)
from forja_core.silver.tables import TableLayer, WarehouseTable

SERVING = "dest_serving"
EXPORTS = "dest_exports"
_HIGHLIGHTS = 3
_REF_RE = re.compile(r"\b(?:dim|fct)_\w+\b")


@dataclass(frozen=True)
class GraphScope:
    """What the caller may see: technical layers, all data marts, runs."""

    technical: bool = True
    all_marts: bool = True
    user_id: str | None = None
    all_runs: bool = True


def source_node_id(source_name: str) -> str:
    return f"src_{source_name}"


def silver_node_id(source_name: str) -> str:
    return f"stg_{source_name}"


def mart_node_id(request_id: str) -> str:
    return f"mart_{request_id[:12]}"


def plan_rules(plan: TransformationPlan) -> int:
    """Rules of a Silver plan as the review screen lists them, one decision each."""
    rules = 0
    for column in plan.columns:
        if not column.included:
            rules += 1
            continue
        rules += column.from_text and column.target_type is not SilverType.VARCHAR
        rules += column.normalization is not Normalization.NONE
        rules += column.pii_treatment is not PiiTreatment.NONE
        rules += sum(1 for rule in column.rules if rule.enabled)
    rules += plan.deduplication.enabled and plan.deduplication.duplicate_rows > 0
    rules += plan.primary_key is not None
    return rules


@dataclass
class _Builder:
    catalog: Catalog
    project_id: str
    scope: GraphScope
    exports_dir: Path
    nodes: dict[str, GraphNode] = field(default_factory=dict)
    edges: dict[str, GraphEdge] = field(default_factory=dict)
    # dbt model or source id -> node id, to follow the items a run reports.
    items: dict[str, str] = field(default_factory=dict)

    def add(self, node: GraphNode, *items: str) -> None:
        self.nodes[node.id] = node
        for item in items:
            self.items[item] = node.id

    def link(
        self,
        source: str,
        target: str,
        kind: EdgeType = "lineage",
        state: EdgeState = "applied",
        confidence: float | None = None,
    ) -> None:
        if source in self.nodes and target in self.nodes:
            edge_id = f"{source}->{target}"
            self.edges[edge_id] = GraphEdge(
                id=edge_id,
                source=source,
                target=target,
                type=kind,
                state=state,
                confidence=confidence,
            )

    # ------------------------------------------------------------------ sources, Silver

    def sources(self, sources: list[Source], tables: dict[str, WarehouseTable]) -> None:
        for source in sources:
            try:
                profile = self.catalog.get_profile(source.id)
            except ProfileNotFoundError:
                profile = None
            keys = profile.candidate_keys[0].columns if profile and profile.candidate_keys else []
            visible = [c.name for c in source.columns if not c.technical]
            self.add(
                GraphNode(
                    id=source_node_id(source.name),
                    type="source",
                    lane="sources",
                    name=source.original_filename,
                    label=f"Source {source.original_filename}",
                    ref=source.id,
                    counts=NodeCounts(rows=source.row_count, columns=len(visible)),
                    state="applied" if profile else "pending",
                    quality_score=source.quality_score,
                    pii_count=len(profile.pii) if profile else 0,
                    pii_columns=[p.column for p in profile.pii] if profile else [],
                    highlights=_first([*keys, *visible]),
                ),
                source.id,
            )
            self.silver(source, tables.get(silver_node_id(source.name)))

    def silver(self, source: Source, table: WarehouseTable | None) -> None:
        plan = self.catalog.latest_plan(source.id)
        node_id = silver_node_id(source.name)
        state: NodeState
        message = None
        review = 0
        if plan is None:
            state, message = "pending", "Plan de nettoyage en préparation"
        elif plan.status is PlanStatus.DRAFT:
            state, review = "review", max(1, plan_rules(plan))
        elif table is None or table.plan_version < plan.version:
            state, message = "pending", "Plan validé, table à construire"
        else:
            state = "applied"
        pii = [c for c in plan.columns if c.included and c.pii_type] if plan else []
        keys = (
            [c.target_column for c in plan.columns if plan.primary_key
             and c.source_column in plan.primary_key.columns]
            if plan
            else []
        )  # fmt: skip
        included = [c.target_column for c in plan.columns if c.included] if plan else []
        self.add(
            GraphNode(
                id=node_id,
                type="silver",
                lane="cleaning",
                name=source.name,
                label=f"Nettoyage de {source.name}",
                ref=source.id,
                counts=NodeCounts(
                    rows=table.row_count if table else None,
                    columns=len(included) if plan else None,
                    rules=plan_rules(plan) if plan else None,
                ),
                state=state,
                message=message,
                pii_count=len(pii),
                pii_columns=[c.target_column for c in pii],
                review_count=review,
                highlights=_first([*keys, *(c.target_column for c in pii), *included]),
            ),
            node_id,
            f"{node_id}__rejects",
        )
        self.link(source_node_id(source.name), node_id)

    # ------------------------------------------------------------------------- Gold

    def gold(self, tables: dict[str, WarehouseTable], relations: list[Relation]) -> None:
        latest = self.catalog.latest_gold_plan(self.project_id)
        if latest is None:
            return
        effective = self.catalog.effective_gold_plan(self.project_id)
        built = {name: table for name, table in tables.items() if table.layer is TableLayer.GOLD}

        def state_of(name: str, same_as_built: bool) -> tuple[NodeState, str | None]:
            table = built.get(name)
            errors = [i for i in latest.issues if i.severity == "error" and name in i.location]
            if errors:
                return "error", errors[0].message
            if latest.status is PlanStatus.DRAFT:
                if table is None:
                    return "proposed", "Proposé, à valider"
                return ("applied", None) if same_as_built else ("review", "Modifié, à valider")
            if table is None or table.plan_version < latest.version:
                return "pending", "Modèle validé, table à construire"
            return "applied", None

        def reviews(name: str) -> int:
            return sum(1 for i in latest.issues if name in i.location)

        personal = {
            plan.source_name: {c.target_column for c in plan.columns if c.pii_type}
            for plan in self.catalog.effective_plans(self.project_id)
        }
        old_dims = {d.name: d for d in effective.dimensions} if effective else {}
        old_facts = {f.name: f for f in effective.facts} if effective else {}
        for dim in latest.dimensions:
            state, message = state_of(dim.name, old_dims.get(dim.name) == dim)
            dim_pii = [
                a.name
                for a in dim.attributes
                if a.pii_treatment is not PiiTreatment.DROP
                and (a.column in personal.get(dim.source, set()) or a.pii_treatment is not None)
            ]
            table = built.get(dim.name)
            items = [dim.name] + ([snapshot_name(dim)] if dim.scd is ScdType.SCD2 else [])
            self.add(
                GraphNode(
                    id=dim.name,
                    type="dimension",
                    lane="star_schema",
                    name=dim.name,
                    label=f"Dimension {dim.name.removeprefix('dim_')}",
                    ref=table.id if table else None,
                    counts=_table_counts(table, len(dim.attributes) + 1),
                    state=state,
                    message=message,
                    pii_count=len(dim_pii),
                    pii_columns=dim_pii,
                    review_count=reviews(dim.name) + (state in ("review", "proposed")),
                    highlights=_first([dim.surrogate_key, *(a.name for a in dim.attributes)]),
                ),
                *items,
            )
            self.link(silver_node_id(dim.source), dim.name)

        if DATE_DIMENSION in gold_nodes(latest):
            table = built.get(DATE_DIMENSION)
            state, message = state_of(DATE_DIMENSION, effective is not None)
            self.add(
                GraphNode(
                    id=DATE_DIMENSION,
                    type="date_dimension",
                    lane="star_schema",
                    name=DATE_DIMENSION,
                    label="Dimension date",
                    ref=table.id if table else None,
                    counts=_table_counts(table, None),
                    state=state,
                    message=message,
                    highlights=_first(c.name for c in table.columns) if table else [],
                ),
                DATE_DIMENSION,
            )

        by_id = {r.id: r for r in relations}
        for fact in latest.facts:
            state, message = state_of(fact.name, old_facts.get(fact.name) == fact)
            table = built.get(fact.name)
            fk_relations = [by_id.get(fk.relation_id or "") for fk in fact.foreign_keys]
            proposed = [r for r in fk_relations if r and r.status is RelationStatus.SUGGESTED]
            if proposed and state == "applied":
                state, message = "review", "Relation à confirmer"
            self.add(
                GraphNode(
                    id=fact.name,
                    type="fact",
                    lane="star_schema",
                    name=fact.name,
                    label=f"Faits {fact.name.removeprefix('fct_')}",
                    ref=table.id if table else None,
                    counts=_table_counts(table, None),
                    state=state,
                    message=message,
                    review_count=reviews(fact.name) + len(proposed) + (state == "proposed"),
                    highlights=_first(m.name for m in fact.measures),
                ),
                fact.name,
            )
            for source in {fact.source, *(j.source for j in fact.joins)}:
                self.link(silver_node_id(source), fact.name)
            for fk, relation in zip(fact.foreign_keys, fk_relations, strict=True):
                suggested = relation is not None and relation.status is RelationStatus.SUGGESTED
                self.link(
                    fk.dimension,
                    fact.name,
                    "relation",
                    "proposed" if suggested or state == "proposed" else "applied",
                    relation.confidence if relation else None,
                )
            if fact.date_keys:
                self.link(DATE_DIMENSION, fact.name, "relation")

    # ----------------------------------------------------------- data marts, serving

    def marts(self, requests: list[MartRequest], tables: dict[str, WarehouseTable]) -> None:
        by_id = {t.id: t for t in tables.values()}
        for request in requests:
            published = request.status is MartStatus.PUBLISHED
            if not self.scope.all_marts and not (
                published and request.owner_id == self.scope.user_id
            ):
                continue
            if not self.scope.technical and not published:
                continue
            table = by_id.get(request.published_table_id or "")
            latest = request.latest
            preview = next(
                (i.preview for i in reversed(request.iterations) if i.preview is not None), None
            )
            spec = request.current_spec
            state, message = _mart_state(request)
            columns = request.model_columns or (preview.columns if preview else [])
            node_id = mart_node_id(request.id)
            name = request.model_summary or request.question
            self.add(
                GraphNode(
                    id=node_id,
                    type="mart",
                    lane="serving",
                    name=_sentence(name),
                    label=request.question,
                    ref=request.id,
                    counts=NodeCounts(
                        rows=table.row_count if table else (preview.row_count if preview else None),
                        columns=len(columns) or None,
                    ),
                    state=state,
                    message=message,
                    pii_count=sum(1 for c in columns if c.pii),
                    pii_columns=[c.name for c in columns if c.pii],
                    review_count=int(state == "review"),
                    highlights=_first(c.label for c in columns),
                ),
                *([request.published_name] if request.published_name else []),
            )
            sql = request.model_sql or (latest.sql if latest else None) or ""
            refs = set(_REF_RE.findall(sql))
            if not refs and spec is not None:
                refs = {f for f in self.nodes if self.nodes[f].type == "fact"}
            for ref in sorted(refs):
                self.link(ref, node_id, state="applied" if published else "proposed")

    def destinations(self, tables: list[WarehouseTable]) -> None:
        published = [t for t in tables if t.publish]
        exported = sorted(
            {p.stem for p in self.exports_dir.glob("*") if p.suffix in (".csv", ".parquet")}
        )
        if published:
            self.add(
                GraphNode(
                    id=SERVING,
                    type="destination",
                    lane="serving",
                    name="Base de diffusion",
                    label="Base DuckDB pour Power BI, Superset ou Metabase",
                    counts=NodeCounts(tables=len(published)),
                    state="applied",
                    highlights=_first(t.name for t in published),
                )
            )
        if exported:
            self.add(
                GraphNode(
                    id=EXPORTS,
                    type="destination",
                    lane="serving",
                    name="Exports",
                    label="Fichiers Parquet et CSV",
                    counts=NodeCounts(tables=len(exported)),
                    state="applied",
                    highlights=_first(exported),
                )
            )
        for table in published:
            node_id = self.items.get(table.name)
            if node_id is None or node_id not in self.nodes:
                continue
            feeds_mart = any(
                e.source == node_id and self.nodes[e.target].type == "mart"
                for e in self.edges.values()
            )
            if not feeds_mart:
                self.link(node_id, SERVING, "publication")
            if table.name in exported:
                self.link(node_id, EXPORTS, "publication")

    # ------------------------------------------------------------------------ runs

    def runs(self, jobs: list[Job]) -> None:
        """Newest first: the first run met by a node decides its run and state."""
        seen: set[str] = set()
        for job in jobs:
            if not self.scope.all_runs and job.created_by != self.scope.user_id:
                continue
            targets = self._targets(job)
            progress = job.progress
            reported = bool(progress and (progress.running or progress.done or progress.failed))
            for node_id in targets:
                if node_id in seen or node_id not in self.nodes:
                    continue
                seen.add(node_id)
                node = self.nodes[node_id]
                items = [i for i, n in self.items.items() if n == node_id]
                status = self._node_status(job, items, reported, node.type)
                if status is None:
                    continue
                node.run = NodeRun(
                    run_id=job.id,
                    type=job.type,
                    status=status,
                    percent=progress.percent if progress and status is JobStatus.RUNNING else None,
                    finished_at=job.finished_at,
                )
                if status is JobStatus.RUNNING:
                    node.state = "running"
                elif status is JobStatus.QUEUED:
                    node.state = "pending"
                elif status is JobStatus.FAILED:
                    node.state, node.message = "error", job.error

    def _node_status(
        self, job: Job, items: list[str], reported: bool, kind: NodeType
    ) -> JobStatus | None:
        progress = job.progress
        if job.status is JobStatus.QUEUED:
            return JobStatus.QUEUED
        if job.status is JobStatus.CANCELLED:
            return None
        if progress is not None and reported and kind != "destination":
            if any(i in progress.failed for i in items):
                return JobStatus.FAILED
            if any(i in progress.running for i in items):
                return JobStatus.RUNNING
            if items and all(i in progress.done for i in items if not i.endswith("__rejects")):
                return JobStatus.SUCCEEDED
            if job.status is JobStatus.RUNNING:
                return JobStatus.QUEUED
            # The run ended before reaching the node: a failure elsewhere stopped it.
            return None
        building_all = job.type is JobType.BUILD_ALL and job.status is JobStatus.RUNNING
        if kind == "destination" and building_all:
            serving = progress is not None and progress.step == "serving"
            return JobStatus.RUNNING if serving else JobStatus.QUEUED
        return job.status

    def _targets(self, job: Job) -> list[str]:
        nodes = self.nodes.values()
        params = job.params

        def silver() -> list[str]:
            if params.source_ids is None:
                return [n.id for n in nodes if n.type == "silver"]
            return [n.id for n in nodes if n.type == "silver" and n.ref in params.source_ids]

        gold = [n.id for n in nodes if n.lane == "star_schema"]
        destinations = [n.id for n in nodes if n.type == "destination"]
        match job.type:
            case JobType.PROFILE:
                return [
                    n.id
                    for n in nodes
                    if n.type == "source"
                    and (params.source_ids is None or n.ref in params.source_ids)
                ]
            case JobType.BUILD_SILVER:
                return silver()
            case JobType.BUILD_GOLD:
                return gold
            case JobType.BUILD_ALL:
                return silver() + gold + destinations
            case JobType.EXPORT:
                return destinations
            case JobType.MART_REQUEST | JobType.PUBLISH_MART:
                mart = mart_node_id(params.mart_request_id or "")
                return [mart] + (destinations if job.type is JobType.PUBLISH_MART else [])
            case _:
                return []

    # --------------------------------------------------------------------- result

    def finish(self) -> ProjectGraph:
        for edge in self.edges.values():
            target = self.nodes[edge.target].state
            if target == "running" and self.nodes[edge.source].state != "pending":
                edge.state = "running"
            elif target == "error":
                edge.state = "error"
            elif target == "proposed" and edge.type == "lineage":
                edge.state = "proposed"
        nodes = list(self.nodes.values())
        edges = list(self.edges.values())
        lanes = [_summary(lane, [n for n in nodes if n.lane == lane]) for lane in LANES]
        # Deterministic: the insertion order follows the catalog order.
        body = "".join(m.model_dump_json() for m in (*nodes, *edges, *lanes))
        version = hashlib.sha256(body.encode()).hexdigest()[:16]
        return ProjectGraph(
            project_id=self.project_id, version=version, nodes=nodes, edges=edges, lanes=lanes
        )


def build_graph(
    catalog: Catalog,
    project_id: str,
    *,
    exports_dir: Path,
    scope: GraphScope | None = None,
) -> ProjectGraph:
    scope = scope or GraphScope()
    builder = _Builder(catalog, project_id, scope, exports_dir)
    all_tables = catalog.list_tables(project_id)
    tables = {t.name: t for t in all_tables}
    relations = catalog.list_relations(project_id)
    if scope.technical:
        builder.sources(catalog.list_sources(project_id), tables)
    builder.gold(tables, relations)
    builder.marts(list(reversed(catalog.list_mart_requests(project_id))), tables)  # oldest first
    visible = [t for t in all_tables if t.layer is not TableLayer.SILVER or scope.technical]
    builder.destinations(visible)
    for table in all_tables:  # published names resolve to their node
        builder.items.setdefault(table.name, table.name)
    builder.runs(catalog.list_jobs(project_id))
    return builder.finish()


def _mart_state(request: MartRequest) -> tuple[NodeState, str | None]:
    match request.status:
        case MartStatus.PUBLISHED:
            return "applied", None
        case MartStatus.PREVIEWED:
            return "review", "Aperçu à valider"
        case MartStatus.VALIDATED:
            return "review", "En attente d'approbation"
        case MartStatus.REJECTED:
            return "rejected", request.rejection_reason
        case _:
            latest = request.latest
            if latest is not None and latest.status == "failed":
                return "error", latest.error
            if latest is not None and latest.status == "clarification":
                return "review", "Une précision est demandée"
            return "pending", "En préparation"


def _table_counts(table: WarehouseTable | None, columns: int | None) -> NodeCounts:
    if table is None:
        return NodeCounts(columns=columns)
    visible = [c for c in table.columns if not c.technical and not c.name.startswith("dbt_")]
    return NodeCounts(rows=table.row_count, columns=len(visible))


def _summary(lane: Lane, nodes: list[GraphNode]) -> LaneSummary:
    states: dict[NodeState, int] = {}
    for node in nodes:
        states[node.state] = states.get(node.state, 0) + 1
    return LaneSummary(lane=lane, total=len(nodes), states=states)


def _first(values: Iterable[str]) -> list[str]:
    out: list[str] = []
    for value in values:
        if value and value not in out:
            out.append(value)
        if len(out) == _HIGHLIGHTS:
            break
    return out


def _sentence(text: str) -> str:
    text = text.strip().rstrip(".")
    return text[:1].upper() + text[1:]


__all__ = [
    "EXPORTS",
    "SERVING",
    "GraphScope",
    "build_graph",
    "mart_node_id",
    "plan_rules",
    "silver_node_id",
    "source_node_id",
]
