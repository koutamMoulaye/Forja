"""Command line: ``uv run python -m tests.agent_eval [--provider ollama] [--subset]``.

The mocked model is the default (no network, deterministic). With a real provider
the model settings come from FORJA_LLM_* (or --model); the LLM cache is disabled so
that durations and tokens are measured for every question.
"""

from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path

from forja_core.config import Settings
from forja_llm import LLMSettings, ProviderName, get_provider
from tests.agent_eval.cases import CASES, subset
from tests.agent_eval.run import MockAgentProvider, build_eval_shop, run_eval
from tests.fixtures import ecommerce


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", default="mock", choices=["mock", *ProviderName])
    parser.add_argument("--model", default=None)
    parser.add_argument("--subset", action="store_true", help="the 5 representative questions")
    parser.add_argument("--output", type=Path, default=None, help="write the report as JSON")
    args = parser.parse_args(argv)

    # The shop is built without the developer's .env (heuristic Gold plan); the model
    # under evaluation is configured explicitly below.
    Settings.model_config["env_file"] = None
    cases = subset() if args.subset else CASES
    if args.provider == "mock":
        provider = MockAgentProvider(cases)
        label = "fournisseur simulé"
    else:
        settings = LLMSettings(provider=ProviderName(args.provider), cache=False)
        LLMSettings.model_config["env_file"] = None
        if args.model:
            settings = settings.model_copy(update={"model": args.model})
        provider = get_provider(settings)  # type: ignore[assignment]
        assert provider is not None
        label = f"{args.provider}/{provider.model}"
    LLMSettings.model_config["env_file"] = None
    if not all((ecommerce.DIRECTORY / n).exists() for n in ecommerce.FILES):
        ecommerce.generate()
    with tempfile.TemporaryDirectory(prefix="forja_eval_") as root:
        state, project = build_eval_shop(Path(root), ecommerce.DIRECTORY)
        try:
            report = run_eval(state, project, provider, cases, label=label, echo=True)
        finally:
            state.close()
    print()
    print(report.render())
    if args.output:
        args.output.write_text(report.to_json(), encoding="utf-8")
    return 0 if report.score == 1 else 1


if __name__ == "__main__":
    sys.exit(main())
