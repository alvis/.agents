import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

interface Sandbox {
  readonly root: string;
  readonly bin: string;
  readonly home: string;
  readonly workingDirectory: string;
  readonly inspection: string;
}

interface Plugin {
  readonly name: string;
  readonly path: string;
  readonly enabled: boolean;
  readonly scope: string;
}

interface CommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const script = resolve(import.meta.dirname, "context.ts");

describe("cmd:Grok startup context", () => {
  it.each(["main", "subagent"] as const)("should load enabled %s payloads with Essential first and per-plugin path substitution", (audience) => {
    const sandbox = createSandbox();
    try {
      const zeta = writePlugin(sandbox, "zeta", {
        ALLAGENT: "zeta-all={{PLUGIN_DIR}}\n",
        MAINAGENT: "zeta-main\n",
        SUBAGENT: "zeta-subagent\n",
      });
      const essential = writePlugin(sandbox, "essential", {
        ALLAGENT: "essential-all={{PLUGIN_DIR}}\n",
        MAINAGENT: "essential-main\n",
        SUBAGENT: "essential-subagent\n",
      });
      const alpha = writePlugin(sandbox, "alpha", {
        ALLAGENT: "alpha-all={{PLUGIN_DIR}} and {{PLUGIN_DIR}}\n",
        MAINAGENT: "alpha-main\n",
        SUBAGENT: "alpha-subagent\n",
      });
      const disabled = { name: "disabled", path: join(sandbox.root, "absent-disabled-plugin"), enabled: false, scope: "user" };
      writeFileSync(sandbox.inspection, JSON.stringify({ plugins: [zeta, disabled, alpha, essential] }));

      const result = runContext(sandbox, ["--audience", audience]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(`essential-all=${essential.path}`);
      expect(result.stdout).toContain(`alpha-all=${alpha.path} and ${alpha.path}`);
      expect(result.stdout).toContain(`zeta-all=${zeta.path}`);
      const markers = result.stdout.match(/(?:essential|alpha|zeta)-(?:all|main|subagent)/g);
      expect(markers).toEqual([
        "essential-all", `essential-${audience}`,
        "alpha-all", `alpha-${audience}`,
        "zeta-all", `zeta-${audience}`,
      ]);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it("should skip absent optional payloads and return no context for plugins without any", () => {
    const sandbox = createSandbox();
    try {
      const onlyAll = writePlugin(sandbox, "only-all", { ALLAGENT: "shared-marker\n" });
      const empty = writePlugin(sandbox, "empty", {});
      rmSync(join(empty.path, "hooks"), { recursive: true });
      writeFileSync(sandbox.inspection, JSON.stringify({ plugins: [empty, onlyAll] }));

      const result = runContext(sandbox, ["--audience", "main"]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("shared-marker");
      writeFileSync(sandbox.inspection, JSON.stringify({ plugins: [empty] }));
      const withoutPayloads = runContext(sandbox, ["--audience", "subagent"]);
      expect(withoutPayloads.status, withoutPayloads.stderr).toBe(0);
      expect(withoutPayloads.stdout.trim()).toBe("");
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it.each([
    { args: [] },
    { args: ["--audience"] },
    { args: ["--audience", "unknown"] },
    { args: ["--audience", "main", "--unknown"] },
  ])("should reject invalid audience arguments $args without context output", ({ args }) => {
    const sandbox = createSandbox();
    try {
      const result = runContext(sandbox, args);

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/audience|unknown|argument/i);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it.each([
    "[not-json",
    "[]",
    '{"plugins":[{"name":"invalid","path":"/invalid","enabled":"true"}]}',
  ])("should reject malformed inspection %s before emitting context", (inspection) => {
    const sandbox = createSandbox();
    try {
      writeFileSync(sandbox.inspection, inspection);

      const result = runContext(sandbox, ["--audience", "main"]);

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/inspect|JSON|plugin/i);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it("should report inspection command failures without emitting context", () => {
    const sandbox = createSandbox();
    try {
      const result = runContext(sandbox, ["--audience", "main"]);

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/inspect/i);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it("should reject a missing enabled root without leaking earlier plugin context", () => {
    const sandbox = createSandbox();
    try {
      const essential = writePlugin(sandbox, "essential", { ALLAGENT: "must-stay-buffered\n" });
      const missing = { name: "missing", path: join(sandbox.root, "missing plugin"), enabled: true, scope: "project" };
      writeFileSync(sandbox.inspection, JSON.stringify({ plugins: [essential, missing] }));

      const result = runContext(sandbox, ["--audience", "main"]);

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(missing.path);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it.each(["directory", "broken symlink"] as const)("should fail on a payload that is a %s without partial output", (failure) => {
    const sandbox = createSandbox();
    try {
      const essential = writePlugin(sandbox, "essential", { ALLAGENT: "must-stay-buffered\n" });
      const failing = writePlugin(sandbox, "failing", { ALLAGENT: "also-buffered\n" });
      const path = join(failing.path, "hooks/MAINAGENT.md");
      if (failure === "directory") mkdirSync(path);
      else symlinkSync(join(failing.path, "missing.md"), path);
      writeFileSync(sandbox.inspection, JSON.stringify({ plugins: [essential, failing] }));

      const result = runContext(sandbox, ["--audience", "main"]);

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(path);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it("should read current enablement and payload bytes on each invocation", () => {
    const sandbox = createSandbox();
    try {
      const plugin = writePlugin(sandbox, "active", { ALLAGENT: "first-version\n" });
      writeFileSync(sandbox.inspection, JSON.stringify({ plugins: [plugin] }));
      const first = runContext(sandbox, ["--audience", "main"]);
      expect(first.status, first.stderr).toBe(0);
      expect(first.stdout).toContain("first-version");
      writeFileSync(join(plugin.path, "hooks/ALLAGENT.md"), "second-version\n");

      const second = runContext(sandbox, ["--audience", "main"]);

      expect(second.status, second.stderr).toBe(0);
      expect(second.stdout).toContain("second-version");
      expect(second.stdout).not.toContain("first-version");
      writeFileSync(sandbox.inspection, JSON.stringify({ plugins: [{ ...plugin, enabled: false }] }));
      const disabled = runContext(sandbox, ["--audience", "main"]);
      expect(disabled.status, disabled.stderr).toBe(0);
      expect(disabled.stdout.trim()).toBe("");
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });
});

function runContext(sandbox: Sandbox, args: readonly string[]): CommandResult {
  const result = spawnSync("bun", [script, ...args], {
    cwd: sandbox.workingDirectory,
    encoding: "utf8",
    env: {
      HOME: sandbox.home,
      PATH: `${sandbox.bin}${delimiter}${process.env.PATH ?? ""}`,
      GROK_CONTEXT_INSPECTION: sandbox.inspection,
      GROK_CONTEXT_CWD: realpathSync(sandbox.workingDirectory),
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function createSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "grok context "));
  const bin = join(root, "bin");
  const home = join(root, "home");
  const workingDirectory = join(root, "project");
  const inspection = join(root, "inspect.json");
  for (const path of [bin, home, workingDirectory]) mkdirSync(path);
  const executable = join(bin, "grok");
  writeFileSync(executable, '#!/bin/sh\n[ "$PWD" = "$GROK_CONTEXT_CWD" ] || exit 70\n[ "$*" = "inspect --json" ] || exit 64\ncat "$GROK_CONTEXT_INSPECTION"\n');
  chmodSync(executable, 0o755);
  return { root, bin, home, workingDirectory, inspection };
}

function writePlugin(sandbox: Sandbox, name: string, payloads: Partial<Record<"ALLAGENT" | "MAINAGENT" | "SUBAGENT", string>>): Plugin {
  const path = join(sandbox.root, `${name} $& plugin`);
  mkdirSync(join(path, "hooks"), { recursive: true });
  for (const [audience, content] of Object.entries(payloads)) {
    writeFileSync(join(path, "hooks", `${audience}.md`), content);
  }
  return { name, path, enabled: true, scope: "project" };
}
