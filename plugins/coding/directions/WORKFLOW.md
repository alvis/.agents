# Coding workflow

Read this before you write, modify, review, upload, or publish code — committing, pushing, and opening or updating a pull request are covered too — then follow the phase your task is in — Before, While, or After Coding — top to bottom.

## Before Coding

### Decide who does the work

<IMPORTANT>
For coding work, use the smallest topology that preserves correctness. Handle
one bounded, low-risk change directly, or delegate it once to the best
implementing specialist. Do not add a coordinator layer around one executable
slice.

Classify by semantic risk. File count can inform the tier but never decides it:
a one-line authentication change is Tier 3, while a twenty-file mechanical
rename can be Tier 0.

| Tier | Typical change | Agent topology | Validation |
| --- | --- | --- | --- |
| Tier 0 | Rename, documentation, formatting, narrow configuration | One agent | Focused mechanical checks |
| Tier 1 | Bounded behavior change or one coherent component | One implementing agent | Tests, types, lint, self-review |
| Tier 2 | Public API or consequential multi-file change | Implementer and independent reviewer | Full affected gates |
| Tier 3 | Architecture, migration, security, persistent-data, release-topology, or cross-domain change | Tech Lead, specialists, and reviewer | Current governed lifecycle |

Use `tech-lead` when work has multiple dependent milestones, requires multiple
implementers, or falls in Tier 3: architecture, migration, security,
persistent-data, release-topology, or cross-domain change. A public-API change
is Tier 2 unless one of those Tier 3 conditions also applies.

The table describes implementation topology. Consequential work and every
publication-bound change require independent review even when the implementation
itself used one agent. The implementing owner remains responsible for focused
mechanical checks.
</IMPORTANT>

Before work delegation, read `coding:references/ROUTING.md` and route the work to the specialist whose role fits; read `essential:directions/orchestration.md` before you delegate, orchestrate, or review across a team. Hand the delegate the full file paths of every relevant skill, direction, template, and standard file — a subagent starts blind.

### Decide where the work will live

Settle this before editing:

- **Small change** — if the user didn't request a specific location, work in
  place. Follow [the shared `jj` guide](jj.md) for initialization and workspace
  selection; otherwise use the current Git branch.
- **Substantial change** (worth a stacked PR) — follow
  `essential:directions/establish-work-stream.md`. It first reuses
  the current suitable work ID, then another suitable open stream, and creates
  a new ID only when neither fits. After the three intent confirmations, prefer a
  **`jj` workspace** when supported; otherwise offer a fresh **local branch**,
  a **`git worktree`**, or the **current branch**. Use
  `~/.workspaces/<project-root-folder-name>/<work-id>` for an isolated tree;
  never use a provider-specific path such as `.claude/worktrees/`.
  - The work-id names the state directory, the source tree, and the branch: `.state/works/<work-id>`, `~/.workspaces/<project-root-folder-name>/<work-id>`, and branch `<type>/<work-id>` — the type prefixes the branch only, never the id or the state path. Work that stays a single PR uses `<type>/<work-id>` and nothing more, with no numbered child. A stream split into a stack or into sub-tasks becomes two-digit-numbered branches beneath it: `<type>/<work-id>/01-resolver`, `<type>/<work-id>/02-contract`. Work remains identified in messages and records by its Work ID or Task ID, then by PR ID or Git commit SHA when available; an ordinal such as `slice 1` is never an identifier. Either way the stream is resolved from the branch that is checked out; when its shape yields no identity, follow Essential's work-stream lifecycle so the main agent selects contextually and reruns the resolver. A subagent returns the resolver payload to the main agent; nobody asks the user merely to approve an identifier.
  - Those two shapes cannot coexist — git stores refs as files, so `<type>/<work-id>` blocks `<type>/<work-id>/01-resolver` and vice versa. A single-PR stream that grows cannot add a numbered branch beside the bare one, so it **renames** the bare branch into the first numbered branch — through the forge's branch rename, which retargets the open PR rather than closing it — and pushes the later numbered branches only after that lands. Full rules live in `essential:references/naming.md`.

### If you're writing it yourself

**Understand what you're changing first.** Before writing or fixing any code, build an understanding of the current implementation and its issues — run this once, by whichever is available: the `get_project_overview` MCP tool, the `ide__getDiagnostics` MCP tool, or the project's own build/type-check command — `npm run build` or `npx tsc --noEmit` for TypeScript, `ty` for Python, `cargo check` for Rust.

**Carry out each action with the skill that matches it.** Load or invoke a skill
through the harness's skill mechanism; a skill is not an agent. Never delegate
work "to" a skill or pass its name as an agent type. Use it yourself or inside
a subagent. Each skill owns its directions, templates, and standards.

| Action | Skill to invoke |
|--------|-----------------|
| Writing new code | `/coding:write-code` or `/coding:draft-code` |
| Setting up project | `/coding:setup-project` |
| Completing TODOs | `/coding:complete-code` |
| Fixing issues | `/coding:fix` |
| Reviewing code | `/coding:review-code` |
| Linting code | `/coding:lint` |
| Refactoring | `/coding:refactor` |
| Committing | `/coding:commit` |
| Finalizing un-pushed commits (per-commit QA) | `/coding:finalize-commits` |
| Creating tests | `/coding:complete-test` |
| Documenting code | `/coding:document` |
| Authoring, creating, updating, reviewing, or merging PRs | `/coding:pr <author|create|update|review|merge>` |
| Pausing work | `/essential:handover` |
| Resuming work | `/essential:takeover` |
| Finding dead code | `/coding:find-unused` |
| Modernizing syntax | `/coding:modernize` |

### Version-control directions

Before choosing or using `jj`, follow `coding:directions/jj.md`. Before
committing, branching, or mutating local history, follow
`coding:skills/commit/SKILL.md`. Before publishing, reviewing, or merging,
follow the selected action under `coding:skills/pr/references/`. Templates own
rendering, while standards own observable violations.

### Implementation standards

Select applicable standards directories by action and language. Before editing,
read only each selected directory's `meta.md`. After editing, apply its
`scan.md` to the result. When the scan identifies a rule, read only its matching
`rules/<lowercase-rule-id>.md` guide when present. If that standard has no
matching per-rule guide, read its `write.md` as the bounded fallback. Correct
the violation, then repeat the affected scan. A
standard is a mechanically or semantically scannable rule over the resulting
implementation or change artifact; a violation requires a fix.

| Applies to | Standards |
| --- | --- |
| All implementation work | `coding:standards/universal/` |
| Functions, methods, and APIs | `coding:standards/function/` |
| TypeScript and JavaScript | `coding:standards/typescript/` |
| Identifiers and operation names | `coding:standards/naming/` |
| Tests and testable implementation | `coding:standards/testing/` |
| Rendered PR messages and implementation-diff size or composition | `coding:standards/git/` |
| Comments, JSDoc, and technical documentation | `coding:standards/documentation/` |
| Errors, logging, and operational behavior | `coding:standards/observability/` |
| Python | `coding:standards/python/` |
| Rust | `coding:standards/rust/` |
| Semantic review | `coding:standards/code-review/` plus the implementation standards above |
| New or moved files and project setup | `coding:standards/file-structure/` |

## While Coding

Before writing code, apply the code-scoped lean-work ladder, minimum-change
rules, and non-negotiable exceptions in
`essential:references/working-attitude.md`.

### Working practices

- Prefer **READ**, **WRITE**, **UPDATE**, **LS**, **GREP** as your primary editing tools over **BASH**.
- **Prepared scripts** — **[IMPORTANT]** you MUST always use scripts defined in the project config (e.g. `package.json`) over running tools directly via bash; this applies to ALL agents and subagents.
  - **DO**: `npm run lint -- <path>`, `npm run test -- <path>`, `npm run build`
  - **DON'T**: `npx eslint <path>`, `npx jest <path>`, `npx tsc`
  - Fall back to direct tool invocation only when no project script exists for the purpose.
- **Diagnostics per change** — you MUST run the `lsp_get_diagnostics` or `ide__getDiagnostics` MCP tool before and after code changes (skip only if `get_project_overview` has just run).
- **Check documentation** — before using an external library, consult **context7** to confirm the correct import or call signature, and **grep** for real-world GitHub usage.
- **Runtime exploration** — to understand the runtime behaviour of a library or API, write a test file (or add a test case to an existing spec) instead of ad-hoc commands like `node -e "..."` or `npx ts-node -e "..."`. Test files are version-controlled, repeatable, and serve as living documentation.

Follow the selected standards' `meta.md` contracts and post-edit scan workflow
above.

## After Coding

Completed code goes through a **fix loop** before it is saved — any failing
required gate returns to implementation:

```
edit code → verify delivery → (fail ⇒ back to code) → affected gates → (fail ⇒ back to code) → commit
```

Validation follows the risk tier above. Tier 0 runs focused mechanical checks;
Tier 1 runs applicable tests, types, lint, and self-review; Tier 2 runs every
affected gate plus independent review; Tier 3 follows the current governed
lifecycle with Tech Lead coordination, specialists, full affected gates, and
independent review. Public-shape changes trigger type diagnostics and
affected-consumer builds; runtime-behavior changes trigger focused runtime
tests through supported public entrypoints; changes to compiler-observable
behavior permitted by `TST-CORE-10` trigger focused compile-time tests through
representative consumer usage. Declaration shape alone — members, signatures,
schemas, exports, or barrels — does not require a test.

### Gate before the loop

**[IMPORTANT]** After modifying public types, interfaces, signatures, schemas, exports, functions, or classes, find every affected consumer project in the monorepo and run its own build command in that project's root — `npm run build`, `cargo build`, or whatever that project configures. Cross-project breakage is invisible from the changed project alone; the loop's own lint and type stages cover the rest. Do not add a declaration-shape test as a substitute.

### 1. Verify delivery first

Confirm every requirement was actually delivered — if a plan was executed, open the plan file and walk each task, confirming code/tests/docs match; otherwise verify the task's stated requirements. If any task is unmet, return to implementation, fix it, and restart the loop here.

Who verifies follows the tier and review boundary above:

- **Tier 0 or Tier 1 without a review trigger** — the implementing owner verifies
  the change and completes its tier's checks. Do not spawn a reviewer solely to
  re-read a bounded, non-consequential edit.
- **Tier 2, Tier 3, an explicit review request, or publication** — dispatch an
  independent reviewer. Use a review coordinator only when several genuinely
  independent review areas need consolidation. Have the reviewer load
  `coding:review-code` through the harness's skill mechanism. **Skills and agent
  types are separate namespaces; never pass a skill name as an agent type.**

The selected reviewer must resolve to at least the intelligence required by
`coding:review-code`. If the designated critic is underqualified, transfer the
complete review task to an eligible independent agent before review begins, or
ask the main agent to staff one; the recipient repeats the eligibility check.

### 2. Then the mechanical gates

For Tier 1–3 source changes, invoke the `coding:lint` skill on touched source
files — `.ts/.tsx/.js/.jsx/.py/.go/.rs/.rb/.java/.kt/.swift/.c/.cpp/.h/.hpp/.cs/.php/.sh/.vue/.svelte/.astro`
and similar. Tier 0 instead runs only the focused mechanical checks applicable
to its artifact. Skip text/content files
(`.md/.mdx/.json/.yaml/.toml/.html/.svg/.csv`) and throwaway scripts that won't
be committed. The implementing owner invokes lint for a bounded slice; delegate
only when its scope or output warrants isolation. `coding:lint` runs its own
scan-and-aggregate cycle internally — never lint by hand in its place. If lint
reports any violation, return to implementation, fix it, then re-run
verification and lint.

Type diagnostics and focused tests are separate gates that `coding:lint` does not stand in for. Run type diagnostics for changed code, focused runtime tests for changed runtime behavior, and focused compile-time tests when a compiler-observable behavior permitted by `TST-CORE-10` changes. A compile-time case exercises representative consumer usage; it does not inventory declaration members, signatures, schemas, exports, or barrels. Run each gate under the changed project's root, resolving commands from that project first: the `lsp_get_diagnostics` or `ide__getDiagnostics` MCP tool covers types in any language, and otherwise the project's configured script wins per **Prepared scripts** above. Only when neither exists, fall back to the type checker and test runner its language standard mandates — `tsc --noEmit` and the project's test script for TypeScript, `ty` and `pytest` for Python, `cargo clippy` and `cargo nextest run` for Rust. Never run an `npm` command in a project that has no `package.json`. Proceed only once verification, lint, types, affected-consumer builds, and the applicable focused tests are clean.

### 3. Then commit

- Follow [the shared `jj` guide](jj.md) for initialization, functional
  colocation proof, workspace selection, stacked-review repair, and rollback.
- Saving changes goes through `coding:commit`, which owns every explicit local
  history operation for both `jj` and Git. PR publication and CI convergence
  go through `coding:pr create|update`; never hand-run their mutations outside
  those owners.
- **If the user did not explicitly request a commit, ask whether to commit the work** (via `coding:commit`).
- **If HEAD is not the local main branch, or the work is in a `jj` workspace or
  linked Git worktree, use the graphical or structured user-input tool
  to ask whether to open a PR or move the work onto local main.** The shared
  guide owns the distinction between those
  workspace types.

### Pull requests

Creating or updating a pull request MUST go through `coding:pr create` or
`coding:pr update`, not a hand-rolled `git`/`gh` sequence. The selected
subcommand composes the conventional-commit title and unified body from the
commit, publishes it, and drives CI to green. This applies even when the request
looks like a small, one-off PR.

The `pr` skill detects the repository mode through the functional proof in
[the shared `jj` guide](jj.md). It publishes the selected bookmark or branch,
uses the authored title and body verbatim, and ends with a draft PR on the
intended base and CI green or its documented absence confirmed.
