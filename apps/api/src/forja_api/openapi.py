"""OpenAPI document of the API, in French, with response examples.

Summaries and descriptions are written here, one entry per operation, so that the
generated client of the front reads in French. Response examples are recorded from
the demonstration project (``forja openapi --record-examples``) into
``openapi_examples.json``; ``forja openapi`` writes ``docs/openapi.json``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI

EXAMPLES_FILE = Path(__file__).with_name("openapi_examples.json")

ALL = "Rôles : admin, engineer, analyst."
ENG = "Rôles : admin, engineer."
ADMIN = "Rôle : admin du projet."
INSTANCE = "Réservé à l'administrateur de l'instance."
ANY_USER = "Tout utilisateur authentifié."
PUBLIC = "Public (sans authentification)."

# (method, path) -> (summary, description)
ROUTE_DOCS: dict[tuple[str, str], tuple[str, str]] = {
    ("get", "/health"): ("État du service", f"Version et disponibilité de l'API. {PUBLIC}"),
    # --- Authentification ---------------------------------------------------------
    ("post", "/auth/login"): (
        "Se connecter",
        "Email et mot de passe : renvoie un jeton d'accès (15 min) et un jeton de "
        "rafraîchissement à usage unique. Après plusieurs échecs, le compte et l'adresse IP "
        f"sont verrouillés temporairement (429, en-tête Retry-After). {PUBLIC}",
    ),
    ("post", "/auth/refresh"): (
        "Rafraîchir les jetons",
        "Échange un jeton de rafraîchissement contre une nouvelle paire ; réutiliser un jeton "
        f"déjà utilisé révoque la session. {PUBLIC}",
    ),
    ("post", "/auth/logout"): ("Se déconnecter", f"Révoque la session en cours. {ANY_USER}"),
    ("post", "/auth/password"): (
        "Changer son mot de passe",
        "Obligatoire après la première connexion. Révoque les autres sessions et renvoie une "
        f"nouvelle paire de jetons. {ANY_USER}",
    ),
    ("get", "/auth/me"): (
        "Utilisateur connecté",
        f"Compte, mode d'authentification et rôle dans chaque projet. {ANY_USER}",
    ),
    ("post", "/auth/register"): (
        "Créer son compte depuis une invitation",
        "Jeton d'invitation à usage unique et mot de passe (mode multi). Renvoie une paire de "
        f"jetons. {PUBLIC}",
    ),
    ("get", "/auth/api-keys"): (
        "Lister ses clés API",
        f"Clés API personnelles (préfixe seulement, jamais le secret). {ANY_USER}",
    ),
    ("post", "/auth/api-keys"): (
        "Créer une clé API",
        "La clé complète (fja_…) n'est affichée qu'une fois ; à envoyer en en-tête X-API-Key "
        f"ou Authorization: Bearer. {ANY_USER}",
    ),
    ("delete", "/auth/api-keys/{key_id}"): (
        "Révoquer une clé API",
        f"La clé est refusée immédiatement. {ANY_USER}",
    ),
    ("get", "/auth/users"): ("Lister les utilisateurs", f"Tous les comptes. {INSTANCE}"),
    # --- Projets, membres, audit --------------------------------------------------------
    ("get", "/projects"): ("Lister ses projets", f"Projets dont l'appelant est membre. {ANY_USER}"),
    ("post", "/projects"): (
        "Créer un projet",
        f"Le créateur en devient admin ; le workspace local est créé. {INSTANCE}",
    ),
    ("get", "/projects/{project_id}/members"): ("Lister les membres", f"Membres et rôles. {ADMIN}"),
    ("put", "/projects/{project_id}/members/{user_id}"): (
        "Changer le rôle d'un membre",
        f"Rôles possibles : admin, engineer, analyst. {ADMIN}",
    ),
    ("delete", "/projects/{project_id}/members/{user_id}"): (
        "Retirer un membre",
        f"L'utilisateur perd l'accès au projet. {ADMIN}",
    ),
    ("post", "/projects/{project_id}/invitations"): (
        "Inviter un utilisateur",
        "Mode multi. Un compte existant est ajouté directement ; sinon un jeton d'inscription "
        f"à usage unique est renvoyé une fois. {ADMIN}",
    ),
    ("get", "/projects/{project_id}/invitations"): (
        "Lister les invitations",
        f"Invitations envoyées et acceptées (sans les jetons). {ADMIN}",
    ),
    ("get", "/projects/{project_id}/audit"): (
        "Journal d'audit du projet",
        "Qui a fait quoi, quand, sur quel objet ; filtres action et limit. " + ADMIN,
    ),
    ("get", "/audit"): ("Journal d'audit de l'instance", f"Toutes les entrées. {INSTANCE}"),
    # --- Sources --------------------------------------------------------------------
    ("post", "/projects/{project_id}/sources"): (
        "Charger un fichier",
        "CSV, Excel (une source par feuille), Parquet ou JSON, en multipart (champ file). "
        "Recharger un même nom crée une version ; le fichier est profilé et un plan Silver "
        f"est proposé. {ENG}",
    ),
    ("get", "/projects/{project_id}/sources"): (
        "Lister les sources",
        f"Avec version courante et score qualité. {ENG}",
    ),
    ("post", "/sources/{source_id}/versions"): (
        "Charger une nouvelle version",
        f"Le nom du fichier peut différer ; la dérive de schéma est calculée. {ENG}",
    ),
    ("get", "/sources/{source_id}/versions"): (
        "Versions d'une source",
        f"Chaque version avec sa dérive de schéma (colonnes ajoutées, retirées, retypées). {ENG}",
    ),
    ("get", "/sources/{source_id}"): ("Détail d'une source", f"Version la plus récente. {ENG}"),
    ("get", "/sources/{source_id}/profile"): (
        "Profil d'une source",
        "Types inférés, nulls, cardinalité, clés candidates, doublons, données personnelles, "
        f"score qualité ; dernière version par défaut. {ENG}",
    ),
    ("get", "/sources/{source_id}/preview"): (
        "Aperçu Bronze brut",
        "Lignes brutes, données personnelles en clair : désactivé sauf "
        "FORJA_ALLOW_BRONZE_PREVIEW=true. Rôle : admin du projet.",
    ),
    # --- Plans Silver ------------------------------------------------------------------
    ("get", "/sources/{source_id}/plan"): (
        "Plan Silver",
        f"Dernière version, ou une version donnée ; chaque règle est expliquée. {ENG}",
    ),
    ("patch", "/sources/{source_id}/plan"): (
        "Modifier le plan Silver",
        "Type, nom, règle, exclusion, traitement des données personnelles : crée un "
        f"brouillon. {ENG}",
    ),
    ("get", "/sources/{source_id}/plans"): (
        "Historique du plan Silver",
        f"Toutes les versions. {ENG}",
    ),
    ("post", "/sources/{source_id}/plan/approve"): (
        "Approuver le plan Silver",
        f"Le prochain build_silver l'appliquera. {ENG}",
    ),
    # --- Runs -----------------------------------------------------------------------
    ("post", "/projects/{project_id}/runs"): (
        "Lancer un run",
        "profile, build_silver, build_gold, export ou gold_proposal ; exécuté en tâche de fond "
        f"(202). {ENG}",
    ),
    ("get", "/projects/{project_id}/runs"): (
        "Lister les runs",
        "Les plus récents d'abord ; un analyst ne voit que les siens (demandes à l'agent). " + ALL,
    ),
    ("get", "/runs/{run_id}"): (
        "Statut d'un run",
        "Statut, progression, métriques (lignes, tests dbt, appels LLM) et résultat. "
        "Un analyst ne lit que ses runs. " + ALL,
    ),
    ("post", "/runs/{run_id}/cancel"): (
        "Annuler un run",
        "Un run en file, ou un run LLM en cours (l'appel au modèle est interrompu) ; un build "
        "en cours ne s'annule pas. Auteur du run ou engineer.",
    ),
    ("get", "/runs/{run_id}/logs"): (
        "Logs d'un run",
        "Texte horodaté, sortie de dbt comprise. Auteur du run ou engineer.",
    ),
    # --- Tables -----------------------------------------------------------------------
    ("get", "/projects/{project_id}/tables"): (
        "Lister les tables",
        "Tables Silver (engineer), Gold et data marts (les siens pour un analyst) que "
        "l'appelant peut lire. " + ALL,
    ),
    ("get", "/tables/{table_id}"): ("Détail d'une table", f"Colonnes, lignes, publication. {ALL}"),
    ("patch", "/tables/{table_id}"): (
        "Publier ou retirer une table",
        f"Inclusion dans la base serving au prochain export. {ENG}",
    ),
    ("get", "/tables/{table_id}/preview"): (
        "Aperçu d'une table",
        "Premières lignes, données personnelles traitées comme à l'export ; toujours "
        f"pseudonymisées pour un analyst. {ALL}",
    ),
    ("get", "/tables/{table_id}/export"): (
        "Exporter une table",
        "Parquet ou CSV (UTF-8, séparateur configurable), données personnelles traitées ; "
        f"toujours pseudonymisées pour un analyst. {ALL}",
    ),
    # --- Relations ----------------------------------------------------------------------
    ("get", "/projects/{project_id}/relations"): (
        "Lister les relations",
        f"Relations entre tables Silver, avec confiance et statut ; filtre status. {ENG}",
    ),
    ("post", "/projects/{project_id}/relations"): (
        "Déclarer une relation",
        f"Mesurée sur les données puis confirmée ; la cible doit être unique. {ENG}",
    ),
    ("post", "/projects/{project_id}/relations/detect"): (
        "Détecter les relations",
        f"Relance la détection (aussi faite à la fin de chaque build_silver). {ENG}",
    ),
    ("get", "/relations/{relation_id}"): (
        "Détail d'une relation",
        f"Statistiques et explication. {ENG}",
    ),
    ("post", "/relations/{relation_id}/confirm"): (
        "Confirmer une relation",
        f"Seules les relations confirmées servent au modèle Gold. {ENG}",
    ),
    ("post", "/relations/{relation_id}/reject"): (
        "Rejeter une relation",
        f"Décision conservée. {ENG}",
    ),
    # --- Gold --------------------------------------------------------------------------
    ("post", "/projects/{project_id}/gold-plan/propose"): (
        "Proposer un modèle Gold",
        "Run gold_proposal (LLM configuré, sinon règles) ; la version du plan proposé est dans "
        f"result.gold_plan_version. {ENG}",
    ),
    ("get", "/projects/{project_id}/gold-plan"): (
        "Plan Gold",
        f"Dimensions, faits, mesures, validation ; dernière version ou version donnée. {ENG}",
    ),
    ("patch", "/projects/{project_id}/gold-plan"): (
        "Modifier le plan Gold",
        f"Sections entières ou changements ciblés (SCD, mesures) : crée un brouillon. {ENG}",
    ),
    ("get", "/projects/{project_id}/gold-plans"): (
        "Historique du plan Gold",
        f"Toutes les versions. {ENG}",
    ),
    ("post", "/projects/{project_id}/gold-plan/approve"): (
        "Approuver le plan Gold",
        f"Refusé tant que la validation signale des erreurs. {ENG}",
    ),
    # --- Couche sémantique ----------------------------------------------------------------
    ("get", "/projects/{project_id}/semantic-layer"): (
        "Couche sémantique",
        "Métriques (formule, additivité, unité), dimensions, attributs, hiérarchies, synonymes. "
        f"Les éléments masqués ne sont visibles que des engineers. {ALL}",
    ),
    ("patch", "/projects/{project_id}/semantic-layer"): (
        "Modifier la couche sémantique",
        "Libellés, descriptions, synonymes, masquage : conservés à chaque régénération ; crée "
        f"une version. {ENG}",
    ),
    ("get", "/projects/{project_id}/semantic-layer/versions"): (
        "Versions de la couche sémantique",
        f"Numéros des versions. {ALL}",
    ),
    ("post", "/projects/{project_id}/semantic-layer/regenerate"): (
        "Régénérer la couche sémantique",
        f"Depuis le plan Gold appliqué, éditions conservées. {ENG}",
    ),
    ("post", "/projects/{project_id}/semantic-layer/synonym-proposals"): (
        "Proposer un synonyme",
        f"Par exemple après une question de l'agent ; un engineer le valide. {ALL}",
    ),
    ("get", "/projects/{project_id}/semantic-layer/synonym-proposals"): (
        "Lister les propositions de synonymes",
        "Filtre status ; un analyst ne voit que les siennes. " + ALL,
    ),
    ("post", "/synonym-proposals/{proposal_id}/accept"): (
        "Accepter un synonyme",
        f"Ajouté à la couche sémantique (nouvelle version). {ENG}",
    ),
    ("post", "/synonym-proposals/{proposal_id}/reject"): (
        "Refuser un synonyme",
        f"Décision conservée. {ENG}",
    ),
    # --- Agent métier -----------------------------------------------------------------
    ("post", "/projects/{project_id}/mart-requests"): (
        "Demander un data mart",
        "Demande en français ; l'agent la traite dans un run (202) : aperçu de vérification, "
        f"question en retour ou refus dans la dernière version de la demande. {ALL}",
    ),
    ("get", "/projects/{project_id}/mart-requests"): (
        "Lister les demandes de data mart",
        "Les siennes ; toutes pour un engineer. " + ALL,
    ),
    ("get", "/mart-requests/{mart_id}"): (
        "Détail d'une demande",
        "Versions avec chemin utilisé (parseur ou LLM), taille du contexte, MartSpec, question "
        "en retour, résumé, SQL, aperçu et contrôles. Auteur ou engineer.",
    ),
    ("post", "/mart-requests/{mart_id}/answer"): (
        "Répondre à l'agent",
        "Index d'option ou texte libre : nouvelle version (run). Auteur de la demande.",
    ),
    ("post", "/mart-requests/{mart_id}/refine"): (
        "Affiner un data mart",
        "« ajoute le nombre de commandes », « seulement le T1 » : nouvelle version (run). "
        "Auteur de la demande.",
    ),
    ("post", "/mart-requests/{mart_id}/validate"): (
        "Valider l'aperçu",
        "Publie le data mart (run), ou attend l'approbation d'un engineer si "
        "FORJA_MART_REQUIRE_APPROVAL=true. Refusé si un contrôle est en erreur. Auteur.",
    ),
    ("post", "/mart-requests/{mart_id}/approve"): (
        "Approuver un data mart",
        f"Lance la publication : modèle dbt mart_<nom>, serving, exports. {ENG}",
    ),
    ("post", "/mart-requests/{mart_id}/reject"): (
        "Rejeter une demande",
        "Avec un motif. Auteur de la demande ou engineer.",
    ),
}

TAGS = [
    {"name": "system", "description": "État du service."},
    {"name": "auth", "description": "Connexion, jetons, mot de passe, clés API, inscription."},
    {"name": "projects", "description": "Projets, membres, invitations, journal d'audit."},
    {"name": "sources", "description": "Chargement, versions, profils (Bronze)."},
    {"name": "plans", "description": "Plans de transformation Silver."},
    {
        "name": "runs",
        "description": "Runs en tâche de fond : builds, exports, propositions, agent.",
    },
    {"name": "tables", "description": "Tables Silver, Gold et data marts : aperçus, exports."},
    {"name": "relations", "description": "Relations entre sources."},
    {"name": "gold", "description": "Modèle en étoile Gold."},
    {"name": "semantic layer", "description": "Couche sémantique et synonymes."},
    {"name": "agent", "description": "Agent métier : demandes de data marts en français."},
]


def load_examples() -> dict[str, Any]:
    if not EXAMPLES_FILE.exists():
        return {}
    examples: dict[str, Any] = json.loads(EXAMPLES_FILE.read_text(encoding="utf-8"))
    return examples


def install(app: FastAPI) -> None:
    """Replace ``app.openapi`` by the French document with examples."""
    original = app.openapi

    def openapi() -> dict[str, Any]:
        if app.openapi_schema:
            return app.openapi_schema
        schema = original()
        examples = load_examples()
        schema["info"]["description"] = (
            "API de Forja : ingestion, profiling, modélisation Silver et Gold, couche "
            "sémantique et agent métier. Authentification par jeton Bearer (POST /auth/login) "
            'ou clé API (X-API-Key) ; erreurs au format {"error": {code, message, details}}.'
        )
        schema["tags"] = TAGS
        for path, operations in schema["paths"].items():
            for method, operation in operations.items():
                summary, description = ROUTE_DOCS.get((method, path), (None, None))
                if summary is not None:
                    operation["summary"] = summary
                    operation["description"] = description
                example = examples.get(f"{method.upper()} {path}")
                if example is None or example["body"] is None:
                    continue
                code, body = example["status"], example["body"]
                response = operation.setdefault("responses", {}).setdefault(
                    str(code), {"description": "Réponse"}
                )
                media = "text/plain" if isinstance(body, str) else "application/json"
                response.setdefault("content", {}).setdefault(media, {})["example"] = body
        app.openapi_schema = schema
        return schema

    app.openapi = openapi  # type: ignore[method-assign]


def document(app: FastAPI) -> str:
    """The OpenAPI document as written in docs/openapi.json."""
    return json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"
