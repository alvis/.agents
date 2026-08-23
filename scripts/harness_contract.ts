/** shell parameter expansion resolving the installed plugin root across Claude Code, Codex, and Grok Build */
export const PLUGIN_ROOT_ANCHOR =
  "${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-${GROK_PLUGIN_ROOT:-}}}";

/** environment variables that may carry the plugin root for Claude Code, Codex, or Grok Build, in resolution order */
export const HARNESS_ROOT_VARIABLES = [
  "CLAUDE_PLUGIN_ROOT",
  "PLUGIN_ROOT",
  "GROK_PLUGIN_ROOT",
] as const;

/** guard prefix failing loudly when no harness supplied a plugin root */
export const PLUGIN_ROOT_GUARD = `[ -n "${PLUGIN_ROOT_ANCHOR}" ] || { echo "plugin root unset" >&2; exit 1; }; `;
