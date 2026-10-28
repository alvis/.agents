# ADR-2: Resolve installed plugins from their declared marketplace

📌

Plugins use a shared lookup command to find an installed dependency before running its scripts. The lookup searches the invoking plugin's own marketplace unless the plugin's manifest names another marketplace for that dependency, so a plugin from a downstream marketplace can run this marketplace's hook runtime without guessing installation paths.

- Status: `Accepted`
- Date: `2026-10-28`

## 🎯 Motivation

A hook is a command an app runs automatically in response to an event. When a hook in the Coding plugin needs to run a script from the Essential plugin, it must first locate Essential's installation. A plugin published from another marketplace, such as a company marketplace that builds on this one, needs the same thing: its hooks inject context through Essential's runtime, so they must find `essential` installed from this marketplace. Without a shared lookup mechanism, each hook would need its own way to find that directory, and a fixed or guessed path could miss the script or run a copy from an unrelated installation.

## 🧭 Context

Claude Code, Codex, and Grok Build are the apps that load plugins and run their hooks; this record calls them native harnesses. Each harness tells a hook where its own plugin is installed, but not where its dependencies are installed.

Plugins are installed independently, even when they belong to the same marketplace, the set of plugins distributed together. Their locations depend on the harness: Claude Code records installed locations in a registry, Codex uses caches with separate plugin versions per marketplace, and Grok Build may run a copy that retains the marketplace's source layout.

A plugin declares its dependencies in `.claude-plugin/plugin.json`. A plain string entry names a plugin in the same marketplace. An object entry `{ "name": "essential", "marketplace": "alvis" }` names a plugin in another marketplace, which Claude Code honors only when the declaring marketplace lists that marketplace in `allowCrossMarketplaceDependenciesOn`. Codex has no dependency projection, but it installs the whole plugin directory, so the `.claude-plugin/plugin.json` declaration is present in its cache too. That declaration permits access; the hook still needs to locate the installed dependency before it can use it.

## ✅ Decision

Each plugin includes a copy of a shared resolver: a command that finds an installed plugin by name. It looks in the invoking plugin's own marketplace, or in the marketplace that the invoking plugin's manifest names for that dependency. All copies come from one maintained source so every hook follows the same lookup rules.

The repository keeps the maintained resolver source at `scripts/plugin-root`; the filename has no extension. The projection script at `scripts/plugin-root-projection.ts` copies it byte-for-byte to `scripts/plugin-root` inside every marketplace plugin. A plugin can therefore invoke its own copy without reaching outside its installation boundary. Downstream marketplaces copy the same file unchanged.

This resolver is the only file permitted to be duplicated across plugin directories. Every other shared behavior or asset has one owning plugin and is consumed through that declared dependency.

The resolver accepts exactly one lowercase kebab-case plugin name, such as `essential`. It identifies the active native harness from `PLUGIN_ROOT`, `GROK_PLUGIN_ROOT`, or `CLAUDE_PLUGIN_ROOT` in that precedence order. It then reads the invoking plugin's `.claude-plugin/plugin.json`:

- When exactly one object dependency with the requested name names a marketplace, that lowercase kebab-case marketplace is the target.
- When the requested plugin is declared only as a plain string or as an object without a marketplace, or is not declared, the invoking plugin's own marketplace is the target. A declaration that names the invoking plugin's own marketplace behaves the same way.
- When object dependencies name the requested plugin with conflicting or malformed marketplaces, or the manifest cannot be parsed, the resolver fails.

On success it writes the canonical absolute plugin root (the resolved installation directory) followed by one newline to standard output; otherwise it exits with status 1 and no output.

For Claude Code, the resolver selects the requested plugin from the target marketplace in `installed_plugins.json`; only when no marketplace is declared must the invoking plugin's location appear there, because the registry is then the only record of its own marketplace. A plugin loaded from a local directory therefore resolves a declared dependency without being installed itself. For Codex, it uses the target marketplace's cache; within its own marketplace it prefers the same installed version, and in every other marketplace it accepts only a single valid installed candidate. For a plugin laid out like the source repository, as Grok Build runs it, a same-named neighbor in `plugins/` qualifies only when the target is the marketplace whose `.claude-plugin/marketplace.json` encloses it, so a dependency declared in another marketplace never resolves to an unrelated neighbor. Every candidate must contain a harness manifest, the plugin's identity file, whose declared name equals the requested name.

Hooks that need Essential invoke their own copy of the resolver with `essential`, then use the returned directory to run the required `essential:scripts/...` resource. They never assume Essential is in a neighboring directory or at the same depth in a cache as the calling plugin.

## 🔀 Alternatives considered

Guessing a dependency's location from the calling plugin's folder would tie hooks to a particular installation layout. Because the native harnesses use different layouts, a guessed path could miss the dependency or reach an unrelated installation.

Letting a downstream marketplace ship inline hook commands that print its payloads avoids the resolver, but it bypasses Essential's runtime and loses delivery receipts, context gating, and re-injection after compaction. Vendoring a modified resolver into the downstream marketplace would fork the one permitted duplicate.

## ⚖️ Consequences

Every plugin carries one small identical resolver, which costs space and requires the projection to stay current. In return, all discovery policy remains in one source file and is copied mechanically. A downstream marketplace can rely on this marketplace's runtime by declaring the dependency with its marketplace, and nothing outside that declaration widens the search. If an installation is missing, ambiguous, malformed, from an undeclared marketplace, or has a manifest that names a different plugin, the resolver exits without running the dependency script. Grok Build cannot resolve a dependency from another marketplace until its layout for multiple marketplaces is known. Adding a native harness requires extending the canonical resolver and its behavior tests before any hook can rely on that harness.
