# Sécurité : authentification, rôles et audit

## Modes

| `FORJA_AUTH_MODE` | Usage | Comptes |
|---|---|---|
| `local` (défaut) | Poste individuel | Un administrateur créé au premier démarrage. Pas d'invitation. |
| `multi` | Instance partagée | L'administrateur crée les projets et invite des utilisateurs par email, avec un rôle par projet. |

**Premier démarrage.** Quand le catalogue ne contient aucun utilisateur, Forja crée
l'administrateur de l'instance (`FORJA_AUTH_BOOTSTRAP_EMAIL`, `admin@forja.local` par
défaut) avec un mot de passe aléatoire écrit **une seule fois** dans les logs
(événement `bootstrap_admin_created`). Pour un déploiement automatisé, fixez
`FORJA_AUTH_BOOTSTRAP_PASSWORD` : il n'est alors pas journalisé. Dans les deux cas, le
changement de mot de passe est obligatoire : tant qu'il n'est pas fait, toute route
répond `403 password_change_required`, sauf `POST /auth/password`, `GET /auth/me` et
`POST /auth/logout`.

```bash
curl -X POST localhost:8000/auth/login -H "Content-Type: application/json" \
     -d '{"email": "admin@forja.local", "password": "<mot de passe des logs>"}'
curl -X POST localhost:8000/auth/password -H "Authorization: Bearer <access_token>" \
     -H "Content-Type: application/json" \
     -d '{"current_password": "<mot de passe des logs>", "new_password": "<nouveau>"}'
```

Politique de mot de passe : au moins `FORJA_AUTH_PASSWORD_MIN_LENGTH` caractères (12),
5 caractères différents, différent de l'email.

## Jetons et clés

- **Mots de passe** : hachés avec argon2 (argon2-cffi, paramètres par défaut, ré-hachés
  si les paramètres évoluent). Un email inconnu coûte la même vérification qu'un
  mauvais mot de passe.
- **Jeton d'accès** : JWT HS256 de `FORJA_AUTH_ACCESS_TOKEN_MINUTES` (15 min), lié à une
  session (`sid`). La clé de signature est `FORJA_AUTH_SECRET`, ou une clé aléatoire
  générée une fois dans `FORJA_SECRETS_DIR/jwt.key`.
- **Jeton de rafraîchissement** : opaque, à usage unique, valable
  `FORJA_AUTH_REFRESH_TOKEN_DAYS` (14 j). `POST /auth/refresh` renvoie une nouvelle paire
  (rotation). Présenter un jeton déjà utilisé révoque toute la session : un jeton volé
  et rejoué ne sert qu'une fois, et coupe aussi le voleur.
- **Révocation** : `POST /auth/logout` révoque la session ; un changement de mot de passe
  révoque toutes les sessions de l'utilisateur. Les jetons d'accès d'une session
  révoquée sont refusés immédiatement (la session est vérifiée à chaque requête).
- **Clés API personnelles** : `fja_<préfixe>_<secret>`, créées par `POST /auth/api-keys`
  (affichées une fois), envoyées en `X-API-Key` ou `Authorization: Bearer`, révocables
  (`DELETE /auth/api-keys/{id}`). Seuls le préfixe (pour les reconnaître) et une
  empreinte SHA-256 sont stockés. Une clé agit avec les rôles de son propriétaire.
- Refresh tokens et jetons d'invitation sont aussi stockés en empreinte SHA-256 : le
  catalogue ne contient aucun secret réutilisable.

## Limitation des tentatives

Chaque échec de connexion est compté sous deux clés : le compte (l'email saisi, qu'il
existe ou non) et l'adresse IP ; chaque refresh token ou jeton d'invitation invalide,
sous l'IP. Fenêtre glissante de `FORJA_AUTH_THROTTLE_WINDOW_SECONDS` (900 s) :

| Clé | Échecs avant verrouillage |
|---|---|
| `login:account:<email>` | `FORJA_AUTH_THROTTLE_ACCOUNT_MAX` (5) |
| `login:ip:<ip>`, `refresh:ip:<ip>`, `register:ip:<ip>` | `FORJA_AUTH_THROTTLE_IP_MAX` (20) |

- Le premier verrouillage dure `FORJA_AUTH_THROTTLE_LOCKOUT_SECONDS` (60 s), chaque
  suivant deux fois plus, jusqu'à `FORJA_AUTH_THROTTLE_MAX_LOCKOUT_SECONDS` (3 600 s).
  Une connexion réussie remet le compteur du compte à zéro.
- Pendant un verrouillage, la tentative est refusée **avant** toute vérification :
  `429 too_many_attempts`, en-tête `Retry-After`. La réponse est identique pour un compte
  existant ou non, comme le `401` des échecs ordinaires.
- Audit : `auth.login_failed`, `auth.refresh_failed`, `auth.register_failed` à chaque
  échec ; `auth.throttled` au verrouillage (clé compte ou IP) ;
  `auth.login_blocked`, `auth.refresh_blocked`, `auth.register_blocked` pour chaque
  tentative refusée.
- Derrière un proxy de confiance, `FORJA_AUTH_TRUST_FORWARDED_FOR=true` prend l'IP dans
  `X-Forwarded-For` ; sinon l'en-tête est ignoré (un client pourrait le falsifier).
- `FORJA_AUTH_THROTTLE_ENABLED=false` désactive la limitation (déconseillé).

## Navigateur (CORS)

Le front appelle l'API depuis une autre origine : `FORJA_CORS_ORIGINS` (JSON, par défaut
`["http://localhost:3000"]`) liste les origines autorisées. Les jetons voyagent dans
l'en-tête `Authorization` : aucun cookie, donc pas de `credentials`. En-têtes exposés :
`X-Request-ID`, `Retry-After`, `Content-Disposition`.

## Interface web

Le navigateur ne manipule jamais les jetons. L'application Next.js (`apps/web`) sert de
proxy : ses route handlers appellent l'API côté serveur (`FORJA_API_URL`).

- **Cookies** : jeton d'accès (`forja_at`, expire 30 s avant le jeton) et de
  rafraîchissement (`forja_rt`) en cookies `HttpOnly`, `SameSite=Lax`, `Secure` en
  production, limités au chemin `/api`. Sans « Rester connecté », le cookie de
  rafraîchissement disparaît à la fermeture du navigateur. Un marqueur sans secret
  (`forja_session`) sert seulement à aiguiller les pages ; l'API reste l'autorité.
- **Rafraîchissement** : quand le jeton d'accès a expiré (ou sur un 401), le proxy
  échange le refresh token (rotation) et rejoue la requête si son corps le permet. Des
  requêtes simultanées partagent un seul échange pendant 30 s : sans cela, l'API
  prendrait la deuxième présentation du même jeton pour un vol et révoquerait la
  session. Ce partage est en mémoire : un seul processus web, ou des sessions collantes.
  Un refresh refusé (réutilisation détectée, session révoquée) efface les cookies et
  renvoie à la connexion.
- **CSRF** : toute mutation (`POST`, `PUT`, `PATCH`, `DELETE`) exige une origine
  identique (`Origin`, ou `Referer`, ou `Sec-Fetch-Site: same-origin`) et l'en-tête
  `X-CSRF-Token` égal au cookie `forja_csrf` (double soumission, comparaison à temps
  constant). Le jeton est renouvelé à chaque connexion.
- **Routes** : `/api/auth/login`, `/api/auth/password`, `/api/auth/logout`,
  `/api/auth/session` ; `/api/forja/*` relaie le reste de l'API mais refuse les routes
  de jetons (`/auth/login`, `/auth/refresh`, ...) et les chemins en `..`.
- **Mot de passe initial** : tant qu'il n'est pas remplacé, toute page renvoie vers
  « Nouveau mot de passe » (et l'API répond `403 password_change_required`).
- **Limitation des tentatives** : le proxy transmet `X-Forwarded-For` ; lancez l'API
  avec `FORJA_AUTH_TRUST_FORWARDED_FOR=true` et ne l'exposez qu'au serveur web, sinon
  tous les navigateurs partagent l'adresse du serveur web pour la limite par IP.
  Derrière un reverse proxy, c'est lui qui doit fixer cet en-tête ; si le serveur web
  est exposé directement, un client peut le falsifier et contourner la limite par IP
  (la limite par compte reste appliquée).
- **En-têtes** : `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy` sur toutes les pages.

## Invitations (mode multi)

`POST /projects/{id}/invitations` (`{"email", "role"}`) :

- si l'email a déjà un compte, l'utilisateur est ajouté au projet avec ce rôle ;
- sinon un jeton d'inscription à usage unique est renvoyé (une fois), valable
  `FORJA_AUTH_INVITATION_DAYS` jours ; la personne crée son compte avec
  `POST /auth/register` (`{"token", "password", "name"}`).

L'interface envoie un lien `/auth/invite/<jeton>`. Avant l'inscription, la page lit
l'invitation par `POST /auth/invitations/lookup` (`{"token"}`, sans session) : le jeton
passe dans le corps, jamais dans une URL d'API que les journaux garderaient. La réponse
ne donne l'e-mail et le rôle que pour une invitation valide ; sinon seulement son état
(`expired`, `revoked`, `used`, `unknown`). Un jeton inconnu compte comme une tentative
échouée de `register:ip:<ip>`, comme à l'inscription. Une invitation révoquée est
conservée comme telle (`revoked_at`) pour que son lien le dise ; elle ne figure plus parmi
les invitations en attente.

Les rôles se gèrent ensuite par `PUT` / `DELETE /projects/{id}/members/{user_id}`.

## Rôles

| Rôle | Pour qui | En bref |
|---|---|---|
| `admin` | Responsable du projet | Tout, y compris les membres, l'audit et l'aperçu Bronze |
| `engineer` | Data engineer | Sources, plans Silver, relations, plan Gold, runs, publication, couche sémantique, approbations |
| `analyst` | Équipe métier | Lecture du Gold (pseudonymisé), agent métier, ses propres data marts, propositions de synonymes |

L'administrateur de l'instance (créé au premier démarrage) est `admin` de tous les
projets et seul à pouvoir créer un projet (il en devient membre `admin`).

### Matrice rôles × actions

Chaque route déclare l'action qu'elle effectue ; le projet est déduit du chemin
(projet, source, relation, table, run, demande de data mart, proposition de
synonyme). Un utilisateur sans rôle dans le projet reçoit `403`. Ce tableau est
vérifié par `tests/test_permissions.py` contre `forja_core.auth.models.ROLE_ACTIONS`.

| Action | Description | admin | engineer | analyst |
|---|---|:-:|:-:|:-:|
| `project.read` | Voir le projet | ✓ | ✓ | ✓ |
| `project.manage` | Gérer les membres et les invitations | ✓ | — | — |
| `audit.read` | Lire le journal d'audit | ✓ | — | — |
| `source.read` | Voir les sources, versions et profils | ✓ | ✓ | — |
| `source.write` | Charger un fichier (nouvelle source ou version) | ✓ | ✓ | — |
| `bronze.preview` | Aperçu Bronze en clair (si FORJA_ALLOW_BRONZE_PREVIEW) | ✓ | — | — |
| `silver.read` | Voir les plans Silver et les tables Silver | ✓ | ✓ | — |
| `plan.write` | Modifier et approuver un plan Silver | ✓ | ✓ | — |
| `relation.read` | Voir les relations | ✓ | ✓ | — |
| `relation.write` | Détecter, déclarer, confirmer, rejeter une relation | ✓ | ✓ | — |
| `gold_plan.read` | Voir le plan Gold | ✓ | ✓ | — |
| `gold_plan.write` | Proposer, modifier, approuver le plan Gold | ✓ | ✓ | — |
| `run.read` | Voir tous les runs et leurs logs | ✓ | ✓ | — |
| `run.write` | Lancer ou annuler un run (builds, exports) | ✓ | ✓ | — |
| `gold.read` | Lire, prévisualiser, exporter les tables Gold | ✓ | ✓ | ✓ |
| `table.publish` | Publier ou retirer une table du serving | ✓ | ✓ | — |
| `data.unmasked` | Voir les données selon le plan (sinon pseudonymisation forcée) | ✓ | ✓ | — |
| `semantic.read` | Lire la couche sémantique | ✓ | ✓ | ✓ |
| `semantic.write` | Éditer et régénérer la couche sémantique | ✓ | ✓ | — |
| `synonym.propose` | Proposer un synonyme | ✓ | ✓ | ✓ |
| `synonym.review` | Valider ou refuser un synonyme proposé | ✓ | ✓ | — |
| `mart.request` | Interroger l'agent, gérer ses propres data marts | ✓ | ✓ | ✓ |
| `mart.read_all` | Voir les data marts de tous les utilisateurs | ✓ | ✓ | — |
| `mart.approve` | Approuver ou rejeter un data mart | ✓ | ✓ | — |

Règles complémentaires :

- **Tables** : une table Silver demande `silver.read`, une table Gold `gold.read`, un
  data mart appartient à son auteur (ou `mart.read_all`). `GET /projects/{id}/tables`
  ne liste que ce que l'appelant peut lire.
- **Runs** : sans `run.read`, un utilisateur ne voit (et n'annule) que les runs qu'il a
  lancés, c'est-à-dire ses demandes à l'agent.
- **Demandes de data mart** : répondre, affiner, valider ne sont permis qu'à l'auteur ;
  rejeter, à l'auteur ou à un engineer.
- **Bronze** : `GET /sources/{id}/preview` reste désactivé tant que
  `FORJA_ALLOW_BRONZE_PREVIEW` n'est pas activé, même pour un admin.

## Données personnelles

- Sans `data.unmasked` (rôle analyst), **toute colonne détectée comme personnelle est
  pseudonymisée** (HMAC-SHA256 du projet) dans les aperçus, les exports et les
  échantillons de l'agent, même si le plan Silver la laisse en clair (`none`) ; les
  traitements `mask` et `drop` du plan s'appliquent tels quels.
- Les data marts publiés pseudonymisent toujours leurs colonnes personnelles : ils sont
  partagés entre analysts.
- L'agent refuse de filtrer sur la valeur d'une donnée personnelle (un filtre
  `email = …` permettrait de tester l'existence d'une personne).
- Aucun modèle de langage ne reçoit de valeur de données : le plan Gold reçoit schémas et
  statistiques, l'agent reçoit la demande et les noms métier de la couche sémantique.
  Les valeurs de filtre (« Lyon ») sont résolues localement.

## Journal d'audit

Table `audit_log` du catalogue : qui (`user_id`, `user_email`), quoi (`action`), quand,
sur quel objet (`project_id`, `object_type`, `object_id`) et des détails sans donnée
personnelle de contenu.

| Domaine | Actions journalisées |
|---|---|
| Comptes | `user.bootstrap`, `auth.login`, `auth.login_failed`, `auth.logout`, `auth.password_changed`, `auth.refresh_reuse`, `api_key.create`, `api_key.revoke` |
| Membres | `project.create`, `member.invite`, `member.register`, `member.role`, `member.remove` |
| Données | `source.upload`, `source.bronze_preview`, `silver_plan.edit`, `silver_plan.approve`, `relation.declare`, `relation.confirm`, `relation.reject` |
| Gold | `gold_plan.propose`, `gold_plan.edit`, `gold_plan.approve`, `run.<type>`, `run.cancel` |
| Publication | `table.publish`, `table.unpublish`, `table.export` (format, lignes, pseudonymisation) |
| Sémantique | `semantic.regenerate`, `semantic.edit`, `synonym.propose`, `synonym.accept`, `synonym.reject` |
| Agent | `agent.request` (question), `agent.answer`, `agent.refine`, `mart.validate`, `mart.approve`, `mart.reject`, `mart.publish` |

Lecture : `GET /projects/{id}/audit` (admin du projet), `GET /audit` (administrateur de
l'instance), filtres `action` et `limit`.

## Fournisseur d'identité externe (OIDC)

Non implémenté, interface prête : `forja_core.auth.identity.IdentityProvider`
(`authorization_url`, `authenticate`) et `OIDCIdentityProvider` (issuer, client,
scopes). Un fournisseur OIDC authentifiera la personne (flux code + PKCE, validation de
l'ID token), puis Forja retrouvera ou créera l'utilisateur par
`identity_provider` / `external_subject` (colonnes déjà présentes dans `users`) et
émettra ses propres jetons comme après un login par mot de passe. Les rôles restent
gérés dans Forja.

## Limites connues

- La limitation des tentatives est stockée dans le catalogue de l'instance : plusieurs
  instances derrière un répartiteur ne partagent pas leurs compteurs.
- Pas d'envoi d'email : le jeton d'invitation est renvoyé à l'admin, qui le transmet.
  Une invitation non acceptée se révoque (`DELETE /projects/{id}/invitations/{id}`) :
  son jeton cesse de fonctionner.
- Garder `FORJA_API_HOST=127.0.0.1` ou un proxy HTTPS : les jetons circulent en clair sur
  HTTP.

## Fournisseur IA choisi depuis l'interface

L'administrateur de l'instance choisit le fournisseur (Ollama, Anthropic, OpenAI ou
aucun), le modèle et la clé API dans *Réglages du projet* (`PUT /settings/llm`). Le choix
est écrit dans `FORJA_SECRETS_DIR/llm.json`, hors du dépôt et du dossier de données, avec
des droits réservés à l'utilisateur courant (0600), et prime sur les variables
`FORJA_LLM_*`. Une clé n'est jamais renvoyée par l'API ni écrite au journal d'audit :
`GET /settings/llm` indique seulement si elle est enregistrée. « Tester la connexion »
(`POST /settings/llm/test`) consulte le modèle chez le fournisseur sans envoyer de donnée.

## Revue des plans et quarantaine

L'aperçu avant et après d'une règle (`GET /sources/{id}/plan/samples`) lit un échantillon
du Bronze brut : les colonnes personnelles y sont masquées pour un engineer et
pseudonymisées pour les autres rôles ; elles ne sont en clair qu'avec
`FORJA_ALLOW_BRONZE_PREVIEW=true` et le droit `bronze.preview`. Les lignes en quarantaine
(`GET /sources/{id}/rejects`) gardent leurs valeurs brutes et sont lues comme un export :
traitement du plan, ou pseudonymisation stricte sans `data.unmasked`.
