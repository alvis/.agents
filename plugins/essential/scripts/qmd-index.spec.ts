import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it, onTestFinished, vi } from "vitest";

import { heartbeat, startEmbed, withLock } from "./qmd-index.ts";

import type { ChildProcess } from "node:child_process";

// the in-process lock and embed tests steer these at the race points; every other call passes through
vi.mock("node:fs", async (importOriginal) => {
  const filesystem = await importOriginal<typeof import("node:fs")>();
  return {
    ...filesystem,
    renameSync: vi.fn(filesystem.renameSync),
    statSync: vi.fn(filesystem.statSync),
  };
});
vi.mock("node:child_process", async (importOriginal) => {
  const childProcess = await importOriginal<typeof import("node:child_process")>();
  return { ...childProcess, spawn: vi.fn(childProcess.spawn) };
});
// the real filesystem, for the moves another run would make at a race point
const fs = await vi.importActual<typeof import("node:fs")>("node:fs");

const scriptsDir = import.meta.dirname;
const PREFIX = "github-com-alvis-agents";
const OWN = ["docs", "code", "streams", "history", "memory"].map((s) => `${PREFIX}-${s}`);

// how long the first fake embed of a job holds before finishing. 4 s is long enough that ensure has certainly returned first on a loaded runner, short enough that cleanup never waits long
const EMBED_HOLD_MS = "4000";
// each wait polls a log every 50 ms; 15 s is over three times the longest fake embed hold plus a loaded runner's spawn latency
const WAIT_MS = 15_000;
// each case starts bun, the resolver, git and a fake qmd several times; 30 s leaves wide headroom on a loaded CI runner
const CASE_TIMEOUT_MS = 30_000;

// a stand-in for qmd: collections live in a JSON file, an index.sqlite mirrors documents and vectors the way the real index does, and every call is logged, so no test reaches the real index, config or models
const FAKE_QMD = `#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

let args = process.argv.slice(2);
const env = process.env;
const pinned = args[0] === "--index" && args[1] === "index";
if (pinned) args = args.slice(2);
const log = (entry) => appendFileSync(env.FAKE_QMD_LOG, JSON.stringify(entry) + "\\n");
log({ args, cwd: process.cwd(), pinned });
// without --index real qmd walks up from its working directory and adopts a project-local config
if (!pinned) {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, ".qmd/index.yml"))) { console.error("used local config " + dir); process.exit(1); }
    const up = join(dir, "..");
    if (up === dir || realpathSync(up) === dir) break;
    dir = realpathSync(up);
  }
}
if (env.FAKE_QMD_FAIL && args[0] === env.FAKE_QMD_FAIL) { console.error("boom"); process.exit(1); }
const stateFile = env.FAKE_QMD_STATE;
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { collections: {}, contexts: {}, vec: [] };
// qmd's own fallbacks for an empty variable
const configDir = env.QMD_CONFIG_DIR || join(env.XDG_CONFIG_HOME || join(env.HOME, ".config"), "qmd");
const indexPath = env.INDEX_PATH || join(env.XDG_CACHE_HOME || join(env.HOME, ".cache"), "qmd", "index.sqlite");
const configFile = join(configDir, "index.yml");
const writeConfig = () => {
  mkdirSync(configDir, { recursive: true });
  const collections = Object.fromEntries(Object.entries(state.collections).map(([n, c]) => [n, { path: c.path, pattern: c.pattern, ...(c.update ? { update: c.update } : {}), ...(c.processor ? { processor: c.processor } : {}) }]));
  writeFileSync(configFile, Bun.YAML.stringify({ collections, models: { embed: "fake-model" } }));
};
if (!existsSync(configFile)) writeConfig();
const save = () => { writeFileSync(stateFile, JSON.stringify(state)); writeConfig(); };
const walk = (dir, rel = "") => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), rel + e.name + "/") : [rel + e.name]);
};
const docs = (name) => walk(state.collections[name].path).map((p) => name + "/" + p);
const allDocs = () => Object.keys(state.collections).flatMap(docs);
const sync = () => {
  const db = new Database(indexPath, { create: true });
  db.run("PRAGMA busy_timeout = 5000");
  // qmd keeps its index in WAL mode and leaves no -wal or -shm once idle, which a read-only open cannot recreate
  db.run("PRAGMA journal_mode = WAL");
  db.run("DROP TABLE IF EXISTS documents");
  db.run("DROP TABLE IF EXISTS content_vectors");
  db.run("CREATE TABLE documents (collection TEXT, path TEXT, hash TEXT, active INTEGER)");
  db.run("CREATE TABLE content_vectors (hash TEXT, seq INTEGER, model TEXT, total_chunks INTEGER)");
  for (const name of Object.keys(state.collections))
    for (const hash of docs(name)) db.run("INSERT INTO documents VALUES (?,?,?,1)", [name, hash, hash]);
  for (const hash of state.vec) db.run("INSERT INTO content_vectors VALUES (?,0,?,1)", [hash, "fake-model"]);
  db.close();
  // bun keeps the WAL files after close where qmd's node runtime removes them; drop them to match idle qmd
  for (const suffix of ["-wal", "-shm"]) rmSync(indexPath + suffix, { force: true });
};
const [a, b, c] = args;
if (a === "--help") console.log("qmd help");
else if (a === "collection" && b === "list") {
  if (env.FAKE_QMD_GARBAGE_LIST) console.log("something unexpected\\nhappened");
  else if (!Object.keys(state.collections).length) console.log("No collections found. Run 'qmd collection add .' to create one.");
  else {
    console.log("Collections (" + Object.keys(state.collections).length + "):\\n");
    for (const [name, col] of Object.entries(state.collections)) {
      console.log(name + " (qmd://" + name + "/)" + (col.include === false ? " [excluded]" : ""));
      console.log("  Pattern:  " + col.pattern);
      console.log("  Files:    " + docs(name).length);
      console.log("  Updated:  0s ago\\n");
    }
  }
} else if (a === "collection" && b === "add") {
  const name = args[args.indexOf("--name") + 1];
  if (state.collections[name]) { console.error("exists"); process.exit(1); }
  state.collections[name] = { path: realpathSync(c), pattern: args[args.indexOf("--mask") + 1] };
  save();
} else if (a === "collection" && b === "remove") {
  delete state.collections[c]; delete state.contexts[c]; save();
} else if (a === "collection" && b === "include") {
  state.collections[c].include = true; save();
} else if (a === "context" && b === "add") {
  state.contexts[c.replace("qmd://", "").replace(/\\/$/, "")] = args.slice(3).join(" "); save();
} else if (a === "context" && b === "list") {
  console.log("Configured Contexts\\n");
  for (const [name, text] of Object.entries(state.contexts)) console.log(name + "\\n  / (root)\\n    " + text + "\\n");
} else if (a === "update") {
  // the real CLI update has no collection filter and would rescan every collection, so the script must never call it
  log({ args: ["update-cli"] });
  console.error("bare qmd update is not allowed");
  process.exit(1);
} else if (a === "__sync") {
  // the fake package asks for an index refresh here
} else if (a === "status") {
  const total = allDocs().length;
  const pending = allDocs().filter((d) => !state.vec.includes(d)).length;
  console.log("Documents\\n  Total:    " + total + " files indexed\\n  Vectors:  " + state.vec.length + " embedded");
  if (pending > 0) console.log("  Pending:  " + pending + " need embedding (run 'qmd embed')");
} else if (a === "embed") {
  const held = stateFile + ".held";
  if (env.FAKE_EMBED_HOLD && !existsSync(held)) {
    writeFileSync(held, "");
    await new Promise((done) => setTimeout(done, Number(env.FAKE_EMBED_HOLD)));
  }
  const names = args.includes("-c") ? [args[args.indexOf("-c") + 1]] : Object.keys(state.collections);
  const fresh = JSON.parse(readFileSync(stateFile, "utf8"));
  fresh.vec = [...new Set([...fresh.vec, ...names.flatMap(docs)])];
  writeFileSync(stateFile, JSON.stringify(fresh));
  Object.assign(state, fresh);
  // log the step done only after its index refresh, so a test that waits for it never races the refresh
  try { sync(); } catch (e) { console.error("SYNCFAIL " + e.message); process.exit(1); }
  log({ args: ["embed-done", ...names] });
} else { console.error("unknown " + args.join(" ")); process.exit(1); }
if (["collection", "__sync"].includes(a) && (a !== "collection" || ["add", "remove"].includes(b))) { try { sync(); } catch (e) { console.error("SYNCFAIL " + e.message); process.exit(1); } }
`;

// the fake SDK: it records the store options and the scoped update, then asks the fake qmd to refresh its index
const FAKE_SDK = `
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const env = process.env;
const log = (entry) => appendFileSync(env.FAKE_QMD_LOG, JSON.stringify(entry) + "\\n");
export async function createStore(options) {
  log({ args: ["createStore"], sdk: options });
  return {
    async update(update) {
      log({ args: ["update"], sdk: { options, update } });
      if (env.FAKE_QMD_FAIL === "update") throw new Error("boom");
      log({ args: ["update-start"] });
      if (env.FAKE_STEAL_LOCK) {
        rmSync(env.FAKE_STEAL_LOCK, { recursive: true, force: true });
        mkdirSync(env.FAKE_STEAL_LOCK);
        writeFileSync(join(env.FAKE_STEAL_LOCK, "pid"), "1");
      }
      if (env.FAKE_UPDATE_HOLD) await new Promise((done) => setTimeout(done, Number(env.FAKE_UPDATE_HOLD)));
      spawnSync(join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "qmd"), ["--index", "index", "__sync"], { env });
      log({ args: ["update-end"] });
      return {};
    },
    async close() {},
  };
}
`;

interface Call {
  args: string[];
  cwd?: string;
  pinned?: boolean;
  sdk?: { options?: { dbPath: string; configPath: string }; update?: { collections: string[] } };
}

interface Run {
  code: number | null;
  out: Record<string, any>;
  stderr: string;
}

class Sandbox {
  readonly root: string;
  readonly home: string;
  readonly repo: string;
  readonly stateRoot: string;
  readonly cache: string;
  readonly bin: string;
  readonly shim: string;
  readonly log: string;
  readonly qmdState: string;
  readonly env: NodeJS.ProcessEnv;
  readonly pkg: string;

  constructor() {
    this.root = realpathSync(mkdtempSync(join(tmpdir(), "qmd-index-")));
    onTestFinished(() => {
      this.stopEmbeds();
      rmSync(this.root, { recursive: true, force: true });
    });
    this.home = join(this.root, "home");
    this.repo = join(this.root, "repo");
    this.stateRoot = join(this.home, ".agents/states/github.com/alvis/.agents");
    this.cache = join(this.home, ".cache");
    this.bin = join(this.root, "bin");
    this.shim = join(this.root, "shim");
    this.log = join(this.root, "calls.log");
    this.qmdState = join(this.root, "qmd-state.json");
    mkdirSync(join(this.stateRoot, "works/demo"), { recursive: true });
    mkdirSync(this.bin);
    mkdirSync(this.shim);
    writeFileSync(join(this.stateRoot, "overview.md"), "# Overview\n");
    writeFileSync(join(this.stateRoot, "works/demo/state.md"), "# State\n");
    writeFileSync(this.log, "");
    // a PATH without the real qmd or jj: only the tools the script itself needs
    for (const tool of ["git", "jq", "bun", "node"]) {
      const found = spawnSync("/bin/sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
      symlinkSync(found, join(this.shim, tool));
    }
    this.env = {
      PATH: `${this.bin}:${this.shim}:/usr/bin:/bin`,
      HOME: this.home,
      XDG_CACHE_HOME: this.cache,
      XDG_CONFIG_HOME: join(this.home, ".config"),
      QMD_CONFIG_DIR: join(this.home, ".config/qmd"),
      QMD_INDEX_LOCK_WAIT_MS: "1500",
      INDEX_PATH: join(this.cache, "qmd/index.sqlite"),
      FAKE_QMD_STATE: this.qmdState,
      FAKE_QMD_LOG: this.log,
    };
    const models = join(this.cache, "qmd/models");
    mkdirSync(models, { recursive: true });
    writeFileSync(join(models, "hf_embeddinggemma-300M-Q8_0.gguf"), "");
    // the package layout the script resolves: PATH holds a symlink to <pkg>/bin/qmd, and <pkg>/dist/index.js is the SDK
    this.pkg = join(this.root, "pkg/@tobilu/qmd");
    mkdirSync(join(this.pkg, "bin"), { recursive: true });
    mkdirSync(join(this.pkg, "dist"));
    writeFileSync(join(this.pkg, "package.json"), '{"type":"module"}');
    writeFileSync(join(this.pkg, "bin/qmd"), FAKE_QMD, { mode: 0o755 });
    writeFileSync(join(this.pkg, "dist/index.js"), FAKE_SDK);
    symlinkSync(join(this.pkg, "bin/qmd"), join(this.bin, "qmd"));
    this.initRepository();
  }

  get configFile(): string {
    return join(this.home, ".config/qmd/index.yml");
  }

  // runs SQL against the fake index with bun, as the script itself would read it
  sql(statements: string[]): void {
    this.settleEmbeds();
    const code = `import { Database } from "bun:sqlite"; const db = new Database(process.env.INDEX_PATH); for (const s of ${JSON.stringify(statements)}) db.run(s); db.close();`;
    const result = spawnSync("bun", ["-e", code], { env: this.env, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  }

  async runAsync(command: string): Promise<Run> {
    return new Promise((done) => {
      const child = spawn(join(scriptsDir, "qmd-index"), [command], {
        cwd: this.repo,
        env: { ...this.env, FAKE_UPDATE_HOLD: "800" },
      });
      let out = "";
      child.stdout.on("data", (chunk) => (out += chunk));
      child.on("close", (code) => done({ code, out: JSON.parse(out), stderr: "" }));
    });
  }

  get trees(): string {
    return join(this.cache, "qmd/trees");
  }

  git(...args: string[]): string {
    const result = spawnSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@example.com", "-C", this.repo, ...args],
      { encoding: "utf8", env: { ...process.env, HOME: this.home } },
    );
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  }

  initRepository(): void {
    mkdirSync(this.repo, { recursive: true });
    this.git("init", "-q", "-b", "main");
    this.git("remote", "add", "origin", "https://github.com/alvis/.agents.git");
    mkdirSync(join(this.repo, "docs"));
    mkdirSync(join(this.repo, "src"));
    writeFileSync(join(this.repo, "README.md"), "# Repo\n");
    writeFileSync(join(this.repo, "docs/guide.md"), "# Guide\n");
    writeFileSync(join(this.repo, "src/a.ts"), "export const a = 1;\n");
    this.git("add", "-A");
    this.git("commit", "-q", "-m", "init");
    this.publishHead();
  }

  // stands in for a fetch: origin/HEAD follows the local tip
  publishHead(): string {
    const sha = this.git("rev-parse", "HEAD");
    this.git("update-ref", "refs/remotes/origin/main", sha);
    this.git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
    return sha;
  }

  commitFile(path: string, body: string): string {
    mkdirSync(dirname(join(this.repo, path)), { recursive: true });
    writeFileSync(join(this.repo, path), body);
    this.git("add", "-A");
    this.git("commit", "-q", "-m", `add ${path}`);
    return this.git("rev-parse", "HEAD");
  }

  run(command: string, extra: NodeJS.ProcessEnv = {}, cwd = this.repo, script = join(scriptsDir, "qmd-index")): Run {
    const result = spawnSync(script, command ? [command] : [], {
      cwd,
      env: { ...this.env, ...extra },
      encoding: "utf8",
    });
    let out: Record<string, any> = {};
    try {
      out = JSON.parse(result.stdout);
    } catch {
      // usage errors print no JSON
    }
    return { code: result.status, out, stderr: result.stderr };
  }

  // a copy of the script with a stub resolver, to drive resolver answers a real checkout cannot give
  stubbed(answer: Record<string, unknown>): string {
    const dir = join(this.root, `stub-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir);
    for (const file of ["qmd-index", "qmd-index.ts"]) copyFileSync(join(scriptsDir, file), join(dir, file));
    chmodSync(join(dir, "qmd-index"), 0o755);
    writeFileSync(
      join(dir, "resolve-state-workspace"),
      `#!/usr/bin/env bash\ncat <<'JSON'\n${JSON.stringify(answer)}\nJSON\n`,
      { mode: 0o755 },
    );
    return join(dir, "qmd-index");
  }

  // what a real `qmd update` does for new files
  qmdUpdate(): void {
    this.settleEmbeds();
    spawnSync("qmd", ["--index", "index", "__sync"], { env: this.env, encoding: "utf8" });
  }

  names(run: Run): string[] {
    return run.out.collections.map((c: { name: string }) => c.name);
  }

  calls(): Call[] {
    return readFileSync(this.log, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Call);
  }

  commands(name: string): Call[] {
    return this.calls().filter((call) => call.args[0] === name);
  }

  edits(): Call[] {
    return this.commands("collection").filter((c) => ["add", "remove", "include"].includes(c.args[1]));
  }

  embedsDone(): Call[] {
    return this.commands("embed-done");
  }

  seedForeign(name = "other-repo-docs", extra: Record<string, unknown> = {}): void {
    this.settleEmbeds();
    const foreign = join(this.root, `foreign-${name}`);
    mkdirSync(foreign, { recursive: true });
    writeFileSync(join(foreign, "note.md"), "x");
    const state = existsSync(this.qmdState)
      ? JSON.parse(readFileSync(this.qmdState, "utf8"))
      : { collections: {}, contexts: {}, vec: [] };
    state.collections[name] = { path: foreign, pattern: "**/*.md", ...extra };
    writeFileSync(this.qmdState, JSON.stringify(state));
    // the fake rewrites its config file when it is missing
    rmSync(join(this.home, ".config/qmd/index.yml"), { force: true });
  }

  qmdState_(): { collections: Record<string, any>; contexts: Record<string, string>; vec: string[] } {
    return JSON.parse(readFileSync(this.qmdState, "utf8"));
  }

  setQmdState(change: (state: ReturnType<Sandbox["qmdState_"]>) => void): void {
    this.settleEmbeds();
    const state = this.qmdState_();
    change(state);
    writeFileSync(this.qmdState, JSON.stringify(state));
    // the fake rebuilds its config file from the state when it is missing
    rmSync(this.configFile, { force: true });
  }

  async waitFor(predicate: () => boolean): Promise<void> {
    const deadline = Date.now() + WAIT_MS;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error("timed out waiting for the background embed");
      await new Promise((done) => setTimeout(done, 50));
    }
  }

  // a background embed job reads and rewrites the fake state, config and index.sqlite, so every helper that touches them waits for the job to exit first
  settleEmbeds(): void {
    if (!existsSync(this.trees)) return;
    const deadline = Date.now() + WAIT_MS;
    for (const name of readdirSync(this.trees).filter((entry) => entry.endsWith(".embed.pid"))) {
      const pid = Number.parseInt(readFileSync(join(this.trees, name), "utf8"), 10);
      for (;;) {
        try {
          process.kill(pid, 0);
        } catch {
          break; // finished
        }
        if (Date.now() > deadline) throw new Error("timed out waiting for the background embed");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
    }
  }

  stopEmbeds(): void {
    if (!existsSync(this.trees)) return;
    for (const name of readdirSync(this.trees).filter((entry) => entry.endsWith(".embed.pid"))) {
      const pid = Number.parseInt(readFileSync(join(this.trees, name), "utf8"), 10);
      try {
        process.kill(pid);
      } catch {
        // already finished
      }
    }
  }

  // routes `qmd <first> <second>` through a shell body and every other call to the fake, keeping <pkg>/bin/qmd as the resolved package
  interceptQmd(first: string, second: string, body: string): void {
    // a running embed job resolves qmd through this link, so swap it only once the job has exited
    this.settleEmbeds();
    const wrapper = join(this.pkg, "bin/intercept");
    writeFileSync(
      wrapper,
      `#!/bin/sh\nif [ "$3" = "${first}" ] && [ "$4" = "${second}" ]; then\n${body}\nfi\nexec "${join(this.pkg, "bin/qmd")}" "$@"\n`,
      { mode: 0o755 },
    );
    rmSync(join(this.bin, "qmd"));
    symlinkSync(wrapper, join(this.bin, "qmd"));
  }

  lockDir(): string {
    mkdirSync(this.trees, { recursive: true });
    const lock = join(this.trees, `${PREFIX}.lock`);
    mkdirSync(lock);
    return lock;
  }
}

function deadPid(): number {
  return spawnSync("true").pid as number;
}

function age(path: string, seconds: number): void {
  const past = new Date(Date.now() - seconds * 1000);
  utimesSync(path, past, past);
}

describe("qmd-index", { timeout: CASE_TIMEOUT_MS }, () => {
  it("prefixes exactly five collections with the full state-key slug and runs qmd from its cache root", () => {
    const sandbox = new Sandbox();

    const run = sandbox.run("ensure");

    expect(run.code).toBe(0);
    expect(run.out.status).toBe("ready");
    expect(run.out.prefix).toBe(PREFIX);
    expect(sandbox.names(run).sort()).toEqual([...OWN].sort());
    const collections = sandbox.qmdState_().collections;
    expect(collections[`${PREFIX}-docs`]).toEqual({
      path: join(sandbox.cache, "qmd/trees", PREFIX),
      pattern: "README.md,docs/**/*.md",
    });
    expect(collections[`${PREFIX}-code`].pattern).toBe("**/*.{ts,tsx,js,py,go,rs,sh,bash},**/scripts/!(*.*)");
    expect(collections[`${PREFIX}-streams`]).toEqual({
      path: join(sandbox.stateRoot, "works"),
      pattern: "**/*.md",
    });
    expect(collections[`${PREFIX}-history`].pattern).toBe("journals.md,journals/**/*.md,archive/**/*.md");
    expect(collections[`${PREFIX}-memory`].pattern).toBe(
      "overview.md,environment.md,traps.md,backlogs.md,backlogs/**/*.md",
    );
    expect(existsSync(join(sandbox.cache, "qmd/trees", PREFIX, "docs/guide.md"))).toBe(true);
    expect(sandbox.commands("collection").filter((c) => c.args[1] === "show")).toHaveLength(0);
    expect(sandbox.calls().filter((call) => call.cwd).every((call) => call.cwd === join(sandbox.cache, "qmd"))).toBe(true);
  });

  it("pins every qmd call, and each embed line, to the global index so a .qmd/index.yml above the cache root is never used", async () => {
    const sandbox = new Sandbox();
    mkdirSync(join(sandbox.home, ".qmd"));
    writeFileSync(join(sandbox.home, ".qmd/index.yml"), "collections: {}\n");

    const run = sandbox.run("ensure");

    expect(run.out.status).toBe("ready");
    await sandbox.waitFor(() => sandbox.embedsDone().length === OWN.length);
    const calls = sandbox.calls().filter((c) => c.cwd);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.pinned)).toBe(true);
    expect(sandbox.commands("embed").every((c) => (c as Call).pinned)).toBe(true);
  });

  it("gives the same collections from a second checkout of the repository", () => {
    const sandbox = new Sandbox();
    const other = join(sandbox.root, "second");
    expect(spawnSync("git", ["clone", "-q", sandbox.repo, other]).status).toBe(0);
    spawnSync("git", ["-C", other, "remote", "set-url", "origin", "https://github.com/alvis/.agents.git"]);
    spawnSync("git", ["-C", other, "update-ref", "refs/remotes/origin/main", sandbox.git("rev-parse", "HEAD")]);
    spawnSync("git", ["-C", other, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);

    const first = sandbox.run("ensure");
    const second = sandbox.run("ensure", {}, other);

    expect(sandbox.names(second)).toEqual(sandbox.names(first));
    expect(sandbox.commands("collection").filter((c) => c.args[1] === "add")).toHaveLength(5);
  });

  it("exports through jj's own git root with --ignore-working-copy when the resolver says jj", () => {
    const sandbox = new Sandbox();
    const jjLog = join(sandbox.root, "jj.log");
    writeFileSync(
      join(sandbox.bin, "jj"),
      `#!/bin/sh\necho "$@" >> ${jjLog}\necho ${join(sandbox.repo, ".git")}\n`,
      { mode: 0o755 },
    );
    const stub = sandbox.stubbed({
      status: "resolved",
      vcs: "jj",
      state_key: "github.com/alvis/.agents",
      state_root: sandbox.stateRoot,
      durable_root: join(sandbox.root, "jj-workspace"),
    });
    mkdirSync(join(sandbox.root, "jj-workspace"));

    const run = sandbox.run("ensure", {}, sandbox.repo, stub);

    expect(run.out.status).toBe("ready");
    expect(readFileSync(jjLog, "utf8").trim()).toBe("--ignore-working-copy git root");
    expect(existsSync(join(sandbox.trees, PREFIX, "docs/guide.md"))).toBe(true);
  });

  it("refuses an unrelated parent repository when git's toplevel differs from the resolved checkout", () => {
    const sandbox = new Sandbox();
    const nested = join(sandbox.repo, "src");
    const stub = sandbox.stubbed({
      status: "resolved",
      vcs: "git",
      state_key: "github.com/alvis/.agents",
      state_root: sandbox.stateRoot,
      durable_root: nested,
    });

    const run = sandbox.run("ensure", {}, nested, stub);

    expect(run.code).toBe(0);
    expect(run.out.status).toBe("unavailable");
    expect(run.out.reason).toMatch(/differs from the resolved checkout/);
    expect(existsSync(join(sandbox.trees, PREFIX))).toBe(false);
    expect(sandbox.edits()).toHaveLength(0);
  });

  describe("when the checkout cannot be identified", () => {
    it("reports unavailable when the resolver prints no JSON", () => {
      const sandbox = new Sandbox();
      const stub = sandbox.stubbed({});
      writeFileSync(join(dirname(stub), "resolve-state-workspace"), "#!/bin/sh\necho not json\n", { mode: 0o755 });

      const run = sandbox.run("ensure", {}, sandbox.repo, stub);

      expect(run.code).toBe(0);
      expect(run.out.status).toBe("unavailable");
      expect(run.out.reason).toMatch(/resolver/);
      expect(sandbox.calls()).toHaveLength(0);
    });

    it.each([
      ["a failed status without an error", { status: "remote_required" }, /remote_required/],
      ["a resolved answer without the state identity", { status: "resolved", vcs: "git", state_key: "github.com/alvis/.agents" }, /omitted/],
      ["a state key with no letters or digits", { status: "resolved", vcs: "git", state_key: "/./", state_root: "/s", durable_root: "/d" }, /empty prefix/],
    ])("reports unavailable for %s and runs no qmd", (_name, answer, reason) => {
      const sandbox = new Sandbox();

      const run = sandbox.run("ensure", {}, sandbox.repo, sandbox.stubbed(answer));

      expect(run.code).toBe(0);
      expect(run.out.status).toBe("unavailable");
      expect(run.out.reason).toMatch(reason);
      expect(sandbox.calls()).toHaveLength(0);
    });

    it.each([
      ["jj finds no git repository behind the workspace", "jj", /jj reports no git/],
      ["the resolved git checkout is not a worktree", "git", /not inside a git worktree/],
    ])("reports unavailable and exports nothing when %s", (_name, vcs, reason) => {
      const sandbox = new Sandbox();
      writeFileSync(join(sandbox.bin, "jj"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
      const outside = join(sandbox.root, "outside");
      mkdirSync(outside);
      const stub = sandbox.stubbed({
        status: "resolved",
        vcs,
        state_key: "github.com/alvis/.agents",
        state_root: sandbox.stateRoot,
        durable_root: outside,
      });

      const run = sandbox.run("ensure", {}, outside, stub);

      expect(run.out.status).toBe("unavailable");
      expect(run.out.reason).toMatch(reason);
      expect(existsSync(join(sandbox.trees, PREFIX))).toBe(false);
    });
  });

  it("creates the notion collection only when notion/ exists", () => {
    const sandbox = new Sandbox();
    expect(sandbox.names(sandbox.run("ensure"))).not.toContain(`${PREFIX}-notion`);

    mkdirSync(join(sandbox.stateRoot, "notion"));
    writeFileSync(join(sandbox.stateRoot, "notion/page.md"), "# Page\n");
    const withNotion = sandbox.run("ensure");

    expect(sandbox.names(withNotion)).toContain(`${PREFIX}-notion`);
    expect(sandbox.qmdState_().contexts[`${PREFIX}-notion`]).toMatch(/never authoritative/i);

    rmSync(join(sandbox.stateRoot, "notion"), { recursive: true });
    expect(sandbox.names(sandbox.run("ensure"))).not.toContain(`${PREFIX}-notion`);
  });

  it("changes only its own six exact names and ignores similarly named foreign collections", () => {
    const sandbox = new Sandbox();
    sandbox.seedForeign();
    sandbox.seedForeign(`${PREFIX}-types-docs`);

    const first = sandbox.run("ensure");
    const second = sandbox.run("ensure");

    for (const run of [first, second]) {
      expect(sandbox.names(run)).not.toContain(`${PREFIX}-types-docs`);
      expect(sandbox.names(run)).not.toContain("other-repo-docs");
    }
    expect(Object.keys(sandbox.qmdState_().collections)).toContain(`${PREFIX}-types-docs`);
    const touched = sandbox
      .edits()
      .map((c) => (c.args[1] === "add" ? c.args[c.args.indexOf("--name") + 1] : c.args[2]));
    expect(touched.length).toBeGreaterThan(0);
    expect(touched.every((name) => OWN.includes(name) || name === `${PREFIX}-notion`)).toBe(true);
    const contexts = sandbox.commands("context").filter((c) => c.args[1] === "add");
    expect(contexts.every((c) => OWN.some((name) => c.args[2] === `qmd://${name}/`))).toBe(true);
  });

  it("re-includes an excluded collection and replaces one whose pattern positively drifted", () => {
    const sandbox = new Sandbox();
    sandbox.run("ensure");
    sandbox.setQmdState((state) => {
      state.collections[`${PREFIX}-docs`].include = false;
      state.collections[`${PREFIX}-code`].pattern = "**/*.ts";
    });

    sandbox.run("ensure");

    const state = sandbox.qmdState_();
    expect(state.collections[`${PREFIX}-code`].pattern).toBe("**/*.{ts,tsx,js,py,go,rs,sh,bash},**/scripts/!(*.*)");
    expect(state.collections[`${PREFIX}-docs`].include).toBe(true);
    expect(state.contexts[`${PREFIX}-code`]).toBeTruthy();
  });

  it("migrates a code collection that still has the pre-shell pattern, with the new context", () => {
    const sandbox = new Sandbox();
    sandbox.run("ensure");
    sandbox.setQmdState((state) => {
      state.collections[`${PREFIX}-code`].pattern = "**/*.{ts,tsx,js,py,go,rs}";
      state.contexts[`${PREFIX}-code`] = "old text";
    });
    const mark = sandbox.calls().length;

    sandbox.run("ensure");

    const state = sandbox.qmdState_();
    expect(state.collections[`${PREFIX}-code`].pattern).toBe("**/*.{ts,tsx,js,py,go,rs,sh,bash},**/scripts/!(*.*)");
    expect(state.contexts[`${PREFIX}-code`]).toMatch(/shell scripts .*sh, bash, and extension-less files in scripts\//);
    const removed = sandbox.calls().slice(mark).filter((c) => c.args[0] === "collection" && c.args[1] === "remove");
    expect(removed.map((c) => c.args[2])).toEqual([`${PREFIX}-code`]);
  });

  it("re-adds a collection whose recorded folder no longer exists", () => {
    const sandbox = new Sandbox();
    sandbox.run("ensure");
    sandbox.setQmdState((state) => {
      state.collections[`${PREFIX}-docs`].path = join(sandbox.root, "removed");
    });
    const mark = sandbox.calls().length;

    const run = sandbox.run("ensure");

    expect(run.out.status).toBe("ready");
    const changed = sandbox.calls().slice(mark).filter((c) => c.args[0] === "collection" && ["add", "remove"].includes(c.args[1]));
    expect(changed.map((c) => [c.args[1], c.args[1] === "add" ? c.args[c.args.indexOf("--name") + 1] : c.args[2]])).toEqual([
      ["remove", `${PREFIX}-docs`],
      ["add", `${PREFIX}-docs`],
    ]);
  });

  it("adds a context only where the qmd:// entry is missing, whatever its text says", () => {
    const sandbox = new Sandbox();
    sandbox.run("ensure");
    sandbox.setQmdState((state) => {
      state.contexts[`${PREFIX}-docs`] = "hand-written text";
    });
    const mark = sandbox.calls().length;

    sandbox.run("ensure");

    expect(sandbox.qmdState_().contexts[`${PREFIX}-docs`]).toBe("hand-written text");
    expect(sandbox.calls().slice(mark).filter((c) => c.args[0] === "context" && c.args[1] === "add")).toHaveLength(0);
  });

  describe("when qmd output cannot be read", () => {
    it("reports unavailable and removes nothing when qmd's config file cannot be parsed", () => {
      const sandbox = new Sandbox();
      sandbox.run("ensure");
      const mark = sandbox.calls().length;
      writeFileSync(sandbox.configFile, "collections: [unclosed\n  : :\n");

      const run = sandbox.run("ensure");

      expect(run.out.status).toBe("unavailable");
      expect(run.out.reason).toMatch(/qmd config/);
      expect(sandbox.calls().slice(mark).filter((c) => c.args[0] === "collection" && ["add", "remove"].includes(c.args[1]))).toHaveLength(0);
      expect(Object.keys(sandbox.qmdState_().collections)).toContain(`${PREFIX}-docs`);
    });

    it("reports unavailable and removes nothing when the config has no path for a listed collection", () => {
      const sandbox = new Sandbox();
      sandbox.run("ensure");
      const mark = sandbox.calls().length;
      writeFileSync(sandbox.configFile, `collections:\n  ${PREFIX}-code:\n    pattern: "**/*.ts"\n`);

      const run = sandbox.run("ensure");

      expect(run.out.status).toBe("unavailable");
      expect(run.out.reason).toMatch(/no path for/);
      expect(sandbox.calls().slice(mark).filter((c) => c.args[0] === "collection" && ["add", "remove"].includes(c.args[1]))).toHaveLength(0);
    });

    it.each([
      ["is empty", "", /no path for/],
      ["lists collections as an array", "collections: []\n", /unexpected shape in/],
      ["has an empty entry for one of ours", `collections:\n  ${PREFIX}-docs:\n`, /no path for/],
      ["gives a path that is not a string", `collections:\n  ${PREFIX}-docs:\n    path: 5\n`, /unexpected shape for/],
    ])("reports unavailable and removes nothing when qmd's config %s", (_name, text, reason) => {
      const sandbox = new Sandbox();
      sandbox.run("ensure");
      const mark = sandbox.calls().length;
      writeFileSync(sandbox.configFile, text);

      const run = sandbox.run("ensure");

      expect(run.out.status).toBe("unavailable");
      expect(run.out.reason).toMatch(reason);
      expect(sandbox.calls().slice(mark).filter((c) => c.args[0] === "collection" && ["add", "remove"].includes(c.args[1]))).toHaveLength(0);
      expect(Object.keys(sandbox.qmdState_().collections)).toContain(`${PREFIX}-docs`);
    });

    it("reports unavailable when qmd's config path cannot be read as a file", () => {
      const sandbox = new Sandbox();
      sandbox.run("ensure");
      rmSync(sandbox.configFile);
      mkdirSync(sandbox.configFile);

      const run = sandbox.run("ensure");

      expect(run.out.status).toBe("unavailable");
      expect(run.out.reason).toMatch(/cannot read qmd config/);
    });

    it("reports unavailable when a listed collection has no pattern or file count", () => {
      const sandbox = new Sandbox();
      sandbox.interceptQmd("collection", "list", `echo "${PREFIX}-docs (qmd://${PREFIX}-docs/)"; exit 0`);

      const run = sandbox.run("ensure");

      expect(run.out.status).toBe("unavailable");
      expect(run.out.reason).toMatch(/definition of/);
      expect(sandbox.edits()).toHaveLength(0);
    });

    it("reports unavailable when qmd status has no document total", () => {
      const sandbox = new Sandbox();
      sandbox.interceptQmd("status", "", "echo Documents; exit 0");

      const run = sandbox.run("ensure");

      expect(run.out.status).toBe("unavailable");
      expect(run.out.reason).toMatch(/qmd status/);
    });

    it("reports qmd's output when a failing qmd call prints only to stdout", () => {
      const sandbox = new Sandbox();
      sandbox.interceptQmd("status", "", "echo oops; exit 1");

      const run = sandbox.run("ensure");

      expect(run.out.status).toBe("unavailable");
      expect(run.out.reason).toMatch(/oops/);
    });

    it("reports unavailable, with qmd's message, when a qmd call fails", () => {
      const sandbox = new Sandbox();

      const run = sandbox.run("ensure", { FAKE_QMD_FAIL: "status" });

      expect(run.out.status).toBe("unavailable");
      expect(run.out.reason).toMatch(/boom/);
    });

    it("re-adds the context of a collection that ends a truncated context listing", () => {
      const sandbox = new Sandbox();
      sandbox.run("ensure");
      sandbox.interceptQmd("context", "list", `printf 'Configured Contexts\\n\\n${PREFIX}-docs'; exit 0`);
      const mark = sandbox.calls().length;

      sandbox.run("ensure");

      const added = sandbox.calls().slice(mark).filter((c) => c.args[0] === "context" && c.args[1] === "add");
      expect(added.map((c) => c.args[2])).toEqual(OWN.map((name) => `qmd://${name}/`));
    });

    it("reports unavailable and removes nothing when collection list is unreadable", () => {
      const sandbox = new Sandbox();
      sandbox.run("ensure");
      const mark = sandbox.calls().length;

      const run = sandbox.run("ensure", { FAKE_QMD_GARBAGE_LIST: "1" });

      expect(run.out.status).toBe("unavailable");
      expect(run.out.reason).toMatch(/collection list/);
      expect(sandbox.calls().slice(mark).filter((c) => c.args[0] === "collection" && ["add", "remove"].includes(c.args[1]))).toHaveLength(0);
      expect(sandbox.commands("update")).toHaveLength(1);
    });
  });

  describe("when qmd collection add fails", () => {
    it("reports unavailable when the collection is still missing", () => {
      const sandbox = new Sandbox();
      sandbox.interceptQmd("collection", "add", "echo refused >&2; exit 1");

      const run = sandbox.run("ensure");

      expect(run.out.status).toBe("unavailable");
      expect(run.out.reason).toMatch(/collection add .* failed: refused/);
      expect(sandbox.commands("update")).toHaveLength(0);
    });

    it("carries on when a concurrent run added the collection first", () => {
      const sandbox = new Sandbox();
      sandbox.interceptQmd("collection", "add", `"${join(sandbox.pkg, "bin/qmd")}" "$@"; exit 1`);

      const run = sandbox.run("ensure");

      expect(run.out.status).toBe("ready");
      expect(sandbox.names(run)).toEqual(OWN);
    });
  });

  it.each([
    ["the home folder", {}, ".config/qmd"],
    ["XDG_CONFIG_HOME", { XDG_CONFIG_HOME: "xdg" }, "xdg/qmd"],
  ])("falls back to %s for qmd's config, and to the home cache, when the qmd and XDG variables are empty", (_name, extra, config) => {
    const sandbox = new Sandbox();
    const configHome = "XDG_CONFIG_HOME" in extra ? { XDG_CONFIG_HOME: join(sandbox.home, extra.XDG_CONFIG_HOME) } : { XDG_CONFIG_HOME: "" };

    const run = sandbox.run("ensure", { XDG_CACHE_HOME: "", INDEX_PATH: "", QMD_CONFIG_DIR: "", ...configHome });

    expect(run.out.status).toBe("ready");
    expect(sandbox.commands("createStore")[0]?.sdk).toEqual({
      args: undefined,
      dbPath: join(sandbox.cache, "qmd/index.sqlite"),
      configPath: join(sandbox.home, config, "index.yml"),
    });
    expect(new Set(sandbox.commands("--help").map((c) => c.cwd))).toEqual(new Set([join(sandbox.cache, "qmd")]));
  });

  it("creates every collection when qmd has no config file yet", () => {
    const sandbox = new Sandbox();
    sandbox.interceptQmd("collection", "list", `"${join(sandbox.pkg, "bin/qmd")}" "$@"; status=$?; rm -f "${sandbox.configFile}"; exit $status`);

    const run = sandbox.run("ensure");

    expect(run.out.status).toBe("ready");
    expect(sandbox.names(run)).toEqual(OWN);
  });

  it("finds the qmd package past PATH entries that hold no qmd, including an empty one", () => {
    const sandbox = new Sandbox();

    const run = sandbox.run("ensure", { PATH: `:${sandbox.shim}:${sandbox.bin}:/usr/bin:/bin` });

    expect(run.out.status).toBe("ready");
    expect(sandbox.commands("update")).toHaveLength(1);
  });

  it.each([
    ["git archive", "git", (sandbox: Sandbox) => `for a; do [ "$a" = archive ] && { echo refused >&2; exit 1; }; done\nexec "${realpathSync(join(sandbox.shim, "git"))}" "$@"`],
    ["tar", "tar", () => "echo refused >&2; exit 1"],
  ])("reports unavailable and leaves no staging behind when %s fails", (_name, tool, body) => {
    const sandbox = new Sandbox();
    writeFileSync(join(sandbox.bin, tool), `#!/bin/sh\n${body(sandbox)}\n`, { mode: 0o755 });

    const run = sandbox.run("ensure");

    expect(run.out.status).toBe("unavailable");
    expect(run.out.reason).toMatch(/failed: refused/);
    expect(readdirSync(sandbox.trees).filter((entry) => entry.startsWith(PREFIX))).toEqual([]);
    expect(sandbox.edits()).toHaveLength(0);
  });

  it("reports an unexpected failure as unavailable when the lock cannot be created", () => {
    const sandbox = new Sandbox();
    const stub = sandbox.stubbed({
      status: "resolved",
      vcs: "git",
      state_key: "a".repeat(300),
      state_root: sandbox.stateRoot,
      durable_root: sandbox.repo,
    });

    const run = sandbox.run("ensure", {}, sandbox.repo, stub);

    expect(run.code).toBe(0);
    expect(run.out).toEqual({ status: "unavailable", mode: null, reason: expect.stringMatching(/^unexpected failure: /) });
  });

  it("updates through the SDK with only this repository's collections, on the same index and config paths", () => {
    const sandbox = new Sandbox();
    sandbox.seedForeign();
    sandbox.seedForeign(`${PREFIX}-types-docs`);

    const run = sandbox.run("ensure");

    expect(run.out.status).toBe("ready");
    const updates = sandbox.commands("update");
    expect(updates).toHaveLength(1);
    expect(updates[0].sdk?.update?.collections.sort()).toEqual([...OWN].sort());
    expect(updates[0].sdk?.options).toEqual({
      dbPath: join(sandbox.cache, "qmd/index.sqlite"),
      configPath: join(sandbox.home, ".config/qmd/index.yml"),
    });
    expect(sandbox.commands("update-cli")).toHaveLength(0);
  });

  it.each([
    ["an update hook", { update: "git pull" }],
    ["a processor command", { processor: "./convert.sh" }],
  ])("refuses to update and names the collection when one of ours has %s", (_name, command) => {
    const sandbox = new Sandbox();
    sandbox.run("ensure");
    sandbox.setQmdState((state) => {
      Object.assign(state.collections[`${PREFIX}-streams`], command);
    });
    const mark = sandbox.calls().length;

    const run = sandbox.run("ensure");

    expect(run.code).toBe(0);
    expect(run.out.status).toBe("unavailable");
    expect(run.out.reason).toContain(`${PREFIX}-streams`);
    expect(sandbox.calls().slice(mark).filter((c) => c.args[0] === "update")).toHaveLength(0);
    expect(sandbox.calls().slice(mark).filter((c) => c.args[0] === "collection" && ["add", "remove"].includes(c.args[1]))).toHaveLength(0);
  });

  it.each([
    ["an update hook", { update: "git pull" }],
    ["a processor command", { processor: "./convert.sh" }],
  ])("is not blocked by %s on another repository's collection", (_name, command) => {
    const sandbox = new Sandbox();
    sandbox.seedForeign("other-repo-docs", command);

    const run = sandbox.run("ensure");

    expect(run.out.status).toBe("ready");
    expect(sandbox.commands("update")[0].sdk?.update?.collections).not.toContain("other-repo-docs");
  });

  it("reports unavailable when the qmd package has no SDK", () => {
    const sandbox = new Sandbox();
    rmSync(join(sandbox.pkg, "dist/index.js"));

    const run = sandbox.run("ensure");

    expect(run.code).toBe(0);
    expect(run.out.status).toBe("unavailable");
    expect(run.out.reason).toMatch(/SDK not found/);
  });

  it("reports unavailable when node is not installed", () => {
    const sandbox = new Sandbox();
    rmSync(join(sandbox.shim, "node"));

    const run = sandbox.run("ensure");

    expect(run.out.status).toBe("unavailable");
    expect(run.out.reason).toMatch(/node is not installed/);
  });

  it("exports again only when the default branch moves", () => {
    const sandbox = new Sandbox();
    const tree = join(sandbox.trees, PREFIX);
    const first = sandbox.run("ensure");
    writeFileSync(join(tree, "marker"), "kept while the export stands");

    const unchanged = sandbox.run("ensure");
    expect(unchanged.out.sha).toBe(first.out.sha);
    expect(existsSync(join(tree, "marker"))).toBe(true);

    // a local commit that origin/HEAD has not reached is not exported
    sandbox.commitFile("docs/local.md", "# Local\n");
    sandbox.run("ensure");
    expect(existsSync(join(tree, "docs/local.md"))).toBe(false);
    expect(existsSync(join(tree, "marker"))).toBe(true);

    const moved = sandbox.publishHead();
    const after = sandbox.run("ensure");
    expect(after.out.sha).toBe(moved);
    expect(moved).not.toBe(first.out.sha);
    expect(existsSync(join(tree, "docs/local.md"))).toBe(true);
    expect(existsSync(join(tree, "marker"))).toBe(false);
    expect(sandbox.commands("update")).toHaveLength(4);
  });

  it("removes leftover staging directories while holding the lock", () => {
    const sandbox = new Sandbox();
    mkdirSync(join(sandbox.trees, `${PREFIX}.staging-99999`), { recursive: true });
    writeFileSync(join(sandbox.trees, `${PREFIX}.staging-99999.tar`), "x");

    sandbox.run("ensure");

    expect(readdirSync(sandbox.trees).filter((entry) => entry.includes(".staging-"))).toEqual([]);
  });

  describe("embedding", () => {
    it("starts one detached job that embeds each of our collections in turn and returns before it ends", async () => {
      const sandbox = new Sandbox();
      sandbox.seedForeign();

      const run = sandbox.run("ensure", { FAKE_EMBED_HOLD: EMBED_HOLD_MS });

      // ensure came back while the first fake embed was still holding
      expect(sandbox.embedsDone()).toHaveLength(0);
      expect(run.out.status).toBe("ready");
      expect(run.out.embedding.started).toBe(true);
      expect(run.out.embedding.running).toBe(true);
      expect(run.out.embedding.pending).toBeGreaterThan(0);
      expect(run.out.embedding.index_pending).toBeGreaterThan(run.out.embedding.pending);
      await sandbox.waitFor(() => sandbox.embedsDone().length === OWN.length);
      const embeds = sandbox.commands("embed");
      expect(embeds.map((c) => c.args[c.args.indexOf("-c") + 1]).sort()).toEqual([...OWN].sort());
      for (const call of embeds) {
        expect(call.args).toEqual(expect.arrayContaining(["--chunk-strategy", "auto", "--timeout", "30"]));
      }
      expect(embeds.every((c) => c.args[c.args.indexOf("-c") + 1].startsWith(PREFIX))).toBe(true);
    });

    it("does not start a second job while ours runs, and reports it as running", async () => {
      const sandbox = new Sandbox();
      sandbox.run("ensure", { FAKE_EMBED_HOLD: EMBED_HOLD_MS });

      const again = sandbox.run("ensure", { FAKE_EMBED_HOLD: EMBED_HOLD_MS });

      expect(again.out.embedding.started).toBe(false);
      expect(again.out.embedding.running).toBe(true);
      await sandbox.waitFor(() => sandbox.embedsDone().length === OWN.length);
      expect(sandbox.commands("embed")).toHaveLength(OWN.length);
    });

    it("reports lexical while only another repository has vectors, and hybrid once ours are embedded", async () => {
      const sandbox = new Sandbox();
      sandbox.seedForeign();
      sandbox.setQmdState((state) => {
        state.vec = ["other-repo-docs/note.md"];
      });

      const before = sandbox.run("ensure", { FAKE_EMBED_HOLD: EMBED_HOLD_MS });
      expect(before.out.mode).toBe("lexical");

      await sandbox.waitFor(() => sandbox.embedsDone().length === OWN.length);
      const after = sandbox.run("status");

      expect(after.out.mode).toBe("hybrid");
      expect(after.out.embedding).toEqual({ pending: 0, index_pending: 0, running: false, started: false });
    });

    it("embed starts the background embed by hand only when our documents are pending", async () => {
      const sandbox = new Sandbox();
      sandbox.run("ensure");
      await sandbox.waitFor(() => sandbox.embedsDone().length === OWN.length);
      expect(sandbox.run("embed").out.embedding.started).toBe(false);

      writeFileSync(join(sandbox.stateRoot, "works/demo/new.md"), "# New\n");
      sandbox.qmdUpdate();
      const manual = sandbox.run("embed");

      expect(manual.code).toBe(0);
      expect(manual.out.embedding.started).toBe(true);
      // the fake ignores masks, so every collection rooted above the new file has one pending document
      const rooted = [`${PREFIX}-streams`, `${PREFIX}-history`, `${PREFIX}-memory`];
      await sandbox.waitFor(() => sandbox.embedsDone().length === OWN.length + rooted.length);
      const later = sandbox.commands("embed").slice(OWN.length).map((c) => c.args[c.args.indexOf("-c") + 1]);
      expect(later.sort()).toEqual([...rooted].sort());
    });

    it("embed reports no collections and starts nothing before any ensure", () => {
      const sandbox = new Sandbox();

      const { out } = sandbox.run("embed");

      expect(out).toEqual({ status: "unavailable", mode: null, reason: expect.stringContaining(PREFIX), prefix: PREFIX });
      expect(existsSync(join(sandbox.trees, `${PREFIX}.embed.pid`))).toBe(false);
    });

    it.each([
      ["starts every collection", 1, OWN],
      ["starts nothing", 0, []],
    ])("with a remote embed model, follows qmd status and %s when its pending count is %i", async (_name, pending, started) => {
      const sandbox = new Sandbox();
      sandbox.run("ensure");
      await sandbox.waitFor(() => sandbox.embedsDone().length === OWN.length);
      writeFileSync(sandbox.configFile, "models:\n  embed: https://embeddings.example.test/v1#some-model\n");
      sandbox.interceptQmd("status", "", `echo "  Total:    1 files indexed"; [ ${pending} -gt 0 ] && echo "  Pending:  ${pending} need embedding"; exit 0`);
      const mark = sandbox.embedsDone().length;

      const { out } = sandbox.run("embed");

      expect(out.embedding.started).toBe(started.length > 0);
      if (started.length) await sandbox.waitFor(() => sandbox.embedsDone().length === mark + OWN.length);
      expect(sandbox.embedsDone().slice(mark).map((c) => c.args[1])).toEqual(started);
    });

    it("counts vectors of every model when qmd's config names none", async () => {
      const sandbox = new Sandbox();
      sandbox.run("ensure");
      await sandbox.waitFor(() => sandbox.embedsDone().length === OWN.length);
      const { models: _models, ...config } = Bun.YAML.parse(readFileSync(sandbox.configFile, "utf8")) as Record<string, unknown>;
      writeFileSync(sandbox.configFile, Bun.YAML.stringify(config));

      const { out } = sandbox.run("status");

      expect(out.mode).toBe("hybrid");
      expect(out.embedding.pending).toBe(0);
    });

    it("embed takes the same lock and recovers one left by a dead holder", () => {
      const sandbox = new Sandbox();
      sandbox.run("ensure");
      const lock = sandbox.lockDir();
      writeFileSync(join(lock, "pid"), String(deadPid()));

      const run = sandbox.run("embed");

      expect(run.out.status).toBe("ready");
      expect(existsSync(lock)).toBe(false);
    });
  });

  describe("status", () => {
    it("reports the same shape as ensure and changes nothing", async () => {
      const sandbox = new Sandbox();
      const before = sandbox.run("status");
      expect(before.out.status).toBe("unavailable");
      expect(before.out.reason).toMatch(/run qmd-index ensure/);

      const ensured = sandbox.run("ensure");
      await sandbox.waitFor(() => sandbox.embedsDone().length === OWN.length);
      const mark = sandbox.calls().length;
      const stateBefore = readFileSync(sandbox.qmdState, "utf8");

      const status = sandbox.run("status");

      expect(status.code).toBe(0);
      expect(Object.keys(status.out).sort()).toEqual(Object.keys(ensured.out).sort());
      expect(status.out.status).toBe("ready");
      expect(status.out.mode).toBe("hybrid");
      expect(status.out.sha).toBe(ensured.out.sha);
      expect(readFileSync(sandbox.qmdState, "utf8")).toBe(stateBefore);
      const allowed = ["--help", "collection list", "status"];
      const added = sandbox.calls().slice(mark).map((c) => `${c.args[0]} ${c.args[0] === "collection" ? c.args[1] : ""}`.trim());
      expect(added.every((call) => allowed.includes(call))).toBe(true);
    });
  });

  describe("reading the index", () => {
    it("reports pending null and lexical when index.sqlite is missing", async () => {
      const sandbox = new Sandbox();
      sandbox.run("ensure");
      await sandbox.waitFor(() => sandbox.embedsDone().length === OWN.length);
      rmSync(sandbox.env.INDEX_PATH as string);

      const { out } = sandbox.run("status");

      expect(out.status).toBe("ready");
      expect(out.mode).toBe("lexical");
      expect(out.embedding.pending).toBeNull();
    });

    it("reports pending null and lexical when index.sqlite has another schema", async () => {
      const sandbox = new Sandbox();
      sandbox.run("ensure");
      await sandbox.waitFor(() => sandbox.embedsDone().length === OWN.length);
      sandbox.sql(["DROP TABLE documents", "CREATE TABLE documents (something TEXT)"]);

      const { out } = sandbox.run("status");

      expect(out.mode).toBe("lexical");
      expect(out.embedding.pending).toBeNull();
    });

    it("counts a document as embedded only when every expected chunk has a vector", async () => {
      const sandbox = new Sandbox();
      sandbox.run("ensure");
      await sandbox.waitFor(() => sandbox.embedsDone().length === OWN.length);
      expect(sandbox.run("status").out.embedding.pending).toBe(0);

      sandbox.sql(["UPDATE content_vectors SET total_chunks = 2 WHERE hash LIKE '%docs/guide.md'"]);
      const partial = sandbox.run("status").out;

      // the fake ignores masks, so the docs and code collections both hold guide.md
      expect(partial.embedding.pending).toBe(2);
      expect(partial.mode).toBe("hybrid");
    });

    it("reports pending null and lexical for a remote embed model, and still names every root", async () => {
      const sandbox = new Sandbox();
      sandbox.run("ensure");
      await sandbox.waitFor(() => sandbox.embedsDone().length === OWN.length);
      writeFileSync(sandbox.configFile, "models:\n  embed: https://embeddings.example.test/v1#some-model\n");

      const { out } = sandbox.run("status");

      expect(out.status).toBe("ready");
      expect(out.mode).toBe("lexical");
      expect(out.embedding.pending).toBeNull();
      const roots = Object.fromEntries(out.collections.map((c: { name: string; root: string }) => [c.name, c.root]));
      expect(roots[`${PREFIX}-docs`]).toBe(join(sandbox.trees, PREFIX));
      expect(roots[`${PREFIX}-memory`]).toBe(sandbox.stateRoot);
      expect(Object.values(roots).every((root) => root)).toBe(true);
    });

    it("ignores vectors made with another model", async () => {
      const sandbox = new Sandbox();
      sandbox.run("ensure");
      await sandbox.waitFor(() => sandbox.embedsDone().length === OWN.length);

      sandbox.sql(["UPDATE content_vectors SET model = 'older-model'"]);
      const { out } = sandbox.run("status");

      expect(out.mode).toBe("lexical");
      expect(out.embedding.pending).toBeGreaterThan(0);
    });
  });

  describe("lock", () => {
    // a live process that is not this test, standing in for another qmd-index run
    function liveHolder(sandbox: Sandbox): number {
      const child = spawn("sleep", ["60"], { stdio: "ignore" });
      onTestFinished(() => {
        child.kill();
      });
      expect(child.pid).toBeGreaterThan(0);
      return child.pid as number;
    }

    it("never evicts a live holder whose lock is fresh, and reports the index busy", () => {
      const sandbox = new Sandbox();
      const lock = sandbox.lockDir();
      const holder = liveHolder(sandbox);
      writeFileSync(join(lock, "pid"), String(holder));

      const run = sandbox.run("ensure");

      expect(run.code).toBe(0);
      expect(run.out.status).toBe("unavailable");
      expect(run.out.reason).toBe("index busy: another qmd-index run holds the lock");
      expect(readFileSync(join(lock, "pid"), "utf8")).toBe(String(holder));
      expect(sandbox.edits()).toHaveLength(0);
    });

    it.each(["abc", "-1"])("waits the default time for a busy lock when the wait override is %j", (wait) => {
      const sandbox = new Sandbox();
      const lock = sandbox.lockDir();
      writeFileSync(join(lock, "pid"), String(liveHolder(sandbox)));
      // the holder lets go after 2 s, well inside the 20 s default and well past an override taken as 0
      const release = spawn("/bin/sh", ["-c", `sleep 2; rm -rf '${lock}'`], { stdio: "ignore" });
      onTestFinished(() => {
        release.kill();
      });

      const run = sandbox.run("ensure", { QMD_INDEX_LOCK_WAIT_MS: wait });

      expect(run.out.status).toBe("ready");
    });

    it("takes over a lock a live pid has not refreshed for longer than the longest step", () => {
      const sandbox = new Sandbox();
      const lock = sandbox.lockDir();
      writeFileSync(join(lock, "pid"), String(liveHolder(sandbox)));
      age(lock, 2 * 60 * 60);

      const run = sandbox.run("ensure");

      expect(run.out.status).toBe("ready");
      expect(existsSync(lock)).toBe(false);
    });

    it("lets two concurrent ensure runs enter the body one after the other", async () => {
      const sandbox = new Sandbox();
      sandbox.env.QMD_INDEX_LOCK_WAIT_MS = "10000";

      const runs = await Promise.all([sandbox.runAsync("ensure"), sandbox.runAsync("ensure")]);

      expect(runs.map((r) => r.out.status)).toEqual(["ready", "ready"]);
      const marks = sandbox.calls().map((c) => c.args[0]).filter((a) => a.startsWith("update-"));
      expect(marks).toEqual(["update-start", "update-end", "update-start", "update-end"]);
    });

    it("leaves a lock alone at release when another run took it over", () => {
      const sandbox = new Sandbox();
      const lock = join(sandbox.trees, `${PREFIX}.lock`);

      const run = sandbox.run("ensure", { FAKE_STEAL_LOCK: lock });

      expect(run.out.status).toBe("ready");
      expect(readFileSync(join(lock, "pid"), "utf8")).toBe("1");
    });

    it("clears a lock whose holder died before writing its pid", () => {
      const sandbox = new Sandbox();
      const lock = sandbox.lockDir();
      age(lock, 60);

      const run = sandbox.run("ensure");

      expect(run.out.status).toBe("ready");
      expect(existsSync(lock)).toBe(false);
      expect(readdirSync(sandbox.trees).filter((entry) => entry.includes(".lock.stale-"))).toEqual([]);
    });

    it("clears a lock whose recorded holder is dead", () => {
      const sandbox = new Sandbox();
      const lock = sandbox.lockDir();
      writeFileSync(join(lock, "pid"), String(deadPid()));

      const run = sandbox.run("ensure");

      expect(run.out.status).toBe("ready");
      expect(existsSync(lock)).toBe(false);
    });
  });

  describe("unavailable fallback", () => {
    it("reports unavailable and exits 0 when qmd is not installed", () => {
      const sandbox = new Sandbox();
      rmSync(join(sandbox.bin, "qmd"));

      for (const command of ["ensure", "embed", "status"]) {
        const { code, out } = sandbox.run(command);
        expect(code).toBe(0);
        expect(out.status).toBe("unavailable");
        expect(out.reason).toMatch(/not installed/);
      }
    });

    it("reports unavailable without changing anything when the models are missing", () => {
      const sandbox = new Sandbox();
      rmSync(join(sandbox.cache, "qmd/models"), { recursive: true });

      const { code, out } = sandbox.run("ensure");

      expect(code).toBe(0);
      expect(out.status).toBe("unavailable");
      expect(out.reason).toMatch(/model/);
      expect(sandbox.commands("collection")).toHaveLength(0);
      expect(existsSync(join(sandbox.trees, PREFIX))).toBe(false);
    });

    it("reports unavailable when a qmd step fails", () => {
      const sandbox = new Sandbox();

      const { code, out } = sandbox.run("ensure", { FAKE_QMD_FAIL: "update" });

      expect(code).toBe(0);
      expect(out.status).toBe("unavailable");
      expect(out.reason).toMatch(/update failed/);
    });

    it.each(["ensure", "embed", "status"])("reports unavailable for %s when qmd hangs past the probe timeout", (command) => {
      const sandbox = new Sandbox();
      sandbox.interceptQmd("--help", "", "exec sleep 5");

      const { code, out } = sandbox.run(command, { QMD_PROBE_TIMEOUT_MS: "100" });

      expect(code).toBe(0);
      expect(out).toEqual({ status: "unavailable", mode: null, reason: "qmd --help failed: timed out after 0 s" });
      expect(sandbox.commands("collection")).toHaveLength(0);
    });

    it.each(["abc", "-5"])("keeps the default probe timeout when the override is %j", (timeout) => {
      const sandbox = new Sandbox();
      sandbox.interceptQmd("--help", "", "sleep 0.3");

      const { out } = sandbox.run("ensure", { QMD_PROBE_TIMEOUT_MS: timeout });

      expect(out.status).toBe("ready");
    });

    it("reports unavailable when qmd is installed but cannot start", () => {
      const sandbox = new Sandbox();
      writeFileSync(join(sandbox.pkg, "bin/qmd"), "#!/etc/hosts\n", { mode: 0o755 });

      const { code, out } = sandbox.run("ensure");

      expect(code).toBe(0);
      expect(out.status).toBe("unavailable");
      expect(out.reason).toMatch(/^qmd --help failed: .*EACCES/);
    });

    it("reports unavailable with an empty detail when a qmd step fails silently", () => {
      const sandbox = new Sandbox();
      sandbox.interceptQmd("collection", "list", "exit 1");

      const { out } = sandbox.run("ensure");

      expect(out).toEqual({ status: "unavailable", mode: null, reason: "qmd collection list failed: " });
    });

    it("reports unavailable, and frees the lock, when the update outlasts its timeout", () => {
      const sandbox = new Sandbox();

      const timedOut = sandbox.run("ensure", { QMD_UPDATE_TIMEOUT_MS: "200", FAKE_UPDATE_HOLD: "5000" });
      const next = sandbox.run("ensure");

      expect(timedOut.out).toEqual({ status: "unavailable", mode: null, reason: "qmd update failed: timed out after 0 s" });
      expect(sandbox.calls().filter((c) => c.args[0] === "update-end")).toHaveLength(1);
      expect(next.out.status).toBe("ready");
    });

    it.each([
      ["prints only to stdout", "#!/bin/sh\necho 'update refused'\nexit 1\n", /^qmd update failed: update refused$/],
      ["prints nothing", "#!/bin/sh\nexit 1\n", /^qmd update failed: $/],
      ["cannot start", "#!/etc/hosts\n", /^qmd update failed: .*EACCES/],
    ])("reports unavailable with node's detail when node %s", (_name, script, reason) => {
      const sandbox = new Sandbox();
      rmSync(join(sandbox.shim, "node"));
      writeFileSync(join(sandbox.shim, "node"), script, { mode: 0o755 });

      const { code, out } = sandbox.run("ensure");

      expect(code).toBe(0);
      expect(out.status).toBe("unavailable");
      expect(out.reason).toMatch(reason);
    });

    it("reports unavailable when origin/HEAD is not set, and never fetches", () => {
      const sandbox = new Sandbox();
      sandbox.git("symbolic-ref", "--delete", "refs/remotes/origin/HEAD");

      const { code, out } = sandbox.run("ensure");

      expect(code).toBe(0);
      expect(out.status).toBe("unavailable");
      expect(out.reason).toMatch(/origin\/HEAD/);
    });

    it("reports unavailable when the repository has no network remote", () => {
      const sandbox = new Sandbox();
      sandbox.git("remote", "remove", "origin");

      const { code, out } = sandbox.run("ensure");

      expect(code).toBe(0);
      expect(out.status).toBe("unavailable");
    });

    it("reports unavailable from the launcher, without starting the script, when bun is not installed", () => {
      const sandbox = new Sandbox();

      const { code, out } = sandbox.run("ensure", { PATH: `${sandbox.bin}:/usr/bin:/bin` });

      expect(code).toBe(0);
      expect(out).toEqual({ status: "unavailable", mode: null, reason: expect.stringContaining("bun") });
      expect(sandbox.calls()).toHaveLength(0);
    });

    it("prints usage when no subcommand is given", () => {
      const sandbox = new Sandbox();

      const { code, stderr } = sandbox.run("");

      expect(code).toBe(2);
      expect(stderr).toMatch(/usage: qmd-index/);
    });

    it("rejects an unknown subcommand, including an inherited property name, with usage", () => {
      const sandbox = new Sandbox();

      for (const command of ["bogus", "constructor"]) {
        const { code, stderr } = sandbox.run(command);
        expect(code).toBe(2);
        expect(stderr).toMatch(/usage: qmd-index/);
      }
    });
  });
});

// the race windows of the lock and the embed launcher, steered in process at the exact system call
describe("qmd-index in process", () => {
  const enoent = (path: unknown): Error => Object.assign(new Error(`ENOENT: ${String(path)}`), { code: "ENOENT" });

  function trees(): string {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "qmd-index-lock-")));
    onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  function staleLock(dir: string): string {
    const lock = join(dir, `${PREFIX}.lock`);
    mkdirSync(lock);
    writeFileSync(join(lock, "pid"), String(deadPid()));
    return lock;
  }

  const strays = (dir: string): string[] => readdirSync(dir).filter((entry) => entry.includes(".stale-"));

  describe("fn:withLock", () => {
    it("should enter once a busy lock vanishes before it is judged", () => {
      vi.stubEnv("QMD_INDEX_LOCK_WAIT_MS", "5000");
      const dir = trees();
      const lock = join(dir, `${PREFIX}.lock`);
      mkdirSync(lock);
      vi.mocked(statSync).mockImplementationOnce((path) => {
        fs.rmSync(lock, { recursive: true });
        throw enoent(path);
      });

      expect(withLock(dir, PREFIX, () => "ran")).toBe("ran");
      expect(existsSync(lock)).toBe(false);
    });

    it("should enter once another run moved the stale lock away first", () => {
      vi.stubEnv("QMD_INDEX_LOCK_WAIT_MS", "5000");
      const dir = trees();
      const lock = staleLock(dir);
      vi.mocked(renameSync).mockImplementationOnce((from) => {
        fs.rmSync(lock, { recursive: true });
        throw enoent(from);
      });

      expect(withLock(dir, PREFIX, () => "ran")).toBe("ran");
      expect(existsSync(lock)).toBe(false);
    });

    it("should enter once the stale lock it moved away is cleared before it is checked", () => {
      vi.stubEnv("QMD_INDEX_LOCK_WAIT_MS", "5000");
      const dir = trees();
      const lock = staleLock(dir);
      vi.mocked(statSync).mockImplementation(((path: string, options?: object) => {
        if (!String(path).includes(".stale-")) return fs.statSync(path, options);
        fs.rmSync(path, { recursive: true });
        throw enoent(path);
      }) as typeof statSync);

      expect(withLock(dir, PREFIX, () => "ran")).toBe("ran");
      expect(existsSync(lock)).toBe(false);
      expect(strays(dir)).toEqual([]);
    });

    it.each<[string, { ino?: number; mtimeMs?: number }]>([
      ["inode", { ino: 1 }],
      ["mtime", { mtimeMs: 1 }],
    ])("should put the lock back and report the index busy when the moved lock's %s differs from the one judged stale", (_field, shift) => {
      vi.stubEnv("QMD_INDEX_LOCK_WAIT_MS", "0");
      const dir = trees();
      const lock = staleLock(dir);
      const holder = readFileSync(join(lock, "pid"), "utf8");
      vi.mocked(statSync).mockImplementation(((path: string, options?: object) => {
        const info = fs.statSync(path, options) as import("node:fs").Stats;
        if (!String(path).includes(".stale-")) return info;
        return { ...info, ino: info.ino + (shift.ino ?? 0), mtimeMs: info.mtimeMs + (shift.mtimeMs ?? 0) };
      }) as typeof statSync);

      expect(() => withLock(dir, PREFIX, () => "ran")).toThrow("index busy: another qmd-index run holds the lock");
      expect(readFileSync(join(lock, "pid"), "utf8")).toBe(holder);
      expect(strays(dir)).toEqual([]);
    });

    it("should leave the moved lock for cleanup and report the index busy when another run takes the lock before it is put back", () => {
      vi.stubEnv("QMD_INDEX_LOCK_WAIT_MS", "0");
      const dir = trees();
      const lock = staleLock(dir);
      vi.mocked(statSync).mockImplementation(((path: string, options?: object) => {
        const info = fs.statSync(path, options) as import("node:fs").Stats;
        return String(path).includes(".stale-") ? { ...info, ino: info.ino + 1 } : info;
      }) as typeof statSync);
      vi.mocked(renameSync).mockImplementation((from, to) => {
        if (!String(from).includes(".stale-")) return fs.renameSync(from, to);
        fs.mkdirSync(lock);
        fs.writeFileSync(join(lock, "pid"), String(process.pid));
        throw Object.assign(new Error("ENOTEMPTY"), { code: "ENOTEMPTY" });
      });

      expect(() => withLock(dir, PREFIX, () => "ran")).toThrow("index busy: another qmd-index run holds the lock");
      expect(readFileSync(join(lock, "pid"), "utf8")).toBe(String(process.pid));
      expect(strays(dir)).toHaveLength(1);
    });

    it("should keep running when its lock is taken away mid-run, and leave the new holder's lock alone", () => {
      const dir = trees();
      const lock = join(dir, `${PREFIX}.lock`);

      const result = withLock(dir, PREFIX, () => {
        fs.rmSync(lock, { recursive: true });
        heartbeat?.();
        fs.mkdirSync(lock);
        fs.writeFileSync(join(lock, "pid"), "424242");
        return "ran";
      });

      expect(result).toBe("ran");
      expect(readFileSync(join(lock, "pid"), "utf8")).toBe("424242");
    });
  });

  describe("fn:startEmbed", () => {
    it("should record the job's pid and survive a launch error reported after the start", () => {
      const cache = trees();
      vi.stubEnv("XDG_CACHE_HOME", cache);
      const child = Object.assign(new EventEmitter(), { pid: 4242, unref: vi.fn() });
      vi.mocked(spawn).mockReturnValueOnce(child as unknown as ChildProcess);

      startEmbed(PREFIX, [`${PREFIX}-docs`]);

      expect(() => child.emit("error", new Error("spawn /bin/sh EAGAIN"))).not.toThrow();
      expect(readFileSync(join(cache, "qmd/trees", `${PREFIX}.embed.pid`), "utf8")).toBe("4242");
      expect(child.unref).toHaveBeenCalledOnce();
    });
  });
});
