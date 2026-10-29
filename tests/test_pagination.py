"""Pages of runs, data marts and audit; the latest versions of a request in lists."""

from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from forja_api.state import AppState
from forja_core.agent.models import MartIteration, MartPreview, MartRequest, latest_versions
from forja_core.auth.models import User
from forja_core.config import Settings
from forja_core.jobs.models import JobType, RunRequest
from forja_core.utils import utcnow
from tests.auth import api_client


def _state(client: TestClient) -> AppState:
    state: AppState = client.app.state.forja  # type: ignore[attr-defined]
    return state


def test_runs_come_by_page(settings: Settings) -> None:
    with api_client(settings.model_copy(update={"job_runner": "inline"})) as client:
        project = client.post("/projects", json={"name": "Pages"}).json()
        state = _state(client)
        created = [
            state.executor.create(project["id"], RunRequest(type=JobType.EXPORT)).id
            for _ in range(5)
        ]
        first = client.get(f"/projects/{project['id']}/runs", params={"limit": 2}).json()
        assert first["total"] == 5 and first["limit"] == 2 and len(first["items"]) == 2
        rest = client.get(
            f"/projects/{project['id']}/runs", params={"limit": 10, "offset": 2}
        ).json()
        ids = [r["id"] for r in first["items"] + rest["items"]]
        assert sorted(ids) == sorted(created) and len(set(ids)) == 5
        assert (
            client.get(f"/projects/{project['id']}/runs", params={"limit": 500}).status_code == 422
        )


def _iteration(version: int, status: str) -> MartIteration:
    return MartIteration(
        version=version,
        kind="refinement" if version > 1 else "question",
        instruction=f"v{version}",
        status=status,  # type: ignore[arg-type]
        created_at=utcnow(),
    )


def test_lists_keep_the_latest_versions_of_a_request() -> None:
    preview = MartPreview(row_count=1, columns=[], rows=[])
    previewed = _iteration(2, "previewed").model_copy(update={"preview": preview})
    request = MartRequest(
        id="m", project_id="p", owner_id="u", question="q",
        iterations=[_iteration(1, "previewed"), previewed, _iteration(3, "clarification")],
        created_at=utcnow(), updated_at=utcnow(),
    )  # fmt: skip
    kept = latest_versions(request)
    # The question in progress, and the preview the lists still show.
    assert [i.version for i in kept.iterations] == [2, 3]
    assert [
        i.version
        for i in latest_versions(kept.model_copy(update={"iterations": [previewed]})).iterations
    ] == [2]


def test_audit_is_filtered_and_paged_by_the_api(settings: Settings) -> None:
    with api_client(settings) as client:
        project = client.post("/projects", json={"name": "Journal"}).json()
        auth = _state(client).auth
        someone = User(id="u1", email="ana@exemple.fr", created_at=utcnow())
        for index in range(4):
            auth.audit(
                someone,
                "table.export",
                project_id=project["id"],
                object_type="table",
                object_id=f"t{index}",
                details={"filename": f"ventes_{index}.csv"},
            )
        auth.audit(None, "semantic.regenerate", project_id=project["id"])

        url = f"/projects/{project['id']}/audit"
        page = client.get(url, params={"limit": 3}).json()
        assert len(page["items"]) == 3 and page["total"] >= 6  # project.create too
        assert page["facets"]["users"][0] == "ana@exemple.fr"
        assert "système" in page["facets"]["users"] and "table" in page["facets"]["objects"]

        by_user = client.get(url, params={"user": "ana@exemple.fr", "limit": 2, "offset": 2}).json()
        assert by_user["total"] == 4 and len(by_user["items"]) == 2
        system = client.get(url, params={"user": "système"}).json()["items"]
        assert [e["action"] for e in system] == ["semantic.regenerate"]
        text = client.get(url, params={"text": "VENTES_2"}).json()["items"]
        assert [e["object_id"] for e in text] == ["t2"]
        later = (utcnow() + timedelta(hours=1)).isoformat()
        assert client.get(url, params={"since": later}).json()["total"] == 0
        assert (
            client.get(url, params={"object_type": "table", "action": "table.export"}).json()[
                "total"
            ]
            == 4
        )
