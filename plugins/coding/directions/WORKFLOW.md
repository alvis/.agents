# Coding workflow

Read this before writing, modifying, reviewing, committing, pushing, or opening
and updating a pull request; follow your task's phase top to bottom.

## Before Coding

### Decide who does the work

<IMPORTANT>
Use the smallest topology that preserves correctness: handle one bounded,
low-risk change directly, or delegate it once to the best implementing
specialist. Never wrap one executable slice in a coordinator layer.

Classify by semantic risk; file count informs the tier but never decides it — a
one-line authentication change is Tier 3, a twenty-file rename can be Tier 0.

| Tier | Typical change | Agent topology | Validation |
| --- | --- | --- | --- |
| 0 | Rename, documentation, formatting, narrow configuration | One agent | Focused mechanical checks |
| 1 | Bounded behavior change or one coherent component | One implementing agent | Tests, types, lint, self-review |
| 2 | Public API or consequential multi-file change | Implementer and independent reviewer | Full affected gates |
| 3 | Architecture, migration, security, persistent-data, release-topology, or cross-domain change | Tech Lead, specialists, and reviewer | Current governed lifecycle |

Use `tech-lead` for multiple dependent milestones, multiple implementers, or any
Tier 3 work; a public-API change is Tier 2 unless a Tier 3 condition also applies.
The table sets implementation topology only: consequential work and every
publication-bound change require independent review even when one agent
implemented it, and that owner still runs its focused mechanical checks.
</IMPORTANT>

Before delegating, read `essential:directions/delegate.md`; before orchestrating
or reviewing across a team, read `essential:directions/orchestration.md`. Route
with `coding:references/ROUTING.md`. Hand the delegate full
paths to every relevant skill, direction, template, and standard — a subagent
starts blind.

### Decide where the work will live

- **Small change** — unless the user named a location, work in place.
- **Substantial change** (worth a stacked PR) — follow
  `essential:directions/establish-work-stream.md`, which reuses a suitable open
  stream before creating an ID and settles the tree shape; work-ID, state-path,
  and branch-shape rules live in `essential:references/naming.md`.

### Version control and `jj`

- `coding:commit` owns every local history mutation: new changes, descriptions,
  splits, edits, squashes, rebases, abandons, bookmark movement.
- `coding:pr create|update|merge` owns remote publication, PR bases, and CI.
- Other skills may inspect `jj` state but must hand mutations to those owners.
- Use `jj` when installed and functionally colocated; plain Git remains supported
  otherwise. Never approximate a missing command with a mixed Git/`jj` sequence.
- At an actual `jj` operation, follow [the `jj` guide](jj.md) for initialization,
  workspace selection, situation routing, recipes, and recovery.

### If you're writing it yourself

**Understand what you're changing first.** Run once, by whichever is available:
`get_project_overview`, `ide__getDiagnostics`, or the project's build/type-check
command (`npm run build` or `npx tsc --noEmit`, `ty`, `cargo check`).

**Match each action to its skill.** Invoke skills through the harness's skill
mechanism; a skill is not an agent, so never delegate work "to" one or pass its
name as an agent type. Each skill owns its directions, templates, standards.

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
| Authoring, creating, updating, reviewing, merging PRs | `/coding:pr <author\|create\|update\|review\|merge>` |
| Pausing work | `/essential:handover` |
| Resuming work | `/essential:takeover` |
| Finding dead code | `/coding:find-unused` |
| Modernizing syntax | `/coding:modernize` |

Select and apply standards through `coding:standards/INDEX.md`, which owns the
standards list and the selection protocol.

## While Coding

Apply the code-scoped lean-work ladder, minimum-change rules, and non-negotiable
exceptions in `essential:references/working-attitude.md`.

- Prefer **READ**, **WRITE**, **UPDATE**, **LS**, **GREP** over **BASH**.
- **Prepared scripts** — **[IMPORTANT]** every agent and subagent MUST prefer
  scripts declared in the project config (e.g. `package.json`) to running tools
  directly (`npm run lint -- <path>`, not `npx eslint <path>`); invoke a tool
  directly only when no project script serves that purpose.
- **Diagnostics per change** — you MUST run `lsp_get_diagnostics` or
  `ide__getDiagnostics` before and after code changes (skip only if
  `get_project_overview` has just run).
- **Check documentation** — before using an external library, consult
  **context7** for the correct import or call signature and **grep** for
  real-world GitHub usage.
- **Runtime exploration** — to learn runtime behaviour, write a test file or case
  rather than ad-hoc `node -e`/`npx ts-node -e`; tests are version-controlled,
  repeatable, and living documentation.

## After Coding

Completed code goes through a **fix loop** before it is saved; any failing
required gate returns to implementation, and gate depth follows its tier above.

```
edit code → verify delivery → (fail ⇒ back to code) → affected gates → (fail ⇒ back to code) → commit
```

**[IMPORTANT]** Before the loop, after modifying public types, interfaces,
signatures, schemas, exports, functions, or classes, run each affected consumer
project's own build in its own root (`npm run build`, `cargo build`, …).
Cross-project breakage is invisible from the changed project alone; lint and type
stages cover the rest. Never substitute a declaration-shape test.

**1. Verify delivery.** Confirm every requirement shipped: walk an executed plan
task by task against code, tests, and docs; otherwise verify the stated
requirements. Fix anything unmet, then restart the loop here. At Tier 0–1 without
a review trigger the implementing owner verifies — never spawn a reviewer to
re-read a bounded, non-consequential edit. At Tier 2, Tier 3, an explicit review
request, or publication, dispatch an independent reviewer, adding a coordinator
only when several genuinely independent review areas need consolidation, and have
that reviewer load `coding:review-code` through the harness's skill mechanism.

**2. Mechanical gates.** For Tier 1–3 source changes, invoke `coding:lint` on
touched source, which owns its own file scope; Tier 0 runs only the focused
checks its artifact needs. The implementing owner invokes lint for a bounded
slice, delegating only when scope or output warrants isolation. On any violation,
fix it, then re-run verification and lint.

Type diagnostics and focused tests are separate gates lint never stands in for:
type diagnostics for changed code, focused runtime tests through supported public
entrypoints for changed runtime behavior, and focused compile-time tests for
changed compiler-observable behavior permitted by `TST-CORE-10`. Run each gate
under the changed project's root, resolving its commands first:
`lsp_get_diagnostics`/`ide__getDiagnostics` covers types in any language,
otherwise its configured script wins per **Prepared scripts**; only when neither
exists, fall back to what its language standard mandates — `tsc --noEmit` plus
the project's test script, `ty` and `pytest`, `cargo clippy` and
`cargo nextest run`. Never run `npm` in a project without a `package.json`.
Proceed only once verification, lint, types, affected-consumer builds, and the
applicable focused tests are clean.

**3. Commit.** **If the user did not explicitly request a commit, ask whether to
commit the work** (via `coding:commit`). **If HEAD is not the local main branch,
or the work is in a `jj` workspace or linked Git worktree, use the graphical or
structured user-input tool to ask whether to open a PR or move the work onto
local main** — the `jj` guide owns that distinction.

**4. Pull requests.** Creating or updating a pull request MUST go through
`coding:pr create` or `coding:pr update`, never a hand-rolled `git`/`gh`
sequence, even for a small one-off PR.
