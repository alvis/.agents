import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const reviewScanner = join(import.meta.dirname, "review-scan.sh");

describe("cmd:review-scan", () => {
  it("should self-resolve the scanner and propagate its failure", () => {
    const root = mkdtempSync(join(tmpdir(), "review-scan-"));
    try {
      const plugin = join(root, "plugin");
      const helper = join(plugin, "skills/pr/scripts/review-scan.sh");
      const scripts = join(plugin, "scripts");
      const bin = join(root, "bin");
      const marker = join(root, "review-scan-args");
      const elsewhere = join(root, "elsewhere");
      mkdirSync(dirname(helper), { recursive: true });
      cpSync(reviewScanner, helper);
      mkdirSync(scripts);
      mkdirSync(bin);
      mkdirSync(elsewhere);
      writeFileSync(
        join(bin, "bun"),
        '#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$REVIEW_SCAN_MARKER"\nexit 99\n',
      );
      chmodSync(join(bin, "bun"), 0o755);
      const scanner = join(scripts, "scan_potential_violations.ts");
      writeFileSync(scanner, "");

      const completed = spawnSync(
        "bash",
        [helper, "--area=security", "target path.py"],
        {
          cwd: elsewhere,
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            REVIEW_SCAN_MARKER: marker,
          },
        },
      );

      expect(completed.status).toBe(99);
      expect(
        readFileSync(marker, "utf8").split(/\r?\n/).filter(Boolean),
      ).toEqual([
        "run",
        scanner,
        "--area=security",
        "target path.py",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
