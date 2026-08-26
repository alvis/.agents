# Harness projections

## Support tiers

The files under `plugins/` are the source of truth. Claude Code consumes each
`.claude-plugin` manifest; Codex consumes generated `.codex-plugin` manifests
and `.agents/plugins/marketplace.json`. Both are native targets and must remain
behaviorally aligned.

Grok Build is a compatibility consumer: xAI documents direct loading of Claude
marketplaces, plugins, skills, agents, MCP servers, hooks, and instructions. No
Grok-specific source or generated manifest exists here.

OpenCode support targets stable V1 only. Its documented extension layout differs
from this marketplace, so `scripts/install_opencode.ts` produces a managed
directory projection and installs `scripts/opencode_adapter.js` as a local
plugin. OpenCode V2 and `opencode2` are outside this contract.

## OpenCode projection flow

```text
.claude-plugin/marketplace.json
          │ plugin source and dependency order
          ▼
plugins/<plugin>/ ── install_opencode.ts ──► OpenCode config directory
          │                                  ├── skills/
          │                                  ├── commands/
          │                                  ├── agents/
          │                                  ├── plugins/alvis-marketplace.js
          └─────────────────────────────────►└── alvis/plugins/ + manifest.json
```

The installer accepts explicit plugin names or `--all`, resolves dependencies
before dependents, and obtains each plugin and skill inventory from `git
ls-files --cached --others --exclude-standard`. It reads modified tracked bytes
from the worktree, skips deleted entries, and rejects source symlinks and other
non-regular entries before mutating the target. Ignored environments, caches,
and build artifacts therefore cannot enter either projection location.

Every output is staged as a regular file. The installer preflights destination
paths, refuses unmanaged collisions, backs up prior managed files, installs with
atomic renames, and rolls back if an installation step fails. The schema-v2
manifest is the final commit marker and records every managed path, source
digest, and resolved hook receipt. Repeating an install with the same worktree
produces the same inventory and digests.

A later run may replace or retire only authenticated recorded paths. Existing
schema-v2 paths must be regular files with matching digests. An independently
authenticated schema-v1 projection may also retire non-desired legacy
symlinks: the installer moves the link itself into its transaction backup and
never reads or changes its target. Modified, forged, overlapping, unowned, and
current-schema non-regular claims remain fatal.

Project scope writes `<project>/.opencode`. User scope writes
`${XDG_CONFIG_HOME:-~/.config}/opencode`. The installer does not alter either
OpenCode configuration file; V1 auto-discovers the local plugin and projected
definitions.

## Identifier and resource mapping

OpenCode requires a globally unique lowercase kebab skill directory and matching
frontmatter name. The projector therefore maps `plugin:skill` to
`plugin-skill`. A generated command with the same hyphenated name loads that
skill and forwards `$ARGUMENTS`. This lets `coding:lint` and `react:lint`
coexist as `coding-lint` and `react-lint`.

Each projected skill retains its resource tree. Markdown links that leave the
skill directory are retargeted into `alvis/plugins/<plugin>`, where the complete
resolved plugin bundles preserve cross-plugin references, standards, templates,
scripts, and hook payloads. Runtime context also states that `@plugin:path`
means that bundled path.

Agent names remain canonical because routing payloads refer to them. A duplicate
agent name across selected plugins aborts projection. The generator combines
canonical metadata and body with the Claude initial prompt, maps `maxTurns` to
OpenCode `steps`, translates supported colors, and omits `model` so the invoking
provider remains authoritative.

## Runtime adapter

OpenCode V1 loads `plugins/alvis-marketplace.js` without extra npm dependencies. <!-- doc-path-gate: ignore -->
The adapter validates the manifest's resolved hook receipts, then:

- adds absent MCP definitions to the merged configuration, mapping Claude HTTP
  servers to OpenCode remote servers and command definitions to local arrays;
- preserves an existing user or project MCP entry with the same name and logs a
  warning;
- builds root, child, and unresolved context from each receipt's audience,
  adding `MAINAGENT` only after its required projected lead is verified;
- executes receipt-bound context scripts and payloads through
  `experimental.chat.system.transform`, mutating `output.system` in place;
- iterates receipt-bound before hooks for `question`, `task`, available plan
  aliases, and skill-scoped command aliases, rejecting denials before execution;
- retains allow advice by session and call identity, appends it to the matching
  result, and clears it after consumption, session idle/deletion, or disposal;
- runs receipt-bound post-rewrite verification after command execution without
  replacing existing output or metadata;
- gives each spawned script a cloned environment whose conflicting native roots
  are cleared and whose child-local `PLUGIN_ROOT` names the verified projected
  bundle, without mutating `process.env`; and
- disables a user-scope adapter when the active worktree has a complete project
  projection, preventing double injection. Suppression verifies the matching
  contract, adapter, and every receipt-bound runtime resource; a marker-only or
  incomplete directory leaves the user adapter active.

The system-transform hook is experimental in the V1 plugin type, so its matrix
status is 🧪. Registering known plan aliases preserves their validators when the
host emits a matching tool event, but V1 has no native plan-transition event.
Stop has no blocking event and is injected only as labelled advisory context;
the adapter never creates a synthetic turn. Task sessions support child agents,
but not persistent teammate identities or direct peer messaging. If session
lookup cannot establish root or child status, the adapter injects no
`MAINAGENT` or `SUBAGENT` payload; it never promotes an unresolved session to
root behavior.

## Fail-closed boundaries

Agent overlays may contain security-sensitive Claude hooks. The projector maps
the two recognized critic write fences to OpenCode granular edit permissions,
limits edits to rooted agent-memory and canonical review-state paths, denies
shell and external-directory access for those critics, and rejects a canonical
hook unless its complete policy digest is recognized. It does not infer models,
permission modes, isolation, background execution, or memory features that
OpenCode does not document as equivalent.

Runtime reads are receipt-bound. The installer rejects any global or
skill-frontmatter hook whose event, matcher, command shape, script, payload, or
requirements are not represented in `scripts/opencode_contract.json`. Plugin
names and bundle paths must match that protocol; every executable, supporting
resource, or payload must remain beneath its regular-file bundle path and match
its recorded digest before it is read or spawned. The compatibility generator
uses the same hook authority, so an unsupported registration cannot silently
disappear from the matrix.

Replacement authority is also bound outside the projected tree. The installer
stores a target-specific ownership record and durable transaction journal under
`${XDG_STATE_HOME:-~/.local/state}/alvis-opencode-v1/`. A manifest without the
matching external record is unmanaged even when its paths and digests look
canonical. Before the first rename, the installer fsyncs a journal containing
the prior and desired path digests; a later non-dry run rolls back an
interrupted transaction or cleans up a transaction whose ownership commit
completed. Schema-v1 authentication uses the legacy manifest and external
receipt schema independently of the current contract, then commits schema-v2
ownership only after the new install succeeds. Dry-run never mutates recovery
state and stops when recovery is required.

`COMPATIBILITY.md` is generated from current skill and agent sources plus explicit
cross-harness exceptions. Its emoji is part of the claim: adapted, experimental,
external, and unavailable features must never be rewritten as native support.

## Upstream documentation

OpenCode V1 claims were reviewed on 2026-08-25 against its documentation for
[plugins](https://dev.opencode.ai/docs/plugins/),
[skills](https://opencode.ai/docs/skills/),
[agents](https://opencode.ai/docs/agents/),
[commands](https://opencode.ai/docs/commands/),
[tools](https://opencode.ai/docs/tools/),
[permissions](https://opencode.ai/docs/permissions/),
[MCP servers](https://opencode.ai/docs/mcp-servers/), and
[rules](https://opencode.ai/docs/rules/). Grok compatibility is grounded in
[xAI's skills, plugins, and marketplaces documentation](https://docs.x.ai/build/features/skills-plugins-marketplaces).
