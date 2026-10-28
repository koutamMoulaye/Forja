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
    "/auth/invitations/lookup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Lire une invitation
         * @description Où mène un lien d'inscription : valide (e-mail, rôle, projet), expirée, révoquée, déjà utilisée ou inconnue. Le jeton passe dans le corps, jamais dans une URL. Public (sans authentification).
         */
        post: operations["lookup_invitation_auth_invitations_lookup_post"];
        delete?: never;
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
    "/mart-requests/{mart_id}/correct": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Corriger un terme de l'aperçu
         * @description Un terme souligné du résumé (mesure, découpage, axe, période, filtre, limite) prend l'une de ses options : nouvelle version (run) prévisualisée telle quelle, sans LLM. Auteur de la demande.
         */
        post: operations["correct_mart_request_mart_requests__mart_id__correct_post"];
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
         * @description Avec la destination choisie (Power BI, Superset, CSV, Parquet). Publie le data mart (run), ou attend l'approbation d'un engineer si FORJA_MART_REQUIRE_APPROVAL=true ; un engineer qui valide sa propre demande l'approuve du même coup. Refusé si un contrôle est en erreur. Auteur.
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
    "/projects/{project_id}/agent/overview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Accueil de l'agent
         * @description Date du dernier build Gold réussi et questions suggérées, écrites depuis la couche sémantique et comprises par le parseur seul (aperçu immédiat). Rôles : admin, engineer, analyst.
         */
        get: operations["agent_overview_projects__project_id__agent_overview_get"];
        put?: never;
        post?: never;
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
    "/projects/{project_id}/gold-plan/issues": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Validation du plan Gold
         * @description Contrôles du dernier plan recalculés avec les relations et les tables actuelles : une relation confirmée depuis la proposition lève son erreur. Le plan n'est pas modifié. Rôles : admin, engineer.
         */
        get: operations["get_gold_plan_issues_projects__project_id__gold_plan_issues_get"];
        put?: never;
        post?: never;
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
    "/projects/{project_id}/graph": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Graphe du pipeline
         * @description Tout ce que dessine le canvas en un appel : nœuds (sources, tables nettoyées, dimensions, faits, data marts, destinations) avec leur état normalisé, compteurs, score qualité, données personnelles et run en cours ; liens de lignée, de relation (avec la confiance) et de publication ; compteurs par compartiment. Réponse avec ETag : renvoyer If-None-Match pour recevoir 304 si rien n'a changé. Un analyst ne voit que le modèle en étoile, les data marts publiés qu'il peut lire et les destinations. Rôles : admin, engineer, analyst.
         */
        get: operations["get_graph_projects__project_id__graph_get"];
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
    "/projects/{project_id}/invitations/{invitation_id}": {
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
         * Révoquer une invitation
         * @description Une invitation pas encore acceptée : son lien d'inscription cesse de marcher. Rôle : admin du projet.
         */
        delete: operations["revoke_invitation_projects__project_id__invitations__invitation_id__delete"];
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
    "/settings/llm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Fournisseur IA
         * @description Fournisseur, modèle et adresse en service, et si une clé API est enregistrée ; une clé n'est jamais renvoyée. editable indique si l'appelant peut le changer. Tout utilisateur authentifié.
         */
        get: operations["get_llm_settings_llm_get"];
        /**
         * Choisir le fournisseur IA
         * @description Ollama, Anthropic, OpenAI ou aucun (heuristiques seules), le modèle et la clé API. Enregistré dans FORJA_SECRETS_DIR, hors du dépôt, et appliqué sans redémarrage ; prime sur les variables FORJA_LLM_*. Réservé à l'administrateur de l'instance.
         */
        put: operations["put_llm_settings_llm_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/llm/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Tester la connexion IA
         * @description Joint le fournisseur et vérifie que le modèle existe, sans envoyer de donnée. Le résultat est conservé (last_check). Réservé à l'administrateur de l'instance.
         */
        post: operations["test_llm_settings_llm_test_post"];
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
    "/sources/{source_id}/plan/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Revue du plan Silver
         * @description Le plan sous forme de règles (conversion, écriture, pseudonymisation, doublons, clé), chacune avec son explication, sa confiance et la décision prise. Paramètre version pour une version antérieure. Rôles : admin, engineer.
         */
        get: operations["get_plan_review_sources__source_id__plan_review_get"];
        put?: never;
        /**
         * Décider des règles du plan
         * @description Valider ou rejeter des règles du dernier brouillon, sans créer de version ; null remet une règle en revue. Une donnée personnelle se modifie, elle ne se rejette pas. Les règles rejetées sont retirées à l'approbation, dans une nouvelle version. Rôles : admin, engineer.
         */
        post: operations["review_plan_sources__source_id__plan_review_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/sources/{source_id}/plan/samples": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Aperçu avant et après
         * @description Valeurs d'un échantillon de la dernière version, avant et après les expressions du plan (celles des modèles dbt). Données personnelles masquées pour un engineer, pseudonymisées sinon ; en clair seulement avec FORJA_ALLOW_BRONZE_PREVIEW. Rôles : admin, engineer.
         */
        get: operations["get_plan_samples_sources__source_id__plan_samples_get"];
        put?: never;
        post?: never;
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
    "/sources/{source_id}/rejects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lignes en quarantaine
         * @description Lignes rejetées par le nettoyage, comptées par motif, et les dernières d'entre elles (paramètre run_id pour un run). Données personnelles traitées comme dans les exports. Rôles : admin, engineer.
         */
        get: operations["get_rejects_sources__source_id__rejects_get"];
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
         * AgentOverview
         * @description What the analyst's home page shows before any question.
         */
        AgentOverview: {
            /**
             * Data Updated At
             * @description When the Gold model was last built successfully
             */
            data_updated_at?: string | null;
            /** Gold Run Id */
            gold_run_id?: string | null;
            /** Semantic Version */
            semantic_version?: number | null;
            /**
             * Suggestions
             * @description Questions the parser understands on its own
             */
            suggestions?: string[];
        };
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
        /** ColumnSamples */
        ColumnSamples: {
            /** Column */
            column: string;
            /**
             * Personal
             * @default false
             */
            personal: boolean;
            /** Target Column */
            target_column: string;
            /** @default none */
            treatment: components["schemas"]["PiiTreatment"];
            /** Values */
            values: components["schemas"]["SampleValue"][];
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
        /** GraphEdge */
        GraphEdge: {
            /**
             * Confidence
             * @description Relations : confiance de la détection (0,94)
             */
            confidence: number | null;
            /** Id */
            id: string;
            /** Source */
            source: string;
            /**
             * State
             * @enum {string}
             */
            state: "applied" | "proposed" | "error" | "running";
            /** Target */
            target: string;
            /**
             * Type
             * @description lineage (la cible est construite depuis la source), relation (clé étrangère d'un fait vers une dimension), publication (vers une destination)
             * @enum {string}
             */
            type: "lineage" | "relation" | "publication";
        };
        /** GraphNode */
        GraphNode: {
            counts: components["schemas"]["NodeCounts"];
            /**
             * Highlights
             * @description Colonnes clés, mesures ou règles montrées au zoom rapproché
             */
            highlights: string[];
            /**
             * Id
             * @description Identifiant stable, lisible dans l'URL : src_clients, stg_clients, dim_clients, fct_ventes, dim_date, mart_<id>, dest_serving, dest_exports
             */
            id: string;
            /**
             * Label
             * @description Libellé complet en français : « Nettoyage de clients »
             */
            label: string;
            /**
             * Lane
             * @description Compartiment du canvas
             * @enum {string}
             */
            lane: "sources" | "cleaning" | "star_schema" | "serving";
            /**
             * Message
             * @description Raison d'une erreur ou d'une revue
             */
            message: string | null;
            /**
             * Name
             * @description Nom affiché sur le nœud : clients.csv, clients, dim_clients
             */
            name: string;
            /**
             * Pii Columns
             * @description Ces colonnes, pseudonymisées dans la base de diffusion et les exports
             */
            pii_columns: string[];
            /**
             * Pii Count
             * @description Colonnes de données personnelles
             * @default 0
             */
            pii_count: number;
            /**
             * Quality Score
             * @description Sources : score 0-100
             */
            quality_score: number | null;
            /**
             * Ref
             * @description Objet de l'API derrière le nœud : id de source (source, silver), de table (Gold publiée) ou de demande de data mart
             */
            ref: string | null;
            /**
             * Review Count
             * @description Éléments à revoir
             * @default 0
             */
            review_count: number;
            run: components["schemas"]["NodeRun"] | null;
            /**
             * State
             * @enum {string}
             */
            state: "applied" | "review" | "error" | "running" | "pending" | "proposed" | "rejected";
            /**
             * Type
             * @enum {string}
             */
            type: "source" | "silver" | "dimension" | "fact" | "date_dimension" | "mart" | "destination";
        };
        /** HealthResponse */
        HealthResponse: {
            /**
             * Auth Mode
             * @description local (single administrator) or multi (invitations); lets the sign-in screen adapt before anyone is authenticated
             */
            auth_mode: string;
            /**
             * Max Upload Mb
             * @description Largest file accepted by an upload, in MB
             */
            max_upload_mb: number;
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
            /** Revoked At */
            revoked_at?: string | null;
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
        /** InvitationLookup */
        InvitationLookup: {
            /** Token */
            token: string;
        };
        /**
         * InvitationStatus
         * @description What a registration link leads to, before the account is created.
         */
        InvitationStatus: {
            /** Email */
            email?: string | null;
            /** Expires At */
            expires_at?: string | null;
            /** Project Name */
            project_name?: string | null;
            role?: components["schemas"]["Role"] | null;
            /**
             * Status
             * @enum {string}
             */
            status: "valid" | "expired" | "revoked" | "used" | "unknown";
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
        /** LaneSummary */
        LaneSummary: {
            /**
             * Lane
             * @enum {string}
             */
            lane: "sources" | "cleaning" | "star_schema" | "serving";
            /**
             * States
             * @description Nœuds par état, sans les états à zéro
             */
            states: {
                [key: string]: number;
            };
            /** Total */
            total: number;
        };
        /**
         * LLMCheck
         * @description Outcome of the last connection test.
         */
        LLMCheck: {
            /**
             * Checked At
             * Format: date-time
             */
            checked_at: string;
            /** Duration Ms */
            duration_ms: number;
            /** Message */
            message: string;
            /** Model */
            model: string | null;
            /** Ok */
            ok: boolean;
            /** Provider */
            provider: string;
        };
        /** LLMConfigUpdate */
        LLMConfigUpdate: {
            /**
             * Api Key
             * @description Anthropic or OpenAI key; stored outside the repository
             */
            api_key?: string | null;
            /**
             * Model
             * @description Empty: the provider's default model
             */
            model?: string | null;
            /** Ollama Base Url */
            ollama_base_url?: string | null;
            /**
             * Provider
             * @enum {string}
             */
            provider: "ollama" | "anthropic" | "openai" | "none";
        };
        /**
         * LLMConfigView
         * @description The provider in use. API keys are never returned, only whether one is set.
         */
        LLMConfigView: {
            /** Default Model */
            default_model: string | null;
            /**
             * Editable
             * @description The caller may change it (instance administrator)
             */
            editable: boolean;
            keys: components["schemas"]["LLMKeys"];
            last_check?: components["schemas"]["LLMCheck"] | null;
            /**
             * Model
             * @description Model in use; the provider's default if not chosen
             */
            model: string | null;
            /** Ollama Base Url */
            ollama_base_url: string;
            /**
             * Provider
             * @enum {string}
             */
            provider: "ollama" | "anthropic" | "openai" | "none";
            /**
             * Source
             * @description environment, or saved (chosen from the interface)
             */
            source: string;
        };
        /** LLMKeys */
        LLMKeys: {
            /** Anthropic */
            anthropic: boolean;
            /** Openai */
            openai: boolean;
        };
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
            kind: "question" | "refinement" | "answer" | "correction";
            llm?: components["schemas"]["LLMTrace"] | null;
            /**
             * Option Counts
             * @description What each option of the question covers
             */
            option_counts?: (components["schemas"]["OptionCount"] | null)[];
            path?: components["schemas"]["AgentPath"] | null;
            preview?: components["schemas"]["MartPreview"] | null;
            /** @description Correction of a term: the spec to preview as is */
            proposed?: components["schemas"]["MartSpec"] | null;
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
            /**
             * Summary Parts
             * @description The summary, with the terms the user can correct
             */
            summary_parts?: components["schemas"]["SummaryPart"][];
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
            /** Approved By Email */
            approved_by_email?: string | null;
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
            /**
             * Destination
             * @description Where the analyst wants the mart: a BI tool or a file
             */
            destination?: ("powerbi" | "superset" | "csv" | "parquet") | null;
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
        /** MartValidation */
        MartValidation: {
            /** Destination */
            destination?: ("powerbi" | "superset" | "csv" | "parquet") | null;
        };
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
        /** NodeCounts */
        NodeCounts: {
            /**
             * Columns
             * @description Colonnes visibles (hors techniques)
             */
            columns: number | null;
            /**
             * Rows
             * @description Lignes de la table ou du fichier
             */
            rows: number | null;
            /**
             * Rules
             * @description Règles du plan de nettoyage
             */
            rules: number | null;
            /**
             * Tables
             * @description Destinations : tables publiées
             */
            tables: number | null;
        };
        /**
         * NodeRun
         * @description The run touching the node: in progress, or the last one that ended.
         */
        NodeRun: {
            /** Finished At */
            finished_at: string | null;
            /**
             * Percent
             * @description Progression du run
             */
            percent: number | null;
            /** Run Id */
            run_id: string;
            /** @description queued, running, or the outcome for this node (succeeded, failed) */
            status: components["schemas"]["JobStatus"];
            type: components["schemas"]["JobType"];
        };
        /**
         * Normalization
         * @enum {string}
         */
        Normalization: "none" | "trim" | "collapse_whitespace" | "lowercase" | "compact_uppercase";
        /**
         * OptionCount
         * @description How much an option of a question covers: « 1 284 clients », « 48 210 € ».
         */
        OptionCount: {
            /**
             * Format
             * @default count
             * @enum {string}
             */
            format: "count" | "currency" | "integer" | "decimal" | "percent";
            /**
             * Unit
             * @description What is counted: clients, villes...
             * @default
             */
            unit: string;
            /** Value */
            value: number;
        };
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
        /** PlanReview */
        PlanReview: {
            /** Pending */
            pending: number;
            /** Plan Version */
            plan_version: number;
            /** Rejected */
            rejected: number;
            /** Rules */
            rules: components["schemas"]["ReviewRule"][];
            /** Source Id */
            source_id: string;
            /** Status */
            status: string;
            /** Validated */
            validated: number;
        };
        /** PlanSamples */
        PlanSamples: {
            /** Columns */
            columns: components["schemas"]["ColumnSamples"][];
            /** Plan Version */
            plan_version: number;
            /** Sample Rows */
            sample_rows: number;
            /** Source Id */
            source_id: string;
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
        /** ProjectGraph */
        ProjectGraph: {
            /** Edges */
            edges: components["schemas"]["GraphEdge"][];
            /** Lanes */
            lanes: components["schemas"]["LaneSummary"][];
            /** Nodes */
            nodes: components["schemas"]["GraphNode"][];
            /** Project Id */
            project_id: string;
            /**
             * Version
             * @description Empreinte du contenu, renvoyée aussi en ETag : un appel avec If-None-Match identique reçoit 304 sans corps
             */
            version: string;
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
        /** Quarantine */
        Quarantine: {
            /** Columns */
            columns: string[];
            /** Limit */
            limit: number;
            /**
             * Reasons
             * @description A row failing two rules counts twice
             */
            reasons: components["schemas"]["RejectReason"][];
            /** Rows */
            rows: {
                [key: string]: unknown;
            }[];
            /**
             * Runs
             * @description Runs that quarantined rows, latest first
             */
            runs: components["schemas"]["QuarantineRun"][];
            /** Source Id */
            source_id: string;
            /** Table */
            table: string;
            /**
             * Total Rows
             * @description Rows in quarantine (for the run asked, if any)
             */
            total_rows: number;
        };
        /** QuarantineRun */
        QuarantineRun: {
            /** Rows */
            rows: number;
            /** Run Id */
            run_id: string;
        };
        /** RefreshRequest */
        RefreshRequest: {
            /** Refresh Token */
            refresh_token: string;
        };
        /** Registration */
        Registration: {
            /** Name */
            name?: string | null;
            /** Password */
            password: string;
            /** Token */
            token: string;
        };
        /** RejectReason */
        RejectReason: {
            /** Reason */
            reason: string;
            /** Rows */
            rows: number;
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
        /** ReviewRule */
        ReviewRule: {
            /**
             * Affected
             * @description Values or rows concerned at profiling, when known
             */
            affected?: number | null;
            /**
             * Columns
             * @description Source columns the rule acts on
             */
            columns: string[];
            confidence: components["schemas"]["ConfidenceLevel"];
            /** Decision */
            decision?: ("validated" | "rejected") | null;
            /** Explanation */
            explanation: string;
            /**
             * Id
             * @description Stable id, e.g. cast:date_inscription or normalize:trim
             */
            id: string;
            kind: components["schemas"]["ReviewRuleKind"];
            /**
             * Rejectable
             * @description False when the rule may only be edited (personal data)
             * @default true
             */
            rejectable: boolean;
            /** Title */
            title: string;
        };
        /**
         * ReviewRuleKind
         * @enum {string}
         */
        ReviewRuleKind: "cast" | "normalize" | "pii" | "format" | "exclude" | "deduplicate" | "primary_key";
        /** ReviewUpdate */
        ReviewUpdate: {
            /**
             * Decisions
             * @description Decision by rule id; null puts the rule back to review
             */
            decisions: {
                [key: string]: ("validated" | "rejected") | null;
            };
        };
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
        /** SampleValue */
        SampleValue: {
            /** After */
            after: string | null;
            /** Before */
            before: string | null;
            /**
             * Count
             * @description Rows of the sample with this value
             */
            count: number;
            /**
             * Invalid
             * @description The value does not convert: quarantine, or empty
             */
            invalid: boolean;
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
        /** SummaryPart */
        SummaryPart: {
            term?: components["schemas"]["SummaryTerm"] | null;
            /** Text */
            text: string;
        };
        /**
         * SummaryTerm
         * @description An element of the spec underlined in the summary, with what it can become.
         */
        SummaryTerm: {
            /**
             * Current
             * @description The option in use, if listed
             */
            current?: number | null;
            /**
             * Index
             * @description Position in the spec list (metrics, axes...)
             * @default 0
             */
            index: number;
            /**
             * Kind
             * @enum {string}
             */
            kind: "metric" | "grain" | "axis" | "period" | "filter" | "limit";
            /**
             * Options
             * @description Choices the user reads
             */
            options?: string[];
            /**
             * Question
             * @default
             */
            question: string;
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
        /** TermCorrection */
        TermCorrection: {
            /**
             * Option
             * @description Index of the chosen option of that term
             */
            option: number;
            /**
             * Term
             * @description Index of the term among the summary parts
             */
            term: number;
            /**
             * Version
             * @description Version whose summary was read
             */
            version: number;
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
            /**
             * Reviews
             * @description Review decisions by rule id (see GET /sources/{id}/plan/review)
             */
            reviews?: {
                [key: string]: "validated" | "rejected";
            };
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
            /**
             * Name
             * @description Name shown in the interface
             */
            name?: string | null;
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
                     *         "action": "settings.llm_test",
                     *         "at": "2026-10-28T21:18:06.579160Z",
                     *         "details": {
                     *           "ok": true,
                     *           "provider": "none"
                     *         },
                     *         "id": "cf3b28e90264483eb36e2557bcc21d9d",
                     *         "object_id": "llm",
                     *         "object_type": "settings",
                     *         "project_id": null,
                     *         "user_email": "admin@forja.local",
                     *         "user_id": "496b5b5b4ef94be98853f5f764183864"
                     *       },
                     *       {
                     *         "action": "settings.llm",
                     *         "at": "2026-10-28T21:18:06.561447Z",
                     *         "details": {
                     *           "api_key_changed": false,
                     *           "model": null,
                     *           "provider": "none"
                     *         },
                     *         "id": "23b697b575a6416b93df0e4e60f629e2",
                     *         "object_id": "llm",
                     *         "object_type": "settings",
                     *         "project_id": null,
                     *         "user_email": "admin@forja.local",
                     *         "user_id": "496b5b5b4ef94be98853f5f764183864"
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
                     *         "created_at": "2026-10-28T21:17:53.538159Z",
                     *         "id": "7d73e0b74d8c449c9b24b82fd2fb3d82",
                     *         "last_used_at": null,
                     *         "name": "Power BI",
                     *         "prefix": "d9e59440",
                     *         "revoked_at": null,
                     *         "user_id": "496b5b5b4ef94be98853f5f764183864"
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
                     *       "created_at": "2026-10-28T21:17:53.538159Z",
                     *       "id": "7d73e0b74d8c449c9b24b82fd2fb3d82",
                     *       "key": "fja_d9e59440_…",
                     *       "last_used_at": null,
                     *       "name": "Power BI",
                     *       "prefix": "d9e59440",
                     *       "revoked_at": null,
                     *       "user_id": "496b5b5b4ef94be98853f5f764183864"
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
                     *       "created_at": "2026-10-28T21:17:53.538159Z",
                     *       "id": "7d73e0b74d8c449c9b24b82fd2fb3d82",
                     *       "last_used_at": null,
                     *       "name": "Power BI",
                     *       "prefix": "d9e59440",
                     *       "revoked_at": "2026-10-28T21:17:53.578583Z",
                     *       "user_id": "496b5b5b4ef94be98853f5f764183864"
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
    lookup_invitation_auth_invitations_lookup_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InvitationLookup"];
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
                     *       "email": "nouveau@exemple.fr",
                     *       "expires_at": "2026-11-04T21:17:53.695217Z",
                     *       "project_name": "Démo e-commerce",
                     *       "role": "analyst",
                     *       "status": "valid"
                     *     }
                     */
                    "application/json": components["schemas"]["InvitationStatus"];
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
                     *         "created_at": "2026-10-28T21:17:21.917429Z",
                     *         "disabled": false,
                     *         "email": "admin@forja.local",
                     *         "id": "496b5b5b4ef94be98853f5f764183864",
                     *         "identity_provider": "password",
                     *         "is_admin": true,
                     *         "must_change_password": false,
                     *         "name": null
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
                     *         "created_at": "2026-10-28T21:17:21.917429Z",
                     *         "disabled": false,
                     *         "email": "admin@forja.local",
                     *         "id": "496b5b5b4ef94be98853f5f764183864",
                     *         "identity_provider": "password",
                     *         "is_admin": true,
                     *         "must_change_password": false,
                     *         "name": null
                     *       },
                     *       {
                     *         "created_at": "2026-10-28T21:17:38.782243Z",
                     *         "disabled": false,
                     *         "email": "ingenieur@demo.forja.local",
                     *         "id": "f7662b44b85844fca1b33c3ac76cbe90",
                     *         "identity_provider": "password",
                     *         "is_admin": false,
                     *         "must_change_password": false,
                     *         "name": null
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
                     *       "auth_mode": "multi",
                     *       "max_upload_mb": 200,
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
                     *       "created_at": "2026-10-28T21:17:58.330680Z",
                     *       "destination": null,
                     *       "exports": [],
                     *       "id": "781d414f5ce6471498380942d10be7ee",
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
                     *           "created_at": "2026-10-28T21:17:58.330680Z",
                     *           "effective": "Les ventes par produit en 2024",
                     *           "error": null,
                     *           "instruction": "Les ventes par produit en 2024",
                     *           "job_id": "259a786bb51c4b18829b7082c79fbcf3",
                     *           "kind": "question",
                     *           "llm": null,
                     *           "option_counts": [
                     *             {
                     *               "format": "currency",
                     *               "unit": "",
                     *               "value": 4994.8
                     *             },
                     *             {
                     *               "format": "integer",
                     *               "unit": "",
                     *               "value": 182
                     *             }
                     *           ],
                     *           "path": "parser",
                     *           "preview": null,
                     *           "proposed": null,
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
                     *           "summary_parts": [],
                     *           "version": 1
                     *         },
                     *         {
                     *           "clarification": null,
                     *           "context_tokens": 233,
                     *           "created_at": "2026-10-28T21:17:58.573868Z",
                     *           "effective": "Les ventes par produit en 2024",
                     *           "error": null,
                     *           "instruction": "Chiffre d'affaires",
                     *           "job_id": "0f41963f4f464a068a7a8f5e4915fcc3",
                     *           "kind": "answer",
                     *           "llm": null,
                     *           "option_counts": [],
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
                     *           "proposed": null,
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
                     *           "summary_parts": [
                     *             {
                     *               "term": {
                     *                 "current": 0,
                     *                 "index": 0,
                     *                 "kind": "metric",
                     *                 "options": [
                     *                   "Chiffre d'affaires",
                     *                   "Quantité vendue"
                     *                 ],
                     *                 "question": "Quelle mesure ?"
                     *               },
                     *               "text": "Chiffre d'affaires"
                     *             },
                     *             {
                     *               "term": null,
                     *               "text": " "
                     *             }
                     *           ],
                     *           "version": 2
                     *         }
                     *       ],
                     *       "model_columns": [],
                     *       "model_sql": null,
                     *       "model_summary": null,
                     *       "owner_email": "analyste@demo.forja.local",
                     *       "owner_id": "d9d26f58279a43599f4782b39a238a67",
                     *       "owner_unmasked": false,
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *       "updated_at": "2026-10-28T21:17:59.331368Z",
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
                     *         "created_at": "2026-10-28T21:17:58.330680Z",
                     *         "destination": null,
                     *         "exports": [],
                     *         "id": "781d414f5ce6471498380942d10be7ee",
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
                     *             "created_at": "2026-10-28T21:17:58.330680Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Les ventes par produit en 2024",
                     *             "job_id": "259a786bb51c4b18829b7082c79fbcf3",
                     *             "kind": "question",
                     *             "llm": null,
                     *             "option_counts": [
                     *               {
                     *                 "format": "currency",
                     *                 "unit": "",
                     *                 "value": 4994.8
                     *               },
                     *               {
                     *                 "format": "integer",
                     *                 "unit": "",
                     *                 "value": 182
                     *               }
                     *             ],
                     *             "path": "parser",
                     *             "preview": null,
                     *             "proposed": null,
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
                     *             "summary_parts": [],
                     *             "version": 1
                     *           },
                     *           {
                     *             "clarification": null,
                     *             "context_tokens": 233,
                     *             "created_at": "2026-10-28T21:17:58.573868Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Chiffre d'affaires",
                     *             "job_id": "0f41963f4f464a068a7a8f5e4915fcc3",
                     *             "kind": "answer",
                     *             "llm": null,
                     *             "option_counts": [],
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
                     *             "proposed": null,
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
                     *             "summary_parts": [
                     *               {
                     *                 "term": {
                     *                   "current": 0,
                     *                   "index": 0,
                     *                   "kind": "metric",
                     *                   "options": [
                     *                     "Chiffre d'affaires",
                     *                     "Quantité vendue"
                     *                   ],
                     *                   "question": "Quelle mesure ?"
                     *                 },
                     *                 "text": "Chiffre d'affaires"
                     *               },
                     *               {
                     *                 "term": null,
                     *                 "text": " "
                     *               }
                     *             ],
                     *             "version": 2
                     *           }
                     *         ],
                     *         "model_columns": [],
                     *         "model_sql": null,
                     *         "model_summary": null,
                     *         "owner_email": "analyste@demo.forja.local",
                     *         "owner_id": "d9d26f58279a43599f4782b39a238a67",
                     *         "owner_unmasked": false,
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *         "updated_at": "2026-10-28T21:17:58.769658Z",
                     *         "validated_at": null
                     *       },
                     *       "run": {
                     *         "attempts": 0,
                     *         "cancel_requested": false,
                     *         "created_at": "2026-10-28T21:17:58.575457Z",
                     *         "created_by": "d9d26f58279a43599f4782b39a238a67",
                     *         "error": null,
                     *         "finished_at": null,
                     *         "id": "0f41963f4f464a068a7a8f5e4915fcc3",
                     *         "metrics": null,
                     *         "params": {
                     *           "csv_delimiter": null,
                     *           "formats": [
                     *             "parquet",
                     *             "csv"
                     *           ],
                     *           "full_refresh": false,
                     *           "mart_request_id": "781d414f5ce6471498380942d10be7ee",
                     *           "source_ids": null,
                     *           "type": "mart_request",
                     *           "use_llm": true
                     *         },
                     *         "progress": null,
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *         "approved_at": "2026-10-28T21:17:59.444211Z",
                     *         "approved_by": "f7662b44b85844fca1b33c3ac76cbe90",
                     *         "bindings": {
                     *           "vente": "metric:montant"
                     *         },
                     *         "created_at": "2026-10-28T21:17:58.330680Z",
                     *         "destination": "powerbi",
                     *         "exports": [
                     *           {
                     *             "format": "parquet",
                     *             "path": "2c52376ee6594da69567373ad95dcbed/exports/mart_montant_par_libelle_2024.parquet",
                     *             "rows": 10,
                     *             "table": "mart_montant_par_libelle_2024"
                     *           },
                     *           {
                     *             "format": "csv",
                     *             "path": "2c52376ee6594da69567373ad95dcbed/exports/mart_montant_par_libelle_2024.csv",
                     *             "rows": 10,
                     *             "table": "mart_montant_par_libelle_2024"
                     *           }
                     *         ],
                     *         "id": "781d414f5ce6471498380942d10be7ee",
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
                     *             "created_at": "2026-10-28T21:17:58.330680Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Les ventes par produit en 2024",
                     *             "job_id": "259a786bb51c4b18829b7082c79fbcf3",
                     *             "kind": "question",
                     *             "llm": null,
                     *             "option_counts": [
                     *               {
                     *                 "format": "currency",
                     *                 "unit": "",
                     *                 "value": 4994.8
                     *               },
                     *               {
                     *                 "format": "integer",
                     *                 "unit": "",
                     *                 "value": 182
                     *               }
                     *             ],
                     *             "path": "parser",
                     *             "preview": null,
                     *             "proposed": null,
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
                     *             "summary_parts": [],
                     *             "version": 1
                     *           },
                     *           {
                     *             "clarification": null,
                     *             "context_tokens": 233,
                     *             "created_at": "2026-10-28T21:17:58.573868Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Chiffre d'affaires",
                     *             "job_id": "0f41963f4f464a068a7a8f5e4915fcc3",
                     *             "kind": "answer",
                     *             "llm": null,
                     *             "option_counts": [],
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
                     *             "proposed": null,
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
                     *             "summary_parts": [
                     *               {
                     *                 "term": {
                     *                   "current": 0,
                     *                   "index": 0,
                     *                   "kind": "metric",
                     *                   "options": [
                     *                     "Chiffre d'affaires",
                     *                     "Quantité vendue"
                     *                   ],
                     *                   "question": "Quelle mesure ?"
                     *                 },
                     *                 "text": "Chiffre d'affaires"
                     *               },
                     *               {
                     *                 "term": null,
                     *                 "text": " "
                     *               }
                     *             ],
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
                     *             "label": "Quantité vendue (unités)",
                     *             "name": "quantite",
                     *             "pii": null,
                     *             "ref": "metric:quantite"
                     *           }
                     *         ],
                     *         "model_sql": "-- Data mart requested by analyste@demo.forja.local: Les ventes par produit en 2024\n-- Quantité vendue par produit, sur T1 2024.\n-- Generated by Forja from mart request 781d414f5ce6471498380942d10be7ee v4.\n-- Do not edit: this file is regenerated on each build.\n\n{{ config(materialized='table') }}\n\nwith base as (\n\n    select\n        produit.libelle as libelle,\n        f.quantite as _m_quantite\n    …",
                     *         "model_summary": "Quantité vendue par produit, sur T1 2024.",
                     *         "owner_email": "analyste@demo.forja.local",
                     *         "owner_id": "d9d26f58279a43599f4782b39a238a67",
                     *         "owner_unmasked": false,
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *         "publish_error": null,
                     *         "publish_job_id": "59e1699b4dbb4d0c9d5933cf84a5e107",
                     *         "published_at": "2026-10-28T21:18:06.254155Z",
                     *         "published_name": "mart_montant_par_libelle_2024",
                     *         "published_table_id": "cf60c5fcdc1b4215a62f29d80fb09d67",
                     *         "question": "Les ventes par produit en 2024",
                     *         "rejected_by": null,
                     *         "rejection_reason": null,
                     *         "semantic_version": 3,
                     *         "status": "published",
                     *         "updated_at": "2026-10-28T21:18:06.254155Z",
                     *         "validated_at": "2026-10-28T21:17:59.412960Z"
                     *       },
                     *       "run": {
                     *         "attempts": 0,
                     *         "cancel_requested": false,
                     *         "created_at": "2026-10-28T21:17:59.467086Z",
                     *         "created_by": "f7662b44b85844fca1b33c3ac76cbe90",
                     *         "error": null,
                     *         "finished_at": null,
                     *         "id": "59e1699b4dbb4d0c9d5933cf84a5e107",
                     *         "metrics": null,
                     *         "params": {
                     *           "csv_delimiter": null,
                     *           "formats": [
                     *             "parquet",
                     *             "csv"
                     *           ],
                     *           "full_refresh": false,
                     *           "mart_request_id": "781d414f5ce6471498380942d10be7ee",
                     *           "source_ids": null,
                     *           "type": "publish_mart",
                     *           "use_llm": true
                     *         },
                     *         "progress": null,
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
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
    correct_mart_request_mart_requests__mart_id__correct_post: {
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
                "application/json": components["schemas"]["TermCorrection"];
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
                     *         "created_at": "2026-10-28T21:17:58.330680Z",
                     *         "destination": null,
                     *         "exports": [],
                     *         "id": "781d414f5ce6471498380942d10be7ee",
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
                     *             "created_at": "2026-10-28T21:17:58.330680Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Les ventes par produit en 2024",
                     *             "job_id": "259a786bb51c4b18829b7082c79fbcf3",
                     *             "kind": "question",
                     *             "llm": null,
                     *             "option_counts": [
                     *               {
                     *                 "format": "currency",
                     *                 "unit": "",
                     *                 "value": 4994.8
                     *               },
                     *               {
                     *                 "format": "integer",
                     *                 "unit": "",
                     *                 "value": 182
                     *               }
                     *             ],
                     *             "path": "parser",
                     *             "preview": null,
                     *             "proposed": null,
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
                     *             "summary_parts": [],
                     *             "version": 1
                     *           },
                     *           {
                     *             "clarification": null,
                     *             "context_tokens": 233,
                     *             "created_at": "2026-10-28T21:17:58.573868Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Chiffre d'affaires",
                     *             "job_id": "0f41963f4f464a068a7a8f5e4915fcc3",
                     *             "kind": "answer",
                     *             "llm": null,
                     *             "option_counts": [],
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
                     *             "proposed": null,
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
                     *             "summary_parts": [
                     *               {
                     *                 "term": {
                     *                   "current": 0,
                     *                   "index": 0,
                     *                   "kind": "metric",
                     *                   "options": [
                     *                     "Chiffre d'affaires",
                     *                     "Quantité vendue"
                     *                   ],
                     *                   "question": "Quelle mesure ?"
                     *                 },
                     *                 "text": "Chiffre d'affaires"
                     *               },
                     *               {
                     *                 "term": null,
                     *                 "text": " "
                     *               }
                     *             ],
                     *             "version": 2
                     *           }
                     *         ],
                     *         "model_columns": [],
                     *         "model_sql": null,
                     *         "model_summary": null,
                     *         "owner_email": "analyste@demo.forja.local",
                     *         "owner_id": "d9d26f58279a43599f4782b39a238a67",
                     *         "owner_unmasked": false,
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *         "updated_at": "2026-10-28T21:17:59.331368Z",
                     *         "validated_at": null
                     *       },
                     *       "run": {
                     *         "attempts": 0,
                     *         "cancel_requested": false,
                     *         "created_at": "2026-10-28T21:17:59.140154Z",
                     *         "created_by": "d9d26f58279a43599f4782b39a238a67",
                     *         "error": null,
                     *         "finished_at": null,
                     *         "id": "ae69ac3461714e058c249b5fcb6546b0",
                     *         "metrics": null,
                     *         "params": {
                     *           "csv_delimiter": null,
                     *           "formats": [
                     *             "parquet",
                     *             "csv"
                     *           ],
                     *           "full_refresh": false,
                     *           "mart_request_id": "781d414f5ce6471498380942d10be7ee",
                     *           "source_ids": null,
                     *           "type": "mart_request",
                     *           "use_llm": true
                     *         },
                     *         "progress": null,
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *         "created_at": "2026-10-28T21:17:58.330680Z",
                     *         "destination": null,
                     *         "exports": [],
                     *         "id": "781d414f5ce6471498380942d10be7ee",
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
                     *             "created_at": "2026-10-28T21:17:58.330680Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Les ventes par produit en 2024",
                     *             "job_id": "259a786bb51c4b18829b7082c79fbcf3",
                     *             "kind": "question",
                     *             "llm": null,
                     *             "option_counts": [
                     *               {
                     *                 "format": "currency",
                     *                 "unit": "",
                     *                 "value": 4994.8
                     *               },
                     *               {
                     *                 "format": "integer",
                     *                 "unit": "",
                     *                 "value": 182
                     *               }
                     *             ],
                     *             "path": "parser",
                     *             "preview": null,
                     *             "proposed": null,
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
                     *             "summary_parts": [],
                     *             "version": 1
                     *           },
                     *           {
                     *             "clarification": null,
                     *             "context_tokens": 233,
                     *             "created_at": "2026-10-28T21:17:58.573868Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Chiffre d'affaires",
                     *             "job_id": "0f41963f4f464a068a7a8f5e4915fcc3",
                     *             "kind": "answer",
                     *             "llm": null,
                     *             "option_counts": [],
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
                     *             "proposed": null,
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
                     *             "summary_parts": [
                     *               {
                     *                 "term": {
                     *                   "current": 0,
                     *                   "index": 0,
                     *                   "kind": "metric",
                     *                   "options": [
                     *                     "Chiffre d'affaires",
                     *                     "Quantité vendue"
                     *                   ],
                     *                   "question": "Quelle mesure ?"
                     *                 },
                     *                 "text": "Chiffre d'affaires"
                     *               },
                     *               {
                     *                 "term": null,
                     *                 "text": " "
                     *               }
                     *             ],
                     *             "version": 2
                     *           }
                     *         ],
                     *         "model_columns": [],
                     *         "model_sql": null,
                     *         "model_summary": null,
                     *         "owner_email": "analyste@demo.forja.local",
                     *         "owner_id": "d9d26f58279a43599f4782b39a238a67",
                     *         "owner_unmasked": false,
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *         "updated_at": "2026-10-28T21:17:59.031002Z",
                     *         "validated_at": null
                     *       },
                     *       "run": {
                     *         "attempts": 0,
                     *         "cancel_requested": false,
                     *         "created_at": "2026-10-28T21:17:58.823116Z",
                     *         "created_by": "d9d26f58279a43599f4782b39a238a67",
                     *         "error": null,
                     *         "finished_at": null,
                     *         "id": "8aa0ddf625e8426eb8f235f0b9307b44",
                     *         "metrics": null,
                     *         "params": {
                     *           "csv_delimiter": null,
                     *           "formats": [
                     *             "parquet",
                     *             "csv"
                     *           ],
                     *           "full_refresh": false,
                     *           "mart_request_id": "781d414f5ce6471498380942d10be7ee",
                     *           "source_ids": null,
                     *           "type": "mart_request",
                     *           "use_llm": true
                     *         },
                     *         "progress": null,
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *       "created_at": "2026-10-28T21:18:06.298661Z",
                     *       "destination": null,
                     *       "exports": [],
                     *       "id": "3e0e3aa4cc364363ac94ab2f7fa6f075",
                     *       "iterations": [
                     *         {
                     *           "clarification": null,
                     *           "context_tokens": 220,
                     *           "created_at": "2026-10-28T21:18:06.298661Z",
                     *           "effective": "Panier moyen par segment",
                     *           "error": null,
                     *           "instruction": "Panier moyen par segment",
                     *           "job_id": "f1ac33d6d06e46e18713a652373ccc52",
                     *           "kind": "question",
                     *           "llm": null,
                     *           "option_counts": [],
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
                     *           "proposed": null,
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
                     *           "summary_parts": [
                     *             {
                     *               "term": {
                     *                 "current": 0,
                     *                 "index": 0,
                     *                 "kind": "metric",
                     *                 "options": [
                     *                   "Panier moyen",
                     *                   "Quantité vendue"
                     *                 ],
                     *                 "question": "Quelle mesure ?"
                     *               },
                     *               "text": "Panier moyen"
                     *             },
                     *             {
                     *               "term": null,
                     *               "text": " "
                     *             }
                     *           ],
                     *           "version": 1
                     *         }
                     *       ],
                     *       "model_columns": [],
                     *       "model_sql": null,
                     *       "model_summary": null,
                     *       "owner_email": "analyste@demo.forja.local",
                     *       "owner_id": "d9d26f58279a43599f4782b39a238a67",
                     *       "owner_unmasked": false,
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "publish_error": null,
                     *       "publish_job_id": null,
                     *       "published_at": null,
                     *       "published_name": null,
                     *       "published_table_id": null,
                     *       "question": "Panier moyen par segment",
                     *       "rejected_by": "d9d26f58279a43599f4782b39a238a67",
                     *       "rejection_reason": "doublon",
                     *       "semantic_version": 3,
                     *       "status": "rejected",
                     *       "updated_at": "2026-10-28T21:18:06.515440Z",
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
        requestBody?: {
            content: {
                "application/json": components["schemas"]["MartValidation"] | null;
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
                     *       "mart_request": {
                     *         "approved_at": null,
                     *         "approved_by": null,
                     *         "bindings": {
                     *           "vente": "metric:montant"
                     *         },
                     *         "created_at": "2026-10-28T21:17:58.330680Z",
                     *         "destination": "powerbi",
                     *         "exports": [],
                     *         "id": "781d414f5ce6471498380942d10be7ee",
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
                     *             "created_at": "2026-10-28T21:17:58.330680Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Les ventes par produit en 2024",
                     *             "job_id": "259a786bb51c4b18829b7082c79fbcf3",
                     *             "kind": "question",
                     *             "llm": null,
                     *             "option_counts": [
                     *               {
                     *                 "format": "currency",
                     *                 "unit": "",
                     *                 "value": 4994.8
                     *               },
                     *               {
                     *                 "format": "integer",
                     *                 "unit": "",
                     *                 "value": 182
                     *               }
                     *             ],
                     *             "path": "parser",
                     *             "preview": null,
                     *             "proposed": null,
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
                     *             "summary_parts": [],
                     *             "version": 1
                     *           },
                     *           {
                     *             "clarification": null,
                     *             "context_tokens": 233,
                     *             "created_at": "2026-10-28T21:17:58.573868Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Chiffre d'affaires",
                     *             "job_id": "0f41963f4f464a068a7a8f5e4915fcc3",
                     *             "kind": "answer",
                     *             "llm": null,
                     *             "option_counts": [],
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
                     *             "proposed": null,
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
                     *             "summary_parts": [
                     *               {
                     *                 "term": {
                     *                   "current": 0,
                     *                   "index": 0,
                     *                   "kind": "metric",
                     *                   "options": [
                     *                     "Chiffre d'affaires",
                     *                     "Quantité vendue"
                     *                   ],
                     *                   "question": "Quelle mesure ?"
                     *                 },
                     *                 "text": "Chiffre d'affaires"
                     *               },
                     *               {
                     *                 "term": null,
                     *                 "text": " "
                     *               }
                     *             ],
                     *             "version": 2
                     *           }
                     *         ],
                     *         "model_columns": [],
                     *         "model_sql": null,
                     *         "model_summary": null,
                     *         "owner_email": "analyste@demo.forja.local",
                     *         "owner_id": "d9d26f58279a43599f4782b39a238a67",
                     *         "owner_unmasked": false,
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *         "updated_at": "2026-10-28T21:17:59.331368Z",
                     *         "validated_at": "2026-10-28T21:17:59.412960Z"
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
                     *         "created_at": "2026-10-28T21:17:22.245090Z",
                     *         "description": "Boutique en ligne fictive (données générées)",
                     *         "id": "2c52376ee6594da69567373ad95dcbed",
                     *         "name": "Démo e-commerce"
                     *       },
                     *       {
                     *         "architecture": "medallion",
                     *         "created_at": "2026-10-28T21:17:53.625261Z",
                     *         "description": null,
                     *         "id": "fb67b5faf80e47d68a522dd764a13683",
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
                     *       "created_at": "2026-10-28T21:17:53.625261Z",
                     *       "description": null,
                     *       "id": "fb67b5faf80e47d68a522dd764a13683",
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
    agent_overview_projects__project_id__agent_overview_get: {
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
                     *       "data_updated_at": "2026-10-28T21:17:38.550229Z",
                     *       "gold_run_id": "14dae6a40b3a4baea9b479406b87a1bc",
                     *       "semantic_version": 3,
                     *       "suggestions": [
                     *         "Chiffre d'affaires par mois en 2024",
                     *         "Chiffre d'affaires par code produit"
                     *       ]
                     *     }
                     */
                    "application/json": components["schemas"]["AgentOverview"];
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
                     *         "at": "2026-10-28T21:18:06.528119Z",
                     *         "details": {
                     *           "reason": "doublon"
                     *         },
                     *         "id": "b580c01ae3cf4165822e5595c03ab02f",
                     *         "object_id": "3e0e3aa4cc364363ac94ab2f7fa6f075",
                     *         "object_type": "mart_request",
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *         "user_email": "analyste@demo.forja.local",
                     *         "user_id": "d9d26f58279a43599f4782b39a238a67"
                     *       },
                     *       {
                     *         "action": "agent.request",
                     *         "at": "2026-10-28T21:18:06.491411Z",
                     *         "details": {
                     *           "question": "Panier moyen par segment"
                     *         },
                     *         "id": "f480bf692b914fb78d16ba41ca3b28f8",
                     *         "object_id": "3e0e3aa4cc364363ac94ab2f7fa6f075",
                     *         "object_type": "mart_request",
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *         "user_email": "analyste@demo.forja.local",
                     *         "user_id": "d9d26f58279a43599f4782b39a238a67"
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
                     *       "created_at": "2026-10-28T21:17:31.562217Z",
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
                     *               "relation_id": "110fb6e834ab407ba89979e01edea5c8",
                     *               "source": "lignes_commande"
                     *             },
                     *             {
                     *               "column": "id_client",
                     *               "dimension": "dim_clients",
                     *               "explanation": "client_key → dim_clients via la relation confirmée commandes.id_client → clients.id_client.",
                     *               "name": "client_key",
                     *               "relation_id": "f34e3fcbe744417e96686934aa816078",
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
                     *       "id": "dd5cc05aa9b249c98d8aa81c3e978369",
                     *       "issues": [],
                     *       "origin": "heuristic",
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "status": "applied",
                     *       "summary": "2 dimension(s), 1 fait(s), dimension date générée. Validation : 0 erreur(s), 0 avertissement(s).",
                     *       "updated_at": "2026-10-28T21:17:38.565155Z",
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
                     *       "created_at": "2026-10-28T21:17:56.048788Z",
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
                     *               "relation_id": "110fb6e834ab407ba89979e01edea5c8",
                     *               "source": "lignes_commande"
                     *             },
                     *             {
                     *               "column": "id_client",
                     *               "dimension": "dim_clients",
                     *               "explanation": "client_key → dim_clients via la relation confirmée commandes.id_client → clients.id_client.",
                     *               "name": "client_key",
                     *               "relation_id": "f34e3fcbe744417e96686934aa816078",
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
                     *       "id": "8d229e63fa724253bf351a06f2a9cc19",
                     *       "issues": [],
                     *       "origin": "heuristic",
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "status": "draft",
                     *       "summary": "2 dimension(s), 1 fait(s), dimension date générée. Validation : 0 erreur(s), 0 avertissement(s).",
                     *       "updated_at": "2026-10-28T21:17:56.048788Z",
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
                     *       "created_at": "2026-10-28T21:17:56.048788Z",
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
                     *               "relation_id": "110fb6e834ab407ba89979e01edea5c8",
                     *               "source": "lignes_commande"
                     *             },
                     *             {
                     *               "column": "id_client",
                     *               "dimension": "dim_clients",
                     *               "explanation": "client_key → dim_clients via la relation confirmée commandes.id_client → clients.id_client.",
                     *               "name": "client_key",
                     *               "relation_id": "f34e3fcbe744417e96686934aa816078",
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
                     *       "id": "8d229e63fa724253bf351a06f2a9cc19",
                     *       "issues": [],
                     *       "origin": "heuristic",
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "status": "approved",
                     *       "summary": "2 dimension(s), 1 fait(s), dimension date générée. Validation : 0 erreur(s), 0 avertissement(s).",
                     *       "updated_at": "2026-10-28T21:17:56.109143Z",
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
    get_gold_plan_issues_projects__project_id__gold_plan_issues_get: {
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
                    /** @example [] */
                    "application/json": components["schemas"]["ValidationIssue"][];
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
                     *       "created_at": "2026-10-28T21:17:55.896360Z",
                     *       "created_by": "f7662b44b85844fca1b33c3ac76cbe90",
                     *       "error": null,
                     *       "finished_at": "2026-10-28T21:17:55.978574Z",
                     *       "id": "c5fdd26f94f74021af8c6cff71de4e11",
                     *       "metrics": {
                     *         "dbt_tests": null,
                     *         "duplicates_removed": 0,
                     *         "duration_seconds": 0.062,
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
                     *         "done": [],
                     *         "failed": [],
                     *         "message": "validation et enregistrement du plan",
                     *         "percent": 100,
                     *         "running": [],
                     *         "step": "validation",
                     *         "updated_at": "2026-10-28T21:17:55.974985Z"
                     *       },
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "result": {
                     *         "errors": 0,
                     *         "gold_plan_version": 2,
                     *         "origin": "heuristic",
                     *         "warnings": [
                     *           "commandes.frais_port n'est pas repris comme mesure : il est au niveau de commandes, le sommer au grain de lignes_commande le multiplierait"
                     *         ]
                     *       },
                     *       "started_at": "2026-10-28T21:17:55.905298Z",
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
                     *         "created_at": "2026-10-28T21:17:31.562217Z",
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
                     *                 "relation_id": "110fb6e834ab407ba89979e01edea5c8",
                     *                 "source": "lignes_commande"
                     *               },
                     *               {
                     *                 "column": "id_client",
                     *                 "dimension": "dim_clients",
                     *                 "explanation": "client_key → dim_clients via la relation confirmée commandes.id_client → clients.id_client.",
                     *                 "name": "client_key",
                     *                 "relation_id": "f34e3fcbe744417e96686934aa816078",
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
                     *         "id": "dd5cc05aa9b249c98d8aa81c3e978369",
                     *         "issues": [],
                     *         "origin": "heuristic",
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *         "status": "applied",
                     *         "summary": "2 dimension(s), 1 fait(s), dimension date générée. Validation : 0 erreur(s), 0 avertissement(s).",
                     *         "updated_at": "2026-10-28T21:17:38.565155Z",
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
    get_graph_projects__project_id__graph_get: {
        parameters: {
            query?: never;
            header?: {
                "if-none-match"?: string | null;
            };
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
                     *       "edges": [
                     *         {
                     *           "confidence": null,
                     *           "id": "src_catalogue->stg_catalogue",
                     *           "source": "src_catalogue",
                     *           "state": "applied",
                     *           "target": "stg_catalogue",
                     *           "type": "lineage"
                     *         },
                     *         {
                     *           "confidence": null,
                     *           "id": "src_clients->stg_clients",
                     *           "source": "src_clients",
                     *           "state": "applied",
                     *           "target": "stg_clients",
                     *           "type": "lineage"
                     *         }
                     *       ],
                     *       "lanes": [
                     *         {
                     *           "lane": "sources",
                     *           "states": {
                     *             "applied": 5
                     *           },
                     *           "total": 5
                     *         },
                     *         {
                     *           "lane": "cleaning",
                     *           "states": {
                     *             "applied": 3,
                     *             "pending": 2
                     *           },
                     *           "total": 5
                     *         }
                     *       ],
                     *       "nodes": [
                     *         {
                     *           "counts": {
                     *             "columns": 5,
                     *             "rows": 12,
                     *             "rules": null,
                     *             "tables": null
                     *           },
                     *           "highlights": [
                     *             "code_produit",
                     *             "libelle"
                     *           ],
                     *           "id": "src_catalogue",
                     *           "label": "Source catalogue.csv",
                     *           "lane": "sources",
                     *           "message": null,
                     *           "name": "catalogue.csv",
                     *           "pii_columns": [],
                     *           "pii_count": 0,
                     *           "quality_score": 100,
                     *           "ref": "4a0d20517ed948c88ac9811ef212c932",
                     *           "review_count": 0,
                     *           "run": {
                     *             "finished_at": "2026-10-28T21:17:57.037689Z",
                     *             "percent": null,
                     *             "run_id": "00597f8cdc59496ca53f0c8048a32a84",
                     *             "status": "succeeded",
                     *             "type": "profile"
                     *           },
                     *           "state": "applied",
                     *           "type": "source"
                     *         },
                     *         {
                     *           "counts": {
                     *             "columns": 5,
                     *             "rows": null,
                     *             "rules": 5,
                     *             "tables": null
                     *           },
                     *           "highlights": [
                     *             "code_produit",
                     *             "libelle"
                     *           ],
                     *           "id": "stg_catalogue",
                     *           "label": "Nettoyage de catalogue",
                     *           "lane": "cleaning",
                     *           "message": "Plan validé, table à construire",
                     *           "name": "catalogue",
                     *           "pii_columns": [],
                     *           "pii_count": 0,
                     *           "quality_score": null,
                     *           "ref": "4a0d20517ed948c88ac9811ef212c932",
                     *           "review_count": 0,
                     *           "run": null,
                     *           "state": "pending",
                     *           "type": "silver"
                     *         }
                     *       ],
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "version": "4dd1707e555a5b3a"
                     *     }
                     */
                    "application/json": components["schemas"]["ProjectGraph"];
                };
            };
            /** @description Graph unchanged since the ETag */
            304: {
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
                     *         "created_at": "2026-10-28T21:17:53.695217Z",
                     *         "email": "nouveau@exemple.fr",
                     *         "expires_at": "2026-11-04T21:17:53.695217Z",
                     *         "id": "5b334c1c0dee4d4da1a338a6ab4fc34c",
                     *         "invited_by": "496b5b5b4ef94be98853f5f764183864",
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *         "revoked_at": null,
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
                     *       "created_at": "2026-10-28T21:17:53.730328Z",
                     *       "email": "erreur@exemple.fr",
                     *       "expires_at": "2026-11-04T21:17:53.730328Z",
                     *       "id": "3c3d7aa5309f41e4ad51af65d366bdec",
                     *       "invited_by": "496b5b5b4ef94be98853f5f764183864",
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "revoked_at": null,
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
    revoke_invitation_projects__project_id__invitations__invitation_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invitation_id: string;
                project_id: string;
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
                     *         "created_at": "2026-10-28T21:17:58.330680Z",
                     *         "destination": null,
                     *         "exports": [],
                     *         "id": "781d414f5ce6471498380942d10be7ee",
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
                     *             "created_at": "2026-10-28T21:17:58.330680Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Les ventes par produit en 2024",
                     *             "job_id": "259a786bb51c4b18829b7082c79fbcf3",
                     *             "kind": "question",
                     *             "llm": null,
                     *             "option_counts": [
                     *               {
                     *                 "format": "currency",
                     *                 "unit": "",
                     *                 "value": 4994.8
                     *               },
                     *               {
                     *                 "format": "integer",
                     *                 "unit": "",
                     *                 "value": 182
                     *               }
                     *             ],
                     *             "path": "parser",
                     *             "preview": null,
                     *             "proposed": null,
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
                     *             "summary_parts": [],
                     *             "version": 1
                     *           },
                     *           {
                     *             "clarification": null,
                     *             "context_tokens": 233,
                     *             "created_at": "2026-10-28T21:17:58.573868Z",
                     *             "effective": "Les ventes par produit en 2024",
                     *             "error": null,
                     *             "instruction": "Chiffre d'affaires",
                     *             "job_id": "0f41963f4f464a068a7a8f5e4915fcc3",
                     *             "kind": "answer",
                     *             "llm": null,
                     *             "option_counts": [],
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
                     *             "proposed": null,
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
                     *             "summary_parts": [
                     *               {
                     *                 "term": {
                     *                   "current": 0,
                     *                   "index": 0,
                     *                   "kind": "metric",
                     *                   "options": [
                     *                     "Chiffre d'affaires",
                     *                     "Quantité vendue"
                     *                   ],
                     *                   "question": "Quelle mesure ?"
                     *                 },
                     *                 "text": "Chiffre d'affaires"
                     *               },
                     *               {
                     *                 "term": null,
                     *                 "text": " "
                     *               }
                     *             ],
                     *             "version": 2
                     *           }
                     *         ],
                     *         "model_columns": [],
                     *         "model_sql": null,
                     *         "model_summary": null,
                     *         "owner_email": "analyste@demo.forja.local",
                     *         "owner_id": "d9d26f58279a43599f4782b39a238a67",
                     *         "owner_unmasked": false,
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *         "updated_at": "2026-10-28T21:17:59.331368Z",
                     *         "validated_at": null
                     *       },
                     *       {
                     *         "approved_at": null,
                     *         "approved_by": null,
                     *         "bindings": {},
                     *         "created_at": "2026-10-28T21:17:46.458383Z",
                     *         "destination": null,
                     *         "exports": [
                     *           {
                     *             "format": "parquet",
                     *             "path": "2c52376ee6594da69567373ad95dcbed/exports/mart_quantite_par_categorie.parquet",
                     *             "rows": 4,
                     *             "table": "mart_quantite_par_categorie"
                     *           },
                     *           {
                     *             "format": "csv",
                     *             "path": "2c52376ee6594da69567373ad95dcbed/exports/mart_quantite_par_categorie.csv",
                     *             "rows": 4,
                     *             "table": "mart_quantite_par_categorie"
                     *           }
                     *         ],
                     *         "id": "4c7f040fa75943db88819f15cbea2792",
                     *         "iterations": [
                     *           {
                     *             "clarification": null,
                     *             "context_tokens": 244,
                     *             "created_at": "2026-10-28T21:17:46.458383Z",
                     *             "effective": "Quantité vendue et prix moyen par catégorie de produit",
                     *             "error": null,
                     *             "instruction": "Quantité vendue et prix moyen par catégorie de produit",
                     *             "job_id": "92e1fc52a3104e51a2e2e26ca60b292c",
                     *             "kind": "question",
                     *             "llm": null,
                     *             "option_counts": [],
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
                     *             "proposed": null,
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
                     *             "summary_parts": [
                     *               {
                     *                 "term": {
                     *                   "current": 0,
                     *                   "index": 0,
                     *                   "kind": "metric",
                     *                   "options": [
                     *                     "Quantité vendue",
                     *                     "Chiffre d'affaires"
                     *                   ],
                     *                   "question": "Quelle mesure ?"
                     *                 },
                     *                 "text": "Quantité vendue"
                     *               },
                     *               {
                     *                 "term": null,
                     *                 "text": " et "
                     *               }
                     *             ],
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
                     *         "model_sql": "-- Data mart requested by analyste@demo.forja.local: Quantité vendue et prix moyen par catégorie de produit\n-- Quantité vendue et prix moyen unitaire par catégorie.\n-- Generated by Forja from mart request 4c7f040fa75943db88819f15cbea2792 v1.\n-- Do not edit: this file is regenerated on each build.\n\n{{ config(materialized='table') }}\n\nwith base as (\n\n    select\n        produit.categorie as categorie…",
                     *         "model_summary": "Quantité vendue et prix moyen unitaire par catégorie.",
                     *         "owner_email": "analyste@demo.forja.local",
                     *         "owner_id": "d9d26f58279a43599f4782b39a238a67",
                     *         "owner_unmasked": false,
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *         "publish_error": null,
                     *         "publish_job_id": "8d3baa8688f347afa413c14533ba7672",
                     *         "published_at": "2026-10-28T21:17:53.328123Z",
                     *         "published_name": "mart_quantite_par_categorie",
                     *         "published_table_id": "2e1c9ceedce64fb19383cad0d9b93699",
                     *         "question": "Quantité vendue et prix moyen par catégorie de produit",
                     *         "rejected_by": null,
                     *         "rejection_reason": null,
                     *         "semantic_version": 1,
                     *         "status": "published",
                     *         "updated_at": "2026-10-28T21:17:53.328123Z",
                     *         "validated_at": "2026-10-28T21:17:46.708544Z"
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
                     *         "created_at": "2026-10-28T21:18:06.298661Z",
                     *         "destination": null,
                     *         "exports": [],
                     *         "id": "3e0e3aa4cc364363ac94ab2f7fa6f075",
                     *         "iterations": [
                     *           {
                     *             "clarification": null,
                     *             "context_tokens": 220,
                     *             "created_at": "2026-10-28T21:18:06.298661Z",
                     *             "effective": "Panier moyen par segment",
                     *             "error": null,
                     *             "instruction": "Panier moyen par segment",
                     *             "job_id": "f1ac33d6d06e46e18713a652373ccc52",
                     *             "kind": "question",
                     *             "llm": null,
                     *             "option_counts": [],
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
                     *             "proposed": null,
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
                     *             "summary_parts": [
                     *               {
                     *                 "term": {
                     *                   "current": 0,
                     *                   "index": 0,
                     *                   "kind": "metric",
                     *                   "options": [
                     *                     "Panier moyen",
                     *                     "Quantité vendue"
                     *                   ],
                     *                   "question": "Quelle mesure ?"
                     *                 },
                     *                 "text": "Panier moyen"
                     *               },
                     *               {
                     *                 "term": null,
                     *                 "text": " "
                     *               }
                     *             ],
                     *             "version": 1
                     *           }
                     *         ],
                     *         "model_columns": [],
                     *         "model_sql": null,
                     *         "model_summary": null,
                     *         "owner_email": "analyste@demo.forja.local",
                     *         "owner_id": "d9d26f58279a43599f4782b39a238a67",
                     *         "owner_unmasked": false,
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *         "updated_at": "2026-10-28T21:18:06.469269Z",
                     *         "validated_at": null
                     *       },
                     *       "run": {
                     *         "attempts": 0,
                     *         "cancel_requested": false,
                     *         "created_at": "2026-10-28T21:18:06.300208Z",
                     *         "created_by": "d9d26f58279a43599f4782b39a238a67",
                     *         "error": null,
                     *         "finished_at": null,
                     *         "id": "f1ac33d6d06e46e18713a652373ccc52",
                     *         "metrics": null,
                     *         "params": {
                     *           "csv_delimiter": null,
                     *           "formats": [
                     *             "parquet",
                     *             "csv"
                     *           ],
                     *           "full_refresh": false,
                     *           "mart_request_id": "3e0e3aa4cc364363ac94ab2f7fa6f075",
                     *           "source_ids": null,
                     *           "type": "mart_request",
                     *           "use_llm": true
                     *         },
                     *         "progress": null,
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *         "created_at": "2026-10-28T21:17:38.958337Z",
                     *         "email": "analyste@demo.forja.local",
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *         "role": "analyst",
                     *         "user_id": "d9d26f58279a43599f4782b39a238a67"
                     *       },
                     *       {
                     *         "created_at": "2026-10-28T21:17:38.867842Z",
                     *         "email": "ingenieur@demo.forja.local",
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *         "role": "engineer",
                     *         "user_id": "f7662b44b85844fca1b33c3ac76cbe90"
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
                     *       "created_at": "2026-10-28T21:17:53.847428Z",
                     *       "email": "nouveau@exemple.fr",
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "role": "engineer",
                     *       "user_id": "e9c9c411784b4636afc1cb1a7ac1d7e3"
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
                     *         "created_at": "2026-10-28T21:17:31.128773Z",
                     *         "explanation": "94 % des valeurs de commandes.id_client existent dans clients.id_client ; noms identiques ; relation N-1 : plusieurs lignes de commandes pour une ligne de clients.",
                     *         "from_column": "id_client",
                     *         "from_distinct": 16,
                     *         "from_source": "commandes",
                     *         "from_source_id": "6b975b6b84714cd3b366aba0bb27d625",
                     *         "from_table": "stg_commandes",
                     *         "id": "f34e3fcbe744417e96686934aa816078",
                     *         "inclusion_ratio": 0.9375,
                     *         "name_similarity": 1,
                     *         "origin": "detected",
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *         "sample_size": 16,
                     *         "status": "confirmed",
                     *         "to_column": "id_client",
                     *         "to_source": "clients",
                     *         "to_source_id": "b5d168336bb54909a107520298cc6d57",
                     *         "to_table": "stg_clients",
                     *         "type_compatible": true,
                     *         "updated_at": "2026-10-28T21:17:31.498476Z"
                     *       },
                     *       {
                     *         "cardinality": "N-1",
                     *         "confidence": 0.95,
                     *         "created_at": "2026-10-28T21:17:31.320618Z",
                     *         "explanation": "92 % des valeurs de lignes_commande.code_produit existent dans produits.code_produit ; noms identiques ; relation N-1 : plusieurs lignes de lignes_commande pour une ligne de produits.",
                     *         "from_column": "code_produit",
                     *         "from_distinct": 12,
                     *         "from_source": "lignes_commande",
                     *         "from_source_id": "d8b3c80a2749432387c89c7a0e6c83dc",
                     *         "from_table": "stg_lignes_commande",
                     *         "id": "110fb6e834ab407ba89979e01edea5c8",
                     *         "inclusion_ratio": 0.9167,
                     *         "name_similarity": 1,
                     *         "origin": "detected",
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *         "sample_size": 12,
                     *         "status": "confirmed",
                     *         "to_column": "code_produit",
                     *         "to_source": "produits",
                     *         "to_source_id": "dd88ae9929f04976ac94c76d7db74432",
                     *         "to_table": "stg_produits",
                     *         "type_compatible": true,
                     *         "updated_at": "2026-10-28T21:17:31.506356Z"
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
                     *       "created_at": "2026-10-28T21:17:55.381254Z",
                     *       "explanation": "Ajoutée manuellement. 94 % des valeurs de commandes.id_client existent dans clients.id_client ; noms identiques ; relation N-1 : plusieurs lignes de commandes pour une ligne de clients.",
                     *       "from_column": "id_client",
                     *       "from_distinct": 16,
                     *       "from_source": "commandes",
                     *       "from_source_id": "6b975b6b84714cd3b366aba0bb27d625",
                     *       "from_table": "stg_commandes",
                     *       "id": "f34e3fcbe744417e96686934aa816078",
                     *       "inclusion_ratio": 0.9375,
                     *       "name_similarity": 1,
                     *       "origin": "manual",
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "sample_size": 16,
                     *       "status": "confirmed",
                     *       "to_column": "id_client",
                     *       "to_source": "clients",
                     *       "to_source_id": "b5d168336bb54909a107520298cc6d57",
                     *       "to_table": "stg_clients",
                     *       "type_compatible": true,
                     *       "updated_at": "2026-10-28T21:17:55.381254Z"
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
                     *         "created_at": "2026-10-28T21:17:55.381254Z",
                     *         "explanation": "94 % des valeurs de commandes.id_client existent dans clients.id_client ; noms identiques ; relation N-1 : plusieurs lignes de commandes pour une ligne de clients.",
                     *         "from_column": "id_client",
                     *         "from_distinct": 16,
                     *         "from_source": "commandes",
                     *         "from_source_id": "6b975b6b84714cd3b366aba0bb27d625",
                     *         "from_table": "stg_commandes",
                     *         "id": "f34e3fcbe744417e96686934aa816078",
                     *         "inclusion_ratio": 0.9375,
                     *         "name_similarity": 1,
                     *         "origin": "manual",
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *         "sample_size": 16,
                     *         "status": "confirmed",
                     *         "to_column": "id_client",
                     *         "to_source": "clients",
                     *         "to_source_id": "b5d168336bb54909a107520298cc6d57",
                     *         "to_table": "stg_clients",
                     *         "type_compatible": true,
                     *         "updated_at": "2026-10-28T21:17:55.769783Z"
                     *       },
                     *       {
                     *         "cardinality": "N-1",
                     *         "confidence": 0.95,
                     *         "created_at": "2026-10-28T21:17:31.320618Z",
                     *         "explanation": "92 % des valeurs de lignes_commande.code_produit existent dans produits.code_produit ; noms identiques ; relation N-1 : plusieurs lignes de lignes_commande pour une ligne de produits.",
                     *         "from_column": "code_produit",
                     *         "from_distinct": 12,
                     *         "from_source": "lignes_commande",
                     *         "from_source_id": "d8b3c80a2749432387c89c7a0e6c83dc",
                     *         "from_table": "stg_lignes_commande",
                     *         "id": "110fb6e834ab407ba89979e01edea5c8",
                     *         "inclusion_ratio": 0.9167,
                     *         "name_similarity": 1,
                     *         "origin": "detected",
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *         "sample_size": 12,
                     *         "status": "confirmed",
                     *         "to_column": "code_produit",
                     *         "to_source": "produits",
                     *         "to_source_id": "dd88ae9929f04976ac94c76d7db74432",
                     *         "to_table": "stg_produits",
                     *         "type_compatible": true,
                     *         "updated_at": "2026-10-28T21:17:55.773211Z"
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
                     *         "created_at": "2026-10-28T21:17:56.136182Z",
                     *         "created_by": "f7662b44b85844fca1b33c3ac76cbe90",
                     *         "error": null,
                     *         "finished_at": "2026-10-28T21:17:57.037689Z",
                     *         "id": "00597f8cdc59496ca53f0c8048a32a84",
                     *         "metrics": {
                     *           "dbt_tests": null,
                     *           "duplicates_removed": 0,
                     *           "duration_seconds": 0.876,
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
                     *         "progress": {
                     *           "done": [
                     *             "4a0d20517ed948c88ac9811ef212c932",
                     *             "b5d168336bb54909a107520298cc6d57"
                     *           ],
                     *           "failed": [],
                     *           "message": "profilage de produits",
                     *           "percent": 100,
                     *           "running": [],
                     *           "step": "profile",
                     *           "updated_at": "2026-10-28T21:17:57.032292Z"
                     *         },
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *         "result": null,
                     *         "started_at": "2026-10-28T21:17:56.151684Z",
                     *         "status": "succeeded",
                     *         "type": "profile"
                     *       },
                     *       {
                     *         "attempts": 1,
                     *         "cancel_requested": false,
                     *         "created_at": "2026-10-28T21:17:55.896360Z",
                     *         "created_by": "f7662b44b85844fca1b33c3ac76cbe90",
                     *         "error": null,
                     *         "finished_at": "2026-10-28T21:17:55.978574Z",
                     *         "id": "c5fdd26f94f74021af8c6cff71de4e11",
                     *         "metrics": {
                     *           "dbt_tests": null,
                     *           "duplicates_removed": 0,
                     *           "duration_seconds": 0.062,
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
                     *           "done": [],
                     *           "failed": [],
                     *           "message": "validation et enregistrement du plan",
                     *           "percent": 100,
                     *           "running": [],
                     *           "step": "validation",
                     *           "updated_at": "2026-10-28T21:17:55.974985Z"
                     *         },
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *         "result": {
                     *           "errors": 0,
                     *           "gold_plan_version": 2,
                     *           "origin": "heuristic",
                     *           "warnings": [
                     *             "commandes.frais_port n'est pas repris comme mesure : il est au niveau de commandes, le sommer au grain de lignes_commande le multiplierait"
                     *           ]
                     *         },
                     *         "started_at": "2026-10-28T21:17:55.905298Z",
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
                     *       "created_at": "2026-10-28T21:18:06.629784Z",
                     *       "created_by": "496b5b5b4ef94be98853f5f764183864",
                     *       "error": null,
                     *       "finished_at": "2026-10-28T21:18:08.113224Z",
                     *       "id": "41691f0488ea45bd8fe3cfa2b6c5ebdf",
                     *       "metrics": {
                     *         "dbt_tests": null,
                     *         "duplicates_removed": 0,
                     *         "duration_seconds": 1.465,
                     *         "exports": [
                     *           {
                     *             "format": "parquet",
                     *             "path": "2c52376ee6594da69567373ad95dcbed/exports/dim_clients.parquet",
                     *             "rows": 21,
                     *             "table": "dim_clients"
                     *           },
                     *           {
                     *             "format": "csv",
                     *             "path": "2c52376ee6594da69567373ad95dcbed/exports/dim_clients.csv",
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
                     *         "serving_path": "2c52376ee6594da69567373ad95dcbed/serving/demo_e_commerce.duckdb",
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
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "result": null,
                     *       "started_at": "2026-10-28T21:18:06.637764Z",
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
                     *       "created_at": "2026-10-28T21:17:38.696534Z",
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
                     *       "id": "2f5be4a3917f41c8a5c317465d726122",
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
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *       "created_at": "2026-10-28T21:17:57.690905Z",
                     *       "created_by": "f7662b44b85844fca1b33c3ac76cbe90",
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
                     *       "id": "b6fad3ad017649a18c1102185f11c04a",
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
                     *           "updated_at": "2026-10-28T21:17:57.640186Z",
                     *           "updated_by": "f7662b44b85844fca1b33c3ac76cbe90"
                     *         }
                     *       ],
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *       "created_at": "2026-10-28T21:17:38.696534Z",
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
                     *       "id": "2f5be4a3917f41c8a5c317465d726122",
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
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *         "created_at": "2026-10-28T21:17:57.720940Z",
                     *         "id": "090498f81e9d406bb50f3047c746537c",
                     *         "mart_request_id": null,
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *         "proposed_by": "d9d26f58279a43599f4782b39a238a67",
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
                     *       "created_at": "2026-10-28T21:17:57.859215Z",
                     *       "id": "1663be8fae084f31ae6f6c0c0811623e",
                     *       "mart_request_id": null,
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "proposed_by": "d9d26f58279a43599f4782b39a238a67",
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
                     *         "bronze_path": "2c52376ee6594da69567373ad95dcbed/bronze/clients/20261028T211722356317Z_v0001_clients.parquet",
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
                     *         "id": "b5d168336bb54909a107520298cc6d57",
                     *         "ingested_at": "2026-10-28T21:17:22.356317Z",
                     *         "latest_version_id": "9648c3f8bc3b4cb897d8c9a9d0d97a01",
                     *         "name": "clients",
                     *         "original_filename": "clients.csv",
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *         "quality_score": 100,
                     *         "row_count": 20,
                     *         "schema_drift": null,
                     *         "sheet_name": null,
                     *         "version": 1,
                     *         "warnings": []
                     *       },
                     *       {
                     *         "bronze_path": "2c52376ee6594da69567373ad95dcbed/bronze/commandes/20261028T211722940022Z_v0001_commandes.parquet",
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
                     *         "id": "6b975b6b84714cd3b366aba0bb27d625",
                     *         "ingested_at": "2026-10-28T21:17:22.940022Z",
                     *         "latest_version_id": "94afe7782e2b4ceab8a807364f20403d",
                     *         "name": "commandes",
                     *         "original_filename": "commandes.csv",
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *         "bronze_path": "2c52376ee6594da69567373ad95dcbed/bronze/catalogue/20261028T211754385196Z_v0001_catalogue.parquet",
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
                     *         "id": "4a0d20517ed948c88ac9811ef212c932",
                     *         "ingested_at": "2026-10-28T21:17:54.385196Z",
                     *         "latest_version_id": "c8730703a50c4b5f9c89141b92c75fab",
                     *         "name": "catalogue",
                     *         "original_filename": "catalogue.csv",
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *         "built_at": "2026-10-28T21:17:38.474201Z",
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
                     *         "id": "f4782d8fad1348dc9432a0ce35ebf034",
                     *         "last_run_id": "14dae6a40b3a4baea9b479406b87a1bc",
                     *         "layer": "gold",
                     *         "name": "dim_clients",
                     *         "owner_id": null,
                     *         "plan_version": 1,
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *         "publish": true,
                     *         "rejected_count": 0,
                     *         "row_count": 21,
                     *         "source_id": null
                     *       },
                     *       {
                     *         "built_at": "2026-10-28T21:17:38.550229Z",
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
                     *         "id": "eef3a349acf24013b1f4dd4e3728c189",
                     *         "last_run_id": "14dae6a40b3a4baea9b479406b87a1bc",
                     *         "layer": "gold",
                     *         "name": "dim_date",
                     *         "owner_id": null,
                     *         "plan_version": 1,
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *       "created_at": "2026-10-28T21:17:31.128773Z",
                     *       "explanation": "94 % des valeurs de commandes.id_client existent dans clients.id_client ; noms identiques ; relation N-1 : plusieurs lignes de commandes pour une ligne de clients.",
                     *       "from_column": "id_client",
                     *       "from_distinct": 16,
                     *       "from_source": "commandes",
                     *       "from_source_id": "6b975b6b84714cd3b366aba0bb27d625",
                     *       "from_table": "stg_commandes",
                     *       "id": "f34e3fcbe744417e96686934aa816078",
                     *       "inclusion_ratio": 0.9375,
                     *       "name_similarity": 1,
                     *       "origin": "detected",
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "sample_size": 16,
                     *       "status": "confirmed",
                     *       "to_column": "id_client",
                     *       "to_source": "clients",
                     *       "to_source_id": "b5d168336bb54909a107520298cc6d57",
                     *       "to_table": "stg_clients",
                     *       "type_compatible": true,
                     *       "updated_at": "2026-10-28T21:17:31.498476Z"
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
                     *       "created_at": "2026-10-28T21:17:31.128773Z",
                     *       "explanation": "94 % des valeurs de commandes.id_client existent dans clients.id_client ; noms identiques ; relation N-1 : plusieurs lignes de commandes pour une ligne de clients.",
                     *       "from_column": "id_client",
                     *       "from_distinct": 16,
                     *       "from_source": "commandes",
                     *       "from_source_id": "6b975b6b84714cd3b366aba0bb27d625",
                     *       "from_table": "stg_commandes",
                     *       "id": "f34e3fcbe744417e96686934aa816078",
                     *       "inclusion_ratio": 0.9375,
                     *       "name_similarity": 1,
                     *       "origin": "detected",
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "sample_size": 16,
                     *       "status": "confirmed",
                     *       "to_column": "id_client",
                     *       "to_source": "clients",
                     *       "to_source_id": "b5d168336bb54909a107520298cc6d57",
                     *       "to_table": "stg_clients",
                     *       "type_compatible": true,
                     *       "updated_at": "2026-10-28T21:17:55.283327Z"
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
                     *       "created_at": "2026-10-28T21:17:31.128773Z",
                     *       "explanation": "94 % des valeurs de commandes.id_client existent dans clients.id_client ; noms identiques ; relation N-1 : plusieurs lignes de commandes pour une ligne de clients.",
                     *       "from_column": "id_client",
                     *       "from_distinct": 16,
                     *       "from_source": "commandes",
                     *       "from_source_id": "6b975b6b84714cd3b366aba0bb27d625",
                     *       "from_table": "stg_commandes",
                     *       "id": "f34e3fcbe744417e96686934aa816078",
                     *       "inclusion_ratio": 0.9375,
                     *       "name_similarity": 1,
                     *       "origin": "detected",
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "sample_size": 16,
                     *       "status": "rejected",
                     *       "to_column": "id_client",
                     *       "to_source": "clients",
                     *       "to_source_id": "b5d168336bb54909a107520298cc6d57",
                     *       "to_table": "stg_clients",
                     *       "type_compatible": true,
                     *       "updated_at": "2026-10-28T21:17:55.250640Z"
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
                     *       "created_at": "2026-10-28T21:17:56.136182Z",
                     *       "created_by": "f7662b44b85844fca1b33c3ac76cbe90",
                     *       "error": null,
                     *       "finished_at": "2026-10-28T21:17:57.037689Z",
                     *       "id": "00597f8cdc59496ca53f0c8048a32a84",
                     *       "metrics": {
                     *         "dbt_tests": null,
                     *         "duplicates_removed": 0,
                     *         "duration_seconds": 0.876,
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
                     *       "progress": {
                     *         "done": [
                     *           "4a0d20517ed948c88ac9811ef212c932",
                     *           "b5d168336bb54909a107520298cc6d57"
                     *         ],
                     *         "failed": [],
                     *         "message": "profilage de produits",
                     *         "percent": 100,
                     *         "running": [],
                     *         "step": "profile",
                     *         "updated_at": "2026-10-28T21:17:57.032292Z"
                     *       },
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "result": null,
                     *       "started_at": "2026-10-28T21:17:56.151684Z",
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
                     *       "created_at": "2026-10-28T21:17:57.194181Z",
                     *       "created_by": null,
                     *       "error": "cancelled",
                     *       "finished_at": "2026-10-28T21:17:57.223516Z",
                     *       "id": "585ff27431ea4ba1867d104a039c2ec7",
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
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     * @example [22:17:56] profile started
                     *     [22:17:56] [profile] profilage de catalogue
                     *     [22:17:56] catalogue v1: quality score 100.0, 0 PII column(s)
                     *     [22:17:56] [profile] profilage de clients
                     *     [22:17:56] clients v2: quality score 100.0, 3 PII column(s)
                     *     [22:17:56] [profile] profilage de commandes
                     *     [22:17:56] commandes v1: quality score 100.0, 0 PII column(s)
                     *     [22:17:56] [profile] profilage de lignes_commande
                     *     [22:17:56…
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
    get_llm_settings_llm_get: {
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
                     *       "default_model": "qwen3.5:9b",
                     *       "editable": false,
                     *       "keys": {
                     *         "anthropic": false,
                     *         "openai": false
                     *       },
                     *       "last_check": null,
                     *       "model": "qwen3.5:9b",
                     *       "ollama_base_url": "http://localhost:11434",
                     *       "provider": "ollama",
                     *       "source": "environment"
                     *     }
                     */
                    "application/json": components["schemas"]["LLMConfigView"];
                };
            };
        };
    };
    put_llm_settings_llm_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LLMConfigUpdate"];
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
                     *       "default_model": null,
                     *       "editable": true,
                     *       "keys": {
                     *         "anthropic": false,
                     *         "openai": false
                     *       },
                     *       "last_check": null,
                     *       "model": null,
                     *       "ollama_base_url": "http://localhost:11434",
                     *       "provider": "none",
                     *       "source": "saved"
                     *     }
                     */
                    "application/json": components["schemas"]["LLMConfigView"];
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
    test_llm_settings_llm_test_post: {
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
                     *       "checked_at": "2026-10-28T21:18:06.578158Z",
                     *       "duration_ms": 0,
                     *       "message": "Aucun fournisseur : les heuristiques de Forja sont utilisées.",
                     *       "model": null,
                     *       "ok": true,
                     *       "provider": "none"
                     *     }
                     */
                    "application/json": components["schemas"]["LLMCheck"];
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
                     *       "bronze_path": "2c52376ee6594da69567373ad95dcbed/bronze/clients/20261028T211754055325Z_v0002_clients.parquet",
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
                     *       "id": "b5d168336bb54909a107520298cc6d57",
                     *       "ingested_at": "2026-10-28T21:17:54.055325Z",
                     *       "latest_version_id": "94b36dba17954298bdf915872d9ff1f9",
                     *       "name": "clients",
                     *       "original_filename": "clients.csv",
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *       "created_at": "2026-10-28T21:17:22.675380Z",
                     *       "deduplication": {
                     *         "duplicate_rows": 0,
                     *         "enabled": true,
                     *         "explanation": "Déduplication exacte : aucun doublon au profiling, une seule occurrence conservée si des doublons apparaissent."
                     *       },
                     *       "id": "59cc72cc51254a0abc2820a36622b3c8",
                     *       "model_name": "stg_clients",
                     *       "primary_key": {
                     *         "columns": [
                     *           "id_client"
                     *         ],
                     *         "explanation": "Clé primaire retenue : id_client. Une ligne plus récente de même clé remplace l'ancienne ; deux lignes d'un même lot avec la même clé sont mises en quarantaine.",
                     *         "quasi_unique": false
                     *       },
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "reviews": {},
                     *       "source_id": "b5d168336bb54909a107520298cc6d57",
                     *       "source_name": "clients",
                     *       "status": "applied",
                     *       "summary": "7 colonne(s) publiée(s) sur 7, 3 règle(s) de validité, 3 colonne(s) personnelle(s). Clé primaire retenue : id_client. Une ligne plus récente de même clé remplace l'ancienne ; deux lignes d'un même lot avec la même clé sont mises en quarantaine.",
                     *       "updated_at": "2026-10-28T21:17:30.910416Z",
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
                     *       "created_at": "2026-10-28T21:17:22.675380Z",
                     *       "deduplication": {
                     *         "duplicate_rows": 0,
                     *         "enabled": true,
                     *         "explanation": "Déduplication exacte : aucun doublon au profiling, une seule occurrence conservée si des doublons apparaissent."
                     *       },
                     *       "id": "0dcd8fa749954bc0980726828fe24fe5",
                     *       "model_name": "stg_clients",
                     *       "primary_key": {
                     *         "columns": [
                     *           "id_client"
                     *         ],
                     *         "explanation": "Clé primaire retenue : id_client. Une ligne plus récente de même clé remplace l'ancienne ; deux lignes d'un même lot avec la même clé sont mises en quarantaine.",
                     *         "quasi_unique": false
                     *       },
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "reviews": {},
                     *       "source_id": "b5d168336bb54909a107520298cc6d57",
                     *       "source_name": "clients",
                     *       "status": "draft",
                     *       "summary": "7 colonne(s) publiée(s) sur 7, 3 règle(s) de validité, 3 colonne(s) personnelle(s). Clé primaire retenue : id_client. Une ligne plus récente de même clé remplace l'ancienne ; deux lignes d'un même lot avec la même clé sont mises en quarantaine.",
                     *       "updated_at": "2026-10-28T21:17:54.881173Z",
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
                     *       "created_at": "2026-10-28T21:17:22.675380Z",
                     *       "deduplication": {
                     *         "duplicate_rows": 0,
                     *         "enabled": true,
                     *         "explanation": "Déduplication exacte : aucun doublon au profiling, une seule occurrence conservée si des doublons apparaissent."
                     *       },
                     *       "id": "0dcd8fa749954bc0980726828fe24fe5",
                     *       "model_name": "stg_clients",
                     *       "primary_key": {
                     *         "columns": [
                     *           "id_client"
                     *         ],
                     *         "explanation": "Clé primaire retenue : id_client. Une ligne plus récente de même clé remplace l'ancienne ; deux lignes d'un même lot avec la même clé sont mises en quarantaine.",
                     *         "quasi_unique": false
                     *       },
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "reviews": {
                     *         "cast:date_inscription": "validated",
                     *         "deduplicate": "validated",
                     *         "format:email:email_format": "validated",
                     *         "normalize:collapse_whitespace": "validated",
                     *         "normalize:lowercase": "validated",
                     *         "pii:email": "validated",
                     *         "pii:nom": "validated",
                     *         "pii:prénom": "validated",
                     *         "primary_key": "validated"
                     *       },
                     *       "source_id": "b5d168336bb54909a107520298cc6d57",
                     *       "source_name": "clients",
                     *       "status": "approved",
                     *       "summary": "7 colonne(s) publiée(s) sur 7, 3 règle(s) de validité, 3 colonne(s) personnelle(s). Clé primaire retenue : id_client. Une ligne plus récente de même clé remplace l'ancienne ; deux lignes d'un même lot avec la même clé sont mises en quarantaine.",
                     *       "updated_at": "2026-10-28T21:17:55.071659Z",
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
    get_plan_review_sources__source_id__plan_review_get: {
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
                     *       "pending": 9,
                     *       "plan_version": 2,
                     *       "rejected": 0,
                     *       "rules": [
                     *         {
                     *           "affected": 0,
                     *           "columns": [
                     *             "date_inscription"
                     *           ],
                     *           "confidence": "high",
                     *           "decision": null,
                     *           "explanation": "Conversion en date au format JJ/MM/AAAA, aucune valeur invalide détectée.",
                     *           "id": "cast:date_inscription",
                     *           "kind": "cast",
                     *           "rejectable": true,
                     *           "title": "Convertir en date (JJ/MM/AAAA)"
                     *         },
                     *         {
                     *           "affected": null,
                     *           "columns": [
                     *             "id_client",
                     *             "nom"
                     *           ],
                     *           "confidence": "high",
                     *           "decision": null,
                     *           "explanation": "Espaces en début et en fin retirés, espaces multiples ramenés à un seul.",
                     *           "id": "normalize:collapse_whitespace",
                     *           "kind": "normalize",
                     *           "rejectable": true,
                     *           "title": "Supprimer les espaces superflus"
                     *         }
                     *       ],
                     *       "source_id": "b5d168336bb54909a107520298cc6d57",
                     *       "status": "draft",
                     *       "validated": 0
                     *     }
                     */
                    "application/json": components["schemas"]["PlanReview"];
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
    review_plan_sources__source_id__plan_review_post: {
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
                "application/json": components["schemas"]["ReviewUpdate"];
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
                     *       "pending": 0,
                     *       "plan_version": 2,
                     *       "rejected": 0,
                     *       "rules": [
                     *         {
                     *           "affected": 0,
                     *           "columns": [
                     *             "date_inscription"
                     *           ],
                     *           "confidence": "high",
                     *           "decision": "validated",
                     *           "explanation": "Conversion en date au format JJ/MM/AAAA, aucune valeur invalide détectée.",
                     *           "id": "cast:date_inscription",
                     *           "kind": "cast",
                     *           "rejectable": true,
                     *           "title": "Convertir en date (JJ/MM/AAAA)"
                     *         },
                     *         {
                     *           "affected": null,
                     *           "columns": [
                     *             "id_client",
                     *             "nom"
                     *           ],
                     *           "confidence": "high",
                     *           "decision": "validated",
                     *           "explanation": "Espaces en début et en fin retirés, espaces multiples ramenés à un seul.",
                     *           "id": "normalize:collapse_whitespace",
                     *           "kind": "normalize",
                     *           "rejectable": true,
                     *           "title": "Supprimer les espaces superflus"
                     *         }
                     *       ],
                     *       "source_id": "b5d168336bb54909a107520298cc6d57",
                     *       "status": "draft",
                     *       "validated": 9
                     *     }
                     */
                    "application/json": components["schemas"]["PlanReview"];
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
    get_plan_samples_sources__source_id__plan_samples_get: {
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
                     *       "columns": [
                     *         {
                     *           "column": "id_client",
                     *           "personal": false,
                     *           "target_column": "id_client",
                     *           "treatment": "none",
                     *           "values": [
                     *             {
                     *               "after": "CLI-0001",
                     *               "before": "CLI-0001",
                     *               "count": 1,
                     *               "invalid": false
                     *             },
                     *             {
                     *               "after": "CLI-0002",
                     *               "before": "CLI-0002",
                     *               "count": 1,
                     *               "invalid": false
                     *             }
                     *           ]
                     *         },
                     *         {
                     *           "column": "nom",
                     *           "personal": true,
                     *           "target_column": "nom",
                     *           "treatment": "hash",
                     *           "values": [
                     *             {
                     *               "after": "f1f78f6cb8bb1adde69a5c2eb7d08156d95921b2c1145d8d380cad72b989331b",
                     *               "before": "A***",
                     *               "count": 1,
                     *               "invalid": false
                     *             },
                     *             {
                     *               "after": "98457ed0c8394d3e4b2ae48292b5d79a9f519726994d851a6c62b34505405367",
                     *               "before": "B***",
                     *               "count": 1,
                     *               "invalid": false
                     *             }
                     *           ]
                     *         }
                     *       ],
                     *       "plan_version": 2,
                     *       "sample_rows": 21,
                     *       "source_id": "b5d168336bb54909a107520298cc6d57"
                     *     }
                     */
                    "application/json": components["schemas"]["PlanSamples"];
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
                     *         "created_at": "2026-10-28T21:17:22.675380Z",
                     *         "deduplication": {
                     *           "duplicate_rows": 0,
                     *           "enabled": true,
                     *           "explanation": "Déduplication exacte : aucun doublon au profiling, une seule occurrence conservée si des doublons apparaissent."
                     *         },
                     *         "id": "59cc72cc51254a0abc2820a36622b3c8",
                     *         "model_name": "stg_clients",
                     *         "primary_key": {
                     *           "columns": [
                     *             "id_client"
                     *           ],
                     *           "explanation": "Clé primaire retenue : id_client. Une ligne plus récente de même clé remplace l'ancienne ; deux lignes d'un même lot avec la même clé sont mises en quarantaine.",
                     *           "quasi_unique": false
                     *         },
                     *         "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *         "reviews": {},
                     *         "source_id": "b5d168336bb54909a107520298cc6d57",
                     *         "source_name": "clients",
                     *         "status": "applied",
                     *         "summary": "7 colonne(s) publiée(s) sur 7, 3 règle(s) de validité, 3 colonne(s) personnelle(s). Clé primaire retenue : id_client. Une ligne plus récente de même clé remplace l'ancienne ; deux lignes d'un même lot avec la même clé sont mises en quarantaine.",
                     *         "updated_at": "2026-10-28T21:17:30.910416Z",
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
                     *           "_batch_id": "94b36dba17954298bdf915872d9ff1f9",
                     *           "_ingested_at": "2026-10-28T22:17:54.055325+01:00",
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
                     *           "_batch_id": "94b36dba17954298bdf915872d9ff1f9",
                     *           "_ingested_at": "2026-10-28T22:17:54.055325+01:00",
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
                     *       "source_id": "b5d168336bb54909a107520298cc6d57",
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
                     *       "profiled_at": "2026-10-28T21:17:54.312965Z",
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
                     *       "source_id": "b5d168336bb54909a107520298cc6d57",
                     *       "source_name": "clients",
                     *       "version": 2,
                     *       "version_id": "94b36dba17954298bdf915872d9ff1f9"
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
    get_rejects_sources__source_id__rejects_get: {
        parameters: {
            query?: {
                limit?: number;
                /** @description Only the rows of this run */
                run_id?: string | null;
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
                     *       "reasons": [],
                     *       "rows": [],
                     *       "runs": [],
                     *       "source_id": "b5d168336bb54909a107520298cc6d57",
                     *       "table": "stg_clients__rejects",
                     *       "total_rows": 0
                     *     }
                     */
                    "application/json": components["schemas"]["Quarantine"];
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
                     *         "bronze_path": "2c52376ee6594da69567373ad95dcbed/bronze/clients/20261028T211722356317Z_v0001_clients.parquet",
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
                     *         "id": "9648c3f8bc3b4cb897d8c9a9d0d97a01",
                     *         "ingested_at": "2026-10-28T21:17:22.356317Z",
                     *         "new_row_count": 20,
                     *         "original_filename": "clients.csv",
                     *         "row_count": 20,
                     *         "schema_drift": null,
                     *         "sheet_name": null,
                     *         "source_id": "b5d168336bb54909a107520298cc6d57",
                     *         "version": 1,
                     *         "warnings": []
                     *       },
                     *       {
                     *         "bronze_path": "2c52376ee6594da69567373ad95dcbed/bronze/clients/20261028T211754055325Z_v0002_clients.parquet",
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
                     *         "id": "94b36dba17954298bdf915872d9ff1f9",
                     *         "ingested_at": "2026-10-28T21:17:54.055325Z",
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
                     *         "source_id": "b5d168336bb54909a107520298cc6d57",
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
                     *       "bronze_path": "2c52376ee6594da69567373ad95dcbed/bronze/clients/20261028T211754055325Z_v0002_clients.parquet",
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
                     *       "id": "b5d168336bb54909a107520298cc6d57",
                     *       "ingested_at": "2026-10-28T21:17:54.055325Z",
                     *       "latest_version_id": "94b36dba17954298bdf915872d9ff1f9",
                     *       "name": "clients",
                     *       "original_filename": "clients.csv",
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *       "created_at": "2026-10-28T21:17:57.720940Z",
                     *       "id": "090498f81e9d406bb50f3047c746537c",
                     *       "mart_request_id": null,
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "proposed_by": "d9d26f58279a43599f4782b39a238a67",
                     *       "reviewed_at": "2026-10-28T21:17:57.767043Z",
                     *       "reviewed_by": "f7662b44b85844fca1b33c3ac76cbe90",
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
                     *       "created_at": "2026-10-28T21:17:57.859215Z",
                     *       "id": "1663be8fae084f31ae6f6c0c0811623e",
                     *       "mart_request_id": null,
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
                     *       "proposed_by": "d9d26f58279a43599f4782b39a238a67",
                     *       "reviewed_at": "2026-10-28T21:17:57.894683Z",
                     *       "reviewed_by": "f7662b44b85844fca1b33c3ac76cbe90",
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
                     *       "built_at": "2026-10-28T21:17:38.510305Z",
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
                     *       "id": "7a85f7c70cdb4ac3acd224e48e3f1bb5",
                     *       "last_run_id": "14dae6a40b3a4baea9b479406b87a1bc",
                     *       "layer": "gold",
                     *       "name": "fct_ventes",
                     *       "owner_id": null,
                     *       "plan_version": 1,
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *       "built_at": "2026-10-28T21:17:38.510305Z",
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
                     *       "id": "7a85f7c70cdb4ac3acd224e48e3f1bb5",
                     *       "last_run_id": "14dae6a40b3a4baea9b479406b87a1bc",
                     *       "layer": "gold",
                     *       "name": "fct_ventes",
                     *       "owner_id": null,
                     *       "plan_version": 1,
                     *       "project_id": "2c52376ee6594da69567373ad95dcbed",
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
                     *           "client_key": "e783cc7f8982f5f117db654b00cc1b30",
                     *           "date_commande_key": 20240821,
                     *           "id_commande": "CMD-00005",
                     *           "montant": 25.5,
                     *           "nb_lignes": 1,
                     *           "num_ligne": 1,
                     *           "prix_unitaire": 8.5,
                     *           "produit_key": "a41c13b1cc22dfccdf989dec46e608a0",
                     *           "quantite": 3,
                     *           "statut": "livrée"
                     *         },
                     *         {
                     *           "client_key": "8a59c9c7da61e48e446b1a9aac5f57df",
                     *           "date_commande_key": 20240708,
                     *           "id_commande": "CMD-00011",
                     *           "montant": 93.6,
                     *           "nb_lignes": 1,
                     *           "num_ligne": 1,
                     *           "prix_unitaire": 31.2,
                     *           "produit_key": "c6f3e187973412a02acd87c496f65d6c",
                     *           "quantite": 3,
                     *           "statut": "livrée"
                     *         }
                     *       ],
                     *       "table_id": "7a85f7c70cdb4ac3acd224e48e3f1bb5",
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
