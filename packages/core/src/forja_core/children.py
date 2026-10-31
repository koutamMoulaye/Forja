"""Child processes die with the API.

dbt runs in a child process that writes the warehouse. Killed without a shutdown (a
crash, the machine cut), the API would leave it running: it would keep the warehouse
open, and writing, while the restarted API builds again.

- Windows: the API process enters a job object closed with it; every child it starts
  then belongs to the job, and the system ends them when the API dies.
- Linux: each child asks to be killed when its parent dies (PR_SET_PDEATHSIG).
- Elsewhere (macOS): the child runs under a guard, ``python -m forja_core.children``,
  which watches the API and kills the child's process group when the API is gone.

On every POSIX system a child leads its own process group, and :func:`stop_children`
ends the groups still running when the API shuts down.
"""

from __future__ import annotations

import ctypes
import os
import signal
import subprocess
import sys
import threading
import time
from collections.abc import Callable, Sequence
from typing import Any

from forja_core.logging import get_logger

log = get_logger(__name__)

_lock = threading.Lock()
_job: int | None = None
_running: set[subprocess.Popen[str]] = set()
# POSIX only, looked up so that type checkers on Windows keep these branches.
_killpg: Callable[[int, int], None] = getattr(os, "killpg", lambda _pgid, _sig: None)
_getpgrp: Callable[[], int] = getattr(os, "getpgrp", os.getpid)
GUARD_POLL_SECONDS = 0.5
# Read once, as a plain string: type checkers would drop the other platforms' branches.
_PLATFORM: str = sys.platform

# Windows constants (winnt.h).
_JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9
_JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
# Linux constant (prctl.h).
_PR_SET_PDEATHSIG = 1
_SIGKILL = int(getattr(signal, "SIGKILL", 9))


class _BasicLimits(ctypes.Structure):
    _fields_ = [
        ("PerProcessUserTimeLimit", ctypes.c_int64),
        ("PerJobUserTimeLimit", ctypes.c_int64),
        ("LimitFlags", ctypes.c_uint32),
        ("MinimumWorkingSetSize", ctypes.c_size_t),
        ("MaximumWorkingSetSize", ctypes.c_size_t),
        ("ActiveProcessLimit", ctypes.c_uint32),
        ("Affinity", ctypes.c_size_t),
        ("PriorityClass", ctypes.c_uint32),
        ("SchedulingClass", ctypes.c_uint32),
    ]


class _IoCounters(ctypes.Structure):
    _fields_ = [
        (name, ctypes.c_uint64)
        for name in (
            "ReadOperationCount",
            "WriteOperationCount",
            "OtherOperationCount",
            "ReadTransferCount",
            "WriteTransferCount",
            "OtherTransferCount",
        )
    ]


class _ExtendedLimits(ctypes.Structure):
    _fields_ = [
        ("BasicLimitInformation", _BasicLimits),
        ("IoInfo", _IoCounters),
        ("ProcessMemoryLimit", ctypes.c_size_t),
        ("JobMemoryLimit", ctypes.c_size_t),
        ("PeakProcessMemoryUsed", ctypes.c_size_t),
        ("PeakJobMemoryUsed", ctypes.c_size_t),
    ]


def bind_children() -> None:
    """Windows: put this process in a job closed with it (once). No effect elsewhere."""
    global _job
    if _PLATFORM != "win32":
        return
    with _lock:
        if _job is not None:
            return
        # One calling convention on 64-bit Windows: CDLL reaches kernel32 on every platform
        # a type checker runs on.
        kernel32 = ctypes.CDLL("kernel32", use_last_error=True)
        kernel32.CreateJobObjectW.restype = ctypes.c_void_p
        kernel32.GetCurrentProcess.restype = ctypes.c_void_p
        kernel32.SetInformationJobObject.argtypes = [
            ctypes.c_void_p,
            ctypes.c_int,
            ctypes.c_void_p,
            ctypes.c_uint32,
        ]
        kernel32.AssignProcessToJobObject.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        job = kernel32.CreateJobObjectW(None, None)
        limits = _ExtendedLimits()
        limits.BasicLimitInformation.LimitFlags = _JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        bound = (
            job
            and kernel32.SetInformationJobObject(
                job,
                _JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
                ctypes.byref(limits),
                ctypes.sizeof(limits),
            )
            and kernel32.AssignProcessToJobObject(job, kernel32.GetCurrentProcess())
        )
        if not bound:
            # A parent job refusing nested ones: children may outlive a crash.
            log.warning("children_not_bound", error=getattr(ctypes, "get_last_error", int)())
            _job = 0
            return
        _job = job


def child_setup() -> Callable[[], None] | None:
    """Linux: the ``preexec_fn`` that has a child killed with its parent."""
    if not _PLATFORM.startswith("linux"):
        return None
    libc = ctypes.CDLL(None, use_errno=True)

    def die_with_parent() -> None:
        libc.prctl(_PR_SET_PDEATHSIG, _SIGKILL)

    return die_with_parent


def needs_guard() -> bool:
    """POSIX systems without PR_SET_PDEATHSIG (macOS): the child runs under a guard."""
    return _PLATFORM != "win32" and not _PLATFORM.startswith("linux")


def spawn(
    command: Sequence[str], *, guard: bool | None = None, **kwargs: Any
) -> subprocess.Popen[str]:
    """Start a child bound to the life of this process (see the module docstring).

    Text-mode keyword arguments are passed on to :class:`subprocess.Popen`; ``guard``
    forces the guard on or off (tests)."""
    bind_children()
    argv = list(command)
    guarded = guard if guard is not None else needs_guard()
    if guarded:
        argv = [sys.executable, "-m", "forja_core.children", str(os.getpid()), "--", *argv]
    if _PLATFORM != "win32":
        kwargs["start_new_session"] = True
        # A guard outlives the API long enough to kill its group; it binds its own child.
        kwargs["preexec_fn"] = None if guarded else child_setup()
    process: subprocess.Popen[str] = subprocess.Popen(argv, **kwargs)
    with _lock:
        _running.add(process)
    return process


def release(process: subprocess.Popen[str]) -> None:
    """Forget a child that has exited."""
    with _lock:
        _running.discard(process)


def _kill(process: subprocess.Popen[str], sig: int) -> None:
    try:
        if _PLATFORM == "win32":
            process.kill() if sig == _SIGKILL else process.terminate()
        else:
            _killpg(process.pid, sig)  # the child leads its group
    except (ProcessLookupError, PermissionError, OSError):
        pass


def stop_children(timeout: float = 5) -> int:
    """End the children still running (API shutdown): SIGTERM, then SIGKILL."""
    with _lock:
        running = [p for p in _running if p.poll() is None]
        _running.clear()
    for process in running:
        _kill(process, int(signal.SIGTERM))
    deadline = time.monotonic() + timeout
    for process in running:
        try:
            process.wait(timeout=max(deadline - time.monotonic(), 0.1))
        except subprocess.TimeoutExpired:
            _kill(process, _SIGKILL)
    if running:
        log.warning("children_stopped", count=len(running))
    return len(running)


def _guard(parent: int, command: list[str]) -> int:
    """Run ``command`` in this process group; kill the group once ``parent`` is gone."""
    child = subprocess.Popen(command, preexec_fn=child_setup())  # killed with the guard

    def end(*_: object) -> None:
        _killpg(_getpgrp(), _SIGKILL)

    signal.signal(signal.SIGTERM, end)
    while child.poll() is None:
        if os.getppid() != parent:  # reparented: the API died
            end()
        time.sleep(GUARD_POLL_SECONDS)
    return child.returncode


if __name__ == "__main__":
    _parent, _separator, *_command = sys.argv[1:]
    sys.exit(_guard(int(_parent), _command))
