"""Child processes (dbt) are bound to the life of the API: stopped at shutdown, killed
when the API dies. The crash cases need POSIX signals and run in the Linux CI job."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import textwrap
import time
from pathlib import Path

import psutil
import pytest

from forja_core import children

SLEEPER = [sys.executable, "-c", "import time; time.sleep(120)"]


def _gone(pid: int, timeout: float = 10) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if psutil.Process(pid).status() == psutil.STATUS_ZOMBIE:
                return True
        except psutil.NoSuchProcess:
            return True
        time.sleep(0.1)
    return False


def test_shutdown_stops_the_children_still_running() -> None:
    process = children.spawn(SLEEPER, text=True)
    assert process.poll() is None
    assert children.stop_children(timeout=5) == 1
    assert process.wait(timeout=10) is not None
    assert children.stop_children() == 0  # nothing left


def test_a_finished_child_is_released() -> None:
    process = children.spawn([sys.executable, "-c", "pass"], text=True)
    process.wait(timeout=30)
    children.release(process)
    assert children.stop_children() == 0


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX process groups and signals")
@pytest.mark.parametrize("guard", [False, True], ids=["pdeathsig", "guard"])
def test_a_child_dies_with_its_killed_parent(tmp_path: Path, guard: bool) -> None:
    """The API killed without a shutdown: dbt must not survive it. Linux relies on
    PR_SET_PDEATHSIG; the guard (macOS) is tested here too, forced on."""
    if not guard and not sys.platform.startswith("linux"):
        pytest.skip("PR_SET_PDEATHSIG is Linux only")
    pid_file = tmp_path / "child.pid"
    child = (
        f"import os, pathlib, time; pathlib.Path({str(pid_file)!r}).write_text(str(os.getpid()));"
        " time.sleep(120)"
    )
    parent_script = textwrap.dedent(
        f"""
        import sys, time
        from forja_core import children
        children.spawn([sys.executable, "-c", {child!r}], guard={guard}, text=True)
        time.sleep(120)
        """
    )
    parent = subprocess.Popen([sys.executable, "-c", parent_script])
    try:
        deadline = time.monotonic() + 30
        while not pid_file.exists() and time.monotonic() < deadline:
            time.sleep(0.1)
        assert pid_file.exists(), "the child did not start"
        child_pid = int(pid_file.read_text())
        assert not _gone(child_pid, timeout=0.5)
        os.kill(parent.pid, signal.SIGKILL)
        parent.wait(timeout=10)
        assert _gone(child_pid), "the child outlived its parent"
    finally:
        if parent.poll() is None:
            parent.kill()
