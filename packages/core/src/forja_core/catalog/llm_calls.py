"""Persistence of the language model call journal and of the response cache."""

from __future__ import annotations

from forja_core.catalog.base import to_db_timestamp
from forja_core.catalog.relations import RelationsMixin
from forja_core.llm_calls import LLMCall
from forja_core.utils import utcnow


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

    def list_llm_calls(
        self, project_id: str | None = None, *, job_id: str | None = None
    ) -> list[LLMCall]:
        if project_id is None:
            rows = self._fetchall("SELECT data FROM llm_calls ORDER BY created_at")
        else:
            rows = self._fetchall(
                "SELECT data FROM llm_calls WHERE project_id = ? ORDER BY created_at",
                [project_id],
            )
        calls = [LLMCall.model_validate_json(row[0]) for row in rows]
        return [c for c in calls if job_id is None or c.job_id == job_id]

    def get_llm_cache(self, key: str) -> str | None:
        """A validated answer stored for this exact prompt, provider and model."""
        with self._lock:
            row = self._fetchone("SELECT response FROM llm_cache WHERE key = ?", [key])
            if row is None:
                return None
            self._execute(
                "UPDATE llm_cache SET hits = hits + 1, last_hit_at = ? WHERE key = ?",
                [to_db_timestamp(utcnow()), key],
            )
            return str(row[0])

    def put_llm_cache(
        self, key: str, *, provider: str, model: str, purpose: str, response: str
    ) -> None:
        self._execute(
            "INSERT INTO llm_cache VALUES (?, ?, ?, ?, ?, 0, ?, NULL) "
            "ON CONFLICT (key) DO UPDATE SET response = excluded.response",
            [key, provider, model, purpose, response, to_db_timestamp(utcnow())],
        )

    def clear_llm_cache(self) -> int:
        row = self._fetchone("SELECT count(*) FROM llm_cache")
        self._execute("DELETE FROM llm_cache")
        return int(row[0]) if row else 0
