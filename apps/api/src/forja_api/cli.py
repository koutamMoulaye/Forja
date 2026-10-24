"""Command line: ``forja demo``, ``forja openapi``, ``forja serve``.

``forja demo`` works on the configured workspace (FORJA_DATA_DIR): stop the API
first, DuckDB allows a single process on the catalog.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from forja_api.demo import build_demo, demo_settings
from forja_api.state import AppState
from forja_core.config import get_settings
from forja_core.logging import configure_logging

OPENAPI_FILE = Path("docs") / "openapi.json"


def _demo(args: argparse.Namespace) -> int:
    settings = demo_settings(get_settings())
    configure_logging("WARNING", "console")
    state = AppState.build(settings)
    try:
        admin = state.auth.bootstrap()
        result = build_demo(state, reset_passwords=args.reset_passwords)
    finally:
        state.close()
    print(f"Projet « {result.project.name} » ({result.project.id}) prêt.")
    for step in result.steps or ["déjà complet : rien à refaire"]:
        print(f"  - {step}")
    print("Data marts publiés : " + ", ".join(result.marts))
    if admin is not None:
        print(f"Administrateur créé : {admin.email} (mot de passe ci-dessus, dans les logs)")
    if result.created_accounts:
        print("\nComptes de démo (mots de passe affichés une seule fois, notez-les) :")
        for email, password in result.created_accounts.items():
            print(f"  {email:<32} {password}")
    else:
        print("\nComptes de démo déjà créés ; --reset-passwords pour en générer de nouveaux.")
    return 0


def _openapi(args: argparse.Namespace) -> int:
    from forja_api.examples import write_examples
    from forja_api.main import create_app
    from forja_api.openapi import document

    if args.record_examples:
        write_examples()
    text = document(create_app(get_settings()))
    if args.check:
        current = args.output.read_text(encoding="utf-8") if args.output.exists() else ""
        if current != text:
            print(f"{args.output} n'est plus à jour : lancez `forja openapi`", file=sys.stderr)
            return 1
        print(f"{args.output} est à jour")
        return 0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(text, encoding="utf-8")
    print(f"schéma OpenAPI écrit dans {args.output}")
    return 0


def _serve(_args: argparse.Namespace) -> int:
    from forja_api.main import run

    run()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="forja", description="Forja")
    commands = parser.add_subparsers(dest="command", required=True)
    demo = commands.add_parser("demo", help="créer ou compléter le projet « Démo e-commerce »")
    demo.add_argument(
        "--reset-passwords", action="store_true", help="nouveaux mots de passe de démo"
    )
    demo.set_defaults(handler=_demo)
    openapi = commands.add_parser("openapi", help="écrire docs/openapi.json")
    openapi.add_argument("--output", type=Path, default=OPENAPI_FILE)
    openapi.add_argument("--check", action="store_true", help="vérifier sans écrire")
    openapi.add_argument(
        "--record-examples",
        action="store_true",
        help="réenregistrer les exemples de réponse depuis un projet de démo temporaire",
    )
    openapi.set_defaults(handler=_openapi)
    serve = commands.add_parser("serve", help="lancer l'API")
    serve.set_defaults(handler=_serve)
    args = parser.parse_args(argv)
    code: int = args.handler(args)
    return code


if __name__ == "__main__":
    sys.exit(main())
