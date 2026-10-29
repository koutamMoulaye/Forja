"""DuckDB connections opened by Forja, with the instance's resource settings.

Every connection, in memory or on a warehouse file, gets the same ``memory_limit``,
``threads`` and ``temp_directory``: large sorts, joins and aggregations spill to disk
instead of taking the machine's memory. DuckDB refuses to open one file twice in a
process with different settings, which a single configuration also avoids.
"""

from __future__ import annotations

import tempfile
import threading
from pathlib import Path

import duckdb

from forja_core.config import Settings

_lock = threading.Lock()
_config: dict[str, str] = {}


def resource_config(settings: Settings) -> dict[str, str]:
    return {
        "memory_limit": settings.duckdb_memory_limit.replace(" ", ""),
        "threads": str(settings.duckdb_threads),
        "temp_directory": str(settings.duckdb_temp_path.resolve()),
    }


def configure(settings: Settings) -> dict[str, str]:
    """Apply the settings to the connections opened from now on."""
    config = resource_config(settings)
    Path(config["temp_directory"]).mkdir(parents=True, exist_ok=True)
    with _lock:
        _config.clear()
        _config.update(config)
    return dict(config)


def current_config() -> dict[str, str]:
    with _lock:
        if _config:
            return dict(_config)
    # Not configured (scripts, unit tests): defaults, spilling to the system temp folder.
    fields = Settings.model_fields
    return {
        "memory_limit": str(fields["duckdb_memory_limit"].default),
        "threads": str(fields["duckdb_threads"].default),
        "temp_directory": str(Path(tempfile.gettempdir()) / "forja-duckdb"),
    }


def connect(
    database: str | Path = ":memory:", *, read_only: bool = False
) -> duckdb.DuckDBPyConnection:
    config: dict[str, str | bool | int | float | list[str]] = dict(current_config())
    return duckdb.connect(str(database), read_only=read_only, config=config)
