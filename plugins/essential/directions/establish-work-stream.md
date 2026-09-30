# Establish a work stream

Use this direction before planning, delegation, or implementation when work needs durable state. The workspace selection contract also applies to version-controlled work without a work stream.

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

Before version-controlled work, perform only the read-only repository, tool, and current-location discovery needed to select its workspace. Honor a clear user instruction about where to conduct the work; do not relocate it or substitute another version-control arrangement. Continuing work may reuse its already selected isolated workspace. Otherwise use a separate jj workspace by default, including for small changes. Workspace selection does not require a durable work stream.

When jj is absent or the repository is not functionally initialized, ask the user to choose before dependent planning, editing, or history work:

1. Install or initialize jj and use a separate jj workspace — Recommended.
2. Use a Git worktree.
3. Work in the current checkout.

An explicit location or arrangement settles that choice. Never silently install or initialize jj, proceed with an unanswered required choice, or replace a selected Git worktree with a jj workspace. If the chosen arrangement cannot be used, report the concrete blocker and ask for a replacement choice.

For a new isolated workspace, verify the intended base and preserve the current workspace's change before creation. By default, new workspaces live at `~/.workspaces/<project-root-folder-name>/<work-id>` for lifecycle work; bounded work uses a task-derived name without creating state. Apply [naming collisions](../references/naming.md) before creation, then edit only the new workspace's own working-copy change. Keep operational state centralized under [state resolution](../references/state.md). Retain the workspace after publication unless cleanup is separately authorized.

When choosing a location, never select a provider-specific path such as `.claude/worktrees/`; honor an explicit user location.

## Bootstrap state

Run the resolver with the selected ID. After it returns `resolved` with `state_ignored: true`, acquire the main-agent lease and invoke the resolver with `--bootstrap` before creating another work artifact. Replace the generated charter placeholders with the settled goal and behavioral requirements.

[state.md](../references/state.md) owns resolution and lifecycle semantics; [lease.md](./lease.md) owns the lease-verified invocation and no-clobber mechanics.
