# ADR-1: Resolve installed plugins through a projected harness adapter

📌

Plugins use a shared lookup command to find an installed dependency before running its scripts. This allows the same plugin to use its dependencies across Claude Code, Codex, and Grok Build without guessing their installation paths.

- Status: Accepted

## 🎯 Motivation

A hook is a command an app runs automatically in response to an event. When a hook in the Coding plugin needs to run a script from the Essential plugin, it must first locate Essential's installation. Without a shared lookup mechanism, each hook would need its own way to find that directory. Assuming a fixed path could cause the hook to miss the script or run a copy from an unrelated installation.

## 🧭 Context

Claude Code, Codex, and Grok Build are the apps that load plugins and run their hooks; this record calls them native harnesses. Each harness tells a hook where its own plugin is installed, but not where its dependencies are installed.

Plugins are installed independently, even when they belong to the same marketplace—the set of plugins distributed together. Their locations depend on the harness: Claude Code records installed locations in a registry, Codex uses caches with separate plugin versions, and Grok Build may run a copy that retains the marketplace's source layout.

Coding declares Essential as a dependency, allowing its hooks to run Essential's scripts under the [repository's plugin execution boundary](../../../../AGENTS.md#repository-contract). That declaration permits access; the hook still needs to locate the installed dependency before it can use it.

## ✅ Decision

Each plugin includes a copy of a shared resolver: a command that finds an installed plugin by name. A Coding hook asks its local resolver for Essential's installation directory, then uses that directory to run the script. All copies come from one maintained source so every hook follows the same lookup rules.

The repository keeps the maintained resolver source at `scripts/plugin-root`; the filename has no extension. The projection script at `scripts/plugin-root-projection.ts` copies it byte-for-byte to `scripts/plugin-root` inside every marketplace plugin. A plugin can therefore invoke its own copy without reaching outside its installation boundary.

This resolver is the only file permitted to be duplicated across plugin directories. Every other shared behavior or asset has one owning plugin and is consumed through that declared dependency.

The resolver accepts exactly one lowercase kebab-case plugin name, such as `essential`. It identifies the active native harness from `PLUGIN_ROOT`, `GROK_PLUGIN_ROOT`, or `CLAUDE_PLUGIN_ROOT` in that precedence order, and resolves only an installation from the same marketplace as the invoking plugin. On success it writes the canonical absolute plugin root (the resolved installation directory) followed by one newline to standard output; otherwise it exits with status 1 and no output.

For Claude Code, the resolver matches the invoking plugin's location to `installed_plugins.json` and selects the requested plugin from that marketplace. For Codex, it uses the invoking plugin's cached marketplace and prefers the same installed version, accepting another version only when exactly one valid installed candidate exists. For Grok Build, it uses the marketplace plugins laid out like the source repository. Every candidate must contain a harness manifest—the plugin's identity file—whose declared name equals the requested name.

Hooks that need Essential invoke their own copy of the resolver with `essential`, then use the returned directory to run the required `essential:scripts/...` resource. They never assume Essential is in a neighboring directory or at the same depth in a cache as the calling plugin.

## 🔀 Alternatives considered

Guessing a dependency's location from the calling plugin's folder would tie hooks to a particular installation layout. Because the native harnesses use different layouts, a guessed path could miss the dependency or reach an unrelated installation.

## ⚖️ Consequences

Every plugin carries one small identical resolver, which costs space and requires the projection to stay current. In return, all discovery policy remains in one source file and is copied mechanically. If an installation is missing, ambiguous, malformed, from another marketplace, or has a manifest that names a different plugin, the resolver exits without running the dependency script. Adding a native harness requires extending the canonical resolver and its behavior tests before any hook can rely on that harness.
