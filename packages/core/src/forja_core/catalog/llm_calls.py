"""Persistence of the language model call journal."""

from __future__ import annotations

from forja_core.catalog.base import to_db_timestamp
from forja_core.catalog.relations import RelationsMixin
from forja_core.llm_calls import LLMCall


class LLMCallsMixin(RelationsMixin):
    def add_llm_call(self, call: LLMCall) -> None:
        self._execute(
            "INSERT INTO llm_calls VALUES (?, ?, ?, ?, ?)",
            [
                call.id,
                call.project_id,
                call.status,
                call.model_dump_json(),
                to_db_timestamp(call.created_at),
            ],
        )

    def list_llm_calls(self, project_id: str | None = None) -> list[LLMCall]:
        if project_id is None:
            rows = self._fetchall("SELECT data FROM llm_calls ORDER BY created_at")
        else:
            rows = self._fetchall(
                "SELECT data FROM llm_calls WHERE project_id = ? ORDER BY created_at",
                [project_id],
            )
        return [LLMCall.model_validate_json(row[0]) for row in rows]
