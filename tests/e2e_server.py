"""The API of the web end-to-end tests: ``forja serve`` whose business agent talks to a
simulated language model, so that the questions the parser cannot handle alone take the
deep path (« Analyse approfondie ») without any provider, key or network.

The simulated model answers the questions of ``ANSWERS`` as a well-behaved model would,
after ``FORJA_E2E_LLM_DELAY_SECONDS`` (a long job the interface must follow), and refuses
anything else. Only the agent is simulated: the Gold proposal keeps its heuristics.

    uv run python -m tests.e2e_server
"""

from __future__ import annotations

import os
import re
import time
from typing import Any

from forja_api import main
from forja_api.state import AppState
from forja_core.agent.spec import AgentAnswer, MartFilter, MartSpec
from forja_llm.agent import LLMMartInterpreter
from forja_llm.base import Completion, LLMProvider
from forja_llm.settings import LLMSettings

_REQUEST = re.compile(r"^Request: (.*)$", re.MULTILINE)

ANSWERS: dict[str, AgentAnswer] = {
    "chiffre d'affaires par ville des clients pro": AgentAnswer(
        kind="mart",
        mart=MartSpec(
            metrics=["montant"],
            axes=["client.ville"],
            filters=[MartFilter(field="client.segment", value="professionnel")],
            name="ca_par_ville_clients_pro",
        ),
    ),
}
REFUSAL = AgentAnswer(
    kind="refusal",
    refusal_reason="Cette demande ne porte pas sur les données de ce projet (ventes, clients, "
    "produits).",
)


class SimulatedAgentModel(LLMProvider):
    name = "simulated"

    def __init__(self, delay_seconds: float) -> None:
        super().__init__(LLMSettings(model="simulated", max_attempts=1, cache=False))
        self.delay_seconds = delay_seconds

    def _complete(
        self, *, system: str, prompt: str, response_schema: dict[str, Any], schema_name: str
    ) -> Completion:
        time.sleep(self.delay_seconds)
        match = _REQUEST.search(prompt)
        question = match.group(1).strip().lower().replace(chr(0x2019), "'") if match else ""
        answer = ANSWERS.get(question, REFUSAL)
        text = answer.model_dump_json(exclude_none=True)
        return Completion(text, round(len(system + prompt) / 3.2), round(len(text) / 3.2))


def _simulate(state: AppState) -> None:
    delay = float(os.environ.get("FORJA_E2E_LLM_DELAY_SECONDS", "4"))
    state.marts.interpreter = LLMMartInterpreter(SimulatedAgentModel(delay))


def install() -> None:
    """Every application state built from now on talks to the simulated model."""
    build, configure = AppState.build, AppState.configure_llm

    def built(settings: Any) -> AppState:
        state = build(settings)
        _simulate(state)
        return state

    def configured(self: AppState) -> None:
        configure(self)
        _simulate(self)

    AppState.build = staticmethod(built)  # type: ignore[method-assign,assignment]
    AppState.configure_llm = configured  # type: ignore[method-assign]


if __name__ == "__main__":
    install()
    main.run()
