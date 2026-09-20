# ADR-1: Resolve installed plugins through a projected harness adapter

- Status: Accepted

## Context

Each plugin is an independently installed unit. A hook may execute files in its own plugin or a declared dependency, but a repository-relative sibling path is not an installation contract: Claude Code records installed roots in its registry, Codex uses versioned marketplace caches, and Grok Build may execute the source-shaped marketplace projection.

The native harnesses expose only the invoking plugin's root. Repeating harness-specific discovery in every hook would duplicate security-sensitive path logic and let the copies drift.

## Decision

The repository owns one canonical extensionless resolver at `scripts/plugin-root`. The projection at `scripts/plugin-root-projection.ts` copies it byte-for-byte to `scripts/plugin-root` inside every marketplace plugin so a plugin can invoke the resolver without reaching outside its installation boundary.

This resolver is the only file permitted to be duplicated across plugin directories. Every other shared behavior or asset has one owning plugin and is consumed through that declared dependency.

The resolver accepts exactly one lowercase kebab-case plugin name. It identifies the active native harness from `PLUGIN_ROOT`, `GROK_PLUGIN_ROOT`, or `CLAUDE_PLUGIN_ROOT` in that precedence order, resolves only an installation from the same marketplace as the invoking plugin, writes the canonical absolute plugin root and one newline to stdout, and otherwise exits with status 1 and no output.

Claude resolution binds the invoking root to `installed_plugins.json` and selects the requested plugin from the same marketplace. Codex resolution uses the invoking cache marketplace and prefers the same installed version, accepting another version only when exactly one valid installed candidate exists. Grok resolution uses the source-shaped marketplace plugin set. Every candidate must contain a harness manifest whose declared name equals the requested name.

Hooks that need Essential invoke their own projected resolver with `essential`, then run the returned `essential:scripts/...` resource. They never assume Essential is a relative sibling or share a cache depth with the caller.

## Consequences

Every plugin carries one small identical resolver, while all discovery policy remains canonical and mechanically projected. A missing, ambiguous, malformed, wrong-marketplace, or manifest-mismatched installation fails closed before a dependency script runs. Adding a native harness requires extending the canonical resolver and its behavior tests before any hook can rely on that harness.
