import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SpawnSyncReturns } from "node:child_process";

const validator = join(import.meta.dirname, "validate_scoped_save.ts");
const stateResolver = resolve(
  import.meta.dirname,
  "../../../../essential/scripts/resolve-state-workspace",
);
const buildUsage =
  "usage: validate_scoped_save.ts build [-h] --repo REPO --work-root WORK_ROOT\n" +
  "                                     --base-rev BASE_REV --scope SCOPE --state-resolver STATE_RESOLVER";

type Json = Record<string, unknown>;

function jsonText(record: Json, key: string): string {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`${key} must be a string`);
  return value;
}
function sha(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function canonicalJson(value: unknown): string {
  const ordered = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(ordered)
      : item !== null && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([key, nested]) => [key, ordered(nested)]),
          )
        : item;
  return `${JSON.stringify(ordered(value))}\n`;
}
function cli(args: string[]): SpawnSyncReturns<string> {
  return spawnSync("bun", ["run", validator, ...args], { encoding: "utf8" });
}

class Harness {
  readonly root = mkdtempSync(join(tmpdir(), "scoped-save-"));
  readonly repo: string;
  readonly primaryRepo: string;
  readonly workRoot: string;
  baseRev: string;

  constructor(
    workspace: "primary" | "linked-git" | "jj" | "jj-uncolocated" = "primary",
    trackedCache = false,
  ) {
    const repo = resolve(this.root, "target");
    mkdirSync(repo);
    this.repo = realpathSync(repo);
    this.primaryRepo = this.repo;
    this.git("init", "-q");
    this.git("config", "user.name", "Scoped Save Test");
    this.git("config", "user.email", "scoped-save@example.test");
    this.git("config", "commit.gpgsign", "false");
    this.git("config", "core.autocrlf", "false");
    this.git("config", "core.filemode", "true");
    const files: Record<string, string> = {
      ".gitignore": ".state/\n",
      "src.txt": "source base\n",
      "tests.txt": "test base\n",
      "docs/architecture/README.md": "architecture base\n",
      "docs/design/README.md": "design base\n",
      "developer.txt": "developer base\n",
    };
    if (trackedCache) files["cache/entry.txt"] = "tracked cache base\n";
    for (const [relative, content] of Object.entries(files)) {
      const path = join(this.repo, relative);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
    this.git("add", ".");
    this.git("commit", "-q", "-m", "chore: initialize target");
    this.baseRev = this.git("rev-parse", "HEAD").stdout.trim();
    this.workRoot = join(this.repo, ".state/works/scoped-save");
    mkdirSync(this.workRoot, { recursive: true });
    if (workspace === "linked-git") {
      const linked = join(this.root, "linked");
      this.git("worktree", "add", "-q", "-b", "feat/scoped-save", linked);
      this.repo = realpathSync(linked);
    } else if (workspace === "jj" || workspace === "jj-uncolocated") {
      const initialized = spawnSync(
        "jj",
        ["git", "init", "--colocate", this.repo],
        { encoding: "utf8" },
      );
      expect(initialized.status, initialized.stderr).toBe(0);
      const linked = join(this.root, "linked");
      this.jj(
        "--config",
        `git.colocate=${workspace === "jj"}`,
        "workspace",
        "add",
        "--name",
        "scoped-save",
        linked,
      );
      this.repo = realpathSync(linked);
      writeFileSync(join(this.repo, "tests.txt"), "workspace parent\n");
      this.jj("commit", "-m", "test: establish workspace parent");
      this.baseRev = this.jj(
        "log",
        "--no-graph",
        "-r",
        "@-",
        "-T",
        "commit_id",
      ).stdout.trim();
    }
  }

  close(): void {
    rmSync(this.root, { recursive: true, force: true });
  }
  git(...args: string[]): SpawnSyncReturns<string> {
    const result = spawnSync("git", ["-C", this.repo, ...args], {
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    return result;
  }
  gitUnchecked(...args: string[]): SpawnSyncReturns<string> {
    return spawnSync("git", ["-C", this.repo, ...args], { encoding: "utf8" });
  }
  jj(...args: string[]): SpawnSyncReturns<string> {
    const result = spawnSync(
      "jj",
      [
        "-R",
        this.repo,
        "--no-pager",
        "--color=never",
        "--config",
        "user.name=Scoped Save Test",
        "--config",
        "user.email=scoped-save@example.test",
        ...args,
      ],
      { encoding: "utf8", cwd: this.repo },
    );
    expect(result.status, result.stderr).toBe(0);
    return result;
  }
  helper(
    action: string,
    values: Record<string, string>,
    check = true,
  ): { result: SpawnSyncReturns<string>; output: Json } {
    const args = [
      action,
      "--state-resolver",
      stateResolver,
      ...Object.entries(values).flatMap(([key, value]) => [key, value]),
    ];
    const result = spawnSync("bun", ["run", validator, ...args], {
      encoding: "utf8",
    });
    if (check)
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const output = JSON.parse(result.stdout) as Json;
    return { result, output };
  }
  scope(publication: [string, string][], selected: string[]): string {
    const scope = join(this.workRoot, "artifacts/history/scope-request.json");
    mkdirSync(dirname(scope), { recursive: true });
    const receipt = join(this.workRoot, "artifacts/children/coding.json");
    mkdirSync(dirname(receipt), { recursive: true });
    const generated_files = publication.map(([path]) => {
      const absolute = join(this.repo, path);
      try {
        const stat = lstatSync(absolute);
        if (stat.isSymbolicLink())
          return {
            path,
            state: "symlink",
            sha256: sha(readlinkSync(absolute)),
            mode: "120000",
          };
        return {
          path,
          state: "file",
          sha256: sha(readFileSync(absolute)),
          mode: stat.mode & 0o111 ? "100755" : "100644",
        };
      } catch {
        return { path, state: "deleted", sha256: null, mode: null };
      }
    });
    writeFileSync(
      receipt,
      canonicalJson({
        schema: "state-generated-files/v1",
        producer: "coding:test-fixture",
        base_rev: this.baseRev,
        generated_files,
      }),
    );
    writeFileSync(
      scope,
      JSON.stringify({
        schema: "state-scoped-save-request/v1",
        work_id: "scoped-save",
        scope_complete: true,
        publication_paths: publication.map(([path, origin]) => ({
          path,
          origin,
        })),
        selected_paths: selected,
        generated_file_manifests: [
          ".state/works/scoped-save/artifacts/children/coding.json",
        ],
      }),
    );
    return scope;
  }
  build(scope: string): Json {
    return this.helper("build", {
      "--repo": this.repo,
      "--work-root": this.workRoot,
      "--base-rev": this.baseRev,
      "--scope": scope,
    }).output;
  }
  preflight(
    manifest: Json,
    check = true,
  ): {
    result: SpawnSyncReturns<string>;
    output: Json;
  } {
    return this.helper(
      "preflight",
      {
        "--repo": this.repo,
        "--manifest": jsonText(manifest, "manifest_path"),
        "--manifest-sha256": jsonText(manifest, "manifest_sha256"),
      },
      check,
    );
  }
  commitSelected(preflight: Json, message: string): string {
    this.git(
      "commit",
      "--only",
      `--pathspec-from-file=${preflight.literal_pathspec_file}`,
      "--pathspec-file-nul",
      "-m",
      message,
    );
    return this.git("rev-parse", "HEAD").stdout.trim();
  }
  verify(
    manifest: Json,
    preflight: Json,
    saved: string,
    check = true,
  ): {
    result: SpawnSyncReturns<string>;
    output: Json;
  } {
    return this.helper(
      "verify",
      {
        "--repo": this.repo,
        "--manifest": jsonText(manifest, "manifest_path"),
        "--manifest-sha256": jsonText(manifest, "manifest_sha256"),
        "--snapshot": jsonText(preflight, "snapshot_path"),
        "--snapshot-sha256": jsonText(preflight, "snapshot_sha256"),
        "--saved-rev": saved,
      },
      check,
    );
  }
}

describe("centralized workspace saving", () => {
  it("should reject an unignored central state root and a failed resolver", () => {
    const fixture = new Harness("linked-git");
    try {
      writeFileSync(join(fixture.repo, "src.txt"), "selected edit\n");
      const scope = fixture.scope(
        [["src.txt", "child-manifest:source"]],
        ["src.txt"],
      );
      writeFileSync(join(fixture.primaryRepo, ".gitignore"), "");

      const unignored = fixture.helper(
        "build",
        {
          "--repo": fixture.repo,
          "--work-root": fixture.workRoot,
          "--base-rev": fixture.baseRev,
          "--scope": scope,
        },
        false,
      );

      expect(unignored.result.status).toBe(2);
      expect(unignored.output.error).toEqual(
        expect.stringMatching(/ignored work root|resolver/),
      );
      const failedResolver = join(realpathSync(fixture.root), "failed-resolver");
      writeFileSync(failedResolver, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
      const failed = fixture.helper(
        "build",
        {
          "--repo": fixture.repo,
          "--work-root": fixture.workRoot,
          "--base-rev": fixture.baseRev,
          "--scope": scope,
          "--state-resolver": failedResolver,
        },
        false,
      );

      expect(failed.result.status).toBe(2);
      expect(failed.output.error).toEqual(
        expect.stringContaining("state resolver failed"),
      );
    } finally {
      fixture.close();
    }
  });

  it("should reject ignored jj publication paths", () => {
    const fixture = new Harness("jj");
    try {
      writeFileSync(join(fixture.repo, ".gitignore"), ".state/\nignored.txt\n");
      writeFileSync(join(fixture.repo, "ignored.txt"), "excluded by policy\n");
      const scope = fixture.scope(
        [["ignored.txt", "child-manifest:source"]],
        ["ignored.txt"],
      );

      const result = fixture.helper(
        "build",
        {
          "--repo": fixture.repo,
          "--work-root": fixture.workRoot,
          "--base-rev": fixture.baseRev,
          "--scope": scope,
        },
        false,
      );

      expect(result.result.status).toBe(2);
      expect(result.output.error).toEqual(expect.stringContaining("ignored"));
    } finally {
      fixture.close();
    }
  });

  // real jj subprocesses exceed the default deadline during full-suite contention
  it("should reject a jj operation changed after manifest sealing", () => {
    const fixture = new Harness("jj");
    try {
      writeFileSync(join(fixture.repo, "src.txt"), "selected edit\n");
      const manifest = fixture.build(
        fixture.scope([["src.txt", "child-manifest:source"]], ["src.txt"]),
      );
      fixture.jj("describe", "-m", "feat: concurrent description");

      const result = fixture.preflight(manifest, false);

      expect(result.result.status).toBe(2);
      expect(result.output.error).toEqual(
        expect.stringContaining("identity changed after manifest sealing"),
      );
    } finally {
      fixture.close();
    }
  }, 30_000);

  it("should reject jj merges with multiple parents or unresolved conflicts", () => {
    const fixture = new Harness("jj");
    try {
      writeFileSync(join(fixture.repo, "src.txt"), "left version\n");
      fixture.jj("commit", "-m", "test: left branch");
      const left = fixture
        .jj("log", "--no-graph", "-r", "@-", "-T", "commit_id")
        .stdout.trim();
      fixture.jj("new", fixture.baseRev);
      writeFileSync(join(fixture.repo, "src.txt"), "right version\n");
      fixture.jj("commit", "-m", "test: right branch");
      const right = fixture
        .jj("log", "--no-graph", "-r", "@-", "-T", "commit_id")
        .stdout.trim();
      fixture.jj("new", left, right);
      const scope = fixture.scope(
        [["src.txt", "child-manifest:source"]],
        ["src.txt"],
      );

      const conflict = fixture.helper(
        "build",
        {
          "--repo": fixture.repo,
          "--work-root": fixture.workRoot,
          "--base-rev": fixture.baseRev,
          "--scope": scope,
        },
        false,
      );

      expect(conflict.result.status).toBe(2);
      expect(conflict.output.error).toEqual(
        expect.stringContaining("unresolved conflicts"),
      );
      writeFileSync(join(fixture.repo, "src.txt"), "resolved merge\n");
      const resolvedScope = fixture.scope(
        [["src.txt", "child-manifest:source"]],
        ["src.txt"],
      );
      const multiparent = fixture.helper(
        "build",
        {
          "--repo": fixture.repo,
          "--work-root": fixture.workRoot,
          "--base-rev": fixture.baseRev,
          "--scope": resolvedScope,
        },
        false,
      );

      expect(multiparent.result.status).toBe(2);
      expect(multiparent.output.error).toEqual(
        expect.stringContaining(
          "cannot capture complete jj working-copy identity",
        ),
      );
    } finally {
      fixture.close();
    }
  }, 30_000);

  it("should reject physical files omitted by jj snapshot policy", () => {
    const fixture = new Harness("jj");
    try {
      fixture.jj("config", "set", "--repo", "snapshot.auto-track", "none()");
      writeFileSync(join(fixture.repo, "new.txt"), "not snapshotted\n");
      const scope = fixture.scope(
        [["new.txt", "child-manifest:new-source"]],
        ["new.txt"],
      );

      const result = fixture.helper(
        "build",
        {
          "--repo": fixture.repo,
          "--work-root": fixture.workRoot,
          "--base-rev": fixture.baseRev,
          "--scope": scope,
        },
        false,
      );

      expect(result.result.status).toBe(2);
      expect(result.output.error).toEqual(
        expect.stringMatching(/snapshot|physical|omitted/),
      );
      expect(readFileSync(join(fixture.repo, "new.txt"), "utf8")).toBe(
        "not snapshotted\n",
      );
    } finally {
      fixture.close();
    }
  });

  it("should reject excluded jj source changes after preflight", () => {
    const fixture = new Harness("jj");
    try {
      writeFileSync(join(fixture.repo, "src.txt"), "selected edit\n");
      writeFileSync(join(fixture.repo, "developer.txt"), "excluded edit\n");
      const manifest = fixture.build(
        fixture.scope([["src.txt", "child-manifest:source"]], ["src.txt"]),
      );
      const preflight = fixture.preflight(manifest).output;
      fixture.jj("split", "-m", "feat: save workspace scope", "src.txt");
      const saved = fixture
        .jj(
          "log",
          "--ignore-working-copy",
          "--no-graph",
          "-r",
          "@-",
          "-T",
          "commit_id",
        )
        .stdout.trim();
      writeFileSync(join(fixture.repo, "developer.txt"), "excluded changed\n");

      const result = fixture.verify(manifest, preflight, saved, false);

      expect(result.result.status).toBe(2);
      expect(result.output.error).toEqual(
        expect.stringMatching(/non.selected|excluded|preserv/),
      );
      expect(readFileSync(join(fixture.repo, "developer.txt"), "utf8")).toBe(
        "excluded changed\n",
      );
    } finally {
      fixture.close();
    }
  }, 30_000);

  it("should reject a fabricated local work root and mismatched work identity", () => {
    const fixture = new Harness("linked-git");
    try {
      writeFileSync(join(fixture.repo, "src.txt"), "selected edit\n");
      const scope = fixture.scope(
        [["src.txt", "child-manifest:source"]],
        ["src.txt"],
      );
      const localRoot = join(fixture.repo, ".state/works/scoped-save");
      mkdirSync(localRoot, { recursive: true });

      const wrongRoot = fixture.helper(
        "build",
        {
          "--repo": fixture.repo,
          "--work-root": localRoot,
          "--base-rev": fixture.baseRev,
          "--scope": scope,
        },
        false,
      );

      expect({
        code: wrongRoot.result.status,
        status: wrongRoot.output.status,
      }).toEqual({ code: 2, status: "blocked_scope" });
      expect(wrongRoot.output.error).toEqual(
        expect.stringMatching(/work.root|resolver/i),
      );
      const request = JSON.parse(readFileSync(scope, "utf8"));
      writeFileSync(
        scope,
        JSON.stringify({ ...request, work_id: "another-work" }),
      );
      const wrongId = fixture.helper(
        "build",
        {
          "--repo": fixture.repo,
          "--work-root": fixture.workRoot,
          "--base-rev": fixture.baseRev,
          "--scope": scope,
        },
        false,
      );

      expect({
        code: wrongId.result.status,
        status: wrongId.output.status,
      }).toEqual({ code: 2, status: "blocked_scope" });
      expect(wrongId.output.error).toEqual(
        expect.stringMatching(/work.root|work.id|resolver/i),
      );
    } finally {
      fixture.close();
    }
  });

  it("should reject central artifact traversal and symlink outputs without touching their targets", () => {
    const fixture = new Harness("linked-git");
    try {
      writeFileSync(join(fixture.repo, "src.txt"), "selected edit\n");
      const scope = fixture.scope(
        [["src.txt", "child-manifest:source"]],
        ["src.txt"],
      );
      const request = JSON.parse(readFileSync(scope, "utf8"));
      writeFileSync(
        scope,
        JSON.stringify({
          ...request,
          generated_file_manifests: [
            "artifacts/children/nested/../coding.json",
          ],
        }),
      );

      const traversal = fixture.helper(
        "build",
        {
          "--repo": fixture.repo,
          "--work-root": fixture.workRoot,
          "--base-rev": fixture.baseRev,
          "--scope": scope,
        },
        false,
      );

      expect({
        code: traversal.result.status,
        status: traversal.output.status,
      }).toEqual({ code: 2, status: "blocked_scope" });
      expect(traversal.output.error).toEqual(
        expect.stringContaining("not lexically normalized"),
      );
      writeFileSync(scope, JSON.stringify(request));
      const target = join(fixture.root, "outside");
      mkdirSync(target);
      writeFileSync(join(target, "sentinel"), "untouched\n");
      symlinkSync(
        target,
        join(fixture.workRoot, "artifacts/history/save-manifests"),
      );
      const symlink = fixture.helper(
        "build",
        {
          "--repo": fixture.repo,
          "--work-root": fixture.workRoot,
          "--base-rev": fixture.baseRev,
          "--scope": scope,
        },
        false,
      );

      expect({
        code: symlink.result.status,
        status: symlink.output.status,
      }).toEqual({ code: 2, status: "blocked_scope" });
      expect(symlink.output.error).toEqual(
        expect.stringContaining(
          "cannot open safe artifacts directory component",
        ),
      );
      expect(readFileSync(join(target, "sentinel"), "utf8")).toBe(
        "untouched\n",
      );
    } finally {
      fixture.close();
    }
  });

  it("should reject stale central producer receipts and a different source workspace", () => {
    const fixture = new Harness("linked-git");
    try {
      writeFileSync(join(fixture.repo, "src.txt"), "selected edit\n");
      const manifest = fixture.build(
        fixture.scope([["src.txt", "child-manifest:source"]], ["src.txt"]),
      );
      const wrongSource = fixture.helper(
        "preflight",
        {
          "--repo": fixture.primaryRepo,
          "--manifest": jsonText(manifest, "manifest_path"),
          "--manifest-sha256": jsonText(manifest, "manifest_sha256"),
        },
        false,
      );
      expect({
        code: wrongSource.result.status,
        status: wrongSource.output.status,
      }).toEqual({ code: 2, status: "blocked_scope" });
      const receipt = join(fixture.workRoot, "artifacts/children/coding.json");
      writeFileSync(receipt, `${readFileSync(receipt, "utf8")} `);

      const stale = fixture.preflight(manifest, false);

      expect({
        code: stale.result.status,
        status: stale.output.status,
      }).toEqual({ code: 2, status: "blocked_scope" });
      expect(stale.output.error).toEqual(expect.stringContaining("receipt"));
    } finally {
      fixture.close();
    }
  });

  it("should reject a changed primary checkout during native jj save verification", () => {
    const fixture = new Harness("jj");
    try {
      writeFileSync(join(fixture.repo, "src.txt"), "selected edit\n");
      writeFileSync(join(fixture.repo, "developer.txt"), "excluded edit\n");
      const manifest = fixture.build(
        fixture.scope([["src.txt", "child-manifest:source"]], ["src.txt"]),
      );
      const preflight = fixture.preflight(manifest).output;
      fixture.jj("split", "-m", "feat: save workspace scope", "src.txt");
      const saved = fixture
        .jj(
          "log",
          "--ignore-working-copy",
          "--no-graph",
          "-r",
          "@-",
          "-T",
          "commit_id",
        )
        .stdout.trim();
      writeFileSync(
        join(fixture.primaryRepo, "developer.txt"),
        "changed after preflight\n",
      );

      const result = fixture.verify(manifest, preflight, saved, false);

      expect(result.result.status).toBe(2);
      expect(result.output.error).toEqual(
        expect.stringMatching(/primary|default|preserv/i),
      );
      expect(
        readFileSync(join(fixture.primaryRepo, "developer.txt"), "utf8"),
      ).toBe("changed after preflight\n");
    } finally {
      fixture.close();
    }
  }, 30_000);

  it.each(["jj", "jj-uncolocated"] as const)("should save a %s workspace against its own parent without changing the primary checkout", (workspace) => {
    const fixture = new Harness(workspace);
    try {
      writeFileSync(
        join(fixture.primaryRepo, "developer.txt"),
        "primary staged\n",
      );
      const staged = spawnSync(
        "git",
        ["-C", fixture.primaryRepo, "add", "developer.txt"],
        { encoding: "utf8" },
      );
      expect(staged.status, staged.stderr).toBe(0);
      writeFileSync(
        join(fixture.primaryRepo, "developer.txt"),
        "primary unstaged\n",
      );
      const primary = {
        head: spawnSync(
          "git",
          ["-C", fixture.primaryRepo, "rev-parse", "HEAD"],
          { encoding: "utf8" },
        ).stdout.trim(),
        index: readFileSync(join(fixture.primaryRepo, ".git/index")),
        bytes: readFileSync(join(fixture.primaryRepo, "developer.txt")),
      };
      expect(primary.head).not.toBe(fixture.baseRev);
      writeFileSync(join(fixture.repo, "src.txt"), "selected jj edit\n");
      chmodSync(join(fixture.repo, "src.txt"), 0o755);
      unlinkSync(join(fixture.repo, "tests.txt"));
      writeFileSync(join(fixture.repo, "developer.txt"), "excluded jj edit\n");
      const excluded = readFileSync(join(fixture.repo, "developer.txt"));

      const manifest = fixture.build(
        fixture.scope(
          [
            ["src.txt", "child-manifest:source"],
            ["tests.txt", "child-manifest:deleted-test"],
          ],
          ["src.txt", "tests.txt"],
        ),
      );
      const preflight = fixture.preflight(manifest).output;
      fixture.jj(
        "split",
        "-m",
        "feat: save workspace scope",
        "src.txt",
        "tests.txt",
      );
      const saved = fixture
        .jj(
          "log",
          "--ignore-working-copy",
          "--no-graph",
          "-r",
          "@-",
          "-T",
          "commit_id",
        )
        .stdout.trim();
      const verified = fixture.verify(manifest, preflight, saved).output;

      expect(verified).toMatchObject({
        status: "pass",
        non_selected_preserved: true,
      });
      expect({
        head: spawnSync(
          "git",
          ["-C", fixture.primaryRepo, "rev-parse", "HEAD"],
          { encoding: "utf8" },
        ).stdout.trim(),
        index: readFileSync(join(fixture.primaryRepo, ".git/index")),
        bytes: readFileSync(join(fixture.primaryRepo, "developer.txt")),
      }).toEqual(primary);
      expect(readFileSync(join(fixture.repo, "developer.txt"))).toEqual(
        excluded,
      );
      expect(fixture.jj("file", "show", "-r", saved, "src.txt").stdout).toBe(
        "selected jj edit\n",
      );
    } finally {
      fixture.close();
    }
  }, 30_000);

  it("should save a linked Git scope while preserving primary and excluded source changes", () => {
    const fixture = new Harness("linked-git");
    try {
      writeFileSync(
        join(fixture.primaryRepo, "developer.txt"),
        "primary staged\n",
      );
      const staged = spawnSync(
        "git",
        ["-C", fixture.primaryRepo, "add", "developer.txt"],
        { encoding: "utf8" },
      );
      expect(staged.status, staged.stderr).toBe(0);
      writeFileSync(
        join(fixture.primaryRepo, "developer.txt"),
        "primary unstaged\n",
      );
      const primary = {
        head: spawnSync(
          "git",
          ["-C", fixture.primaryRepo, "rev-parse", "HEAD"],
          { encoding: "utf8" },
        ).stdout.trim(),
        index: readFileSync(join(fixture.primaryRepo, ".git/index")),
        bytes: readFileSync(join(fixture.primaryRepo, "developer.txt")),
      };
      writeFileSync(join(fixture.repo, "src.txt"), "selected edit\n");
      writeFileSync(join(fixture.repo, "developer.txt"), "source staged\n");
      fixture.git("add", "developer.txt");
      writeFileSync(join(fixture.repo, "developer.txt"), "source unstaged\n");
      const excluded = {
        staged: fixture.git("show", ":developer.txt").stdout,
        bytes: readFileSync(join(fixture.repo, "developer.txt")),
      };

      const manifest = fixture.build(
        fixture.scope([["src.txt", "child-manifest:source"]], ["src.txt"]),
      );
      const preflight = fixture.preflight(manifest).output;
      const saved = fixture.commitSelected(
        preflight,
        "feat: save linked scope",
      );
      const verified = fixture.verify(manifest, preflight, saved).output;

      expect(verified).toMatchObject({
        status: "pass",
        non_selected_preserved: true,
      });
      expect({
        head: spawnSync(
          "git",
          ["-C", fixture.primaryRepo, "rev-parse", "HEAD"],
          { encoding: "utf8" },
        ).stdout.trim(),
        index: readFileSync(join(fixture.primaryRepo, ".git/index")),
        bytes: readFileSync(join(fixture.primaryRepo, "developer.txt")),
      }).toEqual(primary);
      expect({
        staged: fixture.git("show", ":developer.txt").stdout,
        bytes: readFileSync(join(fixture.repo, "developer.txt")),
      }).toEqual(excluded);
      expect(fixture.git("show", `${saved}:src.txt`).stdout).toBe(
        "selected edit\n",
      );
    } finally {
      fixture.close();
    }
  }, 30_000);
});

describe("path-scoped lifecycle saving", () => {
  let h: Harness;
  beforeEach(() => {
    h = new Harness();
  });
  afterEach(() => h.close());

  // This test alone drives the full build→preflight→save→verify chain of real
  // bun and git subprocesses. It is the one in this file observed exceeding the
  // default budget on hosted macOS, so the raise lives on this test alone and
  // genuine hangs elsewhere still fail fast.
  it("preserves unrelated index and worktree in a real path-limited save", () => {
    const selected = [
      "src.txt",
      "tests.txt",
      "docs/architecture/README.md",
      "docs/design/README.md",
    ];
    for (const path of selected)
      writeFileSync(
        join(h.repo, path),
        readFileSync(join(h.repo, path), "utf8") + "lifecycle edit\n",
      );
    chmodSync(join(h.repo, "src.txt"), 0o755);
    writeFileSync(join(h.repo, "developer.txt"), "developer staged\n");
    h.git("add", "developer.txt");
    const staged = h.git("show", ":developer.txt").stdout;
    writeFileSync(
      join(h.repo, "developer.txt"),
      "developer unstaged after staged\n",
    );
    const worktree = readFileSync(join(h.repo, "developer.txt"));
    const manifest = h.build(
      h.scope(
        selected.map((path) => [path, `child-manifest:${path}`]),
        selected,
      ),
    );
    const sealed = JSON.parse(readFileSync(manifest.manifest_path, "utf8"));
    expect(sealed.schema).toBe("state-scoped-save/v1");
    expect(
      new Set(sealed.publication_paths.map(({ path }: Json) => path)),
    ).toEqual(new Set(selected));
    expect(
      sealed.selected_paths.find(({ path }: Json) => path === "src.txt").mode,
    ).toBe("100755");
    expect(sealed.excluded_dirty_paths.map(({ path }: Json) => path)).toEqual([
      "developer.txt",
    ]);
    const preflight = h.preflight(manifest).output;
    expect(
      JSON.parse(readFileSync(preflight.snapshot_path, "utf8")).schema,
    ).toBe("state-scoped-save-preflight/v1");
    const saved = h.commitSelected(preflight, "feat: save lifecycle scope");
    expect(h.git("show", ":developer.txt").stdout).toBe(staged);
    expect(readFileSync(join(h.repo, "developer.txt"))).toEqual(worktree);
    const verified = h.verify(manifest, preflight, saved).output;
    expect(verified).toMatchObject({
      status: "pass",
      non_selected_preserved: true,
    });
    expect(JSON.parse(readFileSync(verified.receipt_path, "utf8")).schema).toBe(
      "state-scoped-save-result/v1",
    );
    expect(h.verify(manifest, preflight, saved).output.receipt_path).toBe(
      verified.receipt_path,
    );
  }, 30_000);

  it("records and saves both sides of an exact rename", () => {
    h.git("mv", "src.txt", "renamed-src.txt");
    const manifest = h.build(
      h.scope(
        [
          ["src.txt", "child-manifest:rename-source"],
          ["renamed-src.txt", "child-manifest:rename-destination"],
        ],
        ["src.txt", "renamed-src.txt"],
      ),
    );
    const entries = Object.fromEntries(
      JSON.parse(
        readFileSync(manifest.manifest_path, "utf8"),
      ).selected_paths.map((entry: Json) => [entry.path, entry]),
    );
    expect(entries["src.txt"]).toMatchObject({ state: "deleted" });
    expect(entries["src.txt"].status).toContain("role=source");
    expect(entries["renamed-src.txt"]).toMatchObject({ state: "file" });
    expect(entries["renamed-src.txt"].status).toContain("role=destination");
    const preflight = h.preflight(manifest).output;
    expect(
      h.verify(
        manifest,
        preflight,
        h.commitSelected(preflight, "refactor: rename source"),
      ).output.non_selected_preserved,
    ).toBe(true);
  });

  it("rejects selected bytes changed after sealing", () => {
    writeFileSync(join(h.repo, "src.txt"), "lifecycle edit\n");
    const manifest = h.build(
      h.scope([["src.txt", "child-manifest:source"]], ["src.txt"]),
    );
    writeFileSync(join(h.repo, "src.txt"), "changed after review\n");
    const blocked = h.preflight(manifest, false);
    expect(blocked.result.status).toBe(2);
    expect(blocked.output).toMatchObject({ status: "blocked_scope" });
    expect(blocked.output.error).toContain("stale");
  });

  it.each([
    [
      "duplicate JSON keys",
      (raw: Buffer) =>
        Buffer.from(
          raw
            .toString()
            .replace('"base_rev":', '"base_rev":"duplicate","base_rev":'),
        ),
      "duplicate JSON key",
    ],
    [
      "unknown manifest fields",
      (raw: Buffer) => {
        const value = JSON.parse(raw.toString());
        value.unexpected = true;
        return Buffer.from(canonicalJson(value));
      },
      "unknown=['unexpected']",
    ],
  ])(
    "rejects %s even under a matching filename hash",
    (_name, mutate, error) => {
      writeFileSync(join(h.repo, "src.txt"), "lifecycle edit\n");
      const manifest = h.build(
        h.scope([["src.txt", "child-manifest:source"]], ["src.txt"]),
      );
      const raw = mutate(readFileSync(manifest.manifest_path));
      const digest = sha(raw);
      const path = join(dirname(manifest.manifest_path), `${digest}.json`);
      writeFileSync(path, raw);
      const blocked = h.helper(
        "preflight",
        { "--repo": h.repo, "--manifest": path, "--manifest-sha256": digest },
        false,
      );
      expect(blocked.result.status).toBe(2);
      expect(blocked.output.error).toContain(error);
    },
  );

  it("rejects snapshot mutation", () => {
    writeFileSync(join(h.repo, "src.txt"), "lifecycle edit\n");
    const manifest = h.build(
      h.scope([["src.txt", "child-manifest:source"]], ["src.txt"]),
    );
    const preflight = h.preflight(manifest).output;
    const saved = h.commitSelected(preflight, "feat: save source");
    chmodSync(preflight.snapshot_path, 0o644);
    writeFileSync(
      preflight.snapshot_path,
      Buffer.concat([readFileSync(preflight.snapshot_path), Buffer.from(" ")]),
    );
    const blocked = h.verify(manifest, preflight, saved, false);
    expect(blocked.result.status).toBe(2);
    expect(blocked.output.error).toContain("snapshot");
  });

  it("rejects an intervening plain Git commit", () => {
    writeFileSync(join(h.repo, "src.txt"), "lifecycle edit\n");
    const manifest = h.build(
      h.scope([["src.txt", "child-manifest:source"]], ["src.txt"]),
    );
    const preflight = h.preflight(manifest).output;
    const saved = h.commitSelected(preflight, "feat: save source");
    writeFileSync(join(h.repo, "developer.txt"), "concurrent commit\n");
    h.git("add", "developer.txt");
    h.git("commit", "-m", "chore: concurrent developer commit");
    const blocked = h.verify(manifest, preflight, saved, false);
    expect(blocked.result.status).toBe(2);
    expect(blocked.output.error).toContain("current HEAD no longer equals");
  });

  it("rejects lexical traversal in every CLI artifact path before access", () => {
    writeFileSync(join(h.repo, "src.txt"), "lifecycle edit\n");
    const scope = h.scope([["src.txt", "child-manifest:source"]], ["src.txt"]);
    const escaped = (path: string) =>
      `${dirname(path)}/nested/../${path.split("/").at(-1)}`;
    let blocked = h.helper(
      "build",
      {
        "--repo": h.repo,
        "--work-root": h.workRoot,
        "--base-rev": h.baseRev,
        "--scope": escaped(scope),
      },
      false,
    );
    expect(blocked.output.error).toContain(
      "--scope contains lexical traversal",
    );
    const manifest = h.build(scope);
    blocked = h.helper(
      "preflight",
      {
        "--repo": h.repo,
        "--manifest": escaped(manifest.manifest_path),
        "--manifest-sha256": manifest.manifest_sha256,
      },
      false,
    );
    expect(blocked.output.error).toContain(
      "--manifest contains lexical traversal",
    );
    const preflight = h.preflight(manifest).output;
    const saved = h.commitSelected(preflight, "feat: save source");
    blocked = h.helper(
      "verify",
      {
        "--repo": h.repo,
        "--manifest": manifest.manifest_path,
        "--manifest-sha256": manifest.manifest_sha256,
        "--snapshot": escaped(preflight.snapshot_path),
        "--snapshot-sha256": preflight.snapshot_sha256,
        "--saved-rev": saved,
      },
      false,
    );
    expect(blocked.output.error).toContain(
      "--snapshot contains lexical traversal",
    );
  });

  it("rejects traversal in generated artifact pointers", () => {
    writeFileSync(join(h.repo, "src.txt"), "lifecycle edit\n");
    const scope = h.scope([["src.txt", "child-manifest:source"]], ["src.txt"]);
    const request = JSON.parse(readFileSync(scope, "utf8"));
    request.generated_file_manifests = [
      "artifacts/children/nested/../coding.json",
    ];
    writeFileSync(scope, JSON.stringify(request));
    const blocked = h.helper(
      "build",
      {
        "--repo": h.repo,
        "--work-root": h.workRoot,
        "--base-rev": h.baseRev,
        "--scope": scope,
      },
      false,
    );
    expect(blocked.result.status).toBe(2);
    expect(blocked.output.error).toContain("not lexically normalized");
  });

  it.each([
    ["--assume-unchanged", "--no-assume-unchanged"],
    ["--skip-worktree", "--no-skip-worktree"],
  ])("rejects ambiguous index flag %s", (flag, clearFlag) => {
    writeFileSync(
      join(h.repo, "src.txt"),
      `lifecycle edit hidden by ${flag}\n`,
    );
    h.git("update-index", flag, "src.txt");
    const scope = h.scope([["src.txt", "child-manifest:source"]], ["src.txt"]);
    const blocked = h.helper(
      "build",
      {
        "--repo": h.repo,
        "--work-root": h.workRoot,
        "--base-rev": h.baseRev,
        "--scope": scope,
      },
      false,
    );
    expect(blocked.result.status).toBe(2);
    expect(blocked.output.error).toContain(
      "index flag makes scoped proof ambiguous",
    );
    h.git("update-index", clearFlag, "src.txt");
  });

  it("rejects mode changes hidden by core.filemode=false", () => {
    chmodSync(join(h.repo, "src.txt"), 0o755);
    h.git("config", "core.filemode", "false");
    const scope = h.scope([["src.txt", "child-manifest:source"]], ["src.txt"]);
    const blocked = h.helper(
      "build",
      {
        "--repo": h.repo,
        "--work-root": h.workRoot,
        "--base-rev": h.baseRev,
        "--scope": scope,
      },
      false,
    );
    expect(blocked.result.status).toBe(2);
    expect(blocked.output.error).toContain("core.filemode=false");
    expect(blocked.output.error).toContain("preservation ambiguous");
  });

  it("rejects history changes after manifest sealing", () => {
    writeFileSync(join(h.repo, "src.txt"), "lifecycle edit\n");
    const manifest = h.build(
      h.scope([["src.txt", "child-manifest:source"]], ["src.txt"]),
    );
    writeFileSync(join(h.repo, "developer.txt"), "history writer\n");
    h.git("add", "developer.txt");
    h.git("commit", "-q", "-m", "chore: concurrent history writer");
    const blocked = h.preflight(manifest, false);
    expect(blocked.result.status).toBe(2);
    expect(blocked.output.error).toContain(
      "HEAD changed after scoped manifest sealing",
    );
  });

  it("rejects producer receipt mutation after sealing", () => {
    writeFileSync(join(h.repo, "src.txt"), "lifecycle edit\n");
    const manifest = h.build(
      h.scope([["src.txt", "child-manifest:source"]], ["src.txt"]),
    );
    const receiptPath = join(h.workRoot, "artifacts/children/coding.json");
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    receipt.producer = "coding:mutated-after-seal";
    writeFileSync(receiptPath, canonicalJson(receipt));
    const blocked = h.preflight(manifest, false);
    expect(blocked.result.status).toBe(2);
    expect(blocked.output.error).toContain("bindings changed after sealing");
  });

  it("rejects producer omission from publication scope", () => {
    for (const relative of ["src.txt", "tests.txt"])
      writeFileSync(join(h.repo, relative), "lifecycle edit\n");
    const scope = h.scope(
      [
        ["src.txt", "child-manifest:source"],
        ["tests.txt", "child-manifest:tests"],
      ],
      ["src.txt", "tests.txt"],
    );
    const receiptPath = join(h.workRoot, "artifacts/children/coding.json");
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    receipt.generated_files = receipt.generated_files.filter(
      ({ path }: Json) => path === "src.txt",
    );
    writeFileSync(receiptPath, canonicalJson(receipt));
    const blocked = h.helper(
      "build",
      {
        "--repo": h.repo,
        "--work-root": h.workRoot,
        "--base-rev": h.baseRev,
        "--scope": scope,
      },
      false,
    );
    expect(blocked.result.status).toBe(2);
    expect(blocked.output.error).toContain(
      "generated_files must equal publication scope exactly",
    );
    expect(blocked.output.error).toContain("tests.txt");
  });

  it("recovers the exact preflight head, index, worktree, and status", () => {
    writeFileSync(join(h.repo, "src.txt"), "lifecycle edit\n");
    writeFileSync(join(h.repo, "developer.txt"), "developer staged\n");
    h.git("add", "developer.txt");
    writeFileSync(join(h.repo, "developer.txt"), "developer unstaged\n");
    const manifest = h.build(
      h.scope([["src.txt", "child-manifest:source"]], ["src.txt"]),
    );
    const preflight = h.preflight(manifest).output;
    let indexPath = h.git("rev-parse", "--git-path", "index").stdout.trim();
    if (!indexPath.startsWith("/")) indexPath = join(h.repo, indexPath);
    const indexBefore = readFileSync(indexPath);
    const statusBefore = h.git(
      "status",
      "--porcelain=v2",
      "-z",
      "--untracked-files=all",
      "--ignore-submodules=none",
    ).stdout;
    const srcBefore = readFileSync(join(h.repo, "src.txt"));
    const developerBefore = readFileSync(join(h.repo, "developer.txt"));
    const oldHead = h.git("rev-parse", "HEAD").stdout.trim();
    h.git("commit", "-q", "-a", "-m", "feat: faulty save captures extra path");
    const saved = h.git("rev-parse", "HEAD").stdout.trim();
    const failed = h.verify(manifest, preflight, saved, false);
    expect(failed.result.status).toBe(2);
    expect(failed.output.error).toContain("dirty path set changed");
    const recovered = h.helper("recover", {
      "--repo": h.repo,
      "--manifest": jsonText(manifest, "manifest_path"),
      "--manifest-sha256": jsonText(manifest, "manifest_sha256"),
      "--snapshot": jsonText(preflight, "snapshot_path"),
      "--snapshot-sha256": jsonText(preflight, "snapshot_sha256"),
      "--failed-head": saved,
    }).output;
    expect(recovered.status).toBe("recovered");
    expect(
      JSON.parse(readFileSync(recovered.receipt_path, "utf8")).schema,
    ).toBe("state-scoped-save-recovery/v1");
    expect(h.git("rev-parse", "HEAD").stdout.trim()).toBe(oldHead);
    expect(readFileSync(indexPath)).toEqual(indexBefore);
    expect(readFileSync(join(h.repo, "src.txt"))).toEqual(srcBefore);
    expect(readFileSync(join(h.repo, "developer.txt"))).toEqual(
      developerBefore,
    );
    expect(
      h.git(
        "status",
        "--porcelain=v2",
        "-z",
        "--untracked-files=all",
        "--ignore-submodules=none",
      ).stdout,
    ).toBe(statusBefore);
  });

  it("blocks selected clean filters before history mutation", () => {
    h.git("config", "filter.upper.clean", "tr '[:lower:]' '[:upper:]'");
    h.git("config", "filter.upper.smudge", "cat");
    writeFileSync(join(h.repo, ".gitattributes"), "src.txt filter=upper\n");
    h.git("add", ".gitattributes");
    h.git("commit", "-q", "-m", "chore: configure clean filter");
    h.baseRev = h.git("rev-parse", "HEAD").stdout.trim();
    writeFileSync(join(h.repo, "src.txt"), "lifecycle edit\n");
    const manifest = h.build(
      h.scope([["src.txt", "child-manifest:source"]], ["src.txt"]),
    );
    const head = h.git("rev-parse", "HEAD").stdout.trim();
    const blocked = h.preflight(manifest, false);
    expect(blocked.result.status).toBe(2);
    expect(blocked.output.error).toContain("Git clean transform");
    expect(h.git("rev-parse", "HEAD").stdout.trim()).toBe(head);
  });

  it.each(["-١", "-۱۲", "-.٥", "-०.५"])(
    "accepts Unicode decimal negative value %s before downstream validation",
    (value) => {
      const completed = cli([
        "build",
        "--repo",
        value,
        "--work-root=/missing",
        "--base-rev=HEAD",
        "--scope=/missing",
        `--state-resolver=${stateResolver}`,
      ]);
      expect(completed.status).toBe(1);
      expect(completed.stdout).toBe("");
      expect(completed.stderr).toContain(
        `ENOENT: no such file or directory, lstat '${value}'`,
      );
      expect(completed.stderr).toContain(`path: "${value}"`);
      expect(completed.stderr).toContain("at repositoryIdentity (");
    },
  );

  it.each(["-1x", "-1."])(
    "rejects near-negative value %s as a missing option argument",
    (value) => {
      const completed = cli(["build", "--repo", value]);
      expect(completed.status).toBe(2);
      expect(completed.stdout).toBe("");
      expect(completed.stderr).toBe(
        `${buildUsage}\nvalidate_scoped_save.ts build: error: argument --repo: expected one argument\n`,
      );
    },
  );

  it("honors subcommand help before required-option validation", () => {
    const completed = cli(["build", "--repo", "/missing", "--help"]);
    expect(completed.status).toBe(0);
    expect(completed.stderr).toBe("");
    expect(completed.stdout).toContain(buildUsage);
    expect(completed.stdout).toContain("--scope SCOPE");
  });

  it("treats root -- as ending options before help", () => {
    const completed = cli(["--", "--help"]);
    expect(completed.status).toBe(2);
    expect(completed.stdout).toBe("");
    expect(completed.stderr).toContain(
      "argument command: invalid choice: '--help'",
    );
  });

  it("treats subcommand -- and later help as positional unknowns after missing requirements", () => {
    const completed = cli(["build", "--repo=/missing", "--", "--help"]);
    expect(completed.status).toBe(2);
    expect(completed.stdout).toBe("");
    expect(completed.stderr).toContain(
      "the following arguments are required: --state-resolver, --work-root, --base-rev, --scope",
    );
  });

  it("rejects a symlink ancestor without writing through it", () => {
    writeFileSync(join(h.repo, "src.txt"), "lifecycle edit\n");
    const scope = h.scope([["src.txt", "child-manifest:source"]], ["src.txt"]);
    const attacker = join(h.root, "attacker");
    mkdirSync(attacker);
    const history = join(h.workRoot, "artifacts/history");
    symlinkSync(attacker, join(history, "save-manifests"));
    const blocked = h.helper(
      "build",
      {
        "--repo": h.repo,
        "--work-root": h.workRoot,
        "--base-rev": h.baseRev,
        "--scope": scope,
      },
      false,
    );
    expect(blocked.result.status).toBe(2);
    expect(blocked.output.error).toContain(
      "cannot open safe artifacts directory component: save-manifests",
    );
    expect(readFileSync(scope, "utf8")).toContain(
      "state-scoped-save-request/v1",
    );
    expect(() => statSync(join(attacker, "redirected.json"))).toThrow();
  });

  it("should keep descriptor-relative immutable writes after an ancestor swap", () => {
    const trustedAncestor = join(h.root, "trusted-ancestor");
    const movedAncestor = join(h.root, "opened-ancestor");
    const attackerAncestor = join(h.root, "attacker-ancestor");
    const attackerArtifacts = join(attackerAncestor, "artifacts");
    const raw = Buffer.from('{"trusted":true}\n');
    mkdirSync(join(trustedAncestor, "artifacts"), { recursive: true });
    mkdirSync(attackerArtifacts, { recursive: true });
    const exercise = `
import { fstatSync, renameSync, statSync, symlinkSync } from "node:fs";
import { withSecureDirectory, writeOrVerifyImmutable, readImmutable } from ${JSON.stringify(pathToFileURL(validator).href)};

const root = ${JSON.stringify(h.root)};
const trustedAncestor = ${JSON.stringify(trustedAncestor)};
const movedAncestor = ${JSON.stringify(movedAncestor)};
const attackerAncestor = ${JSON.stringify(attackerAncestor)};
const raw = Buffer.from(${JSON.stringify(raw.toString("base64"))}, "base64");

const identities = withSecureDirectory(
  root,
  ["trusted-ancestor", "artifacts"],
  false,
  (directory) => {
    const openedDirectory = fstatSync(directory.descriptor);
    renameSync(trustedAncestor, movedAncestor);
    symlinkSync(attackerAncestor, trustedAncestor);
    writeOrVerifyImmutable(directory, "manifest.json", raw);
    writeOrVerifyImmutable(directory, "snapshot.json", raw);
    writeOrVerifyImmutable(directory, "pathspec", raw, 0o400);
    writeOrVerifyImmutable(directory, "index.backup", raw, 0o400);
    const readBack = [
      "manifest.json",
      "snapshot.json",
      "pathspec",
      "index.backup",
    ].map((name) => Buffer.from(readImmutable(directory, name)).toString("base64"));
    const retainedDirectory = statSync(movedAncestor + "/artifacts");
    return [
      openedDirectory.dev + ":" + openedDirectory.ino,
      retainedDirectory.dev + ":" + retainedDirectory.ino,
      ...readBack,
    ];
  },
);
process.stdout.write(identities.join("\\n"));
`;
    const destinations = [
      ["manifest.json", 0o444],
      ["snapshot.json", 0o444],
      ["pathspec", 0o400],
      ["index.backup", 0o400],
    ] as const;

    const exercised = spawnSync("bun", ["--eval", exercise], {
      encoding: "utf8",
    });

    const [openedIdentity, retainedIdentity, ...readBack] = exercised.stdout
      .trimEnd()
      .split("\n");
    expect(exercised.status, exercised.stderr).toBe(0);
    expect(retainedIdentity).toBe(openedIdentity);
    expect(readBack).toEqual(Array(4).fill(raw.toString("base64")));
    for (const [name, mode] of destinations) {
      const destination = join(movedAncestor, "artifacts", name);
      expect(readFileSync(destination)).toEqual(raw);
      expect(statSync(destination).mode & 0o777).toBe(mode);
      expect(() => statSync(join(attackerArtifacts, name))).toThrow();
    }
  });

  it("rejects an immutable symlink leaf without writing its target", () => {
    writeFileSync(join(h.repo, "src.txt"), "lifecycle edit\n");
    const scope = h.scope([["src.txt", "child-manifest:source"]], ["src.txt"]);
    const manifest = h.build(scope);
    const raw = readFileSync(manifest.manifest_path);
    const mode = statSync(manifest.manifest_path).mode & 0o777;
    const attacker = join(h.root, "attacker-leaf");
    unlinkSync(manifest.manifest_path);
    symlinkSync(attacker, manifest.manifest_path);
    const blocked = h.helper(
      "build",
      {
        "--repo": h.repo,
        "--work-root": h.workRoot,
        "--base-rev": h.baseRev,
        "--scope": scope,
      },
      false,
    );
    expect(blocked.result.status).toBe(2);
    expect(blocked.output.error).toContain("immutable artifacts collision");
    expect(() => statSync(attacker)).toThrow();
    expect(readFileSync(scope)).not.toEqual(raw);
    expect(mode).toBe(0o444);
  });
});

describe("ignored directories in centralized jj workspaces", () => {
  it.each(["active", "default"] as const)(
    "should save selected files with an unreadable ignored cache in the %s workspace",
    (workspace: "active" | "default") => {
      const fixture = new Harness("jj");
      const cache = join(
        workspace === "active" ? fixture.repo : fixture.primaryRepo,
        "cache",
      );
      try {
        writeFileSync(join(dirname(cache), ".gitignore"), ".state/\ncache/\n");
        mkdirSync(cache);
        writeFileSync(join(cache, "entry.txt"), "ignored cache\n");
        chmodSync(cache, 0o000);
        expect(() => readdirSync(cache)).toThrow(/EACCES/);
        writeFileSync(join(fixture.repo, "src.txt"), "selected edit\n");
        writeFileSync(join(fixture.repo, "developer.txt"), "excluded edit\n");
        const manifest = fixture.build(
          fixture.scope([["src.txt", "child-manifest:source"]], ["src.txt"]),
        );
        const preflight = fixture.preflight(manifest).output;
        fixture.jj("split", "-m", "feat: save workspace scope", "src.txt");
        const saved = fixture
          .jj(
            "log",
            "--ignore-working-copy",
            "--no-graph",
            "-r",
            "@-",
            "-T",
            "commit_id",
          )
          .stdout.trim();
        expect(fixture.verify(manifest, preflight, saved).output).toMatchObject(
          { status: "pass", non_selected_preserved: true },
        );
      } finally {
        try {
          chmodSync(cache, 0o755);
        } finally {
          fixture.close();
        }
      }
    },
    // Real Git/jj subprocesses need the existing native integration budget.
    30_000,
  );
});

describe("ignore exceptions in centralized jj workspaces", () => {
  it.each([
    ["active", "negated"],
    ["default", "negated"],
    ["active", "tracked"],
    ["default", "tracked"],
  ] as const)(
    "should reject changes to a %s workspace %s file after saving",
    (workspace: "active" | "default", kind: "negated" | "tracked") => {
      const fixture = new Harness("jj", kind === "tracked");
      try {
        const root =
          workspace === "active" ? fixture.repo : fixture.primaryRepo;
        const retained = join(
          root,
          kind === "negated" ? "ignored/keep.txt" : "cache/entry.txt",
        );
        mkdirSync(dirname(retained), { recursive: true });
        writeFileSync(
          join(root, ".gitignore"),
          kind === "negated"
            ? ".state/\nignored/*\n!ignored/keep.txt\n"
            : ".state/\ncache/\n",
        );
        writeFileSync(retained, "protected original\n");
        writeFileSync(join(fixture.repo, "src.txt"), "selected edit\n");
        writeFileSync(join(fixture.repo, "tests.txt"), "excluded edit\n");
        const manifest = fixture.build(
          fixture.scope([["src.txt", "child-manifest:source"]], ["src.txt"]),
        );
        const preflight = fixture.preflight(manifest).output;
        fixture.jj("split", "-m", "feat: save workspace scope", "src.txt");
        const saved = fixture
          .jj(
            "log",
            "--ignore-working-copy",
            "--no-graph",
            "-r",
            "@-",
            "-T",
            "commit_id",
          )
          .stdout.trim();
        writeFileSync(retained, "changed after save\n");
        const verification = fixture.verify(manifest, preflight, saved, false);
        expect(verification.result.status).toBe(2);
        expect(verification.output.error).toMatch(
          /non.selected|excluded|preserv|primary|default/i,
        );
      } finally {
        fixture.close();
      }
    },
    // Real Git/jj subprocesses need the existing native integration budget.
    30_000,
  );
});
