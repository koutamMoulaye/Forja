"""Child processes die with the API.

dbt runs in a child process that writes the warehouse. Killed without a shutdown (a
crash, the machine cut), the API would leave it running: it would keep the warehouse
open, and writing, while the restarted API builds again.

- Windows: the API process enters a job object closed with it; every child it starts
  then belongs to the job, and the system ends them when the API dies.
- Linux: each child asks to be killed when its parent dies (PR_SET_PDEATHSIG).
- Elsewhere (macOS): nothing; an orphan finishes its build, and the next one fails on the
  warehouse lock until it is done.
"""

from __future__ import annotations

import ctypes
import signal
import sys
import threading
from collections.abc import Callable

from forja_core.logging import get_logger

log = get_logger(__name__)

_lock = threading.Lock()
_job: int | None = None
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
