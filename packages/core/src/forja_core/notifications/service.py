"""Who is told what: runs that end, plans to review, data marts to approve or decided,
agent and model proposals that are ready. Each notification is stored for its user and
pushed at once to their open event streams, as are the run status changes."""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from forja_core.agent.models import MartRequest
from forja_core.auth.models import Action, Role
from forja_core.catalog import Catalog
from forja_core.jobs.models import Job, JobStatus, JobType
from forja_core.logging import get_logger
from forja_core.notifications.bus import Event, EventBus
from forja_core.notifications.models import (
    Notification,
    NotificationAction,
    NotificationKind,
    TargetType,
)
from forja_core.utils import utcnow

log = get_logger(__name__)

_RUN_TEXT: dict[JobType, tuple[str, str]] = {
    JobType.PROFILE: ("Profilage terminé", "Échec du profilage"),
    JobType.BUILD_SILVER: ("Nettoyage terminé", "Échec du nettoyage"),
    JobType.BUILD_GOLD: ("Modèle construit", "Échec de la construction du modèle"),
    JobType.EXPORT: ("Export terminé", "Échec de l'export"),
    JobType.BUILD_ALL: ("Run complet terminé", "Échec du run complet"),
    JobType.GOLD_PROPOSAL: ("Modèle en étoile proposé", "Échec de la proposition du modèle"),
    JobType.MART_REQUEST: ("Data mart préparé", "Échec de la préparation du data mart"),
    JobType.PUBLISH_MART: ("Data mart publié", "Échec de la publication du data mart"),
}


def _duration(job: Job) -> str:
    seconds = job.metrics.duration_seconds if job.metrics else None
    if seconds is None:
        return ""
    if seconds < 60:
        return f"En {max(1, round(seconds))} s"
    return f"En {round(seconds / 60)} min"


class NotificationService:
    def __init__(self, catalog: Catalog, bus: EventBus) -> None:
        self.catalog = catalog
        self.bus = bus

    # --- Delivery ----------------------------------------------------------------------

    def notify(
        self,
        users: Iterable[str],
        *,
        project_id: str | None,
        kind: NotificationKind,
        title: str,
        detail: str = "",
        action: NotificationAction | None = None,
    ) -> list[Notification]:
        sent = []
        for user_id in dict.fromkeys(u for u in users if u):
            notification = Notification(
                id=uuid.uuid4().hex,
                user_id=user_id,
                project_id=project_id,
                kind=kind,
                title=title,
                detail=detail,
                action=action,
                created_at=utcnow(),
            )
            self.catalog.add_notification(notification)
            self.bus.publish(
                Event("notification", notification.model_dump(mode="json"), user_id=user_id)
            )
            sent.append(notification)
        return sent

    def engineers(self, project_id: str, *, besides: str | None = None) -> list[str]:
        """Who may approve and review in the project: its engineers and admins, and the
        instance administrators."""
        members = [
            m.user_id
            for m in self.catalog.list_memberships(project_id)
            if m.role in (Role.ENGINEER, Role.ADMIN)
        ]
        admins = [u.id for u in self.catalog.list_users() if u.is_admin and not u.disabled]
        return [u for u in dict.fromkeys([*members, *admins]) if u != besides]

    # --- Runs --------------------------------------------------------------------------

    def job_changed(self, job: Job) -> None:
        """A run was queued, started, progressed or ended: its followers update at once."""
        self.bus.publish(
            Event(
                "job",
                job.model_dump(mode="json"),
                project_id=job.project_id,
                action=Action.RUN_READ,
                owner_id=job.created_by,
            )
        )

    def job_finished(self, job: Job) -> None:
        if job.status not in (JobStatus.SUCCEEDED, JobStatus.FAILED):
            return
        try:
            if job.type is JobType.MART_REQUEST:
                self._agent_done(job)
            elif job.type is JobType.PUBLISH_MART:
                self._mart_published(job)
            else:
                self._run_done(job)
        except Exception:
            log.exception("notification_failed", job_id=job.id)

    def _run_done(self, job: Job) -> None:
        done, failed = _RUN_TEXT[job.type]
        ok = job.status is JobStatus.SUCCEEDED
        # A run nobody started (resumed, scheduled) concerns the project's engineers.
        users = [job.created_by] if job.created_by else self.engineers(job.project_id)
        if job.type is JobType.GOLD_PROPOSAL:
            self.notify(
                users,
                project_id=job.project_id,
                kind=NotificationKind.AI_JOB_DONE if ok else NotificationKind.RUN_FAILED,
                title=done if ok else failed,
                detail="Grain, clés et mesures à revoir" if ok else (job.error or ""),
                action=NotificationAction(
                    label="Revoir" if ok else "Voir le run",
                    target_type="gold_plan" if ok else "run",
                    target_id=job.project_id if ok else job.id,
                ),
            )
            return
        self.notify(
            users,
            project_id=job.project_id,
            kind=NotificationKind.RUN_SUCCEEDED if ok else NotificationKind.RUN_FAILED,
            title=done if ok else failed,
            detail=_duration(job) if ok else (job.error or "Le run s'est arrêté."),
            action=NotificationAction(
                label="Voir le run" if ok else "Corriger", target_type="run", target_id=job.id
            ),
        )

    def _request_of(self, job: Job) -> MartRequest | None:
        mart_id = job.params.mart_request_id
        return self.catalog.get_mart_request(mart_id) if mart_id else None

    def _agent_done(self, job: Job) -> None:
        request = self._request_of(job)
        if request is None or request.latest is None:
            return
        latest = request.latest
        target: TargetType = "conversation"
        if latest.status == "previewed":
            title, detail, label = "Aperçu prêt à vérifier", latest.summary or "", "Vérifier"
            target = "mart"
        elif latest.status == "clarification":
            question = latest.clarification.question if latest.clarification else ""
            title, detail, label = "Une question pour vous", question, "Répondre"
        elif latest.status == "refused":
            title, detail, label = "Demande hors périmètre", latest.refusal or "", "Ouvrir"
        else:
            title, detail, label = "Préparation interrompue", latest.error or "", "Ouvrir"
        self.notify(
            [request.owner_id],
            project_id=request.project_id,
            kind=NotificationKind.AI_JOB_DONE,
            title=title,
            detail=detail or request.question,
            action=NotificationAction(label=label, target_type=target, target_id=request.id),
        )

    def _mart_published(self, job: Job) -> None:
        request = self._request_of(job)
        if request is None:
            return
        ok = job.status is JobStatus.SUCCEEDED
        users = [request.owner_id]
        if not ok:
            users += [job.created_by or "", request.approved_by or ""]
        self.notify(
            users,
            project_id=request.project_id,
            kind=NotificationKind.MART_PUBLISHED if ok else NotificationKind.RUN_FAILED,
            title="Data mart publié" if ok else "Échec de la publication du data mart",
            detail=(request.published_name or request.question)
            if ok
            else (job.error or request.question),
            action=NotificationAction(label="Ouvrir", target_type="mart", target_id=request.id),
        )

    # --- Plans and data marts ----------------------------------------------------------

    def plan_to_review(self, project_id: str, source_id: str, source_name: str) -> None:
        self.notify(
            self.engineers(project_id),
            project_id=project_id,
            kind=NotificationKind.PLAN_REVIEW,
            title="Plan de nettoyage à revoir",
            detail=f"{source_name} : règles proposées après le profilage",
            action=NotificationAction(label="Revoir", target_type="source", target_id=source_id),
        )

    def mart_awaits_approval(self, request: MartRequest) -> None:
        self.notify(
            self.engineers(request.project_id, besides=request.owner_id),
            project_id=request.project_id,
            kind=NotificationKind.MART_APPROVAL,
            title="Un data mart attend votre approbation",
            detail=f"{request.owner_email or 'Un analyst'} : {request.question}",
            action=NotificationAction(label="Approuver", target_type="mart", target_id=request.id),
        )

    def mart_approved(self, request: MartRequest) -> None:
        if request.approved_by == request.owner_id:
            return
        self.notify(
            [request.owner_id],
            project_id=request.project_id,
            kind=NotificationKind.MART_APPROVED,
            title="Data mart approuvé",
            detail=f"{request.question} · publication en cours",
            action=NotificationAction(label="Ouvrir", target_type="mart", target_id=request.id),
        )

    def mart_rejected(self, request: MartRequest) -> None:
        self.notify(
            [request.owner_id],
            project_id=request.project_id,
            kind=NotificationKind.MART_REJECTED,
            title="Data mart rejeté",
            detail=request.rejection_reason or request.question,
            action=NotificationAction(label="Ouvrir", target_type="mart", target_id=request.id),
        )
