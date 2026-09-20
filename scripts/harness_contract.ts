/**
 * native roots must precede Claude's compatibility alias: Codex and Grok set both
 * the first nonempty variable determines harness identity as well as the path
 * checking Claude first can resolve the correct directory but misidentify Codex as Claude,
 * causing its Codex-only Stop validator to exit successfully without feedback
 * keep resolve_harness in Essential's context.sh and derived consumers aligned
 */
export const PLUGIN_ROOT_ANCHOR =
  "${PLUGIN_ROOT:-${GROK_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-}}}";

/** environment variables that may carry the plugin root for Claude Code, Codex, or Grok Build, in resolution order */
export const HARNESS_ROOT_VARIABLES = [
  "PLUGIN_ROOT",
  "GROK_PLUGIN_ROOT",
  "CLAUDE_PLUGIN_ROOT",
] as const;

/** guard prefix failing loudly when no harness supplied a plugin root */
export const PLUGIN_ROOT_GUARD = `[ -n "${PLUGIN_ROOT_ANCHOR}" ] || { echo "plugin root unset" >&2; exit 1; }; `;

/**
 * builds static hook commands shared by native registrations and projection receipts
 *
 * @param event hook event selecting the context lifetime
 * @param payloadName static payload basename
 * @returns the shell command registered by each plugin
 */
export function nativePayloadCommand(event: string, payloadName: string): string {
  // raw slurping makes malformed JSON and non-object inputs fall back to startup
  const lifecycleGuard =
    event === "SessionStart"
      ? `if jq -Rse 'try (fromjson | if type == "object" then (.source == "resume" or .source == "compact") else false end) catch false' >/dev/null; then exit 0; fi; `
      : "";
  return `${PLUGIN_ROOT_GUARD}${lifecycleGuard}sed "s|{{PLUGIN_DIR}}|${PLUGIN_ROOT_ANCHOR}|g" "${PLUGIN_ROOT_ANCHOR}/hooks/${payloadName}.md" | jq -Rs '{hookSpecificOutput:{hookEventName:"${event}",additionalContext:.}}'`;
}
