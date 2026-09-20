import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runBoundedCli } from "./cli-report.ts";

const roots: string[] = [];
function fixture(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "cli-report-test-")));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("bounded CLI reports", () => {
  it("should preserve small output and leave report-like arguments after the separator untouched", async () => {
    const root = fixture();
    vi.stubEnv("TMPDIR", root);
    let output = "";
    const args = ["--", "--report-file", "literal-input"];
    const code = await runBoundedCli(
      args,
      (argv, sinks) => {
        expect(argv).toEqual(args);
        sinks.stdout!("small-output\n");
        return 0;
      },
      {
        stdout: (text) => {
          output += text;
        },
      },
    );
    const summary = JSON.parse(output);
    expect(code).toBe(0);
    expect(summary.truncated).toBe(false);
    expect(summary.preview.stdout_head).toBe("small-output\n");
    expect(JSON.parse(readFileSync(summary.full_output, "utf8")).argv).toEqual(
      args,
    );
  });

  it.each([["--report-file"], ["--report-file=a", "--report-file=b"]])(
    "should retain parser failure for %j",
    async (...argv) => {
      const root = fixture();
      vi.stubEnv("TMPDIR", root);
      let output = "";
      const execute = vi.fn(() => 0);
      const code = await runBoundedCli(argv, execute, {
        stdout: (text) => {
          output += text;
        },
      });
      const summary = JSON.parse(output);
      expect(execute).not.toHaveBeenCalled();
      expect(code).toBe(2);
      expect(summary.original_exit_code).toBe(2);
      expect(
        JSON.parse(readFileSync(summary.full_output, "utf8")).stderr.length,
      ).toBeGreaterThan(0);
    },
  );

  it("should bound an oversized requested destination while retaining a fallback report", async () => {
    const root = fixture();
    vi.stubEnv("TMPDIR", root);
    let output = "";
    await runBoundedCli(
      ["--report-file", join(root, "中".repeat(10000))],
      (_argv, sinks) => {
        sinks.stdout!("fixture\n");
        return 0;
      },
      {
        stdout: (text) => {
          output += text;
        },
      },
    );
    const summary = JSON.parse(output);
    expect(summary.preservation.status).toBe("fallback");
    expect(Buffer.byteLength(output)).toBeLessThanOrEqual(4096);
    expect(JSON.parse(readFileSync(summary.full_output, "utf8")).stdout).toBe(
      "fixture\n",
    );
  });
  it.each([0, 7])(
    "should bound oversized streams and preserve their exact bytes with exit %s",
    async (originalExit) => {
      const root = fixture();
      const reportPath = join(root, "report.json");
      const stdout = JSON.stringify({
        status: originalExit ? "failure" : "success",
        diagnostics: [{ message: '😀中\\"'.repeat(3000) }],
      });
      const stderr = "error-head:" + "é".repeat(10000) + ":error-tail";
      let output = "";
      const code = await runBoundedCli(
        ["--report-file", reportPath, "--", "input.ts"],
        (argv, sinks) => {
          expect(argv).toEqual(["--", "input.ts"]);
          sinks.stdout!(stdout);
          sinks.stderr!(stderr);
          return originalExit;
        },
        {
          stdout: (text) => {
            output += text;
          },
          stderr: () => {
            throw new Error("unexpected summary stderr");
          },
        },
      );
      const summary = JSON.parse(output);
      expect(Buffer.byteLength(output)).toBeLessThanOrEqual(4096);
      expect(code).toBe(originalExit);
      expect(summary.original_exit_code).toBe(originalExit);
      expect(summary.exit_code).toBe(originalExit);
      expect(summary.truncated).toBe(true);
      expect(summary.counts).toMatchObject({
        stdout_bytes: Buffer.byteLength(stdout),
        stderr_bytes: Buffer.byteLength(stderr),
        diagnostics: 1,
      });
      expect(summary.preview.stderr_head).toMatch(/^error-head:/);
      expect(summary.preview.stderr_tail).toMatch(/:error-tail$/);
      expect(Object.values(summary.preview).join("")).not.toContain("�");
      expect(isAbsolute(summary.full_output)).toBe(true);
      expect(summary.preservation.status).toBe("saved");
      expect(JSON.parse(readFileSync(summary.full_output, "utf8"))).toEqual({
        argv: ["--report-file", reportPath, "--", "input.ts"],
        cwd: process.cwd(),
        exit_code: originalExit,
        stdout,
        stderr,
      });
      expect(statSync(summary.full_output).mode & 0o777).toBe(0o600);
    },
  );

  it("should preserve an existing requested file and fall back to a secure report", async () => {
    const root = fixture();
    vi.stubEnv("TMPDIR", root);
    const existing = join(root, "existing.json");
    writeFileSync(existing, "owned-content");
    let output = "";
    const code = await runBoundedCli(
      [`--report-file=${existing}`],
      (_argv, sinks) => {
        sinks.stdout!("complete-output");
        return 0;
      },
      {
        stdout: (text) => {
          output += text;
        },
      },
    );
    const summary = JSON.parse(output);
    expect(code).toBe(0);
    expect(summary.preservation.status).toBe("fallback");
    expect(readFileSync(existing, "utf8")).toBe("owned-content");
    expect(JSON.parse(readFileSync(summary.full_output, "utf8")).stdout).toBe(
      "complete-output",
    );
    expect(Buffer.byteLength(output)).toBeLessThanOrEqual(4096);
  });

  it.each([0, 9])(
    "should expose failed preservation without losing original exit %s",
    async (originalExit) => {
      const root = fixture();
      const blocked = join(root, "not-a-directory");
      writeFileSync(blocked, "block");
      vi.stubEnv("TMPDIR", blocked);
      let output = "";
      const code = await runBoundedCli(
        ["--report-file", join(blocked, "report"), "x".repeat(20000)],
        (_argv, sinks) => {
          sinks.stderr!("failure-start" + "😀".repeat(10000) + "failure-end");
          return originalExit;
        },
        {
          stdout: (text) => {
            output += text;
          },
        },
      );
      const summary = JSON.parse(output);
      expect(code).toBe(originalExit || 1);
      expect(summary.original_exit_code).toBe(originalExit);
      expect(summary.exit_code).toBe(code);
      expect(summary.status).toBe("preservation_error");
      expect(summary.no_report_retained).toBe(true);
      expect(summary.full_output).toBeNull();
      expect(summary.preservation.status).toBe("failed");
      expect(summary.rerun.method).toEqual(expect.any(String));
      expect(summary.truncated).toBe(true);
      expect(Buffer.byteLength(output)).toBeLessThanOrEqual(4096);
    },
  );
});
