import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const labelLister = join(import.meta.dirname, "list-repository-labels.sh");

function createTemporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), "repository-labels-"));
}

function writeExecutable(path: string, content: string): void {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

describe("cmd:list-repository-labels", () => {
  it("should list the complete repository label inventory deterministically", () => {
    const root = createTemporaryDirectory();
    try {
      const bin = join(root, "bin");
      const log = join(root, "gh-args");
      mkdirSync(bin);
      writeExecutable(
        join(bin, "gh"),
        `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >"$GH_CALL_LOG"\nprintf '%s\\n' '[[{"name":"zeta","description":"later"},{"name":"Alpha","description":"first","color":"ffffff"}],[{"name":"beta","description":"second"},{"name":"zeta","description":null}]]'\n`,
      );

      const result = spawnSync(
        "bash",
        [labelLister, "github example", "octo/widgets repository"],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            GH_CALL_LOG: log,
          },
        },
      );

      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual([
        { name: "Alpha", description: "first" },
        { name: "beta", description: "second" },
        { name: "zeta", description: null },
        { name: "zeta", description: "later" },
      ]);
      expect(readFileSync(log, "utf8").trim().split("\n")).toEqual([
        "api",
        "--hostname",
        "github example",
        "--paginate",
        "--slurp",
        "repos/octo/widgets repository/labels?per_page=100",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("should propagate repository label API errors", () => {
    const root = createTemporaryDirectory();
    try {
      const bin = join(root, "bin");
      mkdirSync(bin);
      writeExecutable(
        join(bin, "gh"),
        "#!/usr/bin/env bash\nprintf 'label lookup failed\\n' >&2\nexit 42\n",
      );

      const result = spawnSync(
        "bash",
        [labelLister, "github.example", "octo/widgets"],
        {
          encoding: "utf8",
          env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
        },
      );

      expect({
        status: result.status,
        stderr: result.stderr,
        stdout: result.stdout,
      }).toEqual({
        status: 42,
        stderr: "label lookup failed\n",
        stdout: "",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
