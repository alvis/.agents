import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { extname, isAbsolute, resolve } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const here = import.meta.dirname;
const resolver = resolve(here, "resolve-state-workspace");
const doctor = resolve(here, "../skills/doctor/scripts/state-doctor");
const roots: string[] = [];
// Every run gets its own HOME so no test can touch the real ~/.agents/states.
const key = "github.com/test/repo";
const remote = "git@github.com:Test/Repo.git";
let home = "";
let state = "";
beforeEach(() => {
  home = temporary("resolver-home");
  state = resolve(home, ".agents/states", key);
});
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (existsSync(resolve(root, ".agents")))
      chmodSync(resolve(root, ".agents"), 0o755);
    rmSync(root, { recursive: true, force: true });
  }
});

function temporary(name = "resolver"): string {
  const base = mkdtempSync(resolve(tmpdir(), `${name}-`));
  roots.push(base);
  return realpathSync(base);
}
function git(cwd: string, ...args: readonly string[]): string {
  const result = spawnSync("git", ["-c", "commit.gpgSign=false", ...args], {
    cwd,
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}
function initialize(root: string, origin: string | null = remote): void {
  mkdirSync(root);
  git(root, "init", "-q");
  git(root, "symbolic-ref", "HEAD", "refs/heads/main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  if (origin !== null) git(root, "remote", "add", "origin", origin);
}
function commitInitial(root: string): void {
  writeFileSync(resolve(root, "readme.md"), "test\n");
  git(root, "add", "readme.md");
  git(root, "commit", "-qm", "initial");
}
function run(
  path: string,
  options: {
    readonly workId?: string;
    readonly bootstrap?: boolean;
    readonly environmentWorkId?: string;
    readonly environment?: NodeJS.ProcessEnv;
    readonly equals?: boolean;
  } = {},
) {
  const args = options.equals
    ? [
        `--path=${path}`,
        ...(options.workId === undefined
          ? []
          : [`--work-id=${options.workId}`]),
      ]
    : [
        "--path",
        path,
        ...(options.workId === undefined ? [] : ["--work-id", options.workId]),
      ];
  if (options.bootstrap === true) args.push("--bootstrap");
  const environment = { ...process.env, HOME: home, ...options.environment };
  delete environment.STATE_WORK_ID;
  if (options.environmentWorkId !== undefined)
    environment.STATE_WORK_ID = options.environmentWorkId;
  const result = spawnSync("/bin/bash", [resolver, ...args], {
    encoding: "utf8",
    env: environment,
  });
  return {
    exitCode: result.status ?? 1,
    payload: JSON.parse(result.stdout) as Record<string, unknown>,
    stderr: result.stderr,
  };
}

describe("work state workspace resolution", () => {
  it("suggests but does not invent branch work, then resolves an existing stream", () => {
    const base = temporary();
    const root = resolve(base, "main workspace");
    const linked = resolve(base, "linked workspace");
    initialize(root);
    commitInitial(root);
    git(root, "worktree", "add", "-q", "-b", "feat/refunds", linked);
    const missing = run(linked);
    expect(missing).toMatchObject({
      exitCode: 4,
      payload: {
        status: "work_id_required",
        vcs: "git",
        durable_root: linked,
        active_workspace: linked,
        state_root: state,
        state_key: key,
        workspace_label: "feat/refunds",
        suggested_work_id: "refunds",
        existing_work_ids: [],
      },
    });
    expect(missing.payload).not.toHaveProperty("work_dir");
    for (const id of ["refunds", "other-work"])
      mkdirSync(resolve(state, "works", id), { recursive: true });
    expect(run(linked)).toMatchObject({
      exitCode: 0,
      payload: {
        work_id: "refunds",
        work_id_source: "git_branch",
        work_dir: resolve(state, "works/refunds"),
      },
    });
  });

  it("accepts one-PR and two-digit stacked conventional branches only", () => {
    const root = resolve(temporary(), "stacked");
    initialize(root);
    commitInitial(root);
    for (const id of ["work-id-naming", "unrelated-work"])
      mkdirSync(resolve(state, "works", id), { recursive: true });
    for (const branch of [
      "feat/work-id-naming",
      "feat/work-id-naming/01-resolver",
      "feat/work-id-naming/99-contract",
      "fix/work-id-naming",
    ]) {
      git(root, "checkout", "-q", "--orphan", branch);
      expect(run(root)).toMatchObject({
        exitCode: 0,
        payload: { work_id: "work-id-naming", work_id_source: "git_branch" },
      });
    }
    for (const branch of [
      "feat/work-id-naming-rewrite",
      "feat/work-id-naming/3-late",
      "feat/work-id-naming/00-prep",
      "feat/work-id-naming/123-late",
      "feature/work-id-naming",
      "work-id-naming",
      "feat/work_id_naming",
    ]) {
      git(root, "checkout", "-q", "--orphan", branch);
      expect(run(root), branch).toMatchObject({
        exitCode: 4,
        payload: { status: "work_id_required" },
      });
    }
  });

  it("treats length as convention but grammar and path limits as requirements", () => {
    const root = resolve(temporary(), "bounded");
    initialize(root);
    commitInitial(root);
    const legacy = `legacy-${"x".repeat(34)}`;
    mkdirSync(resolve(state, "works", legacy), { recursive: true });
    expect(run(root, { workId: legacy })).toMatchObject({
      exitCode: 0,
      payload: { work_id: legacy },
    });
    git(root, "checkout", "-q", "-b", `feat/${legacy}`);
    expect(run(root)).toMatchObject({
      exitCode: 0,
      payload: { work_id: legacy, work_id_source: "git_branch" },
    });
    const minted = `brand-new-${"y".repeat(31)}`;
    expect(run(root, { workId: minted })).toMatchObject({
      exitCode: 0,
      payload: { work_id: minted },
    });
    expect(run(root, { workId: "foo--bar" })).toMatchObject({
      exitCode: 2,
      payload: { status: "invalid" },
    });
    expect(String(run(root, { workId: "foo--bar" }).payload.error)).toContain(
      "single-hyphen",
    );
    expect(run(root, { workId: "a".repeat(256) })).toMatchObject({
      exitCode: 2,
      payload: { status: "invalid" },
    });
  });

  it("reserves parked names without resolving them", () => {
    const root = resolve(temporary(), "parked");
    initialize(root);
    commitInitial(root);
    mkdirSync(resolve(state, "archive/refunds"), { recursive: true });
    mkdirSync(resolve(state, "works/unrelated-work"), {
      recursive: true,
    });
    expect(String(run(root, { workId: "refunds" }).payload.error)).toContain(
      "parked stream",
    );
    git(root, "checkout", "-q", "-b", "feat/refunds");
    expect(run(root)).toMatchObject({
      exitCode: 4,
      payload: { status: "work_id_required", suggested_work_id: null },
    });
  });

  it.each(["z".repeat(33), "foo--bar", "影師嗎"])(
    "does not suggest noncanonical label %s",
    (segment) => {
      const root = resolve(temporary(), "suggestion");
      initialize(root);
      commitInitial(root);
      mkdirSync(resolve(state, "works/unrelated-work"), {
        recursive: true,
      });
      git(
        root,
        "checkout",
        "-q",
        "-b",
        segment === "影師嗎" ? segment : `feat/${segment}`,
      );
      expect(run(root)).toMatchObject({
        exitCode: 4,
        payload: { status: "work_id_required", suggested_work_id: null },
      });
    },
  );

  it("selects explicit then environment then sole existing work", () => {
    const root = resolve(temporary(), "selection");
    initialize(root);
    mkdirSync(resolve(state, "works/existing"), { recursive: true });
    expect(
      run(root, { workId: "explicit", environmentWorkId: "environment" }),
    ).toMatchObject({
      exitCode: 0,
      payload: { work_id: "explicit", work_id_source: "argument" },
    });
    expect(run(root, { environmentWorkId: "environment" })).toMatchObject({
      exitCode: 0,
      payload: { work_id: "environment", work_id_source: "environment" },
    });
    expect(run(root)).toMatchObject({
      exitCode: 0,
      payload: { work_id: "existing", work_id_source: "sole_existing" },
    });
  });

  it("accepts spaced and equals options and documents both", () => {
    const root = resolve(temporary(), "options");
    initialize(root);
    expect(run(root, { workId: "eng-421-spaced" })).toMatchObject({
      exitCode: 0,
      payload: { work_id: "eng-421-spaced" },
    });
    expect(run(root, { workId: "eng-421-equals", equals: true })).toMatchObject(
      {
        exitCode: 0,
        payload: { work_id: "eng-421-equals", work_id_source: "argument" },
      },
    );
    const help = spawnSync("/bin/bash", [resolver, "--help"], {
      encoding: "utf8",
    });
    expect(help.status).toBe(0);
    expect(help.stderr).toContain("--work-id=<id>");
    expect(help.stderr).toContain("--path=<path>");
    expect(help.stderr).toContain("--bootstrap");
  });

  it("bootstraps only missing entrypoints with current vocabulary", () => {
    const root = resolve(temporary(), "bootstrap");
    initialize(root);
    const id = "eng-421-bootstrap";
    const resolved = run(root, { workId: id });
    const work = String(resolved.payload.work_dir);
    expect(resolved).toMatchObject({
      exitCode: 0,
      payload: { bootstrap_requested: false, bootstrap_created: [] },
    });
    expect(existsSync(work)).toBe(false);
    const created = run(root, { workId: id, bootstrap: true });
    const expected = [
      resolve(work, "goal.md"),
      resolve(work, "state/working.md"),
      resolve(work, "state.md"),
      resolve(work, "state/journal.md"),
    ];
    expect(created).toMatchObject({
      exitCode: 0,
      payload: {
        bootstrap_requested: true,
        bootstrap_created: expected,
        bootstrap_existing: [],
      },
    });
    const working = resolve(work, "state/working.md");
    writeFileSync(working, "# Preserved owner state\n");
    rmSync(resolve(work, "state.md"));
    expect(run(root, { workId: id, bootstrap: true })).toMatchObject({
      exitCode: 0,
      payload: {
        bootstrap_created: [resolve(work, "state.md")],
        bootstrap_existing: [
          resolve(work, "goal.md"),
          working,
          resolve(work, "state/journal.md"),
        ],
      },
    });
    expect(readFileSync(working, "utf8")).toBe("# Preserved owner state\n");
    const state = readFileSync(resolve(work, "state.md"), "utf8");
    const goal = readFileSync(resolve(work, "goal.md"), "utf8");
    expect(state).toContain("- Phase: `planned`\n");
    expect(state).not.toContain("Blocked on");
    expect(state).not.toContain("Motion");
    expect(state).not.toContain(" · ");
    expect(goal).toContain("- Charter: `absent`");

    writeFileSync(
      resolve(work, "state.md"),
      state.replace("- Phase: `planned`", "- Phase: `working`"),
    );
    const diagnostic = spawnSync(
      doctor,
      ["--work-dir", work, "--json", "--strict"],
      {
        encoding: "utf8",
      },
    );
    expect(diagnostic.status).toBe(1);
    const findings = (
      JSON.parse(diagnostic.stdout) as {
        findings: Array<{ check: string }>;
      }
    ).findings.filter(({ check }) => check === "specification-provenance");
    expect(findings).toHaveLength(1);
  });

  it("cannot bootstrap past the identity gate or without a usable remote", () => {
    const root = resolve(temporary(), "gates");
    initialize(root);
    expect(run(root, { bootstrap: true })).toMatchObject({
      exitCode: 4,
      payload: { status: "work_id_required" },
    });
    expect(existsSync(resolve(home, ".agents"))).toBe(false);
    const bare = resolve(temporary(), "bare");
    initialize(bare, null);
    expect(
      run(bare, { workId: "eng-421-gated", bootstrap: true }),
    ).toMatchObject({ exitCode: 5, payload: { status: "remote_required" } });
    expect(existsSync(resolve(home, ".agents"))).toBe(false);
  });

  it("leaves no state folder, ignore field, or gate inside the checkout", () => {
    const root = resolve(temporary(), "clean");
    initialize(root);
    const result = run(root, { workId: "eng-421-clean", bootstrap: true });
    expect(result).toMatchObject({
      exitCode: 0,
      payload: { status: "resolved", state_root: state },
    });
    for (const field of ["state_ignored", "ignore_file", "default_workspace", "repo_root"])
      expect(result.payload).not.toHaveProperty(field);
    expect(existsSync(resolve(root, ".state"))).toBe(false);
    expect(existsSync(resolve(state, ".state"))).toBe(false);
    expect(existsSync(resolve(state, "works/eng-421-clean/state.md"))).toBe(true);
  });

  it("rejects symlinked work roots and entrypoints without external writes", () => {
    const root = resolve(temporary(), "symlink");
    const outside = resolve(temporary(), "outside");
    mkdirSync(outside);
    initialize(root);
    mkdirSync(state, { recursive: true });
    symlinkSync(outside, resolve(state, "works"), "dir");
    const linked = run(root, { workId: "eng-421-symlink", bootstrap: true });
    expect(linked).toMatchObject({
      exitCode: 2,
      payload: { status: "invalid" },
    });
    expect(String(linked.payload.error)).toContain("must not be a symlink");
    expect(readdirSync(outside)).toEqual([]);

    rmSync(resolve(state, "works"), { recursive: true });
    const work = resolve(state, "works/eng-421-symlink");
    mkdirSync(work, { recursive: true });
    const victim = resolve(outside, "state.md");
    writeFileSync(victim, "unchanged\n");
    symlinkSync(victim, resolve(work, "state.md"));
    for (const result of [
      run(root),
      run(root, { workId: "eng-421-symlink", bootstrap: true }),
    ]) {
      expect(result).toMatchObject({
        exitCode: 2,
        payload: { status: "invalid" },
      });
      expect(String(result.payload.error)).toContain(
        "entrypoint must not be a symlink",
      );
    }
    expect(readFileSync(victim, "utf8")).toBe("unchanged\n");
  });

  it("reports ambiguity, collision inventory, grammar, and naming authority", () => {
    const root = resolve(temporary(), "ambiguity");
    initialize(root);
    commitInitial(root);
    for (const id of [
      "20260727-feat-refunds-v5cfxb",
      "20260721-fix-ingest-a54yx4",
    ])
      mkdirSync(resolve(state, "works", id), { recursive: true });
    mkdirSync(resolve(state, "archive/parked-work"), { recursive: true });
    const result = run(root);
    expect(result.exitCode).toBe(4);
    expect(result.payload.existing_work_ids).toEqual([
      "20260721-fix-ingest-a54yx4",
      "20260727-feat-refunds-v5cfxb",
      "parked-work",
    ]);
    expect(result.payload).not.toHaveProperty("candidate_work_ids");
    expect(String(result.payload.error)).toContain("collision");
    expect(String(result.payload.error)).toContain(
      "not examples of the format",
    );
    expect(String(result.payload.work_id_grammar)).toContain(
      "^[a-z0-9]+(-[a-z0-9]+)*$",
    );
    const namingReference = String(result.payload.naming_reference);
    expect(namingReference.length).toBeGreaterThan(0);
    expect(isAbsolute(namingReference)).toBe(true);
    expect(extname(namingReference)).toBe(".md");
  });

  it("shares one state root between a Git worktree and its main checkout", () => {
    const base = temporary();
    const root = resolve(base, "main");
    const linked = resolve(base, "linked");
    initialize(root);
    commitInitial(root);
    git(root, "worktree", "add", "-q", "-b", "linked", linked);
    const main = run(root, { workId: "eng-421-test" });
    const secondary = run(linked, { workId: "eng-421-test" });
    expect(main.payload.state_root).toBe(state);
    expect(secondary).toMatchObject({
      exitCode: 0,
      payload: {
        status: "resolved",
        state_key: key,
        state_root: state,
        active_workspace: linked,
        durable_root: linked,
        work_dir: resolve(state, "works/eng-421-test"),
      },
    });
  });

  it.each([
    ["git@github.com:Alvis/Presetter.git", "github.com/alvis/presetter"],
    ["git@gitlab.com:a/b/c.git", "gitlab.com/a/b/c"],
    ["ssh://git@Example.com:2222/Team/App.git/", "example.com/team/app"],
    ["ssh://deploy@host.example/org/repo", "host.example/org/repo"],
    ["https://GitHub.com/alvis/presetter.git", "github.com/alvis/presetter"],
    ["https://user:token@gitlab.com/a/b/c/", "gitlab.com/a/b/c"],
    ["https://github.com/alvis/presetter///", "github.com/alvis/presetter"],
  ])("derives the state key from %s", (url, expected) => {
    const root = resolve(temporary(), "key");
    initialize(root, url);
    expect(run(root, { workId: "eng-421-key" })).toMatchObject({
      exitCode: 0,
      payload: {
        state_key: expected,
        state_root: resolve(home, ".agents/states", expected),
      },
    });
  });

  it("uses origin first, then a sole remote, and otherwise refuses", () => {
    const root = resolve(temporary(), "remotes");
    initialize(root, null);
    git(root, "remote", "add", "upstream", "https://github.com/Up/Stream.git");
    expect(run(root, { workId: "eng-421-sole" })).toMatchObject({
      exitCode: 0,
      payload: { state_key: "github.com/up/stream" },
    });
    git(root, "remote", "add", "fork", "https://github.com/Me/Fork.git");
    expect(run(root, { workId: "eng-421-sole" })).toMatchObject({
      exitCode: 5,
      payload: {
        status: "remote_required",
        remote_candidates: ["fork", "upstream"],
      },
    });
    git(root, "remote", "add", "origin", "https://github.com/Or/Igin.git");
    expect(run(root, { workId: "eng-421-sole" })).toMatchObject({
      exitCode: 0,
      payload: { state_key: "github.com/or/igin" },
    });
  });

  it.each([
    ["no remote", null],
    ["a local path", "/srv/git/repo.git"],
    ["a relative path", "../repo"],
    ["a file URL", "file:///srv/git/repo.git"],
    ["a path with traversal", "https://github.com/a/../b"],
  ])("refuses %s as a state key", (_name, url) => {
    const root = resolve(temporary(), "refused");
    initialize(root, url);
    const result = run(root, { workId: "eng-421-refused", bootstrap: true });
    expect(result).toMatchObject({
      exitCode: 5,
      payload: { status: "remote_required" },
    });
    expect(String(result.payload.error)).toContain("origin");
    expect(result.payload).not.toHaveProperty("state_root");
    expect(existsSync(resolve(home, ".agents"))).toBe(false);
  });

  it.each([
    ["an encoded space", "https://dev.azure.com/org/my%20project/_git/repo"],
    ["a traversal segment", "https://github.com/a/../b"],
  ])("names unsupported path characters, not a missing network URL, for %s", (_name, url) => {
    const root = resolve(temporary(), "unsupported");
    initialize(root, url);
    const result = run(root, { workId: "eng-421-unsupported" });
    expect(result).toMatchObject({ exitCode: 5, payload: { status: "remote_required" } });
    expect(String(result.payload.error)).toContain("has a path with characters");
    expect(String(result.payload.error)).not.toContain("not a network URL");
  });

  it("documents the refusal status and the new root in --help", () => {
    const help = spawnSync("/bin/bash", [resolver, "--help"], {
      encoding: "utf8",
    });
    expect(help.stderr).toContain("remote_required");
    expect(help.stderr).toContain("$HOME/.agents/states/");
    expect(help.stderr).not.toContain("requires_ignore");
  });

  it("names the state folder when the home state root cannot be written", () => {
    const root = resolve(temporary(), "unwritable");
    initialize(root);
    mkdirSync(resolve(home, ".agents"));
    chmodSync(resolve(home, ".agents"), 0o500);
    const result = run(root, { workId: "eng-421-denied", bootstrap: true });
    expect(result).toMatchObject({ exitCode: 2, payload: { status: "invalid" } });
    expect(String(result.payload.error)).toContain(
      resolve(home, ".agents/states"),
    );
    expect(String(result.payload.error)).toContain("write access");
  });

  it("refuses invalid IDs, environment values, and non-repositories", () => {
    const outside = temporary();
    for (const id of ["UPPER", "bad/path", "-leading"])
      expect(run(outside, { workId: id })).toMatchObject({
        exitCode: 2,
        payload: { status: "invalid" },
      });
    expect(
      String(run(outside, { workId: "valid-id" }).payload.error),
    ).toContain("not inside");
    expect(
      String(run(outside, { environmentWorkId: "INVALID" }).payload.error),
    ).toContain("environment");
  });

  it("resolves a pure jj workspace using native workspace metadata", () => {
    const base = temporary();
    const primary = resolve(base, "jj default");
    const secondary = resolve(base, "jj secondary");
    const binaries = resolve(base, "bin");
    for (const path of [primary, secondary, binaries]) mkdirSync(path);
    mkdirSync(resolve(state, "works/secondary"), { recursive: true });
    const jj = resolve(binaries, "jj");
    writeFileSync(
      jj,
      `#!/bin/sh\n[ "$1" = --ignore-working-copy ] && shift\ncase "$1:$2" in\nroot:) printf '%s\n' "$JJ_ACTIVE_ROOT" ;;\ngit:remote) printf '%s\n' "$JJ_REMOTES" ;;\nworkspace:list) printf 'default\nsecondary\n' ;;\nworkspace:root) if [ "$4" = default ]; then printf '%s\n' "$JJ_DEFAULT_ROOT"; else printf '%s\n' "$JJ_ACTIVE_ROOT"; fi ;;\n*) exit 1 ;;\nesac\n`,
    );
    chmodSync(jj, 0o755);
    const result = run(secondary, {
      environment: {
        PATH: `${binaries}:${process.env.PATH}`,
        JJ_ACTIVE_ROOT: secondary,
        JJ_DEFAULT_ROOT: primary,
        JJ_REMOTES: "origin git@github.com:Test/Repo.git",
      },
    });
    expect(result).toMatchObject({
      exitCode: 0,
      payload: {
        vcs: "jj",
        active_workspace: secondary,
        state_root: state,
        work_id: "secondary",
        work_id_source: "jj_workspace",
        work_dir: resolve(state, "works/secondary"),
      },
    });
  });
});
