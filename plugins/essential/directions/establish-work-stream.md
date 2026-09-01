# Establish a work stream

Use this direction before planning, delegation, or implementation when work is substantial enough to need durable state.

## Select the work identity

The main agent selects the identity from task context; the user is never asked merely to approve an identifier. Follow this order:

1. When the user explicitly supplies a Work ID, validate it against [naming.md](../references/naming.md), preserve it as the selected base, and skip resolver-driven candidate reuse. If that identity exists, reuse it only when its charter owns the requested outcome; otherwise treat it as a collision in step 6.
2. Otherwise run the resolver without `--work-id`. Treat any existing identity it returns, including `sole_existing`, as a candidate location rather than permission to continue that stream.
3. Read the candidate's `goal.md`. Reuse it only when its confirmed goal and behavioral requirements already own the requested outcome.
4. Inspect every other open stream charter and reuse the one that already owns the outcome. Never broaden a charter to avoid creating an identity.
5. When no open charter owns the outcome, derive a type-free slug from a stable Task ID or the goal.
6. Check the selected base against live and archived state, workspace paths, local and remote branches or bookmarks, and surviving pull-request identities. If an unrelated identity occupies it, shorten the base when needed and append the next free ordinal.
7. Rerun the resolver with `--work-id <selected-id>`. Its filesystem and ignore gates remain authoritative.

On `work_id_required`, a main-agent caller performs these steps and reruns; a subagent returns the complete resolver payload to the main agent. Resolver candidates are discovery evidence, not format examples or charter authority.

## Settle substantial work intent

Before workspace bootstrap, settle three separately answerable items. Infer them from the request and repository context; ask only for an item whose meaning is genuinely ambiguous, never to reconfirm information the user already supplied.

1. **Goal.** State one verifiable outcome and the evidence that will confirm it.
2. **Behavioral requirements.** State only the observable behavior the work must demonstrate. Exclude universal delivery obligations such as passing tests, updating documentation, following standards, or routine review.
3. **Direction.** When material alternatives remain, present at least two viable approaches with their trade-offs, mark one `Recommended`, and ask which approach or adjustment should guide the work. A direction becomes a requirement only when the user explicitly promotes it.

The questions may share one harness prompt, but each unsettled item needs its own answer. When an answer changes, revisit only the items it affects.

## Select the workspace

After intent is settled, prefer a jj workspace when jj is functionally initialized for the repository. Otherwise offer a fresh local branch, a Git worktree, or the current branch according to repository support and isolation needs. New workspaces live at `~/.workspaces/<project-root-folder-name>/<work-id>`.

Never use a provider-specific workspace or worktree path such as `.claude/worktrees/`; durable work must remain portable across harnesses.

## Bootstrap state

Run the resolver with the selected ID. After it returns `resolved` with `state_ignored: true`, acquire the main-agent lease and invoke the resolver with `--bootstrap` before creating another work artifact. Replace the generated charter placeholders with the settled goal and behavioral requirements.

[state.md](../references/state.md) owns resolution and lifecycle semantics; [lease.md](./lease.md) owns the lease-verified invocation and no-clobber mechanics.
