"""The pipeline graph shown on the canvas: nodes, links and compartments."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from forja_core.jobs.models import JobStatus, JobType

NodeType = Literal["source", "silver", "dimension", "fact", "date_dimension", "mart", "destination"]
Lane = Literal["sources", "cleaning", "star_schema", "serving"]
NodeState = Literal["applied", "review", "error", "running", "pending", "proposed", "rejected"]
EdgeType = Literal["lineage", "relation", "publication"]
EdgeState = Literal["applied", "proposed", "error", "running"]

LANES: tuple[Lane, ...] = ("sources", "cleaning", "star_schema", "serving")
LANE_OF: dict[NodeType, Lane] = {
    "source": "sources",
    "silver": "cleaning",
    "dimension": "star_schema",
    "fact": "star_schema",
    "date_dimension": "star_schema",
    "mart": "serving",
    "destination": "serving",
}


class _Output(BaseModel):
    # Response models: every field is always present, so the client types say so.
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)


class NodeCounts(_Output):
    rows: int | None = Field(default=None, description="Lignes de la table ou du fichier")
    columns: int | None = Field(default=None, description="Colonnes visibles (hors techniques)")
    rules: int | None = Field(default=None, description="Règles du plan de nettoyage")
    tables: int | None = Field(default=None, description="Destinations : tables publiées")


class NodeRun(_Output):
    """The run touching the node: in progress, or the last one that ended."""

    run_id: str
    type: JobType
    status: JobStatus = Field(
        description="queued, running, or the outcome for this node (succeeded, failed)"
    )
    percent: int | None = Field(default=None, ge=0, le=100, description="Progression du run")
    finished_at: datetime | None = None


class GraphNode(_Output):
    id: str = Field(
        description="Identifiant stable, lisible dans l'URL : src_clients, stg_clients, "
        "dim_clients, fct_ventes, dim_date, mart_<id>, dest_serving, dest_exports"
    )
    type: NodeType
    lane: Lane = Field(description="Compartiment du canvas")
    name: str = Field(description="Nom affiché sur le nœud : clients.csv, clients, dim_clients")
    label: str = Field(description="Libellé complet en français : « Nettoyage de clients »")
    ref: str | None = Field(
        default=None,
        description="Objet de l'API derrière le nœud : id de source (source, silver), "
        "de table (Gold publiée) ou de demande de data mart",
    )
    counts: NodeCounts = Field(default_factory=NodeCounts)
    state: NodeState
    message: str | None = Field(default=None, description="Raison d'une erreur ou d'une revue")
    quality_score: float | None = Field(default=None, description="Sources : score 0-100")
    pii_count: int = Field(default=0, description="Colonnes de données personnelles")
    pii_columns: list[str] = Field(
        default_factory=list,
        description="Ces colonnes, pseudonymisées dans la base de diffusion et les exports",
    )
    review_count: int = Field(default=0, description="Éléments à revoir")
    highlights: list[str] = Field(
        default_factory=list,
        description="Colonnes clés, mesures ou règles montrées au zoom rapproché",
    )
    run: NodeRun | None = None


class GraphEdge(_Output):
    id: str
    source: str
    target: str
    type: EdgeType = Field(
        description="lineage (la cible est construite depuis la source), relation (clé "
        "étrangère d'un fait vers une dimension), publication (vers une destination)"
    )
    state: EdgeState
    confidence: float | None = Field(
        default=None, ge=0, le=1, description="Relations : confiance de la détection (0,94)"
    )


class LaneSummary(_Output):
    lane: Lane
    total: int
    states: dict[NodeState, int] = Field(
        default_factory=dict, description="Nœuds par état, sans les états à zéro"
    )


class ProjectGraph(_Output):
    project_id: str
    version: str = Field(
        description="Empreinte du contenu, renvoyée aussi en ETag : un appel avec "
        "If-None-Match identique reçoit 304 sans corps"
    )
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    lanes: list[LaneSummary]
