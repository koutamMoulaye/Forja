"""Gold model proposal by a language model.

The model receives the safe context (schemas, statistics, Silver plans) and the
relations (confirmed, or suggested with a high confidence), and answers with a
:class:`GoldModel` document. It never writes SQL: measure expressions are checked by the
Gold validation, and an invalid proposal is sent back once with the validation errors.

For a project with many sources the context is compact: per source, only the key
columns, the columns of relations, the dates and the candidate measures, with the count
of the other columns. A local model reads it several times faster, and the shape of the
model depends on nothing else.
"""

from __future__ import annotations

from forja_core.agent.preselect import estimate_tokens
from forja_core.catalog import Catalog
from forja_core.errors import GoldProposalError
from forja_core.gold.context import GoldContext, is_numeric
from forja_core.gold.dates import period_grain
from forja_core.gold.heuristic import is_code
from forja_core.gold.plan import GoldModel
from forja_core.gold.service import GoldProposer
from forja_core.jobs.scope import JobCancelledError
from forja_llm.base import LLMCancelledError, LLMError, LLMProvider, LLMRequest
from forja_llm.context import (
    LLMSafeContext,
    SourceContext,
    build_safe_context,
    serialize_for_llm,
)

# From this many sources, the context sent is compact.
COMPACT_FROM_SOURCES = 4

GOLD_TASK = """\
Design a star schema (Gold layer) for this project, as a GoldModel JSON document.

Rules:
- Use only the Silver tables of the context; refer to a table by its source name
  ("name" field, never the "stg_" table name) and to columns by their Silver names.
- Use only the relations listed in the context (confirmed, or suggested with a high
  confidence: Forja asks a person to confirm those).
- A dimension's natural_key is the primary_key of its source; surrogate_key is a new
  column name such as <entity>_key. Dimensions are scd1 unless told otherwise.
- A source listing "entities" repeats an entity's attributes on every row (a single
  denormalized file: one row per entity and year, say). Extract each entity as a
  dimension: name dim_<entity> after what it describes (its name attribute, e.g.
  nom_du_musee gives dim_musee), source = that source, natural_key = [the entity key],
  attributes = the listed attributes, extracted = true, latest_by = the period column
  of the grain, scd1. The fact keeps the entity key as a foreign key (source = the fact
  source, column = the key) and keeps only keys and measures, not the attributes.
- A fact's grain is the primary key of its source. Join other tables only along a
  relation read from the fact side towards the referenced key (many-to-one).
- Tables at different grains are different facts (order lines, payments of an order,
  reviews of an order): never join one fact table to another.
- An event header (an order, referenced through a column of the primary key of its
  lines, payments, reviews) is joined to each of those facts; it is never a dimension.
- A small reference table referenced by a dimension (a translation of category names)
  is merged into that dimension with "lookups", not a dimension of its own.
- A source with no primary key and no relation is left out of the model.
- Foreign keys follow relations from the fact or a joined table to a dimension key.
- date_keys reference the columns with a period_level: grain "day" for dates, "year",
  "month" or "quarter" for integer period columns (annee, mois). Give each a role, a
  French business word (« achat », « livraison », « fréquentation »). primary_date is
  the name of the main date key: the event itself (a purchase), part of the grain or
  the most filled, never a planned or estimated date. date_dimension.enabled is true
  when there are date keys.
- Name facts and dimensions after the business process or entity in French, without
  the file prefix (fct_ventes, fct_paiements, dim_client, dim_produit); names are
  unique.
- Measures: expression is a row-level formula over the fact's tables, using only column
  names, numbers, + - * /, coalesce, nullif, abs, round, least, greatest, case. No SQL
  statement, no aggregate function: set the aggregation field instead (sum, avg, min,
  max, count, count_distinct). Never sum a measure read from a joined table. Unit
  prices beside a quantity, rates and ratios are not additive: aggregation none; a
  score is averaged (avg).
- Every dimension must be referenced by at least one fact.
- Names are snake_case; dimensions start with dim_, facts with fct_.
- Explanations may be left empty: Forja writes them.

Procedure:
1. Each fact source is a table that holds measures or dates, references other tables
   and is referenced by none (e.g. order lines, payments).
2. For each relation whose from_source is the fact source or an already joined table:
   - if to_source is an entity (customers, products...), add a foreign key to its
     dimension, with source = the relation's from_source and column = its from_column;
   - if to_source describes the same business event (e.g. the order header of order
     lines), add a join with source = to_source, from_source = the relation's
     from_source, from_column and to_column = the relation's columns; then apply this
     step to the relations of that joined table too.
3. Add a date key for each date column of the fact source and of the joined tables.
4. Identifiers and texts of the fact source and joined tables that are neither keys
   nor measures (order number, status) are degenerate dimensions.
"""


def compact_columns(ctx: GoldContext) -> dict[str, set[str]]:
    """Per source, the columns that shape a model: keys, relation columns, dates and
    candidate measures."""
    related: dict[str, set[str]] = {name: set() for name in ctx.sources}
    for relation in ctx.relations:
        related.setdefault(relation.from_source, set()).add(relation.from_column)
        related.setdefault(relation.to_source, set()).add(relation.to_column)
    kept: dict[str, set[str]] = {}
    for name, source in ctx.sources.items():
        columns = set(source.key) | related.get(name, set())
        columns |= {e.key for e in source.entities}
        for column, column_type in source.columns.items():
            if period_grain(source, column) is not None or (
                is_numeric(column_type) and not is_code(source, column)
            ):
                columns.add(column)
        kept[name] = columns
    return kept


class LLMGoldProposer(GoldProposer):
    def __init__(self, provider: LLMProvider, catalog: Catalog) -> None:
        self.provider = provider
        self.catalog = catalog
        self.origin = f"llm:{provider.name}/{provider.model}"

    def context(self, ctx: GoldContext, *, compact: bool | None = None) -> LLMSafeContext:
        """The safe context of the proposal; compact by default from
        ``COMPACT_FROM_SOURCES`` sources."""
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
        if compact is None:
            compact = len(ctx.sources) >= COMPACT_FROM_SOURCES
        relations = [*ctx.confirmed, *ctx.strong_suggestions]
        return build_safe_context(
            project, sources, relations, compact_columns(ctx) if compact else None
        )

    def context_tokens(self, ctx: GoldContext, *, compact: bool | None = None) -> int:
        """Tokens of what is sent: the task and the context."""
        return estimate_tokens(GOLD_TASK + serialize_for_llm(self.context(ctx, compact=compact)))

    def propose(self, ctx: GoldContext, feedback: list[str]) -> GoldModel:
        context = self.context(ctx)
        task = GOLD_TASK
        if feedback:
            task += "\nYour previous proposal was rejected by validation:\n" + "\n".join(
                f"- {line}" for line in feedback
            )
        try:
            return self.provider.generate(
                LLMRequest(
                    task=task, context=context, purpose="gold_plan", project_id=ctx.project_id
                ),
                GoldModel,
            )
        except LLMCancelledError as exc:
            raise JobCancelledError("the Gold proposal was cancelled") from exc
        except LLMError as exc:
            raise GoldProposalError(f"{type(exc).__name__}: {exc}") from exc
