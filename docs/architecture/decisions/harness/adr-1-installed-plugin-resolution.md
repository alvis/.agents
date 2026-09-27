# ADR-1: Resolve installed plugins through a projected harness adapter

📌

Plugins use a shared lookup command to find an installed dependency before running its scripts. This lets hooks work across Claude Code, Codex, and Grok Build without guessing where another plugin is installed.

- Status: Accepted

## 🎯 Motivation

An engineer adds a startup command (a hook) to the Coding plugin. The hook needs to run a script supplied by the Essential plugin. Without a shared way to find Essential's installed location, the engineer would have to guess its folder. Because Claude Code, Codex, and Grok Build install plugins differently, that guess could miss the script or reach an unrelated installation.

## 🧭 Context

Each plugin is an independently installed unit. Coding declares Essential as a dependency, allowing its hook to run Essential's script under the [repository's plugin execution boundary](../../../../AGENTS.md#repository-contract). A marketplace is the set of plugins distributed together. Claude Code records installed locations in a registry, Codex uses caches with separate plugin versions, and Grok Build may run a copy that retains the marketplace's source layout.

These three apps, called native harnesses here, tell a hook only where its own plugin is installed.

## ✅ Decision

Each plugin gets a small copy of one shared resolver: a command that finds the installed location of a named plugin. A hook asks that resolver for Essential's location before running Essential's script. The repository keeps one source for the resolver so all copies follow the same rules.

The repository keeps the maintained resolver source at `scripts/plugin-root`; the filename has no extension. The projection script at `scripts/plugin-root-projection.ts` copies it byte-for-byte to `scripts/plugin-root` inside every marketplace plugin. A plugin can therefore invoke its own copy without reaching outside its installation boundary.

This resolver is the only file permitted to be duplicated across plugin directories. Every other shared behavior or asset has one owning plugin and is consumed through that declared dependency.

The resolver accepts exactly one lowercase kebab-case plugin name, such as `essential`. It identifies the active native harness from `PLUGIN_ROOT`, `GROK_PLUGIN_ROOT`, or `CLAUDE_PLUGIN_ROOT` in that precedence order, and resolves only an installation from the same marketplace as the invoking plugin. On success it writes the canonical absolute plugin root (the resolved installation directory) followed by one newline to standard output; otherwise it exits with status 1 and no output.

For Claude Code, the resolver matches the invoking plugin's location to `installed_plugins.json` and selects the requested plugin from that marketplace. For Codex, it uses the invoking plugin's cached marketplace and prefers the same installed version, accepting another version only when exactly one valid installed candidate exists. For Grok Build, it uses the marketplace plugins laid out like the source repository. Every candidate must contain a harness manifest—the plugin's identity file—whose declared name equals the requested name.

Hooks that need Essential invoke their own projected resolver with `essential`, then run the returned `essential:scripts/...` resource. They never assume Essential is a relative sibling or share a cache depth with the caller.

## 🔀 Alternatives considered

Guessing a dependency's location from the calling plugin's folder would tie hooks to a particular installation layout. Because the native harnesses use different layouts, a guessed path could miss the dependency or reach an unrelated installation.

## ⚖️ Consequences

Every plugin carries one small identical resolver, which costs space and requires the projection to stay current. In return, all discovery policy remains in one source file and is copied mechanically. If an installation is missing, ambiguous, malformed, from another marketplace, or has a manifest that names a different plugin, the resolver exits without running the dependency script. Adding a native harness requires extending the canonical resolver and its behavior tests before any hook can rely on that harness.
