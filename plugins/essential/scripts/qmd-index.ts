#!/usr/bin/env bun
/** keeps this repository's prefixed qmd collections current, and degrades to `unavailable` instead of failing */

import { Database } from "bun:sqlite";
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface Identity {
  stateKey: string;
  stateRoot: string;
  durableRoot: string;
  vcs: string;
  prefix: string;
}

interface Wanted {
  name: string;
  root: string;
  pattern: string;
  context: string;
}

interface Listed {
  name: string;
  pattern: string;
  files: number;
  excluded: boolean;
}

interface Definition {
  path: string;
  /** the keys of the non-empty commands `qmd update` runs for this collection */
  commands: CommandKey[];
}

// an update of a collection runs its `update:` hook and its `processor:` command alike
const COMMAND_KEYS = ["update", "processor"] as const;
type CommandKey = (typeof COMMAND_KEYS)[number];

interface Counts {
  total: number;
  embedded: number;
}

interface Report {
  status: "ready" | "unavailable";
  mode: "hybrid" | "lexical" | null;
  reason?: string;
  prefix?: string;
  sha?: string | null;
  embedding?: {
    /** documents of this repository's collections still lacking a vector; null when the index could not be read */
    pending: number | null;
    /** qmd's own index-wide figure, which includes other repositories */
    index_pending: number;
    running: boolean;
    started: boolean;
  };
  collections?: { name: string; documents: number; root: string; pattern: string }[];
  skipped?: { name: string; reason: string }[];
}

/** a failure that maps to `status: unavailable` */
class Unavailable extends Error {}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const USAGE = "usage: qmd-index <ensure|embed|status>\n";
const SUFFIXES = ["docs", "code", "streams", "history", "memory", "notion"];

// test-only environment override: a whole number of milliseconds of at least `min`, otherwise the default, so a malformed value can never change production behaviour
function overrideMs(name: string, fallback: number, min: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value >= min ? value : fallback;
}

// the scoped update indexes only this repository's collections, but a first run reads a whole export and the shared index may be busy with another process; 10 min sits well above the seconds a repository this size takes, and a caller then sees `unavailable` instead of a hang
// QMD_UPDATE_TIMEOUT_MS exists so tests need not wait that long
const QMD_UPDATE_TIMEOUT_MS = overrideMs("QMD_UPDATE_TIMEOUT_MS", 600_000, 1);
// collection add indexes one collection and the remaining calls only read config, so a stuck qmd is the only way past 2 min
const QMD_TIMEOUT_MS = 120_000;
// `qmd --help` only proves the binary starts; 30 s covers a cold start while keeping a missing or wedged binary from stalling every caller
// QMD_PROBE_TIMEOUT_MS exists so tests need not wait that long
const QMD_PROBE_TIMEOUT_MS = overrideMs("QMD_PROBE_TIMEOUT_MS", 30_000, 1);
// git archive and tar of a repository tip finish in seconds; 2 min tolerates a slow disk
const GIT_TIMEOUT_MS = 120_000;
// qmd collection list and status print a few KB per collection; 64 MB is far above any real index and still bounds a runaway child
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;
// the lock wait polls a mkdir, so 200 ms keeps latency low without busy-spinning a core
const LOCK_POLL_MS = 200;
// a holder writes its pid right after mkdir, which takes microseconds; a pid-less lock older than 5 s belongs to a holder that died in between
const LOCK_NO_PID_GRACE_MS = 5_000;
// the holder refreshes the lock before every qmd or git call, so the longest a live holder leaves it untouched is its longest single step, the update cap; the margin covers the refresh itself, process start and clock skew
const LOCK_STALE_MARGIN_MS = 60_000;
const LOCK_STALE_MS = QMD_UPDATE_TIMEOUT_MS + LOCK_STALE_MARGIN_MS;
// a warm ensure (export skipped, an update of an unchanged index) finishes within seconds; a waiter that outlasts 20 s reports `unavailable` so its caller falls back to rg (SC-5) instead of stalling. QMD_INDEX_LOCK_WAIT_MS exists so tests need not wait that long
const LOCK_WAIT_MS = 20_000;
// qmd's own default session cap is 30 min; a full embed of this repository took about 45 s (EXP01), so the same cap leaves room for a cold, larger shared index and still ends a stuck job
const EMBED_TIMEOUT_MINUTES = 30;

const DOCS_PATTERN = "README.md,docs/**/*.md";
// two comma-separated masks: qmd's splitGlobMask keeps the commas inside the braces and splits only the one after them; `!(*.*)` is an extglob for extension-less files directly inside any scripts/ folder
const CODE_PATTERN = "**/*.{ts,tsx,js,py,go,rs,sh,bash},**/scripts/!(*.*)";
const HISTORY_PATTERN = "journals.md,journals/**/*.md,archive/**/*.md";
const MEMORY_PATTERN =
  "overview.md,environment.md,traps.md,backlogs.md,backlogs/**/*.md";

function ownNames(prefix: string): string[] {
  return SUFFIXES.map((suffix) => `${prefix}-${suffix}`);
}

function cacheRoot(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "qmd");
}

// refreshes the held lock; set only while this process holds it
export let heartbeat: (() => void) | null = null;

function qmdEnv(): NodeJS.ProcessEnv {
  return { ...process.env, NO_COLOR: "1" };
}

// without --index, qmd walks up from its working directory looking for a project-local .qmd/index.yml and would then edit another config and index than the ones read here; naming the default index pins every call to ~/.config/qmd/index.yml and the shared index.sqlite
const INDEX_ARGS = ["--index", "index"];

// the one place qmd is looked up, on the same PATH that every spawn receives
function qmdLauncher(): string {
  const launcher = Bun.which("qmd", { PATH: qmdEnv().PATH });
  if (launcher === null) throw new Unavailable("qmd is not installed");
  return launcher;
}

function qmd(args: string[], timeout = QMD_TIMEOUT_MS) {
  const cwd = cacheRoot();
  mkdirSync(cwd, { recursive: true });
  heartbeat?.();
  const result = spawnSync(qmdLauncher(), [...INDEX_ARGS, ...args], {
    cwd,
    env: qmdEnv(),
    encoding: "utf8",
    timeout,
    maxBuffer: MAX_BUFFER_BYTES,
  });
  return result;
}

function qmdOk(args: string[], timeout = QMD_TIMEOUT_MS): string {
  const result = qmd(args, timeout);
  if (result.error || result.status !== 0) {
    const timedOut = (result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";
    const detail = timedOut
      ? `timed out after ${Math.round(timeout / 1000)} s`
      : (result.stderr || result.stdout || String(result.error ?? ""))
          .trim()
          .slice(0, 300);
    throw new Unavailable(`qmd ${args.slice(0, 2).join(" ")} failed: ${detail}`);
  }
  return result.stdout;
}

function resolveIdentity(cwd: string): Identity {
  const result = spawnSync(
    join(SCRIPT_DIR, "resolve-state-workspace"),
    ["--path", cwd],
    { encoding: "utf8" },
  );
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    throw new Unavailable("state resolver gave no usable answer");
  }
  // work_id_required still names the state root; this script needs no work stream
  if (parsed.status !== "resolved" && parsed.status !== "work_id_required") {
    throw new Unavailable(
      `state resolver: ${String(parsed.error ?? parsed.status)}`.slice(0, 300),
    );
  }
  const { state_key, state_root, durable_root, vcs } = parsed;
  if (
    typeof state_key !== "string" ||
    typeof state_root !== "string" ||
    typeof durable_root !== "string" ||
    typeof vcs !== "string"
  ) {
    throw new Unavailable("state resolver omitted the state identity");
  }
  // a slug can collide with another key (`a.b/c` and `a-b/c`); a collision guard was declined (DQ-13, goal.md Out of Scope), so the slug is used as is
  const prefix = state_key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!prefix) throw new Unavailable("state key yields an empty prefix");
  return {
    stateKey: state_key,
    stateRoot: state_root,
    durableRoot: durable_root,
    vcs,
    prefix,
  };
}

function requireModels(): void {
  const models = join(cacheRoot(), "models");
  const present =
    existsSync(models) &&
    readdirSync(models).some((name) => /embed.*\.gguf$/i.test(name));
  if (!present) {
    throw new Unavailable("embedding model is missing; run `qmd pull`");
  }
}

function git(base: string[], args: string[]) {
  heartbeat?.();
  return spawnSync("git", [...base, ...args], {
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
  });
}

function canonical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

// the resolver names the checkout's VCS; only the repository it names is exported, never an unrelated parent
function gitBase(identity: Identity): string[] {
  const { durableRoot } = identity;
  if (identity.vcs === "jj") {
    // same flag as the resolver's own jj calls: never snapshot the working copy
    const jj = spawnSync("jj", ["--ignore-working-copy", "git", "root"], {
      cwd: durableRoot,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
    });
    const root = jj.status === 0 ? jj.stdout.trim() : "";
    if (!root) throw new Unavailable("jj reports no git repository behind the workspace");
    return ["--git-dir", root];
  }
  const top = git(["-C", durableRoot], ["rev-parse", "--show-toplevel"]);
  const toplevel = top.status === 0 ? top.stdout.trim() : "";
  if (!toplevel) throw new Unavailable("not inside a git worktree");
  if (canonical(toplevel) !== canonical(durableRoot)) {
    throw new Unavailable(
      `git toplevel ${toplevel} differs from the resolved checkout ${durableRoot}`,
    );
  }
  return ["-C", durableRoot];
}

// never fetches: origin/HEAD is whatever the local clone already knows
function defaultBranchTip(base: string[]): string {
  const result = git(base, ["rev-parse", "--verify", "origin/HEAD^{commit}"]);
  const sha = result.stdout.trim();
  if (result.status !== 0 || !/^[0-9a-f]{40,64}$/.test(sha)) {
    throw new Unavailable(
      "origin/HEAD is not set; run `git remote set-head origin -a`",
    );
  }
  return sha;
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
}

// returns the identity (inode and mtime) of the lock it judged stale, or null when the lock is live
function judgeStale(lock: string): { ino: number; mtimeMs: number } | null {
  let info: ReturnType<typeof statSync>;
  try {
    info = statSync(lock);
  } catch {
    return null;
  }
  const age = Date.now() - info.mtimeMs;
  const holder = Number.parseInt(readText(join(lock, "pid")) ?? "", 10);
  const stale = holder
    ? !processAlive(holder) || age > LOCK_STALE_MS
    : age > LOCK_NO_PID_GRACE_MS;
  return stale ? { ino: info.ino, mtimeMs: info.mtimeMs } : null;
}

// renames the lock away, which only one contender can win, and keeps it only if inode and mtime both match the lock judged stale (an inode alone can be reused); otherwise it is renamed straight back, and a failure there means another run holds the lock now, so the displaced directory is left for clearStaging. a third run interleaving within these few system calls can still be displaced; that window is inherent to a lock built on directory renames, and its worst outcome is a rebuildable cache
function takeOver(lock: string, judged: { ino: number; mtimeMs: number }): void {
  const away = `${lock}.stale-${process.pid}-${Date.now()}`;
  try {
    renameSync(lock, away);
  } catch {
    return;
  }
  let info: ReturnType<typeof statSync>;
  try {
    info = statSync(away);
  } catch {
    return;
  }
  if (info.ino === judged.ino && info.mtimeMs === judged.mtimeMs) {
    rmSync(away, { recursive: true, force: true });
    return;
  }
  try {
    renameSync(away, lock);
  } catch {
    // another run holds the lock now
  }
}

function lockWaitMs(): number {
  return overrideMs("QMD_INDEX_LOCK_WAIT_MS", LOCK_WAIT_MS, 0);
}

export function withLock<T>(treesDir: string, prefix: string, body: () => T): T {
  mkdirSync(treesDir, { recursive: true });
  const lock = join(treesDir, `${prefix}.lock`);
  const pidFile = join(lock, "pid");
  const deadline = Date.now() + lockWaitMs();
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const judged = judgeStale(lock);
      if (judged !== null) takeOver(lock, judged);
      // checked after a takeover too, so a takeover that keeps putting the lock back cannot spin
      if (Date.now() > deadline) {
        throw new Unavailable("index busy: another qmd-index run holds the lock");
      }
      if (judged === null) sleep(LOCK_POLL_MS);
    }
  }
  writeFileSync(pidFile, String(process.pid));
  heartbeat = () => {
    try {
      const now = new Date();
      utimesSync(lock, now, now);
    } catch {
      // the lock was taken from us; release below leaves it alone
    }
  };
  try {
    return body();
  } finally {
    heartbeat = null;
    // delete only our own lock: a takeover may have replaced it
    if (readText(pidFile) === String(process.pid)) {
      rmSync(lock, { recursive: true, force: true });
    }
  }
}

// leftovers of an export that died midway; the lock is held, so none belongs to a live run
function clearStaging(treesDir: string, prefix: string): void {
  for (const entry of readdirSync(treesDir)) {
    if (entry.startsWith(`${prefix}.staging-`) || entry.startsWith(`${prefix}.lock.stale-`)) {
      rmSync(join(treesDir, entry), { recursive: true, force: true });
    }
  }
}

function exportTip(
  base: string[],
  sha: string,
  treesDir: string,
  prefix: string,
): boolean {
  const dir = join(treesDir, prefix);
  const shaFile = join(treesDir, `${prefix}.sha`);
  if (readText(shaFile) === sha && existsSync(dir)) return false;
  const stage = join(treesDir, `${prefix}.staging-${process.pid}`);
  const tar = `${stage}.tar`;
  mkdirSync(stage, { recursive: true });
  try {
    const archive = git(base, ["archive", "--format=tar", "-o", tar, sha]);
    if (archive.status !== 0) {
      throw new Unavailable(`git archive failed: ${archive.stderr.trim().slice(0, 300)}`);
    }
    heartbeat?.();
    const extract = spawnSync("tar", ["-xf", tar, "-C", stage], {
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
    });
    if (extract.status !== 0) {
      throw new Unavailable(`tar failed: ${String(extract.stderr).trim().slice(0, 300)}`);
    }
    const old = `${stage}.old`;
    if (existsSync(dir)) renameSync(dir, old);
    renameSync(stage, dir);
    rmSync(old, { recursive: true, force: true });
    writeFileSync(shaFile, `${sha}\n`);
  } finally {
    rmSync(stage, { recursive: true, force: true });
    rmSync(tar, { force: true });
  }
  return true;
}

// a parse miss is `unavailable`, never an empty answer that would read as "no collections"
function listCollections(): Map<string, Listed> {
  const out = qmdOk(["collection", "list"]);
  const found = new Map<string, Listed>();
  if (/No collections found/.test(out)) return found;
  const seenFiles = new Set<string>();
  let current: Listed | undefined;
  for (const line of out.split("\n")) {
    const head = /^(\S+) \(qmd:\/\/[^)]*\)( \[excluded\])?\s*$/.exec(line);
    if (head) {
      current = { name: head[1], pattern: "", files: 0, excluded: !!head[2] };
      found.set(current.name, current);
      continue;
    }
    if (!current) continue;
    const pattern = /^\s+Pattern:\s+(.*)$/.exec(line);
    if (pattern) current.pattern = pattern[1].trim();
    const files = /^\s+Files:\s+(\d+)/.exec(line);
    if (files) {
      current.files = Number.parseInt(files[1], 10);
      seenFiles.add(current.name);
    }
  }
  if (!found.size && out.trim()) {
    throw new Unavailable("could not read qmd collection list");
  }
  for (const entry of found.values()) {
    if (!entry.pattern || !seenFiles.has(entry.name)) {
      throw new Unavailable(`could not read the definition of ${entry.name} from qmd collection list`);
    }
  }
  return found;
}

function configDir(): string {
  if (process.env.QMD_CONFIG_DIR) return process.env.QMD_CONFIG_DIR;
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "qmd");
  return join(homedir(), ".config", "qmd");
}

// qmd keeps each collection's path and its `update:` and `processor:` commands in index.yml, so one read-only parse replaces a `collection show` per collection; the file is never written here. a missing file means no collections, any other failure is `unavailable`
function readConfig(): { collections: Map<string, Definition>; embedModel: string | null } {
  const path = join(configDir(), "index.yml");
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { collections: new Map(), embedModel: null };
    }
    throw new Unavailable(`cannot read qmd config ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(text);
  } catch {
    throw new Unavailable(`cannot parse qmd config ${path}`);
  }
  const root = (parsed ?? {}) as Record<string, unknown>;
  const raw = root.collections ?? {};
  if (typeof root !== "object" || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Unavailable(`unexpected shape in qmd config ${path}`);
  }
  const collections = new Map<string, Definition>();
  for (const [name, entry] of Object.entries(raw as Record<string, unknown>)) {
    const item = (entry ?? {}) as Record<string, unknown>;
    if (
      typeof item !== "object" ||
      (item.path !== undefined && typeof item.path !== "string") ||
      COMMAND_KEYS.some((key) => item[key] !== undefined && item[key] !== null && typeof item[key] !== "string")
    ) {
      throw new Unavailable(`unexpected shape for ${name} in qmd config ${path}`);
    }
    collections.set(name, {
      path: (item.path as string | undefined) ?? "",
      commands: COMMAND_KEYS.filter((key) => {
        const command = item[key];
        return typeof command === "string" && command.trim() !== "";
      }),
    });
  }
  const models = (root.models ?? {}) as Record<string, unknown>;
  return {
    collections,
    embedModel: typeof models.embed === "string" ? models.embed : null,
  };
}

function desiredCollections(
  identity: Identity,
  exportDir: string,
): { wanted: Wanted[]; absent: { name: string; reason: string; root: string }[] } {
  const { prefix, stateRoot } = identity;
  const works = join(stateRoot, "works");
  const notion = join(stateRoot, "notion");
  const all: Wanted[] = [
    {
      name: `${prefix}-docs`,
      root: exportDir,
      pattern: DOCS_PATTERN,
      context:
        "Durable repository documentation (README and docs/) at the default branch tip. Authoritative for current design and contracts.",
    },
    {
      name: `${prefix}-code`,
      root: exportDir,
      pattern: CODE_PATTERN,
      context:
        "Source, tests and shell scripts at the default branch tip (ts, tsx, js, py, go, rs, sh, bash, and extension-less files in scripts/). Open the file for exact behavior; uncommitted workspace changes are not indexed.",
    },
    {
      name: `${prefix}-streams`,
      root: works,
      pattern: "**/*.md",
      context:
        "Live work-stream charters, state, plans, decisions and reviews. Working memory: authoritative only for its own active stream, never over merged code or docs.",
    },
    {
      name: `${prefix}-history`,
      root: stateRoot,
      pattern: HISTORY_PATTERN,
      context:
        "Completed-work journals and archived streams. A historical record of past decisions, not current truth.",
    },
    {
      name: `${prefix}-memory`,
      root: stateRoot,
      pattern: MEMORY_PATTERN,
      context:
        "Project overview, environment facts, traps and deferred backlog findings. Dated and re-measurable: verify before relying.",
    },
    {
      name: `${prefix}-notion`,
      root: notion,
      pattern: "**/*.md",
      context:
        "Mirror of Notion pages kept as transport. Never authoritative: the Notion page or the repository docs win on conflict.",
    },
  ];
  const wanted: Wanted[] = [];
  const absent: { name: string; reason: string; root: string }[] = [];
  for (const entry of all) {
    if (isDirectory(entry.root)) wanted.push(entry);
    else absent.push({ name: entry.name, reason: `${entry.root} does not exist`, root: entry.root });
  }
  return { wanted, absent };
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// qmd context list groups by collection: a bare name line, then an indented `/ (root)` entry
function hasContext(listing: string, name: string): boolean {
  const lines = listing.split("\n");
  const at = lines.findIndex((line) => line === name);
  return at >= 0 && /^\s+\/ \(root\)\s*$/.test(lines[at + 1] ?? "");
}

// the scoped update runs the commands of this repository's collections only, so one of our own that carries an `update:` or `processor:` entry (for example a planted one) is refused; other repositories' commands are never run by it
function refuseOwnCommands(prefix: string, collections: Map<string, Definition>): void {
  const own = new Set(ownNames(prefix));
  const commanded = [...collections]
    .filter(([name, def]) => own.has(name) && def.commands.length)
    .map(([name, def]) => `${name} (${def.commands.join(", ")})`);
  if (commanded.length) {
    throw new Unavailable(
      `an update or processor command is set on this repository's collection ${commanded.join("; ")}; not running it`,
    );
  }
}

// the installed package root is two levels above the real path of the `qmd` executable (<pkg>/bin/qmd)
function qmdPackageRoot(): string {
  return dirname(dirname(realpathSync(qmdLauncher())));
}

function indexPath(): string {
  return process.env.INDEX_PATH || join(cacheRoot(), "index.sqlite");
}

// qmd's CLI `update` has no collection filter and rescans every collection of the shared index, so the update goes through qmd's SDK, which takes `collections`. the store opens the same index.sqlite and index.yml that `--index index` names; opening only reads the config under qmd's config lock and syncs its rows into the index
const SCOPED_UPDATE = `
import { pathToFileURL } from "node:url";
const { entry, dbPath, configPath, collections } = JSON.parse(process.env.QMD_INDEX_SCOPED);
const { createStore } = await import(pathToFileURL(entry).href);
const store = await createStore({ dbPath, configPath });
try {
  await store.update({ collections });
} finally {
  await store.close();
}
`;

function scopedUpdate(names: string[]): void {
  const entry = join(qmdPackageRoot(), "dist", "index.js");
  if (!existsSync(entry)) throw new Unavailable(`qmd SDK not found at ${entry}`);
  heartbeat?.();
  const result = spawnSync("node", ["--input-type=module", "-e", SCOPED_UPDATE], {
    cwd: cacheRoot(),
    env: {
      ...qmdEnv(),
      QMD_INDEX_SCOPED: JSON.stringify({
        entry,
        dbPath: indexPath(),
        configPath: join(configDir(), "index.yml"),
        collections: names,
      }),
    },
    encoding: "utf8",
    timeout: QMD_UPDATE_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER_BYTES,
  });
  const code = (result.error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOENT") throw new Unavailable("node is not installed");
  if (code === "ETIMEDOUT") {
    throw new Unavailable(
      `qmd update failed: timed out after ${Math.round(QMD_UPDATE_TIMEOUT_MS / 1000)} s`,
    );
  }
  if (result.error || result.status !== 0) {
    const detail = (result.stderr || result.stdout || String(result.error ?? ""))
      .trim()
      .slice(0, 300);
    throw new Unavailable(`qmd update failed: ${detail}`);
  }
}

// edits only the exact names this script owns, and removes one only after reading a mismatch
function reconcile(
  wanted: Wanted[],
  absent: { name: string }[],
  listed: Map<string, Listed>,
  defs: Map<string, Definition>,
): void {
  const contexts = qmdOk(["context", "list"]);
  for (const gone of absent) {
    if (listed.has(gone.name)) qmdOk(["collection", "remove", gone.name]);
  }
  for (const want of wanted) {
    let have = listed.get(want.name);
    const def = defs.get(want.name);
    let fresh = !have;
    if (have && !def?.path) {
      throw new Unavailable(`qmd config has no path for ${want.name}`);
    }
    if (
      have &&
      def &&
      (have.pattern !== want.pattern || canonical(def.path) !== canonical(want.root))
    ) {
      qmdOk(["collection", "remove", want.name]);
      have = undefined;
      fresh = true;
    }
    if (!have) {
      const add = qmd([
        "collection",
        "add",
        want.root,
        "--name",
        want.name,
        "--mask",
        want.pattern,
      ]);
      // a concurrent ensure from another checkout may have added it first
      if (add.status !== 0 && !listCollections().has(want.name)) {
        throw new Unavailable(
          `qmd collection add ${want.name} failed: ${String(add.stderr).trim().slice(0, 300)}`,
        );
      }
    } else if (have.excluded) {
      qmdOk(["collection", "include", want.name]);
    }
    if (fresh || !hasContext(contexts, want.name)) {
      // a context only helps retrieval, so its failure never blocks the index
      qmd(["context", "add", `qmd://${want.name}/`, want.context]);
    }
  }
}

function indexPending(): number {
  const out = qmdOk(["status"]);
  if (!/Total:\s+\d+ files indexed/.test(out)) {
    throw new Unavailable("could not read qmd status");
  }
  const pending = /Pending:\s+(\d+)\s+need embedding/.exec(out)?.[1];
  return pending ? Number.parseInt(pending, 10) : 0;
}

// qmd's CLI has no per-collection vector count, so the index is read with writes refused. a hash counts as embedded only when it has every chunk it expects (as many rows as its MAX(total_chunks)) under the configured embed model; a changed chunking fingerprint is not visible here and stays with `qmd embed -f`. any schema or read problem gives null
function ownCounts(names: string[], embedModel: string | null): Map<string, Counts> | null {
  if (!names.length) return new Map();
  // a remote model's stored name differs from its configured URI, so its vectors cannot be matched here
  if (embedModel && /^https?:/i.test(embedModel)) return null;
  const path = indexPath();
  if (!existsSync(path)) return null;
  try {
    // a read-only open fails on qmd's idle WAL index, since it cannot recreate -shm; open as an ordinary WAL reader that refuses writes
    const db = new Database(path, { readwrite: true, create: false });
    try {
      db.run("PRAGMA query_only = ON");
      const marks = names.map(() => "?").join(",");
      const modelFilter = embedModel ? "WHERE model = ?" : "";
      const rows = db
        .query(
          `SELECT d.collection AS name, COUNT(DISTINCT d.hash) AS total,
                  COUNT(DISTINCT CASE WHEN v.hash IS NOT NULL THEN d.hash END) AS embedded
           FROM documents d
           LEFT JOIN (
             SELECT hash, COUNT(*) AS chunks, MAX(total_chunks) AS expected
             FROM content_vectors ${modelFilter} GROUP BY hash
           ) v ON v.hash = d.hash AND v.chunks >= v.expected
           WHERE d.active = 1 AND d.collection IN (${marks})
           GROUP BY d.collection`,
        )
        .all(...(embedModel ? [embedModel] : []), ...names) as {
        name: string;
        total: number;
        embedded: number;
      }[];
      const counts = new Map<string, Counts>(
        names.map((name) => [name, { total: 0, embedded: 0 }]),
      );
      for (const row of rows) counts.set(row.name, row);
      return counts;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

function pendingOf(counts: Counts): number {
  return counts.total - counts.embedded;
}

function embedPidFile(prefix: string): string {
  return join(cacheRoot(), "trees", `${prefix}.embed.pid`);
}

function embedRunning(prefix: string): boolean {
  const pid = Number.parseInt(readText(embedPidFile(prefix)) ?? "", 10);
  if (!pid || !processAlive(pid)) return false;
  const ps = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
    encoding: "utf8",
  });
  return ps.status === 0 && /\bembed\b/.test(ps.stdout);
}

// one detached job embeds only these collections, one after another; qmd holds its own per-index embed lock, so a job that finds another embed running exits at once
export function startEmbed(prefix: string, names: string[]): void {
  const trees = join(cacheRoot(), "trees");
  mkdirSync(trees, { recursive: true });
  const steps = names.map(
    (name) =>
      `qmd --index index embed -c '${name}' --chunk-strategy auto --timeout ${EMBED_TIMEOUT_MINUTES}`,
  );
  const log = openSync(join(trees, `${prefix}.embed.log`), "w");
  try {
    const child = spawn("/bin/sh", ["-c", steps.join("; ")], {
      cwd: cacheRoot(),
      env: qmdEnv(),
      detached: true,
      stdio: ["ignore", log, log],
    });
    child.on("error", () => undefined);
    if (child.pid) writeFileSync(embedPidFile(prefix), String(child.pid));
    child.unref();
  } finally {
    closeSync(log);
  }
}

// starts the job when this repository has documents to embed and no job of ours runs; true when it started one. only the names of `listed` are read, so a listing taken before a document update stays valid; without one, qmd is asked only after the running check
function embedIfPending(identity: Identity, listed?: Map<string, Listed>): boolean {
  if (embedRunning(identity.prefix)) return false;
  const known = listed ?? listCollections();
  const present = ownNames(identity.prefix).filter((name) => known.has(name));
  const counts = ownCounts(present, readConfig().embedModel);
  const targets = counts
    ? present.filter((name) => pendingOf(counts.get(name) as Counts) > 0)
    : indexPending() > 0
      ? present
      : [];
  if (!targets.length) return false;
  startEmbed(identity.prefix, targets);
  return true;
}

function report(
  identity: Identity,
  started: boolean,
  skipped: { name: string; reason: string }[],
): Report {
  const listed = listCollections();
  const own = ownNames(identity.prefix).filter((name) => listed.has(name));
  if (!own.length) {
    return {
      status: "unavailable",
      mode: null,
      reason: `no collections for ${identity.prefix}; run qmd-index ensure`,
      prefix: identity.prefix,
    };
  }
  // every one of the six names has a known root, whether or not the directory exists yet
  const known = desiredCollections(identity, join(cacheRoot(), "trees", identity.prefix));
  const roots = new Map([...known.wanted, ...known.absent].map((c) => [c.name, c.root]));
  const counts = ownCounts(own, readConfig().embedModel);
  const ownPending = counts
    ? own.reduce((sum, name) => sum + pendingOf(counts.get(name) as Counts), 0)
    : null;
  const ownVectors = counts
    ? own.reduce((sum, name) => sum + (counts.get(name) as Counts).embedded, 0)
    : 0;
  return {
    status: "ready",
    // the models are present (checked before any report), so hybrid needs only a vector of this repository's
    mode: ownVectors > 0 ? "hybrid" : "lexical",
    prefix: identity.prefix,
    sha: readText(join(cacheRoot(), "trees", `${identity.prefix}.sha`)),
    embedding: {
      pending: ownPending,
      index_pending: indexPending(),
      // a job we just launched counts as running even if qmd's own lock ends it at once
      running: started || embedRunning(identity.prefix),
      started,
    },
    collections: own.map((name) => {
      const entry = listed.get(name) as Listed;
      return {
        name,
        documents: entry.files,
        root: roots.get(name) as string,
        pattern: entry.pattern,
      };
    }),
    skipped,
  };
}

function ensure(cwd: string): Report {
  const identity = resolveIdentity(cwd);
  qmdOk(["--help"], QMD_PROBE_TIMEOUT_MS);
  requireModels();
  const base = gitBase(identity);
  const sha = defaultBranchTip(base);
  const treesDir = join(cacheRoot(), "trees");
  mkdirSync(treesDir, { recursive: true });
  return withLock(treesDir, identity.prefix, () => {
    clearStaging(treesDir, identity.prefix);
    exportTip(base, sha, treesDir, identity.prefix);
    const { wanted, absent } = desiredCollections(
      identity,
      join(treesDir, identity.prefix),
    );
    const listed = listCollections();
    const { collections: defs } = readConfig();
    refuseOwnCommands(identity.prefix, defs);
    reconcile(wanted, absent, listed, defs);
    // reconcile just added and removed collections, so list again once; the update below changes document counts but never the names, so the embed step reuses this listing and only the report re-lists for fresh counts
    const present = listCollections();
    scopedUpdate(ownNames(identity.prefix).filter((name) => present.has(name)));
    return report(
      identity,
      embedIfPending(identity, present),
      absent.map(({ name, reason }) => ({ name, reason })),
    );
  });
}

function embed(cwd: string): Report {
  const identity = resolveIdentity(cwd);
  qmdOk(["--help"], QMD_PROBE_TIMEOUT_MS);
  requireModels();
  const treesDir = join(cacheRoot(), "trees");
  return withLock(treesDir, identity.prefix, () =>
    report(identity, embedIfPending(identity), []),
  );
}

function status(cwd: string): Report {
  const identity = resolveIdentity(cwd);
  qmdOk(["--help"], QMD_PROBE_TIMEOUT_MS);
  requireModels();
  return report(identity, false, []);
}

function main(): void {
  const command = process.argv[2] ?? "";
  const commands: Record<string, (cwd: string) => Report> = {
    ensure,
    embed,
    status,
  };
  if (!Object.hasOwn(commands, command)) {
    process.stderr.write(USAGE);
    process.exitCode = 2;
    return;
  }
  let result: Report;
  try {
    result = commands[command](process.cwd());
  } catch (error) {
    // SC-5: qmd stays optional, so every failure is a report and never an exit code
    const reason =
      error instanceof Unavailable
        ? error.message
        : `unexpected failure: ${String((error as Error).message)}`.slice(0, 300);
    result = { status: "unavailable", mode: null, reason };
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.main) main();
