import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveDomainContext } from "../plugins/essential/scripts/domain-context.ts";
import { nativeDomainPayloadCommand } from "./harness_contract.ts";

interface Sandbox {
  readonly root: string;
  readonly pluginRoot: string;
  readonly command: string;
  readonly delivered: { context: string; receipt: string };
}
interface Decision {
  readonly decision?: string;
  readonly reason?: string;
}

describe("Grok visible domain delivery acknowledgments", () => {
  it.each(["main", "subagent"] as const)(
    "should merge %s operation delivery into the next caller-held loader receipt",
    (audience) => {
      const sandbox = createSandbox(audience);
      try {
        const initial = JSON.parse(
          runLoader(sandbox, [
            "--audience",
            audience,
            "--prompt",
            "What is 2 plus 2?",
          ]),
        );
        const input = {
          ...operation(sandbox),
          subagentType: audience === "subagent" ? "worker" : undefined,
        };
        const denied = runHook(sandbox, "PreToolUse", input);
        expect(denied.decision).toBe("deny");
        const acknowledged = JSON.parse(denied.reason!) as {
          context: string;
          receipt: string;
          retry: string;
        };
        expect(acknowledged.context).toContain("fixture-domain");
        expect(acknowledged.context).toContain(
          audience === "main" ? "fixture-main" : "fixture-child",
        );
        expect(runHook(sandbox, "PreToolUse", input).decision).not.toBe("deny");

        const args = ["--audience", audience, "--prompt", "/fixture:build"];
        const unsynchronized = JSON.parse(
          runLoader(sandbox, [...args, "--receipt", initial.receipt]),
        );
        expect(unsynchronized.context).toBe(acknowledged.context);
        const synchronized = JSON.parse(
          runLoader(sandbox, [
            ...args,
            "--receipt",
            initial.receipt,
            "--delivered-receipt",
            acknowledged.receipt,
          ]),
        );
        expect(synchronized.context).toBe("");
        expect(
          runLoader(sandbox, [...args, "--receipt", synchronized.receipt]),
        ).toBe("");
        writeFileSync(
          join(sandbox.pluginRoot, "hooks/ALLAGENT.md"),
          "fixture-domain-updated\n",
        );
        const changed = JSON.parse(
          runLoader(sandbox, [...args, "--receipt", synchronized.receipt]),
        );
        expect(changed.context).toContain("fixture-domain-updated");
      } finally {
        rmSync(sandbox.root, { recursive: true, force: true });
      }
    },
  );

  it.each(["malformed", "stale content", "wrong audience"])(
    "should reject a %s operation delivery receipt without hiding required context",
    (failure) => {
      const sandbox = createSandbox();
      try {
        const initial = JSON.parse(
          runLoader(sandbox, [
            "--audience",
            "main",
            "--prompt",
            "What is 2 plus 2?",
          ]),
        );
        const denied = runHook(sandbox, "PreToolUse", operation(sandbox));
        const acknowledgment = JSON.parse(denied.reason!) as {
          receipt: string;
        };
        if (failure === "stale content")
          writeFileSync(
            join(sandbox.pluginRoot, "hooks/ALLAGENT.md"),
            "fixture-domain-updated\n",
          );

        const recovered = JSON.parse(
          runLoader(sandbox, [
            "--audience",
            failure === "wrong audience" ? "subagent" : "main",
            "--prompt",
            "/fixture:build",
            "--receipt",
            initial.receipt,
            "--delivered-receipt",
            failure === "malformed" ? "{malformed" : acknowledgment.receipt,
          ]),
        );

        expect(recovered.context).toContain("fixture-domain");
      } finally {
        rmSync(sandbox.root, { recursive: true, force: true });
      }
    },
  );
  it("should bind documented child sessions separately from siblings and their main audience", () => {
    const sandbox = createSandbox("subagent");
    try {
      runHook(sandbox, "PostToolUse", {
        ...loaderResult(sandbox),
        sessionId: "child-one",
        subagentType: "worker",
      });
      const firstChild = {
        ...operation(sandbox),
        sessionId: "child-one",
        subagentType: "worker",
      };
      expect(runHook(sandbox, "PreToolUse", firstChild).decision).not.toBe(
        "deny",
      );
      const sibling = {
        ...operation(sandbox),
        sessionId: "child-two",
        subagentType: "worker",
      };
      const delivered = runHook(sandbox, "PreToolUse", sibling);
      expect(delivered.decision).toBe("deny");
      expect(delivered.reason).toContain("fixture-child");
      expect(delivered.reason).not.toContain("fixture-main");
      expect(runHook(sandbox, "PreToolUse", sibling).decision).not.toBe("deny");
      const main = runHook(sandbox, "PreToolUse", {
        ...operation(sandbox),
        sessionId: "child-one",
      });
      expect(main.decision).toBe("deny");
      expect(main.reason).toContain("fixture-main");
      expect(main.reason).not.toContain("fixture-child");
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });
  it("should acknowledge the explicit loader result before the next matching operation", () => {
    const sandbox = createSandbox();
    try {
      runHook(sandbox, "PostToolUse", loaderResult(sandbox));

      const next = runHook(sandbox, "PreToolUse", operation(sandbox));

      expect(next.decision).not.toBe("deny");
      expect(next.reason ?? "").not.toContain("fixture-domain");
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it.each([
    "missing",
    "malformed",
    "failed",
    "input truncated",
    "result truncated",
    "wrong command",
    "foreign loader",
    "wrong cwd",
    "changed content",
    "mismatched result command",
  ])("should not acknowledge a %s loader result", (failure) => {
    const sandbox = createSandbox();
    try {
      const input = loaderResult(sandbox);
      const foreignMarker = join(sandbox.root, "foreign-loader-ran");
      const foreignRoot = join(sandbox.root, "foreign", "essential");
      const foreignLoader = join(foreignRoot, "scripts/context.ts");
      if (failure === "foreign loader") {
        mkdirSync(join(foreignRoot, "scripts"), { recursive: true });
        mkdirSync(join(foreignRoot, ".grok-plugin"), { recursive: true });
        writeFileSync(
          join(foreignRoot, ".grok-plugin/plugin.json"),
          JSON.stringify({ name: "essential" }),
        );
        writeFileSync(
          foreignLoader,
          `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(foreignMarker)}, "executed");`,
        );
      }
      const attemptedCommand =
        failure === "wrong command"
          ? "echo unrelated"
          : failure === "foreign loader"
            ? `bun run ${foreignLoader} --audience main --prompt /fixture:build`
            : sandbox.command;
      if (failure === "changed content")
        writeFileSync(
          join(sandbox.pluginRoot, "hooks/ALLAGENT.md"),
          "fixture-domain-updated\n",
        );
      const invalid = {
        ...input,
        toolInputTruncated: failure === "input truncated" ? true : undefined,
        toolResultTruncated: failure === "result truncated" ? true : undefined,
        toolInput: {
          command: attemptedCommand,
        },
        toolResult: {
          ...input.toolResult,
          command:
            failure === "mismatched result command"
              ? "echo unrelated"
              : attemptedCommand,
          exit_code: failure === "failed" ? 1 : 0,
          output_for_prompt:
            failure === "malformed"
              ? "not-json"
              : failure === "wrong cwd"
                ? JSON.stringify({
                    ...sandbox.delivered,
                    receipt: sandbox.delivered.receipt.replace(
                      realpathSync(sandbox.root),
                      "/other",
                    ),
                  })
                : input.toolResult.output_for_prompt,
        },
      };
      if (failure !== "missing") runHook(sandbox, "PostToolUse", invalid);

      expect(existsSync(foreignMarker)).toBe(false);

      const first = runHook(sandbox, "PreToolUse", operation(sandbox));

      expect(first.decision).toBe("deny");
      expect(first.reason).toContain("fixture-domain");
      expect(
        runHook(sandbox, "PreToolUse", operation(sandbox)).decision,
      ).not.toBe("deny");
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });
});

function createSandbox(audience: "main" | "subagent" = "main"): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "grok-domain-"));
  const pluginRoot = join(root, "cache", "alvis", "fixture", "1.0.0");
  const dependencyRoot = join(root, "cache", "alvis", "essential", "1.0.0");
  mkdirSync(join(pluginRoot, "hooks"), { recursive: true });
  mkdirSync(join(pluginRoot, "scripts"), { recursive: true });
  mkdirSync(join(dependencyRoot, "scripts"), { recursive: true });
  mkdirSync(join(dependencyRoot, ".grok-plugin"), { recursive: true });
  writeFileSync(
    join(dependencyRoot, ".grok-plugin/plugin.json"),
    JSON.stringify({ name: "essential" }),
  );
  copyFileSync(
    resolve(import.meta.dirname, "plugin-root"),
    join(pluginRoot, "scripts/plugin-root"),
  );
  chmodSync(join(pluginRoot, "scripts/plugin-root"), 0o755);
  copyFileSync(
    resolve(
      import.meta.dirname,
      "../plugins/essential/scripts/domain-context.ts",
    ),
    join(dependencyRoot, "scripts/domain-context.ts"),
  );
  for (const script of ["context.ts", "grok.ts"]) {
    copyFileSync(
      resolve(import.meta.dirname, `../plugins/essential/scripts/${script}`),
      join(dependencyRoot, `scripts/${script}`),
    );
  }
  writeFileSync(
    join(pluginRoot, "hooks/context.json"),
    JSON.stringify({
      request_patterns: ["/fixture:"],
      tool_patterns: ["fixture_tool"],
      agent_patterns: [],
    }),
  );
  writeFileSync(join(pluginRoot, "hooks/ALLAGENT.md"), "fixture-domain\n");
  writeFileSync(join(pluginRoot, "hooks/MAINAGENT.md"), "fixture-main\n");
  writeFileSync(join(pluginRoot, "hooks/SUBAGENT.md"), "fixture-child\n");
  const essentialRoot = dependencyRoot;
  const command = `bun run ${join(essentialRoot, "scripts/context.ts")} --audience ${audience} --prompt /fixture:build`;
  const plugins = [
    { name: "essential", path: essentialRoot, enabled: true, scope: "project" },
    { name: "fixture", path: pluginRoot, enabled: true, scope: "project" },
  ];
  const delivered = resolveDomainContext({
    plugins,
    cwd: root,
    audience,
    evidence: { prompt: "/fixture:build" },
  });
  mkdirSync(join(root, "bin"));
  writeFileSync(
    join(root, "bin/grok"),
    '#!/bin/sh\ncat "$GROK_TEST_INSPECTION"\n',
  );
  chmodSync(join(root, "bin/grok"), 0o755);
  writeFileSync(join(root, "inspect.json"), JSON.stringify({ plugins }));
  return { root, pluginRoot, command, delivered };
}

function loaderResult(sandbox: Sandbox): {
  sessionId: string;
  cwd: string;
  toolName: string;
  toolInput: { command: string };
  toolResult: {
    type: string;
    command: string;
    exit_code: number;
    output_for_prompt: string;
  };
} {
  return {
    sessionId: "session",
    cwd: sandbox.root,
    toolName: "run_terminal_command",
    toolInput: { command: sandbox.command },
    toolResult: {
      type: "Bash",
      command: sandbox.command,
      exit_code: 0,
      output_for_prompt: JSON.stringify({
        context: sandbox.delivered.context,
        receipt: sandbox.delivered.receipt,
      }),
    },
  };
}

function operation(sandbox: Sandbox): Record<string, unknown> {
  return {
    sessionId: "session",
    cwd: sandbox.root,
    toolName: "fixture_tool",
    toolInput: {},
  };
}

function runHook(
  sandbox: Sandbox,
  event: string,
  input: Record<string, unknown>,
): Decision {
  const result = spawnSync(
    "bash",
    ["-c", nativeDomainPayloadCommand(event, "ALLAGENT")],
    {
      cwd: sandbox.root,
      encoding: "utf8",
      input: JSON.stringify(input),
      env: {
        PATH: `${join(sandbox.root, "bin")}:${process.env.PATH}`,
        HOME: sandbox.root,
        TMPDIR: sandbox.root,
        GROK_PLUGIN_ROOT: sandbox.pluginRoot,
        GROK_TEST_INSPECTION: join(sandbox.root, "inspect.json"),
      },
    },
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout ? JSON.parse(result.stdout) : {};
}

function runLoader(sandbox: Sandbox, args: readonly string[]): string {
  const result = spawnSync(
    "bun",
    [
      resolve(import.meta.dirname, "../plugins/essential/scripts/context.ts"),
      ...args,
    ],
    {
      cwd: sandbox.root,
      encoding: "utf8",
      env: {
        PATH: `${join(sandbox.root, "bin")}:${process.env.PATH}`,
        HOME: sandbox.root,
        TMPDIR: sandbox.root,
        GROK_TEST_INSPECTION: join(sandbox.root, "inspect.json"),
      },
    },
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}
