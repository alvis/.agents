/** an effective plugin entry reported by Grok inspection */
export interface GrokPlugin {
  readonly name: string;
  readonly path: string;
  readonly enabled: boolean;
}

/** invalid Grok inventory or unreadable enabled plugin context */
export class GrokPluginError extends Error {}

/**
 * reads the effective plugin inventory from Grok in the current directory
 * @returns validated plugin identities, paths and enablement
 */
export function readGrokPlugins(): GrokPlugin[] {
  let completed: Bun.SyncSubprocess<"pipe", "pipe">;
  try {
    completed = Bun.spawnSync(["grok", "inspect", "--json"], {
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    throw new GrokPluginError(
      `cannot inspect Grok plugins: ${(error as Error).message}`,
      { cause: error },
    );
  }
  if (completed.exitCode !== 0)
    throw new GrokPluginError(
      `cannot inspect Grok plugins: ${completed.stderr.toString().trim() || completed.stdout.toString().trim() || `exit ${completed.exitCode}`}`,
    );
  let inspected: unknown;
  try {
    inspected = JSON.parse(completed.stdout.toString());
  } catch (error) {
    throw new GrokPluginError(
      `invalid JSON from grok inspect: ${(error as Error).message}`,
      { cause: error },
    );
  }
  if (!isRecord(inspected) || !Array.isArray(inspected.plugins))
    throw new GrokPluginError(
      "grok inspect --json did not return a plugins list",
    );
  return inspected.plugins.map((plugin: unknown) => {
    if (
      !isRecord(plugin) ||
      typeof plugin.name !== "string" ||
      !/^[A-Za-z0-9._-]+$/.test(plugin.name) ||
      typeof plugin.path !== "string" ||
      typeof plugin.enabled !== "boolean"
    )
      throw new GrokPluginError("invalid plugin record from grok inspect");
    return { name: plugin.name, path: plugin.path, enabled: plugin.enabled };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
