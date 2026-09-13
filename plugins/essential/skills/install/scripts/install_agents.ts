import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";

import {
  AgentTemplateError,
  leadAgentDirectionAlias,
  leadAgentDirectionPath,
  stateSystemsReferencePath,
  loadAgentSources,
  stitchAgentDefinition,
  stitchCodexAgentDefinition,
  stitchGrokAgentDefinition,
} from "./stitch_agent.ts";

import { GrokPluginError, readGrokPlugins } from "../../../scripts/grok.ts";
import {
  defaultAgentDestination,
  installManagedFiles,
} from "../../../scripts/installation.ts";
import {
  canonicalDirectory,
  InstallationError,
} from "../../../scripts/installation/transaction.ts";
import type {
  HarnessName,
  InstallationFile,
  InstallationOptions,
} from "../../../scripts/installation.ts";

type PluginRecord = Record<string, unknown>;
/** discovery and installation settings */
export interface InstallOptions extends InstallationOptions {
  readonly pluginRecords?: readonly PluginRecord[];
  readonly includeMarketplaces?: readonly string[];
}

/** a discovered agent template directory and its owning plugin */
export interface AgentTemplate {
  readonly owner: string;
  readonly name: string;
  readonly path: string;
}
const cacheComponent = /^[A-Za-z0-9._-]+$/;
const cacheVersionComponent = /^[A-Za-z0-9._+-]+$/;
const scriptDirectory = import.meta.dirname;

function inside(root: string, target: string): boolean {
  const path = relative(root, target);
  return (
    path === "" ||
    (path !== ".." && !path.startsWith(`..${sep}`) && !path.startsWith(sep))
  );
}
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
function resolveExistingAncestors(path: string): string {
  const missing: string[] = [];
  let existing = path;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) return resolve(path);
    missing.unshift(basename(existing));
    existing = parent;
  }
  return resolve(realpathSync(existing), ...missing);
}
function display(value: unknown): string {
  if (typeof value === "string") return `'${value}'`;
  if (value === undefined) return "None";
  return String(value);
}
function pluginTemplates(owner: string, pluginRoot: string): AgentTemplate[] {
  const templatesRoot = resolve(pluginRoot, "agents");
  if (!isDirectory(templatesRoot)) return [];
  const resolvedRoot = realpathSync(pluginRoot);
  return readdirSync(templatesRoot, { withFileTypes: true })
    .filter((entry) => isDirectory(resolve(templatesRoot, entry.name)))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const path = resolve(templatesRoot, entry.name);
      if (!inside(resolvedRoot, realpathSync(path)))
        throw new AgentTemplateError(
          `template symlink or path escapes plugin root: ${path}`,
        );
      return { owner, name: entry.name, path };
    });
}

/**
 * lists installed plugin records by shelling out to the harness CLI
 * @param harness plugin manager whose list command runs
 * @returns normalized plugin records as plain objects
 */
export function readPluginRecords(harness: HarnessName): PluginRecord[] {
  if (harness === "grok") return readGrokPluginRecords();
  const command = [harness, "plugin", "list", "--json"];
  let completed: Bun.SyncSubprocess<"pipe", "pipe">;
  try {
    completed = Bun.spawnSync(command, { stdout: "pipe", stderr: "pipe" });
  } catch (error) {
    throw new AgentTemplateError(
      `cannot list installed ${harness} plugins: ${(error as Error).message}`,
    );
  }
  if (completed.exitCode !== 0) {
    const detail =
      completed.stderr.toString().trim() || completed.stdout.toString().trim();
    throw new AgentTemplateError(
      `cannot list installed ${harness} plugins: ${detail}`,
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(completed.stdout.toString());
  } catch (error) {
    throw new AgentTemplateError(
      `invalid JSON from ${harness} plugin list: ${(error as Error).message}`,
    );
  }
  if (harness === "claude") {
    if (!Array.isArray(payload))
      throw new AgentTemplateError(
        "claude plugin list --json did not return a list",
      );
    return payload.filter(
      (record): record is PluginRecord =>
        record !== null && typeof record === "object" && !Array.isArray(record),
    );
  }
  const installed =
    payload !== null && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as PluginRecord).installed
      : undefined;
  if (!Array.isArray(installed))
    throw new AgentTemplateError(
      "codex plugin list --json did not return an installed list",
    );
  return installed
    .filter(
      (record): record is PluginRecord =>
        record !== null && typeof record === "object" && !Array.isArray(record),
    )
    .map((record) => ({
      id: record.pluginId,
      enabled: record.enabled,
      version: record.version,
      lastUpdated: record.lastUpdated,
    }));
}

function lastUpdated(record: PluginRecord): string {
  return typeof record.lastUpdated === "string" ? record.lastUpdated : "";
}

function readGrokPluginRecords(): PluginRecord[] {
  const plugins = readGrokPlugins();
  // installation metadata only supplies trust labels; inspection owns paths and enablement
  let listed: Bun.SyncSubprocess<"pipe", "pipe">;
  try {
    listed = Bun.spawnSync(["grok", "plugin", "list", "--json"], {
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    throw new AgentTemplateError(
      `cannot list Grok plugins: ${(error as Error).message}`,
      { cause: error },
    );
  }
  if (listed.exitCode !== 0) {
    const detail =
      listed.stderr.toString().trim() || listed.stdout.toString().trim();
    throw new AgentTemplateError(
      `cannot list Grok plugins: ${detail || `exit ${listed.exitCode}`}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(listed.stdout.toString());
  } catch (error) {
    throw new AgentTemplateError(
      `invalid JSON from grok plugin list: ${(error as Error).message}`,
      { cause: error },
    );
  }
  if (!Array.isArray(parsed))
    throw new AgentTemplateError(
      "grok plugin list --json did not return a list",
    );
  const metadata = parsed.filter(isRecord);
  return plugins.map((plugin) => {
    const matches = metadata.filter(
      (record) =>
        record.name === plugin.name &&
        [record.path, record.source].some(
          (path) =>
            typeof path === "string" &&
            isDirectory(path) &&
            isDirectory(plugin.path) &&
            realpathSync(path) === realpathSync(plugin.path),
        ),
    );
    const marketplaces = new Set(
      matches
        .map((record) => record.marketplace)
        .filter(
          (marketplace): marketplace is string =>
            typeof marketplace === "string" && marketplace !== "",
        ),
    );
    if (marketplaces.size > 1)
      throw new AgentTemplateError(
        `conflicting Grok marketplace metadata: ${plugin.name}`,
      );
    return {
      id: `${plugin.name}@${[...marketplaces][0] ?? ""}`,
      enabled: plugin.enabled,
      installPath: plugin.path,
    };
  });
}

function grokPluginRoots(
  essentialRoot: string,
  records: readonly PluginRecord[],
  includeMarketplaces: readonly string[],
): Array<readonly [string, string]> {
  const enabled = records.filter((record) => record.enabled === true);
  const essentials = enabled.filter(
    (record) =>
      typeof record.id === "string" &&
      record.id.split("@")[0] === "essential" &&
      typeof record.installPath === "string" &&
      realpathSync(record.installPath) === essentialRoot,
  );
  if (essentials.length !== 1)
    throw new AgentTemplateError(
      `expected one enabled Essential plugin in grok inspect: ${essentialRoot}`,
    );
  const marketplace = String(essentials[0]!.id).split("@")[1] ?? "";
  const trusted = new Set([marketplace, ...includeMarketplaces]);
  for (const included of includeMarketplaces)
    if (!cacheComponent.test(included) || included === "." || included === "..")
      throw new AgentTemplateError(
        `invalid included marketplace name: ${display(included)}`,
      );
  return enabled
    .filter((record) => {
      if (
        typeof record.id !== "string" ||
        record.id.split("@").length !== 2 ||
        typeof record.installPath !== "string"
      )
        throw new AgentTemplateError("invalid enabled Grok plugin record");
      const ownerMarketplace = record.id.split("@")[1]!;
      if (ownerMarketplace !== "") return trusted.has(ownerMarketplace);
      return (
        marketplace === "" &&
        dirname(realpathSync(record.installPath)) === dirname(essentialRoot)
      );
    })
    .map(
      (record) =>
        [String(record.id).split("@")[0]!, String(record.installPath)] as const,
    )
    .sort(([left], [right]) => left.localeCompare(right));
}

function isRecord(value: unknown): value is PluginRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/**
 * resolves the installed cache directory of one Codex plugin record
 * @param essentialRoot installed path of the essential plugin
 * @param record one record from the Codex plugin list
 * @returns existing versioned cache directory of the record's plugin
 */
export function codexCachePluginRoot(
  essentialRoot: string,
  record: PluginRecord,
): string {
  const pluginId = record.id;
  const version = record.version;
  if (typeof pluginId !== "string" || pluginId.split("@").length !== 2)
    throw new AgentTemplateError(
      `invalid installed Codex plugin id: ${display(pluginId)}`,
    );
  const [pluginName, marketplace] = pluginId.split("@") as [string, string];
  if (
    typeof version !== "string" ||
    [pluginName, marketplace, version].some((part) =>
      new Set([".", ".."]).has(part),
    ) ||
    !cacheComponent.test(pluginName) ||
    !cacheComponent.test(marketplace) ||
    !cacheVersionComponent.test(version)
  )
    throw new AgentTemplateError(
      `invalid installed Codex plugin cache coordinates: ${display(pluginId)} version ${display(version)}`,
    );
  const cacheRoot = resolve(essentialRoot, "../../..");
  const candidate = resolve(cacheRoot, marketplace, pluginName, version);
  if (!inside(realpathSync(cacheRoot), resolveExistingAncestors(candidate)))
    throw new AgentTemplateError(
      `installed Codex plugin cache path escapes cache root: ${candidate}`,
    );
  if (!isDirectory(candidate))
    throw new AgentTemplateError(
      `installed Codex plugin cache root is absent: ${candidate}`,
    );
  return candidate;
}

/**
 * pairs every enabled plugin owner with its best installed root directory
 * @param essentialRoot installed path of the essential plugin
 * @param records records from the harness plugin list
 * @param harness plugin manager the records came from
 * @param includeMarketplaces extra trusted marketplaces to include
 * @returns owner-to-root tuples sorted by owner name
 */
export function installedPluginRoots(
  essentialRoot: string,
  records: readonly PluginRecord[],
  harness: HarnessName,
  includeMarketplaces: readonly string[] = [],
): Array<readonly [string, string]> {
  const resolvedEssential = realpathSync(essentialRoot);
  if (harness === "grok")
    return grokPluginRoots(resolvedEssential, records, includeMarketplaces);
  let essentialRecords: readonly PluginRecord[];
  if (harness === "codex") {
    if (
      basename(dirname(essentialRoot)) !== "essential" ||
      basename(resolve(essentialRoot, "../../..")) !== "cache"
    )
      throw new AgentTemplateError(
        `Codex skill is not loaded from an installed plugin cache: ${essentialRoot}`,
      );
    const marketplace = basename(resolve(essentialRoot, "../.."));
    essentialRecords = records.filter(
      (record) =>
        record.enabled === true &&
        typeof record.id === "string" &&
        record.id.split("@").length === 2 &&
        record.id.split("@")[0] === "essential" &&
        record.id.split("@")[1] === marketplace &&
        realpathSync(codexCachePluginRoot(essentialRoot, record)) ===
          resolvedEssential,
    );
  } else
    essentialRecords = records.filter(
      (record) =>
        typeof record.installPath === "string" &&
        realpathSync(record.installPath) === resolvedEssential &&
        typeof record.id === "string" &&
        record.id.split("@").length === 2 &&
        record.id.split("@")[0] === "essential",
    );
  if (essentialRecords.length === 0)
    throw new AgentTemplateError(
      `essential plugin is absent from ${harness} plugin list: ${essentialRoot}`,
    );
  if (essentialRecords.length !== 1)
    throw new AgentTemplateError(
      `multiple essential plugin records use install path: ${essentialRoot}`,
    );
  const essentialId = String(essentialRecords[0]!.id);
  const marketplace = essentialId.split("@").at(-1) ?? "";
  if (marketplace === "")
    throw new AgentTemplateError(
      `installed plugin id has no marketplace: ${essentialId}`,
    );
  const marketplaces = new Set([marketplace]);
  for (const included of includeMarketplaces) {
    if (new Set([".", ".."]).has(included) || !cacheComponent.test(included))
      throw new AgentTemplateError(
        `invalid included marketplace name: ${display(included)}`,
      );
    marketplaces.add(included);
  }
  const best = new Map<string, PluginRecord>();
  for (const record of records) {
    const id = record.id;
    if (
      record.enabled !== true ||
      typeof id !== "string" ||
      !id.includes("@") ||
      (harness !== "codex" && typeof record.installPath !== "string") ||
      !marketplaces.has(id.split("@").at(-1) ?? "")
    )
      continue;
    const current = best.get(id);
    if (current === undefined || lastUpdated(record) > lastUpdated(current))
      best.set(id, record);
  }
  return [...best]
    .map(
      ([id, record]) =>
        [
          id.split("@")[0]!,
          harness === "codex"
            ? codexCachePluginRoot(essentialRoot, record)
            : String(record.installPath),
        ] as const,
    )
    .sort(([left], [right]) => left.localeCompare(right));
}

/**
 * discovers agent template directories across source checkout or installed roots
 * @param essentialRoot path of the essential plugin
 * @param options pluginRecords supply harness records directly; harness selects
 *   the plugin manager; includeMarketplaces adds trusted marketplaces
 * @returns templates sorted by owner then directory name
 */
export function discoverAgentTemplates(
  essentialRoot: string,
  options: {
    readonly pluginRecords?: readonly PluginRecord[];
    readonly harness?: HarnessName;
    readonly includeMarketplaces?: readonly string[];
  } = {},
): AgentTemplate[] {
  const harness = options.harness ?? "claude";
  const parent = dirname(essentialRoot);
  const roots: Array<readonly [string, string]> =
    harness !== "grok" && basename(parent) === "plugins"
      ? readdirSync(parent, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((entry) => [entry.name, resolve(parent, entry.name)] as const)
      : installedPluginRoots(
          essentialRoot,
          options.pluginRecords ?? readPluginRecords(harness),
          harness,
          options.includeMarketplaces,
        );
  return roots.flatMap(([owner, root]) => pluginTemplates(owner, root));
}

function preflight(
  templates: readonly AgentTemplate[],
  harness: HarnessName,
  options: {
    readonly essentialRoot: string;
    readonly referenceRoot: string;
    readonly allowLegacy: boolean;
  },
): Array<readonly [string, string]> {
  if (templates.length === 0 && harness !== "grok")
    throw new AgentTemplateError("no agent templates discovered");
  const seen = new Map<string, AgentTemplate>();
  return templates.map((template) => {
    const sources = loadAgentSources(template.path, {
      allowLegacy: options.allowLegacy,
    });
    const name = String(sources.metadata.name);
    const previous = seen.get(name);
    if (previous !== undefined)
      throw new AgentTemplateError(
        `duplicate agent name ${display(name)}: ${previous.path} and ${template.path}`,
      );
    seen.set(name, template);
    const stitchOptions = {
      essentialRoot: options.essentialRoot,
      referenceRoot: options.referenceRoot,
      allowLegacy: options.allowLegacy,
    };
    return [
      name,
      harness === "claude"
        ? stitchAgentDefinition(template.path, stitchOptions)
        : harness === "codex"
          ? stitchCodexAgentDefinition(template.path, stitchOptions)
          : stitchGrokAgentDefinition(template.path, stitchOptions),
    ] as const;
  });
}

/**
 * stages every discovered template and installs it atomically into the destination
 * @param essentialRoot path of the essential plugin
 * @param destination directory receiving the stitched agent files
 * @param options pluginRecords, harness, and includeMarketplaces feed discovery;
 *   stdout overrides progress reporting
 * @returns number of agents installed
 */
export function installAgents(
  essentialRoot: string,
  destination: string,
  options: InstallOptions = {},
): number {
  const root = realpathSync(essentialRoot);
  const harness = options.harness ?? "claude";
  const templates = discoverAgentTemplates(root, {
    pluginRecords: options.pluginRecords,
    harness,
    includeMarketplaces: options.includeMarketplaces,
  });
  const installsDirection = templates.some((template) =>
    readFileSync(resolve(template.path, "base.md"), "utf8").includes(
      leadAgentDirectionAlias,
    ),
  );
  const sourceDirection = resolve(root, leadAgentDirectionPath);
  if (installsDirection && !existsSync(sourceDirection))
    throw new AgentTemplateError(
      `missing Essential lead direction: ${sourceDirection}`,
    );
  const sourceStateSystems = resolve(root, stateSystemsReferencePath);
  if (templates.length > 0 && !existsSync(sourceStateSystems))
    throw new AgentTemplateError(
      `missing Essential state-system authority: ${sourceStateSystems}`,
    );
  const canonicalDestination = canonicalDirectory(destination);
  const installedEssential = resolve(canonicalDestination, ".essential");
  const staged = preflight(templates, harness, {
    essentialRoot: root,
    referenceRoot: installedEssential,
    allowLegacy: basename(dirname(root)) !== "plugins",
  });
  const suffix = harness === "codex" ? ".toml" : ".md";
  const write =
    options.stdout ??
    ((text: string): void => {
      process.stdout.write(text);
    });
  const files: InstallationFile[] = staged.map(([name, content]) => ({
    path: `${name}${suffix}`,
    content,
    kind: "agent",
  }));
  if (staged.length > 0)
    files.unshift({
      path: `.essential/${stateSystemsReferencePath}`,
      content: readFileSync(sourceStateSystems),
      kind: "support",
    });
  if (installsDirection)
    files.push({
      path: `.essential/${leadAgentDirectionPath}`,
      content: readFileSync(sourceDirection),
      kind: "support",
    });
  installManagedFiles(
    canonicalDestination,
    files,
    { ...options, harness, stdout: write },
    resolve(root, "directions/GROK.md"),
  );
  write(`done — installed ${staged.length} agent(s) into ${destination}\n`);
  return staged.length;
}

const program = basename(import.meta.url);
const usage = `usage: ${program} [-h] [--plugin-root PLUGIN_ROOT]\n${" ".repeat(program.length + 7)}[--harness {claude,codex,grok}]\n${" ".repeat(program.length + 7)}[--destination DESTINATION]\n${" ".repeat(program.length + 7)}[--include-marketplace INCLUDE_MARKETPLACE]`;
const help = `${usage}\n\nDiscover, preflight, stitch, and install enabled plugin agent templates.\n\noptions:\n  -h, --help            show this help message and exit\n  --plugin-root PLUGIN_ROOT\n  --harness {claude,codex,grok}\n  --destination DESTINATION\n  --include-marketplace INCLUDE_MARKETPLACE\n                        also discover enabled agent templates from this\n                        trusted marketplace\n`;
function cliError(message: string): never {
  process.stderr.write(`${usage}\n${program}: error: ${message}\n`);
  process.exit(2);
}
/**
 * parses installer flags and drives installAgents for one harness
 * @param argv arguments following the script name
 * @returns process exit code: 0 success, 2 usage error
 */
export function main(argv = process.argv.slice(2)): number {
  let pluginRoot = resolve(scriptDirectory, "../../..");
  let harness: HarnessName = "claude";
  let destination: string | undefined;
  const includeMarketplaces: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    const value = (): string => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("-"))
        cliError(`argument ${argument}: expected one argument`);
      index += 1;
      return next;
    };
    if (argument === "-h" || argument === "--help") {
      process.stdout.write(help);
      return 0;
    }
    if (argument === "--plugin-root") pluginRoot = value();
    else if (argument.startsWith("--plugin-root="))
      pluginRoot = argument.slice("--plugin-root=".length);
    else if (argument === "--harness") {
      const selected = value();
      if (selected !== "claude" && selected !== "codex" && selected !== "grok")
        cliError(
          `argument --harness: invalid choice: '${selected}' (choose from 'claude', 'codex', 'grok')`,
        );
      harness = selected;
    } else if (argument.startsWith("--harness=")) {
      const selected = argument.slice("--harness=".length);
      if (selected !== "claude" && selected !== "codex" && selected !== "grok")
        cliError(
          `argument --harness: invalid choice: '${selected}' (choose from 'claude', 'codex', 'grok')`,
        );
      harness = selected;
    } else if (argument === "--destination") destination = value();
    else if (argument.startsWith("--destination="))
      destination = argument.slice("--destination=".length);
    else if (argument === "--include-marketplace")
      includeMarketplaces.push(value());
    else if (argument.startsWith("--include-marketplace="))
      includeMarketplaces.push(argument.slice("--include-marketplace=".length));
    else cliError(`unrecognized arguments: ${argument}`);
  }
  destination ??= defaultAgentDestination(harness);
  try {
    installAgents(pluginRoot, destination, { harness, includeMarketplaces });
    return 0;
  } catch (error) {
    if (
      error instanceof AgentTemplateError ||
      error instanceof InstallationError ||
      error instanceof GrokPluginError
    )
      cliError(error.message);
    throw error;
  }
}

if (import.meta.main) process.exit(main());
