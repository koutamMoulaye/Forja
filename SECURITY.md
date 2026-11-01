# Security policy

## Reporting a vulnerability

**Please do not open a public issue, discussion or pull request for a vulnerability.**

Report it privately through GitHub: open the
[Security tab of the repository](https://github.com/forjadata/forja/security) and choose
**Report a vulnerability** (direct link:
<https://github.com/forjadata/forja/security/advisories/new>). Only the maintainers
see the report.

Please include what you can of:

- the affected version (`GET /health` gives it) and how Forja is deployed (Docker,
  from source, `FORJA_AUTH_MODE`);
- the steps to reproduce, or a proof of concept;
- the impact as you understand it (data exposed, privileges gained...);
- whether a language model provider is configured, and which one.

Do not include real personal data in the report: generated data is enough.

## What happens next

- We acknowledge the report within **5 working days**.
- We confirm or dismiss it, and agree with you on a disclosure date, within
  **15 working days**. The usual delay before public disclosure is 90 days, shorter once
  a fixed release is out.
- The fix is published in a release and a
  [GitHub Security Advisory](https://github.com/forjadata/forja/security/advisories),
  with a CVE when it applies. We credit you unless you ask otherwise.

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | Yes, security fixes |
| Older | No |

Before 1.0, only the latest minor version receives fixes.

## Scope

In scope: the API, the web application, the Docker images and install scripts, and
the guarantees Forja makes, in particular:

- a language model never receives data values, and never writes SQL;
- personal data is pseudonymized outside the Silver layer (Gold, serving database,
  exports, previews);
- roles are checked on every route; sessions, API keys and invitations cannot be
  replayed or forged;
- the connectors refuse private addresses unless allowed (SSRF).

Out of scope: vulnerabilities of a dependency that Forja does not expose (report them
upstream; Dependabot and the CI audits track them), and deployments that ignore the
documented hardening (for instance the API exposed over plain HTTP on a public network).

How Forja is secured: [docs/en/security.md](docs/en/security.md).
