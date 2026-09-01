# Verify Exact Local CI Parity

Run the local test and lint commands defined by applicable `pull_request`
workflows for one exact revision surface. This action never publishes or mutates a
remote.

## Inputs

- `TARGET_SHA`: immutable revision ID for the standalone head or selected stack tip.
- `TARGET_BASE`: immutable revision ID for the standalone PR base or selected stack root base.
- `TARGET_KIND`: `standalone` or `stack-tip` for the receipt; defaults to
  `standalone` only for the public `coding:pr verify` action.

Reject unresolved refs, an unknown kind, or an empty input. A changed target,
base, or applicable workflow input invalidates all evidence and restarts the
gate. These inputs intentionally provide neither the pull request's base ref
nor its create/update event type.

## Workflow

Resolve the target repository's main source checkout first:

```bash
SOURCE_REPO_ROOT=$(git rev-parse --show-toplevel)
```

Require jj to be installed, initialized for that checkout, and able to resolve
the exact target commit without snapshotting the current working copy:

```bash
command -v jj >/dev/null 2>&1 || exit 42
JJ_TARGET_SHA=$(jj --repository "$SOURCE_REPO_ROOT" --ignore-working-copy \
  log -r "$TARGET_SHA" --no-graph -T 'commit_id' 2>/dev/null) || exit 42
test "$JJ_TARGET_SHA" = "$TARGET_SHA" || exit 42
CI_PARITY_EXECUTION_ENGINE=jj-run
printf 'CI_PARITY_EXECUTION_ENGINE=%s\n' "$CI_PARITY_EXECUTION_ENGINE"
```

Do not initialize or upgrade jj inside this action. Repository initialization,
the 0.44 version floor, and linked Git worktree handling belong to the shared
jj guide and `coding:sync-tool`. Failure to prove them blocks verification;
only create/update's explicit `--no-verify` can bypass its local gate.

Use the source checkout as the repository argument to `jj run`. Do not scan
environment files or CI declarations for a preflight inventory or presence
check. When rendering an exact task, load values only from an explicitly
approved source; do not execute test, lint, setup, or formatter commands
directly there or copy secret values into a report.

Create one detached disposable worktree at the target revision through the bundled
helper and verify its revision. It owns workflow and command discovery; do not
execute repository tasks from it:

```bash
TREE_JSON=$(bash "${CODING_PR_SKILL_DIR}/scripts/temp-tree.sh" \
  open-git "$SOURCE_REPO_ROOT" "$TARGET_SHA")
TREE_LEASE=$(jq -er .lease <<<"$TREE_JSON")
TEST_WORKTREE=$(jq -er .tree <<<"$TREE_JSON")
test "$(git -C "$TEST_WORKTREE" rev-parse HEAD)" = "$TARGET_SHA"
```

The context-owning parent passes `TEST_WORKTREE`, `SOURCE_REPO_ROOT`,
the target revision, and the selected execution engine to the tester. It retains
cleanup ownership. On cancellation or blocked discovery it closes the lease
and verifies that its file and VCS registration are gone.

Read `.github/workflows/*.yml` and `.github/workflows/*.yaml` only from
`TEST_WORKTREE`. Set applicability mode to `conservative_pull_request` and
include every workflow triggered by `pull_request`. Do not exclude one because
of `branches`, `branches-ignore`, `types`, `paths`, or `paths-ignore` filters:
bare revision IDs do not carry the complete hosted event context needed to
evaluate those filters reliably. Use `TARGET_BASE..TARGET_SHA` only as the
changed command surface, not to narrow workflow applicability. Follow every
included workflow's repo-local reusable workflows, composite actions, package
scripts, workspace manifests, Makefiles, and task files from the target revision.
Record the exact test and lint `run:` commands in workflow order plus only
their required invocation context, preserving shell, working directory,
matrix values, and non-secret environment. Do not add dependency or tool
installation, upgrade, or authentication as local parity setup: this check
uses the available local toolchain and dependencies. Do not substitute a
nearby command or invent a check. Record an exact absence when no included
workflow defines test or lint. A non-secret requirement that cannot be
reproduced locally blocks the gate.

For each parsed workflow, apply this decision contract. The parser supplies
`HAS_PULL_REQUEST_TRIGGER` from the workflow's `on` declaration; filter values
are deliberately absent because they cannot change the decision:

```bash
source "${CODING_PR_SKILL_DIR}/scripts/select-workflow-applicability.sh"
```

Do not inventory or presence-check CI-declared `env`, `secrets.*`, or `vars.*`
before attempting a task. An unused declaration never creates a question. The
first attempt runs the exact task with the available local toolchain,
dependencies, and non-secret invocation context. If it fails, inspect the
captured failure evidence; classify it as a missing-variable failure only when
the exact command explicitly shows that it could not obtain a named
CI-declared variable. A missing tool, dependency, authentication, or other
failure remains an ordinary local failure and blocks the gate; do not install,
upgrade, or authenticate to bypass it.

Only after qualifying failure evidence exists, validate those exact names
against the selected workflow and command chain, then close the lease and ask
the user for an explicit source and rerun or approval to skip the local run for
this exact target revision and exact lexically sorted name list. Never guess a
source, pass an empty value, treat an unavailable variable as optional, or
infer approval from another flag or workflow. A changed revision requires a
new decision.

Record expected hosted check/job names from the selected workflows at
`TARGET_SHA` and required branch status checks or rulesets when accessible
through `gh api`; record inaccessible sources instead of assuming they are
empty.

Dispatch one fresh small-model read-only tester. It MUST NOT edit, format,
commit, or push. It first runs the discovered test and lint commands in CI order
at the target revision with the available local toolchain and dependencies,
continues through independent commands after failure, and returns under 1000
tokens. No install-only bootstrap step is part of this check.

Resolve the workflow's complete shell template, including GitHub Actions'
default flags when `shell` is omitted, into `CI_SHELL_TEMPLATE`. The template
must contain `{0}` for the script path. Execute every discovered test or lint
task with its exact required setup as one shell task through this runner shape:

```bash
CI_TASK_FILE=$(mktemp)
trap 'rm -f "$CI_TASK_FILE"' EXIT
printf '%s\n' "$CI_TASK_SCRIPT" >"$CI_TASK_FILE"
case "$CI_SHELL_TEMPLATE" in *'{0}'*) ;; *) exit 42 ;; esac
CI_SHELL_COMMAND=${CI_SHELL_TEMPLATE//\{0\}/"$CI_TASK_FILE"}
jj --repository "$SOURCE_REPO_ROOT" --ignore-working-copy run \
  --clean --ignore-changes --root -r "$TARGET_SHA" -- \
  bash -c 'exec bash -c "$1"' _ "$CI_SHELL_COMMAND"
```

`CI_SHELL_TEMPLATE` preserves every workflow shell flag and placeholder;
`CI_TASK_SCRIPT` preserves the working directory, matrix values, non-secret
environment, required non-install invocation context, and exact test or lint
command. It does not add an install-only bootstrap step. One fresh
`--clean` invocation per task prevents artifacts from another revision or task
from affecting the result; context and its dependent command stay inside that
same invocation. `--ignore-changes` is mandatory because verification must not
amend the target or rebase descendants. Do not use `--ignore-errors`, which
would hide the task's failing exit status. Continue through other independent
tasks with separate invocations and record each status.

When an exact task needs project-local dependencies, expose only an already-
installed tree from the source checkout inside that same task invocation. Do
not install, upgrade, authenticate, or populate a cache as parity setup. The
task script may copy the source checkout's dependency tree into the clean run
root before the exact command:

```bash
PROJECT_LOCAL_DEPENDENCY_ROOT="$SOURCE_REPO_ROOT/node_modules"
test -d "$PROJECT_LOCAL_DEPENDENCY_ROOT" || exit 42
test ! -e "$JJ_WORKSPACE_ROOT/node_modules" || exit 42
cp -R "$PROJECT_LOCAL_DEPENDENCY_ROOT" "$JJ_WORKSPACE_ROOT/"
<exact test-or-lint-command>
```

The copied tree is an untracked input created and discarded with that `--clean`
working copy, so task writes cannot alter the source checkout. The tracked files
still come only from `-r "$TARGET_SHA"`, and the `JJ_COMMIT_ID` check remains
mandatory. A missing or unusable dependency tree is an ordinary local failure
and blocks the gate, not a missing-secret exception.

For every task, verify that the runner's `JJ_COMMIT_ID` equals the target revision ID; a
mismatch blocks the gate.

After the first attempt, if and only if its captured failure evidence names
missing CI variables, sort those names into one comma-separated value and set
`MISSING_SECRET_FAILURE_CONFIRMED=true`. Then enforce the stop or exact-
approval decision:

```bash
source "${CODING_PR_SKILL_DIR}/scripts/gate-missing-secrets.sh"
```

When `MISSING_SECRET_FAILURE_CONFIRMED` is unset or false, the helper keeps the
local run pending even if CI declarations or an approval happen to name
variables. With confirmation, `MISSING_SECRET_APPROVED=true`, the exact
`TARGET_SHA`, and the exact lexically sorted `MISSING_SECRET_NAMES` approval
remain required for `approved_without_local_run`.

Treat repository workflows and scripts as untrusted code. Run allowlisted
commands through the selected isolated runner, limit writes to its working copy
and a temporary directory, deny network by default, and remove ambient tokens,
credential helpers, SSH agent sockets, cloud credentials, and unrelated
environment variables. Pass only the minimal toolchain environment. Ask for
specific authority when a command requires network or a non-secret credential;
stop when it is unavailable. Never expose the parent session's credentials. The
tester neither removes the discovery worktree nor closes or reports on the
parent-owned `TREE_LEASE`.

Serialize the exact ordered workflow command/result set once as canonical JSON
in `CI_PARITY_EXPECTED_WORKFLOW_COMMAND_RESULTS_JSON`. Every entry records the
target ref, kind, exact command, source, result status, and
`failure_evidence`. A successful attempted command records integer status `0`
and `failure_evidence: null`. When a command exits nonzero because it could not
obtain a named CI variable, retain its numeric status and record exactly
`{"type":"missing_ci_variable","name":"<variable name>"}` as its
`failure_evidence`; every such name must be a declared missing variable. An
approved receipt must contain at least one such attempted failure, and the
sorted unique set of its evidence names must equal the exact missing-secret
name array. Use `not_run_missing_secret` with `failure_evidence: null` only for
commands genuinely skipped after that failure. Any other status/evidence pair,
including an ordinary non-secret numeric failure, blocks the receipt. Serialize
the exact lexically sorted missing-secret-name array as
`CI_PARITY_EXPECTED_MISSING_SECRET_NAMES_JSON`; use `[]` when none are missing.
Embed those exact arrays in the complete JSON receipt below and return all three
values to the caller. Do not return a standalone approval as a substitute for
the receipt.

<report>

```json
{
  "sources_read": ["<workflow-or-script-path>"],
  "applicability_mode": "conservative_pull_request",
  "unevaluated_filters": ["base_ref", "event_type", "paths"],
  "execution_engine": "jj-run",
  "target": {
    "kind": "<standalone-or-stack-tip>",
    "sha": "<TARGET_SHA>",
    "base": "<TARGET_BASE>"
  },
  "required_environment": [
    {
      "name": "<variable name>",
      "declared_source": "<workflow/package/.env source>",
      "worktree_status": "<present-or-missing>"
    }
  ],
  "workflow_command_results": [
    {
      "ref": "<TARGET_SHA>",
      "kind": "<test-or-lint>",
      "command": "<exact command>",
      "source": "<path and job/script>",
      "status": 0,
      "duration_seconds": 0,
      "failure_evidence": null
    }
  ],
  "expected_hosted_checks": [
    {
      "ref": "<TARGET_SHA>",
      "names": ["<workflow job or required status name>"],
      "sources": ["<workflow path/job, branch protection, or ruleset>"],
      "inaccessible_sources": ["<source and access error>"]
    }
  ],
  "missing_secret_approval": {
    "sha": null,
    "names": [],
    "approved": false
  },
  "overall": "<pass-fail-blocked-or-approved_without_local_run>"
}
```

For an approved receipt, a nonzero attempted result replaces `null` with the
exact two-field missing-variable evidence object above. A string
`not_run_missing_secret` status remains a genuine skip and must keep
`failure_evidence` null; it is not interchangeable with an attempted numeric
result.

</report>

After consuming the report, the parent closes the retained lease and records
the exact lease, tree, close status, and proof that both the lease file and VCS
registration are gone. A tester result cannot claim parent cleanup. Close the
lease before stopping on cancellation or terminal failure.

On local failure, diagnose captured output without editing and return the root
cause, likely owning change, affected files, exact commands and statuses, and
unresolved blockers under 1000 tokens. The public verifier remains read-only.
Its create/update caller owns tip-first failure localization, selects the
earliest failing bookmark/PR, dispatches the relevant fixer only after that
ownership is known, and restarts the complete gate at new exact revision IDs. Any
nonzero applicable command or unresolved diagnosis blocks publication. Any
separate review is read-only.

## Verification

Return `pass` only when every test and lint command from every included
`pull_request` workflow exits zero at the exact target/base surface and the
complete receipt records the exact target revision ID, base revision ID, kind,
`conservative_pull_request` applicability, the `jj-run` execution engine, and
canonical workflow command/result set. A pass additionally proves
`--clean --ignore-changes --root -r "$TARGET_SHA"` was used for every task and
that `JJ_COMMIT_ID` matched the target. The sole alternative is a complete
`approved_without_local_run` receipt with those same fields plus the exact
target revision ID and lexically sorted names in `missing_secret_approval`. Always close
the retained lease before returning.
