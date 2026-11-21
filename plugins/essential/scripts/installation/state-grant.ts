import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { canonicalDirectory, InstallationError, readSnapshot } from "./transaction.ts";
import type { FileChange, FileSnapshot } from "./transaction.ts";

import type { HarnessName } from "../installation.ts";

/** where a harness keeps its configuration and where work state lives */
export interface StateGrantPaths {
  /** the harness's own configuration directory */
  readonly configHome: string;
  /** absolute `~/.agents/states` folder that must be writable (ADR-3) */
  readonly statesRoot: string;
}

/** the edit that grants write access, or the line the user must add by hand */
export interface StateGrant {
  readonly changes: FileChange[];
  /** set when the entry cannot be placed safely; the installer prints it and carries on */
  readonly manual?: string;
}

/**
 * resolves the default configuration directory and states folder for a harness
 * @param harness target harness
 * @returns absolute configuration directory and states folder
 */
export function defaultStateGrantPaths(harness: HarnessName): StateGrantPaths {
  const home = homedir();
  const configHome =
    harness === "claude"
      ? resolve(process.env.CLAUDE_CONFIG_DIR || join(home, ".claude"))
      : harness === "codex"
        ? resolve(process.env.CODEX_HOME || join(home, ".codex"))
        : resolve(process.env.GROK_HOME || join(home, ".grok"));
  return { configHome, statesRoot: join(home, ".agents", "states") };
}

/**
 * plans the edit that lets a harness write to the home state folder
 *
 * it only adds one entry, never turns a sandbox on, and plans nothing once the
 * entry is present. Uninstall leaves the entry: it only allows writes to a
 * folder in the user's own home.
 * @param harness target harness
 * @param paths configuration directory and states folder
 * @returns the edit, or the line to add by hand when it cannot be placed safely
 */
export function planStateGrant(harness: HarnessName, paths: StateGrantPaths): StateGrant {
  // resolved like the agent destination, so a symlinked home never reaches the
  // transaction's symlink refusal
  const configHome = canonicalDirectory(paths.configHome);
  const plan = harness === "claude" ? planClaude : harness === "codex" ? planCodex : planGrok;
  return guarded(() => plan(configHome, paths.statesRoot));
}

/** the entry OpenCode reads as permission to touch folders outside the project */
export const opencodeGrantKey = "~/.agents/states/**";

/**
 * plans the OpenCode V1 grant in whichever config file already exists
 * @param configHome directory holding opencode.json or opencode.jsonc
 * @returns the edit, or the line to add by hand when it cannot be placed safely
 */
export function planOpencodeGrant(configHome: string): StateGrant {
  return guarded(() => {
    const directory = canonicalDirectory(configHome);
    const existing = ["opencode.json", "opencode.jsonc"]
      .map((name) => join(directory, name))
      .filter((path) => readSnapshot(path) !== undefined);
    const manual = `permission.external_directory["${opencodeGrantKey}"] = "allow"`;
    if (existing.length > 1) throw new InstallationError(`add ${manual} to ${existing[0]}`);
    const path = existing[0] ?? join(directory, "opencode.json");
    return editJson(path, manual, (config) => {
      // a blanket "allow" already covers the state folder
      if (config.permission === "allow") return false;
      const permission = child(config, "permission");
      if (permission.external_directory === "allow") return false;
      const external = child(permission, "external_directory");
      if (external[opencodeGrantKey] === "allow") return false;
      external[opencodeGrantKey] = "allow";
      return true;
    });
  });
}

type Table = Record<string, unknown>;

function guarded(plan: () => FileChange[]): StateGrant {
  try {
    return { changes: plan() };
  } catch (error) {
    if (!(error instanceof InstallationError)) throw error;
    return { changes: [], manual: error.message };
  }
}

function isTable(value: unknown): value is Table {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(path: string): { before?: FileSnapshot; text: string } {
  const before = readSnapshot(path);
  if (before === undefined) return { text: "" };
  return { before, text: before.content.toString("utf8") };
}

// returns the object under `key`, creating it when absent
function child(parent: Table, key: string): Table {
  const value = parent[key] ?? (parent[key] = {});
  if (!isTable(value)) throw new InstallationError(`${key} is not an object`);
  return value;
}

// applies `add` to a parsed JSON object and writes it back with its indent;
// `add` returns false when the entry is already there
function editJson(path: string, manual: string, add: (config: Table) => boolean): FileChange[] {
  const { before, text } = readText(path);
  try {
    const config = text.trim() === "" ? {} : JSON.parse(text);
    if (!isTable(config)) throw new Error("not an object");
    if (!add(config)) return [];
    const indent = /^([ \t]+)\S/m.exec(text)?.[1] ?? 2;
    return [{ path, before, after: Buffer.from(`${JSON.stringify(config, null, indent)}\n`) }];
  } catch {
    throw new InstallationError(`add ${manual} to ${path}`);
  }
}

// Claude Code reads a bare leading `/` as relative to the settings file, so the
// path is spelled `~/` under the home directory and `//` otherwise.
function claudePath(statesRoot: string): string {
  const home = process.env.HOME || homedir();
  return statesRoot.startsWith(`${home}/`) ? `~${statesRoot.slice(home.length)}` : `/${statesRoot}`;
}

// The sandbox entry covers Bash; the Edit rule covers Claude's file tools.
function planClaude(configHome: string, statesRoot: string): FileChange[] {
  const grant = claudePath(statesRoot);
  const rule = `Edit(${grant}/**)`;
  return editJson(
    join(configHome, "settings.json"),
    `"${grant}" to sandbox.filesystem.allowWrite and "${rule}" to permissions.allow`,
    (settings) => {
      const changed = [
        addMember(child(child(settings, "sandbox"), "filesystem"), "allowWrite", grant),
        addMember(child(settings, "permissions"), "allow", rule),
      ];
      return changed.some(Boolean);
    },
  );
}

function addMember(table: Table, key: string, member: string): boolean {
  const list = table[key] ?? [];
  if (!Array.isArray(list)) throw new InstallationError(`${key} is not a list`);
  if (list.includes(member)) return false;
  table[key] = [...list, member];
  return true;
}

function planCodex(configHome: string, statesRoot: string): FileChange[] {
  return editTomlList(
    join(configHome, "config.toml"),
    "sandbox_workspace_write",
    "writable_roots",
    statesRoot,
    (config) => config.permissions === undefined,
  );
}

// Grok's sandbox is off unless a profile is selected. Only a profile the user
// wrote in sandbox.toml can carry the entry; a built-in one cannot be edited.
function planGrok(configHome: string, statesRoot: string): FileChange[] {
  const configPath = join(configHome, "config.toml");
  const selected = (parseToml(readText(configPath).text, configPath).sandbox as Table | undefined)
    ?.profile;
  if (selected === undefined || selected === "off") return [];
  const path = join(configHome, "sandbox.toml");
  const profiles = parseToml(readText(path).text, path).profiles;
  if (typeof selected !== "string" || !isTable(profiles) || !isTable(profiles[selected]))
    throw new InstallationError(
      `make the selected Grok sandbox profile a profile in ${path} that lists ${JSON.stringify(statesRoot)} in read_write`,
    );
  return editTomlList(path, `profiles.${selected}`, "read_write", statesRoot, () => true);
}

function parseToml(text: string, path: string): Table {
  try {
    return Bun.TOML.parse(text) as Table;
  } catch {
    throw new InstallationError(`fix the TOML in ${path}, then reinstall`);
  }
}

// Adds a string to `key = [...]` in `[table]` by line edit, so comments and
// layout survive. Anything the line edit cannot place (inline tables, dotted
// keys, a multi-line array) is refused, and the result must parse with the entry.
function editTomlList(
  path: string,
  table: string,
  key: string,
  member: string,
  usable: (config: Table) => boolean,
): FileChange[] {
  const { before, text } = readText(path);
  const manual = `add ${JSON.stringify(member)} to ${key} under [${table}] in ${path}`;
  const has = (config: Table): boolean => {
    const found = table.split(".").reduce<unknown>((at, name) => (isTable(at) ? at[name] : undefined), config);
    const list = isTable(found) ? found[key] : undefined;
    return Array.isArray(list) && list.includes(member);
  };
  const config = parseToml(text, path);
  if (has(config)) return [];
  if (!usable(config)) throw new InstallationError(manual);
  const quoted = JSON.stringify(member);
  const escaped = table.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  const header = new RegExp(`^\\[${escaped}\\][ \\t]*(#.*)?$`, "m").exec(text);
  let after: string;
  if (header === null) {
    const gap = text === "" || text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
    after = `${text}${gap}[${table}]\n${key} = [${quoted}]\n`;
  } else {
    const start = header.index + header[0].length + 1;
    const next = /^\[/m.exec(text.slice(start));
    const end = next === null ? text.length : start + next.index;
    const body = text.slice(start, end);
    const line = new RegExp(`^(${key}[ \\t]*=[ \\t]*\\[)([^\\]\\n]*)\\]`, "m").exec(body);
    const edited = line === null
      ? `${key} = [${quoted}]\n${body}`
      : `${body.slice(0, line.index)}${line[1]}${line[2]!.trim() === "" ? "" : `${line[2]!.trimEnd()}, `}${quoted}]${body.slice(line.index + line[0].length)}`;
    after = `${text.slice(0, start)}${edited}${text.slice(end)}`;
  }
  let placed = false;
  try {
    placed = has(Bun.TOML.parse(after) as Table);
  } catch {
    // a duplicate key or broken layout means the line edit did not fit
  }
  if (!placed) throw new InstallationError(manual);
  return [{ path, before, after: Buffer.from(after) }];
}
