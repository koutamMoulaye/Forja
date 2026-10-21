"""Gold model proposal by a language model.

The model receives the safe context (schemas, statistics, Silver plans) and the
confirmed relations only, and answers with a :class:`GoldModel` document. It never
writes SQL: measure expressions are checked by the Gold validation, and an invalid
proposal is sent back once with the validation errors.
"""

from __future__ import annotations

from forja_core.catalog import Catalog
from forja_core.errors import GoldProposalError
from forja_core.gold.context import GoldContext
from forja_core.gold.plan import GoldModel
from forja_core.gold.service import GoldProposer
from forja_llm.base import LLMError, LLMProvider, LLMRequest
from forja_llm.context import SourceContext, build_safe_context

GOLD_TASK = """\
Design a star schema (Gold layer) for this project, as a GoldModel JSON document.

Rules:
- Use only the Silver tables of the context; refer to a table by its source name
  ("name" field) and to columns by their Silver names.
- Use only the relations listed in the context: they are confirmed by a person.
- A dimension's natural_key is the primary_key of its source; surrogate_key is a new
  column name such as <entity>_key. Use scd2 for entities whose attributes change over
  time (customers, products), scd1 otherwise.
- A fact's grain is the primary key of its source. Join other tables only along a
  relation read from the fact side towards the referenced key (many-to-one).
- Foreign keys follow relations from the fact or a joined table to a dimension key.
- date_keys reference date columns; date_dimension.enabled is true when there are some.
- Measures: expression is a row-level formula over the fact's tables, using only column
  names, numbers, + - * /, coalesce, nullif, abs, round, least, greatest, case. No SQL
  statement, no aggregate function: set the aggregation field instead (sum, avg, min,
  max, count, count_distinct). Never sum a measure read from a joined table.
- Every dimension must be referenced by at least one fact.
- Names are snake_case; dimensions start with dim_, facts with fct_.
- Explanations may be left empty: Forja writes them.
"""


class LLMGoldProposer(GoldProposer):
    def __init__(self, provider: LLMProvider, catalog: Catalog) -> None:
        self.provider = provider
        self.catalog = catalog
        self.origin = f"llm:{provider.name}/{provider.model}"

    def propose(self, ctx: GoldContext, feedback: list[str]) -> GoldModel:
        project = self.catalog.get_project(ctx.project_id)
        sources = []
        for silver in ctx.sources.values():
            source = self.catalog.get_source(silver.plan.source_id)
            sources.append(
                SourceContext(
                    source=source,
                    profile=self.catalog.get_profile(source.id),
                    plan=silver.plan,
                    table=silver.table,
                )
            )
        context = build_safe_context(project, sources, ctx.confirmed)
        task = GOLD_TASK
        if feedback:
            task += "\nYour previous proposal was rejected by validation:\n" + "\n".join(
                f"- {line}" for line in feedback
            )
        try:
            return self.provider.generate(
                LLMRequest(task=task, context=context, purpose="gold_plan", project_id=project.id),
                GoldModel,
            )
        except LLMError as exc:
            raise GoldProposalError(f"{type(exc).__name__}: {exc}") from exc
