## What and why

<!-- What this change does, and the problem it solves. Link the issue: Closes #123 -->

## How it was tested

<!-- The tests added or run; for an interface change, a screenshot in both themes. -->

## Checklist

- [ ] One concern, Conventional Commits subjects with a scope (`fix(core): …`)
- [ ] Tests added or updated; `uv run pytest` / `pnpm test` pass locally
- [ ] Lint, format and types pass (`ruff`, `mypy`, `pnpm lint`, `pnpm typecheck`)
- [ ] After an API change: `uv run forja openapi` and `pnpm api:generate`
- [ ] Docs updated (English, and French where the page exists)
- [ ] No data value reaches a language model, no SQL written by one, personal data
      stays pseudonymized outside Silver
- [ ] No secret, personal data or large file committed
