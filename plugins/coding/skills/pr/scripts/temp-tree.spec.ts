import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const temporaryTree = join(import.meta.dirname, "temp-tree.sh");

describe("cmd:temp-tree", () => {
  it("should open and close a Git tree lease", () => {
    const root = mkdtempSync(join(tmpdir(), "git-tree-"));
    try {
      const repo = join(root, "repo");
      expect(
        spawnSync("git", ["init", "--quiet", "--initial-branch=main", repo])
          .status,
      ).toBe(0);
      spawnSync("git", ["-C", repo, "config", "user.name", "Test"]);
      spawnSync("git", [
        "-C",
        repo,
        "config",
        "user.email",
        "test@example.com",
      ]);
      writeFileSync(join(repo, "tracked"), "one\n");
      spawnSync("git", ["-C", repo, "add", "tracked"]);
      expect(
        spawnSync("git", [
          "-C",
          repo,
          "commit",
          "--quiet",
          "--no-gpg-sign",
          "-m",
          "base",
        ]).status,
      ).toBe(0);
      const head = spawnSync("git", ["-C", repo, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).stdout.trim();

      const opened = spawnSync(
        "bash",
        [temporaryTree, "open-git", repo, head],
        { encoding: "utf8" },
      );

      expect(opened.status, opened.stderr).toBe(0);
      const lease = JSON.parse(opened.stdout) as {
        lease: string;
        tree: string;
      };
      expect(existsSync(lease.tree)).toBe(true);
      expect(
        spawnSync("git", ["-C", lease.tree, "rev-parse", "HEAD"], {
          encoding: "utf8",
        }).stdout.trim(),
      ).toBe(head);

      const closed = spawnSync("bash", [temporaryTree, "close", lease.lease]);

      expect(closed.status).toBe(0);
      expect(existsSync(lease.lease)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
