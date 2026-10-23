"""Privacy-safe context sent to language models.

The only way to build what a provider receives is :func:`build_safe_context`. It
copies an explicit allowlist of schema and statistical fields from profiles, Silver
plans and relations. No field of these models can carry a cell value:

- top values, minimums, maximums, means and sample rows are never copied (a maximum
  is a row value);
- every free-text field is an identifier (project, source, table or column name) or
  a value from a closed set (types, date formats, statuses), checked by validators;
- the models forbid extra fields and are immutable.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, Field, field_validator

from forja_core.models import Architecture, Project, Source
from forja_core.profiling.models import ColumnProfile, InferredType, PiiType, ProfileReport
from forja_core.profiling.types import KNOWN_FORMATS
from forja_core.relations.models import Relation, RelationStatus
from forja_core.silver.plan import SilverType, TransformationPlan
from forja_core.silver.tables import SilverTable

_IDENTIFIER_MAX_LENGTH = 128


class _SafeModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


def _check_identifier(value: str) -> str:
    if len(value) > _IDENTIFIER_MAX_LENGTH or "\n" in value:
        raise ValueError("identifier is too long or contains line breaks")
    return value


class SafeColumn(_SafeModel):
    name: str
    physical_type: str
    inferred_type: InferredType
    silver_type: SilverType | None = None
    included: bool = True
    is_primary_key: bool = False
    date_format: str | None = None
    decimal_separator: str | None = None
    null_pct: float
    distinct_count: int
    uniqueness: float
    is_unique: bool
    pii_type: PiiType | None = None
    pii_confidence: float | None = None

    _check_name = field_validator("name", "physical_type")(_check_identifier)

    @field_validator("date_format")
    @classmethod
    def _known_format(cls, value: str | None) -> str | None:
        if value is not None and value not in KNOWN_FORMATS:
            raise ValueError("unknown date format")
        return value

    @field_validator("decimal_separator")
    @classmethod
    def _known_separator(cls, value: str | None) -> str | None:
        if value not in (None, ",", "."):
            raise ValueError("unknown decimal separator")
        return value


class SafeSource(_SafeModel):
    name: str
    silver_table: str | None = None
    version: int | None = None
    row_count: int
    columns: list[SafeColumn]
    primary_key: list[str] = Field(default_factory=list)
    candidate_keys: list[list[str]] = Field(default_factory=list)
    duplicate_pct: float
    quality_score: float

    _check_name = field_validator("name", "silver_table")(
        lambda v: v if v is None else _check_identifier(v)
    )


class SafeRelation(_SafeModel):
    """Tables are named by source, as everywhere else in the context and in plans."""

    from_source: str
    from_column: str
    to_source: str
    to_column: str
    cardinality: str
    confidence: float
    inclusion_ratio: float
    status: RelationStatus

    _check_names = field_validator("from_source", "from_column", "to_source", "to_column")(
        _check_identifier
    )

    @field_validator("cardinality")
    @classmethod
    def _known_cardinality(cls, value: str) -> str:
        if value not in ("1-1", "N-1"):
            raise ValueError("unknown cardinality")
        return value


class LLMSafeContext(_SafeModel):
    project_name: str
    architecture: Architecture
    sources: list[SafeSource]
    relations: list[SafeRelation] = Field(default_factory=list)

    _check_name = field_validator("project_name")(_check_identifier)


@dataclass(frozen=True)
class SourceContext:
    """What is known about a source; the plan and table exist once Silver is built."""

    source: Source
    profile: ProfileReport
    plan: TransformationPlan | None = None
    table: SilverTable | None = None


def _profile_column(column: ColumnProfile, *, name: str | None = None) -> dict[str, object]:
    inferred = column.inferred
    return {
        "name": name or column.name,
        "physical_type": column.physical_type,
        "inferred_type": inferred.inferred_type,
        "date_format": inferred.format if inferred.format in KNOWN_FORMATS else None,
        "decimal_separator": inferred.decimal_separator,
        "null_pct": column.null_pct,
        "distinct_count": column.distinct_count,
        "uniqueness": column.uniqueness,
        "is_unique": column.is_unique,
        "pii_type": column.pii.pii_type if column.pii else None,
        "pii_confidence": column.pii.confidence if column.pii else None,
    }


def _safe_source(item: SourceContext) -> SafeSource:
    profile, plan = item.profile, item.plan
    by_name = {c.name: c for c in profile.columns}
    columns: list[SafeColumn] = []
    primary_key: list[str] = []
    if plan is None:
        columns = [SafeColumn(**_profile_column(c)) for c in profile.columns]
    else:
        keys = {c.source_column for c in plan.key_columns()}
        primary_key = [c.target_column for c in plan.key_columns()]
        for column in plan.columns:
            stats = by_name.get(column.source_column)
            if stats is None:
                continue
            fields = _profile_column(stats, name=column.target_column)
            fields.update(
                silver_type=column.target_type,
                included=column.included,
                is_primary_key=column.source_column in keys,
                pii_type=column.pii_type,
            )
            columns.append(SafeColumn(**fields))
    rename = {c.source_column: c.target_column for c in plan.columns} if plan else {}
    return SafeSource(
        name=item.source.name,
        silver_table=item.table.name if item.table else None,
        version=profile.version,
        row_count=profile.row_count,
        columns=columns,
        primary_key=primary_key,
        candidate_keys=[[rename.get(c, c) for c in k.columns] for k in profile.candidate_keys],
        duplicate_pct=profile.duplicates.duplicate_pct,
        quality_score=profile.quality.score,
    )


def _safe_relation(relation: Relation) -> SafeRelation:
    return SafeRelation(
        from_source=relation.from_source,
        from_column=relation.from_column,
        to_source=relation.to_source,
        to_column=relation.to_column,
        cardinality=relation.cardinality,
        confidence=relation.confidence,
        inclusion_ratio=relation.inclusion_ratio,
        status=relation.status,
    )


def build_safe_context(
    project: Project,
    sources: Sequence[SourceContext | tuple[Source, ProfileReport]],
    relations: Sequence[Relation] = (),
) -> LLMSafeContext:
    items = [s if isinstance(s, SourceContext) else SourceContext(*s) for s in sources]
    return LLMSafeContext(
        project_name=project.name,
        architecture=project.architecture,
        sources=[_safe_source(item) for item in items],
        relations=[_safe_relation(r) for r in relations if r.status is not RelationStatus.REJECTED],
    )


def serialize_for_llm(context: LLMSafeContext) -> str:
    """The single serialization path for data-derived content sent to a provider."""
    if not isinstance(context, LLMSafeContext):
        raise TypeError("only an LLMSafeContext can be serialized for a language model")
    return context.model_dump_json(exclude_none=True)
