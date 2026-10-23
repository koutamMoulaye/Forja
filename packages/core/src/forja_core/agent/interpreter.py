"""The seam between the agent and a language model (implemented in forja_llm)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from forja_core.agent.preselect import Preselection
from forja_core.agent.spec import AgentAnswer, MartSpec


@dataclass(frozen=True)
class InterpretRequest:
    """Only the request and the pre-selected semantic elements: no value of the data."""

    project_id: str
    project_name: str
    instruction: str
    selection: Preselection
    today: str
    base: MartSpec | None = None
    bindings: dict[str, str] = field(default_factory=dict)
    # What the parser recognized locally (refs and periods, never a value of the data).
    hints: list[str] = field(default_factory=list)


class MartInterpreter(Protocol):
    origin: str

    def interpret(self, request: InterpretRequest) -> AgentAnswer: ...


class InterpretationError(Exception):
    """The model could not answer (unreachable, invalid answers): the user is told."""
