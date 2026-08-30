# Migration and regeneration

Use this reference when adopting Presetter around existing config, upgrading a legacy
Presetter consumer, changing a stack, or transferring generated-file ownership.

## Preserve the baseline and intent

Before editing, capture:

```bash
pnpm exec presetter --version
pnpm list --depth 0 presetter '@presetter/*'
git ls-files -- 'presetter.config.*' 'package.json' '*config*' '**/*config*'
git status --short
```

Read the package manifest, workspace catalog, lockfile, closest config and its explicit
ancestors, package scripts, and generated-file ignore policy. Run the current build,
lint, typecheck, and tests. Inventory every deliberate setting in tracked config files
that the proposed stack would generate.

## Migrate existing handwritten configuration

1. Select a complete preset stack for the current project shape; do not change runtime,
   module format, framework, or quality policy accidentally.
2. Add `presetter.config.ts` and package delegates while keeping existing tracked tool
   configs in place.
3. Encode every deliberate setting from those files in variables, scripts, assets, or
   late overrides. Use current-value functions where upstream content must survive.
4. Bootstrap in a disposable copy or with the tracked files safely recoverable. Compare
   each generated result with the preserved baseline.
5. Fix the durable preset input until the generated result carries the intended policy
   and consumer checks pass.
6. Add generated paths to the Presetter-owned ignore asset. Only then remove tracked
   outputs from the index, for example `git rm --cached tsconfig.json`, and bootstrap
   again to prove the ignored working file is regenerated.

Never delete or untrack first: a tracked config is the only durable statement of its
intent until the preset stack reproduces it.

## Upgrade an existing Presetter consumer

Use the installed manifest, lockfile, local CLI version, package changelog, and migration
guide as the authority. Update Presetter packages with the detected manager, keep their
compatible ranges aligned, allow the manager to update the lockfile, then regenerate the
narrowest target and run its consumer checks. Do not infer current behavior from this
skill's publication date.

### Migrate detected unscoped inputs

Apply this subsection only when repository inspection detects one of these inputs.
Verify each replacement against the installed packages and their migration guide;
these are conditional migration clues, not current setup instructions.

| Detected input | Replacement to verify |
| --- | --- |
| `presetter-preset-<name>` | `@presetter/preset-<name>` |
| `presetter-types` | `@presetter/types` for preset packages; consumer helpers may come from `presetter` |
| `coverage` delegate | `test:coverage` when the installed preset exposes it |
| `watch` delegate | `test:watch` when the installed preset exposes it |

After applying a detected migration, rerun typecheck: the installed package set may
also tighten the TypeScript baseline, including `noUncheckedIndexedAccess` in
essentials. Fix surfaced indexed-access errors when practical; if the project
intentionally differs, encode the narrow compiler override in the preset config instead
of editing generated `tsconfig.json`.

Search before replacement and review every hit:

```bash
rg -n 'presetter-preset-|presetter-types|"coverage"|"watch"' \
  --glob '!node_modules/**'
```

Do not perform blind global replacement: package names, custom docs, and task names may
have independent intent.

## Regenerate after a stack change

1. Confirm the edited config, exact targets, and current installed dependency graph.
2. Run the repository delegate when it carries required lifecycle behavior; otherwise
   invoke the resolved local binary with explicit `--projects` or `--packages` filters.
3. Inspect debug selection, generated assets, aggregated failures, `git status`, and
   diffs in durable inputs.
4. Verify every generated path is ignored and absent from `git ls-files`.
5. Run build, lint, typecheck, tests, and affected workspace consumers.

If regeneration repeatedly changes a tracked or hand-edited file, ownership is still
split. Move the intent into the preset or remove that path from Presetter with `null`;
do not accept a perpetual generated diff.
