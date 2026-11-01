# Security: authentication, roles and audit

*Français : [security.md](../security.md) · Reporting a vulnerability:
[SECURITY.md](../../SECURITY.md)*

## Modes

| `FORJA_AUTH_MODE` | Use | Accounts |
|---|---|---|
| `local` (default) | A single workstation | One administrator created at first start. No invitation. |
| `multi` | A shared instance | The administrator creates projects and invites users by email, with one role per project. |

**First start.** When the catalog holds no user, Forja creates the instance
administrator (`FORJA_AUTH_BOOTSTRAP_EMAIL`, `admin@forja.local` by default) with a
random password shown **once** (by `forja init`, or in the logs as
`bootstrap_admin_created`). For an automated deployment, set
`FORJA_AUTH_BOOTSTRAP_PASSWORD`: it is then not logged. Either way the password must be
changed: until it is, every route answers `403 password_change_required`, except
`POST /auth/password`, `GET /auth/me` and `POST /auth/logout`.

```bash
curl -X POST localhost:8000/auth/login -H "Content-Type: application/json" \
     -d '{"email": "admin@forja.local", "password": "<password from the logs>"}'
curl -X POST localhost:8000/auth/password -H "Authorization: Bearer <access_token>" \
     -H "Content-Type: application/json" \
     -d '{"current_password": "<password from the logs>", "new_password": "<new>"}'
```

Password policy: at least `FORJA_AUTH_PASSWORD_MIN_LENGTH` characters (12), 5
different characters, different from the email.

## Tokens and keys

- **Passwords**: hashed with argon2 (argon2-cffi, default parameters, rehashed when
  they change). An unknown email costs the same verification as a wrong password.
- **Access token**: HS256 JWT of `FORJA_AUTH_ACCESS_TOKEN_MINUTES` (15 min), bound to a
  session (`sid`). The signing key is `FORJA_AUTH_SECRET`, or a random key generated once
  in `FORJA_SECRETS_DIR/jwt.key`.
- **Refresh token**: opaque, single use, valid `FORJA_AUTH_REFRESH_TOKEN_DAYS` (14 d).
  `POST /auth/refresh` returns a new pair (rotation). Presenting a token already used
  revokes the whole session: a stolen and replayed token works once, and cuts the thief
  off too.
- **Revocation**: `POST /auth/logout` revokes the session; a password change revokes
  every session of the user. Access tokens of a revoked session are refused at once
  (the session is checked on every request).
- **Personal API keys**: `fja_<prefix>_<secret>`, created by `POST /auth/api-keys`
  (shown once), sent as `X-API-Key` or `Authorization: Bearer`, revocable
  (`DELETE /auth/api-keys/{id}`). Only the prefix (to recognise them) and a SHA-256
  digest are stored. A key acts with the roles of its owner.
- Refresh tokens and invitation tokens are also stored as SHA-256 digests: the catalog
  holds no reusable secret.

## Throttling

Each failed sign-in is counted under two keys: the account (the email typed, whether it
exists or not) and the IP address; each invalid refresh token or invitation token under
the IP. Sliding window of `FORJA_AUTH_THROTTLE_WINDOW_SECONDS` (900 s):

| Key | Failures before lockout |
|---|---|
| `login:account:<email>` | `FORJA_AUTH_THROTTLE_ACCOUNT_MAX` (5) |
| `login:ip:<ip>`, `refresh:ip:<ip>`, `register:ip:<ip>` | `FORJA_AUTH_THROTTLE_IP_MAX` (20) |

- The first lockout lasts `FORJA_AUTH_THROTTLE_LOCKOUT_SECONDS` (60 s), each next one
  twice as long, up to `FORJA_AUTH_THROTTLE_MAX_LOCKOUT_SECONDS` (3,600 s). A successful
  sign-in resets the account's counter.
- During a lockout the attempt is refused **before** any check: `429
  too_many_attempts`, with a `Retry-After` header. The answer is the same for an
  existing account or not, like the `401` of ordinary failures.
- Audit: `auth.login_failed`, `auth.refresh_failed`, `auth.register_failed` on each
  failure; `auth.throttled` at lockout (account or IP key); `auth.login_blocked`,
  `auth.refresh_blocked`, `auth.register_blocked` for each refused attempt.
- Behind a trusted proxy, `FORJA_AUTH_TRUST_FORWARDED_FOR=true` takes the IP from
  `X-Forwarded-For`; otherwise the header is ignored (a client could forge it).
- `FORJA_AUTH_THROTTLE_ENABLED=false` turns throttling off (not recommended).

## Browser (CORS)

A client calling the API directly from another origin is allowed by
`FORJA_CORS_ORIGINS` (JSON, `["http://localhost:3000"]` by default). Tokens travel in
the `Authorization` header: no cookie, hence no `credentials`. Exposed headers:
`X-Request-ID`, `Retry-After`, `Content-Disposition`.

## Web interface

The browser never handles tokens. The Next.js application (`apps/web`) is a proxy: its
route handlers call the API on the server side (`FORJA_API_URL`).

- **Cookies**: access token (`forja_at`, expiring 30 s before the token) and refresh
  token (`forja_rt`) in `HttpOnly`, `SameSite=Lax` cookies, `Secure` in production,
  limited to the `/api` path. Without « Rester connecté » (stay signed in), the refresh
  cookie goes away when the browser closes. A marker without secret (`forja_session`)
  only routes the pages; the API stays the authority.
- **Refresh**: when the access token has expired (or on a 401), the proxy exchanges
  the refresh token (rotation) and replays the request if its body allows it.
  Simultaneous requests share one exchange for 30 s: otherwise the API would take the
  second presentation of the same token for a theft and revoke the session. This sharing
  is in memory: one web process, or sticky sessions. A refused refresh (reuse detected,
  session revoked) clears the cookies and goes back to the sign-in page.
- **CSRF**: every mutation (`POST`, `PUT`, `PATCH`, `DELETE`) requires the same origin
  (`Origin`, or `Referer`, or `Sec-Fetch-Site: same-origin`) and an `X-CSRF-Token`
  header equal to the `forja_csrf` cookie (double submit, constant-time comparison).
  The token is renewed at each sign-in.
- **Routes**: `/api/auth/login`, `/api/auth/password`, `/api/auth/logout`,
  `/api/auth/session`; `/api/forja/*` relays the rest of the API but refuses the token
  routes (`/auth/login`, `/auth/refresh`, ...) and paths with `..`.
- **Initial password**: until it is replaced, every page leads to « Nouveau mot de
  passe » (new password), and the API answers `403 password_change_required`.
- **Throttling**: the proxy forwards `X-Forwarded-For`; run the API with
  `FORJA_AUTH_TRUST_FORWARDED_FOR=true` and expose it to the web server only, otherwise
  every browser shares the web server's address for the per-IP limit. Behind a reverse
  proxy, the reverse proxy must set this header; if the web server is exposed directly,
  a client can forge it and bypass the per-IP limit (the per-account limit still
  applies).
- **Content-Security-Policy**: each page receives from the proxy a policy with a fresh
  nonce (`script-src 'self' 'nonce-…' 'strict-dynamic'`); Next.js puts the nonce on its
  scripts, the root layout on the theme script, and the libraries that insert a
  `<style>` element receive it too (animations, scroll lock of dialogs, list of menus).
  The style sheet of the notification library is allowed by its SHA-256 hash, checked
  by a test. Only `style` attributes are allowed (`style-src-attr 'unsafe-inline'`). No
  frames (`frame-ancestors 'none'`), no objects, forms and connections to the origin
  only; `/api` routes answer with `default-src 'none'`. Every page is rendered on
  request, which nonces require ([D27](../decisions.md)). An end-to-end test fails on any
  violation the browser reports.
- **Headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera,
  microphone, geolocation, payment, USB off); `Strict-Transport-Security` (one year) in
  production over HTTPS (`FORJA_WEB_SECURE_COOKIES` true).
- **Event stream**: `GET /api/forja/events` relays the API's Server-Sent Events with the
  cookie's session, without compression or buffering; the API call stops when the
  browser leaves the page. The stream carries only what the user may see: their
  notifications, and the runs of a project they belong to (all for an engineer, their
  own for an analyst).
- **Error pages**: 404 and 500 in the application's style; an error shows only its
  reference (`digest`), never its stack.

## Invitations (multi-user mode)

`POST /projects/{id}/invitations` (`{"email", "role"}`):

- if the email already has an account, the user is added to the project with that role;
- otherwise a single-use registration token is returned (once), valid
  `FORJA_AUTH_INVITATION_DAYS` days; the person creates their account with
  `POST /auth/register` (`{"token", "password", "name"}`).

The interface sends a link `/auth/invite/<token>`. Before registering, the page reads
the invitation with `POST /auth/invitations/lookup` (`{"token"}`, no session): the
token travels in the body, never in an API URL that logs would keep. The answer gives
the email and the role only for a valid invitation; otherwise only its state
(`expired`, `revoked`, `used`, `unknown`). An unknown token counts as a failed
`register:ip:<ip>` attempt, as at registration. A revoked invitation is kept as such
(`revoked_at`) so that its link says so; it no longer appears among pending
invitations.

Roles are then managed with `PUT` / `DELETE /projects/{id}/members/{user_id}`.

## Roles

| Role | For | In short |
|---|---|---|
| `admin` | The project owner | Everything, members, audit and the Bronze preview included |
| `engineer` | Data engineers | Sources, Silver plans, relations, Gold plan, runs, publication, semantic layer, approvals |
| `analyst` | Business teams | Reading Gold (pseudonymized), the agent, their own data marts, synonym proposals |

The instance administrator (created at first start) is `admin` of every project and the
only one who can create a project (they become its `admin` member).

### Roles × actions

Each route declares the action it performs; the project is derived from the path
(project, source, relation, table, run, data mart request, synonym proposal,
connection, schedule, upload). A user without a role in the project gets `403`. This
table is checked by `tests/test_permissions.py` against
`forja_core.auth.models.ROLE_ACTIONS`.

| Action | Description | admin | engineer | analyst |
|---|---|:-:|:-:|:-:|
| `project.read` | See the project | ✓ | ✓ | ✓ |
| `project.manage` | Manage members and invitations | ✓ | — | — |
| `audit.read` | Read the audit log | ✓ | — | — |
| `source.read` | See sources, versions and profiles | ✓ | ✓ | — |
| `source.write` | Load a file (new source or version) | ✓ | ✓ | — |
| `bronze.preview` | Bronze preview in clear (if FORJA_ALLOW_BRONZE_PREVIEW) | ✓ | — | — |
| `silver.read` | See Silver plans and tables | ✓ | ✓ | — |
| `plan.write` | Edit and approve a Silver plan | ✓ | ✓ | — |
| `relation.read` | See relations | ✓ | ✓ | — |
| `relation.write` | Detect, declare, confirm, reject a relation | ✓ | ✓ | — |
| `gold_plan.read` | See the Gold plan | ✓ | ✓ | — |
| `gold_plan.write` | Propose, edit, approve the Gold plan | ✓ | ✓ | — |
| `run.read` | See every run and its logs | ✓ | ✓ | — |
| `run.write` | Start or cancel a run (builds, exports) | ✓ | ✓ | — |
| `gold.read` | Read, preview, export Gold tables | ✓ | ✓ | ✓ |
| `table.publish` | Publish a table to serving, or withdraw it | ✓ | ✓ | — |
| `data.unmasked` | See data as the plan says (otherwise pseudonymization is forced) | ✓ | ✓ | — |
| `semantic.read` | Read the semantic layer | ✓ | ✓ | ✓ |
| `semantic.write` | Edit and regenerate the semantic layer | ✓ | ✓ | — |
| `synonym.propose` | Propose a synonym | ✓ | ✓ | ✓ |
| `synonym.review` | Accept or reject a proposed synonym | ✓ | ✓ | — |
| `mart.request` | Ask the agent, manage one's own data marts | ✓ | ✓ | ✓ |
| `mart.read_all` | See every user's data marts | ✓ | ✓ | — |
| `mart.approve` | Approve or reject a data mart | ✓ | ✓ | — |
| `connection.manage` | Manage connections, their loads and schedules | ✓ | ✓ | — |

Further rules:

- **Tables**: a Silver table requires `silver.read`, a Gold table `gold.read`, a data
  mart belongs to its author (or `mart.read_all`). `GET /projects/{id}/tables` lists
  only what the caller can read.
- **Runs**: without `run.read`, a user sees (and cancels) only the runs they started,
  that is their requests to the agent.
- **Data mart requests**: answering, refining, validating are for the author only;
  rejecting, for the author or an engineer.
- **Bronze**: `GET /sources/{id}/preview` stays off until `FORJA_ALLOW_BRONZE_PREVIEW`
  is turned on, even for an admin.

## Personal data

- Without `data.unmasked` (the analyst role), **every column detected as personal is
  pseudonymized** (the project's HMAC-SHA256) in previews, exports and the agent's
  samples, even if the Silver plan leaves it in clear (`none`); the plan's `mask` and
  `drop` treatments apply as they are.
- Published data marts always pseudonymize their personal columns: they are shared
  between analysts.
- The agent refuses to filter on the value of personal data (a filter `email = …` would
  test whether a person exists).
- No language model receives data values: the Gold plan receives schemas and
  statistics, the agent the question and the business names of the semantic layer.
  Filter values (« Lyon ») are resolved locally.

## Audit log

The catalog's `audit_log` table: who (`user_id`, `user_email`), what (`action`), when,
on which object (`project_id`, `object_type`, `object_id`) and details without personal
content.

| Domain | Audited actions |
|---|---|
| Accounts | `user.bootstrap`, `auth.login`, `auth.login_failed`, `auth.logout`, `auth.password_changed`, `auth.refresh_reuse`, `api_key.create`, `api_key.revoke` |
| Members | `project.create`, `member.invite`, `member.register`, `member.role`, `member.remove` |
| Data | `source.upload`, `source.bronze_preview`, `silver_plan.edit`, `silver_plan.approve`, `relation.declare`, `relation.confirm`, `relation.reject` |
| Gold | `gold_plan.propose`, `gold_plan.edit`, `gold_plan.approve`, `run.<type>`, `run.cancel` |
| Publication | `table.publish`, `table.unpublish`, `table.export` (format, rows, pseudonymization) |
| Semantic | `semantic.regenerate`, `semantic.edit`, `synonym.propose`, `synonym.accept`, `synonym.reject` |
| Agent | `agent.request` (question), `agent.answer`, `agent.refine`, `mart.validate`, `mart.approve`, `mart.reject`, `mart.publish` |
| Connections | `connection.create`, `connection.update`, `connection.delete`, `connection.test`, `connection.explore`, `connection.preview`, `connection.import`, `connection.load`, `schedule.set`, `schedule.delete`, `settings.connectors` (never credentials or values) |

Reading: `GET /projects/{id}/audit` (project admin), `GET /audit` (instance
administrator), filters `action` and `limit`.

## External identity provider (OIDC)

Not implemented, interface ready: `forja_core.auth.identity.IdentityProvider`
(`authorization_url`, `authenticate`) and `OIDCIdentityProvider` (issuer, client,
scopes). An OIDC provider will authenticate the person (code flow + PKCE, ID token
validation), then Forja will find or create the user by `identity_provider` /
`external_subject` (columns already in `users`) and issue its own tokens as after a
password sign-in. Roles stay managed in Forja.

## AI provider chosen in the interface

The instance administrator chooses the provider (Ollama, Anthropic, OpenAI or none),
the model and the API key in the settings (`PUT /settings/llm`). The choice is written
to `FORJA_SECRETS_DIR/llm.json`, outside the repository and the data folder, readable by
the current user only (0600), and takes precedence over the `FORJA_LLM_*` variables. A
key is never returned by the API nor written to the audit log: `GET /settings/llm` only
says whether one is stored. « Tester la connexion » (`POST /settings/llm/test`) asks the
provider about the model without sending any data.

## Connections to databases and APIs

- **Credentials**: encrypted with AES-256-GCM with the key
  `FORJA_SECRETS_DIR/connections.key` (0600), bound to their connection; never returned
  (the API only says which fields are set), never logged (database and API errors are
  scrubbed), never sent to the language model (D30).
- **Read only**: the interface recommends a read-only account; Forja opens its
  PostgreSQL and MySQL sessions read-only and warns about an account that can write.
- **No free SQL**: schema, table and column names come from the database's
  introspection and are always quoted; the cursor value is a bound parameter.
- **SSRF**: an API on a private, local or reserved address is refused, at every
  request, page and redirect, unless the instance administrator allows it
  (`PUT /settings/connectors`, `FORJA_CONNECTOR_ALLOWED_HOSTS`). A name is resolved once
  and the connection pinned to that address (no DNS rebinding). Credentials never go to
  another origin than the API's (D29).
- **Rights**: `connection.manage` (admin, engineer).

## Plan review and quarantine

The before-and-after preview of a rule (`GET /sources/{id}/plan/samples`) reads a sample
of raw Bronze: personal columns are masked for an engineer and pseudonymized for the
other roles; they are in clear only with `FORJA_ALLOW_BRONZE_PREVIEW=true` and the
`bronze.preview` right. Quarantined rows (`GET /sources/{id}/rejects`) keep their raw
values and are read like an export: the plan's treatment, or strict pseudonymization
without `data.unmasked`.

## Supply chain

- Every commit is scanned for secrets (gitleaks, whole history), the dependencies
  audited (pip-audit, `pnpm audit` on production packages) and the code analysed by
  CodeQL; Dependabot proposes updates weekly. Actions are pinned by commit.
- Release images are built in GitHub Actions without cache, signed with cosign
  (keyless) and carry SBOM and provenance attestations; an SPDX SBOM of each image is
  attached to the release. Verify an image with:

  ```sh
  cosign verify ghcr.io/forjadata/forja-api:0.1.0 \
    --certificate-identity-regexp "^https://github.com/forjadata/forja/" \
    --certificate-oidc-issuer https://token.actions.githubusercontent.com
  ```

## Known limits

- Throttling is stored in the instance's catalog: several instances behind a load
  balancer do not share their counters.
- No email is sent: the invitation token is returned to the admin, who passes it on. An
  invitation not accepted can be revoked (`DELETE /projects/{id}/invitations/{id}`): its
  token stops working.
- Keep `FORJA_API_HOST=127.0.0.1` or an HTTPS proxy: tokens travel in clear over HTTP.
