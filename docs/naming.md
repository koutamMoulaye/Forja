# Naming: Forja and its identifiers

The project keeps its name, **Forja**, everywhere it is displayed (interface, docs,
images' titles). The identifiers that must be unique on a registry use one token,
**`forjadata`**, the same everywhere. Checked on 1 November 2026.

## Why not "forja" itself

| Namespace | `forja` | Taken by |
|---|---|---|
| PyPI | taken | `forja` 1.0.1, "scaffolding for Python data projects: ETL, hexagonal, ML pipeline" (Spanish). A **data** tool: the closest risk of confusion. |
| npm | taken | a deprecated package kept by npm |
| GitHub | taken | a personal account |
| Docker Hub | taken | an account opened in 2017 |
| forja.com, forja.dev, forja.io | registered | |

Other projects named Forja on GitHub: a self-hosted chatbot for WhatsApp, Instagram and
Telegram (santmun/forja, 130 stars), a modular media player (mGhassen/Forja), an agent
manager for coding assistants (dmend3z/forja), a desktop client for coding agents
(nandomoreirame/forja). None is a data platform; the PyPI package above is the only
data tool met.

**Trademarks.** Web searches found no "Forja" software trademark, but they do not query
the official registers. Before any wider communication, search the word mark
"Forja" in classes 9 and 42 (software, software as a service) on
[TMview](https://www.tmdn.org/tmview/) (EU and national offices) and the
[USPTO](https://tmsearch.uspto.gov/); "forja" is a common Spanish and Portuguese word
(forge), registered marks in other classes are likely and are not a conflict.

## Variants checked

404 means free on the registry; RDAP and whois for the domains.

| Variant | PyPI | npm | GitHub | Docker Hub | .com | .dev | .io |
|---|---|---|---|---|---|---|---|
| **forjadata** | free | free | free | free | free | free | free |
| forja-data | free | free | free | invalid name¹ | free | free | free |
| forja-hq | free | free | free | invalid name¹ | free | free | free |
| forjahq | free | free | **taken** | free | registered | free | free |
| getforja | free | free | **taken** | free | registered | free | free |
| forja-platform | free | free | **taken** | invalid name¹ | | | |
| useforja, forjalabs, forja-dev | free | free | **taken** | | | | |
| forjaio, forja-oss | free | free | free | | | | |

¹ Docker Hub namespaces are lowercase letters and digits only: no hyphen.

`forjadata` is the only candidate free on every registry, valid on Docker Hub, and
consistent with the domains. It also says what Forja is.

## The identifiers

| Where | Identifier | State in the repository |
|---|---|---|
| GitHub organization | `forjadata` | the repository is written as `forjadata/forja` (README, image labels, install scripts, SECURITY, CHANGELOG) |
| Container images | `ghcr.io/forjadata/forja-api`, `ghcr.io/forjadata/forja-web` | default of `docker-compose.yml`; published by `.github/workflows/release.yml` (under the owner of the repository) |
| Docker Hub (mirror, later) | `forjadata/forja-api`, `forjadata/forja-web` | not used yet; `FORJA_IMAGE_PREFIX=forjadata` would switch to it |
| PyPI | `forjadata` (the whole platform), `forjadata-core`, `forjadata-llm`, `forjadata-api` | the distributions are named so; the modules stay `forja_core`, `forja_llm`, `forja_api` and the command stays `forja`. Nothing is published to PyPI in 0.1 |
| npm | scope `@forjadata` | nothing published; the web app is private |
| Domains | `forjadata.dev` (documentation, contact addresses), `forjadata.com` and `forjadata.io` (redirects) | `conduct@forjadata.dev` in CODE_OF_CONDUCT.md |

## To reserve yourself

Registries cannot be reserved from the repository. In this order:

1. **GitHub organization `forjadata`** (free plan), then transfer the repository to it
   (*Settings › General › Transfer ownership*, new name `forja`). GitHub redirects the
   old URLs. Do it before tagging v0.1.0: the images are published under the
   repository owner, and `docker-compose.yml` pulls `ghcr.io/forjadata/...`.
2. **Domains** `forjadata.dev`, `forjadata.com`, `forjadata.io`; then the mailbox or
   forwarding for `conduct@forjadata.dev` (Code of Conduct).
3. **PyPI**: an account with two-factor authentication; to hold the names, publish a
   first `forjadata` release (PyPI has no reservation without an upload), or plan
   trusted publishing from GitHub Actions for a later release. Same for
   `forjadata-core`, `forjadata-llm`, `forjadata-api` if they are meant to be installed
   on their own.
4. **npm**: create the organization `forjadata` (free for public packages) to hold the
   scope.
5. **Docker Hub**: create the organization `forjadata` (free) to hold the namespace for
   a future mirror.
6. Defensive, optional: the GitHub organization and PyPI name `forja-data`, which
   people may type.
7. After the transfer, check the **GHCR packages**: make `forja-api` and `forja-web`
   public (*Package settings › Change visibility*) after the first release, and link
   them to the repository.
