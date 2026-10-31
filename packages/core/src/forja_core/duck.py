"""DuckDB connections opened by Forja, with the instance's resource settings.

Every connection, in memory or on a warehouse file, gets the same ``memory_limit``,
``threads`` and ``temp_directory``: large sorts, joins and aggregations spill to disk
instead of taking the machine's memory. DuckDB refuses to open one file twice in a
process with different settings, which a single configuration also avoids.

``memory_limit`` defaults to ``auto``: half the memory available when the API starts,
the container's limit included, between 1 GB and 16 GB. A fixed value overrides it.
"""

from __future__ import annotations

import tempfile
import threading
from pathlib import Path

import duckdb
import psutil

from forja_core.config import Settings

_lock = threading.Lock()
_config: dict[str, str] = {}

AUTO_SHARE = 0.5
AUTO_MIN_MB = 1024
AUTO_MAX_MB = 16 * 1024
# cgroup v2, then v1: the memory a container may use, and what it uses.
_CGROUP_FILES = (
    ("/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory.current"),
    (
        "/sys/fs/cgroup/memory/memory.limit_in_bytes",
        "/sys/fs/cgroup/memory/memory.usage_in_bytes",
    ),
)


def _read_bytes(path: str) -> int | None:
    try:
        text = Path(path).read_text(encoding="ascii").strip()
    except OSError:
        return None
    # "max" (v2) or a huge number (v1) means no limit.
    return int(text) if text.isdigit() and int(text) < 1 << 60 else None


def available_memory() -> int:
    """Bytes this process may still take: the machine's, within a container's limit."""
    available = int(psutil.virtual_memory().available)
    for limit_file, usage_file in _CGROUP_FILES:
        limit = _read_bytes(limit_file)
        if limit is not None:
            available = min(available, max(limit - (_read_bytes(usage_file) or 0), 0))
            break
    return available


def memory_limit(setting: str, available: int | None = None) -> str:
    """The DuckDB ``memory_limit`` for a setting: as written, or computed for ``auto``."""
    if setting.strip().lower() != "auto":
        return setting.replace(" ", "")
    free = available_memory() if available is None else available
    mb = int(free * AUTO_SHARE) >> 20
    return f"{min(max(mb, AUTO_MIN_MB), AUTO_MAX_MB)}MB"


def limit_mb(value: str) -> int:
    """A ``memory_limit`` such as 6GB or 4096MB, in MB (percentages are not handled)."""
    units = {"KB": 1 / 1000, "MB": 1, "GB": 1000, "TB": 1000**2}
    units |= {"KiB": 1 / 1024, "MiB": 1, "GiB": 1024, "TiB": 1024**2}
    for unit, factor in sorted(units.items(), key=lambda u: -len(u[0])):
        if value.endswith(unit):
            return int(float(value.removesuffix(unit)) * factor)
    raise ValueError(f"not a memory size: {value}")


def resource_config(settings: Settings) -> dict[str, str]:
    return {
        "memory_limit": memory_limit(settings.duckdb_memory_limit),
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
        "memory_limit": memory_limit(str(fields["duckdb_memory_limit"].default)),
        "threads": str(fields["duckdb_threads"].default),
        "temp_directory": str(Path(tempfile.gettempdir()) / "forja-duckdb"),
    }


def connect(
    database: str | Path = ":memory:", *, read_only: bool = False
) -> duckdb.DuckDBPyConnection:
    config: dict[str, str | bool | int | float | list[str]] = dict(current_config())
    return duckdb.connect(str(database), read_only=read_only, config=config)
