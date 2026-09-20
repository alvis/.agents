import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { nativeDomainPayloadCommand } from "./harness_contract.ts";

interface Sandbox {
  readonly root: string;
  readonly pluginRoot: string;
}
interface HookParams {
  readonly command?: string;
  readonly event?: string;
  readonly payloadName?: string;
  readonly rootVariable?: string;
  readonly alias?: boolean;
  readonly input: Readonly<Record<string, unknown>>;
}

describe("native domain context delivery", () => {
  it.each([
    "coding",
    "governance",
    "production",
    "react",
    "web",
    "client",
    "specification",
  ])("should execute %s's registered prompt delivery once", (plugin) => {
    const sandbox = createSandbox();
    try {
      const sourceRoot = resolve(import.meta.dirname, "../plugins", plugin);
      copyFileSync(
        join(sourceRoot, "hooks/context.json"),
        join(sandbox.pluginRoot, "hooks/context.json"),
      );
      writeFileSync(
        join(sandbox.pluginRoot, "hooks/MAINAGENT.md"),
        "fixture-main\n",
      );
      const hooks = JSON.parse(
        readFileSync(join(sourceRoot, "hooks/hooks.json"), "utf8"),
      ) as { hooks: Record<string, { hooks: { command: string }[] }[]> };
      const commands = hooks.hooks.UserPromptSubmit.flatMap(
        (registration) => registration.hooks,
      ).filter(({ command }) => command.includes("/scripts/domain-context.ts"));
      const input = { session_id: "registered", prompt: `/${plugin}:fixture` };
      const first = commands
        .map(({ command }) => runHook(sandbox, { command, input }))
        .join("");

      expect(first.split("fixture-all=")).toHaveLength(2);
      expect(
        commands
          .map(({ command }) => runHook(sandbox, { command, input }))
          .join(""),
      ).toBe("");
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });
  it.each(["startup", "clear"])(
    "should retain both main payload receipts after the complete %s registration group",
    (source) => {
      const sandbox = createSandbox();
      try {
        writeFileSync(
          join(sandbox.pluginRoot, "hooks/MAINAGENT.md"),
          "fixture-main\n",
        );
        const input = { session_id: "group", prompt: "/fixture:build", source };
        expect(
          runHook(sandbox, {
            event: "SessionStart",
            payloadName: "ALLAGENT",
            input,
          }),
        ).toContain("fixture-all=");
        expect(
          runHook(sandbox, {
            event: "SessionStart",
            payloadName: "MAINAGENT",
            input,
          }),
        ).toBe("fixture-main\n");
        expect(runHook(sandbox, { payloadName: "ALLAGENT", input })).toBe("");
        expect(runHook(sandbox, { payloadName: "MAINAGENT", input })).toBe("");
      } finally {
        rmSync(sandbox.root, { recursive: true, force: true });
      }
    },
  );
  it.each([
    { rootVariable: "CLAUDE_PLUGIN_ROOT", alias: false },
    { rootVariable: "PLUGIN_ROOT", alias: false },
    { rootVariable: "PLUGIN_ROOT", alias: true },
    { rootVariable: "GROK_PLUGIN_ROOT", alias: false },
    { rootVariable: "GROK_PLUGIN_ROOT", alias: true },
  ])(
    "should deliver applicable context under $rootVariable with alias=$alias",
    ({ rootVariable, alias }) => {
      const sandbox = createSandbox();
      try {
        const input = { session_id: "session", prompt: "/fixture:build" };
        const first = runHook(sandbox, { rootVariable, alias, input });
        if (rootVariable === "GROK_PLUGIN_ROOT") expect(first).toBe("");
        else expect(first).toContain("fixture-all=");
        const repeated = runHook(sandbox, { rootVariable, alias, input });
        expect(repeated).toBe("");
      } finally {
        rmSync(sandbox.root, { recursive: true, force: true });
      }
    },
  );

  it.each(["startup", "clear", "resume", "compact"])(
    "should apply %s to native session delivery",
    (source) => {
      const sandbox = createSandbox();
      try {
        const input = { session_id: "session", prompt: "/fixture:build" };
        expect(runHook(sandbox, { input })).toContain("fixture-all=");
        expect(runHook(sandbox, { input })).toBe("");
        const lifecycle = runHook(sandbox, {
          event: "SessionStart",
          input: { ...input, source },
        });

        expect(lifecycle).toBe(
          source === "startup" || source === "clear"
            ? `fixture-all=${sandbox.pluginRoot}\n`
            : "",
        );
        expect(runHook(sandbox, { input })).toBe("");
      } finally {
        rmSync(sandbox.root, { recursive: true, force: true });
      }
    },
  );

  it.each([
    {},
    { session_id: "" },
    { session_id: null },
    { session_id: ["session"] },
  ])(
    "should avoid persistent suppression for invalid identity %j",
    (identity) => {
      const sandbox = createSandbox();
      try {
        const input = { ...identity, prompt: "/fixture:build" };
        expect(runHook(sandbox, { input })).toContain("fixture-all=");
        expect(runHook(sandbox, { input })).toContain("fixture-all=");
      } finally {
        rmSync(sandbox.root, { recursive: true, force: true });
      }
    },
  );

  it("should isolate sibling children and avoid persistence without a child identity", () => {
    const sandbox = createSandbox();
    try {
      const input = { session_id: "parent", prompt: "/fixture:build" };
      const first = { ...input, agent_id: "first" };
      const second = { ...input, agent_id: "second" };
      expect(
        runHook(sandbox, { event: "SubagentStart", input: first }),
      ).toContain("fixture-all=");
      expect(runHook(sandbox, { event: "SubagentStart", input: first })).toBe(
        "",
      );
      expect(
        runHook(sandbox, { event: "SubagentStart", input: second }),
      ).toContain("fixture-all=");
      expect(runHook(sandbox, { event: "SubagentStart", input })).toContain(
        "fixture-all=",
      );
      expect(runHook(sandbox, { event: "SubagentStart", input })).toContain(
        "fixture-all=",
      );
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it("should activate after unrelated input and preserve distinct session deliveries", () => {
    const sandbox = createSandbox();
    try {
      expect(
        runHook(sandbox, {
          input: { session_id: "first", prompt: "What is 2 plus 2?" },
        }),
      ).toBe("");
      expect(
        runHook(sandbox, {
          input: { session_id: "first", prompt: "/fixture:build" },
        }),
      ).toContain("fixture-all=");
      expect(
        runHook(sandbox, {
          input: { session_id: "second", prompt: "/fixture:build" },
        }),
      ).toContain("fixture-all=");
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });
});

function createSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "native domain "));
  const pluginRoot = join(root, "cache", "alvis", "fixture-plugin", "1.0.0");
  const essentialRoot = join(root, "cache", "alvis", "essential", "1.0.0");
  mkdirSync(join(pluginRoot, "hooks"), { recursive: true });
  mkdirSync(join(pluginRoot, "scripts"), { recursive: true });
  mkdirSync(join(essentialRoot, "scripts"), { recursive: true });
  for (const harness of ["claude", "codex", "grok"]) {
    mkdirSync(join(essentialRoot, `.${harness}-plugin`), { recursive: true });
    writeFileSync(
      join(essentialRoot, `.${harness}-plugin/plugin.json`),
      JSON.stringify({ name: "essential" }),
    );
  }
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
    join(essentialRoot, "scripts/domain-context.ts"),
  );
  writeFileSync(
    join(pluginRoot, "hooks/context.json"),
    JSON.stringify({
      request_patterns: ["/fixture:"],
      tool_patterns: [],
      agent_patterns: [],
    }),
  );
  writeFileSync(
    join(pluginRoot, "hooks/ALLAGENT.md"),
    "fixture-all={{PLUGIN_DIR}}\n",
  );
  mkdirSync(join(root, ".claude/plugins"), { recursive: true });
  writeFileSync(
    join(root, ".claude/plugins/installed_plugins.json"),
    JSON.stringify({
      plugins: {
        "fixture-plugin@alvis": [{ installPath: pluginRoot }],
        "essential@alvis": [{ installPath: essentialRoot }],
      },
    }),
  );
  return { root, pluginRoot };
}

function runHook(sandbox: Sandbox, params: HookParams): string {
  const {
    event = "UserPromptSubmit",
    payloadName = "ALLAGENT",
    rootVariable = "PLUGIN_ROOT",
    alias = false,
    input,
  } = params;
  const result = spawnSync(
    "bash",
    ["-c", params.command ?? nativeDomainPayloadCommand(event, payloadName)],
    {
      cwd: sandbox.root,
      encoding: "utf8",
      input: JSON.stringify(input),
      env: {
        PATH: process.env.PATH,
        TMPDIR: sandbox.root,
        HOME: sandbox.root,
        CLAUDE_PLUGIN_ROOT: alias
          ? join(sandbox.root, "wrong alias")
          : undefined,
        [rootVariable]: sandbox.pluginRoot,
      },
    },
  );
  expect(result.status, result.stderr).toBe(0);
  if (!result.stdout) return "";
  return JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
}
