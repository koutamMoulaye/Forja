"""Users, roles and the permission matrix.

A user has a role per project. The instance administrator (created at first start)
acts as ``admin`` on every project. Every API route checks one :class:`Action`
against :data:`ROLE_ACTIONS`; the same matrix is documented in docs/security.md and a
test keeps both in sync.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from forja_core.pagination import Page


class Role(StrEnum):
    ADMIN = "admin"
    ENGINEER = "engineer"
    ANALYST = "analyst"


class Action(StrEnum):
    PROJECT_READ = "project.read"
    PROJECT_MANAGE = "project.manage"
    AUDIT_READ = "audit.read"
    SOURCE_READ = "source.read"
    SOURCE_WRITE = "source.write"
    BRONZE_PREVIEW = "bronze.preview"
    SILVER_READ = "silver.read"
    PLAN_WRITE = "plan.write"
    RELATION_READ = "relation.read"
    RELATION_WRITE = "relation.write"
    GOLD_PLAN_READ = "gold_plan.read"
    GOLD_PLAN_WRITE = "gold_plan.write"
    RUN_READ = "run.read"
    RUN_WRITE = "run.write"
    GOLD_READ = "gold.read"
    TABLE_PUBLISH = "table.publish"
    DATA_UNMASKED = "data.unmasked"
    SEMANTIC_READ = "semantic.read"
    SEMANTIC_WRITE = "semantic.write"
    SYNONYM_PROPOSE = "synonym.propose"
    SYNONYM_REVIEW = "synonym.review"
    MART_REQUEST = "mart.request"
    MART_READ_ALL = "mart.read_all"
    MART_APPROVE = "mart.approve"
    CONNECTION_MANAGE = "connection.manage"


ACTION_DESCRIPTIONS: dict[Action, str] = {
    Action.PROJECT_READ: "Voir le projet",
    Action.PROJECT_MANAGE: "Gérer les membres et les invitations",
    Action.AUDIT_READ: "Lire le journal d'audit",
    Action.SOURCE_READ: "Voir les sources, versions et profils",
    Action.SOURCE_WRITE: "Charger un fichier (nouvelle source ou version)",
    Action.BRONZE_PREVIEW: "Aperçu Bronze en clair (si FORJA_ALLOW_BRONZE_PREVIEW)",
    Action.SILVER_READ: "Voir les plans Silver et les tables Silver",
    Action.PLAN_WRITE: "Modifier et approuver un plan Silver",
    Action.RELATION_READ: "Voir les relations",
    Action.RELATION_WRITE: "Détecter, déclarer, confirmer, rejeter une relation",
    Action.GOLD_PLAN_READ: "Voir le plan Gold",
    Action.GOLD_PLAN_WRITE: "Proposer, modifier, approuver le plan Gold",
    Action.RUN_READ: "Voir tous les runs et leurs logs",
    Action.RUN_WRITE: "Lancer ou annuler un run (builds, exports)",
    Action.GOLD_READ: "Lire, prévisualiser, exporter les tables Gold",
    Action.TABLE_PUBLISH: "Publier ou retirer une table du serving",
    Action.DATA_UNMASKED: "Voir les données selon le plan (sinon pseudonymisation forcée)",
    Action.SEMANTIC_READ: "Lire la couche sémantique",
    Action.SEMANTIC_WRITE: "Éditer et régénérer la couche sémantique",
    Action.SYNONYM_PROPOSE: "Proposer un synonyme",
    Action.SYNONYM_REVIEW: "Valider ou refuser un synonyme proposé",
    Action.MART_REQUEST: "Interroger l'agent, gérer ses propres data marts",
    Action.MART_READ_ALL: "Voir les data marts de tous les utilisateurs",
    Action.MART_APPROVE: "Approuver ou rejeter un data mart",
    Action.CONNECTION_MANAGE: "Gérer les connexions, leurs chargements et planifications",
}

_ANALYST = frozenset(
    {
        Action.PROJECT_READ,
        Action.GOLD_READ,
        Action.SEMANTIC_READ,
        Action.SYNONYM_PROPOSE,
        Action.MART_REQUEST,
    }
)
_ENGINEER = _ANALYST | {
    Action.SOURCE_READ,
    Action.SOURCE_WRITE,
    Action.SILVER_READ,
    Action.PLAN_WRITE,
    Action.RELATION_READ,
    Action.RELATION_WRITE,
    Action.GOLD_PLAN_READ,
    Action.GOLD_PLAN_WRITE,
    Action.RUN_READ,
    Action.RUN_WRITE,
    Action.TABLE_PUBLISH,
    Action.DATA_UNMASKED,
    Action.SEMANTIC_WRITE,
    Action.SYNONYM_REVIEW,
    Action.MART_READ_ALL,
    Action.MART_APPROVE,
    Action.CONNECTION_MANAGE,
}

ROLE_ACTIONS: dict[Role, frozenset[Action]] = {
    Role.ANALYST: _ANALYST,
    Role.ENGINEER: frozenset(_ENGINEER),
    Role.ADMIN: frozenset(Action),
}


def allowed(role: Role | None, action: Action) -> bool:
    return role is not None and action in ROLE_ACTIONS[role]


def _normalize_email(value: str) -> str:
    email = value.strip().lower()
    local, at, domain = email.partition("@")
    if not (local and at and "." in domain) or len(email) > 254:
        raise ValueError("invalid email address")
    return email


class User(BaseModel):
    id: str
    email: str
    name: str | None = Field(default=None, description="Name shown in the interface")
    is_admin: bool = Field(default=False, description="Instance administrator")
    must_change_password: bool = False
    disabled: bool = False
    identity_provider: str = Field(default="password", description="password, or a future oidc")
    created_at: datetime


class Membership(BaseModel):
    project_id: str
    user_id: str
    email: str = ""
    role: Role
    created_at: datetime


class Principal(BaseModel):
    """The authenticated caller of a request."""

    user: User
    via: Literal["password", "api_key"]
    session_id: str | None = None
    api_key_id: str | None = None
    roles: dict[str, Role] = Field(default_factory=dict, description="Role by project id")

    @property
    def id(self) -> str:
        return self.user.id

    def role(self, project_id: str) -> Role | None:
        if self.user.is_admin:
            return Role.ADMIN
        return self.roles.get(project_id)

    def can(self, project_id: str, action: Action) -> bool:
        return allowed(self.role(project_id), action)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(description="Lifetime of the access token, in seconds")
    must_change_password: bool = False


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str
    password: str = Field(min_length=1, max_length=1024)

    _email = field_validator("email")(lambda v: v.strip().lower())


class RefreshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refresh_token: str


class PasswordChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str
    new_password: str = Field(max_length=1024)


class ApiKey(BaseModel):
    id: str
    user_id: str
    name: str
    prefix: str = Field(description="Shown to recognize the key; the secret is never stored")
    created_at: datetime
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None


class ApiKeyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)


class CreatedApiKey(ApiKey):
    key: str = Field(description="The full key, shown once")


class InvitationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str
    role: Role

    _email = field_validator("email")(_normalize_email)


class Invitation(BaseModel):
    id: str
    project_id: str
    email: str
    role: Role
    invited_by: str
    created_at: datetime
    expires_at: datetime
    accepted_at: datetime | None = None
    revoked_at: datetime | None = None
    token: str | None = Field(default=None, description="Registration token, shown once")


class Registration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str
    password: str = Field(max_length=1024)
    name: str | None = Field(default=None, max_length=120)


class InvitationLookup(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(max_length=200)


class InvitationStatus(BaseModel):
    """What a registration link leads to, before the account is created."""

    status: Literal["valid", "expired", "revoked", "used", "unknown"]
    email: str | None = None
    role: Role | None = None
    project_name: str | None = None
    expires_at: datetime | None = None


class MembershipUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Role


SYSTEM_USER = "système"
"""How an entry without a user (bootstrap, scheduled work) is filtered and listed."""


class AuditQuery(BaseModel):
    action: str | None = None
    user: str | None = Field(default=None, description=f"An email, or « {SYSTEM_USER} »")
    object_type: str | None = None
    since: datetime | None = None
    text: str | None = Field(default=None, description="Words found in the entry")


class AuditFacets(BaseModel):
    users: list[str] = Field(default_factory=list)
    actions: list[str] = Field(default_factory=list)
    objects: list[str] = Field(default_factory=list)


class AuditEntry(BaseModel):
    id: str
    at: datetime
    user_id: str | None = None
    user_email: str | None = None
    action: str = Field(description="What happened, e.g. source.upload, gold_plan.approve")
    project_id: str | None = None
    object_type: str | None = None
    object_id: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class AuditPage(Page[AuditEntry]):
    facets: AuditFacets = Field(description="Filter values over the whole log")
