import { lstatSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { GrokPluginError, readGrokPlugins } from "./grok.ts";
import type { GrokPlugin } from "./grok.ts";

/** the current session's instruction audience */
export type GrokAudience = "main" | "subagent";

/** one payload and the plugin root that resolves its paths */
export interface GrokContextPayload {
  readonly root: string;
  readonly content: string;
}

const usage = "usage: context.ts --audience {main,subagent}";

/**
 * loads Grok context for an explicitly selected session audience
 * @param argv command arguments
 * @returns zero on success, two on invalid arguments or unavailable context
 */
export function main(argv = process.argv.slice(2)): number {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    process.stdout.write(`${usage}\n`);
    return 0;
  }
  const audience =
    argv.length === 2 && argv[0] === "--audience"
      ? argv[1]
      : argv.length === 1 && argv[0]!.startsWith("--audience=")
        ? argv[0]!.slice("--audience=".length)
        : undefined;
  if (audience !== "main" && audience !== "subagent") {
    process.stderr.write(`${usage}\n`);
    return 2;
  }
  try {
    const context = readGrokContext(readGrokPlugins(), audience);
    process.stdout.write(context);
    return 0;
  } catch (error) {
    process.stderr.write(
      `Grok context unavailable: ${(error as Error).message}\n`,
    );
    return 2;
  }
}

/**
 * reads every enabled plugin's payloads for the current audience
 * @param plugins effective Grok plugin inventory
 * @param audience current session identity
 * @returns the complete context only after every required read succeeds
 */
export function readGrokContext(
  plugins: readonly GrokPlugin[],
  audience: GrokAudience,
): string {
  const enabled = plugins
    .filter((plugin) => plugin.enabled)
    .sort(
      (left, right) =>
        Number(right.name === "essential") -
          Number(left.name === "essential") ||
        left.name.localeCompare(right.name),
    );
  const payloads = enabled.flatMap((plugin) => {
    if (!isAbsolute(plugin.path))
      throw new GrokPluginError(
        `enabled Grok plugin root must be absolute: ${plugin.path}`,
      );
    if (!statSync(plugin.path).isDirectory())
      throw new GrokPluginError(
        `enabled Grok plugin root is not a directory: ${plugin.path}`,
      );
    const hooks = join(plugin.path, "hooks");
    if (lstatSync(hooks, { throwIfNoEntry: false }) === undefined) return [];
    if (!statSync(hooks).isDirectory())
      throw new GrokPluginError(
        `Grok payload directory is not a directory: ${hooks}`,
      );
    return [
      "ALLAGENT.md",
      audience === "main" ? "MAINAGENT.md" : "SUBAGENT.md",
    ].flatMap((filename) => {
      const path = join(hooks, filename);
      if (lstatSync(path, { throwIfNoEntry: false }) === undefined) return [];
      if (!statSync(path).isFile())
        throw new GrokPluginError(
          `Grok payload is not a regular file: ${path}`,
        );
      return [{ root: plugin.path, content: readFileSync(path, "utf8") }];
    });
  });
  return renderGrokContext(payloads);
}

/**
 * renders loaded payloads with each plugin's own absolute paths
 * @param payloads loaded plugin instructions in delivery order
 * @returns the complete substituted context
 */
export function renderGrokContext(
  payloads: readonly GrokContextPayload[],
): string {
  return payloads
    .map(({ root, content }) =>
      content.replaceAll("{{PLUGIN_DIR}}", () => root),
    )
    .join("\n\n");
}

if (import.meta.main) process.exit(main());
