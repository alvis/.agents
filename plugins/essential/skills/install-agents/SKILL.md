---
name: install-agents
description: "Discover, validate, stitch, and install specialist agent templates contributed by Essential, its marketplace, and explicitly trusted enabled marketplaces. Use when asked to install agents, set up subagents, refresh the agent team, or configure Claude Code, Codex, or Grok Build on a new machine."
requirements:
  intelligence: medium
---

# Install Agents

Installs agent templates contributed by Essential, the other enabled plugins in
its marketplace, and any enabled marketplace named explicitly with
`--include-marketplace`. The same authoritative template becomes a Claude Code
Markdown definition under `~/.claude/agents/`, a Codex TOML definition under
`~/.codex/agents/`, or a Grok Build Markdown definition under
`${GROK_HOME:-${HOME}/.grok}/agents/`.

## What the installer does

`scripts/install-agents.sh` is idempotent and safe to re-run:

1. In a source checkout, discovers `plugins/*/agents/*`; from an installed Essential plugin, reads the current harness's plugin list and discovers templates from enabled plugins in Essential's marketplace plus explicitly included marketplaces. Codex plugin IDs and versions resolve beneath the loaded Essential cache root; marketplace source paths are never treated as installed roots.
2. Validates every `base.md` plus `frontmatter/meta.json`, `claude.json`, `codex.json`, and `grok.json` source set, including its role-only definition name, three distinct preferred short teammate names, runtime tool inheritance, intelligence, field ownership, centralized-policy boundary, and required project-memory path and maintenance contract, and rejects malformed or duplicate names before touching the destination. Installed mode translates recognized legacy single-file intelligence or model/effort projections from lagging sibling-plugin caches; source checkouts require the split schema.
3. Stitches all definitions into Claude Code Markdown, native Codex TOML, or native Grok Build Markdown. Shared `name`, `description`, and `intelligence` come only from `meta.json`; harness overlays contribute only harness-specific fields. `intelligence` is projected through the authoritative [intelligence matrix](references/intelligence-levels.json), which owns every harness's model and effort fields. Codex `nickname_candidates` are derived from the three validated preferred names in `description`. Neither `intelligence` nor the retired `intelligenceLevel` key is emitted.
4. Copies staged definitions into the selected harness's agent directory and regenerates shared lead support under `.essential/`, overwriting discovered same-named agents while leaving unrelated and formerly managed files untouched.
5. Prints each installed path and a final count.

Codex has no safe equivalent for Claude's color, permission mode, project-memory mode, worktree isolation, turn limit, startup prompt, or per-agent hooks, so the projection omits them. The Codex projection removes Claude-managed `Memory`, the Claude adapter's deterministic scripted-execution portion of `Delegation Modes`, and residual worktree or scripted-execution-launch promises elsewhere while retaining direct persistent delegation. Model tools, sandboxing, approvals, and local memories remain Codex-owned. Codex overlay fields must use scalar TOML-compatible values. The Grok Build projection applies the same body neutralization; it emits `model: inherit` plus the matrix's effort level and keeps memory harness-owned.

## Workflow

### Step 1: Run the installer

Run the command for the active harness:

```bash
# Claude Code
bash "${CLAUDE_PLUGIN_ROOT}/skills/install-agents/scripts/install-agents.sh" \
  --harness claude
# Codex
bash "<absolute directory containing this loaded SKILL.md>/scripts/install-agents.sh" \
  --harness codex
# Grok Build
bash "<absolute directory containing this loaded SKILL.md>/scripts/install-agents.sh" \
  --harness grok
```

Add repeatable `--include-marketplace <name>` arguments only for enabled
marketplaces the user explicitly trusts. Use the exact configured marketplace
name; this repository does not require an external marketplace.

For Codex and Grok Build, replace the placeholder with the directory from the loaded
`essential:install-agents` skill resource path exposed by the runtime; ordinary shell
calls do not receive a plugin-root environment variable. Neither harness currently
ingests this repository's custom agents directly from a plugin — Codex reads only
native TOML definitions and Grok Build discovers plugin agents only from direct
`agents/*.md` children, which our split layout never produces. This install step uses each harness's supported
personal-agent directory; start a fresh session afterward so it loads the new
definitions (TOML for Codex, Markdown for Grok Build).

### Step 2: Verify

Smoke-check one representative definition after confirming the installer's reported count:

```bash
# Claude Code
head -3 ~/.claude/agents/tech-lead.md

# Codex
head -3 "${CODEX_HOME:-$HOME/.codex}/agents/tech-lead.toml"

# Grok Build
head -3 "${GROK_HOME:-$HOME/.grok}/agents/tech-lead.md"
```

In a fresh session, the roster appears in the selected harness's agent list. For Codex, confirm representative generated `model` and `model_reasoning_effort` values match the matrix rows selected by those agents' `frontmatter/meta.json` intelligence values; for Grok Build, confirm representative `effort` values match (its `model` is `inherit`).

For maintainer verification, run the deterministic contract suite:

```bash
bun test plugins/essential/skills/install-agents/scripts/{stitch_agent,install_agents}.spec.ts
```

To inspect one stitched source definition directly, select any harness:

```bash
bun run plugins/essential/skills/install-agents/scripts/stitch_agent.ts \
  plugins/coding/agents/tech-lead --harness claude
bun run plugins/essential/skills/install-agents/scripts/stitch_agent.ts \
  plugins/coding/agents/tech-lead --harness codex
bun run plugins/essential/skills/install-agents/scripts/stitch_agent.ts \
  plugins/coding/agents/tech-lead --harness grok
```

The stitcher resolves Essential from normal source-checkout and installed-cache
layouts. For another layout, pass `--essential-root <plugin-root>`; it fails
rather than emitting an unresolved `@essential` reference.

### Step 3: Report

Tell the user:

- How many agents were installed and the selected destination
- That they take effect in the next session (the current session's agent list is fixed at startup)
- That re-running overwrites currently discovered agents and does not prune any other files
