"""Persistence of semantic layer versions, manual overrides and synonym proposals."""

from __future__ import annotations

from forja_core.catalog.auth import AuthMixin
from forja_core.catalog.base import to_db_timestamp
from forja_core.errors import NotFoundError
from forja_core.semantic.models import SemanticLayer, SemanticOverride, SynonymProposal


class SemanticLayerNotFoundError(NotFoundError):
    code = "semantic_layer_not_found"


class SemanticMixin(AuthMixin):
    def add_semantic_layer(self, layer: SemanticLayer) -> SemanticLayer:
        self._execute(
            "INSERT INTO semantic_layers VALUES (?, ?, ?, ?, ?)",
            [
                layer.id,
                layer.project_id,
                layer.version,
                layer.model_dump_json(),
                to_db_timestamp(layer.created_at),
            ],
        )
        return layer

    def latest_semantic_layer(self, project_id: str) -> SemanticLayer | None:
        row = self._fetchone(
            "SELECT data FROM semantic_layers WHERE project_id = ? ORDER BY version DESC LIMIT 1",
            [project_id],
        )
        return None if row is None else SemanticLayer.model_validate_json(row[0])

    def get_semantic_layer(self, project_id: str, version: int | None = None) -> SemanticLayer:
        self.get_project(project_id)
        if version is None:
            layer = self.latest_semantic_layer(project_id)
        else:
            row = self._fetchone(
                "SELECT data FROM semantic_layers WHERE project_id = ? AND version = ?",
                [project_id, version],
            )
            layer = None if row is None else SemanticLayer.model_validate_json(row[0])
        if layer is None:
            raise SemanticLayerNotFoundError(
                f"no semantic layer in project '{project_id}': build the Gold layer first"
            )
        return layer

    def list_semantic_versions(self, project_id: str) -> list[int]:
        rows = self._fetchall(
            "SELECT version FROM semantic_layers WHERE project_id = ? ORDER BY version",
            [project_id],
        )
        return [int(r[0]) for r in rows]

    def save_semantic_override(self, project_id: str, override: SemanticOverride) -> None:
        self._execute(
            "INSERT INTO semantic_overrides VALUES (?, ?, ?, ?) "
            "ON CONFLICT (project_id, target) DO UPDATE SET data = excluded.data, "
            "updated_at = excluded.updated_at",
            [
                project_id,
                override.target,
                override.model_dump_json(),
                to_db_timestamp(override.updated_at),
            ],
        )

    def list_semantic_overrides(self, project_id: str) -> list[SemanticOverride]:
        rows = self._fetchall(
            "SELECT data FROM semantic_overrides WHERE project_id = ? ORDER BY target",
            [project_id],
        )
        return [SemanticOverride.model_validate_json(r[0]) for r in rows]

    def save_synonym_proposal(self, proposal: SynonymProposal) -> SynonymProposal:
        self._execute(
            "INSERT INTO synonym_proposals VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT (id) DO UPDATE SET status = excluded.status, data = excluded.data",
            [
                proposal.id,
                proposal.project_id,
                proposal.status,
                proposal.model_dump_json(),
                to_db_timestamp(proposal.created_at),
            ],
        )
        return proposal

    def get_synonym_proposal(self, proposal_id: str) -> SynonymProposal:
        row = self._fetchone("SELECT data FROM synonym_proposals WHERE id = ?", [proposal_id])
        if row is None:
            raise NotFoundError(f"synonym proposal '{proposal_id}' not found")
        return SynonymProposal.model_validate_json(row[0])

    def list_synonym_proposals(
        self, project_id: str, status: str | None = None
    ) -> list[SynonymProposal]:
        rows = self._fetchall(
            "SELECT data FROM synonym_proposals WHERE project_id = ? "
            "AND (? IS NULL OR status = ?) ORDER BY created_at",
            [project_id, status, status],
        )
        return [SynonymProposal.model_validate_json(r[0]) for r in rows]
