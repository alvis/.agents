import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const resolver = resolve(import.meta.dirname, "resolve-pr.sh");

function run(metadata: Record<string, unknown>) {
  const root = mkdtempSync(resolve(tmpdir(), "resolve-pr-"));
  const bin = resolve(root, "bin");
  mkdirSync(bin);
  const gh = resolve(bin, "gh");
  writeFileSync(gh, '#!/usr/bin/env bash\nprintf "%s\\n" "$PR_METADATA"\n');
  chmodSync(gh, 0o755);
  return {
    result: spawnSync("/bin/bash", [resolver, "42", "--repo", "octo/repo"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        PR_METADATA: JSON.stringify(metadata),
      },
    }),
    root,
  };
}

describe("pull-request coordinate resolution", () => {
  it("should resolve a canonical enterprise URL", () => {
    const { result, root } = run({
      number: 42,
      url: "https://github.example.test/octo/repo/pull/42",
    });
    try {
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        host: "github.example.test",
        number: 42,
        owner: "octo",
        repo: "repo",
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("should reject metadata whose URL and PR number disagree", () => {
    const { result, root } = run({
      number: 41,
      url: "https://github.example.test/octo/repo/pull/42",
    });
    try {
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("canonical PR number disagrees");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
