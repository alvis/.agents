/** shell parameter expansion resolving the installed plugin root across harnesses */
export const PLUGIN_ROOT_ANCHOR = "${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}";

/** environment variables that may carry the plugin root, in resolution order */
export const HARNESS_ROOT_VARIABLES = [
  "CLAUDE_PLUGIN_ROOT",
  "PLUGIN_ROOT",
] as const;

/** guard prefix failing loudly when no harness supplied a plugin root */
export const PLUGIN_ROOT_GUARD = `[ -n "${PLUGIN_ROOT_ANCHOR}" ] || { echo "plugin root unset" >&2; exit 1; }; `;
