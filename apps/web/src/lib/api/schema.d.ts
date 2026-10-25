/**
 * Types of the Forja API, generated from docs/openapi.json by `pnpm api:generate`.
 * Do not edit by hand: regenerate after `forja openapi`.
 */

export type paths = {
    "/audit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Journal d'audit de l'instance
         * @description Toutes les entrées. Réservé à l'administrateur de l'instance.
         */
        get: operations["instance_audit_audit_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/api-keys": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lister ses clés API
         * @description Clés API personnelles (préfixe seulement, jamais le secret). Tout utilisateur authentifié.
         */
        get: operations["list_api_keys_auth_api_keys_get"];
        put?: never;
        /**
         * Créer une clé API
         * @description La clé complète (fja_…) n'est affichée qu'une fois ; à envoyer en en-tête X-API-Key ou Authorization: Bearer. Tout utilisateur authentifié.
         */
        post: operations["create_api_key_auth_api_keys_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/api-keys/{key_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Révoquer une clé API
         * @description La clé est refusée immédiatement. Tout utilisateur authentifié.
         */
        delete: operations["revoke_api_key_auth_api_keys__key_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Se connecter
         * @description Email et mot de passe : renvoie un jeton d'accès (15 min) et un jeton de rafraîchissement à usage unique. Après plusieurs échecs, le compte et l'adresse IP sont verrouillés temporairement (429, en-tête Retry-After). Public (sans authentification).
         */
        post: operations["login_auth_login_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Se déconnecter
         * @description Révoque la session en cours. Tout utilisateur authentifié.
         */
        post: operations["logout_auth_logout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Utilisateur connecté
         * @description Compte, mode d'authentification et rôle dans chaque projet. Tout utilisateur authentifié.
         */
        get: operations["me_auth_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Changer son mot de passe
         * @description Obligatoire après la première connexion. Révoque les autres sessions et renvoie une nouvelle paire de jetons. Tout utilisateur authentifié.
         */
        post: operations["change_password_auth_password_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Rafraîchir les jetons
         * @description Échange un jeton de rafraîchissement contre une nouvelle paire ; réutiliser un jeton déjà utilisé révoque la session. Public (sans authentification).
         */
        post: operations["refresh_auth_refresh_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Créer son compte depuis une invitation
         * @description Jeton d'invitation à usage unique et mot de passe (mode multi). Renvoie une paire de jetons. Public (sans authentification).
         */
        post: operations["register_auth_register_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lister les utilisateurs
         * @description Tous les comptes. Réservé à l'administrateur de l'instance.
         */
        get: operations["list_users_auth_users_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * État du service
         * @description Version et disponibilité de l'API. Public (sans authentification).
         */
        get: operations["health_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/mart-requests/{mart_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Détail d'une demande
         * @description Versions avec chemin utilisé (parseur ou LLM), taille du contexte, MartSpec, question en retour, résumé, SQL, aperçu et contrôles. Auteur ou engineer.
         */
        get: operations["get_mart_request_mart_requests__mart_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/mart-requests/{mart_id}/answer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Répondre à l'agent
         * @description Index d'option ou texte libre : nouvelle version (run). Auteur de la demande.
         */
        post: operations["answer_mart_request_mart_requests__mart_id__answer_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/mart-requests/{mart_id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Approuver un data mart
         * @description Lance la publication : modèle dbt mart_<nom>, serving, exports. Rôles : admin, engineer.
         */
        post: operations["approve_mart_request_mart_requests__mart_id__approve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/mart-requests/{mart_id}/refine": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Affiner un data mart
         * @description « ajoute le nombre de commandes », « seulement le T1 » : nouvelle version (run). Auteur de la demande.
         */
        post: operations["refine_mart_request_mart_requests__mart_id__refine_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/mart-requests/{mart_id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Rejeter une demande
         * @description Avec un motif. Auteur de la demande ou engineer.
         */
        post: operations["reject_mart_request_mart_requests__mart_id__reject_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/mart-requests/{mart_id}/validate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Valider l'aperçu
         * @description Publie le data mart (run), ou attend l'approbation d'un engineer si FORJA_MART_REQUIRE_APPROVAL=true. Refusé si un contrôle est en erreur. Auteur.
         */
        post: operations["validate_mart_request_mart_requests__mart_id__validate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lister ses projets
         * @description Projets dont l'appelant est membre. Tout utilisateur authentifié.
         */
        get: operations["list_projects_projects_get"];
        put?: never;
        /**
         * Créer un projet
         * @description Le créateur en devient admin ; le workspace local est créé. Réservé à l'administrateur de l'instance.
         */
        post: operations["create_project_projects_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project_id}/audit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Journal d'audit du projet
         * @description Qui a fait quoi, quand, sur quel objet ; filtres action et limit. Rôle : admin du projet.
         */
        get: operations["project_audit_projects__project_id__audit_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project_id}/gold-plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Plan Gold
         * @description Dimensions, faits, mesures, validation ; dernière version ou version donnée. Rôles : admin, engineer.
         */
        get: operations["get_gold_plan_projects__project_id__gold_plan_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Modifier le plan Gold
         * @description Sections entières ou changements ciblés (SCD, mesures) : crée un brouillon. Rôles : admin, engineer.
         */
        patch: operations["patch_gold_plan_projects__project_id__gold_plan_patch"];
        trace?: never;
    };
    "/projects/{project_id}/gold-plan/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Approuver le plan Gold
         * @description Refusé tant que la validation signale des erreurs. Rôles : admin, engineer.
         */
        post: operations["approve_gold_plan_projects__project_id__gold_plan_approve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project_id}/gold-plan/propose": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Proposer un modèle Gold
         * @description Run gold_proposal (LLM configuré, sinon règles) ; la version du plan proposé est dans result.gold_plan_version. Rôles : admin, engineer.
         */
        post: operations["propose_gold_plan_projects__project_id__gold_plan_propose_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project_id}/gold-plans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Historique du plan Gold
         * @description Toutes les versions. Rôles : admin, engineer.
         */
        get: operations["list_gold_plans_projects__project_id__gold_plans_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project_id}/invitations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lister les invitations
         * @description Invitations envoyées et acceptées (sans les jetons). Rôle : admin du projet.
         */
        get: operations["list_invitations_projects__project_id__invitations_get"];
        put?: never;
        /**
         * Inviter un utilisateur
         * @description Mode multi. Un compte existant est ajouté directement ; sinon un jeton d'inscription à usage unique est renvoyé une fois. Rôle : admin du projet.
         */
        post: operations["invite_projects__project_id__invitations_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project_id}/mart-requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lister les demandes de data mart
         * @description Les siennes ; toutes pour un engineer. Rôles : admin, engineer, analyst.
         */
        get: operations["list_mart_requests_projects__project_id__mart_requests_get"];
        put?: never;
        /**
         * Demander un data mart
         * @description Demande en français ; l'agent la traite dans un run (202) : aperçu de vérification, question en retour ou refus dans la dernière version de la demande. Rôles : admin, engineer, analyst.
         */
        post: operations["create_mart_request_projects__project_id__mart_requests_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project_id}/members": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lister les membres
         * @description Membres et rôles. Rôle : admin du projet.
         */
        get: operations["list_members_projects__project_id__members_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project_id}/members/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Changer le rôle d'un membre
         * @description Rôles possibles : admin, engineer, analyst. Rôle : admin du projet.
         */
        put: operations["set_member_role_projects__project_id__members__user_id__put"];
        post?: never;
        /**
         * Retirer un membre
         * @description L'utilisateur perd l'accès au projet. Rôle : admin du projet.
         */
        delete: operations["remove_member_projects__project_id__members__user_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project_id}/relations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lister les relations
         * @description Relations entre tables Silver, avec confiance et statut ; filtre status. Rôles : admin, engineer.
         */
        get: operations["list_relations_projects__project_id__relations_get"];
        put?: never;
        /**
         * Déclarer une relation
         * @description Mesurée sur les données puis confirmée ; la cible doit être unique. Rôles : admin, engineer.
         */
        post: operations["add_relation_projects__project_id__relations_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project_id}/relations/detect": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Détecter les relations
         * @description Relance la détection (aussi faite à la fin de chaque build_silver). Rôles : admin, engineer.
         */
        post: operations["detect_relations_projects__project_id__relations_detect_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project_id}/runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lister les runs
         * @description Les plus récents d'abord ; un analyst ne voit que les siens (demandes à l'agent). Rôles : admin, engineer, analyst.
         */
        get: operations["list_runs_projects__project_id__runs_get"];
        put?: never;
        /**
         * Lancer un run
         * @description profile, build_silver, build_gold, export ou gold_proposal ; exécuté en tâche de fond (202). Rôles : admin, engineer.
         */
        post: operations["create_run_projects__project_id__runs_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project_id}/semantic-layer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Couche sémantique
         * @description Métriques (formule, additivité, unité), dimensions, attributs, hiérarchies, synonymes. Les éléments masqués ne sont visibles que des engineers. Rôles : admin, engineer, analyst.
         */
        get: operations["get_semantic_layer_projects__project_id__semantic_layer_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Modifier la couche sémantique
         * @description Libellés, descriptions, synonymes, masquage : conservés à chaque régénération ; crée une version. Rôles : admin, engineer.
         */
        patch: operations["patch_semantic_layer_projects__project_id__semantic_layer_patch"];
        trace?: never;
    };
    "/projects/{project_id}/semantic-layer/regenerate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Régénérer la couche sémantique
         * @description Depuis le plan Gold appliqué, éditions conservées. Rôles : admin, engineer.
         */
        post: operations["regenerate_projects__project_id__semantic_layer_regenerate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project_id}/semantic-layer/synonym-proposals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lister les propositions de synonymes
         * @description Filtre status ; un analyst ne voit que les siennes. Rôles : admin, engineer, analyst.
         */
        get: operations["list_synonym_proposals_projects__project_id__semantic_layer_synonym_proposals_get"];
        put?: never;
        /**
         * Proposer un synonyme
         * @description Par exemple après une question de l'agent ; un engineer le valide. Rôles : admin, engineer, analyst.
         */
        post: operations["propose_synonym_projects__project_id__semantic_layer_synonym_proposals_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project_id}/semantic-layer/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Versions de la couche sémantique
         * @description Numéros des versions. Rôles : admin, engineer, analyst.
         */
        get: operations["list_semantic_versions_projects__project_id__semantic_layer_versions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project_id}/sources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lister les sources
         * @description Avec version courante et score qualité. Rôles : admin, engineer.
         */
        get: operations["list_sources_projects__project_id__sources_get"];
        put?: never;
        /**
         * Charger un fichier
         * @description CSV, Excel (une source par feuille), Parquet ou JSON, en multipart (champ file). Recharger un même nom crée une version ; le fichier est profilé et un plan Silver est proposé. Rôles : admin, engineer.
         */
        post: operations["upload_source_projects__project_id__sources_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/projects/{project_id}/tables": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lister les tables
         * @description Tables Silver (engineer), Gold et data marts (les siens pour un analyst) que l'appelant peut lire. Rôles : admin, engineer, analyst.
         */
        get: operations["list_tables_projects__project_id__tables_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relations/{relation_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Détail d'une relation
         * @description Statistiques et explication. Rôles : admin, engineer.
         */
        get: operations["get_relation_relations__relation_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relations/{relation_id}/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Confirmer une relation
         * @description Seules les relations confirmées servent au modèle Gold. Rôles : admin, engineer.
         */
        post: operations["confirm_relation_relations__relation_id__confirm_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/relations/{relation_id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Rejeter une relation
         * @description Décision conservée. Rôles : admin, engineer.
         */
        post: operations["reject_relation_relations__relation_id__reject_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runs/{run_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Statut d'un run
         * @description Statut, progression, métriques (lignes, tests dbt, appels LLM) et résultat. Un analyst ne lit que ses runs. Rôles : admin, engineer, analyst.
         */
        get: operations["get_run_runs__run_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runs/{run_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Annuler un run
         * @description Un run en file, ou un run LLM en cours (l'appel au modèle est interrompu) ; un build en cours ne s'annule pas. Auteur du run ou engineer.
         */
        post: operations["cancel_run_runs__run_id__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runs/{run_id}/logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Logs d'un run
         * @description Texte horodaté, sortie de dbt comprise. Auteur du run ou engineer.
         */
        get: operations["get_run_logs_runs__run_id__logs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/sources/{source_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Détail d'une source
         * @description Version la plus récente. Rôles : admin, engineer.
         */
        get: operations["get_source_sources__source_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/sources/{source_id}/plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Plan Silver
         * @description Dernière version, ou une version donnée ; chaque règle est expliquée. Rôles : admin, engineer.
         */
        get: operations["get_plan_sources__source_id__plan_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Modifier le plan Silver
         * @description Type, nom, règle, exclusion, traitement des données personnelles : crée un brouillon. Rôles : admin, engineer.
         */
        patch: operations["patch_plan_sources__source_id__plan_patch"];
        trace?: never;
    };
    "/sources/{source_id}/plan/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Approuver le plan Silver
         * @description Le prochain build_silver l'appliquera. Rôles : admin, engineer.
         */
        post: operations["approve_plan_sources__source_id__plan_approve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/sources/{source_id}/plans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Historique du plan Silver
         * @description Toutes les versions. Rôles : admin, engineer.
         */
        get: operations["list_plans_sources__source_id__plans_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/sources/{source_id}/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Aperçu Bronze brut
         * @description Lignes brutes, données personnelles en clair : désactivé sauf FORJA_ALLOW_BRONZE_PREVIEW=true. Rôle : admin du projet.
         */
        get: operations["preview_source_sources__source_id__preview_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/sources/{source_id}/profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Profil d'une source
         * @description Types inférés, nulls, cardinalité, clés candidates, doublons, données personnelles, score qualité ; dernière version par défaut. Rôles : admin, engineer.
         */
        get: operations["get_profile_sources__source_id__profile_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/sources/{source_id}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Versions d'une source
         * @description Chaque version avec sa dérive de schéma (colonnes ajoutées, retirées, retypées). Rôles : admin, engineer.
         */
        get: operations["list_versions_sources__source_id__versions_get"];
        put?: never;
        /**
         * Charger une nouvelle version
         * @description Le nom du fichier peut différer ; la dérive de schéma est calculée. Rôles : admin, engineer.
         */
        post: operations["upload_version_sources__source_id__versions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/synonym-proposals/{proposal_id}/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Accepter un synonyme
         * @description Ajouté à la couche sémantique (nouvelle version). Rôles : admin, engineer.
         */
        post: operations["accept_synonym_synonym_proposals__proposal_id__accept_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/synonym-proposals/{proposal_id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Refuser un synonyme
         * @description Décision conservée. Rôles : admin, engineer.
         */
        post: operations["reject_synonym_synonym_proposals__proposal_id__reject_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tables/{table_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Détail d'une table
         * @description Colonnes, lignes, publication. Rôles : admin, engineer, analyst.
         */
        get: operations["get_table_tables__table_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Publier ou retirer une table
         * @description Inclusion dans la base serving au prochain export. Rôles : admin, engineer.
         */
        patch: operations["update_table_tables__table_id__patch"];
        trace?: never;
    };
    "/tables/{table_id}/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Exporter une table
         * @description Parquet ou CSV (UTF-8, séparateur configurable), données personnelles traitées ; toujours pseudonymisées pour un analyst. Rôles : admin, engineer, analyst.
         */
        get: operations["export_table_tables__table_id__export_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tables/{table_id}/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Aperçu d'une table
         * @description Premières lignes, données personnelles traitées comme à l'export ; toujours pseudonymisées pour un analyst. Rôles : admin, engineer, analyst.
         */
        get: operations["preview_table_tables__table_id__preview_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
};
export type webhooks = Record<string, never>;
export type components = {
    schemas: {
        /**
         * Additivity
         * @enum {string}
         */
        Additivity: "additive" | "semi_additive" | "non_additive";
        /**
         * AgentPath
         * @description How the request was understood.
         * @enum {string}
         */
        AgentPath: "parser" | "llm" | "llm_cache";
        /**
         * Aggregation
         * @enum {string}
         */
        Aggregation: "sum" | "avg" | "min" | "max" | "count" | "count_distinct" | "none";
        /** ApiKey */
        ApiKey: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Id */
            id: string;
            /** Last Used At */
            last_used_at?: string | null;
            /** Name */
            name: string;
            /**
             * Prefix
             * @description Shown to recognize the key; the secret is never stored
             */
            prefix: string;
            /** Revoked At */
            revoked_at?: string | null;
            /** User Id */
            user_id: string;
        };
        /** ApiKeyCreate */
        ApiKeyCreate: {
            /** Name */
            name: string;
        };
        /**
         * Architecture
         * @enum {string}
         */
        Architecture: "medallion";
        /** Attribute */
        Attribute: {
            /**
             * Column
             * @description Column of the dimension table (or of the fact)
             */
            column: string;
            /**
             * Data Type
             * @default text
             * @enum {string}
             */
            data_type: "text" | "number" | "date" | "boolean";
            /**
             * Description
             * @default
             */
            description: string;
            /**
             * Filterable
             * @description Values can be resolved locally to filter on them
             * @default false
             */
            filterable: boolean;
            /**
             * Hidden
             * @default false
             */
            hidden: boolean;
            /** Label */
            label: string;
            /** Name */
            name: string;
            /** @description Personal data: never shown in clear */
            pii?: components["schemas"]["PiiType"] | null;
            /** Synonyms */
            synonyms?: string[];
        };
        /** AuditEntry */
        AuditEntry: {
            /**
             * Action
             * @description What happened, e.g. source.upload, gold_plan.approve
             */
            action: string;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Details */
            details?: {
                [key: string]: unknown;
            };
            /** Id */
            id: string;
            /** Object Id */
            object_id?: string | null;
            /** Object Type */
            object_type?: string | null;
            /** Project Id */
            project_id?: string | null;
            /** User Email */
            user_email?: string | null;
            /** User Id */
            user_id?: string | null;
        };
        /** Body_upload_source_projects__project_id__sources_post */
        Body_upload_source_projects__project_id__sources_post: {
            /** File */
            file: string;
        };
        /** Body_upload_version_sources__source_id__versions_post */
        Body_upload_version_sources__source_id__versions_post: {
            /** File */
            file: string;
        };
        /** CandidateKey */
        CandidateKey: {
            /** Columns */
            columns: string[];
            /**
             * Kind
             * @enum {string}
             */
            kind: "simple" | "composite";
        };
        /** CastSpec */
        CastSpec: {
            /** Date Format */
            date_format?: string | null;
            /** Decimal Separator */
            decimal_separator?: ("," | ".") | null;
            /** False Values */
            false_values?: string[];
            /** Null Values */
            null_values?: string[];
            /** True Values */
            true_values?: string[];
        };
        /** Clarification */
        Clarification: {
            /** Options */
            options: components["schemas"]["ClarificationOption"][];
            /** Question */
            question: string;
            /**
             * Term
             * @description The word of the request that is ambiguous or unknown
             */
            term: string;
        };
        /** ClarificationAnswer */
        ClarificationAnswer: {
            /**
             * Option
             * @description Index of the chosen option
             */
            option?: number | null;
            /**
             * Text
             * @description Free answer
             */
            text?: string | null;
        };
        /** ClarificationOption */
        ClarificationOption: {
            /**
             * Label
             * @description What the user reads
             */
            label: string;
            /**
             * Ref
             * @description What the term means if chosen: metric:<name>, attribute:<dim>.<attr>, value:<dim>.<attr>=<value>, or ignore
             */
            ref: string;
        };
        /** ColumnPatch */
        ColumnPatch: {
            /** Date Format */
            date_format?: string | null;
            /** Decimal Separator */
            decimal_separator?: ("," | ".") | null;
            /** Included */
            included?: boolean | null;
            normalization?: components["schemas"]["Normalization"] | null;
            /** Null Values */
            null_values?: string[] | null;
            pii_treatment?: components["schemas"]["PiiTreatment"] | null;
            /**
             * Rules
             * @description Enable or disable validity rules
             */
            rules?: {
                [key: string]: boolean;
            } | null;
            /** Target Column */
            target_column?: string | null;
            target_type?: components["schemas"]["SilverType"] | null;
        };
        /** ColumnPlan */
        ColumnPlan: {
            /** Accepted Values */
            accepted_values?: string[] | null;
            cast?: components["schemas"]["CastSpec"];
            /**
             * Description
             * @default
             */
            description: string;
            /**
             * Explanation
             * @default
             */
            explanation: string;
            /** From Text */
            from_text: boolean;
            /**
             * Included
             * @default true
             */
            included: boolean;
            inferred_type: components["schemas"]["InferredType"];
            /** @default none */
            normalization: components["schemas"]["Normalization"];
            pii_level?: components["schemas"]["ConfidenceLevel"] | null;
            /** @default none */
            pii_treatment: components["schemas"]["PiiTreatment"];
            pii_type?: components["schemas"]["PiiType"] | null;
            /**
             * Present In Latest
             * @default true
             */
            present_in_latest: boolean;
            /** Rules */
            rules?: components["schemas"]["ValidityRule"][];
            /** Source Column */
            source_column: string;
            /**
             * Source Type
             * @description Physical Bronze type
             */
            source_type: string;
            stats: components["schemas"]["ColumnStats"];
            /** Target Column */
            target_column: string;
            target_type: components["schemas"]["SilverType"];
        };
        /** ColumnProfile */
        ColumnProfile: {
            /** Distinct Count */
            distinct_count: number;
            inferred: components["schemas"]["TypeInference"];
            /** Is Constant */
            is_constant: boolean;
            /** Is Unique */
            is_unique: boolean;
            /** Max */
            max?: number | string | null;
            /** Max Length */
            max_length?: number | null;
            /** Mean */
            mean?: number | null;
            /** Min */
            min?: number | string | null;
            /** Min Length */
            min_length?: number | null;
            /** Name */
            name: string;
            /** Null Count */
            null_count: number;
            /** Null Pct */
            null_pct: number;
            /** Physical Type */
            physical_type: string;
            pii?: components["schemas"]["PiiDetection"] | null;
            /** Stddev */
            stddev?: number | null;
            /** Top Values */
            top_values?: components["schemas"]["TopValue"][];
            /**
             * Uniqueness
             * @description distinct values / non-null values
             */
            uniqueness: number;
        };
        /** ColumnSchema */
        ColumnSchema: {
            /** Name */
            name: string;
            /**
             * Technical
             * @default false
             */
            technical: boolean;
            /** Type */
            type: string;
        };
        /**
         * ColumnStats
         * @description Profiling figures the explanations and tests are derived from.
         */
        ColumnStats: {
            /** Distinct Count */
            distinct_count: number;
            /**
             * Invalid Count
             * @description Non-null values not matching the type; None when the type was overridden
             */
            invalid_count?: number | null;
            /** Match Ratio */
            match_ratio: number;
            /** Null Count */
            null_count: number;
            /** Null Pct */
            null_pct: number;
            /** Row Count */
            row_count: number;
        };
        /**
         * ConfidenceLevel
         * @enum {string}
         */
        ConfidenceLevel: "high" | "medium" | "low";
        /** Control */
        Control: {
            /** Code */
            code: string;
            /** Details */
            details?: {
                [key: string]: unknown;
            };
            /** Message */
            message: string;
            /**
             * Status
             * @enum {string}
             */
            status: "ok" | "info" | "warning" | "error";
        };
        /** CreatedApiKey */
        CreatedApiKey: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Id */
            id: string;
            /**
             * Key
             * @description The full key, shown once
             */
            key: string;
            /** Last Used At */
            last_used_at?: string | null;
            /** Name */
            name: string;
            /**
             * Prefix
             * @description Shown to recognize the key; the secret is never stored
             */
            prefix: string;
            /** Revoked At */
            revoked_at?: string | null;
            /** User Id */
            user_id: string;
        };
        /** DateDimension */
        DateDimension: {
            /**
             * Enabled
             * @default true
             */
            enabled: boolean;
            /**
             * Explanation
             * @default
             */
            explanation: string;
        };
        /** DateKey */
        DateKey: {
            /** Column */
            column: string;
            /**
             * Explanation
             * @default
             */
            explanation: string;
            /**
             * Name
             * @description Column of the fact holding the dim_date key (YYYYMMDD)
             */
            name: string;
            /** Source */
            source: string;
        };
        /** DbtTestResult */
        DbtTestResult: {
            /**
             * Failures
             * @default 0
             */
            failures: number;
            /** Message */
            message?: string | null;
            /** Model */
            model?: string | null;
            /** Name */
            name: string;
            /**
             * Status
             * @enum {string}
             */
            status: "pass" | "fail" | "warn" | "error" | "skipped";
            /** Unique Id */
            unique_id: string;
        };
        /** DbtTestSummary */
        DbtTestSummary: {
            /**
             * Errored
             * @default 0
             */
            errored: number;
            /**
             * Failed
             * @default 0
             */
            failed: number;
            /**
             * Passed
             * @default 0
             */
            passed: number;
            /** Results */
            results?: components["schemas"]["DbtTestResult"][];
            /**
             * Skipped
             * @default 0
             */
            skipped: number;
            /**
             * Warned
             * @default 0
             */
            warned: number;
        };
        /** DeduplicationPlan */
        DeduplicationPlan: {
            /**
             * Duplicate Rows
             * @default 0
             */
            duplicate_rows: number;
            /**
             * Enabled
             * @default true
             */
            enabled: boolean;
            /**
             * Explanation
             * @default
             */
            explanation: string;
        };
        /** DegenerateDimension */
        DegenerateDimension: {
            /** Column */
            column: string;
            /** Name */
            name: string;
            /** Source */
            source: string;
        };
        /** Dimension */
        Dimension: {
            /** Attributes */
            attributes?: components["schemas"]["DimensionAttribute"][];
            /**
             * Explanation
             * @default
             */
            explanation: string;
            /**
             * Name
             * @description dim_<entity>
             */
            name: string;
            /**
             * Natural Key
             * @description Silver key column(s)
             */
            natural_key: string[];
            /** @default scd1 */
            scd: components["schemas"]["ScdType"];
            /**
             * Source
             * @description Silver source name
             */
            source: string;
            /**
             * Surrogate Key
             * @description Deterministic hash of the natural key
             */
            surrogate_key: string;
        };
        /** DimensionAttribute */
        DimensionAttribute: {
            /**
             * Column
             * @description Silver column of the dimension source
             */
            column: string;
            /**
             * Description
             * @default
             */
            description: string;
            /**
             * Name
             * @description Column name in the dimension
             */
            name: string;
            /** @description Export treatment; defaults to the Silver plan's */
            pii_treatment?: components["schemas"]["PiiTreatment"] | null;
        };
        /** DuplicateStats */
        DuplicateStats: {
            /**
             * Duplicate Groups
             * @description Distinct rows appearing more than once
             */
            duplicate_groups: number;
            /** Duplicate Pct */
            duplicate_pct: number;
            /**
             * Duplicate Rows
             * @description Rows that are exact copies of a previous row
             */
            duplicate_rows: number;
        };
        /** ExportedFile */
        ExportedFile: {
            format: components["schemas"]["ExportFormat"];
            /** Path */
            path: string;
            /** Rows */
            rows: number;
            /** Table */
            table: string;
        };
        /**
         * ExportFormat
         * @enum {string}
         */
        ExportFormat: "parquet" | "csv";
        /** Fact */
        Fact: {
            /** Date Keys */
            date_keys?: components["schemas"]["DateKey"][];
            /** Degenerate Dimensions */
            degenerate_dimensions?: components["schemas"]["DegenerateDimension"][];
            /**
             * Explanation
             * @default
             */
            explanation: string;
            /** Foreign Keys */
            foreign_keys?: components["schemas"]["ForeignKey"][];
            /**
             * Grain
             * @description Columns of the source, one row each
             */
            grain: string[];
            /**
             * Grain Description
             * @default
             */
            grain_description: string;
            /** Joins */
            joins?: components["schemas"]["FactJoin"][];
            /** Measures */
            measures?: components["schemas"]["Measure"][];
            /**
             * Name
             * @description fct_<process>
             */
            name: string;
            /**
             * Source
             * @description Silver source at the grain of the fact
             */
            source: string;
        };
        /**
         * FactJoin
         * @description A table joined to the fact base along a many-to-one relation (no fan-out).
         */
        FactJoin: {
            /**
             * Explanation
             * @default
             */
            explanation: string;
            /** From Column */
            from_column: string;
            /**
             * From Source
             * @description Base or already joined source holding the key
             */
            from_source: string;
            /** Source */
            source: string;
            /**
             * To Column
             * @description Key of the joined source
             */
            to_column: string;
        };
        /**
         * FilterOperator
         * @enum {string}
         */
        FilterOperator: "eq" | "neq" | "in" | "not_in" | "gt" | "gte" | "lt" | "lte" | "contains";
        /** ForeignKey */
        ForeignKey: {
            /** Column */
            column: string;
            /** Dimension */
            dimension: string;
            /**
             * Explanation
             * @default
             */
            explanation: string;
            /**
             * Name
             * @description Column of the fact holding the dimension surrogate key
             */
            name: string;
            /**
             * Relation Id
             * @description Confirmed relation used
             */
            relation_id?: string | null;
            /**
             * Source
             * @description Base or joined source holding the natural key
             */
            source: string;
        };
        /** GoldPlan */
        GoldPlan: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            date_dimension?: components["schemas"]["DateDimension"];
            /** Dimensions */
            dimensions?: components["schemas"]["Dimension"][];
            /** Facts */
            facts?: components["schemas"]["Fact"][];
            /** Id */
            id: string;
            /** Issues */
            issues?: components["schemas"]["ValidationIssue"][];
            /**
             * Origin
             * @description heuristic, or llm:<provider>/<model>
             */
            origin: string;
            /** Project Id */
            project_id: string;
            status: components["schemas"]["PlanStatus"];
            /**
             * Summary
             * @default
             */
            summary: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
            /** Version */
            version: number;
            /** Warnings */
            warnings?: string[];
        };
        /**
         * GoldPlanPatch
         * @description Replace whole sections, or apply targeted changes.
         */
        GoldPlanPatch: {
            /**
             * Add Measures
             * @description Measures to add, by fact name
             */
            add_measures?: {
                [key: string]: components["schemas"]["Measure"][];
            } | null;
            date_dimension?: components["schemas"]["DateDimension"] | null;
            /**
             * Dimension Scd
             * @description Historization by dimension name
             */
            dimension_scd?: {
                [key: string]: components["schemas"]["ScdType"];
            } | null;
            /** Dimensions */
            dimensions?: components["schemas"]["Dimension"][] | null;
            /** Facts */
            facts?: components["schemas"]["Fact"][] | null;
            /**
             * Remove Measures
             * @description Measure names to remove, by fact name
             */
            remove_measures?: {
                [key: string]: string[];
            } | null;
        };
        /** HealthResponse */
        HealthResponse: {
            /**
             * Auth Mode
             * @description local (single administrator) or multi (invitations); lets the sign-in screen adapt before anyone is authenticated
             */
            auth_mode: string;
            /** Status */
            status: string;
            /** Version */
            version: string;
        };
        /** Hierarchy */
        Hierarchy: {
            /** Label */
            label: string;
            /**
             * Levels
             * @description Attribute names, from the coarsest to the finest
             */
            levels: string[];
            /** Name */
            name: string;
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /**
         * InferredType
         * @enum {string}
         */
        InferredType: "integer" | "decimal" | "boolean" | "date" | "datetime" | "string" | "other" | "empty";
        /**
         * IngestMode
         * @description How an upload relates to existing sources.
         * @enum {string}
         */
        IngestMode: "auto" | "new_source" | "new_version";
        /** Invitation */
        Invitation: {
            /** Accepted At */
            accepted_at?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Email */
            email: string;
            /**
             * Expires At
             * Format: date-time
             */
            expires_at: string;
            /** Id */
            id: string;
            /** Invited By */
            invited_by: string;
            /** Project Id */
            project_id: string;
            role: components["schemas"]["Role"];
            /**
             * Token
             * @description Registration token, shown once
             */
            token?: string | null;
        };
        /** InvitationCreate */
        InvitationCreate: {
            /** Email */
            email: string;
            role: components["schemas"]["Role"];
        };
        /** Job */
        Job: {
            /**
             * Attempts
             * @description Executions started (resumed LLM jobs: > 1)
             * @default 0
             */
            attempts: number;
            /**
             * Cancel Requested
             * @default false
             */
            cancel_requested: boolean;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Created By
             * @description User who queued the job
             */
            created_by?: string | null;
            /** Error */
            error?: string | null;
            /** Finished At */
            finished_at?: string | null;
            /** Id */
            id: string;
            metrics?: components["schemas"]["RunMetrics"] | null;
            params: components["schemas"]["RunRequest"];
            progress?: components["schemas"]["JobProgress"] | null;
            /** Project Id */
            project_id: string;
            /**
             * Result
             * @description Outcome of LLM jobs (Gold plan version, mart request...)
             */
            result?: {
                [key: string]: unknown;
            } | null;
            /** Started At */
            started_at?: string | null;
            status: components["schemas"]["JobStatus"];
            type: components["schemas"]["JobType"];
        };
        /** JobProgress */
        JobProgress: {
            /**
             * Done
             * @description Items finished successfully
             */
            done?: string[];
            /**
             * Failed
             * @description Items that failed
             */
            failed?: string[];
            /**
             * Message
             * @default
             */
            message: string;
            /**
             * Percent
             * @default 0
             */
            percent: number;
            /**
             * Running
             * @description Items being processed: dbt models (stg_clients, dim_clients...), or source ids while profiling
             */
            running?: string[];
            /** Step */
            step: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * JobStatus
         * @enum {string}
         */
        JobStatus: "queued" | "running" | "succeeded" | "failed" | "cancelled";
        /**
         * JobType
         * @enum {string}
         */
        JobType: "profile" | "build_silver" | "build_gold" | "export" | "gold_proposal" | "mart_request" | "publish_mart" | "build_all";
        /** LLMTrace */
        LLMTrace: {
            /**
             * Cached
             * @default false
             */
            cached: boolean;
            /**
             * Duration Ms
             * @default 0
             */
            duration_ms: number;
            /**
             * Input Tokens
             * @default 0
             */
            input_tokens: number;
            /**
             * Output Tokens
             * @default 0
             */
            output_tokens: number;
        };
        /**
         * LLMUsage
         * @description One language model call made by a job (the journal holds the same, by call).
         */
        LLMUsage: {
            /**
             * Attempts
             * @default 0
             */
            attempts: number;
            /**
             * Cached
             * @default false
             */
            cached: boolean;
            /**
             * Duration Ms
             * @default 0
             */
            duration_ms: number;
            /**
             * Input Tokens
             * @default 0
             */
            input_tokens: number;
            /** Model */
            model: string;
            /**
             * Output Tokens
             * @default 0
             */
            output_tokens: number;
            /** Provider */
            provider: string;
            /** Purpose */
            purpose: string;
            /** Status */
            status: string;
        };
        /** LoginRequest */
        LoginRequest: {
            /** Email */
            email: string;
            /** Password */
            password: string;
        };
        /** MartColumn */
        MartColumn: {
            /** Additivity */
            additivity?: string | null;
            /**
             * Kind
             * @enum {string}
             */
            kind: "axis" | "metric";
            /** Label */
            label: string;
            /** Name */
            name: string;
            /**
             * Pii
             * @description Personal data type, pseudonymized
             */
            pii?: string | null;
            /** Ref */
            ref: string;
        };
        /** MartFilter */
        MartFilter: {
            /**
             * Field
             * @description dimension.attribute, or a metric name (filter on totals)
             */
            field: string;
            /** @default eq */
            operator: components["schemas"]["FilterOperator"];
            /** Value */
            value: string | number | boolean | (string | number | boolean)[];
        };
        /** MartIteration */
        MartIteration: {
            clarification?: components["schemas"]["Clarification"] | null;
            /**
             * Context Tokens
             * @description Estimated tokens of the pre-selected semantic context
             */
            context_tokens?: number | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Effective
             * @description Text actually interpreted
             * @default
             */
            effective: string;
            /** Error */
            error?: string | null;
            /** Instruction */
            instruction: string;
            /** Job Id */
            job_id?: string | null;
            /**
             * Kind
             * @enum {string}
             */
            kind: "question" | "refinement" | "answer";
            llm?: components["schemas"]["LLMTrace"] | null;
            path?: components["schemas"]["AgentPath"] | null;
            preview?: components["schemas"]["MartPreview"] | null;
            /**
             * Refines
             * @description Applied to the previous spec
             * @default false
             */
            refines: boolean;
            /** Refusal */
            refusal?: string | null;
            /**
             * Selected
             * @description Semantic elements pre-selected for the request
             */
            selected?: string[];
            spec?: components["schemas"]["MartSpec"] | null;
            /** Sql */
            sql?: string | null;
            /**
             * Status
             * @default processing
             * @enum {string}
             */
            status: "processing" | "clarification" | "refused" | "previewed" | "failed";
            /** Summary */
            summary?: string | null;
            /** Version */
            version: number;
        };
        /** MartPreview */
        MartPreview: {
            /** Columns */
            columns: components["schemas"]["MartColumn"][];
            /** Controls */
            controls?: components["schemas"]["Control"][];
            /** Pseudonymized */
            pseudonymized?: string[];
            /** Row Count */
            row_count: number;
            /**
             * Rows
             * @description Sample, personal data pseudonymized
             */
            rows: {
                [key: string]: unknown;
            }[];
        };
        /** MartQuestion */
        MartQuestion: {
            /** Question */
            question: string;
        };
        /** MartRefinement */
        MartRefinement: {
            /** Instruction */
            instruction: string;
        };
        /** MartRejection */
        MartRejection: {
            /**
             * Reason
             * @default
             */
            reason: string;
        };
        /** MartRequest */
        MartRequest: {
            /** Approved At */
            approved_at?: string | null;
            /** Approved By */
            approved_by?: string | null;
            /**
             * Bindings
             * @description Terms resolved by the user's answers
             */
            bindings?: {
                [key: string]: string;
            };
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Exports */
            exports?: components["schemas"]["ExportedFile"][];
            /** Id */
            id: string;
            /** Iterations */
            iterations?: components["schemas"]["MartIteration"][];
            /** Model Columns */
            model_columns?: components["schemas"]["MartColumn"][];
            /**
             * Model Sql
             * @description dbt model of the published mart
             */
            model_sql?: string | null;
            /** Model Summary */
            model_summary?: string | null;
            /** Owner Email */
            owner_email?: string | null;
            /** Owner Id */
            owner_id: string;
            /**
             * Owner Unmasked
             * @description The author may see personal data as the plans treat it
             * @default false
             */
            owner_unmasked: boolean;
            /** Project Id */
            project_id: string;
            /** Publish Error */
            publish_error?: string | null;
            /** Publish Job Id */
            publish_job_id?: string | null;
            /** Published At */
            published_at?: string | null;
            /** Published Name */
            published_name?: string | null;
            /** Published Table Id */
            published_table_id?: string | null;
            /** Question */
            question: string;
            /** Rejected By */
            rejected_by?: string | null;
            /** Rejection Reason */
            rejection_reason?: string | null;
            /** Semantic Version */
            semantic_version?: number | null;
            /** @default drafted */
            status: components["schemas"]["MartStatus"];
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
            /** Validated At */
            validated_at?: string | null;
        };
        /**
         * MartRequestRun
         * @description The request, and the run working on it (follow it with GET /runs/{id}).
         */
        MartRequestRun: {
            mart_request: components["schemas"]["MartRequest"];
            run?: components["schemas"]["Job"] | null;
        };
        /** MartSpec */
        MartSpec: {
            /**
             * Axes
             * @description dimension.attribute, or a dimension name
             */
            axes?: string[];
            /** Filters */
            filters?: components["schemas"]["MartFilter"][];
            /** Limit */
            limit?: number | null;
            /**
             * Metrics
             * @description Metric names
             */
            metrics: string[];
            /**
             * Name
             * @description snake_case name of the data mart
             * @default mart
             */
            name: string;
            /** Order By */
            order_by?: components["schemas"]["OrderBy"][];
            period?: components["schemas"]["Period"] | null;
            /**
             * Time Dimension
             * @description Defaults to the main date
             */
            time_dimension?: string | null;
            time_grain?: components["schemas"]["TimeGrain"] | null;
        };
        /**
         * MartStatus
         * @enum {string}
         */
        MartStatus: "drafted" | "previewed" | "validated" | "published" | "rejected";
        /** Me */
        Me: {
            /** Auth Mode */
            auth_mode: string;
            /** Roles */
            roles: {
                [key: string]: components["schemas"]["Role"];
            };
            user: components["schemas"]["User"];
            /** Via */
            via: string;
        };
        /** Measure */
        Measure: {
            /** @default sum */
            aggregation: components["schemas"]["Aggregation"];
            /**
             * Description
             * @default
             */
            description: string;
            /**
             * Explanation
             * @default
             */
            explanation: string;
            /**
             * Expression
             * @description Row-level expression over fact columns, e.g. quantite * prix_unitaire
             */
            expression: string;
            /** Name */
            name: string;
        };
        /** Membership */
        Membership: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Email
             * @default
             */
            email: string;
            /** Project Id */
            project_id: string;
            role: components["schemas"]["Role"];
            /** User Id */
            user_id: string;
        };
        /** MembershipUpdate */
        MembershipUpdate: {
            role: components["schemas"]["Role"];
        };
        /** Metric */
        Metric: {
            additivity: components["schemas"]["Additivity"];
            aggregation?: components["schemas"]["MetricAggregation"] | null;
            /**
             * Column
             * @description Fact column aggregated
             */
            column?: string | null;
            /**
             * Default
             * @description Always offered to the agent
             * @default false
             */
            default: boolean;
            /**
             * Denominator
             * @description Ratio: metric name
             */
            denominator?: string | null;
            /**
             * Description
             * @default
             */
            description: string;
            /** Fact */
            fact: string;
            /** @default decimal */
            format: components["schemas"]["MetricFormat"];
            /**
             * Formula
             * @description Readable definition, e.g. sum(montant) / sum(quantite)
             */
            formula: string;
            /**
             * Hidden
             * @default false
             */
            hidden: boolean;
            /**
             * Kind
             * @default aggregate
             * @enum {string}
             */
            kind: "aggregate" | "ratio";
            /** Label */
            label: string;
            /** Name */
            name: string;
            /**
             * Non Additive Dimensions
             * @description Semi-additive: dimensions it must not be summed over
             */
            non_additive_dimensions?: string[];
            /**
             * Numerator
             * @description Ratio: metric name
             */
            numerator?: string | null;
            /** Synonyms */
            synonyms?: string[];
            /** Unit */
            unit?: string | null;
        };
        /**
         * MetricAggregation
         * @enum {string}
         */
        MetricAggregation: "sum" | "count" | "count_distinct" | "min" | "max";
        /**
         * MetricFormat
         * @enum {string}
         */
        MetricFormat: "currency" | "integer" | "decimal" | "percent";
        /** ModelRunMetrics */
        ModelRunMetrics: {
            /** Name */
            name: string;
            /** Rows */
            rows: number;
            /** Status */
            status?: string | null;
        };
        /**
         * Normalization
         * @enum {string}
         */
        Normalization: "none" | "trim" | "collapse_whitespace" | "lowercase" | "compact_uppercase";
        /** OrderBy */
        OrderBy: {
            /**
             * Direction
             * @default desc
             * @enum {string}
             */
            direction: "asc" | "desc";
            /**
             * Field
             * @description A metric or an axis of the mart
             */
            field: string;
        };
        /** PasswordChange */
        PasswordChange: {
            /** Current Password */
            current_password: string;
            /** New Password */
            new_password: string;
        };
        /** Period */
        Period: {
            /**
             * End
             * @description Last day included
             */
            end?: string | null;
            /**
             * Label
             * @description As said by the user: 2024, T1 2024
             */
            label?: string | null;
            /**
             * Start
             * @description First day included
             */
            start?: string | null;
        };
        /** PiiDetection */
        PiiDetection: {
            /** Column */
            column: string;
            /** Confidence */
            confidence: number;
            level: components["schemas"]["ConfidenceLevel"];
            /** Match Ratio */
            match_ratio: number;
            /** Method */
            method: string;
            /** Name Hint */
            name_hint: boolean;
            pii_type: components["schemas"]["PiiType"];
        };
        /**
         * PiiTreatment
         * @description Treatment applied when data leaves Forja (serving database and exports).
         * @enum {string}
         */
        PiiTreatment: "hash" | "mask" | "drop" | "none";
        /**
         * PiiType
         * @enum {string}
         */
        PiiType: "email" | "phone" | "iban" | "first_name" | "last_name" | "full_name";
        /** PlanPatch */
        PlanPatch: {
            /**
             * Columns
             * @description Changes keyed by source column name
             */
            columns?: {
                [key: string]: components["schemas"]["ColumnPatch"];
            };
            /** Deduplicate */
            deduplicate?: boolean | null;
            /**
             * Primary Key
             * @description Source column names; an empty list removes the key
             */
            primary_key?: string[] | null;
        };
        /**
         * PlanStatus
         * @enum {string}
         */
        PlanStatus: "draft" | "approved" | "applied";
        /** PreviewResponse */
        PreviewResponse: {
            /** Columns */
            columns: string[];
            /** Limit */
            limit: number;
            /** Rows */
            rows: {
                [key: string]: unknown;
            }[];
            /** Source Id */
            source_id: string;
            /** Total Rows */
            total_rows: number;
        };
        /** PrimaryKeyPlan */
        PrimaryKeyPlan: {
            /**
             * Columns
             * @description Source column names
             */
            columns: string[];
            /**
             * Explanation
             * @default
             */
            explanation: string;
            /**
             * Quasi Unique
             * @description Not strictly unique at profiling: some rows will be rejected
             * @default false
             */
            quasi_unique: boolean;
        };
        /** ProfileReport */
        ProfileReport: {
            /** Candidate Keys */
            candidate_keys: components["schemas"]["CandidateKey"][];
            /** Column Count */
            column_count: number;
            /** Columns */
            columns: components["schemas"]["ColumnProfile"][];
            duplicates: components["schemas"]["DuplicateStats"];
            /** Pii */
            pii: components["schemas"]["PiiDetection"][];
            /**
             * Profiled At
             * Format: date-time
             */
            profiled_at: string;
            /**
             * Profiler Version
             * @default 2
             */
            profiler_version: string;
            quality: components["schemas"]["QualityScore"];
            /** Row Count */
            row_count: number;
            /** Source Id */
            source_id: string;
            /** Source Name */
            source_name: string;
            /** Version */
            version?: number | null;
            /** Version Id */
            version_id?: string | null;
        };
        /** Project */
        Project: {
            architecture: components["schemas"]["Architecture"];
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Description */
            description?: string | null;
            /** Id */
            id: string;
            /** Name */
            name: string;
        };
        /** ProjectCreate */
        ProjectCreate: {
            /** @default medallion */
            architecture: components["schemas"]["Architecture"];
            /** Description */
            description?: string | null;
            /** Name */
            name: string;
        };
        /** ProposeRequest */
        ProposeRequest: {
            /**
             * Use Llm
             * @default true
             */
            use_llm: boolean;
        };
        /** QualityComponent */
        QualityComponent: {
            /** Details */
            details: string;
            /** Name */
            name: string;
            /** Points */
            points: number;
            /** Score */
            score: number;
            /** Weight */
            weight: number;
        };
        /** QualityScore */
        QualityScore: {
            /** Components */
            components: components["schemas"]["QualityComponent"][];
            /** Formula */
            formula: string;
            /** Issues */
            issues?: string[];
            /** Score */
            score: number;
        };
        /** RefreshRequest */
        RefreshRequest: {
            /** Refresh Token */
            refresh_token: string;
        };
        /** Registration */
        Registration: {
            /** Password */
            password: string;
            /** Token */
            token: string;
        };
        /**
         * Relation
         * @description ``from_table.from_column`` references the key ``to_table.to_column``.
         */
        Relation: {
            /**
             * Cardinality
             * @enum {string}
             */
            cardinality: "1-1" | "N-1";
            /** Confidence */
            confidence: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Explanation */
            explanation: string;
            /** From Column */
            from_column: string;
            /**
             * From Distinct
             * @description Distinct values of from_column
             */
            from_distinct: number;
            /** From Source */
            from_source: string;
            /** From Source Id */
            from_source_id: string;
            /** From Table */
            from_table: string;
            /** Id */
            id: string;
            /**
             * Inclusion Ratio
             * @description Share of distinct from_column values found in to_column
             */
            inclusion_ratio: number;
            /** Name Similarity */
            name_similarity: number;
            origin: components["schemas"]["RelationOrigin"];
            /** Project Id */
            project_id: string;
            /**
             * Sample Size
             * @description Distinct values actually checked
             */
            sample_size: number;
            status: components["schemas"]["RelationStatus"];
            /** To Column */
            to_column: string;
            /** To Source */
            to_source: string;
            /** To Source Id */
            to_source_id: string;
            /** To Table */
            to_table: string;
            /** Type Compatible */
            type_compatible: boolean;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /** RelationCreate */
        RelationCreate: {
            /**
             * From Column
             * @description Silver column name
             */
            from_column: string;
            /** From Source Id */
            from_source_id: string;
            /**
             * To Column
             * @description Silver column name of a key
             */
            to_column: string;
            /** To Source Id */
            to_source_id: string;
        };
        /**
         * RelationOrigin
         * @enum {string}
         */
        RelationOrigin: "detected" | "manual";
        /**
         * RelationStatus
         * @enum {string}
         */
        RelationStatus: "suggested" | "confirmed" | "rejected";
        /**
         * Role
         * @enum {string}
         */
        Role: "admin" | "engineer" | "analyst";
        /**
         * RuleKind
         * @enum {string}
         */
        RuleKind: "castable" | "not_null" | "email_format" | "phone_format" | "iban_format";
        /** RunMetrics */
        RunMetrics: {
            dbt_tests?: components["schemas"]["DbtTestSummary"] | null;
            /**
             * Duplicates Removed
             * @default 0
             */
            duplicates_removed: number;
            /**
             * Duration Seconds
             * @default 0
             */
            duration_seconds: number;
            /** Exports */
            exports?: components["schemas"]["ExportedFile"][];
            /** Llm Calls */
            llm_calls?: components["schemas"]["LLMUsage"][];
            /** Models */
            models?: components["schemas"]["ModelRunMetrics"][];
            /**
             * Profiled Sources
             * @default 0
             */
            profiled_sources: number;
            /**
             * Relations Detected
             * @default 0
             */
            relations_detected: number;
            /**
             * Rows Read
             * @default 0
             */
            rows_read: number;
            /**
             * Rows Rejected
             * @default 0
             */
            rows_rejected: number;
            /**
             * Rows Valid
             * @default 0
             */
            rows_valid: number;
            /** Serving Path */
            serving_path?: string | null;
            /** Sources */
            sources?: components["schemas"]["SourceRunMetrics"][];
            /** Unknown Member Rows */
            unknown_member_rows?: components["schemas"]["UnknownMemberRows"][];
        };
        /** RunRequest */
        RunRequest: {
            /** Csv Delimiter */
            csv_delimiter?: string | null;
            /**
             * Formats
             * @description export: file formats written next to the serving database
             */
            formats?: components["schemas"]["ExportFormat"][];
            /**
             * Full Refresh
             * @description build_silver: rebuild Silver tables from all Bronze batches
             * @default false
             */
            full_refresh: boolean;
            /**
             * Mart Request Id
             * @description mart_request and publish_mart: the request processed
             */
            mart_request_id?: string | null;
            /**
             * Source Ids
             * @description Sources to process; all sources of the project by default
             */
            source_ids?: string[] | null;
            type: components["schemas"]["JobType"];
            /**
             * Use Llm
             * @description gold_proposal: ask the configured LLM, else the heuristic
             * @default true
             */
            use_llm: boolean;
        };
        /**
         * ScdType
         * @enum {string}
         */
        ScdType: "scd1" | "scd2";
        /**
         * SchemaDrift
         * @description Differences between a source version and the previous one.
         */
        SchemaDrift: {
            /** Added */
            added?: string[];
            /** Has Drift */
            readonly has_drift: boolean;
            /** Previous Version */
            previous_version: number;
            /** Removed */
            removed?: string[];
            /** Type Changed */
            type_changed?: components["schemas"]["TypeChange"][];
        };
        /** SemanticDimension */
        SemanticDimension: {
            /** Attributes */
            attributes?: components["schemas"]["Attribute"][];
            /**
             * Description
             * @default
             */
            description: string;
            /**
             * Display Attribute
             * @description Attribute used when the dimension is asked for by name
             */
            display_attribute?: string | null;
            /** Fact */
            fact: string;
            /**
             * Fact Key
             * @description Foreign key column of the fact
             */
            fact_key?: string | null;
            /**
             * Hidden
             * @default false
             */
            hidden: boolean;
            /** Hierarchies */
            hierarchies?: components["schemas"]["Hierarchy"][];
            /**
             * Historized
             * @description SCD2: attributes as they were at the fact date
             * @default false
             */
            historized: boolean;
            /**
             * Kind
             * @enum {string}
             */
            kind: "standard" | "degenerate" | "time";
            /** Label */
            label: string;
            /** Name */
            name: string;
            /** Synonyms */
            synonyms?: string[];
            /**
             * Table
             * @description Gold table: dim_*, dim_date, or the fact (degenerate)
             */
            table: string;
            /**
             * Table Key
             * @description Key column of the dimension
             */
            table_key?: string | null;
        };
        /** SemanticLayer */
        SemanticLayer: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Created By */
            created_by?: string | null;
            /** Default Time Dimension */
            default_time_dimension?: string | null;
            /** Dimensions */
            dimensions?: components["schemas"]["SemanticDimension"][];
            /** Gold Plan Version */
            gold_plan_version: number;
            /** Id */
            id: string;
            /** Metrics */
            metrics?: components["schemas"]["Metric"][];
            /**
             * Overrides
             * @description Manual edits applied on top of the generated layer
             */
            overrides?: components["schemas"]["SemanticOverride"][];
            /** Project Id */
            project_id: string;
            /** Version */
            version: number;
        };
        /**
         * SemanticOverride
         * @description A manual edit of one element; ``None`` keeps the generated value.
         */
        SemanticOverride: {
            /**
             * Add Synonyms
             * @description Added to the synonyms
             */
            add_synonyms?: string[];
            /** Description */
            description?: string | null;
            /** Hidden */
            hidden?: boolean | null;
            /** Label */
            label?: string | null;
            /**
             * Synonyms
             * @description Replaces the generated synonyms when set
             */
            synonyms?: string[] | null;
            /**
             * Target
             * @description metric:<name>, dimension:<name> or attribute:<dimension>.<attribute>
             */
            target: string;
            /** Updated At */
            updated_at?: string | null;
            /** Updated By */
            updated_by?: string | null;
        };
        /** SemanticPatch */
        SemanticPatch: {
            /** Overrides */
            overrides: components["schemas"]["SemanticOverride"][];
        };
        /**
         * SilverType
         * @description Types of Silver columns, named as in DuckDB.
         * @enum {string}
         */
        SilverType: "bigint" | "double" | "decimal(18,2)" | "boolean" | "date" | "timestamp" | "varchar";
        /**
         * Source
         * @description A logical source. Descriptive fields reflect its latest version.
         */
        Source: {
            /** Bronze Path */
            bronze_path: string;
            /** Column Count */
            column_count: number;
            /** Columns */
            columns: components["schemas"]["ColumnSchema"][];
            /** Delimiter */
            delimiter?: string | null;
            /** Encoding */
            encoding?: string | null;
            format: components["schemas"]["SourceFormat"];
            /** Id */
            id: string;
            /**
             * Ingested At
             * Format: date-time
             */
            ingested_at: string;
            /** Latest Version Id */
            latest_version_id?: string | null;
            /** Name */
            name: string;
            /** Original Filename */
            original_filename: string;
            /** Project Id */
            project_id: string;
            /** Quality Score */
            quality_score?: number | null;
            /** Row Count */
            row_count: number;
            schema_drift?: components["schemas"]["SchemaDrift"] | null;
            /** Sheet Name */
            sheet_name?: string | null;
            /**
             * Version
             * @default 1
             */
            version: number;
            /** Warnings */
            warnings?: string[];
        };
        /**
         * SourceFormat
         * @enum {string}
         */
        SourceFormat: "csv" | "excel" | "parquet" | "json";
        /** SourceRunMetrics */
        SourceRunMetrics: {
            /**
             * Duplicates Removed
             * @default 0
             */
            duplicates_removed: number;
            /** Full Refresh */
            full_refresh: boolean;
            /** Model */
            model: string;
            /** Model Status */
            model_status?: string | null;
            /** Plan Version */
            plan_version: number;
            /**
             * Rows Already Processed
             * @default 0
             */
            rows_already_processed: number;
            /**
             * Rows Read
             * @description Bronze rows not processed by a previous run
             */
            rows_read: number;
            /**
             * Rows Rejected
             * @default 0
             */
            rows_rejected: number;
            /**
             * Rows Superseded
             * @description Older rows of a key replaced by a more recent one in the same run
             * @default 0
             */
            rows_superseded: number;
            /**
             * Rows Valid
             * @default 0
             */
            rows_valid: number;
            /** Source Id */
            source_id: string;
            /** Source Name */
            source_name: string;
        };
        /**
         * SourceVersion
         * @description One ingested batch of a source. ``id`` is the ``_batch_id`` written in Bronze.
         */
        SourceVersion: {
            /** Bronze Path */
            bronze_path: string;
            /** Columns */
            columns: components["schemas"]["ColumnSchema"][];
            /** Delimiter */
            delimiter?: string | null;
            /** Encoding */
            encoding?: string | null;
            format: components["schemas"]["SourceFormat"];
            /** Id */
            id: string;
            /**
             * Ingested At
             * Format: date-time
             */
            ingested_at: string;
            /**
             * New Row Count
             * @description Rows whose _row_hash was not in earlier versions
             */
            new_row_count: number;
            /** Original Filename */
            original_filename: string;
            /** Row Count */
            row_count: number;
            schema_drift?: components["schemas"]["SchemaDrift"] | null;
            /** Sheet Name */
            sheet_name?: string | null;
            /** Source Id */
            source_id: string;
            /** Version */
            version: number;
            /** Warnings */
            warnings?: string[];
        };
        /** SynonymProposal */
        SynonymProposal: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Id */
            id: string;
            /** Mart Request Id */
            mart_request_id?: string | null;
            /** Project Id */
            project_id: string;
            /** Proposed By */
            proposed_by: string;
            /** Reviewed At */
            reviewed_at?: string | null;
            /** Reviewed By */
            reviewed_by?: string | null;
            /**
             * Status
             * @default pending
             * @enum {string}
             */
            status: "pending" | "accepted" | "rejected";
            /** Synonym */
            synonym: string;
            /**
             * Target
             * @description metric:<name>, dimension:<name> or attribute:<dim>.<attr>
             */
            target: string;
        };
        /** SynonymProposalCreate */
        SynonymProposalCreate: {
            /** Mart Request Id */
            mart_request_id?: string | null;
            /** Synonym */
            synonym: string;
            /** Target */
            target: string;
        };
        /**
         * TableLayer
         * @enum {string}
         */
        TableLayer: "silver" | "gold" | "mart";
        /** TablePreview */
        TablePreview: {
            /** Columns */
            columns: string[];
            /** Limit */
            limit: number;
            /** Rows */
            rows: {
                [key: string]: unknown;
            }[];
            /** Table Id */
            table_id: string;
            /** Total Rows */
            total_rows: number;
        };
        /** TableUpdate */
        TableUpdate: {
            /**
             * Publish
             * @description Publish the table to the serving database (Gold tables are by default)
             */
            publish: boolean;
        };
        /**
         * TimeGrain
         * @enum {string}
         */
        TimeGrain: "jour" | "semaine" | "mois" | "trimestre" | "annee";
        /** TokenPair */
        TokenPair: {
            /** Access Token */
            access_token: string;
            /**
             * Expires In
             * @description Lifetime of the access token, in seconds
             */
            expires_in: number;
            /**
             * Must Change Password
             * @default false
             */
            must_change_password: boolean;
            /** Refresh Token */
            refresh_token: string;
            /**
             * Token Type
             * @default bearer
             * @constant
             */
            token_type: "bearer";
        };
        /** TopValue */
        TopValue: {
            /** Count */
            count: number;
            /** Pct */
            pct: number;
            /** Value */
            value: string;
        };
        /** TransformationPlan */
        TransformationPlan: {
            /** Based On Source Version */
            based_on_source_version: number;
            /** Columns */
            columns: components["schemas"]["ColumnPlan"][];
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            deduplication?: components["schemas"]["DeduplicationPlan"];
            /** Id */
            id: string;
            /** Model Name */
            model_name: string;
            primary_key?: components["schemas"]["PrimaryKeyPlan"] | null;
            /** Project Id */
            project_id: string;
            /** Source Id */
            source_id: string;
            /** Source Name */
            source_name: string;
            status: components["schemas"]["PlanStatus"];
            /**
             * Summary
             * @default
             */
            summary: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
            /** Version */
            version: number;
            /** Warnings */
            warnings?: string[];
        };
        /** TypeChange */
        TypeChange: {
            /** Column */
            column: string;
            /**
             * Level
             * @enum {string}
             */
            level: "physical" | "inferred";
            /** New Type */
            new_type: string;
            /** Previous Type */
            previous_type: string;
        };
        /** TypeInference */
        TypeInference: {
            /** Decimal Separator */
            decimal_separator?: ("," | ".") | null;
            /**
             * Format
             * @description strptime format for dates
             */
            format?: string | null;
            /**
             * From Text
             * @description True when the type was inferred from text values
             */
            from_text: boolean;
            inferred_type: components["schemas"]["InferredType"];
            /**
             * Match Ratio
             * @description Share of values matching the type
             */
            match_ratio: number;
            /**
             * Max Decimals
             * @description Most fractional digits seen in a decimal column
             */
            max_decimals?: number | null;
            /** @description Type matched by most, but not enough, values */
            near_type?: components["schemas"]["InferredType"] | null;
            /** Near Type Ratio */
            near_type_ratio?: number | null;
            /** Physical Type */
            physical_type: string;
        };
        /**
         * UnknownMemberRows
         * @description Fact rows whose key matched no dimension member and took the unknown member.
         */
        UnknownMemberRows: {
            /** Dimension */
            dimension: string;
            /** Fact */
            fact: string;
            /** Key */
            key: string;
            /** Rows */
            rows: number;
        };
        /** User */
        User: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Disabled
             * @default false
             */
            disabled: boolean;
            /** Email */
            email: string;
            /** Id */
            id: string;
            /**
             * Identity Provider
             * @description password, or a future oidc
             * @default password
             */
            identity_provider: string;
            /**
             * Is Admin
             * @description Instance administrator
             * @default false
             */
            is_admin: boolean;
            /**
             * Must Change Password
             * @default false
             */
            must_change_password: boolean;
        };
        /** ValidationError */
        ValidationError: {
            /** Context */
            ctx?: Record<string, never>;
            /** Input */
            input?: unknown;
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
        };
        /** ValidationIssue */
        ValidationIssue: {
            /** Code */
            code: string;
            /**
             * Location
             * @default
             */
            location: string;
            /** Message */
            message: string;
            /**
             * Severity
             * @enum {string}
             */
            severity: "error" | "warning";
        };
        /**
         * ValidityRule
         * @description A row failing an enabled rule is quarantined in the rejects table.
         */
        ValidityRule: {
            /**
             * Enabled
             * @default true
             */
            enabled: boolean;
            /**
             * Explanation
             * @default
             */
            explanation: string;
            kind: components["schemas"]["RuleKind"];
        };
        /** WarehouseTable */
        WarehouseTable: {
            /**
             * Built At
             * Format: date-time
             */
            built_at: string;
            /** Columns */
            columns: components["schemas"]["ColumnSchema"][];
            /** Id */
            id: string;
            /** Last Run Id */
            last_run_id?: string | null;
            /** @default silver */
            layer: components["schemas"]["TableLayer"];
            /** Name */
            name: string;
            /**
             * Owner Id
             * @description Data marts: the requesting user
             */
            owner_id?: string | null;
            /**
             * Plan Version
             * @description Version of the Silver plan, or of the Gold plan
             */
            plan_version: number;
            /** Project Id */
            project_id: string;
            /**
             * Publish
             * @description Published to the serving database (Gold tables by default)
             * @default false
             */
            publish: boolean;
            /**
             * Rejected Count
             * @default 0
             */
            rejected_count: number;
            /** Row Count */
            row_count: number;
            /**
             * Source Id
             * @description Silver tables: their source
             */
            source_id?: string | null;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
};
export type $defs = Record<string, never>;
export interface operations {
    instance_audit_audit_get: {
        parameters: {
            query?: {
                action?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "action": "mart.reject",
                     *         "at": "2026-10-24T14:27:30.903968Z",
                     *         "details": {
                     *           "reason": "doublon"
                     *         },
                     *         "id": "9ce3afe5dc284cd19b982754085e5aed",
                     *         "object_id": "6f65603944e144be87c4ded98fcce278",
                     *         "object_type": "mart_request",
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "user_email": "analyste@demo.forja.local",
                     *         "user_id": "d7605ffdaaed4ce6992f576ea252fa3d"
                     *       },
                     *       {
                     *         "action": "agent.request",
                     *         "at": "2026-10-24T14:27:30.874905Z",
                     *         "details": {
                     *           "question": "Panier moyen par segment"
                     *         },
                     *         "id": "1e822b784f094f1e848aec47cf874768",
                     *         "object_id": "6f65603944e144be87c4ded98fcce278",
                     *         "object_type": "mart_request",
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "user_email": "analyste@demo.forja.local",
                     *         "user_id": "d7605ffdaaed4ce6992f576ea252fa3d"
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["AuditEntry"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_api_keys_auth_api_keys_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "created_at": "2026-10-24T14:27:17.923930Z",
                     *         "id": "020290cc00454f879af0b0ec0eda3506",
                     *         "last_used_at": null,
                     *         "name": "Power BI",
                     *         "prefix": "5e3c20a7",
                     *         "revoked_at": null,
                     *         "user_id": "7a852422d26d4e1ea6ce9a431f046b03"
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["ApiKey"][];
                };
            };
        };
    };
    create_api_key_auth_api_keys_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ApiKeyCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "created_at": "2026-10-24T14:27:17.923930Z",
                     *       "id": "020290cc00454f879af0b0ec0eda3506",
                     *       "key": "fja_5e3c20a7_…",
                     *       "last_used_at": null,
                     *       "name": "Power BI",
                     *       "prefix": "5e3c20a7",
                     *       "revoked_at": null,
                     *       "user_id": "7a852422d26d4e1ea6ce9a431f046b03"
                     *     }
                     */
                    "application/json": components["schemas"]["CreatedApiKey"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    revoke_api_key_auth_api_keys__key_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                key_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "created_at": "2026-10-24T14:27:17.923930Z",
                     *       "id": "020290cc00454f879af0b0ec0eda3506",
                     *       "last_used_at": null,
                     *       "name": "Power BI",
                     *       "prefix": "5e3c20a7",
                     *       "revoked_at": "2026-10-24T14:27:17.971113Z",
                     *       "user_id": "7a852422d26d4e1ea6ce9a431f046b03"
                     *     }
                     */
                    "application/json": components["schemas"]["ApiKey"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    login_auth_login_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "access_token": "eyJhbGciOiJIUzI1NiIs…",
                     *       "expires_in": 900,
                     *       "must_change_password": true,
                     *       "refresh_token": "frt_…",
                     *       "token_type": "bearer"
                     *     }
                     */
                    "application/json": components["schemas"]["TokenPair"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    logout_auth_logout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    me_auth_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "auth_mode": "multi",
                     *       "roles": {},
                     *       "user": {
                     *         "created_at": "2026-10-24T14:26:43.629179Z",
                     *         "disabled": false,
                     *         "email": "admin@forja.local",
                     *         "id": "7a852422d26d4e1ea6ce9a431f046b03",
                     *         "identity_provider": "password",
                     *         "is_admin": true,
                     *         "must_change_password": false
                     *       },
                     *       "via": "password"
                     *     }
                     */
                    "application/json": components["schemas"]["Me"];
                };
            };
        };
    };
    change_password_auth_password_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PasswordChange"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "access_token": "eyJhbGciOiJIUzI1NiIs…",
                     *       "expires_in": 900,
                     *       "must_change_password": false,
                     *       "refresh_token": "frt_…",
                     *       "token_type": "bearer"
                     *     }
                     */
                    "application/json": components["schemas"]["TokenPair"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    refresh_auth_refresh_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefreshRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "access_token": "eyJhbGciOiJIUzI1NiIs…",
                     *       "expires_in": 900,
                     *       "must_change_password": false,
                     *       "refresh_token": "frt_…",
                     *       "token_type": "bearer"
                     *     }
                     */
                    "application/json": components["schemas"]["TokenPair"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    register_auth_register_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Registration"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "access_token": "eyJhbGciOiJIUzI1NiIs…",
                     *       "expires_in": 900,
                     *       "must_change_password": false,
                     *       "refresh_token": "frt_…",
                     *       "token_type": "bearer"
                     *     }
                     */
                    "application/json": components["schemas"]["TokenPair"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_users_auth_users_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "created_at": "2026-10-24T14:26:43.629179Z",
                     *         "disabled": false,
                     *         "email": "admin@forja.local",
                     *         "id": "7a852422d26d4e1ea6ce9a431f046b03",
                     *         "identity_provider": "password",
                     *         "is_admin": true,
                     *         "must_change_password": false
                     *       },
                     *       {
                     *         "created_at": "2026-10-24T14:27:01.113517Z",
                     *         "disabled": false,
                     *         "email": "ingenieur@demo.forja.local",
                     *         "id": "a2d87f35f7994e0ca9073a744c735e2c",
                     *         "identity_provider": "password",
                     *         "is_admin": false,
                     *         "must_change_password": false
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["User"][];
                };
            };
        };
    };
    health_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "auth_mode": "local",
                     *       "status": "ok",
                     *       "version": "0.1.0"
                     *     }
                     */
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
        };
    };
    get_mart_request_mart_requests__mart_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                mart_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "approved_at": null,
                     *       "approved_by": null,
                     *       "bindings": {
                     *         "vente": "metric:montant"
                     *       },
                     *       "created_at": "2026-10-24T14:27:22.205940Z",
                     *       "exports": [],
                     *       "id": "9403432ab13448bba8c9e1151877f178",
                     *       "iterations": [
                     *         {
                     *           "clarification": {
                     *             "options": [
                     *               {
                     *                 "label": "Chiffre d'affaires",
                     *                 "ref": "metric:montant"
                     *               },
                     *               {
                     *                 "label": "Quantité vendue",
                     *                 "ref": "metric:quantite"
                     *               }
                     *             ],
                     *             "question": "Que voulez-vous dire par « ventes » ?",
                     *             "term": "ventes"
                     *           },
                     *           "context_tokens": 233,
                     *           "created_at": "2026-10-24T14:27:22.205940Z",
                     *           "effective": "Les ventes par produit en 2024",
                     *           "error": null,
                     *           "instruction": "Les ventes par produit en 2024",
                     *           "job_id": "9cbaff846a264f9cb3217dc164cdc6f8",
                     *           "kind": "question",
                     *           "llm": null,
                     *           "path": "parser",
                     *           "preview": null,
                     *           "refines": false,
                     *           "refusal": null,
                     *           "selected": [
                     *             "metric:montant",
                     *             "metric:quantite"
                     *           ],
                     *           "spec": null,
                     *           "sql": null,
                     *           "status": "clarification",
                     *           "summary": null,
                     *           "version": 1
                     *         },
                     *         {
                     *           "clarification": null,
                     *           "context_tokens": 233,
                     *           "created_at": "2026-10-24T14:27:22.675569Z",
                     *           "effective": "Les ventes par produit en 2024",
                     *           "error": null,
                     *           "instruction": "Chiffre d'affaires",
                     *           "job_id": "115aba34c8c3460881561be92a803f2e",
                     *           "kind": "answer",
                     *           "llm": null,
                     *           "path": "parser",
                     *           "preview": {
                     *             "columns": [
                     *               {
                     *                 "additivity": null,
                     *                 "kind": "axis",
                     *                 "label": "Libellé (produit)",
                     *                 "name": "libelle",
                     *                 "pii": null,
                     *                 "ref": "attribute:produit.libelle"
                     *               },
                     *               {
                     *                 "additivity": "additive",
                     *                 "kind": "metric",
                     *                 "label": "Chiffre d'affaires (EUR)",
                     *                 "name": "montant",
                     *                 "pii": null,
                     *                 "ref": "metric:montant"
                     *               }
                     *             ],
                     *             "controls": [
                     *               {
                     *                 "code": "reconciliation",
                     *                 "details": {
                     *                   "fact_total": 4994.8,
                     *                   "mart_total": 4994.8,
                     *                   "metric": "montant"
                     *                 },
                     *                 "message": "Chiffre d'affaires : total du data mart 4 994.80 = total du fait fct_ventes sur le même périmètre.",
                     *                 "status": "ok"
                     *               },
                     *               {
                     *                 "code": "unknown_member",
                     *                 "details": {
                     *                   "dimension": "produit",
                     *                   "rows": 1,
                     *                   "share": 0.0127
                     *                 },
                     *                 "message": "1 ligne(s) du fait sur 79 (1.3%) rattachée(s) au membre inconnu de produit : elles apparaissent sous « Inconnu » ou une valeur vide.",
                     *                 "status": "warning"
                     *               }
                     *             ],
                     *             "pseudonymized": [],
                     *             "row_count": 12,
                     *             "rows": [
                     *               {
                     *                 "libelle": "Plaid tricoté",
                     *                 "montant": 1377.7
                     *               },
                     *               {
                     *                 "libelle": "Théière en fonte",
                     *                 "montant": 630
                     *               }
                     *             ]
                     *           },
                     *           "refines": false,
                     *           "refusal": null,
                     *           "selected": [
                     *             "metric:montant",
                     *             "metric:quantite"
                     *           ],
                     *           "spec": {
                     *             "axes": [
                     *               "produit.libelle"
                     *             ],
                     *             "filters": [],
                     *             "limit": null,
                     *             "metrics": [
                     *               "montant"
                     *             ],
                     *             "name": "montant_par_libelle_2024",
                     *             "order_by": [],
                     *             "period": {
                     *               "end": "2024-12-31",
                     *               "label": "2024",
                     *               "start": "2024-01-01"
                     *             },
                     *             "time_dimension": "date_commande",
                     *             "time_grain": null
                     *           },
                     *           "sql": "with base as (\n\n    select\n        produit.libelle as libelle,\n        f.montant as _m_montant\n    from \"fct_ventes\" as f\n    left join \"dim_produits\" as produit\n        on produit.produit_key = f.produit_key\n    left join \"dim_date\" as date_commande\n        on date_commande.date_key = f.date_commande_key\n    where date_commande.date >= DATE '2024-01-01'\n        and date_commande.date <= DATE '202…",
                     *           "status": "previewed",
                     *           "summary": "Chiffre d'affaires par produit, sur 2024.",
                     *           "version": 2
                     *         }
                     *       ],
                     *       "model_columns": [],
                     *       "model_sql": null,
                     *       "model_summary": null,
                     *       "owner_email": "analyste@demo.forja.local",
                     *       "owner_id": "d7605ffdaaed4ce6992f576ea252fa3d",
                     *       "owner_unmasked": false,
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "publish_error": null,
                     *       "publish_job_id": null,
                     *       "published_at": null,
                     *       "published_name": null,
                     *       "published_table_id": null,
                     *       "question": "Les ventes par produit en 2024",
                     *       "rejected_by": null,
                     *       "rejection_reason": null,
                     *       "semantic_version": 3,
                     *       "status": "previewed",
                     *       "updated_at": "2026-10-24T14:27:23.184828Z",
                     *       "validated_at": null
                     *     }
                     */
                    "application/json": components["schemas"]["MartRequest"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    answer_mart_request_mart_requests__mart_id__answer_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                mart_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClarificationAnswer"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "mart_request": {
                     *         "approved_at": null,
                     *         "approved_by": null,
                     *         "bindings": {
                     *           "vente": "metric:montant"
                     *         },
                     *         "created_at": "2026-10-24T14:27:22.205940Z",
                     *         "exports": [],
                     *         "id": "9403432ab13448bba8c9e1151877f178",
                     *         "iterations": [
                     *           {
                     *             "clarification": {
                     *               "options": [
                     *                 {
                     *                   "label": "Chiffre d'affaires",
                     *                   "ref": "metric:montant"
                     *                 },
                     *                 {
                     *                   "label": "Quantité vendue",
                     *                   "ref": "metric:quantite"
                     *                 }
                     *               ],
                     *               "question": "Que voulez-vous dire par « ventes » ?",
                     *               "term": "ventes"
                     *             },
                     *             "context_tokens": 233,
                     *             "created_at": "2026-10-24T14:27:22.205940Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Les ventes par produit en 2024",
                     *             "job_id": "9cbaff846a264f9cb3217dc164cdc6f8",
                     *             "kind": "question",
                     *             "llm": null,
                     *             "path": "parser",
                     *             "preview": null,
                     *             "refines": false,
                     *             "refusal": null,
                     *             "selected": [
                     *               "metric:montant",
                     *               "metric:quantite"
                     *             ],
                     *             "spec": null,
                     *             "sql": null,
                     *             "status": "clarification",
                     *             "summary": null,
                     *             "version": 1
                     *           },
                     *           {
                     *             "clarification": null,
                     *             "context_tokens": 233,
                     *             "created_at": "2026-10-24T14:27:22.675569Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Chiffre d'affaires",
                     *             "job_id": "115aba34c8c3460881561be92a803f2e",
                     *             "kind": "answer",
                     *             "llm": null,
                     *             "path": "parser",
                     *             "preview": {
                     *               "columns": [
                     *                 {
                     *                   "additivity": null,
                     *                   "kind": "axis",
                     *                   "label": "Libellé (produit)",
                     *                   "name": "libelle",
                     *                   "pii": null,
                     *                   "ref": "attribute:produit.libelle"
                     *                 },
                     *                 {
                     *                   "additivity": "additive",
                     *                   "kind": "metric",
                     *                   "label": "Chiffre d'affaires (EUR)",
                     *                   "name": "montant",
                     *                   "pii": null,
                     *                   "ref": "metric:montant"
                     *                 }
                     *               ],
                     *               "controls": [
                     *                 {
                     *                   "code": "reconciliation",
                     *                   "details": {
                     *                     "fact_total": 4994.8,
                     *                     "mart_total": 4994.8,
                     *                     "metric": "montant"
                     *                   },
                     *                   "message": "Chiffre d'affaires : total du data mart 4 994.80 = total du fait fct_ventes sur le même périmètre.",
                     *                   "status": "ok"
                     *                 },
                     *                 {
                     *                   "code": "unknown_member",
                     *                   "details": {
                     *                     "dimension": "produit",
                     *                     "rows": 1,
                     *                     "share": 0.0127
                     *                   },
                     *                   "message": "1 ligne(s) du fait sur 79 (1.3%) rattachée(s) au membre inconnu de produit : elles apparaissent sous « Inconnu » ou une valeur vide.",
                     *                   "status": "warning"
                     *                 }
                     *               ],
                     *               "pseudonymized": [],
                     *               "row_count": 12,
                     *               "rows": [
                     *                 {
                     *                   "libelle": "Plaid tricoté",
                     *                   "montant": 1377.7
                     *                 },
                     *                 {
                     *                   "libelle": "Théière en fonte",
                     *                   "montant": 630
                     *                 }
                     *               ]
                     *             },
                     *             "refines": false,
                     *             "refusal": null,
                     *             "selected": [
                     *               "metric:montant",
                     *               "metric:quantite"
                     *             ],
                     *             "spec": {
                     *               "axes": [
                     *                 "produit.libelle"
                     *               ],
                     *               "filters": [],
                     *               "limit": null,
                     *               "metrics": [
                     *                 "montant"
                     *               ],
                     *               "name": "montant_par_libelle_2024",
                     *               "order_by": [],
                     *               "period": {
                     *                 "end": "2024-12-31",
                     *                 "label": "2024",
                     *                 "start": "2024-01-01"
                     *               },
                     *               "time_dimension": "date_commande",
                     *               "time_grain": null
                     *             },
                     *             "sql": "with base as (\n\n    select\n        produit.libelle as libelle,\n        f.montant as _m_montant\n    from \"fct_ventes\" as f\n    left join \"dim_produits\" as produit\n        on produit.produit_key = f.produit_key\n    left join \"dim_date\" as date_commande\n        on date_commande.date_key = f.date_commande_key\n    where date_commande.date >= DATE '2024-01-01'\n        and date_commande.date <= DATE '202…",
                     *             "status": "previewed",
                     *             "summary": "Chiffre d'affaires par produit, sur 2024.",
                     *             "version": 2
                     *           }
                     *         ],
                     *         "model_columns": [],
                     *         "model_sql": null,
                     *         "model_summary": null,
                     *         "owner_email": "analyste@demo.forja.local",
                     *         "owner_id": "d7605ffdaaed4ce6992f576ea252fa3d",
                     *         "owner_unmasked": false,
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "publish_error": null,
                     *         "publish_job_id": null,
                     *         "published_at": null,
                     *         "published_name": null,
                     *         "published_table_id": null,
                     *         "question": "Les ventes par produit en 2024",
                     *         "rejected_by": null,
                     *         "rejection_reason": null,
                     *         "semantic_version": 3,
                     *         "status": "previewed",
                     *         "updated_at": "2026-10-24T14:27:22.875348Z",
                     *         "validated_at": null
                     *       },
                     *       "run": {
                     *         "attempts": 0,
                     *         "cancel_requested": false,
                     *         "created_at": "2026-10-24T14:27:22.676572Z",
                     *         "created_by": "d7605ffdaaed4ce6992f576ea252fa3d",
                     *         "error": null,
                     *         "finished_at": null,
                     *         "id": "115aba34c8c3460881561be92a803f2e",
                     *         "metrics": null,
                     *         "params": {
                     *           "csv_delimiter": null,
                     *           "formats": [
                     *             "parquet",
                     *             "csv"
                     *           ],
                     *           "full_refresh": false,
                     *           "mart_request_id": "9403432ab13448bba8c9e1151877f178",
                     *           "source_ids": null,
                     *           "type": "mart_request",
                     *           "use_llm": true
                     *         },
                     *         "progress": null,
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "result": null,
                     *         "started_at": null,
                     *         "status": "queued",
                     *         "type": "mart_request"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["MartRequestRun"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    approve_mart_request_mart_requests__mart_id__approve_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                mart_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "mart_request": {
                     *         "approved_at": "2026-10-24T14:27:23.301722Z",
                     *         "approved_by": "a2d87f35f7994e0ca9073a744c735e2c",
                     *         "bindings": {
                     *           "vente": "metric:montant"
                     *         },
                     *         "created_at": "2026-10-24T14:27:22.205940Z",
                     *         "exports": [
                     *           {
                     *             "format": "parquet",
                     *             "path": "8eb2896d10ce42e29be319159b2b2375/exports/mart_montant_par_libelle_2024.parquet",
                     *             "rows": 10,
                     *             "table": "mart_montant_par_libelle_2024"
                     *           },
                     *           {
                     *             "format": "csv",
                     *             "path": "8eb2896d10ce42e29be319159b2b2375/exports/mart_montant_par_libelle_2024.csv",
                     *             "rows": 10,
                     *             "table": "mart_montant_par_libelle_2024"
                     *           }
                     *         ],
                     *         "id": "9403432ab13448bba8c9e1151877f178",
                     *         "iterations": [
                     *           {
                     *             "clarification": {
                     *               "options": [
                     *                 {
                     *                   "label": "Chiffre d'affaires",
                     *                   "ref": "metric:montant"
                     *                 },
                     *                 {
                     *                   "label": "Quantité vendue",
                     *                   "ref": "metric:quantite"
                     *                 }
                     *               ],
                     *               "question": "Que voulez-vous dire par « ventes » ?",
                     *               "term": "ventes"
                     *             },
                     *             "context_tokens": 233,
                     *             "created_at": "2026-10-24T14:27:22.205940Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Les ventes par produit en 2024",
                     *             "job_id": "9cbaff846a264f9cb3217dc164cdc6f8",
                     *             "kind": "question",
                     *             "llm": null,
                     *             "path": "parser",
                     *             "preview": null,
                     *             "refines": false,
                     *             "refusal": null,
                     *             "selected": [
                     *               "metric:montant",
                     *               "metric:quantite"
                     *             ],
                     *             "spec": null,
                     *             "sql": null,
                     *             "status": "clarification",
                     *             "summary": null,
                     *             "version": 1
                     *           },
                     *           {
                     *             "clarification": null,
                     *             "context_tokens": 233,
                     *             "created_at": "2026-10-24T14:27:22.675569Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Chiffre d'affaires",
                     *             "job_id": "115aba34c8c3460881561be92a803f2e",
                     *             "kind": "answer",
                     *             "llm": null,
                     *             "path": "parser",
                     *             "preview": {
                     *               "columns": [
                     *                 {
                     *                   "additivity": null,
                     *                   "kind": "axis",
                     *                   "label": "Libellé (produit)",
                     *                   "name": "libelle",
                     *                   "pii": null,
                     *                   "ref": "attribute:produit.libelle"
                     *                 },
                     *                 {
                     *                   "additivity": "additive",
                     *                   "kind": "metric",
                     *                   "label": "Chiffre d'affaires (EUR)",
                     *                   "name": "montant",
                     *                   "pii": null,
                     *                   "ref": "metric:montant"
                     *                 }
                     *               ],
                     *               "controls": [
                     *                 {
                     *                   "code": "reconciliation",
                     *                   "details": {
                     *                     "fact_total": 4994.8,
                     *                     "mart_total": 4994.8,
                     *                     "metric": "montant"
                     *                   },
                     *                   "message": "Chiffre d'affaires : total du data mart 4 994.80 = total du fait fct_ventes sur le même périmètre.",
                     *                   "status": "ok"
                     *                 },
                     *                 {
                     *                   "code": "unknown_member",
                     *                   "details": {
                     *                     "dimension": "produit",
                     *                     "rows": 1,
                     *                     "share": 0.0127
                     *                   },
                     *                   "message": "1 ligne(s) du fait sur 79 (1.3%) rattachée(s) au membre inconnu de produit : elles apparaissent sous « Inconnu » ou une valeur vide.",
                     *                   "status": "warning"
                     *                 }
                     *               ],
                     *               "pseudonymized": [],
                     *               "row_count": 12,
                     *               "rows": [
                     *                 {
                     *                   "libelle": "Plaid tricoté",
                     *                   "montant": 1377.7
                     *                 },
                     *                 {
                     *                   "libelle": "Théière en fonte",
                     *                   "montant": 630
                     *                 }
                     *               ]
                     *             },
                     *             "refines": false,
                     *             "refusal": null,
                     *             "selected": [
                     *               "metric:montant",
                     *               "metric:quantite"
                     *             ],
                     *             "spec": {
                     *               "axes": [
                     *                 "produit.libelle"
                     *               ],
                     *               "filters": [],
                     *               "limit": null,
                     *               "metrics": [
                     *                 "montant"
                     *               ],
                     *               "name": "montant_par_libelle_2024",
                     *               "order_by": [],
                     *               "period": {
                     *                 "end": "2024-12-31",
                     *                 "label": "2024",
                     *                 "start": "2024-01-01"
                     *               },
                     *               "time_dimension": "date_commande",
                     *               "time_grain": null
                     *             },
                     *             "sql": "with base as (\n\n    select\n        produit.libelle as libelle,\n        f.montant as _m_montant\n    from \"fct_ventes\" as f\n    left join \"dim_produits\" as produit\n        on produit.produit_key = f.produit_key\n    left join \"dim_date\" as date_commande\n        on date_commande.date_key = f.date_commande_key\n    where date_commande.date >= DATE '2024-01-01'\n        and date_commande.date <= DATE '202…",
                     *             "status": "previewed",
                     *             "summary": "Chiffre d'affaires par produit, sur 2024.",
                     *             "version": 2
                     *           }
                     *         ],
                     *         "model_columns": [
                     *           {
                     *             "additivity": null,
                     *             "kind": "axis",
                     *             "label": "Libellé (produit)",
                     *             "name": "libelle",
                     *             "pii": null,
                     *             "ref": "attribute:produit.libelle"
                     *           },
                     *           {
                     *             "additivity": "additive",
                     *             "kind": "metric",
                     *             "label": "Chiffre d'affaires (EUR)",
                     *             "name": "montant",
                     *             "pii": null,
                     *             "ref": "metric:montant"
                     *           }
                     *         ],
                     *         "model_sql": "-- Data mart requested by analyste@demo.forja.local: Les ventes par produit en 2024\n-- Chiffre d'affaires par produit, sur T1 2024.\n-- Generated by Forja from mart request 9403432ab13448bba8c9e1151877f178 v3.\n-- Do not edit: this file is regenerated on each build.\n\n{{ config(materialized='table') }}\n\nwith base as (\n\n    select\n        produit.libelle as libelle,\n        f.montant as _m_montant\n   …",
                     *         "model_summary": "Chiffre d'affaires par produit, sur T1 2024.",
                     *         "owner_email": "analyste@demo.forja.local",
                     *         "owner_id": "d7605ffdaaed4ce6992f576ea252fa3d",
                     *         "owner_unmasked": false,
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "publish_error": null,
                     *         "publish_job_id": "28d9f931c03446d3b33ced089f38d3f6",
                     *         "published_at": "2026-10-24T14:27:30.594601Z",
                     *         "published_name": "mart_montant_par_libelle_2024",
                     *         "published_table_id": "8d1d6dee1c464d9bb4bdd32785fb523b",
                     *         "question": "Les ventes par produit en 2024",
                     *         "rejected_by": null,
                     *         "rejection_reason": null,
                     *         "semantic_version": 3,
                     *         "status": "published",
                     *         "updated_at": "2026-10-24T14:27:30.594601Z",
                     *         "validated_at": "2026-10-24T14:27:23.255675Z"
                     *       },
                     *       "run": {
                     *         "attempts": 0,
                     *         "cancel_requested": false,
                     *         "created_at": "2026-10-24T14:27:23.342080Z",
                     *         "created_by": "a2d87f35f7994e0ca9073a744c735e2c",
                     *         "error": null,
                     *         "finished_at": null,
                     *         "id": "28d9f931c03446d3b33ced089f38d3f6",
                     *         "metrics": null,
                     *         "params": {
                     *           "csv_delimiter": null,
                     *           "formats": [
                     *             "parquet",
                     *             "csv"
                     *           ],
                     *           "full_refresh": false,
                     *           "mart_request_id": "9403432ab13448bba8c9e1151877f178",
                     *           "source_ids": null,
                     *           "type": "publish_mart",
                     *           "use_llm": true
                     *         },
                     *         "progress": null,
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "result": null,
                     *         "started_at": null,
                     *         "status": "queued",
                     *         "type": "publish_mart"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["MartRequestRun"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    refine_mart_request_mart_requests__mart_id__refine_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                mart_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MartRefinement"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "mart_request": {
                     *         "approved_at": null,
                     *         "approved_by": null,
                     *         "bindings": {
                     *           "vente": "metric:montant"
                     *         },
                     *         "created_at": "2026-10-24T14:27:22.205940Z",
                     *         "exports": [],
                     *         "id": "9403432ab13448bba8c9e1151877f178",
                     *         "iterations": [
                     *           {
                     *             "clarification": {
                     *               "options": [
                     *                 {
                     *                   "label": "Chiffre d'affaires",
                     *                   "ref": "metric:montant"
                     *                 },
                     *                 {
                     *                   "label": "Quantité vendue",
                     *                   "ref": "metric:quantite"
                     *                 }
                     *               ],
                     *               "question": "Que voulez-vous dire par « ventes » ?",
                     *               "term": "ventes"
                     *             },
                     *             "context_tokens": 233,
                     *             "created_at": "2026-10-24T14:27:22.205940Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Les ventes par produit en 2024",
                     *             "job_id": "9cbaff846a264f9cb3217dc164cdc6f8",
                     *             "kind": "question",
                     *             "llm": null,
                     *             "path": "parser",
                     *             "preview": null,
                     *             "refines": false,
                     *             "refusal": null,
                     *             "selected": [
                     *               "metric:montant",
                     *               "metric:quantite"
                     *             ],
                     *             "spec": null,
                     *             "sql": null,
                     *             "status": "clarification",
                     *             "summary": null,
                     *             "version": 1
                     *           },
                     *           {
                     *             "clarification": null,
                     *             "context_tokens": 233,
                     *             "created_at": "2026-10-24T14:27:22.675569Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Chiffre d'affaires",
                     *             "job_id": "115aba34c8c3460881561be92a803f2e",
                     *             "kind": "answer",
                     *             "llm": null,
                     *             "path": "parser",
                     *             "preview": {
                     *               "columns": [
                     *                 {
                     *                   "additivity": null,
                     *                   "kind": "axis",
                     *                   "label": "Libellé (produit)",
                     *                   "name": "libelle",
                     *                   "pii": null,
                     *                   "ref": "attribute:produit.libelle"
                     *                 },
                     *                 {
                     *                   "additivity": "additive",
                     *                   "kind": "metric",
                     *                   "label": "Chiffre d'affaires (EUR)",
                     *                   "name": "montant",
                     *                   "pii": null,
                     *                   "ref": "metric:montant"
                     *                 }
                     *               ],
                     *               "controls": [
                     *                 {
                     *                   "code": "reconciliation",
                     *                   "details": {
                     *                     "fact_total": 4994.8,
                     *                     "mart_total": 4994.8,
                     *                     "metric": "montant"
                     *                   },
                     *                   "message": "Chiffre d'affaires : total du data mart 4 994.80 = total du fait fct_ventes sur le même périmètre.",
                     *                   "status": "ok"
                     *                 },
                     *                 {
                     *                   "code": "unknown_member",
                     *                   "details": {
                     *                     "dimension": "produit",
                     *                     "rows": 1,
                     *                     "share": 0.0127
                     *                   },
                     *                   "message": "1 ligne(s) du fait sur 79 (1.3%) rattachée(s) au membre inconnu de produit : elles apparaissent sous « Inconnu » ou une valeur vide.",
                     *                   "status": "warning"
                     *                 }
                     *               ],
                     *               "pseudonymized": [],
                     *               "row_count": 12,
                     *               "rows": [
                     *                 {
                     *                   "libelle": "Plaid tricoté",
                     *                   "montant": 1377.7
                     *                 },
                     *                 {
                     *                   "libelle": "Théière en fonte",
                     *                   "montant": 630
                     *                 }
                     *               ]
                     *             },
                     *             "refines": false,
                     *             "refusal": null,
                     *             "selected": [
                     *               "metric:montant",
                     *               "metric:quantite"
                     *             ],
                     *             "spec": {
                     *               "axes": [
                     *                 "produit.libelle"
                     *               ],
                     *               "filters": [],
                     *               "limit": null,
                     *               "metrics": [
                     *                 "montant"
                     *               ],
                     *               "name": "montant_par_libelle_2024",
                     *               "order_by": [],
                     *               "period": {
                     *                 "end": "2024-12-31",
                     *                 "label": "2024",
                     *                 "start": "2024-01-01"
                     *               },
                     *               "time_dimension": "date_commande",
                     *               "time_grain": null
                     *             },
                     *             "sql": "with base as (\n\n    select\n        produit.libelle as libelle,\n        f.montant as _m_montant\n    from \"fct_ventes\" as f\n    left join \"dim_produits\" as produit\n        on produit.produit_key = f.produit_key\n    left join \"dim_date\" as date_commande\n        on date_commande.date_key = f.date_commande_key\n    where date_commande.date >= DATE '2024-01-01'\n        and date_commande.date <= DATE '202…",
                     *             "status": "previewed",
                     *             "summary": "Chiffre d'affaires par produit, sur 2024.",
                     *             "version": 2
                     *           }
                     *         ],
                     *         "model_columns": [],
                     *         "model_sql": null,
                     *         "model_summary": null,
                     *         "owner_email": "analyste@demo.forja.local",
                     *         "owner_id": "d7605ffdaaed4ce6992f576ea252fa3d",
                     *         "owner_unmasked": false,
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "publish_error": null,
                     *         "publish_job_id": null,
                     *         "published_at": null,
                     *         "published_name": null,
                     *         "published_table_id": null,
                     *         "question": "Les ventes par produit en 2024",
                     *         "rejected_by": null,
                     *         "rejection_reason": null,
                     *         "semantic_version": 3,
                     *         "status": "previewed",
                     *         "updated_at": "2026-10-24T14:27:23.184828Z",
                     *         "validated_at": null
                     *       },
                     *       "run": {
                     *         "attempts": 0,
                     *         "cancel_requested": false,
                     *         "created_at": "2026-10-24T14:27:22.929708Z",
                     *         "created_by": "d7605ffdaaed4ce6992f576ea252fa3d",
                     *         "error": null,
                     *         "finished_at": null,
                     *         "id": "bbfbc191c445418784c407de4d385393",
                     *         "metrics": null,
                     *         "params": {
                     *           "csv_delimiter": null,
                     *           "formats": [
                     *             "parquet",
                     *             "csv"
                     *           ],
                     *           "full_refresh": false,
                     *           "mart_request_id": "9403432ab13448bba8c9e1151877f178",
                     *           "source_ids": null,
                     *           "type": "mart_request",
                     *           "use_llm": true
                     *         },
                     *         "progress": null,
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "result": null,
                     *         "started_at": null,
                     *         "status": "queued",
                     *         "type": "mart_request"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["MartRequestRun"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reject_mart_request_mart_requests__mart_id__reject_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                mart_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MartRejection"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "approved_at": null,
                     *       "approved_by": null,
                     *       "bindings": {},
                     *       "created_at": "2026-10-24T14:27:30.652073Z",
                     *       "exports": [],
                     *       "id": "6f65603944e144be87c4ded98fcce278",
                     *       "iterations": [
                     *         {
                     *           "clarification": null,
                     *           "context_tokens": 220,
                     *           "created_at": "2026-10-24T14:27:30.652073Z",
                     *           "effective": "Panier moyen par segment",
                     *           "error": null,
                     *           "instruction": "Panier moyen par segment",
                     *           "job_id": "936f48deb91d467a8887e98d17f6d8da",
                     *           "kind": "question",
                     *           "llm": null,
                     *           "path": "parser",
                     *           "preview": {
                     *             "columns": [
                     *               {
                     *                 "additivity": null,
                     *                 "kind": "axis",
                     *                 "label": "Segment (client)",
                     *                 "name": "segment",
                     *                 "pii": null,
                     *                 "ref": "attribute:client.segment"
                     *               },
                     *               {
                     *                 "additivity": "non_additive",
                     *                 "kind": "metric",
                     *                 "label": "Panier moyen (EUR)",
                     *                 "name": "panier_moyen",
                     *                 "pii": null,
                     *                 "ref": "metric:panier_moyen"
                     *               }
                     *             ],
                     *             "controls": [
                     *               {
                     *                 "code": "reconciliation",
                     *                 "details": {
                     *                   "metric": "panier_moyen"
                     *                 },
                     *                 "message": "Panier moyen n'est pas additive (sum(montant) / count_distinct(id_commande)) : son total ne se compare pas ligne à ligne, il est recalculé à chaque niveau.",
                     *                 "status": "info"
                     *               },
                     *               {
                     *                 "code": "unknown_member",
                     *                 "details": {
                     *                   "dimension": "client",
                     *                   "rows": 4,
                     *                   "share": 0.0506
                     *                 },
                     *                 "message": "4 ligne(s) du fait sur 79 (5.1%) rattachée(s) au membre inconnu de client : elles apparaissent sous « Inconnu » ou une valeur vide.",
                     *                 "status": "warning"
                     *               }
                     *             ],
                     *             "pseudonymized": [],
                     *             "row_count": 3,
                     *             "rows": [
                     *               {
                     *                 "panier_moyen": 136.12,
                     *                 "segment": "professionnel"
                     *               },
                     *               {
                     *                 "panier_moyen": 125.24,
                     *                 "segment": "particulier"
                     *               }
                     *             ]
                     *           },
                     *           "refines": false,
                     *           "refusal": null,
                     *           "selected": [
                     *             "metric:panier_moyen",
                     *             "metric:montant"
                     *           ],
                     *           "spec": {
                     *             "axes": [
                     *               "client.segment"
                     *             ],
                     *             "filters": [],
                     *             "limit": null,
                     *             "metrics": [
                     *               "panier_moyen"
                     *             ],
                     *             "name": "panier_moyen_par_segment",
                     *             "order_by": [],
                     *             "period": null,
                     *             "time_dimension": null,
                     *             "time_grain": null
                     *           },
                     *           "sql": "with base as (\n\n    select\n        client.segment as segment,\n        f.montant as _m_montant,\n        f.id_commande as _m_nb_commandes\n    from \"fct_ventes\" as f\n    left join \"dim_clients\" as client\n        on client.client_key = f.client_key\n\n)\n\nselect\n    segment,\n    round(cast(sum(_m_montant) as double) / nullif(count(distinct _m_nb_commandes), 0), 2) as panier_moyen\nfrom base\ngroup by segme…",
                     *           "status": "previewed",
                     *           "summary": "Panier moyen par segment.",
                     *           "version": 1
                     *         }
                     *       ],
                     *       "model_columns": [],
                     *       "model_sql": null,
                     *       "model_summary": null,
                     *       "owner_email": "analyste@demo.forja.local",
                     *       "owner_id": "d7605ffdaaed4ce6992f576ea252fa3d",
                     *       "owner_unmasked": false,
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "publish_error": null,
                     *       "publish_job_id": null,
                     *       "published_at": null,
                     *       "published_name": null,
                     *       "published_table_id": null,
                     *       "question": "Panier moyen par segment",
                     *       "rejected_by": "d7605ffdaaed4ce6992f576ea252fa3d",
                     *       "rejection_reason": "doublon",
                     *       "semantic_version": 3,
                     *       "status": "rejected",
                     *       "updated_at": "2026-10-24T14:27:30.894030Z",
                     *       "validated_at": null
                     *     }
                     */
                    "application/json": components["schemas"]["MartRequest"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    validate_mart_request_mart_requests__mart_id__validate_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                mart_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "mart_request": {
                     *         "approved_at": null,
                     *         "approved_by": null,
                     *         "bindings": {
                     *           "vente": "metric:montant"
                     *         },
                     *         "created_at": "2026-10-24T14:27:22.205940Z",
                     *         "exports": [],
                     *         "id": "9403432ab13448bba8c9e1151877f178",
                     *         "iterations": [
                     *           {
                     *             "clarification": {
                     *               "options": [
                     *                 {
                     *                   "label": "Chiffre d'affaires",
                     *                   "ref": "metric:montant"
                     *                 },
                     *                 {
                     *                   "label": "Quantité vendue",
                     *                   "ref": "metric:quantite"
                     *                 }
                     *               ],
                     *               "question": "Que voulez-vous dire par « ventes » ?",
                     *               "term": "ventes"
                     *             },
                     *             "context_tokens": 233,
                     *             "created_at": "2026-10-24T14:27:22.205940Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Les ventes par produit en 2024",
                     *             "job_id": "9cbaff846a264f9cb3217dc164cdc6f8",
                     *             "kind": "question",
                     *             "llm": null,
                     *             "path": "parser",
                     *             "preview": null,
                     *             "refines": false,
                     *             "refusal": null,
                     *             "selected": [
                     *               "metric:montant",
                     *               "metric:quantite"
                     *             ],
                     *             "spec": null,
                     *             "sql": null,
                     *             "status": "clarification",
                     *             "summary": null,
                     *             "version": 1
                     *           },
                     *           {
                     *             "clarification": null,
                     *             "context_tokens": 233,
                     *             "created_at": "2026-10-24T14:27:22.675569Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Chiffre d'affaires",
                     *             "job_id": "115aba34c8c3460881561be92a803f2e",
                     *             "kind": "answer",
                     *             "llm": null,
                     *             "path": "parser",
                     *             "preview": {
                     *               "columns": [
                     *                 {
                     *                   "additivity": null,
                     *                   "kind": "axis",
                     *                   "label": "Libellé (produit)",
                     *                   "name": "libelle",
                     *                   "pii": null,
                     *                   "ref": "attribute:produit.libelle"
                     *                 },
                     *                 {
                     *                   "additivity": "additive",
                     *                   "kind": "metric",
                     *                   "label": "Chiffre d'affaires (EUR)",
                     *                   "name": "montant",
                     *                   "pii": null,
                     *                   "ref": "metric:montant"
                     *                 }
                     *               ],
                     *               "controls": [
                     *                 {
                     *                   "code": "reconciliation",
                     *                   "details": {
                     *                     "fact_total": 4994.8,
                     *                     "mart_total": 4994.8,
                     *                     "metric": "montant"
                     *                   },
                     *                   "message": "Chiffre d'affaires : total du data mart 4 994.80 = total du fait fct_ventes sur le même périmètre.",
                     *                   "status": "ok"
                     *                 },
                     *                 {
                     *                   "code": "unknown_member",
                     *                   "details": {
                     *                     "dimension": "produit",
                     *                     "rows": 1,
                     *                     "share": 0.0127
                     *                   },
                     *                   "message": "1 ligne(s) du fait sur 79 (1.3%) rattachée(s) au membre inconnu de produit : elles apparaissent sous « Inconnu » ou une valeur vide.",
                     *                   "status": "warning"
                     *                 }
                     *               ],
                     *               "pseudonymized": [],
                     *               "row_count": 12,
                     *               "rows": [
                     *                 {
                     *                   "libelle": "Plaid tricoté",
                     *                   "montant": 1377.7
                     *                 },
                     *                 {
                     *                   "libelle": "Théière en fonte",
                     *                   "montant": 630
                     *                 }
                     *               ]
                     *             },
                     *             "refines": false,
                     *             "refusal": null,
                     *             "selected": [
                     *               "metric:montant",
                     *               "metric:quantite"
                     *             ],
                     *             "spec": {
                     *               "axes": [
                     *                 "produit.libelle"
                     *               ],
                     *               "filters": [],
                     *               "limit": null,
                     *               "metrics": [
                     *                 "montant"
                     *               ],
                     *               "name": "montant_par_libelle_2024",
                     *               "order_by": [],
                     *               "period": {
                     *                 "end": "2024-12-31",
                     *                 "label": "2024",
                     *                 "start": "2024-01-01"
                     *               },
                     *               "time_dimension": "date_commande",
                     *               "time_grain": null
                     *             },
                     *             "sql": "with base as (\n\n    select\n        produit.libelle as libelle,\n        f.montant as _m_montant\n    from \"fct_ventes\" as f\n    left join \"dim_produits\" as produit\n        on produit.produit_key = f.produit_key\n    left join \"dim_date\" as date_commande\n        on date_commande.date_key = f.date_commande_key\n    where date_commande.date >= DATE '2024-01-01'\n        and date_commande.date <= DATE '202…",
                     *             "status": "previewed",
                     *             "summary": "Chiffre d'affaires par produit, sur 2024.",
                     *             "version": 2
                     *           }
                     *         ],
                     *         "model_columns": [],
                     *         "model_sql": null,
                     *         "model_summary": null,
                     *         "owner_email": "analyste@demo.forja.local",
                     *         "owner_id": "d7605ffdaaed4ce6992f576ea252fa3d",
                     *         "owner_unmasked": false,
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "publish_error": null,
                     *         "publish_job_id": null,
                     *         "published_at": null,
                     *         "published_name": null,
                     *         "published_table_id": null,
                     *         "question": "Les ventes par produit en 2024",
                     *         "rejected_by": null,
                     *         "rejection_reason": null,
                     *         "semantic_version": 3,
                     *         "status": "validated",
                     *         "updated_at": "2026-10-24T14:27:23.184828Z",
                     *         "validated_at": "2026-10-24T14:27:23.255675Z"
                     *       },
                     *       "run": null
                     *     }
                     */
                    "application/json": components["schemas"]["MartRequestRun"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_projects_projects_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "architecture": "medallion",
                     *         "created_at": "2026-10-24T14:26:43.965728Z",
                     *         "description": "Boutique en ligne fictive (données générées)",
                     *         "id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "name": "Démo e-commerce"
                     *       },
                     *       {
                     *         "architecture": "medallion",
                     *         "created_at": "2026-10-24T14:27:18.041562Z",
                     *         "description": null,
                     *         "id": "a30fdf091bba403380dd020e6a5e446c",
                     *         "name": "Finance"
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["Project"][];
                };
            };
        };
    };
    create_project_projects_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProjectCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "architecture": "medallion",
                     *       "created_at": "2026-10-24T14:27:18.041562Z",
                     *       "description": null,
                     *       "id": "a30fdf091bba403380dd020e6a5e446c",
                     *       "name": "Finance"
                     *     }
                     */
                    "application/json": components["schemas"]["Project"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    project_audit_projects__project_id__audit_get: {
        parameters: {
            query?: {
                action?: string | null;
                limit?: number;
            };
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "action": "mart.reject",
                     *         "at": "2026-10-24T14:27:30.903968Z",
                     *         "details": {
                     *           "reason": "doublon"
                     *         },
                     *         "id": "9ce3afe5dc284cd19b982754085e5aed",
                     *         "object_id": "6f65603944e144be87c4ded98fcce278",
                     *         "object_type": "mart_request",
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "user_email": "analyste@demo.forja.local",
                     *         "user_id": "d7605ffdaaed4ce6992f576ea252fa3d"
                     *       },
                     *       {
                     *         "action": "agent.request",
                     *         "at": "2026-10-24T14:27:30.874905Z",
                     *         "details": {
                     *           "question": "Panier moyen par segment"
                     *         },
                     *         "id": "1e822b784f094f1e848aec47cf874768",
                     *         "object_id": "6f65603944e144be87c4ded98fcce278",
                     *         "object_type": "mart_request",
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "user_email": "analyste@demo.forja.local",
                     *         "user_id": "d7605ffdaaed4ce6992f576ea252fa3d"
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["AuditEntry"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_gold_plan_projects__project_id__gold_plan_get: {
        parameters: {
            query?: {
                version?: number | null;
            };
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "created_at": "2026-10-24T14:26:54.023260Z",
                     *       "date_dimension": {
                     *         "enabled": true,
                     *         "explanation": "Dimension date générée : un jour par ligne de la plus ancienne à la plus récente date des faits, avec année, trimestre, mois, semaine et jour en français, et un membre inconnu (-1)."
                     *       },
                     *       "dimensions": [
                     *         {
                     *           "attributes": [
                     *             {
                     *               "column": "nom",
                     *               "description": "",
                     *               "name": "nom",
                     *               "pii_treatment": null
                     *             },
                     *             {
                     *               "column": "prenom",
                     *               "description": "",
                     *               "name": "prenom",
                     *               "pii_treatment": null
                     *             }
                     *           ],
                     *           "explanation": "Dimension issue de clients : une ligne par id_client et par version, clé de substitution client_key (empreinte déterministe de la clé naturelle), membre « inconnu » (-1) pour les clés absentes des faits. Historisée en SCD2 (valid_from, valid_to, is_current) : chaque changement d'attribut crée une nouvelle version et les faits pointent vers la version valide à leur date.",
                     *           "name": "dim_clients",
                     *           "natural_key": [
                     *             "id_client"
                     *           ],
                     *           "scd": "scd2",
                     *           "source": "clients",
                     *           "surrogate_key": "client_key"
                     *         },
                     *         {
                     *           "attributes": [
                     *             {
                     *               "column": "libelle",
                     *               "description": "",
                     *               "name": "libelle",
                     *               "pii_treatment": null
                     *             },
                     *             {
                     *               "column": "categorie",
                     *               "description": "",
                     *               "name": "categorie",
                     *               "pii_treatment": null
                     *             }
                     *           ],
                     *           "explanation": "Dimension issue de produits : une ligne par code_produit et par version, clé de substitution produit_key (empreinte déterministe de la clé naturelle), membre « inconnu » (-1) pour les clés absentes des faits. Historisée en SCD2 (valid_from, valid_to, is_current) : chaque changement d'attribut crée une nouvelle version et les faits pointent vers la version valide à leur date.",
                     *           "name": "dim_produits",
                     *           "natural_key": [
                     *             "code_produit"
                     *           ],
                     *           "scd": "scd2",
                     *           "source": "produits",
                     *           "surrogate_key": "produit_key"
                     *         }
                     *       ],
                     *       "facts": [
                     *         {
                     *           "date_keys": [
                     *             {
                     *               "column": "date_commande",
                     *               "explanation": "date_commande_key → dim_date (clé AAAAMMJJ) à partir de commandes.date_commande.",
                     *               "name": "date_commande_key",
                     *               "source": "commandes"
                     *             }
                     *           ],
                     *           "degenerate_dimensions": [
                     *             {
                     *               "column": "id_commande",
                     *               "name": "id_commande",
                     *               "source": "lignes_commande"
                     *             },
                     *             {
                     *               "column": "num_ligne",
                     *               "name": "num_ligne",
                     *               "source": "lignes_commande"
                     *             }
                     *           ],
                     *           "explanation": "Fait au grain une ligne de lignes_commande (id_commande, num_ligne). Enrichi par commandes le long de relations N-1, sans démultiplication. Les clés étrangères sans correspondance sont rattachées au membre inconnu (-1) : aucune ligne de fait n'est perdue.",
                     *           "foreign_keys": [
                     *             {
                     *               "column": "code_produit",
                     *               "dimension": "dim_produits",
                     *               "explanation": "produit_key → dim_produits via la relation confirmée lignes_commande.code_produit → produits.code_produit.",
                     *               "name": "produit_key",
                     *               "relation_id": "4991b914ca604a6b8bab75597f869cbb",
                     *               "source": "lignes_commande"
                     *             },
                     *             {
                     *               "column": "id_client",
                     *               "dimension": "dim_clients",
                     *               "explanation": "client_key → dim_clients via la relation confirmée commandes.id_client → clients.id_client.",
                     *               "name": "client_key",
                     *               "relation_id": "2b74b31d056546769c6e937f24c569a3",
                     *               "source": "commandes"
                     *             }
                     *           ],
                     *           "grain": [
                     *             "id_commande",
                     *             "num_ligne"
                     *           ],
                     *           "grain_description": "une ligne de lignes_commande",
                     *           "joins": [
                     *             {
                     *               "explanation": "commandes joint via lignes_commande.id_commande → commandes.id_commande : une seule ligne de commandes par ligne du fait.",
                     *               "from_column": "id_commande",
                     *               "from_source": "lignes_commande",
                     *               "source": "commandes",
                     *               "to_column": "id_commande"
                     *             }
                     *           ],
                     *           "measures": [
                     *             {
                     *               "aggregation": "sum",
                     *               "description": "",
                     *               "explanation": "quantite = quantite, agrégée par somme par défaut.",
                     *               "expression": "quantite",
                     *               "name": "quantite"
                     *             },
                     *             {
                     *               "aggregation": "none",
                     *               "description": "",
                     *               "explanation": "prix_unitaire = prix_unitaire, agrégée par aucune (valeur unitaire non additive) par défaut.",
                     *               "expression": "prix_unitaire",
                     *               "name": "prix_unitaire"
                     *             }
                     *           ],
                     *           "name": "fct_ventes",
                     *           "source": "lignes_commande"
                     *         }
                     *       ],
                     *       "id": "7695899288d94813a978d2892976a484",
                     *       "issues": [],
                     *       "origin": "heuristic",
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "status": "applied",
                     *       "summary": "2 dimension(s), 1 fait(s), dimension date générée. Validation : 0 erreur(s), 0 avertissement(s).",
                     *       "updated_at": "2026-10-24T14:27:01.010562Z",
                     *       "version": 1,
                     *       "warnings": [
                     *         "commandes.frais_port n'est pas repris comme mesure : il est au niveau de commandes, le sommer au grain de lignes_commande le multiplierait"
                     *       ]
                     *     }
                     */
                    "application/json": components["schemas"]["GoldPlan"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    patch_gold_plan_projects__project_id__gold_plan_patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GoldPlanPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "created_at": "2026-10-24T14:27:20.384209Z",
                     *       "date_dimension": {
                     *         "enabled": true,
                     *         "explanation": "Dimension date générée : un jour par ligne de la plus ancienne à la plus récente date des faits, avec année, trimestre, mois, semaine et jour en français, et un membre inconnu (-1)."
                     *       },
                     *       "dimensions": [
                     *         {
                     *           "attributes": [
                     *             {
                     *               "column": "nom",
                     *               "description": "",
                     *               "name": "nom",
                     *               "pii_treatment": null
                     *             },
                     *             {
                     *               "column": "prenom",
                     *               "description": "",
                     *               "name": "prenom",
                     *               "pii_treatment": null
                     *             }
                     *           ],
                     *           "explanation": "Dimension issue de clients : une ligne par id_client et par version, clé de substitution client_key (empreinte déterministe de la clé naturelle), membre « inconnu » (-1) pour les clés absentes des faits. Historisée en SCD2 (valid_from, valid_to, is_current) : chaque changement d'attribut crée une nouvelle version et les faits pointent vers la version valide à leur date.",
                     *           "name": "dim_clients",
                     *           "natural_key": [
                     *             "id_client"
                     *           ],
                     *           "scd": "scd2",
                     *           "source": "clients",
                     *           "surrogate_key": "client_key"
                     *         },
                     *         {
                     *           "attributes": [
                     *             {
                     *               "column": "libelle",
                     *               "description": "",
                     *               "name": "libelle",
                     *               "pii_treatment": null
                     *             },
                     *             {
                     *               "column": "categorie",
                     *               "description": "",
                     *               "name": "categorie",
                     *               "pii_treatment": null
                     *             }
                     *           ],
                     *           "explanation": "Dimension issue de produits : une ligne par code_produit, clé de substitution produit_key (empreinte déterministe de la clé naturelle), membre « inconnu » (-1) pour les clés absentes des faits. SCD1 : les attributs sont écrasés par leur dernière valeur.",
                     *           "name": "dim_produits",
                     *           "natural_key": [
                     *             "code_produit"
                     *           ],
                     *           "scd": "scd1",
                     *           "source": "produits",
                     *           "surrogate_key": "produit_key"
                     *         }
                     *       ],
                     *       "facts": [
                     *         {
                     *           "date_keys": [
                     *             {
                     *               "column": "date_commande",
                     *               "explanation": "date_commande_key → dim_date (clé AAAAMMJJ) à partir de commandes.date_commande.",
                     *               "name": "date_commande_key",
                     *               "source": "commandes"
                     *             }
                     *           ],
                     *           "degenerate_dimensions": [
                     *             {
                     *               "column": "id_commande",
                     *               "name": "id_commande",
                     *               "source": "lignes_commande"
                     *             },
                     *             {
                     *               "column": "num_ligne",
                     *               "name": "num_ligne",
                     *               "source": "lignes_commande"
                     *             }
                     *           ],
                     *           "explanation": "Fait au grain une ligne de lignes_commande (id_commande, num_ligne). Enrichi par commandes le long de relations N-1, sans démultiplication. Les clés étrangères sans correspondance sont rattachées au membre inconnu (-1) : aucune ligne de fait n'est perdue.",
                     *           "foreign_keys": [
                     *             {
                     *               "column": "code_produit",
                     *               "dimension": "dim_produits",
                     *               "explanation": "produit_key → dim_produits via la relation confirmée lignes_commande.code_produit → produits.code_produit.",
                     *               "name": "produit_key",
                     *               "relation_id": "4991b914ca604a6b8bab75597f869cbb",
                     *               "source": "lignes_commande"
                     *             },
                     *             {
                     *               "column": "id_client",
                     *               "dimension": "dim_clients",
                     *               "explanation": "client_key → dim_clients via la relation confirmée commandes.id_client → clients.id_client.",
                     *               "name": "client_key",
                     *               "relation_id": "2b74b31d056546769c6e937f24c569a3",
                     *               "source": "commandes"
                     *             }
                     *           ],
                     *           "grain": [
                     *             "id_commande",
                     *             "num_ligne"
                     *           ],
                     *           "grain_description": "une ligne de lignes_commande",
                     *           "joins": [
                     *             {
                     *               "explanation": "commandes joint via lignes_commande.id_commande → commandes.id_commande : une seule ligne de commandes par ligne du fait.",
                     *               "from_column": "id_commande",
                     *               "from_source": "lignes_commande",
                     *               "source": "commandes",
                     *               "to_column": "id_commande"
                     *             }
                     *           ],
                     *           "measures": [
                     *             {
                     *               "aggregation": "sum",
                     *               "description": "",
                     *               "explanation": "quantite = quantite, agrégée par somme par défaut.",
                     *               "expression": "quantite",
                     *               "name": "quantite"
                     *             },
                     *             {
                     *               "aggregation": "none",
                     *               "description": "",
                     *               "explanation": "prix_unitaire = prix_unitaire, agrégée par aucune (valeur unitaire non additive) par défaut.",
                     *               "expression": "prix_unitaire",
                     *               "name": "prix_unitaire"
                     *             }
                     *           ],
                     *           "name": "fct_ventes",
                     *           "source": "lignes_commande"
                     *         }
                     *       ],
                     *       "id": "0445807ef708405f9426d547c8a9ff87",
                     *       "issues": [],
                     *       "origin": "heuristic",
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "status": "draft",
                     *       "summary": "2 dimension(s), 1 fait(s), dimension date générée. Validation : 0 erreur(s), 0 avertissement(s).",
                     *       "updated_at": "2026-10-24T14:27:20.384209Z",
                     *       "version": 3,
                     *       "warnings": []
                     *     }
                     */
                    "application/json": components["schemas"]["GoldPlan"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    approve_gold_plan_projects__project_id__gold_plan_approve_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "created_at": "2026-10-24T14:27:20.384209Z",
                     *       "date_dimension": {
                     *         "enabled": true,
                     *         "explanation": "Dimension date générée : un jour par ligne de la plus ancienne à la plus récente date des faits, avec année, trimestre, mois, semaine et jour en français, et un membre inconnu (-1)."
                     *       },
                     *       "dimensions": [
                     *         {
                     *           "attributes": [
                     *             {
                     *               "column": "nom",
                     *               "description": "",
                     *               "name": "nom",
                     *               "pii_treatment": null
                     *             },
                     *             {
                     *               "column": "prenom",
                     *               "description": "",
                     *               "name": "prenom",
                     *               "pii_treatment": null
                     *             }
                     *           ],
                     *           "explanation": "Dimension issue de clients : une ligne par id_client et par version, clé de substitution client_key (empreinte déterministe de la clé naturelle), membre « inconnu » (-1) pour les clés absentes des faits. Historisée en SCD2 (valid_from, valid_to, is_current) : chaque changement d'attribut crée une nouvelle version et les faits pointent vers la version valide à leur date.",
                     *           "name": "dim_clients",
                     *           "natural_key": [
                     *             "id_client"
                     *           ],
                     *           "scd": "scd2",
                     *           "source": "clients",
                     *           "surrogate_key": "client_key"
                     *         },
                     *         {
                     *           "attributes": [
                     *             {
                     *               "column": "libelle",
                     *               "description": "",
                     *               "name": "libelle",
                     *               "pii_treatment": null
                     *             },
                     *             {
                     *               "column": "categorie",
                     *               "description": "",
                     *               "name": "categorie",
                     *               "pii_treatment": null
                     *             }
                     *           ],
                     *           "explanation": "Dimension issue de produits : une ligne par code_produit, clé de substitution produit_key (empreinte déterministe de la clé naturelle), membre « inconnu » (-1) pour les clés absentes des faits. SCD1 : les attributs sont écrasés par leur dernière valeur.",
                     *           "name": "dim_produits",
                     *           "natural_key": [
                     *             "code_produit"
                     *           ],
                     *           "scd": "scd1",
                     *           "source": "produits",
                     *           "surrogate_key": "produit_key"
                     *         }
                     *       ],
                     *       "facts": [
                     *         {
                     *           "date_keys": [
                     *             {
                     *               "column": "date_commande",
                     *               "explanation": "date_commande_key → dim_date (clé AAAAMMJJ) à partir de commandes.date_commande.",
                     *               "name": "date_commande_key",
                     *               "source": "commandes"
                     *             }
                     *           ],
                     *           "degenerate_dimensions": [
                     *             {
                     *               "column": "id_commande",
                     *               "name": "id_commande",
                     *               "source": "lignes_commande"
                     *             },
                     *             {
                     *               "column": "num_ligne",
                     *               "name": "num_ligne",
                     *               "source": "lignes_commande"
                     *             }
                     *           ],
                     *           "explanation": "Fait au grain une ligne de lignes_commande (id_commande, num_ligne). Enrichi par commandes le long de relations N-1, sans démultiplication. Les clés étrangères sans correspondance sont rattachées au membre inconnu (-1) : aucune ligne de fait n'est perdue.",
                     *           "foreign_keys": [
                     *             {
                     *               "column": "code_produit",
                     *               "dimension": "dim_produits",
                     *               "explanation": "produit_key → dim_produits via la relation confirmée lignes_commande.code_produit → produits.code_produit.",
                     *               "name": "produit_key",
                     *               "relation_id": "4991b914ca604a6b8bab75597f869cbb",
                     *               "source": "lignes_commande"
                     *             },
                     *             {
                     *               "column": "id_client",
                     *               "dimension": "dim_clients",
                     *               "explanation": "client_key → dim_clients via la relation confirmée commandes.id_client → clients.id_client.",
                     *               "name": "client_key",
                     *               "relation_id": "2b74b31d056546769c6e937f24c569a3",
                     *               "source": "commandes"
                     *             }
                     *           ],
                     *           "grain": [
                     *             "id_commande",
                     *             "num_ligne"
                     *           ],
                     *           "grain_description": "une ligne de lignes_commande",
                     *           "joins": [
                     *             {
                     *               "explanation": "commandes joint via lignes_commande.id_commande → commandes.id_commande : une seule ligne de commandes par ligne du fait.",
                     *               "from_column": "id_commande",
                     *               "from_source": "lignes_commande",
                     *               "source": "commandes",
                     *               "to_column": "id_commande"
                     *             }
                     *           ],
                     *           "measures": [
                     *             {
                     *               "aggregation": "sum",
                     *               "description": "",
                     *               "explanation": "quantite = quantite, agrégée par somme par défaut.",
                     *               "expression": "quantite",
                     *               "name": "quantite"
                     *             },
                     *             {
                     *               "aggregation": "none",
                     *               "description": "",
                     *               "explanation": "prix_unitaire = prix_unitaire, agrégée par aucune (valeur unitaire non additive) par défaut.",
                     *               "expression": "prix_unitaire",
                     *               "name": "prix_unitaire"
                     *             }
                     *           ],
                     *           "name": "fct_ventes",
                     *           "source": "lignes_commande"
                     *         }
                     *       ],
                     *       "id": "0445807ef708405f9426d547c8a9ff87",
                     *       "issues": [],
                     *       "origin": "heuristic",
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "status": "approved",
                     *       "summary": "2 dimension(s), 1 fait(s), dimension date générée. Validation : 0 erreur(s), 0 avertissement(s).",
                     *       "updated_at": "2026-10-24T14:27:20.452220Z",
                     *       "version": 3,
                     *       "warnings": []
                     *     }
                     */
                    "application/json": components["schemas"]["GoldPlan"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    propose_gold_plan_projects__project_id__gold_plan_propose_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["ProposeRequest"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "attempts": 1,
                     *       "cancel_requested": false,
                     *       "created_at": "2026-10-24T14:27:20.246548Z",
                     *       "created_by": "a2d87f35f7994e0ca9073a744c735e2c",
                     *       "error": null,
                     *       "finished_at": "2026-10-24T14:27:20.333714Z",
                     *       "id": "a0643cfdab9a43c08ae5a0f968928b61",
                     *       "metrics": {
                     *         "dbt_tests": null,
                     *         "duplicates_removed": 0,
                     *         "duration_seconds": 0.055,
                     *         "exports": [],
                     *         "llm_calls": [],
                     *         "models": [],
                     *         "profiled_sources": 0,
                     *         "relations_detected": 0,
                     *         "rows_read": 0,
                     *         "rows_rejected": 0,
                     *         "rows_valid": 0,
                     *         "serving_path": null,
                     *         "sources": [],
                     *         "unknown_member_rows": []
                     *       },
                     *       "params": {
                     *         "csv_delimiter": null,
                     *         "formats": [
                     *           "parquet",
                     *           "csv"
                     *         ],
                     *         "full_refresh": false,
                     *         "mart_request_id": null,
                     *         "source_ids": null,
                     *         "type": "gold_proposal",
                     *         "use_llm": false
                     *       },
                     *       "progress": {
                     *         "message": "validation et enregistrement du plan",
                     *         "percent": 90,
                     *         "step": "validation",
                     *         "updated_at": "2026-10-24T14:27:20.308266Z"
                     *       },
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "result": {
                     *         "errors": 0,
                     *         "gold_plan_version": 2,
                     *         "origin": "heuristic",
                     *         "warnings": [
                     *           "commandes.frais_port n'est pas repris comme mesure : il est au niveau de commandes, le sommer au grain de lignes_commande le multiplierait"
                     *         ]
                     *       },
                     *       "started_at": "2026-10-24T14:27:20.269627Z",
                     *       "status": "succeeded",
                     *       "type": "gold_proposal"
                     *     }
                     */
                    "application/json": components["schemas"]["Job"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_gold_plans_projects__project_id__gold_plans_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "created_at": "2026-10-24T14:26:54.023260Z",
                     *         "date_dimension": {
                     *           "enabled": true,
                     *           "explanation": "Dimension date générée : un jour par ligne de la plus ancienne à la plus récente date des faits, avec année, trimestre, mois, semaine et jour en français, et un membre inconnu (-1)."
                     *         },
                     *         "dimensions": [
                     *           {
                     *             "attributes": [
                     *               {
                     *                 "column": "nom",
                     *                 "description": "",
                     *                 "name": "nom",
                     *                 "pii_treatment": null
                     *               },
                     *               {
                     *                 "column": "prenom",
                     *                 "description": "",
                     *                 "name": "prenom",
                     *                 "pii_treatment": null
                     *               }
                     *             ],
                     *             "explanation": "Dimension issue de clients : une ligne par id_client et par version, clé de substitution client_key (empreinte déterministe de la clé naturelle), membre « inconnu » (-1) pour les clés absentes des faits. Historisée en SCD2 (valid_from, valid_to, is_current) : chaque changement d'attribut crée une nouvelle version et les faits pointent vers la version valide à leur date.",
                     *             "name": "dim_clients",
                     *             "natural_key": [
                     *               "id_client"
                     *             ],
                     *             "scd": "scd2",
                     *             "source": "clients",
                     *             "surrogate_key": "client_key"
                     *           },
                     *           {
                     *             "attributes": [
                     *               {
                     *                 "column": "libelle",
                     *                 "description": "",
                     *                 "name": "libelle",
                     *                 "pii_treatment": null
                     *               },
                     *               {
                     *                 "column": "categorie",
                     *                 "description": "",
                     *                 "name": "categorie",
                     *                 "pii_treatment": null
                     *               }
                     *             ],
                     *             "explanation": "Dimension issue de produits : une ligne par code_produit et par version, clé de substitution produit_key (empreinte déterministe de la clé naturelle), membre « inconnu » (-1) pour les clés absentes des faits. Historisée en SCD2 (valid_from, valid_to, is_current) : chaque changement d'attribut crée une nouvelle version et les faits pointent vers la version valide à leur date.",
                     *             "name": "dim_produits",
                     *             "natural_key": [
                     *               "code_produit"
                     *             ],
                     *             "scd": "scd2",
                     *             "source": "produits",
                     *             "surrogate_key": "produit_key"
                     *           }
                     *         ],
                     *         "facts": [
                     *           {
                     *             "date_keys": [
                     *               {
                     *                 "column": "date_commande",
                     *                 "explanation": "date_commande_key → dim_date (clé AAAAMMJJ) à partir de commandes.date_commande.",
                     *                 "name": "date_commande_key",
                     *                 "source": "commandes"
                     *               }
                     *             ],
                     *             "degenerate_dimensions": [
                     *               {
                     *                 "column": "id_commande",
                     *                 "name": "id_commande",
                     *                 "source": "lignes_commande"
                     *               },
                     *               {
                     *                 "column": "num_ligne",
                     *                 "name": "num_ligne",
                     *                 "source": "lignes_commande"
                     *               }
                     *             ],
                     *             "explanation": "Fait au grain une ligne de lignes_commande (id_commande, num_ligne). Enrichi par commandes le long de relations N-1, sans démultiplication. Les clés étrangères sans correspondance sont rattachées au membre inconnu (-1) : aucune ligne de fait n'est perdue.",
                     *             "foreign_keys": [
                     *               {
                     *                 "column": "code_produit",
                     *                 "dimension": "dim_produits",
                     *                 "explanation": "produit_key → dim_produits via la relation confirmée lignes_commande.code_produit → produits.code_produit.",
                     *                 "name": "produit_key",
                     *                 "relation_id": "4991b914ca604a6b8bab75597f869cbb",
                     *                 "source": "lignes_commande"
                     *               },
                     *               {
                     *                 "column": "id_client",
                     *                 "dimension": "dim_clients",
                     *                 "explanation": "client_key → dim_clients via la relation confirmée commandes.id_client → clients.id_client.",
                     *                 "name": "client_key",
                     *                 "relation_id": "2b74b31d056546769c6e937f24c569a3",
                     *                 "source": "commandes"
                     *               }
                     *             ],
                     *             "grain": [
                     *               "id_commande",
                     *               "num_ligne"
                     *             ],
                     *             "grain_description": "une ligne de lignes_commande",
                     *             "joins": [
                     *               {
                     *                 "explanation": "commandes joint via lignes_commande.id_commande → commandes.id_commande : une seule ligne de commandes par ligne du fait.",
                     *                 "from_column": "id_commande",
                     *                 "from_source": "lignes_commande",
                     *                 "source": "commandes",
                     *                 "to_column": "id_commande"
                     *               }
                     *             ],
                     *             "measures": [
                     *               {
                     *                 "aggregation": "sum",
                     *                 "description": "",
                     *                 "explanation": "quantite = quantite, agrégée par somme par défaut.",
                     *                 "expression": "quantite",
                     *                 "name": "quantite"
                     *               },
                     *               {
                     *                 "aggregation": "none",
                     *                 "description": "",
                     *                 "explanation": "prix_unitaire = prix_unitaire, agrégée par aucune (valeur unitaire non additive) par défaut.",
                     *                 "expression": "prix_unitaire",
                     *                 "name": "prix_unitaire"
                     *               }
                     *             ],
                     *             "name": "fct_ventes",
                     *             "source": "lignes_commande"
                     *           }
                     *         ],
                     *         "id": "7695899288d94813a978d2892976a484",
                     *         "issues": [],
                     *         "origin": "heuristic",
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "status": "applied",
                     *         "summary": "2 dimension(s), 1 fait(s), dimension date générée. Validation : 0 erreur(s), 0 avertissement(s).",
                     *         "updated_at": "2026-10-24T14:27:01.010562Z",
                     *         "version": 1,
                     *         "warnings": [
                     *           "commandes.frais_port n'est pas repris comme mesure : il est au niveau de commandes, le sommer au grain de lignes_commande le multiplierait"
                     *         ]
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["GoldPlan"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_invitations_projects__project_id__invitations_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "accepted_at": null,
                     *         "created_at": "2026-10-24T14:27:18.128606Z",
                     *         "email": "nouveau@exemple.fr",
                     *         "expires_at": "2026-10-31T14:27:18.128606Z",
                     *         "id": "e8f2ba01b1c845bab67244aec8f08f03",
                     *         "invited_by": "7a852422d26d4e1ea6ce9a431f046b03",
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "role": "analyst",
                     *         "token": null
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["Invitation"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    invite_projects__project_id__invitations_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InvitationCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "accepted_at": null,
                     *       "created_at": "2026-10-24T14:27:18.128606Z",
                     *       "email": "nouveau@exemple.fr",
                     *       "expires_at": "2026-10-31T14:27:18.128606Z",
                     *       "id": "e8f2ba01b1c845bab67244aec8f08f03",
                     *       "invited_by": "7a852422d26d4e1ea6ce9a431f046b03",
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "role": "analyst",
                     *       "token": "…"
                     *     }
                     */
                    "application/json": components["schemas"]["Invitation"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_mart_requests_projects__project_id__mart_requests_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "approved_at": null,
                     *         "approved_by": null,
                     *         "bindings": {
                     *           "vente": "metric:montant"
                     *         },
                     *         "created_at": "2026-10-24T14:27:22.205940Z",
                     *         "exports": [],
                     *         "id": "9403432ab13448bba8c9e1151877f178",
                     *         "iterations": [
                     *           {
                     *             "clarification": {
                     *               "options": [
                     *                 {
                     *                   "label": "Chiffre d'affaires",
                     *                   "ref": "metric:montant"
                     *                 },
                     *                 {
                     *                   "label": "Quantité vendue",
                     *                   "ref": "metric:quantite"
                     *                 }
                     *               ],
                     *               "question": "Que voulez-vous dire par « ventes » ?",
                     *               "term": "ventes"
                     *             },
                     *             "context_tokens": 233,
                     *             "created_at": "2026-10-24T14:27:22.205940Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Les ventes par produit en 2024",
                     *             "job_id": "9cbaff846a264f9cb3217dc164cdc6f8",
                     *             "kind": "question",
                     *             "llm": null,
                     *             "path": "parser",
                     *             "preview": null,
                     *             "refines": false,
                     *             "refusal": null,
                     *             "selected": [
                     *               "metric:montant",
                     *               "metric:quantite"
                     *             ],
                     *             "spec": null,
                     *             "sql": null,
                     *             "status": "clarification",
                     *             "summary": null,
                     *             "version": 1
                     *           },
                     *           {
                     *             "clarification": null,
                     *             "context_tokens": 233,
                     *             "created_at": "2026-10-24T14:27:22.675569Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Chiffre d'affaires",
                     *             "job_id": "115aba34c8c3460881561be92a803f2e",
                     *             "kind": "answer",
                     *             "llm": null,
                     *             "path": "parser",
                     *             "preview": {
                     *               "columns": [
                     *                 {
                     *                   "additivity": null,
                     *                   "kind": "axis",
                     *                   "label": "Libellé (produit)",
                     *                   "name": "libelle",
                     *                   "pii": null,
                     *                   "ref": "attribute:produit.libelle"
                     *                 },
                     *                 {
                     *                   "additivity": "additive",
                     *                   "kind": "metric",
                     *                   "label": "Chiffre d'affaires (EUR)",
                     *                   "name": "montant",
                     *                   "pii": null,
                     *                   "ref": "metric:montant"
                     *                 }
                     *               ],
                     *               "controls": [
                     *                 {
                     *                   "code": "reconciliation",
                     *                   "details": {
                     *                     "fact_total": 4994.8,
                     *                     "mart_total": 4994.8,
                     *                     "metric": "montant"
                     *                   },
                     *                   "message": "Chiffre d'affaires : total du data mart 4 994.80 = total du fait fct_ventes sur le même périmètre.",
                     *                   "status": "ok"
                     *                 },
                     *                 {
                     *                   "code": "unknown_member",
                     *                   "details": {
                     *                     "dimension": "produit",
                     *                     "rows": 1,
                     *                     "share": 0.0127
                     *                   },
                     *                   "message": "1 ligne(s) du fait sur 79 (1.3%) rattachée(s) au membre inconnu de produit : elles apparaissent sous « Inconnu » ou une valeur vide.",
                     *                   "status": "warning"
                     *                 }
                     *               ],
                     *               "pseudonymized": [],
                     *               "row_count": 12,
                     *               "rows": [
                     *                 {
                     *                   "libelle": "Plaid tricoté",
                     *                   "montant": 1377.7
                     *                 },
                     *                 {
                     *                   "libelle": "Théière en fonte",
                     *                   "montant": 630
                     *                 }
                     *               ]
                     *             },
                     *             "refines": false,
                     *             "refusal": null,
                     *             "selected": [
                     *               "metric:montant",
                     *               "metric:quantite"
                     *             ],
                     *             "spec": {
                     *               "axes": [
                     *                 "produit.libelle"
                     *               ],
                     *               "filters": [],
                     *               "limit": null,
                     *               "metrics": [
                     *                 "montant"
                     *               ],
                     *               "name": "montant_par_libelle_2024",
                     *               "order_by": [],
                     *               "period": {
                     *                 "end": "2024-12-31",
                     *                 "label": "2024",
                     *                 "start": "2024-01-01"
                     *               },
                     *               "time_dimension": "date_commande",
                     *               "time_grain": null
                     *             },
                     *             "sql": "with base as (\n\n    select\n        produit.libelle as libelle,\n        f.montant as _m_montant\n    from \"fct_ventes\" as f\n    left join \"dim_produits\" as produit\n        on produit.produit_key = f.produit_key\n    left join \"dim_date\" as date_commande\n        on date_commande.date_key = f.date_commande_key\n    where date_commande.date >= DATE '2024-01-01'\n        and date_commande.date <= DATE '202…",
                     *             "status": "previewed",
                     *             "summary": "Chiffre d'affaires par produit, sur 2024.",
                     *             "version": 2
                     *           }
                     *         ],
                     *         "model_columns": [],
                     *         "model_sql": null,
                     *         "model_summary": null,
                     *         "owner_email": "analyste@demo.forja.local",
                     *         "owner_id": "d7605ffdaaed4ce6992f576ea252fa3d",
                     *         "owner_unmasked": false,
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "publish_error": null,
                     *         "publish_job_id": null,
                     *         "published_at": null,
                     *         "published_name": null,
                     *         "published_table_id": null,
                     *         "question": "Les ventes par produit en 2024",
                     *         "rejected_by": null,
                     *         "rejection_reason": null,
                     *         "semantic_version": 3,
                     *         "status": "previewed",
                     *         "updated_at": "2026-10-24T14:27:23.184828Z",
                     *         "validated_at": null
                     *       },
                     *       {
                     *         "approved_at": null,
                     *         "approved_by": null,
                     *         "bindings": {},
                     *         "created_at": "2026-10-24T14:27:09.544676Z",
                     *         "exports": [
                     *           {
                     *             "format": "parquet",
                     *             "path": "8eb2896d10ce42e29be319159b2b2375/exports/mart_quantite_par_categorie.parquet",
                     *             "rows": 4,
                     *             "table": "mart_quantite_par_categorie"
                     *           },
                     *           {
                     *             "format": "csv",
                     *             "path": "8eb2896d10ce42e29be319159b2b2375/exports/mart_quantite_par_categorie.csv",
                     *             "rows": 4,
                     *             "table": "mart_quantite_par_categorie"
                     *           }
                     *         ],
                     *         "id": "3e69945a05a64f31929c1e6fe77e3805",
                     *         "iterations": [
                     *           {
                     *             "clarification": null,
                     *             "context_tokens": 244,
                     *             "created_at": "2026-10-24T14:27:09.544676Z",
                     *             "effective": "Quantité vendue et prix moyen par catégorie de produit",
                     *             "error": null,
                     *             "instruction": "Quantité vendue et prix moyen par catégorie de produit",
                     *             "job_id": "d06f755d25484cb1be8dadca397f503e",
                     *             "kind": "question",
                     *             "llm": null,
                     *             "path": "parser",
                     *             "preview": {
                     *               "columns": [
                     *                 {
                     *                   "additivity": null,
                     *                   "kind": "axis",
                     *                   "label": "Catégorie (produit)",
                     *                   "name": "categorie",
                     *                   "pii": null,
                     *                   "ref": "attribute:produit.categorie"
                     *                 },
                     *                 {
                     *                   "additivity": "additive",
                     *                   "kind": "metric",
                     *                   "label": "Quantité vendue (unités)",
                     *                   "name": "quantite",
                     *                   "pii": null,
                     *                   "ref": "metric:quantite"
                     *                 }
                     *               ],
                     *               "controls": [
                     *                 {
                     *                   "code": "reconciliation",
                     *                   "details": {
                     *                     "fact_total": 182,
                     *                     "mart_total": 182,
                     *                     "metric": "quantite"
                     *                   },
                     *                   "message": "Quantité vendue : total du data mart 182.00 = total du fait fct_ventes sur le même périmètre.",
                     *                   "status": "ok"
                     *                 },
                     *                 {
                     *                   "code": "reconciliation",
                     *                   "details": {
                     *                     "metric": "prix_moyen"
                     *                   },
                     *                   "message": "Prix moyen unitaire n'est pas additive (sum(montant) / sum(quantite)) : son total ne se compare pas ligne à ligne, il est recalculé à chaque niveau.",
                     *                   "status": "info"
                     *                 }
                     *               ],
                     *               "pseudonymized": [],
                     *               "row_count": 4,
                     *               "rows": [
                     *                 {
                     *                   "categorie": "maison",
                     *                   "prix_moyen": 35.1,
                     *                   "quantite": 69
                     *                 },
                     *                 {
                     *                   "categorie": "cuisine",
                     *                   "prix_moyen": 24.21,
                     *                   "quantite": 62
                     *                 }
                     *               ]
                     *             },
                     *             "refines": false,
                     *             "refusal": null,
                     *             "selected": [
                     *               "metric:quantite",
                     *               "metric:prix_moyen"
                     *             ],
                     *             "spec": {
                     *               "axes": [
                     *                 "produit.categorie"
                     *               ],
                     *               "filters": [],
                     *               "limit": null,
                     *               "metrics": [
                     *                 "quantite",
                     *                 "prix_moyen"
                     *               ],
                     *               "name": "quantite_par_categorie",
                     *               "order_by": [],
                     *               "period": null,
                     *               "time_dimension": null,
                     *               "time_grain": null
                     *             },
                     *             "sql": "with base as (\n\n    select\n        produit.categorie as categorie,\n        f.quantite as _m_quantite,\n        f.montant as _m_montant\n    from \"fct_ventes\" as f\n    left join \"dim_produits\" as produit\n        on produit.produit_key = f.produit_key\n\n)\n\nselect\n    categorie,\n    sum(_m_quantite) as quantite,\n    round(cast(sum(_m_montant) as double) / nullif(sum(_m_quantite), 0), 2) as prix_moyen\nfr…",
                     *             "status": "previewed",
                     *             "summary": "Quantité vendue et prix moyen unitaire par catégorie.",
                     *             "version": 1
                     *           }
                     *         ],
                     *         "model_columns": [
                     *           {
                     *             "additivity": null,
                     *             "kind": "axis",
                     *             "label": "Catégorie (produit)",
                     *             "name": "categorie",
                     *             "pii": null,
                     *             "ref": "attribute:produit.categorie"
                     *           },
                     *           {
                     *             "additivity": "additive",
                     *             "kind": "metric",
                     *             "label": "Quantité vendue (unités)",
                     *             "name": "quantite",
                     *             "pii": null,
                     *             "ref": "metric:quantite"
                     *           }
                     *         ],
                     *         "model_sql": "-- Data mart requested by analyste@demo.forja.local: Quantité vendue et prix moyen par catégorie de produit\n-- Quantité vendue et prix moyen unitaire par catégorie.\n-- Generated by Forja from mart request 3e69945a05a64f31929c1e6fe77e3805 v1.\n-- Do not edit: this file is regenerated on each build.\n\n{{ config(materialized='table') }}\n\nwith base as (\n\n    select\n        produit.categorie as categorie…",
                     *         "model_summary": "Quantité vendue et prix moyen unitaire par catégorie.",
                     *         "owner_email": "analyste@demo.forja.local",
                     *         "owner_id": "d7605ffdaaed4ce6992f576ea252fa3d",
                     *         "owner_unmasked": false,
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "publish_error": null,
                     *         "publish_job_id": "4796657cbbbe49feb3f37e530ce35451",
                     *         "published_at": "2026-10-24T14:27:17.699386Z",
                     *         "published_name": "mart_quantite_par_categorie",
                     *         "published_table_id": "d2ad90e3b6a744ea87cd136bcb1b90ad",
                     *         "question": "Quantité vendue et prix moyen par catégorie de produit",
                     *         "rejected_by": null,
                     *         "rejection_reason": null,
                     *         "semantic_version": 1,
                     *         "status": "published",
                     *         "updated_at": "2026-10-24T14:27:17.699386Z",
                     *         "validated_at": "2026-10-24T14:27:09.750800Z"
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["MartRequest"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_mart_request_projects__project_id__mart_requests_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MartQuestion"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "mart_request": {
                     *         "approved_at": null,
                     *         "approved_by": null,
                     *         "bindings": {},
                     *         "created_at": "2026-10-24T14:27:30.652073Z",
                     *         "exports": [],
                     *         "id": "6f65603944e144be87c4ded98fcce278",
                     *         "iterations": [
                     *           {
                     *             "clarification": null,
                     *             "context_tokens": 220,
                     *             "created_at": "2026-10-24T14:27:30.652073Z",
                     *             "effective": "Panier moyen par segment",
                     *             "error": null,
                     *             "instruction": "Panier moyen par segment",
                     *             "job_id": "936f48deb91d467a8887e98d17f6d8da",
                     *             "kind": "question",
                     *             "llm": null,
                     *             "path": "parser",
                     *             "preview": {
                     *               "columns": [
                     *                 {
                     *                   "additivity": null,
                     *                   "kind": "axis",
                     *                   "label": "Segment (client)",
                     *                   "name": "segment",
                     *                   "pii": null,
                     *                   "ref": "attribute:client.segment"
                     *                 },
                     *                 {
                     *                   "additivity": "non_additive",
                     *                   "kind": "metric",
                     *                   "label": "Panier moyen (EUR)",
                     *                   "name": "panier_moyen",
                     *                   "pii": null,
                     *                   "ref": "metric:panier_moyen"
                     *                 }
                     *               ],
                     *               "controls": [
                     *                 {
                     *                   "code": "reconciliation",
                     *                   "details": {
                     *                     "metric": "panier_moyen"
                     *                   },
                     *                   "message": "Panier moyen n'est pas additive (sum(montant) / count_distinct(id_commande)) : son total ne se compare pas ligne à ligne, il est recalculé à chaque niveau.",
                     *                   "status": "info"
                     *                 },
                     *                 {
                     *                   "code": "unknown_member",
                     *                   "details": {
                     *                     "dimension": "client",
                     *                     "rows": 4,
                     *                     "share": 0.0506
                     *                   },
                     *                   "message": "4 ligne(s) du fait sur 79 (5.1%) rattachée(s) au membre inconnu de client : elles apparaissent sous « Inconnu » ou une valeur vide.",
                     *                   "status": "warning"
                     *                 }
                     *               ],
                     *               "pseudonymized": [],
                     *               "row_count": 3,
                     *               "rows": [
                     *                 {
                     *                   "panier_moyen": 136.12,
                     *                   "segment": "professionnel"
                     *                 },
                     *                 {
                     *                   "panier_moyen": 125.24,
                     *                   "segment": "particulier"
                     *                 }
                     *               ]
                     *             },
                     *             "refines": false,
                     *             "refusal": null,
                     *             "selected": [
                     *               "metric:panier_moyen",
                     *               "metric:montant"
                     *             ],
                     *             "spec": {
                     *               "axes": [
                     *                 "client.segment"
                     *               ],
                     *               "filters": [],
                     *               "limit": null,
                     *               "metrics": [
                     *                 "panier_moyen"
                     *               ],
                     *               "name": "panier_moyen_par_segment",
                     *               "order_by": [],
                     *               "period": null,
                     *               "time_dimension": null,
                     *               "time_grain": null
                     *             },
                     *             "sql": "with base as (\n\n    select\n        client.segment as segment,\n        f.montant as _m_montant,\n        f.id_commande as _m_nb_commandes\n    from \"fct_ventes\" as f\n    left join \"dim_clients\" as client\n        on client.client_key = f.client_key\n\n)\n\nselect\n    segment,\n    round(cast(sum(_m_montant) as double) / nullif(count(distinct _m_nb_commandes), 0), 2) as panier_moyen\nfrom base\ngroup by segme…",
                     *             "status": "previewed",
                     *             "summary": "Panier moyen par segment.",
                     *             "version": 1
                     *           }
                     *         ],
                     *         "model_columns": [],
                     *         "model_sql": null,
                     *         "model_summary": null,
                     *         "owner_email": "analyste@demo.forja.local",
                     *         "owner_id": "d7605ffdaaed4ce6992f576ea252fa3d",
                     *         "owner_unmasked": false,
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "publish_error": null,
                     *         "publish_job_id": null,
                     *         "published_at": null,
                     *         "published_name": null,
                     *         "published_table_id": null,
                     *         "question": "Panier moyen par segment",
                     *         "rejected_by": null,
                     *         "rejection_reason": null,
                     *         "semantic_version": 3,
                     *         "status": "previewed",
                     *         "updated_at": "2026-10-24T14:27:30.855381Z",
                     *         "validated_at": null
                     *       },
                     *       "run": {
                     *         "attempts": 0,
                     *         "cancel_requested": false,
                     *         "created_at": "2026-10-24T14:27:30.653844Z",
                     *         "created_by": "d7605ffdaaed4ce6992f576ea252fa3d",
                     *         "error": null,
                     *         "finished_at": null,
                     *         "id": "936f48deb91d467a8887e98d17f6d8da",
                     *         "metrics": null,
                     *         "params": {
                     *           "csv_delimiter": null,
                     *           "formats": [
                     *             "parquet",
                     *             "csv"
                     *           ],
                     *           "full_refresh": false,
                     *           "mart_request_id": "6f65603944e144be87c4ded98fcce278",
                     *           "source_ids": null,
                     *           "type": "mart_request",
                     *           "use_llm": true
                     *         },
                     *         "progress": null,
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "result": null,
                     *         "started_at": null,
                     *         "status": "queued",
                     *         "type": "mart_request"
                     *       }
                     *     }
                     */
                    "application/json": components["schemas"]["MartRequestRun"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_members_projects__project_id__members_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "created_at": "2026-10-24T14:27:01.263850Z",
                     *         "email": "analyste@demo.forja.local",
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "role": "analyst",
                     *         "user_id": "d7605ffdaaed4ce6992f576ea252fa3d"
                     *       },
                     *       {
                     *         "created_at": "2026-10-24T14:27:01.186044Z",
                     *         "email": "ingenieur@demo.forja.local",
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "role": "engineer",
                     *         "user_id": "a2d87f35f7994e0ca9073a744c735e2c"
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["Membership"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_member_role_projects__project_id__members__user_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                user_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MembershipUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "created_at": "2026-10-24T14:27:18.254121Z",
                     *       "email": "nouveau@exemple.fr",
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "role": "engineer",
                     *       "user_id": "44952f442b1945e6aad10d7da4222fdb"
                     *     }
                     */
                    "application/json": components["schemas"]["Membership"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    remove_member_projects__project_id__members__user_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                user_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_relations_projects__project_id__relations_get: {
        parameters: {
            query?: {
                status?: components["schemas"]["RelationStatus"] | null;
            };
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "cardinality": "N-1",
                     *         "confidence": 0.963,
                     *         "created_at": "2026-10-24T14:26:53.622225Z",
                     *         "explanation": "94 % des valeurs de commandes.id_client existent dans clients.id_client ; noms identiques ; relation N-1 : plusieurs lignes de commandes pour une ligne de clients.",
                     *         "from_column": "id_client",
                     *         "from_distinct": 16,
                     *         "from_source": "commandes",
                     *         "from_source_id": "dc7bbfcf7f5a421481ed0375b3adfaf0",
                     *         "from_table": "stg_commandes",
                     *         "id": "2b74b31d056546769c6e937f24c569a3",
                     *         "inclusion_ratio": 0.9375,
                     *         "name_similarity": 1,
                     *         "origin": "detected",
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "sample_size": 16,
                     *         "status": "confirmed",
                     *         "to_column": "id_client",
                     *         "to_source": "clients",
                     *         "to_source_id": "50dfc045801244598ef1c8822d30163e",
                     *         "to_table": "stg_clients",
                     *         "type_compatible": true,
                     *         "updated_at": "2026-10-24T14:26:53.962469Z"
                     *       },
                     *       {
                     *         "cardinality": "N-1",
                     *         "confidence": 0.95,
                     *         "created_at": "2026-10-24T14:26:53.833429Z",
                     *         "explanation": "92 % des valeurs de lignes_commande.code_produit existent dans produits.code_produit ; noms identiques ; relation N-1 : plusieurs lignes de lignes_commande pour une ligne de produits.",
                     *         "from_column": "code_produit",
                     *         "from_distinct": 12,
                     *         "from_source": "lignes_commande",
                     *         "from_source_id": "28e20ec272674962821c20a1c78bcea4",
                     *         "from_table": "stg_lignes_commande",
                     *         "id": "4991b914ca604a6b8bab75597f869cbb",
                     *         "inclusion_ratio": 0.9167,
                     *         "name_similarity": 1,
                     *         "origin": "detected",
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "sample_size": 12,
                     *         "status": "confirmed",
                     *         "to_column": "code_produit",
                     *         "to_source": "produits",
                     *         "to_source_id": "15f93e4879464b5fa82ab4fb9ef4c700",
                     *         "to_table": "stg_produits",
                     *         "type_compatible": true,
                     *         "updated_at": "2026-10-24T14:26:53.969550Z"
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["Relation"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    add_relation_projects__project_id__relations_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RelationCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "cardinality": "N-1",
                     *       "confidence": 1,
                     *       "created_at": "2026-10-24T14:27:19.829127Z",
                     *       "explanation": "Ajoutée manuellement. 94 % des valeurs de commandes.id_client existent dans clients.id_client ; noms identiques ; relation N-1 : plusieurs lignes de commandes pour une ligne de clients.",
                     *       "from_column": "id_client",
                     *       "from_distinct": 16,
                     *       "from_source": "commandes",
                     *       "from_source_id": "dc7bbfcf7f5a421481ed0375b3adfaf0",
                     *       "from_table": "stg_commandes",
                     *       "id": "2b74b31d056546769c6e937f24c569a3",
                     *       "inclusion_ratio": 0.9375,
                     *       "name_similarity": 1,
                     *       "origin": "manual",
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "sample_size": 16,
                     *       "status": "confirmed",
                     *       "to_column": "id_client",
                     *       "to_source": "clients",
                     *       "to_source_id": "50dfc045801244598ef1c8822d30163e",
                     *       "to_table": "stg_clients",
                     *       "type_compatible": true,
                     *       "updated_at": "2026-10-24T14:27:19.829127Z"
                     *     }
                     */
                    "application/json": components["schemas"]["Relation"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    detect_relations_projects__project_id__relations_detect_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "cardinality": "N-1",
                     *         "confidence": 0.963,
                     *         "created_at": "2026-10-24T14:27:19.829127Z",
                     *         "explanation": "94 % des valeurs de commandes.id_client existent dans clients.id_client ; noms identiques ; relation N-1 : plusieurs lignes de commandes pour une ligne de clients.",
                     *         "from_column": "id_client",
                     *         "from_distinct": 16,
                     *         "from_source": "commandes",
                     *         "from_source_id": "dc7bbfcf7f5a421481ed0375b3adfaf0",
                     *         "from_table": "stg_commandes",
                     *         "id": "2b74b31d056546769c6e937f24c569a3",
                     *         "inclusion_ratio": 0.9375,
                     *         "name_similarity": 1,
                     *         "origin": "manual",
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "sample_size": 16,
                     *         "status": "confirmed",
                     *         "to_column": "id_client",
                     *         "to_source": "clients",
                     *         "to_source_id": "50dfc045801244598ef1c8822d30163e",
                     *         "to_table": "stg_clients",
                     *         "type_compatible": true,
                     *         "updated_at": "2026-10-24T14:27:20.169601Z"
                     *       },
                     *       {
                     *         "cardinality": "N-1",
                     *         "confidence": 0.95,
                     *         "created_at": "2026-10-24T14:26:53.833429Z",
                     *         "explanation": "92 % des valeurs de lignes_commande.code_produit existent dans produits.code_produit ; noms identiques ; relation N-1 : plusieurs lignes de lignes_commande pour une ligne de produits.",
                     *         "from_column": "code_produit",
                     *         "from_distinct": 12,
                     *         "from_source": "lignes_commande",
                     *         "from_source_id": "28e20ec272674962821c20a1c78bcea4",
                     *         "from_table": "stg_lignes_commande",
                     *         "id": "4991b914ca604a6b8bab75597f869cbb",
                     *         "inclusion_ratio": 0.9167,
                     *         "name_similarity": 1,
                     *         "origin": "detected",
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "sample_size": 12,
                     *         "status": "confirmed",
                     *         "to_column": "code_produit",
                     *         "to_source": "produits",
                     *         "to_source_id": "15f93e4879464b5fa82ab4fb9ef4c700",
                     *         "to_table": "stg_produits",
                     *         "type_compatible": true,
                     *         "updated_at": "2026-10-24T14:27:20.172619Z"
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["Relation"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_runs_projects__project_id__runs_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "attempts": 1,
                     *         "cancel_requested": false,
                     *         "created_at": "2026-10-24T14:27:20.494115Z",
                     *         "created_by": "a2d87f35f7994e0ca9073a744c735e2c",
                     *         "error": null,
                     *         "finished_at": "2026-10-24T14:27:21.349777Z",
                     *         "id": "3cbfe78af085477db9ba1de33a46a87e",
                     *         "metrics": {
                     *           "dbt_tests": null,
                     *           "duplicates_removed": 0,
                     *           "duration_seconds": 0.837,
                     *           "exports": [],
                     *           "llm_calls": [],
                     *           "models": [],
                     *           "profiled_sources": 5,
                     *           "relations_detected": 0,
                     *           "rows_read": 0,
                     *           "rows_rejected": 0,
                     *           "rows_valid": 0,
                     *           "serving_path": null,
                     *           "sources": [],
                     *           "unknown_member_rows": []
                     *         },
                     *         "params": {
                     *           "csv_delimiter": null,
                     *           "formats": [
                     *             "parquet",
                     *             "csv"
                     *           ],
                     *           "full_refresh": false,
                     *           "mart_request_id": null,
                     *           "source_ids": null,
                     *           "type": "profile",
                     *           "use_llm": true
                     *         },
                     *         "progress": null,
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "result": null,
                     *         "started_at": "2026-10-24T14:27:20.502665Z",
                     *         "status": "succeeded",
                     *         "type": "profile"
                     *       },
                     *       {
                     *         "attempts": 1,
                     *         "cancel_requested": false,
                     *         "created_at": "2026-10-24T14:27:20.246548Z",
                     *         "created_by": "a2d87f35f7994e0ca9073a744c735e2c",
                     *         "error": null,
                     *         "finished_at": "2026-10-24T14:27:20.333714Z",
                     *         "id": "a0643cfdab9a43c08ae5a0f968928b61",
                     *         "metrics": {
                     *           "dbt_tests": null,
                     *           "duplicates_removed": 0,
                     *           "duration_seconds": 0.055,
                     *           "exports": [],
                     *           "llm_calls": [],
                     *           "models": [],
                     *           "profiled_sources": 0,
                     *           "relations_detected": 0,
                     *           "rows_read": 0,
                     *           "rows_rejected": 0,
                     *           "rows_valid": 0,
                     *           "serving_path": null,
                     *           "sources": [],
                     *           "unknown_member_rows": []
                     *         },
                     *         "params": {
                     *           "csv_delimiter": null,
                     *           "formats": [
                     *             "parquet",
                     *             "csv"
                     *           ],
                     *           "full_refresh": false,
                     *           "mart_request_id": null,
                     *           "source_ids": null,
                     *           "type": "gold_proposal",
                     *           "use_llm": false
                     *         },
                     *         "progress": {
                     *           "message": "validation et enregistrement du plan",
                     *           "percent": 90,
                     *           "step": "validation",
                     *           "updated_at": "2026-10-24T14:27:20.308266Z"
                     *         },
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "result": {
                     *           "errors": 0,
                     *           "gold_plan_version": 2,
                     *           "origin": "heuristic",
                     *           "warnings": [
                     *             "commandes.frais_port n'est pas repris comme mesure : il est au niveau de commandes, le sommer au grain de lignes_commande le multiplierait"
                     *           ]
                     *         },
                     *         "started_at": "2026-10-24T14:27:20.269627Z",
                     *         "status": "succeeded",
                     *         "type": "gold_proposal"
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["Job"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_run_projects__project_id__runs_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RunRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "attempts": 1,
                     *       "cancel_requested": false,
                     *       "created_at": "2026-10-24T14:27:30.944485Z",
                     *       "created_by": "7a852422d26d4e1ea6ce9a431f046b03",
                     *       "error": null,
                     *       "finished_at": "2026-10-24T14:27:32.391739Z",
                     *       "id": "9432bdf2839c4c9ab142fe1d47aca38e",
                     *       "metrics": {
                     *         "dbt_tests": null,
                     *         "duplicates_removed": 0,
                     *         "duration_seconds": 1.421,
                     *         "exports": [
                     *           {
                     *             "format": "parquet",
                     *             "path": "8eb2896d10ce42e29be319159b2b2375/exports/dim_clients.parquet",
                     *             "rows": 21,
                     *             "table": "dim_clients"
                     *           },
                     *           {
                     *             "format": "csv",
                     *             "path": "8eb2896d10ce42e29be319159b2b2375/exports/dim_clients.csv",
                     *             "rows": 21,
                     *             "table": "dim_clients"
                     *           }
                     *         ],
                     *         "llm_calls": [],
                     *         "models": [],
                     *         "profiled_sources": 0,
                     *         "relations_detected": 0,
                     *         "rows_read": 0,
                     *         "rows_rejected": 0,
                     *         "rows_valid": 0,
                     *         "serving_path": "8eb2896d10ce42e29be319159b2b2375/serving/demo_e_commerce.duckdb",
                     *         "sources": [],
                     *         "unknown_member_rows": []
                     *       },
                     *       "params": {
                     *         "csv_delimiter": null,
                     *         "formats": [
                     *           "parquet",
                     *           "csv"
                     *         ],
                     *         "full_refresh": false,
                     *         "mart_request_id": null,
                     *         "source_ids": null,
                     *         "type": "export",
                     *         "use_llm": true
                     *       },
                     *       "progress": null,
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "result": null,
                     *       "started_at": "2026-10-24T14:27:30.957155Z",
                     *       "status": "succeeded",
                     *       "type": "export"
                     *     }
                     */
                    "application/json": components["schemas"]["Job"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_semantic_layer_projects__project_id__semantic_layer_get: {
        parameters: {
            query?: {
                version?: number | null;
            };
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "created_at": "2026-10-24T14:27:01.086922Z",
                     *       "created_by": null,
                     *       "default_time_dimension": "date_commande",
                     *       "dimensions": [
                     *         {
                     *           "attributes": [
                     *             {
                     *               "column": "code_produit",
                     *               "data_type": "text",
                     *               "description": "",
                     *               "filterable": true,
                     *               "hidden": false,
                     *               "label": "Code produit",
                     *               "name": "code_produit",
                     *               "pii": null,
                     *               "synonyms": []
                     *             },
                     *             {
                     *               "column": "libelle",
                     *               "data_type": "text",
                     *               "description": "",
                     *               "filterable": true,
                     *               "hidden": false,
                     *               "label": "Libellé",
                     *               "name": "libelle",
                     *               "pii": null,
                     *               "synonyms": [
                     *                 "produit",
                     *                 "article"
                     *               ]
                     *             }
                     *           ],
                     *           "description": "",
                     *           "display_attribute": "libelle",
                     *           "fact": "fct_ventes",
                     *           "fact_key": "produit_key",
                     *           "hidden": false,
                     *           "hierarchies": [
                     *             {
                     *               "label": "Catalogue",
                     *               "levels": [
                     *                 "categorie",
                     *                 "libelle"
                     *               ],
                     *               "name": "catalogue"
                     *             }
                     *           ],
                     *           "historized": true,
                     *           "kind": "standard",
                     *           "label": "Produit",
                     *           "name": "produit",
                     *           "synonyms": [
                     *             "produit",
                     *             "article"
                     *           ],
                     *           "table": "dim_produits",
                     *           "table_key": "produit_key"
                     *         },
                     *         {
                     *           "attributes": [
                     *             {
                     *               "column": "id_client",
                     *               "data_type": "text",
                     *               "description": "",
                     *               "filterable": true,
                     *               "hidden": false,
                     *               "label": "Identifiant client",
                     *               "name": "id_client",
                     *               "pii": null,
                     *               "synonyms": []
                     *             },
                     *             {
                     *               "column": "nom",
                     *               "data_type": "text",
                     *               "description": "",
                     *               "filterable": false,
                     *               "hidden": false,
                     *               "label": "Nom",
                     *               "name": "nom",
                     *               "pii": "last_name",
                     *               "synonyms": []
                     *             }
                     *           ],
                     *           "description": "",
                     *           "display_attribute": "id_client",
                     *           "fact": "fct_ventes",
                     *           "fact_key": "client_key",
                     *           "hidden": false,
                     *           "hierarchies": [],
                     *           "historized": true,
                     *           "kind": "standard",
                     *           "label": "Client",
                     *           "name": "client",
                     *           "synonyms": [
                     *             "client",
                     *             "acheteur"
                     *           ],
                     *           "table": "dim_clients",
                     *           "table_key": "client_key"
                     *         }
                     *       ],
                     *       "gold_plan_version": 1,
                     *       "id": "02136624b12443b697649f7143b44a54",
                     *       "metrics": [
                     *         {
                     *           "additivity": "additive",
                     *           "aggregation": "sum",
                     *           "column": "quantite",
                     *           "default": false,
                     *           "denominator": null,
                     *           "description": "sum(quantite) sur fct_ventes",
                     *           "fact": "fct_ventes",
                     *           "format": "integer",
                     *           "formula": "sum(quantite)",
                     *           "hidden": false,
                     *           "kind": "aggregate",
                     *           "label": "Quantité vendue",
                     *           "name": "quantite",
                     *           "non_additive_dimensions": [],
                     *           "numerator": null,
                     *           "synonyms": [
                     *             "quantité",
                     *             "quantité vendue"
                     *           ],
                     *           "unit": "unités"
                     *         },
                     *         {
                     *           "additivity": "additive",
                     *           "aggregation": "sum",
                     *           "column": "montant",
                     *           "default": true,
                     *           "denominator": null,
                     *           "description": "sum(montant) sur fct_ventes",
                     *           "fact": "fct_ventes",
                     *           "format": "currency",
                     *           "formula": "sum(montant)",
                     *           "hidden": false,
                     *           "kind": "aggregate",
                     *           "label": "Chiffre d'affaires",
                     *           "name": "montant",
                     *           "non_additive_dimensions": [],
                     *           "numerator": null,
                     *           "synonyms": [
                     *             "chiffre d'affaires",
                     *             "CA"
                     *           ],
                     *           "unit": "EUR"
                     *         }
                     *       ],
                     *       "overrides": [],
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "version": 1
                     *     }
                     */
                    "application/json": components["schemas"]["SemanticLayer"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    patch_semantic_layer_projects__project_id__semantic_layer_patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SemanticPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "created_at": "2026-10-24T14:27:21.926463Z",
                     *       "created_by": "a2d87f35f7994e0ca9073a744c735e2c",
                     *       "default_time_dimension": "date_commande",
                     *       "dimensions": [
                     *         {
                     *           "attributes": [
                     *             {
                     *               "column": "code_produit",
                     *               "data_type": "text",
                     *               "description": "",
                     *               "filterable": true,
                     *               "hidden": false,
                     *               "label": "Code produit",
                     *               "name": "code_produit",
                     *               "pii": null,
                     *               "synonyms": []
                     *             },
                     *             {
                     *               "column": "libelle",
                     *               "data_type": "text",
                     *               "description": "",
                     *               "filterable": true,
                     *               "hidden": false,
                     *               "label": "Libellé",
                     *               "name": "libelle",
                     *               "pii": null,
                     *               "synonyms": [
                     *                 "produit",
                     *                 "article"
                     *               ]
                     *             }
                     *           ],
                     *           "description": "",
                     *           "display_attribute": "libelle",
                     *           "fact": "fct_ventes",
                     *           "fact_key": "produit_key",
                     *           "hidden": false,
                     *           "hierarchies": [
                     *             {
                     *               "label": "Catalogue",
                     *               "levels": [
                     *                 "categorie",
                     *                 "libelle"
                     *               ],
                     *               "name": "catalogue"
                     *             }
                     *           ],
                     *           "historized": true,
                     *           "kind": "standard",
                     *           "label": "Produit",
                     *           "name": "produit",
                     *           "synonyms": [
                     *             "produit",
                     *             "article"
                     *           ],
                     *           "table": "dim_produits",
                     *           "table_key": "produit_key"
                     *         },
                     *         {
                     *           "attributes": [
                     *             {
                     *               "column": "id_client",
                     *               "data_type": "text",
                     *               "description": "",
                     *               "filterable": true,
                     *               "hidden": false,
                     *               "label": "Identifiant client",
                     *               "name": "id_client",
                     *               "pii": null,
                     *               "synonyms": []
                     *             },
                     *             {
                     *               "column": "nom",
                     *               "data_type": "text",
                     *               "description": "",
                     *               "filterable": false,
                     *               "hidden": false,
                     *               "label": "Nom",
                     *               "name": "nom",
                     *               "pii": "last_name",
                     *               "synonyms": []
                     *             }
                     *           ],
                     *           "description": "",
                     *           "display_attribute": "id_client",
                     *           "fact": "fct_ventes",
                     *           "fact_key": "client_key",
                     *           "hidden": false,
                     *           "hierarchies": [],
                     *           "historized": true,
                     *           "kind": "standard",
                     *           "label": "Client",
                     *           "name": "client",
                     *           "synonyms": [
                     *             "client",
                     *             "acheteur"
                     *           ],
                     *           "table": "dim_clients",
                     *           "table_key": "client_key"
                     *         }
                     *       ],
                     *       "gold_plan_version": 1,
                     *       "id": "19d68137246d4364b249e54b87de8140",
                     *       "metrics": [
                     *         {
                     *           "additivity": "additive",
                     *           "aggregation": "sum",
                     *           "column": "quantite",
                     *           "default": false,
                     *           "denominator": null,
                     *           "description": "sum(quantite) sur fct_ventes",
                     *           "fact": "fct_ventes",
                     *           "format": "integer",
                     *           "formula": "sum(quantite)",
                     *           "hidden": false,
                     *           "kind": "aggregate",
                     *           "label": "Quantité vendue",
                     *           "name": "quantite",
                     *           "non_additive_dimensions": [],
                     *           "numerator": null,
                     *           "synonyms": [
                     *             "quantité",
                     *             "quantité vendue"
                     *           ],
                     *           "unit": "unités"
                     *         },
                     *         {
                     *           "additivity": "additive",
                     *           "aggregation": "sum",
                     *           "column": "montant",
                     *           "default": true,
                     *           "denominator": null,
                     *           "description": "sum(montant) sur fct_ventes",
                     *           "fact": "fct_ventes",
                     *           "format": "currency",
                     *           "formula": "sum(montant)",
                     *           "hidden": false,
                     *           "kind": "aggregate",
                     *           "label": "Chiffre d'affaires",
                     *           "name": "montant",
                     *           "non_additive_dimensions": [],
                     *           "numerator": null,
                     *           "synonyms": [
                     *             "chiffre d'affaires",
                     *             "CA"
                     *           ],
                     *           "unit": "EUR"
                     *         }
                     *       ],
                     *       "overrides": [
                     *         {
                     *           "add_synonyms": [
                     *             "recettes"
                     *           ],
                     *           "description": null,
                     *           "hidden": null,
                     *           "label": null,
                     *           "synonyms": null,
                     *           "target": "metric:montant",
                     *           "updated_at": "2026-10-24T14:27:21.869425Z",
                     *           "updated_by": "a2d87f35f7994e0ca9073a744c735e2c"
                     *         }
                     *       ],
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "version": 2
                     *     }
                     */
                    "application/json": components["schemas"]["SemanticLayer"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    regenerate_projects__project_id__semantic_layer_regenerate_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "created_at": "2026-10-24T14:27:01.086922Z",
                     *       "created_by": null,
                     *       "default_time_dimension": "date_commande",
                     *       "dimensions": [
                     *         {
                     *           "attributes": [
                     *             {
                     *               "column": "code_produit",
                     *               "data_type": "text",
                     *               "description": "",
                     *               "filterable": true,
                     *               "hidden": false,
                     *               "label": "Code produit",
                     *               "name": "code_produit",
                     *               "pii": null,
                     *               "synonyms": []
                     *             },
                     *             {
                     *               "column": "libelle",
                     *               "data_type": "text",
                     *               "description": "",
                     *               "filterable": true,
                     *               "hidden": false,
                     *               "label": "Libellé",
                     *               "name": "libelle",
                     *               "pii": null,
                     *               "synonyms": [
                     *                 "produit",
                     *                 "article"
                     *               ]
                     *             }
                     *           ],
                     *           "description": "",
                     *           "display_attribute": "libelle",
                     *           "fact": "fct_ventes",
                     *           "fact_key": "produit_key",
                     *           "hidden": false,
                     *           "hierarchies": [
                     *             {
                     *               "label": "Catalogue",
                     *               "levels": [
                     *                 "categorie",
                     *                 "libelle"
                     *               ],
                     *               "name": "catalogue"
                     *             }
                     *           ],
                     *           "historized": true,
                     *           "kind": "standard",
                     *           "label": "Produit",
                     *           "name": "produit",
                     *           "synonyms": [
                     *             "produit",
                     *             "article"
                     *           ],
                     *           "table": "dim_produits",
                     *           "table_key": "produit_key"
                     *         },
                     *         {
                     *           "attributes": [
                     *             {
                     *               "column": "id_client",
                     *               "data_type": "text",
                     *               "description": "",
                     *               "filterable": true,
                     *               "hidden": false,
                     *               "label": "Identifiant client",
                     *               "name": "id_client",
                     *               "pii": null,
                     *               "synonyms": []
                     *             },
                     *             {
                     *               "column": "nom",
                     *               "data_type": "text",
                     *               "description": "",
                     *               "filterable": false,
                     *               "hidden": false,
                     *               "label": "Nom",
                     *               "name": "nom",
                     *               "pii": "last_name",
                     *               "synonyms": []
                     *             }
                     *           ],
                     *           "description": "",
                     *           "display_attribute": "id_client",
                     *           "fact": "fct_ventes",
                     *           "fact_key": "client_key",
                     *           "hidden": false,
                     *           "hierarchies": [],
                     *           "historized": true,
                     *           "kind": "standard",
                     *           "label": "Client",
                     *           "name": "client",
                     *           "synonyms": [
                     *             "client",
                     *             "acheteur"
                     *           ],
                     *           "table": "dim_clients",
                     *           "table_key": "client_key"
                     *         }
                     *       ],
                     *       "gold_plan_version": 1,
                     *       "id": "02136624b12443b697649f7143b44a54",
                     *       "metrics": [
                     *         {
                     *           "additivity": "additive",
                     *           "aggregation": "sum",
                     *           "column": "quantite",
                     *           "default": false,
                     *           "denominator": null,
                     *           "description": "sum(quantite) sur fct_ventes",
                     *           "fact": "fct_ventes",
                     *           "format": "integer",
                     *           "formula": "sum(quantite)",
                     *           "hidden": false,
                     *           "kind": "aggregate",
                     *           "label": "Quantité vendue",
                     *           "name": "quantite",
                     *           "non_additive_dimensions": [],
                     *           "numerator": null,
                     *           "synonyms": [
                     *             "quantité",
                     *             "quantité vendue"
                     *           ],
                     *           "unit": "unités"
                     *         },
                     *         {
                     *           "additivity": "additive",
                     *           "aggregation": "sum",
                     *           "column": "montant",
                     *           "default": true,
                     *           "denominator": null,
                     *           "description": "sum(montant) sur fct_ventes",
                     *           "fact": "fct_ventes",
                     *           "format": "currency",
                     *           "formula": "sum(montant)",
                     *           "hidden": false,
                     *           "kind": "aggregate",
                     *           "label": "Chiffre d'affaires",
                     *           "name": "montant",
                     *           "non_additive_dimensions": [],
                     *           "numerator": null,
                     *           "synonyms": [
                     *             "chiffre d'affaires",
                     *             "CA"
                     *           ],
                     *           "unit": "EUR"
                     *         }
                     *       ],
                     *       "overrides": [],
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "version": 1
                     *     }
                     */
                    "application/json": components["schemas"]["SemanticLayer"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_synonym_proposals_projects__project_id__semantic_layer_synonym_proposals_get: {
        parameters: {
            query?: {
                status?: ("pending" | "accepted" | "rejected") | null;
            };
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "created_at": "2026-10-24T14:27:21.975682Z",
                     *         "id": "8c671c0454b846c1bc2758243c69e5af",
                     *         "mart_request_id": null,
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "proposed_by": "d7605ffdaaed4ce6992f576ea252fa3d",
                     *         "reviewed_at": null,
                     *         "reviewed_by": null,
                     *         "status": "pending",
                     *         "synonym": "encaissements",
                     *         "target": "metric:montant"
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["SynonymProposal"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    propose_synonym_projects__project_id__semantic_layer_synonym_proposals_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SynonymProposalCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "created_at": "2026-10-24T14:27:22.138704Z",
                     *       "id": "afd27b62b67240ee9aca07e55988564a",
                     *       "mart_request_id": null,
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "proposed_by": "d7605ffdaaed4ce6992f576ea252fa3d",
                     *       "reviewed_at": null,
                     *       "reviewed_by": null,
                     *       "status": "pending",
                     *       "synonym": "cité",
                     *       "target": "attribute:client.ville"
                     *     }
                     */
                    "application/json": components["schemas"]["SynonymProposal"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_semantic_versions_projects__project_id__semantic_layer_versions_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       1
                     *     ]
                     */
                    "application/json": number[];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_sources_projects__project_id__sources_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "bronze_path": "8eb2896d10ce42e29be319159b2b2375/bronze/clients/20261024T142644131531Z_v0001_clients.parquet",
                     *         "column_count": 7,
                     *         "columns": [
                     *           {
                     *             "name": "id_client",
                     *             "technical": false,
                     *             "type": "VARCHAR"
                     *           },
                     *           {
                     *             "name": "nom",
                     *             "technical": false,
                     *             "type": "VARCHAR"
                     *           }
                     *         ],
                     *         "delimiter": ";",
                     *         "encoding": "cp1252",
                     *         "format": "csv",
                     *         "id": "50dfc045801244598ef1c8822d30163e",
                     *         "ingested_at": "2026-10-24T14:26:44.131531Z",
                     *         "latest_version_id": "7605aa62aaa94f688167af5032bf7da9",
                     *         "name": "clients",
                     *         "original_filename": "clients.csv",
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "quality_score": 100,
                     *         "row_count": 20,
                     *         "schema_drift": null,
                     *         "sheet_name": null,
                     *         "version": 1,
                     *         "warnings": []
                     *       },
                     *       {
                     *         "bronze_path": "8eb2896d10ce42e29be319159b2b2375/bronze/commandes/20261024T142644694024Z_v0001_commandes.parquet",
                     *         "column_count": 5,
                     *         "columns": [
                     *           {
                     *             "name": "id_commande",
                     *             "technical": false,
                     *             "type": "VARCHAR"
                     *           },
                     *           {
                     *             "name": "id_client",
                     *             "technical": false,
                     *             "type": "VARCHAR"
                     *           }
                     *         ],
                     *         "delimiter": ";",
                     *         "encoding": "utf-8",
                     *         "format": "csv",
                     *         "id": "dc7bbfcf7f5a421481ed0375b3adfaf0",
                     *         "ingested_at": "2026-10-24T14:26:44.694024Z",
                     *         "latest_version_id": "06ead8c9889d4686839667b918b525e5",
                     *         "name": "commandes",
                     *         "original_filename": "commandes.csv",
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "quality_score": 100,
                     *         "row_count": 40,
                     *         "schema_drift": null,
                     *         "sheet_name": null,
                     *         "version": 1,
                     *         "warnings": []
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["Source"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upload_source_projects__project_id__sources_post: {
        parameters: {
            query?: {
                /** @description auto: new version of the source with the same logical name, or new source; new_source: always a new source; new_version: fail if no such source exists */
                mode?: components["schemas"]["IngestMode"];
                /** @description Source receiving the new version (implies new_version) */
                source_id?: string | null;
            };
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_upload_source_projects__project_id__sources_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "bronze_path": "8eb2896d10ce42e29be319159b2b2375/bronze/catalogue/20261024T142719022426Z_v0001_catalogue.parquet",
                     *         "column_count": 5,
                     *         "columns": [
                     *           {
                     *             "name": "code_produit",
                     *             "technical": false,
                     *             "type": "VARCHAR"
                     *           },
                     *           {
                     *             "name": "libelle",
                     *             "technical": false,
                     *             "type": "VARCHAR"
                     *           }
                     *         ],
                     *         "delimiter": ";",
                     *         "encoding": "utf-8",
                     *         "format": "csv",
                     *         "id": "7c1ab95b1f5a43a38ec9f32def56de52",
                     *         "ingested_at": "2026-10-24T14:27:19.022426Z",
                     *         "latest_version_id": "1d98d06b59614ab596ef2f372002f73d",
                     *         "name": "catalogue",
                     *         "original_filename": "catalogue.csv",
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "quality_score": 100,
                     *         "row_count": 12,
                     *         "schema_drift": null,
                     *         "sheet_name": null,
                     *         "version": 1,
                     *         "warnings": []
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["Source"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_tables_projects__project_id__tables_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "built_at": "2026-10-24T14:27:00.961157Z",
                     *         "columns": [
                     *           {
                     *             "name": "client_key",
                     *             "technical": false,
                     *             "type": "VARCHAR"
                     *           },
                     *           {
                     *             "name": "id_client",
                     *             "technical": false,
                     *             "type": "VARCHAR"
                     *           }
                     *         ],
                     *         "id": "8cb9dd681a2947e8b8ac9d024d7080d0",
                     *         "last_run_id": "fc29e5dc3bf946699f1ec754bd6b2124",
                     *         "layer": "gold",
                     *         "name": "dim_clients",
                     *         "owner_id": null,
                     *         "plan_version": 1,
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "publish": true,
                     *         "rejected_count": 0,
                     *         "row_count": 21,
                     *         "source_id": null
                     *       },
                     *       {
                     *         "built_at": "2026-10-24T14:27:00.995051Z",
                     *         "columns": [
                     *           {
                     *             "name": "date_key",
                     *             "technical": false,
                     *             "type": "INTEGER"
                     *           },
                     *           {
                     *             "name": "date",
                     *             "technical": false,
                     *             "type": "DATE"
                     *           }
                     *         ],
                     *         "id": "72942d45ed99438e98a7e745a0011e48",
                     *         "last_run_id": "fc29e5dc3bf946699f1ec754bd6b2124",
                     *         "layer": "gold",
                     *         "name": "dim_date",
                     *         "owner_id": null,
                     *         "plan_version": 1,
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "publish": true,
                     *         "rejected_count": 0,
                     *         "row_count": 323,
                     *         "source_id": null
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["WarehouseTable"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_relation_relations__relation_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                relation_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "cardinality": "N-1",
                     *       "confidence": 0.963,
                     *       "created_at": "2026-10-24T14:26:53.622225Z",
                     *       "explanation": "94 % des valeurs de commandes.id_client existent dans clients.id_client ; noms identiques ; relation N-1 : plusieurs lignes de commandes pour une ligne de clients.",
                     *       "from_column": "id_client",
                     *       "from_distinct": 16,
                     *       "from_source": "commandes",
                     *       "from_source_id": "dc7bbfcf7f5a421481ed0375b3adfaf0",
                     *       "from_table": "stg_commandes",
                     *       "id": "2b74b31d056546769c6e937f24c569a3",
                     *       "inclusion_ratio": 0.9375,
                     *       "name_similarity": 1,
                     *       "origin": "detected",
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "sample_size": 16,
                     *       "status": "confirmed",
                     *       "to_column": "id_client",
                     *       "to_source": "clients",
                     *       "to_source_id": "50dfc045801244598ef1c8822d30163e",
                     *       "to_table": "stg_clients",
                     *       "type_compatible": true,
                     *       "updated_at": "2026-10-24T14:26:53.962469Z"
                     *     }
                     */
                    "application/json": components["schemas"]["Relation"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    confirm_relation_relations__relation_id__confirm_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                relation_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "cardinality": "N-1",
                     *       "confidence": 0.963,
                     *       "created_at": "2026-10-24T14:26:53.622225Z",
                     *       "explanation": "94 % des valeurs de commandes.id_client existent dans clients.id_client ; noms identiques ; relation N-1 : plusieurs lignes de commandes pour une ligne de clients.",
                     *       "from_column": "id_client",
                     *       "from_distinct": 16,
                     *       "from_source": "commandes",
                     *       "from_source_id": "dc7bbfcf7f5a421481ed0375b3adfaf0",
                     *       "from_table": "stg_commandes",
                     *       "id": "2b74b31d056546769c6e937f24c569a3",
                     *       "inclusion_ratio": 0.9375,
                     *       "name_similarity": 1,
                     *       "origin": "detected",
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "sample_size": 16,
                     *       "status": "confirmed",
                     *       "to_column": "id_client",
                     *       "to_source": "clients",
                     *       "to_source_id": "50dfc045801244598ef1c8822d30163e",
                     *       "to_table": "stg_clients",
                     *       "type_compatible": true,
                     *       "updated_at": "2026-10-24T14:27:19.735872Z"
                     *     }
                     */
                    "application/json": components["schemas"]["Relation"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reject_relation_relations__relation_id__reject_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                relation_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "cardinality": "N-1",
                     *       "confidence": 0.963,
                     *       "created_at": "2026-10-24T14:26:53.622225Z",
                     *       "explanation": "94 % des valeurs de commandes.id_client existent dans clients.id_client ; noms identiques ; relation N-1 : plusieurs lignes de commandes pour une ligne de clients.",
                     *       "from_column": "id_client",
                     *       "from_distinct": 16,
                     *       "from_source": "commandes",
                     *       "from_source_id": "dc7bbfcf7f5a421481ed0375b3adfaf0",
                     *       "from_table": "stg_commandes",
                     *       "id": "2b74b31d056546769c6e937f24c569a3",
                     *       "inclusion_ratio": 0.9375,
                     *       "name_similarity": 1,
                     *       "origin": "detected",
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "sample_size": 16,
                     *       "status": "rejected",
                     *       "to_column": "id_client",
                     *       "to_source": "clients",
                     *       "to_source_id": "50dfc045801244598ef1c8822d30163e",
                     *       "to_table": "stg_clients",
                     *       "type_compatible": true,
                     *       "updated_at": "2026-10-24T14:27:19.696684Z"
                     *     }
                     */
                    "application/json": components["schemas"]["Relation"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_run_runs__run_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "attempts": 1,
                     *       "cancel_requested": false,
                     *       "created_at": "2026-10-24T14:27:20.494115Z",
                     *       "created_by": "a2d87f35f7994e0ca9073a744c735e2c",
                     *       "error": null,
                     *       "finished_at": "2026-10-24T14:27:21.349777Z",
                     *       "id": "3cbfe78af085477db9ba1de33a46a87e",
                     *       "metrics": {
                     *         "dbt_tests": null,
                     *         "duplicates_removed": 0,
                     *         "duration_seconds": 0.837,
                     *         "exports": [],
                     *         "llm_calls": [],
                     *         "models": [],
                     *         "profiled_sources": 5,
                     *         "relations_detected": 0,
                     *         "rows_read": 0,
                     *         "rows_rejected": 0,
                     *         "rows_valid": 0,
                     *         "serving_path": null,
                     *         "sources": [],
                     *         "unknown_member_rows": []
                     *       },
                     *       "params": {
                     *         "csv_delimiter": null,
                     *         "formats": [
                     *           "parquet",
                     *           "csv"
                     *         ],
                     *         "full_refresh": false,
                     *         "mart_request_id": null,
                     *         "source_ids": null,
                     *         "type": "profile",
                     *         "use_llm": true
                     *       },
                     *       "progress": null,
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "result": null,
                     *       "started_at": "2026-10-24T14:27:20.502665Z",
                     *       "status": "succeeded",
                     *       "type": "profile"
                     *     }
                     */
                    "application/json": components["schemas"]["Job"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_run_runs__run_id__cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "attempts": 0,
                     *       "cancel_requested": true,
                     *       "created_at": "2026-10-24T14:27:21.407439Z",
                     *       "created_by": null,
                     *       "error": "cancelled",
                     *       "finished_at": "2026-10-24T14:27:21.438146Z",
                     *       "id": "5ca5e7c1fada47ff80918426421e741d",
                     *       "metrics": null,
                     *       "params": {
                     *         "csv_delimiter": null,
                     *         "formats": [
                     *           "parquet",
                     *           "csv"
                     *         ],
                     *         "full_refresh": false,
                     *         "mart_request_id": null,
                     *         "source_ids": null,
                     *         "type": "export",
                     *         "use_llm": true
                     *       },
                     *       "progress": null,
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "result": null,
                     *       "started_at": null,
                     *       "status": "cancelled",
                     *       "type": "export"
                     *     }
                     */
                    "application/json": components["schemas"]["Job"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_run_logs_runs__run_id__logs_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [16:27:20] profile started
                     *     [16:27:20] catalogue v1: quality score 100.0, 0 PII column(s)
                     *     [16:27:20] clients v2: quality score 100.0, 3 PII column(s)
                     *     [16:27:21] commandes v1: quality score 100.0, 0 PII column(s)
                     *     [16:27:21] lignes_commande v1: quality score 95.5, 0 PII column(s)
                     *     [16:27:21] produits v1: quality score 100.0, 0 PII column(s)
                     *     [16:27:21] profile succeeded in 0.8 s
                     */
                    "text/plain": string;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_source_sources__source_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                source_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "bronze_path": "8eb2896d10ce42e29be319159b2b2375/bronze/clients/20261024T142718563995Z_v0002_clients.parquet",
                     *       "column_count": 7,
                     *       "columns": [
                     *         {
                     *           "name": "id_client",
                     *           "technical": false,
                     *           "type": "VARCHAR"
                     *         },
                     *         {
                     *           "name": "nom",
                     *           "technical": false,
                     *           "type": "VARCHAR"
                     *         }
                     *       ],
                     *       "delimiter": ";",
                     *       "encoding": "cp1252",
                     *       "format": "csv",
                     *       "id": "50dfc045801244598ef1c8822d30163e",
                     *       "ingested_at": "2026-10-24T14:27:18.563995Z",
                     *       "latest_version_id": "7d3755f1afce4447a587e439a0ad728f",
                     *       "name": "clients",
                     *       "original_filename": "clients.csv",
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "quality_score": 100,
                     *       "row_count": 21,
                     *       "schema_drift": {
                     *         "added": [],
                     *         "has_drift": false,
                     *         "previous_version": 1,
                     *         "removed": [],
                     *         "type_changed": []
                     *       },
                     *       "sheet_name": null,
                     *       "version": 2,
                     *       "warnings": []
                     *     }
                     */
                    "application/json": components["schemas"]["Source"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_plan_sources__source_id__plan_get: {
        parameters: {
            query?: {
                version?: number | null;
            };
            header?: never;
            path: {
                source_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "based_on_source_version": 1,
                     *       "columns": [
                     *         {
                     *           "accepted_values": null,
                     *           "cast": {
                     *             "date_format": null,
                     *             "decimal_separator": null,
                     *             "false_values": [],
                     *             "null_values": [],
                     *             "true_values": []
                     *           },
                     *           "description": "Texte. 0,0 % de valeurs nulles, 20 valeurs distinctes au profiling.",
                     *           "explanation": "Texte conservé. Espaces superflus retirés.",
                     *           "from_text": true,
                     *           "included": true,
                     *           "inferred_type": "string",
                     *           "normalization": "collapse_whitespace",
                     *           "pii_level": null,
                     *           "pii_treatment": "none",
                     *           "pii_type": null,
                     *           "present_in_latest": true,
                     *           "rules": [
                     *             {
                     *               "enabled": true,
                     *               "explanation": "Clé primaire : les lignes sans valeur sont mises en quarantaine.",
                     *               "kind": "not_null"
                     *             }
                     *           ],
                     *           "source_column": "id_client",
                     *           "source_type": "VARCHAR",
                     *           "stats": {
                     *             "distinct_count": 20,
                     *             "invalid_count": 0,
                     *             "match_ratio": 1,
                     *             "null_count": 0,
                     *             "null_pct": 0,
                     *             "row_count": 20
                     *           },
                     *           "target_column": "id_client",
                     *           "target_type": "varchar"
                     *         },
                     *         {
                     *           "accepted_values": null,
                     *           "cast": {
                     *             "date_format": null,
                     *             "decimal_separator": null,
                     *             "false_values": [],
                     *             "null_values": [],
                     *             "true_values": []
                     *           },
                     *           "description": "Texte. 0,0 % de valeurs nulles, 20 valeurs distinctes au profiling. Donnée personnelle : nom.",
                     *           "explanation": "Texte conservé. Espaces superflus retirés. Donnée personnelle (nom, confiance élevée) : en clair en Silver, pseudonymisée (HMAC-SHA256) dans serving et les exports.",
                     *           "from_text": true,
                     *           "included": true,
                     *           "inferred_type": "string",
                     *           "normalization": "collapse_whitespace",
                     *           "pii_level": "high",
                     *           "pii_treatment": "hash",
                     *           "pii_type": "last_name",
                     *           "present_in_latest": true,
                     *           "rules": [],
                     *           "source_column": "nom",
                     *           "source_type": "VARCHAR",
                     *           "stats": {
                     *             "distinct_count": 20,
                     *             "invalid_count": 0,
                     *             "match_ratio": 1,
                     *             "null_count": 0,
                     *             "null_pct": 0,
                     *             "row_count": 20
                     *           },
                     *           "target_column": "nom",
                     *           "target_type": "varchar"
                     *         }
                     *       ],
                     *       "created_at": "2026-10-24T14:26:44.433926Z",
                     *       "deduplication": {
                     *         "duplicate_rows": 0,
                     *         "enabled": true,
                     *         "explanation": "Déduplication exacte : aucun doublon au profiling, une seule occurrence conservée si des doublons apparaissent."
                     *       },
                     *       "id": "d1b84ae8e394488fa67cec2397cb2c16",
                     *       "model_name": "stg_clients",
                     *       "primary_key": {
                     *         "columns": [
                     *           "id_client"
                     *         ],
                     *         "explanation": "Clé primaire retenue : id_client. Une ligne plus récente de même clé remplace l'ancienne ; deux lignes d'un même lot avec la même clé sont mises en quarantaine.",
                     *         "quasi_unique": false
                     *       },
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "source_id": "50dfc045801244598ef1c8822d30163e",
                     *       "source_name": "clients",
                     *       "status": "applied",
                     *       "summary": "7 colonne(s) publiée(s) sur 7, 3 règle(s) de validité, 3 colonne(s) personnelle(s). Clé primaire retenue : id_client. Une ligne plus récente de même clé remplace l'ancienne ; deux lignes d'un même lot avec la même clé sont mises en quarantaine.",
                     *       "updated_at": "2026-10-24T14:26:53.380969Z",
                     *       "version": 1,
                     *       "warnings": []
                     *     }
                     */
                    "application/json": components["schemas"]["TransformationPlan"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    patch_plan_sources__source_id__plan_patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                source_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PlanPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "based_on_source_version": 1,
                     *       "columns": [
                     *         {
                     *           "accepted_values": null,
                     *           "cast": {
                     *             "date_format": null,
                     *             "decimal_separator": null,
                     *             "false_values": [],
                     *             "null_values": [],
                     *             "true_values": []
                     *           },
                     *           "description": "Texte. 0,0 % de valeurs nulles, 20 valeurs distinctes au profiling.",
                     *           "explanation": "Texte conservé. Espaces superflus retirés.",
                     *           "from_text": true,
                     *           "included": true,
                     *           "inferred_type": "string",
                     *           "normalization": "collapse_whitespace",
                     *           "pii_level": null,
                     *           "pii_treatment": "none",
                     *           "pii_type": null,
                     *           "present_in_latest": true,
                     *           "rules": [
                     *             {
                     *               "enabled": true,
                     *               "explanation": "Clé primaire : les lignes sans valeur sont mises en quarantaine.",
                     *               "kind": "not_null"
                     *             }
                     *           ],
                     *           "source_column": "id_client",
                     *           "source_type": "VARCHAR",
                     *           "stats": {
                     *             "distinct_count": 20,
                     *             "invalid_count": 0,
                     *             "match_ratio": 1,
                     *             "null_count": 0,
                     *             "null_pct": 0,
                     *             "row_count": 20
                     *           },
                     *           "target_column": "id_client",
                     *           "target_type": "varchar"
                     *         },
                     *         {
                     *           "accepted_values": null,
                     *           "cast": {
                     *             "date_format": null,
                     *             "decimal_separator": null,
                     *             "false_values": [],
                     *             "null_values": [],
                     *             "true_values": []
                     *           },
                     *           "description": "Texte. 0,0 % de valeurs nulles, 20 valeurs distinctes au profiling. Donnée personnelle : nom.",
                     *           "explanation": "Texte conservé. Espaces superflus retirés. Donnée personnelle (nom, confiance élevée) : en clair en Silver, pseudonymisée (HMAC-SHA256) dans serving et les exports.",
                     *           "from_text": true,
                     *           "included": true,
                     *           "inferred_type": "string",
                     *           "normalization": "collapse_whitespace",
                     *           "pii_level": "high",
                     *           "pii_treatment": "hash",
                     *           "pii_type": "last_name",
                     *           "present_in_latest": true,
                     *           "rules": [],
                     *           "source_column": "nom",
                     *           "source_type": "VARCHAR",
                     *           "stats": {
                     *             "distinct_count": 20,
                     *             "invalid_count": 0,
                     *             "match_ratio": 1,
                     *             "null_count": 0,
                     *             "null_pct": 0,
                     *             "row_count": 20
                     *           },
                     *           "target_column": "nom",
                     *           "target_type": "varchar"
                     *         }
                     *       ],
                     *       "created_at": "2026-10-24T14:26:44.433926Z",
                     *       "deduplication": {
                     *         "duplicate_rows": 0,
                     *         "enabled": true,
                     *         "explanation": "Déduplication exacte : aucun doublon au profiling, une seule occurrence conservée si des doublons apparaissent."
                     *       },
                     *       "id": "e48995d9ef46458697d75a0f418b956e",
                     *       "model_name": "stg_clients",
                     *       "primary_key": {
                     *         "columns": [
                     *           "id_client"
                     *         ],
                     *         "explanation": "Clé primaire retenue : id_client. Une ligne plus récente de même clé remplace l'ancienne ; deux lignes d'un même lot avec la même clé sont mises en quarantaine.",
                     *         "quasi_unique": false
                     *       },
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "source_id": "50dfc045801244598ef1c8822d30163e",
                     *       "source_name": "clients",
                     *       "status": "draft",
                     *       "summary": "7 colonne(s) publiée(s) sur 7, 3 règle(s) de validité, 3 colonne(s) personnelle(s). Clé primaire retenue : id_client. Une ligne plus récente de même clé remplace l'ancienne ; deux lignes d'un même lot avec la même clé sont mises en quarantaine.",
                     *       "updated_at": "2026-10-24T14:27:19.568972Z",
                     *       "version": 2,
                     *       "warnings": []
                     *     }
                     */
                    "application/json": components["schemas"]["TransformationPlan"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    approve_plan_sources__source_id__plan_approve_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                source_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "based_on_source_version": 1,
                     *       "columns": [
                     *         {
                     *           "accepted_values": null,
                     *           "cast": {
                     *             "date_format": null,
                     *             "decimal_separator": null,
                     *             "false_values": [],
                     *             "null_values": [],
                     *             "true_values": []
                     *           },
                     *           "description": "Texte. 0,0 % de valeurs nulles, 20 valeurs distinctes au profiling.",
                     *           "explanation": "Texte conservé. Espaces superflus retirés.",
                     *           "from_text": true,
                     *           "included": true,
                     *           "inferred_type": "string",
                     *           "normalization": "collapse_whitespace",
                     *           "pii_level": null,
                     *           "pii_treatment": "none",
                     *           "pii_type": null,
                     *           "present_in_latest": true,
                     *           "rules": [
                     *             {
                     *               "enabled": true,
                     *               "explanation": "Clé primaire : les lignes sans valeur sont mises en quarantaine.",
                     *               "kind": "not_null"
                     *             }
                     *           ],
                     *           "source_column": "id_client",
                     *           "source_type": "VARCHAR",
                     *           "stats": {
                     *             "distinct_count": 20,
                     *             "invalid_count": 0,
                     *             "match_ratio": 1,
                     *             "null_count": 0,
                     *             "null_pct": 0,
                     *             "row_count": 20
                     *           },
                     *           "target_column": "id_client",
                     *           "target_type": "varchar"
                     *         },
                     *         {
                     *           "accepted_values": null,
                     *           "cast": {
                     *             "date_format": null,
                     *             "decimal_separator": null,
                     *             "false_values": [],
                     *             "null_values": [],
                     *             "true_values": []
                     *           },
                     *           "description": "Texte. 0,0 % de valeurs nulles, 20 valeurs distinctes au profiling. Donnée personnelle : nom.",
                     *           "explanation": "Texte conservé. Espaces superflus retirés. Donnée personnelle (nom, confiance élevée) : en clair en Silver, pseudonymisée (HMAC-SHA256) dans serving et les exports.",
                     *           "from_text": true,
                     *           "included": true,
                     *           "inferred_type": "string",
                     *           "normalization": "collapse_whitespace",
                     *           "pii_level": "high",
                     *           "pii_treatment": "hash",
                     *           "pii_type": "last_name",
                     *           "present_in_latest": true,
                     *           "rules": [],
                     *           "source_column": "nom",
                     *           "source_type": "VARCHAR",
                     *           "stats": {
                     *             "distinct_count": 20,
                     *             "invalid_count": 0,
                     *             "match_ratio": 1,
                     *             "null_count": 0,
                     *             "null_pct": 0,
                     *             "row_count": 20
                     *           },
                     *           "target_column": "nom",
                     *           "target_type": "varchar"
                     *         }
                     *       ],
                     *       "created_at": "2026-10-24T14:26:44.433926Z",
                     *       "deduplication": {
                     *         "duplicate_rows": 0,
                     *         "enabled": true,
                     *         "explanation": "Déduplication exacte : aucun doublon au profiling, une seule occurrence conservée si des doublons apparaissent."
                     *       },
                     *       "id": "e48995d9ef46458697d75a0f418b956e",
                     *       "model_name": "stg_clients",
                     *       "primary_key": {
                     *         "columns": [
                     *           "id_client"
                     *         ],
                     *         "explanation": "Clé primaire retenue : id_client. Une ligne plus récente de même clé remplace l'ancienne ; deux lignes d'un même lot avec la même clé sont mises en quarantaine.",
                     *         "quasi_unique": false
                     *       },
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "source_id": "50dfc045801244598ef1c8822d30163e",
                     *       "source_name": "clients",
                     *       "status": "approved",
                     *       "summary": "7 colonne(s) publiée(s) sur 7, 3 règle(s) de validité, 3 colonne(s) personnelle(s). Clé primaire retenue : id_client. Une ligne plus récente de même clé remplace l'ancienne ; deux lignes d'un même lot avec la même clé sont mises en quarantaine.",
                     *       "updated_at": "2026-10-24T14:27:19.615252Z",
                     *       "version": 2,
                     *       "warnings": []
                     *     }
                     */
                    "application/json": components["schemas"]["TransformationPlan"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_plans_sources__source_id__plans_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                source_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "based_on_source_version": 1,
                     *         "columns": [
                     *           {
                     *             "accepted_values": null,
                     *             "cast": {
                     *               "date_format": null,
                     *               "decimal_separator": null,
                     *               "false_values": [],
                     *               "null_values": [],
                     *               "true_values": []
                     *             },
                     *             "description": "Texte. 0,0 % de valeurs nulles, 20 valeurs distinctes au profiling.",
                     *             "explanation": "Texte conservé. Espaces superflus retirés.",
                     *             "from_text": true,
                     *             "included": true,
                     *             "inferred_type": "string",
                     *             "normalization": "collapse_whitespace",
                     *             "pii_level": null,
                     *             "pii_treatment": "none",
                     *             "pii_type": null,
                     *             "present_in_latest": true,
                     *             "rules": [
                     *               {
                     *                 "enabled": true,
                     *                 "explanation": "Clé primaire : les lignes sans valeur sont mises en quarantaine.",
                     *                 "kind": "not_null"
                     *               }
                     *             ],
                     *             "source_column": "id_client",
                     *             "source_type": "VARCHAR",
                     *             "stats": {
                     *               "distinct_count": 20,
                     *               "invalid_count": 0,
                     *               "match_ratio": 1,
                     *               "null_count": 0,
                     *               "null_pct": 0,
                     *               "row_count": 20
                     *             },
                     *             "target_column": "id_client",
                     *             "target_type": "varchar"
                     *           },
                     *           {
                     *             "accepted_values": null,
                     *             "cast": {
                     *               "date_format": null,
                     *               "decimal_separator": null,
                     *               "false_values": [],
                     *               "null_values": [],
                     *               "true_values": []
                     *             },
                     *             "description": "Texte. 0,0 % de valeurs nulles, 20 valeurs distinctes au profiling. Donnée personnelle : nom.",
                     *             "explanation": "Texte conservé. Espaces superflus retirés. Donnée personnelle (nom, confiance élevée) : en clair en Silver, pseudonymisée (HMAC-SHA256) dans serving et les exports.",
                     *             "from_text": true,
                     *             "included": true,
                     *             "inferred_type": "string",
                     *             "normalization": "collapse_whitespace",
                     *             "pii_level": "high",
                     *             "pii_treatment": "hash",
                     *             "pii_type": "last_name",
                     *             "present_in_latest": true,
                     *             "rules": [],
                     *             "source_column": "nom",
                     *             "source_type": "VARCHAR",
                     *             "stats": {
                     *               "distinct_count": 20,
                     *               "invalid_count": 0,
                     *               "match_ratio": 1,
                     *               "null_count": 0,
                     *               "null_pct": 0,
                     *               "row_count": 20
                     *             },
                     *             "target_column": "nom",
                     *             "target_type": "varchar"
                     *           }
                     *         ],
                     *         "created_at": "2026-10-24T14:26:44.433926Z",
                     *         "deduplication": {
                     *           "duplicate_rows": 0,
                     *           "enabled": true,
                     *           "explanation": "Déduplication exacte : aucun doublon au profiling, une seule occurrence conservée si des doublons apparaissent."
                     *         },
                     *         "id": "d1b84ae8e394488fa67cec2397cb2c16",
                     *         "model_name": "stg_clients",
                     *         "primary_key": {
                     *           "columns": [
                     *             "id_client"
                     *           ],
                     *           "explanation": "Clé primaire retenue : id_client. Une ligne plus récente de même clé remplace l'ancienne ; deux lignes d'un même lot avec la même clé sont mises en quarantaine.",
                     *           "quasi_unique": false
                     *         },
                     *         "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *         "source_id": "50dfc045801244598ef1c8822d30163e",
                     *         "source_name": "clients",
                     *         "status": "applied",
                     *         "summary": "7 colonne(s) publiée(s) sur 7, 3 règle(s) de validité, 3 colonne(s) personnelle(s). Clé primaire retenue : id_client. Une ligne plus récente de même clé remplace l'ancienne ; deux lignes d'un même lot avec la même clé sont mises en quarantaine.",
                     *         "updated_at": "2026-10-24T14:26:53.380969Z",
                     *         "version": 1,
                     *         "warnings": []
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["TransformationPlan"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    preview_source_sources__source_id__preview_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path: {
                source_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "columns": [
                     *         "id_client",
                     *         "nom"
                     *       ],
                     *       "limit": 2,
                     *       "rows": [
                     *         {
                     *           "_batch_id": "7d3755f1afce4447a587e439a0ad728f",
                     *           "_ingested_at": "2026-10-24T16:27:18.563995+02:00",
                     *           "_row_hash": "a7ffac631f30c7b07070990bd3ab2dd2610861364842ab8fefafc521c225e613",
                     *           "_source_file": "clients.csv",
                     *           "date_inscription": "09/04/2022",
                     *           "email": "***",
                     *           "id_client": "CLI-0001",
                     *           "nom": "***",
                     *           "prénom": "***",
                     *           "segment": "particulier",
                     *           "ville": "Nantes"
                     *         },
                     *         {
                     *           "_batch_id": "7d3755f1afce4447a587e439a0ad728f",
                     *           "_ingested_at": "2026-10-24T16:27:18.563995+02:00",
                     *           "_row_hash": "cb9825b31beb8c8e49458226e5a361b717050d583225a2643add891bf05b497d",
                     *           "_source_file": "clients.csv",
                     *           "date_inscription": "22/04/2022",
                     *           "email": "***",
                     *           "id_client": "CLI-0002",
                     *           "nom": "***",
                     *           "prénom": "***",
                     *           "segment": "particulier",
                     *           "ville": "Lille"
                     *         }
                     *       ],
                     *       "source_id": "50dfc045801244598ef1c8822d30163e",
                     *       "total_rows": 21
                     *     }
                     */
                    "application/json": components["schemas"]["PreviewResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_profile_sources__source_id__profile_get: {
        parameters: {
            query?: {
                /** @description Defaults to the latest */
                version?: number | null;
            };
            header?: never;
            path: {
                source_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "candidate_keys": [
                     *         {
                     *           "columns": [
                     *             "id_client"
                     *           ],
                     *           "kind": "simple"
                     *         },
                     *         {
                     *           "columns": [
                     *             "nom"
                     *           ],
                     *           "kind": "simple"
                     *         }
                     *       ],
                     *       "column_count": 7,
                     *       "columns": [
                     *         {
                     *           "distinct_count": 21,
                     *           "inferred": {
                     *             "decimal_separator": null,
                     *             "format": null,
                     *             "from_text": true,
                     *             "inferred_type": "string",
                     *             "match_ratio": 1,
                     *             "max_decimals": null,
                     *             "near_type": null,
                     *             "near_type_ratio": null,
                     *             "physical_type": "VARCHAR"
                     *           },
                     *           "is_constant": false,
                     *           "is_unique": true,
                     *           "max": null,
                     *           "max_length": 8,
                     *           "mean": null,
                     *           "min": null,
                     *           "min_length": 8,
                     *           "name": "id_client",
                     *           "null_count": 0,
                     *           "null_pct": 0,
                     *           "physical_type": "VARCHAR",
                     *           "pii": null,
                     *           "stddev": null,
                     *           "top_values": [
                     *             {
                     *               "count": 1,
                     *               "pct": 4.76,
                     *               "value": "CLI-0001"
                     *             },
                     *             {
                     *               "count": 1,
                     *               "pct": 4.76,
                     *               "value": "CLI-0002"
                     *             }
                     *           ],
                     *           "uniqueness": 1
                     *         },
                     *         {
                     *           "distinct_count": 21,
                     *           "inferred": {
                     *             "decimal_separator": null,
                     *             "format": null,
                     *             "from_text": true,
                     *             "inferred_type": "string",
                     *             "match_ratio": 1,
                     *             "max_decimals": null,
                     *             "near_type": null,
                     *             "near_type_ratio": null,
                     *             "physical_type": "VARCHAR"
                     *           },
                     *           "is_constant": false,
                     *           "is_unique": true,
                     *           "max": null,
                     *           "max_length": 8,
                     *           "mean": null,
                     *           "min": null,
                     *           "min_length": 4,
                     *           "name": "nom",
                     *           "null_count": 0,
                     *           "null_pct": 0,
                     *           "physical_type": "VARCHAR",
                     *           "pii": {
                     *             "column": "nom",
                     *             "confidence": 0.85,
                     *             "level": "high",
                     *             "match_ratio": 1,
                     *             "method": "column name + value shape",
                     *             "name_hint": true,
                     *             "pii_type": "last_name"
                     *           },
                     *           "stddev": null,
                     *           "top_values": [
                     *             {
                     *               "count": 1,
                     *               "pct": 4.76,
                     *               "value": "André"
                     *             },
                     *             {
                     *               "count": 1,
                     *               "pct": 4.76,
                     *               "value": "Bernard"
                     *             }
                     *           ],
                     *           "uniqueness": 1
                     *         }
                     *       ],
                     *       "duplicates": {
                     *         "duplicate_groups": 0,
                     *         "duplicate_pct": 0,
                     *         "duplicate_rows": 0
                     *       },
                     *       "pii": [
                     *         {
                     *           "column": "nom",
                     *           "confidence": 0.85,
                     *           "level": "high",
                     *           "match_ratio": 1,
                     *           "method": "column name + value shape",
                     *           "name_hint": true,
                     *           "pii_type": "last_name"
                     *         },
                     *         {
                     *           "column": "prénom",
                     *           "confidence": 0.95,
                     *           "level": "high",
                     *           "match_ratio": 1,
                     *           "method": "column name + value shape",
                     *           "name_hint": true,
                     *           "pii_type": "first_name"
                     *         }
                     *       ],
                     *       "profiled_at": "2026-10-24T14:27:18.923731Z",
                     *       "profiler_version": "2",
                     *       "quality": {
                     *         "components": [
                     *           {
                     *             "details": "mean null rate 0.0% over 7 column(s)",
                     *             "name": "completeness",
                     *             "points": 35,
                     *             "score": 1,
                     *             "weight": 35
                     *           },
                     *           {
                     *             "details": "0.0% exact duplicate rows",
                     *             "name": "uniqueness",
                     *             "points": 25,
                     *             "score": 1,
                     *             "weight": 25
                     *           }
                     *         ],
                     *         "formula": "score = 35 x completeness + 25 x uniqueness + 25 x validity + 15 x identifiability; completeness = 1 - mean null rate; uniqueness = 1 - duplicate row rate; validity = mean share of values matching each column's type; identifiability = 1 (simple key), 0.7 (composite key) or 0 (none)",
                     *         "issues": [
                     *           "column 'nom' contains personal data (last_name, high confidence)",
                     *           "column 'prénom' contains personal data (first_name, high confidence)"
                     *         ],
                     *         "score": 100
                     *       },
                     *       "row_count": 21,
                     *       "source_id": "50dfc045801244598ef1c8822d30163e",
                     *       "source_name": "clients",
                     *       "version": 2,
                     *       "version_id": "7d3755f1afce4447a587e439a0ad728f"
                     *     }
                     */
                    "application/json": components["schemas"]["ProfileReport"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_versions_sources__source_id__versions_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                source_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example [
                     *       {
                     *         "bronze_path": "8eb2896d10ce42e29be319159b2b2375/bronze/clients/20261024T142644131531Z_v0001_clients.parquet",
                     *         "columns": [
                     *           {
                     *             "name": "id_client",
                     *             "technical": false,
                     *             "type": "VARCHAR"
                     *           },
                     *           {
                     *             "name": "nom",
                     *             "technical": false,
                     *             "type": "VARCHAR"
                     *           }
                     *         ],
                     *         "delimiter": ";",
                     *         "encoding": "cp1252",
                     *         "format": "csv",
                     *         "id": "7605aa62aaa94f688167af5032bf7da9",
                     *         "ingested_at": "2026-10-24T14:26:44.131531Z",
                     *         "new_row_count": 20,
                     *         "original_filename": "clients.csv",
                     *         "row_count": 20,
                     *         "schema_drift": null,
                     *         "sheet_name": null,
                     *         "source_id": "50dfc045801244598ef1c8822d30163e",
                     *         "version": 1,
                     *         "warnings": []
                     *       },
                     *       {
                     *         "bronze_path": "8eb2896d10ce42e29be319159b2b2375/bronze/clients/20261024T142718563995Z_v0002_clients.parquet",
                     *         "columns": [
                     *           {
                     *             "name": "id_client",
                     *             "technical": false,
                     *             "type": "VARCHAR"
                     *           },
                     *           {
                     *             "name": "nom",
                     *             "technical": false,
                     *             "type": "VARCHAR"
                     *           }
                     *         ],
                     *         "delimiter": ";",
                     *         "encoding": "cp1252",
                     *         "format": "csv",
                     *         "id": "7d3755f1afce4447a587e439a0ad728f",
                     *         "ingested_at": "2026-10-24T14:27:18.563995Z",
                     *         "new_row_count": 2,
                     *         "original_filename": "clients.csv",
                     *         "row_count": 21,
                     *         "schema_drift": {
                     *           "added": [],
                     *           "has_drift": false,
                     *           "previous_version": 1,
                     *           "removed": [],
                     *           "type_changed": []
                     *         },
                     *         "sheet_name": null,
                     *         "source_id": "50dfc045801244598ef1c8822d30163e",
                     *         "version": 2,
                     *         "warnings": []
                     *       }
                     *     ]
                     */
                    "application/json": components["schemas"]["SourceVersion"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upload_version_sources__source_id__versions_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                source_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_upload_version_sources__source_id__versions_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "bronze_path": "8eb2896d10ce42e29be319159b2b2375/bronze/clients/20261024T142718563995Z_v0002_clients.parquet",
                     *       "column_count": 7,
                     *       "columns": [
                     *         {
                     *           "name": "id_client",
                     *           "technical": false,
                     *           "type": "VARCHAR"
                     *         },
                     *         {
                     *           "name": "nom",
                     *           "technical": false,
                     *           "type": "VARCHAR"
                     *         }
                     *       ],
                     *       "delimiter": ";",
                     *       "encoding": "cp1252",
                     *       "format": "csv",
                     *       "id": "50dfc045801244598ef1c8822d30163e",
                     *       "ingested_at": "2026-10-24T14:27:18.563995Z",
                     *       "latest_version_id": "7d3755f1afce4447a587e439a0ad728f",
                     *       "name": "clients",
                     *       "original_filename": "clients.csv",
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "quality_score": 100,
                     *       "row_count": 21,
                     *       "schema_drift": {
                     *         "added": [],
                     *         "has_drift": false,
                     *         "previous_version": 1,
                     *         "removed": [],
                     *         "type_changed": []
                     *       },
                     *       "sheet_name": null,
                     *       "version": 2,
                     *       "warnings": []
                     *     }
                     */
                    "application/json": components["schemas"]["Source"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    accept_synonym_synonym_proposals__proposal_id__accept_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                proposal_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "created_at": "2026-10-24T14:27:21.975682Z",
                     *       "id": "8c671c0454b846c1bc2758243c69e5af",
                     *       "mart_request_id": null,
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "proposed_by": "d7605ffdaaed4ce6992f576ea252fa3d",
                     *       "reviewed_at": "2026-10-24T14:27:22.038843Z",
                     *       "reviewed_by": "a2d87f35f7994e0ca9073a744c735e2c",
                     *       "status": "accepted",
                     *       "synonym": "encaissements",
                     *       "target": "metric:montant"
                     *     }
                     */
                    "application/json": components["schemas"]["SynonymProposal"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reject_synonym_synonym_proposals__proposal_id__reject_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                proposal_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "created_at": "2026-10-24T14:27:22.138704Z",
                     *       "id": "afd27b62b67240ee9aca07e55988564a",
                     *       "mart_request_id": null,
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "proposed_by": "d7605ffdaaed4ce6992f576ea252fa3d",
                     *       "reviewed_at": "2026-10-24T14:27:22.165629Z",
                     *       "reviewed_by": "a2d87f35f7994e0ca9073a744c735e2c",
                     *       "status": "rejected",
                     *       "synonym": "cité",
                     *       "target": "attribute:client.ville"
                     *     }
                     */
                    "application/json": components["schemas"]["SynonymProposal"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_table_tables__table_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                table_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "built_at": "2026-10-24T14:27:00.984933Z",
                     *       "columns": [
                     *         {
                     *           "name": "id_commande",
                     *           "technical": false,
                     *           "type": "VARCHAR"
                     *         },
                     *         {
                     *           "name": "num_ligne",
                     *           "technical": false,
                     *           "type": "BIGINT"
                     *         }
                     *       ],
                     *       "id": "cd8e3b69f29e405abc1e213f10c453bc",
                     *       "last_run_id": "fc29e5dc3bf946699f1ec754bd6b2124",
                     *       "layer": "gold",
                     *       "name": "fct_ventes",
                     *       "owner_id": null,
                     *       "plan_version": 1,
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "publish": true,
                     *       "rejected_count": 0,
                     *       "row_count": 79,
                     *       "source_id": null
                     *     }
                     */
                    "application/json": components["schemas"]["WarehouseTable"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_table_tables__table_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                table_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TableUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "built_at": "2026-10-24T14:27:00.984933Z",
                     *       "columns": [
                     *         {
                     *           "name": "id_commande",
                     *           "technical": false,
                     *           "type": "VARCHAR"
                     *         },
                     *         {
                     *           "name": "num_ligne",
                     *           "technical": false,
                     *           "type": "BIGINT"
                     *         }
                     *       ],
                     *       "id": "cd8e3b69f29e405abc1e213f10c453bc",
                     *       "last_run_id": "fc29e5dc3bf946699f1ec754bd6b2124",
                     *       "layer": "gold",
                     *       "name": "fct_ventes",
                     *       "owner_id": null,
                     *       "plan_version": 1,
                     *       "project_id": "8eb2896d10ce42e29be319159b2b2375",
                     *       "publish": true,
                     *       "rejected_count": 0,
                     *       "row_count": 79,
                     *       "source_id": null
                     *     }
                     */
                    "application/json": components["schemas"]["WarehouseTable"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_table_tables__table_id__export_get: {
        parameters: {
            query?: {
                delimiter?: string | null;
                format?: components["schemas"]["ExportFormat"];
            };
            header?: never;
            path: {
                table_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    preview_table_tables__table_id__preview_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path: {
                table_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "columns": [
                     *         "id_commande",
                     *         "num_ligne"
                     *       ],
                     *       "limit": 2,
                     *       "rows": [
                     *         {
                     *           "client_key": "8d359fe0f0dbf99789fa232ad7332001",
                     *           "date_commande_key": 20240821,
                     *           "id_commande": "CMD-00005",
                     *           "montant": 25.5,
                     *           "nb_lignes": 1,
                     *           "num_ligne": 1,
                     *           "prix_unitaire": 8.5,
                     *           "produit_key": "92e3e99ea069c22205ff72f6b9901fea",
                     *           "quantite": 3,
                     *           "statut": "livrée"
                     *         },
                     *         {
                     *           "client_key": "7b7e8154108481ff0e8eebc51f36ad3b",
                     *           "date_commande_key": 20240708,
                     *           "id_commande": "CMD-00011",
                     *           "montant": 93.6,
                     *           "nb_lignes": 1,
                     *           "num_ligne": 1,
                     *           "prix_unitaire": 31.2,
                     *           "produit_key": "46a12ae584b85b106bb9feb60f9d79cb",
                     *           "quantite": 3,
                     *           "statut": "livrée"
                     *         }
                     *       ],
                     *       "table_id": "cd8e3b69f29e405abc1e213f10c453bc",
                     *       "total_rows": 79
                     *     }
                     */
                    "application/json": components["schemas"]["TablePreview"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
}
