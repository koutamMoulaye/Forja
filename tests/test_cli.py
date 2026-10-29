"""``forja init``: the administrator of a first start, shown once and never logged."""

from __future__ import annotations

import re

import pytest

from forja_api import cli
from forja_core.catalog import Catalog
from forja_core.config import Settings


def test_init_creates_the_administrator_once(
    settings: Settings, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(cli, "get_settings", lambda: settings)
    assert cli.main(["init"]) == 0
    out = capsys.readouterr()
    found = re.search(r"mot de passe\s+(\S+)", out.out)
    assert found is not None and "admin@forja.local" in out.out
    assert found.group(1) not in out.err  # printed once, not logged

    with Catalog(settings.catalog_path) as catalog:
        [admin] = catalog.list_users()
        assert admin.is_admin and admin.must_change_password

    assert cli.main(["init"]) == 0
    assert "déjà initialisé" in capsys.readouterr().out
