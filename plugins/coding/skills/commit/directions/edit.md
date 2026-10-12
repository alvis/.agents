# Auto-detected edit

Use this route when the user asks to amend a specific mutable change, including a bug found during review of stacked commits, branches, or PRs. Apply the complete edit procedure in `coding:directions/jj.md`; do not restate or vary its operators here.

## Commit-skill gates

- Resolve the named change, its saved stack tip, and every downstream bookmark.
- Confirm the owning change is mutable and unmerged. An immutable or merged target routes to [merged.md](merged.md).
- Capture the operation ID required by the shared guide before `jj edit`; follow [backup and recovery](../SKILL.md#backup-and-recovery).
- Validate any changed description against [commit-message standard](../../../standards/commit/write.md).
- After the shared guide restores `@` to the saved stack tip, inspect the operation diff and final graph under [VCS-specific verification](../SKILL.md#verification), then run every affected project gate.
- Return the affected bottom-to-top bookmark and PR map to `coding:pr update`; this reference never publishes it.

When fixes belong to multiple ancestors, route to [retrospective.md](retrospective.md). When a rewritten public export affects consumer projects, run each consumer's build before handoff.
