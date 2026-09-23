# Harness projections

## Support tiers

The files under `plugins/` are the source of truth. Claude Code consumes each `.claude-plugin` manifest; Codex consumes the committed `.codex-plugin` manifests and `.agents/plugins/marketplace.json`. Both are native targets and must remain behaviorally aligned. Maintain the marketplace manifests manually when the plugin set or source manifests change.

Grok Build is a native target with compatibility adapters for individual features: xAI documents direct loading of Claude marketplaces, plugins, skills, agents, MCP servers, hooks, and instructions. The committed `.grok-plugin/marketplace.json` keeps its marketplace catalog aligned with the native manifests.

OpenCode support targets stable V1 only. Its documented extension layout differs from this marketplace, so `scripts/install_opencode.ts` produces a managed directory projection and installs `scripts/opencode_adapter.js` as a local plugin. OpenCode V2 and `opencode2` are outside this contract.

Current feature status belongs to the manually maintained [`COMPATIBILITY.md`](../../COMPATIBILITY.md). Adapted, experimental, external, and unavailable behavior must not be flattened into a native-support claim.

## Native payload injection

`ALLAGENT.md`, `MAINAGENT.md`, and `SUBAGENT.md` are shipped product rather than developer documentation. Each context-owning plugin registers payload commands in `plugins/<p>/hooks/hooks.json`; static commands derive from the single `nativePayloadCommand` builder in [`scripts/harness_contract.ts`](../../scripts/harness_contract.ts).

Claude Code sets `CLAUDE_PLUGIN_ROOT`, Codex sets `PLUGIN_ROOT`, and Grok Build sets `GROK_PLUGIN_ROOT`. Codex and Grok also set a Claude compatibility alias, but the native variable takes precedence. Every command path, including substitution paths, uses that ordered anchor and quotes it because a root may contain spaces. Preserve the order in `resolve_harness`: the variables identify the harness as well as its path. A Claude alias can resolve the right directory while misidentifying Codex, causing a Codex-only Stop validator to exit without feedback.

Test native identity and feedback with native and compatibility variables set together. A path-only test misses identity failures; a test that inherits another harness's variables proves the wrong path. An unresolved root exits nonzero instead of letting a successful `sed | jq` pipeline emit nothing. Do not extend the native chain for a compatibility consumer. A future native harness may extend it only from that harness's documentation and in every command in the same change; a partial update fails silently. See [Native harness resolution](../../ARCHITECTURE.md#native-harness-resolution).

- `ALLAGENT.md` serves `SessionStart` and `SubagentStart` and contains only its plugin's routing. It never becomes a central roster.
- `MAINAGENT.md` serves `SessionStart` and contains the owner's main-session decision gate: Coding selects topology by semantic risk and Web binds design initiatives to `design-lead`.
- `SUBAGENT.md` is Essential-only and serves `SubagentStart`.

Payload paths use `{{PLUGIN_DIR}}`; native hooks substitute the current plugin root. OpenCode sets none of the native root variables: its adapter reads the projected bundle and substitutes paths directly. Payloads and their unconditional instructional reads are byte-budgeted, so they link to details at the decision point instead of embedding them.

Root [`AGENTS.md`](../../AGENTS.md) uses ordinary repository memory discovery. It is not shipped, hook-injected, or included in payload byte budgets.

## Native installation and Grok context

`essential:install` and `essential:uninstall` share installation ownership and transaction mechanics under Essential's `scripts/`. A destination-local receipt records installed files and their content hashes; uninstall removes only matching owned content and retains edited files and needed support. Conflicting unowned files are preserved. Installation stages changes, publishes the receipt last, and rolls back failed operations.

Grok alone adds a managed instruction in its user `AGENTS.md` to read the packaged [Grok bootstrap](../../plugins/essential/directions/GROK.md). The bootstrap invokes its adjacent plugin's [`context.ts`](../../plugins/essential/scripts/context.ts) with an explicit main or subagent audience. This loader shares the `grok inspect --json` reader in [`grok.ts`](../../plugins/essential/scripts/grok.ts) with agent installation, selects every enabled plugin, and reads the applicable payloads before emitting any context. Discovery or read failures return an error; absent optional payloads are skipped. Installer marketplace trust filtering remains separate from context loading.

Canonical instructions remain in the payloads, and their `{{PLUGIN_DIR}}` references resolve against their reported plugin roots. The loader's own path stays anchored to the `GROK.md` that was read, even when discovery reports another Essential installation. Conditional workflows remain lazy. The model must read the bootstrap and loader output; this does not imply automatic `@` expansion or consumption of passive SessionStart output. Reinstallation refreshes moved bootstrap references; uninstall preserves surrounding user rules.

Claude and Codex retain native context hooks. OpenCode V1 retains its receipt-bound system transform. None of these context routes depends on installed specialist agents or another harness's setup. Native installer receipts do not grant removal authority over OpenCode's projection.

Grok keeps native payload registrations, but its `SessionStart` and `SubagentStart` handlers ignore stdout. The managed bootstrap is therefore its instruction route, and model compliance remains experimental. PreToolUse validators still run natively: Grok emits top-level `{"decision","reason"}` for allow or deny, while Claude and Codex express an allow through a PreToolUse context envelope, including empty `additionalContext` when there is no reason, and leave the decision to their permission systems. Grok ignores Stop stdout, so the pending-checkpoint `.state` recovery block remains advisory there. `essential:uninstall` removes the owned attachment and unmodified installed agents.

Native static `SessionStart` payload commands derive from [`nativePayloadCommand`](../../scripts/harness_contract.ts). `startup` and `clear` load the applicable `ALLAGENT.md` and `MAINAGENT.md` payloads; `resume` and `compact` suppress those unchanged static payloads while Essential's session script may still emit dynamic lifecycle and runtime metadata. Missing, malformed, or unknown source input takes the startup path so required context is not silently removed. Resume does not compare payload content or discover changes; a deliberate `clear` reloads the current bytes. `SubagentStart` remains independent of this lifecycle gate.

## Installed dependency resolution

Native hooks execute only plugin-local scripts or scripts in declared dependencies. Each plugin carries a generated `scripts/plugin-root` projection from the canonical root `scripts/plugin-root`; [ADR-1](decisions/harness/adr-1-installed-plugin-resolution.md) owns why this resolver is the single permitted duplicated executable.

The resolver takes one plugin name and returns that plugin's canonical installed root. Claude Code uses its installed-plugin registry, Codex uses the invoking marketplace cache with ambiguity rejection, and Grok Build uses the source-shaped marketplace plugin set. Every candidate is verified against its harness manifest, and an absent or ambiguous dependency exits 1 with empty stdout.

## Conditional domain context

Essential's static payload remains universal. The client, coding, governance, production, React, specification, and web plugins instead own deterministic request, operation, and agent-role matchers in their local `plugins/<p>/hooks/context.json`. <!-- doc-path-gate: ignore --> Matching a domain activates its `ALLAGENT.md` plus the audience payload for the current context lifetime. Activated domains are sticky: later evidence may add another domain without a restart, while an unchanged payload identity is not delivered again. `startup` and `clear` begin a fresh lifetime; `resume` and `compact` retain acknowledged delivery. Missing, malformed, or mismatched identity evidence fails safe by emitting applicable instructions again.

The policy files are the authority for applicability. Explicit domain names, common domain terms, known operations, and specialist roles favor safety and can activate context that a narrowly scoped task does not ultimately need. Novel paraphrases or unrecognized tools can miss activation until later request or operation evidence matches. Policy changes belong to the owning plugin; there is no central domain roster.

Every native conditional registration carries the portable `"*"` matcher so the hook applies to every invocation that its event can expose. Codex and Grok ignore matcher values for `UserPromptSubmit`, and OpenCode V1 has no native hook matcher event; the runtime policy therefore remains the authority that narrows prompt, operation, repository, and role evidence. The OpenCode adapter projects `"*"` as the same universal invocation set.

Claude and Codex bind transparent delivery receipts to the native harness, session, working directory, plugin root, audience, policy identity, and payload identities. Grok's model-invoked loader has no supported access to the hook runner's session identifier, so it returns a transparent receipt that the caller must pass back on the next task. Its PostToolUse bridge acknowledges only an exact, successful, untruncated loader invocation whose output still matches the enabled inventory and current content. A missing or invalid caller receipt re-emits context. A later third-party hook can replace any tool result after this repository's bridge has run; that host-wide behavior is outside this delivery guarantee.

When a Grok operation is the first evidence for a domain, the one-time denial returns JSON containing the context, a plugin-local delivery receipt, and the retry instruction. The caller passes that receipt once as `--delivered-receipt` beside its retained global `--receipt`; the loader validates current scope, audience, plugin root, policy, and payload identities, then returns a refreshed global receipt. This synchronization can produce receipt-only JSON. Later unchanged calls with the refreshed receipt produce no output. Omitting the handoff deliberately fails safe by re-emitting the instructions.

OpenCode reconstructs the full active domain set in its per-request system context and stores a projection-, session-, directory-, and audience-bound receipt so adapter recreation does not lose activation. Session deletion retires that exact receipt. Prompt activation records receipt state only; the system transform is the sole request-time delivery channel, so activated text is not also persisted as a synthetic chat message. If durable receipt storage is unavailable, the active adapter keeps the same identity-bound receipt in memory so current requests still receive one copy; restart durability resumes only after storage recovers. Session deletion and adapter disposal clear that fallback. On Grok and OpenCode, when a tool operation is the first evidence for a domain and the host cannot show new instructions before executing it, the adapter rejects that one attempt with the newly activated context and asks for an identical retry. The native receipt makes the retry a no-op; independent permission and publication denials still run and are never bypassed.

`essential:scripts/domain-context.ts` owns the delivery algorithm. Every domain plugin requires Essential and its hook invokes the current plugin's generated `scripts/plugin-root` copy to locate that one canonical TypeScript runtime before running it with Bun; source-shaped and versioned native installations therefore resolve the dependency without plugin-local runtime copies or cache-layout assumptions. Regenerate the hook registrations with `bun scripts/domain-hook-projection.ts`. Executable and manifest artifact bytes are measured separately from model-read instructional bytes.

## Native plan validation

Claude Code supplies plan prose to Essential's plan-transition `PreToolUse` validator. T3-hosted Codex Plan Mode instead emits a plan response without that tool call. Essential's Codex-only Stop adapter reads the newest assistant response for the current `turn_id` from `transcript_path`, requires one complete `<proposed_plan>` block, and delegates its body to the same heading validator. The first failure blocks for one corrective continuation; a second failure stops visibly. Because Stop follows response emission, it cannot retract a malformed plan already rendered by T3.

Grok Build's plan tool supplies no plan body and ignores blocking Stop output. OpenCode V1 exposes neither a native plan-transition event nor cancellable Stop, so their receipts remain adapted and unavailable respectively.

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

The installer accepts explicit plugin names or `--all`, resolves dependencies before dependents, and obtains each plugin and skill inventory from `git ls-files --cached --others --exclude-standard`. It reads modified tracked bytes from the worktree, skips deleted entries, and rejects source symlinks and other non-regular entries before mutating the target. Ignored environments, caches, and build artifacts therefore cannot enter either projection location.

Every output is staged as a regular file. The installer preflights destination paths, refuses unmanaged collisions, backs up prior managed files, installs with atomic renames, and rolls back if an installation step fails. The schema-v2 manifest is the final commit marker and records every managed path, source digest, and resolved hook receipt. Repeating an install with the same worktree produces the same inventory and digests.

A later run may replace or retire only authenticated recorded paths. Existing schema-v2 paths must be regular files with matching digests. An independently authenticated schema-v1 projection may also retire non-desired legacy symlinks: the installer moves the link itself into its transaction backup and never reads or changes its target. Modified, forged, overlapping, unowned, and current-schema non-regular claims remain fatal.

Project scope writes `<project>/.opencode`. User scope writes `${XDG_CONFIG_HOME:-~/.config}/opencode`. The installer does not alter either OpenCode configuration file; V1 auto-discovers the local plugin and projected definitions.

## Identifier and resource mapping

OpenCode requires a globally unique lowercase kebab skill directory and matching frontmatter name. The projector therefore maps `plugin:skill` to `plugin-skill`. A generated command with the same hyphenated name loads that skill and forwards `$ARGUMENTS`. This lets `coding:lint` and `react:lint` coexist as `coding-lint` and `react-lint`.

Each projected skill retains its resource tree. Markdown links that leave the skill directory are retargeted into `alvis/plugins/<plugin>`, where the complete resolved plugin bundles preserve cross-plugin references, standards, templates, scripts, and hook payloads. Runtime context also states that `@plugin:path` means that bundled path.

Agent names remain canonical because routing payloads refer to them. A duplicate agent name across selected plugins aborts projection. The generator combines canonical metadata and body with the Claude initial prompt, maps `maxTurns` to OpenCode `steps`, translates supported colors, and omits `model` so the invoking provider remains authoritative.

## Runtime adapter

OpenCode V1 loads `plugins/alvis-marketplace.js` without extra npm dependencies. <!-- doc-path-gate: ignore --> The adapter validates the manifest's resolved hook receipts, then:

- adds absent MCP definitions to the merged configuration, mapping Claude HTTP servers to OpenCode remote servers and command definitions to local arrays;
- preserves an existing user or project MCP entry with the same name and logs a warning;
- builds root, child, and unresolved universal context from each receipt's audience, then reconstructs only the active domain context for the current request;
- executes receipt-bound context scripts and payloads through `experimental.chat.system.transform`, mutating `output.system` in place;
- iterates receipt-bound before hooks for `question`, `task`, available plan aliases, and skill-scoped command aliases, rejecting denials before execution;
- retains allow advice by session and call identity, appends it to the matching result, and clears it after consumption, session idle/deletion, or disposal;
- runs receipt-bound post-rewrite verification after command execution without replacing existing output or metadata;
- gives each spawned script a cloned environment whose conflicting native roots are cleared and whose child-local `PLUGIN_ROOT` names the verified projected bundle, without mutating `process.env`; and
- disables a user-scope adapter when the active worktree has a complete project projection, preventing double injection. Suppression verifies the matching contract, adapter, and every receipt-bound runtime resource; a marker-only or incomplete directory leaves the user adapter active.

Coding's global review-publication hook is an executable permission boundary rather than injected guidance. Native harnesses invoke its plugin-local adapter before supported shell tools; OpenCode V1 authenticates both that adapter and the canonical review contract as receipt-bound resources before running the same decision. The gate permits only the exact canonical publisher form and rejects recognized raw `gh pr`, protected REST, and protected GraphQL review/comment writes after normalizing the documented finite wrapper set. It does not observe arbitrary aliases or scripts, nested runtimes, `curl`, SDK/MCP clients, unsupported wrappers, or another network tool, so compatibility claims name those boundaries instead of treating command matching as universal interception.

The system-transform hook is experimental in the V1 plugin type, so its matrix status is 🧪. Registering known plan aliases preserves their validators when the host emits a matching tool event, but V1 has no native plan-transition event. Stop has no blocking event and is injected only as labelled advisory context; the adapter never creates a synthetic turn. Task sessions support child agents, but not persistent teammate identities or direct peer messaging. If session lookup cannot establish root or child status, the adapter injects no `MAINAGENT` or `SUBAGENT` payload; it never promotes an unresolved session to root behavior.

## Fail-closed boundaries

Agent overlays may contain security-sensitive Claude hooks. The projector maps the two recognized critic write fences to OpenCode granular edit permissions, limits edits to rooted agent-memory and canonical review-state paths, denies shell and external-directory access for those critics, and rejects a canonical hook unless its complete policy digest is recognized. It does not infer models, permission modes, isolation, background execution, or memory features that OpenCode does not document as equivalent.

Runtime reads are receipt-bound. The installer rejects any global or skill-frontmatter hook whose event, matcher, command shape, script, payload, or requirements are not represented in `scripts/opencode_contract.json`. Plugin names and bundle paths must match that protocol; every executable, supporting resource, or payload must remain beneath its regular-file bundle path and match its recorded digest before it is read or spawned. The compatibility matrix uses the same hook authority, so an unsupported registration cannot silently disappear from the matrix.

The review-publication receipt separately binds one independent assessment to its rendered bytes, repository and pull request, head/base pair, identities exposed by the workflow, inline anchors, event, trust caps, and authorization evidence. Its publisher repeats live metadata and authorization reads immediately before the one transport write and fails closed when those reads or bindings differ. This provides deterministic consistency, not a cryptographic signature against a process with the same filesystem and command authority; GitHub also offers no atomic compare-and-publish operation after the final metadata read.

Replacement authority is also bound outside the projected tree. The installer stores a target-specific ownership record and durable transaction journal under `${XDG_STATE_HOME:-~/.local/state}/alvis-opencode-v1/`. A manifest without the matching external record is unmanaged even when its paths and digests look canonical. Before the first rename, the installer fsyncs a journal containing the prior and desired path digests; a later non-dry run rolls back an interrupted transaction or cleans up a transaction whose ownership commit completed. Schema-v1 authentication uses the legacy manifest and external receipt schema independently of the current contract, then commits schema-v2 ownership only after the new install succeeds. Dry-run never mutates recovery state and stops when recovery is required.

`COMPATIBILITY.md` is maintained from current skill and agent sources plus explicit cross-harness exceptions. Its emoji is part of the claim: adapted, experimental, external, and unavailable features must never be rewritten as native support.

## Upstream documentation

OpenCode V1 claims are grounded in its documentation for [plugins](https://dev.opencode.ai/docs/plugins/), [skills](https://opencode.ai/docs/skills/), [agents](https://opencode.ai/docs/agents/), [commands](https://opencode.ai/docs/commands/), [tools](https://opencode.ai/docs/tools/), [permissions](https://opencode.ai/docs/permissions/), [MCP servers](https://opencode.ai/docs/mcp-servers/), and [rules](https://opencode.ai/docs/rules/). Grok compatibility is grounded in [xAI's skills, plugins, and marketplaces documentation](https://docs.x.ai/build/features/skills-plugins-marketplaces).
