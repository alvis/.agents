import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { canonicalDirectory, InstallationError, readSnapshot } from "./transaction.ts";
import type { FileChange, FileSnapshot } from "./transaction.ts";

import type { HarnessName } from "../installation.ts";

/** a folder a harness must be able to write */
export interface WritableRoot {
  /** absolute folder */
  readonly path: string;
  /** whether the harness's file tools, not only its shell, may write here without asking */
  readonly fileTools: boolean;
}

/** the folders to grant, and the configured ones refused as too wide */
export interface WritableRoots {
  /** absolute, distinct folders; each is granted once */
  readonly roots: readonly WritableRoot[];
  /** one line per refused folder, naming its source and the reason */
  readonly refused: readonly string[];
}

/** where a harness keeps its configuration and which folders it must be able to write */
export interface WriteGrantPaths {
  /** the harness's own configuration directory */
  readonly configHome: string;
  readonly writableRoots: WritableRoots;
}

/** the edit that grants write access, or the line the user must add by hand */
export interface WriteGrant {
  readonly changes: FileChange[];
  /** set when an entry cannot be placed safely or a root is refused; the installer prints it and carries on */
  readonly manual?: string;
}

/**
 * resolves the folders every harness must be able to write, the way their writers resolve them
 *
 * a folder that is relative, the home folder, or one that contains it is
 * refused rather than granted, so a stray variable cannot open the whole home
 * folder or disk.
 * @returns the folders to grant and the refused ones
 */
export function defaultWritableRoots(): WritableRoots {
  const home = resolve(userHome());
  const { QMD_CONFIG_DIR, XDG_CACHE_HOME, XDG_CONFIG_HOME } = process.env;
  const candidates = [
    // work state lives here (ADR-3); agents edit it with their file tools
    { path: join(home, ".agents", "states"), source: "HOME", fileTools: true },
    // qmd-index refreshes the qmd index and its collection trees here
    XDG_CACHE_HOME
      ? { path: join(XDG_CACHE_HOME, "qmd"), source: `XDG_CACHE_HOME=${XDG_CACHE_HOME}`, fileTools: false }
      : { path: join(home, ".cache", "qmd"), source: "HOME", fileTools: false },
    // qmd-index registers its collections in qmd's index.yml here
    QMD_CONFIG_DIR
      ? { path: QMD_CONFIG_DIR, source: `QMD_CONFIG_DIR=${QMD_CONFIG_DIR}`, fileTools: false }
      : XDG_CONFIG_HOME
        ? { path: join(XDG_CONFIG_HOME, "qmd"), source: `XDG_CONFIG_HOME=${XDG_CONFIG_HOME}`, fileTools: false }
        : { path: join(home, ".config", "qmd"), source: "HOME", fileTools: false },
  ];
  const roots: WritableRoot[] = [];
  const refused: string[] = [];
  for (const { path, source, fileTools } of candidates) {
    const root = resolve(path);
    const why = !isAbsolute(path)
      ? "is relative"
      : root === home
        ? "is the home folder"
        : root === "/" || home.startsWith(`${root}/`)
          ? "contains the home folder"
          : undefined;
    if (why !== undefined) refused.push(`${source} makes ${path} a root, which ${why}; not granted`);
    else if (!roots.some((known) => known.path === root)) roots.push({ path: root, fileTools });
  }
  return { roots, refused };
}

/**
 * resolves the default configuration directory and writable roots for a harness
 * @param harness target harness
 * @returns absolute configuration directory and writable roots
 */
export function defaultWriteGrantPaths(harness: HarnessName): WriteGrantPaths {
  const home = userHome();
  const configHome =
    harness === "claude"
      ? resolve(process.env.CLAUDE_CONFIG_DIR || join(home, ".claude"))
      : harness === "codex"
        ? resolve(process.env.CODEX_HOME || join(home, ".codex"))
        : resolve(process.env.GROK_HOME || join(home, ".grok"));
  return { configHome, writableRoots: defaultWritableRoots() };
}

/**
 * plans the edit that lets a harness write to each writable root
 *
 * it only adds missing entries, never turns a sandbox on, and plans nothing once
 * every entry is present. Uninstall leaves the entries: they only allow writes
 * to folders in the user's own home.
 * @param harness target harness
 * @param paths configuration directory and writable roots
 * @returns the edit, and the lines to add by hand or refused roots when there are any
 */
export function planWriteGrant(harness: HarnessName, paths: WriteGrantPaths): WriteGrant {
  // resolved like the agent destination, so a symlinked home never reaches the
  // transaction's symlink refusal
  const configHome = canonicalDirectory(paths.configHome);
  const plan = harness === "claude" ? planClaude : harness === "codex" ? planCodex : planGrok;
  return grantRoots(paths.writableRoots, (roots) => plan(configHome, roots));
}

/**
 * spells the entry OpenCode reads as permission to touch a folder outside the project
 * @param root absolute writable root
 * @returns the `permission.external_directory` key covering the root and everything below it
 */
export function opencodeGrantKey(root: string): string {
  return `${tildePath(root) ?? root}/**`;
}

/**
 * plans the OpenCode V1 grant in whichever config file already exists
 * @param configHome directory holding opencode.json or opencode.jsonc
 * @param writableRoots folders OpenCode must be able to write, and refused ones
 * @returns the edit, and the lines to add by hand or refused roots when there are any
 */
export function planOpencodeGrant(configHome: string, writableRoots: WritableRoots): WriteGrant {
  return grantRoots(writableRoots, (roots) => {
    const directory = canonicalDirectory(configHome);
    const existing = ["opencode.json", "opencode.jsonc"]
      .map((name) => join(directory, name))
      .filter((path) => readSnapshot(path) !== undefined);
    const keys = roots.map(({ path }) => opencodeGrantKey(path));
    const manual = keys.map((key) => `permission.external_directory["${key}"] = "allow"`).join(" and ");
    if (existing.length > 1) throw new InstallationError(`add ${manual} to ${existing[0]}`);
    const path = existing[0] ?? join(directory, "opencode.json");
    return editJson(path, manual, (config) => {
      // a blanket "allow" already covers every root
      if (config.permission === "allow") return false;
      const permission = child(config, "permission");
      if (permission.external_directory === "allow") return false;
      const external = child(permission, "external_directory");
      const missing = keys.filter((key) => external[key] !== "allow");
      for (const key of missing) external[key] = "allow";
      return missing.length > 0;
    });
  });
}

type Table = Record<string, unknown>;

// plans the distinct roots, turning a placement refusal into a line to add by
// hand; refused roots are reported alongside and never planned
function grantRoots(
  writableRoots: WritableRoots,
  plan: (roots: readonly WritableRoot[]) => FileChange[],
): WriteGrant {
  const roots = writableRoots.roots.filter(
    (root, index, all) => all.findIndex((known) => known.path === root.path) === index,
  );
  const manual = [...writableRoots.refused];
  let changes: FileChange[] = [];
  try {
    if (roots.length > 0) changes = plan(roots);
  } catch (error) {
    if (!(error instanceof InstallationError)) throw error;
    manual.push(error.message);
  }
  return manual.length === 0 ? { changes } : { changes, manual: manual.join("; ") };
}

function isTable(value: unknown): value is Table {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function userHome(): string {
  return process.env.HOME || homedir();
}

// harness rules spell a folder under the home directory as `~/…`, so the entry
// follows the user rather than one machine's absolute home path
function tildePath(root: string): string | undefined {
  const home = userHome();
  return root.startsWith(`${home}/`) ? `~${root.slice(home.length)}` : undefined;
}

function quotedList(members: readonly string[]): string {
  return members.map((member) => JSON.stringify(member)).join(", ");
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
// `add` returns false when every entry is already there
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

// Claude Code reads a bare leading `/` as relative to the settings file, so a
// root outside the home directory is spelled with `//`.
function claudePath(root: string): string {
  return tildePath(root) ?? `/${root}`;
}

// The sandbox entry covers Bash; the Edit rule covers Claude's file tools.
function planClaude(configHome: string, roots: readonly WritableRoot[]): FileChange[] {
  const grants = roots.map(({ path }) => claudePath(path));
  // qmd runs the commands in its global index.yml without asking, so a prompt-free file-tool rule there would let injected text plant one
  const rules = roots.filter(({ fileTools }) => fileTools).map(({ path }) => `Edit(${claudePath(path)}/**)`);
  return editJson(
    join(configHome, "settings.json"),
    `${quotedList(grants)} to sandbox.filesystem.allowWrite and ${quotedList(rules)} to permissions.allow`,
    (settings) => {
      const allowWrite = child(child(settings, "sandbox"), "filesystem");
      const permissions = child(settings, "permissions");
      const changed = [
        ...grants.map((grant) => addMember(allowWrite, "allowWrite", grant)),
        ...rules.map((rule) => addMember(permissions, "allow", rule)),
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

function planCodex(configHome: string, roots: readonly WritableRoot[]): FileChange[] {
  return editTomlList(
    join(configHome, "config.toml"),
    ["sandbox_workspace_write"],
    "writable_roots",
    roots.map(({ path }) => path),
    (config) => config.permissions === undefined,
  );
}

// Grok's sandbox is off unless a profile is selected. Only a profile the user
// wrote in sandbox.toml can carry the entries; a built-in one cannot be edited.
function planGrok(configHome: string, writableRoots: readonly WritableRoot[]): FileChange[] {
  const roots = writableRoots.map(({ path }) => path);
  const configPath = join(configHome, "config.toml");
  const selected = (parseToml(readText(configPath).text, configPath).sandbox as Table | undefined)
    ?.profile;
  if (selected === undefined || selected === "off") return [];
  const path = join(configHome, "sandbox.toml");
  const profiles = parseToml(readText(path).text, path).profiles;
  if (typeof selected !== "string" || !isTable(profiles) || !isTable(profiles[selected]))
    throw new InstallationError(
      `make the selected Grok sandbox profile a profile in ${path} that lists ${quotedList(roots)} in read_write`,
    );
  return editTomlList(path, ["profiles", selected], "read_write", roots, () => true);
}

function parseToml(text: string, path: string): Table {
  try {
    return Bun.TOML.parse(text) as Table;
  } catch {
    throw new InstallationError(`fix the TOML in ${path}, then reinstall`);
  }
}

// Adds the missing strings to `key = [...]` in `[table]` by line edit, so
// comments and layout survive. Anything the line edit cannot place (inline
// tables, dotted keys, a multi-line array) is refused, and the result must parse
// with every member.
function editTomlList(
  path: string,
  table: readonly string[],
  key: string,
  members: readonly string[],
  usable: (config: Table) => boolean,
): FileChange[] {
  const { before, text } = readText(path);
  const missing = (config: Table): string[] => {
    // every segment but the last names a table the caller already checked, so each step indexes a table
    const found = table.reduce<unknown>((at, name) => (at as Table)[name], config);
    const list = isTable(found) ? found[key] : undefined;
    return members.filter((member) => !(Array.isArray(list) && list.includes(member)));
  };
  const config = parseToml(text, path);
  const adding = missing(config);
  if (adding.length === 0) return [];
  const name = table.map((segment) => (/^[A-Za-z0-9_-]+$/.test(segment) ? segment : JSON.stringify(segment))).join(".");
  const manual = `add ${quotedList(adding)} to ${key} under [${name}] in ${path}`;
  if (!usable(config)) throw new InstallationError(manual);
  const quoted = quotedList(adding);
  const escaped = name.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  const header = new RegExp(`^\\[${escaped}\\][ \\t]*(#.*)?$`, "m").exec(text);
  let after: string;
  if (header === null) {
    const gap = text === "" || text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
    after = `${text}${gap}[${name}]\n${key} = [${quoted}]\n`;
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
    placed = missing(Bun.TOML.parse(after) as Table).length === 0;
  } catch {
    // a duplicate key or broken layout means the line edit did not fit
  }
  if (!placed) throw new InstallationError(manual);
  return [{ path, before, after: Buffer.from(after) }];
}
