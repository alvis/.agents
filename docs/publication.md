# Validation and publication

Use this authority before validating, saving history, or publishing changes.

## Prerequisites

The repository requires Bash, `jq`, Git, Bun, and Python 3. The preserved extensionless `state-doctor` uses its `python3` shebang, and Governance's authoring instructions use `uv`-pinned Python. Workspace regression tests and publication require `jj` 0.44 or newer; publication also requires `gh`.

## Repository validation

One command validates the repository without an install step:

```bash
bunx --bun vitest@^4.0.0 run
```

The `--bun` flag is load-bearing; `.github/workflows/ci.yml` explains why. The tree intentionally has no root `package.json` or lockfile: `bunx` resolves the runner into its cache and leaves only ignored cache files. The `^4` range accepts minor-version drift in exchange for a zero-dependency tree.

Mechanical gates are colocated `*.spec.ts`, so suites and gates cannot drift apart. CI runs the command on every pull request and every push to `master`, on Ubuntu and macOS. Additional suites live under `plugins/<p>/tests/` and beside their scripts.

## Native validators

Run `claude plugin validate --strict .` before publishing a manifest change. Run `grok plugin validate plugins/<p>` for each affected plugin. These commands validate installed-CLI manifest and frontmatter schemas; they remain outside the repository suite and CI, so publication evidence records unavailable CLIs explicitly instead of implying they ran.

## Commits and pull requests

Before history mutation, read `plugins/coding/standards/commit/write.md`, which owns the Conventional Commit subject regex and closed type allowlist, and validate the proposed subject against it before mutating history. Use no aliases or emoji prefixes. Scope is a plugin or `plugin/skill`, such as `feat(essential):` or `docs(coding/pr):`; omit scope for global changes.

Ordinary branches are `type/kebab-summary`. Work streams use `type/<work-id>` or `type/<work-id>/NN-<slice>`. Work lands through pull requests, whose titles are also Conventional Commits.

Tooling is jj-first and Git-compatible. `coding:commit` exclusively owns history mutation, `coding:pr create|update` owns publication and CI, and `coding:pr merge` merges stacks bottom-up. Route those operations through their owners rather than hand-writing commit or pull-request flows.
