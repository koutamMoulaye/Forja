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
    ("post", "/auth/invitations/lookup"): (
        "Lire une invitation",
        "Où mène un lien d'inscription : valide (e-mail, rôle, projet), expirée, révoquée, déjà "
        "utilisée ou inconnue. Le jeton passe dans le corps, jamais dans une URL. "
        f"{PUBLIC}",
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
        "Qui a fait quoi, quand, sur quel objet, les plus récents d'abord, par page (limit, "
        "offset). Filtres : utilisateur (« système » pour les actions sans utilisateur), "
        "action, type d'objet, date de début, texte ; facets donne les valeurs des filtres "
        "sur tout le journal. " + ADMIN,
    ),
    ("get", "/audit"): (
        "Journal d'audit de l'instance",
        f"Toutes les entrées, par page, avec les mêmes filtres que celui d'un projet. {INSTANCE}",
    ),
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
    ("get", "/projects/{project_id}/graph"): (
        "Graphe du pipeline",
        "Tout ce que dessine le canvas en un appel : nœuds (sources, tables nettoyées, "
        "dimensions, faits, data marts, destinations) avec leur état normalisé, compteurs, "
        "score qualité, données personnelles et run en cours ; liens de lignée, de relation "
        "(avec la confiance) et de publication ; compteurs par compartiment. Réponse avec "
        "ETag : renvoyer If-None-Match pour recevoir 304 si rien n'a changé. Un analyst ne "
        "voit que le modèle en étoile, les data marts publiés qu'il peut lire et les "
        "destinations. " + ALL,
    ),
    # --- Notifications ------------------------------------------------------------
    ("get", "/notifications"): (
        "Mes notifications",
        "Les plus récentes d'abord, par page (limit, offset), toutes ou non lues seulement ; "
        "unread donne le nombre de non lues. Run terminé ou en échec, plan à revoir, data mart "
        "à approuver, approuvé, rejeté (avec le motif) ou publié, réponse de l'agent prête. "
        f"{ANY_USER}",
    ),
    ("post", "/notifications/read"): (
        "Marquer des notifications comme lues",
        f"Celles dont les identifiants sont donnés, toutes sans identifiant. {ANY_USER}",
    ),
    ("get", "/events"): (
        "Flux d'événements (Server-Sent Events)",
        "text/event-stream : ready (nombre de non lues), notification (une nouvelle "
        "notification), job (un run que l'appelant peut suivre change d'état ou progresse), "
        "ping toutes les 15 s. Le flux se ferme à l'expiration du jeton d'accès ou à la "
        f"révocation de la session ; le client se reconnecte. {ANY_USER}",
    ),
    ("get", "/projects/{project_id}/runs"): (
        "Lister les runs",
        "Les plus récents d'abord, par page (limit, offset ; total donne le nombre de runs). "
        "Un analyst ne voit que les siens (demandes à l'agent). " + ALL,
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
    ("get", "/projects/{project_id}/agent/overview"): (
        "Accueil de l'agent",
        "Date du dernier build Gold réussi et questions suggérées, écrites depuis la couche "
        f"sémantique et comprises par le parseur seul (aperçu immédiat). {ALL}",
    ),
    ("post", "/projects/{project_id}/mart-requests"): (
        "Demander un data mart",
        "Demande en français ; l'agent la traite dans un run (202) : aperçu de vérification, "
        f"question en retour ou refus dans la dernière version de la demande. {ALL}",
    ),
    ("get", "/projects/{project_id}/mart-requests"): (
        "Lister les demandes de data mart",
        "Les siennes ; toutes pour un engineer. Les plus récemment modifiées d'abord, par page "
        "(limit, offset), filtrables par statut. versions=latest (par défaut) ne garde que la "
        "dernière version de chaque demande, et la dernière avec un aperçu ; versions=all les "
        "renvoie toutes, comme le détail d'une demande. " + ALL,
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
    ("post", "/mart-requests/{mart_id}/correct"): (
        "Corriger un terme de l'aperçu",
        "Un terme souligné du résumé (mesure, découpage, axe, période, filtre, limite) prend "
        "l'une de ses options : nouvelle version (run) prévisualisée telle quelle, sans LLM. "
        "Auteur de la demande.",
    ),
    ("post", "/mart-requests/{mart_id}/validate"): (
        "Valider l'aperçu",
        "Avec la destination choisie (Power BI, Superset, CSV, Parquet). Publie le data mart "
        "(run), ou attend l'approbation d'un engineer si FORJA_MART_REQUIRE_APPROVAL=true ; "
        "un engineer qui valide sa propre demande l'approuve du même coup. Refusé si un "
        "contrôle est en erreur. Auteur.",
    ),
    ("post", "/mart-requests/{mart_id}/approve"): (
        "Approuver un data mart",
        f"Lance la publication : modèle dbt mart_<nom>, serving, exports. {ENG}",
    ),
    # --- Revue Silver, quarantaine, validation Gold, réglages -------------------------
    ("get", "/sources/{source_id}/plan/review"): (
        "Revue du plan Silver",
        "Le plan sous forme de règles (conversion, écriture, pseudonymisation, doublons, clé), "
        "chacune avec son explication, sa confiance et la décision prise. Paramètre version "
        f"pour une version antérieure. {ENG}",
    ),
    ("post", "/sources/{source_id}/plan/review"): (
        "Décider des règles du plan",
        "Valider ou rejeter des règles du dernier brouillon, sans créer de version ; null remet "
        "une règle en revue. Une donnée personnelle se modifie, elle ne se rejette pas. Les "
        f"règles rejetées sont retirées à l'approbation, dans une nouvelle version. {ENG}",
    ),
    ("get", "/sources/{source_id}/plan/samples"): (
        "Aperçu avant et après",
        "Valeurs d'un échantillon de la dernière version, avant et après les expressions du "
        "plan (celles des modèles dbt). Données personnelles masquées pour un engineer, "
        f"pseudonymisées sinon ; en clair seulement avec FORJA_ALLOW_BRONZE_PREVIEW. {ENG}",
    ),
    ("get", "/sources/{source_id}/rejects"): (
        "Lignes en quarantaine",
        "Lignes rejetées par le nettoyage, comptées par motif, et les dernières d'entre elles "
        "(paramètre run_id pour un run). Données personnelles traitées comme dans les "
        f"exports. {ENG}",
    ),
    ("get", "/projects/{project_id}/gold-plan/issues"): (
        "Validation du plan Gold",
        "Contrôles du dernier plan recalculés avec les relations et les tables actuelles : "
        "une relation confirmée depuis la proposition lève son erreur. Le plan n'est pas "
        f"modifié. {ENG}",
    ),
    ("delete", "/projects/{project_id}/invitations/{invitation_id}"): (
        "Révoquer une invitation",
        f"Une invitation pas encore acceptée : son lien d'inscription cesse de marcher. {ADMIN}",
    ),
    ("get", "/settings/llm"): (
        "Fournisseur IA",
        "Fournisseur, modèle et adresse en service, et si une clé API est enregistrée ; une clé "
        f"n'est jamais renvoyée. editable indique si l'appelant peut le changer. {ANY_USER}",
    ),
    ("put", "/settings/llm"): (
        "Choisir le fournisseur IA",
        "Ollama, Anthropic, OpenAI ou aucun (heuristiques seules), le modèle et la clé API. "
        "Enregistré dans FORJA_SECRETS_DIR, hors du dépôt, et appliqué sans redémarrage ; "
        f"prime sur les variables FORJA_LLM_*. {INSTANCE}",
    ),
    ("post", "/settings/llm/test"): (
        "Tester la connexion IA",
        "Joint le fournisseur et vérifie que le modèle existe, sans envoyer de donnée. "
        f"Le résultat est conservé (last_check). {INSTANCE}",
    ),
    ("post", "/mart-requests/{mart_id}/reject"): (
        "Rejeter une demande",
        "Avec un motif. Auteur de la demande ou engineer.",
    ),
    # --- Téléversements découpés ----------------------------------------------------
    ("post", "/projects/{project_id}/uploads"): (
        "Ouvrir un téléversement découpé",
        "Nom et taille du fichier (jusqu'à FORJA_MAX_UPLOAD_MB, 10 Go par défaut). Avec une "
        "empreinte (fingerprint), le téléversement inachevé du même fichier est repris au lieu "
        f"de recommencer. Renvoie la taille des morceaux à envoyer. {ENG}",
    ),
    ("get", "/uploads/{upload_id}"): (
        "État d'un téléversement",
        f"Octets reçus (pour reprendre après une coupure), statut et run d'ingestion. {ENG}",
    ),
    ("put", "/uploads/{upload_id}/chunks"): (
        "Envoyer un morceau",
        "Octets bruts (application/octet-stream) écrits à l'offset où s'arrêtent les données "
        "reçues ; un autre offset répond 409 avec l'offset attendu. Le dernier morceau "
        f"complète le fichier. {ENG}",
    ),
    ("post", "/uploads/{upload_id}/complete"): (
        "Ingérer le fichier téléversé",
        "Lance un run ingest : lecture en flux par DuckDB vers Bronze, profil, plan Silver. "
        f"Le fichier temporaire est supprimé ensuite. {ENG}",
    ),
    ("delete", "/uploads/{upload_id}"): (
        "Abandonner un téléversement",
        f"Supprime les données reçues. {ENG}",
    ),
    # --- Connexions -----------------------------------------------------------------
    ("get", "/projects/{project_id}/connections"): (
        "Connexions du projet",
        "Bases de données et API REST, leurs sources, leur planification, le chargement en "
        f"cours. Les identifiants ne sont jamais renvoyés (secrets_set). {ENG}",
    ),
    ("post", "/projects/{project_id}/connections"): (
        "Créer une connexion",
        "PostgreSQL, MySQL/MariaDB, SQL Server ou API REST. Les identifiants sont chiffrés "
        "(AES-256-GCM, clé dans FORJA_SECRETS_DIR), jamais renvoyés, journalisés ni transmis "
        "au modèle de langage. Une API sur une adresse privée ou locale est refusée sauf "
        f"autorisation de l'administrateur. {ENG}",
    ),
    ("post", "/projects/{project_id}/connections/test"): (
        "Tester une configuration",
        f"Avant de l'enregistrer : connexion, version du serveur, compte en lecture seule. {ENG}",
    ),
    ("post", "/projects/{project_id}/connections/preview"): (
        "Aperçu d'une API REST",
        "Première page d'un endpoint : chemin des enregistrements (détecté s'il n'est pas "
        "donné), colonnes aplaties, tables enfants des listes imbriquées et relations "
        f"proposées. {ENG}",
    ),
    ("get", "/connections/{connection_id}"): (
        "Connexion",
        f"Paramètres, sources alimentées, planification, dernier test. {ENG}",
    ),
    ("patch", "/connections/{connection_id}"): (
        "Modifier une connexion",
        "Nom, paramètres ou identifiants ; un identifiant absent est conservé, vide il est "
        f"supprimé. {ENG}",
    ),
    ("delete", "/connections/{connection_id}"): (
        "Supprimer une connexion",
        "Ses sources restent, avec leurs versions, mais ne sont plus chargées ; leurs "
        f"planifications sont supprimées. {ENG}",
    ),
    ("post", "/connections/{connection_id}/test"): (
        "Tester une connexion",
        f"Résultat conservé (last_test). {ENG}",
    ),
    ("get", "/connections/{connection_id}/explore"): (
        "Explorer une base de données",
        "Schémas, tables et vues, colonnes et types (et leur type Bronze), nombre de lignes "
        f"estimé, clé primaire, colonnes curseur proposées pour l'incrémental. {ENG}",
    ),
    ("post", "/connections/{connection_id}/import"): (
        "Sélectionner les tables à charger",
        "Tables (mode complet ou incrémental sur une colonne curseur) ou endpoints ; chacun "
        "devient une source Forja au premier chargement, lancé aussitôt si load_now. Les "
        f"noms viennent de l'introspection de la base, jamais d'une saisie libre. {ENG}",
    ),
    ("post", "/connections/{connection_id}/load"): (
        "Charger maintenant",
        "Run load : extraction par lots vers Bronze (les sources incrémentales ne lisent que "
        "les nouvelles lignes), profil et plan ; avec chain, Silver, Gold, data marts publiés "
        f"et serving selon les plans approuvés. 409 si un chargement est en cours. {ENG}",
    ),
    # --- Planifications ---------------------------------------------------------------
    ("post", "/projects/{project_id}/schedules/interpret"): (
        "Comprendre une planification",
        "Une phrase (« tous les jours à 6 h », « du lundi au vendredi à 7h30 ») ou une "
        f"expression cron : sa traduction et ses trois prochaines exécutions. {ENG}",
    ),
    ("get", "/projects/{project_id}/schedules"): (
        "Planifications du projet",
        f"Prochaine exécution d'abord, avec le fuseau horaire de l'instance. {ENG}",
    ),
    ("get", "/connections/{connection_id}/schedule"): (
        "Planification d'une connexion",
        f"null si les chargements sont manuels. {ENG}",
    ),
    ("put", "/connections/{connection_id}/schedule"): (
        "Planifier une connexion",
        "Toutes ses sources sont chargées puis Silver, Gold, data marts et serving sont "
        "reconstruits selon les plans approuvés. Pas de chevauchement, rattrapage unique "
        f"après un arrêt, notification en cas d'échec. {ENG}",
    ),
    ("delete", "/connections/{connection_id}/schedule"): (
        "Retirer la planification d'une connexion",
        f"Les chargements redeviennent manuels. {ENG}",
    ),
    ("get", "/sources/{source_id}/schedule"): (
        "Planification d'une source",
        f"null si elle n'en a pas. {ENG}",
    ),
    ("put", "/sources/{source_id}/schedule"): (
        "Planifier une source",
        "Une source chargée depuis une connexion ; une source fichier se met à jour par une "
        f"nouvelle version. {ENG}",
    ),
    ("delete", "/sources/{source_id}/schedule"): (
        "Retirer la planification d'une source",
        f"Les chargements redeviennent manuels. {ENG}",
    ),
    ("get", "/settings/connectors"): (
        "Adresses autorisées des API",
        "Adresses privées ou locales (hôtes, IP, plages CIDR) que les connexions API REST "
        f"peuvent joindre, depuis l'interface et l'environnement. {ANY_USER}",
    ),
    ("put", "/settings/connectors"): (
        "Autoriser des adresses privées",
        f"Protection SSRF : les adresses privées et locales sont refusées par défaut. {INSTANCE}",
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
    {
        "name": "connections",
        "description": "Connexions aux bases de données et aux API, chargements, planifications.",
    },
    {
        "name": "settings",
        "description": "Réglages de l'instance : fournisseur IA, adresses autorisées.",
    },
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
