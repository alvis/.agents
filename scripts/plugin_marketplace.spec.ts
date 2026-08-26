import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertSupportedTestRuntime,
  createTemporaryDirectory,
  MINIMUM_NODE_MAJOR,
  removeTemporaryDirectory,
} from "./test-support.ts";
import { HARNESS_ROOT_VARIABLES } from "./harness_contract.ts";

const root = join(import.meta.dirname, "..");
const claudeCatalogPath = join(root, ".claude-plugin", "marketplace.json");
const essentialPluginDirectory = resolve(root, "plugins/essential");
const stopHookScript = join(
  essentialPluginDirectory,
  "hooks/scripts/stop-first",
);
const stopHookPayload = join(essentialPluginDirectory, "hooks/STOP.md");

function runStopHook(
  environment: NodeJS.ProcessEnv,
  input: string,
): ReturnType<typeof spawnSync> {
  return spawnSync("/bin/bash", [stopHookScript, stopHookPayload], {
    encoding: "utf8",
    env: environment,
    input,
  });
}

interface ClaudePlugin {
  readonly name: string;
  readonly source: string;
}
interface HookEntry {
  readonly hooks: readonly {
    readonly command: string;
    readonly type: string;
  }[];
}

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
function claudePlugins(): ClaudePlugin[] {
  return json<{ plugins: ClaudePlugin[] }>(claudeCatalogPath).plugins;
}
function hookCommands(
  document: Record<string, readonly HookEntry[]>,
  event: string,
): string[] {
  return (document[event] ?? []).flatMap(({ hooks }) =>
    hooks.map(({ command }) => command),
  );
}
async function projectionSandbox() {
  const directory = await createTemporaryDirectory("projections-");
  mkdirSync(join(directory, ".claude-plugin"), { recursive: true });
  cpSync(
    claudeCatalogPath,
    join(directory, ".claude-plugin", "marketplace.json"),
  );
  mkdirSync(join(directory, "scripts"), { recursive: true });
  cpSync(
    join(root, "scripts/generate_marketplace_projections.ts"),
    join(directory, "scripts", "generate_marketplace_projections.ts"),
  );
  return {
    directory,
    run: (args: readonly string[]) =>
      spawnSync(
        "bun",
        [
          "run",
          join(directory, "scripts", "generate_marketplace_projections.ts"),
          ...args,
        ],
        { encoding: "utf8", cwd: directory },
      ),
  };
}
function cleanHarnessEnvironment(
  variable?: string,
  value?: string,
): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const name of HARNESS_ROOT_VARIABLES) delete environment[name];
  if (variable !== undefined) environment[variable] = value;
  return environment;
}

describe("marketplace projections", () => {
  it("should fail loudly when the test runtime is too old", () => {
    expect(() => assertSupportedTestRuntime("19.9.0")).toThrow(
      `this suite needs Node ${MINIMUM_NODE_MAJOR}+ but Vitest is running on 19.9.0`,
    );
    expect(() =>
      assertSupportedTestRuntime(`${MINIMUM_NODE_MAJOR}.0.0`),
    ).not.toThrow();
  });
  it("should generate valid deterministic marketplace structures", async () => {
    const sandbox = await projectionSandbox();
    try {
      expect(sandbox.run([]).status).toBe(0);
      const codexPath = join(
        sandbox.directory,
        ".agents",
        "plugins",
        "marketplace.json",
      );
      const grokPath = join(
        sandbox.directory,
        ".grok-plugin",
        "marketplace.json",
      );
      const firstCodex = readFileSync(codexPath, "utf8");
      const firstGrok = readFileSync(grokPath, "utf8");
      const codex = JSON.parse(firstCodex) as {
        readonly interface: { readonly displayName: unknown };
        readonly name: unknown;
        readonly plugins: readonly {
          readonly category: unknown;
          readonly name: unknown;
          readonly policy: {
            readonly authentication: unknown;
            readonly installation: unknown;
          };
          readonly source: { readonly path: unknown; readonly source: unknown };
        }[];
      };
      const grok = JSON.parse(firstGrok) as {
        readonly description: unknown;
        readonly name: unknown;
        readonly owner: { readonly name: unknown };
        readonly plugins: readonly {
          readonly name: unknown;
          readonly source: { readonly path: unknown; readonly type: unknown };
        }[];
      };

      expect(codex.plugins.length).toBeGreaterThan(0);
      expect(grok.plugins.length).toBeGreaterThan(0);
      expect(codex.name).toBeTypeOf("string");
      expect(codex.name).not.toBe("");
      expect(codex.interface.displayName).toBeTypeOf("string");
      expect(codex.interface.displayName).not.toBe("");
      for (const plugin of codex.plugins) {
        expect(plugin.category).toBeTypeOf("string");
        expect(plugin.category).not.toBe("");
        expect(plugin.name).toBeTypeOf("string");
        expect(plugin.name).not.toBe("");
        expect(plugin.policy.authentication).toBe("ON_INSTALL");
        expect(plugin.policy.installation).toBe("AVAILABLE");
        expect(plugin.source.path).toBeTypeOf("string");
        expect(plugin.source.path).not.toBe("");
        expect(plugin.source.source).toBe("local");
      }
      for (const plugin of grok.plugins) {
        expect(plugin.name).toBeTypeOf("string");
        expect(plugin.name).not.toBe("");
        expect(plugin.source.path).toBeTypeOf("string");
        expect(plugin.source.path).not.toBe("");
        expect(plugin.source.type).toBe("local");
      }
      expect(grok.description).toBeTypeOf("string");
      expect(grok.description).not.toBe("");
      expect(grok.name).toBeTypeOf("string");
      expect(grok.name).not.toBe("");
      expect(grok.owner.name).toBeTypeOf("string");
      expect(grok.owner.name).not.toBe("");
      expect(new Set(codex.plugins.map(({ name }) => name)).size).toBe(
        codex.plugins.length,
      );
      expect(new Set(grok.plugins.map(({ name }) => name)).size).toBe(
        grok.plugins.length,
      );
      expect(codex.name).toBe(grok.name);
      expect(codex.interface.displayName).toBe(grok.owner.name);
      expect(codex.plugins.map(({ name }) => name).sort()).toEqual(
        grok.plugins.map(({ name }) => name).sort(),
      );

      expect(sandbox.run([]).status).toBe(0);
      expect(readFileSync(codexPath, "utf8")).toBe(firstCodex);
      expect(readFileSync(grokPath, "utf8")).toBe(firstGrok);
      expect(sandbox.run(["--check"]).status).toBe(0);
    } finally {
      await removeTemporaryDirectory(sandbox.directory);
    }
  });

  it("should fail generator --check with exit 2 when a projection is stale", async () => {
    const sandbox = await projectionSandbox();
    try {
      expect(sandbox.run([]).status).toBe(0);
      writeFileSync(
        join(sandbox.directory, ".grok-plugin", "marketplace.json"),
        "{}\n",
      );
      writeFileSync(
        join(sandbox.directory, ".agents", "plugins", "marketplace.json"),
        "",
      );
      const check = sandbox.run(["--check"]);
      expect(check.status).toBe(2);
      expect(check.stderr).toContain(
        "Grok Build marketplace projection is stale",
      );
      expect(check.stderr).toContain("Codex marketplace projection is stale");
      expect(sandbox.run([]).status).toBe(0);
      expect(sandbox.run(["--check"]).status).toBe(0);
    } finally {
      await removeTemporaryDirectory(sandbox.directory);
    }
  });

  it("should fail generator --check when a generated projection is missing", async () => {
    const sandbox = await projectionSandbox();
    try {
      expect(sandbox.run([]).status).toBe(0);
      rmSync(
        join(sandbox.directory, ".agents", "plugins", "marketplace.json"),
      );

      const check = sandbox.run(["--check"]);

      expect(check.status).toBe(2);
      expect(check.stderr).toContain("Codex marketplace projection is stale");
    } finally {
      await removeTemporaryDirectory(sandbox.directory);
    }
  });
});

describe("shared hook contracts", () => {
  const pluginsWithHooks = claudePlugins().filter(({ source }) =>
    existsSync(join(root, source, "hooks/hooks.json")),
  );

  it("should replace every plugin directory placeholder", () => {
    for (const plugin of pluginsWithHooks) {
      const directory = resolve(root, plugin.source);
      const hooks = json<{ hooks: Record<string, readonly HookEntry[]> }>(
        join(directory, "hooks/hooks.json"),
      ).hooks;
      for (const event of Object.keys(hooks))
        for (const command of hookCommands(hooks, event).filter((value) =>
          value.includes("/hooks/"),
        )) {
          const result = spawnSync("/bin/sh", ["-c", command], {
            encoding: "utf8",
            env: cleanHarnessEnvironment("CLAUDE_PLUGIN_ROOT", directory),
            input: JSON.stringify({ hook_event_name: event }),
          });
          expect(result.status).toBe(0);
          expect(result.stdout).not.toContain("{{PLUGIN_DIR}}");
        }
    }
  });

  it.each(HARNESS_ROOT_VARIABLES)("should emit context with %s", (variable) => {
    for (const plugin of pluginsWithHooks) {
      const directory = resolve(root, plugin.source);
      const hooks = json<{ hooks: Record<string, readonly HookEntry[]> }>(
        join(directory, "hooks/hooks.json"),
      ).hooks;
      for (const event of Object.keys(hooks))
        for (const command of hookCommands(hooks, event).filter((value) =>
          value.includes("/hooks/ALLAGENT.md"),
        )) {
          const result = spawnSync("/bin/sh", ["-c", command], {
            encoding: "utf8",
            env: cleanHarnessEnvironment(variable, directory),
            input: JSON.stringify({ hook_event_name: event, tool_input: {} }),
          });
          expect(result.status).toBe(0);
          expect(
            JSON.parse(result.stdout).hookSpecificOutput.additionalContext,
          ).not.toBe("");
        }
    }
  });

  it("should fail loudly under an unrecognized harness", () => {
    for (const plugin of pluginsWithHooks) {
      const hooks = json<{ hooks: Record<string, readonly HookEntry[]> }>(
        join(root, plugin.source, "hooks/hooks.json"),
      ).hooks;
      for (const event of Object.keys(hooks))
        for (const command of hookCommands(hooks, event)) {
          const result = spawnSync("/bin/sh", ["-c", command], {
            encoding: "utf8",
            env: cleanHarnessEnvironment(),
            input: JSON.stringify({ hook_event_name: event }),
          });
          expect(result.status).not.toBe(0);
          expect(result.stdout).toBe("");
          expect(result.stderr).toContain("plugin root unset");
        }
    }
  });

  it("should execute every hook from a plugin path containing a space", async () => {
    const temporary = await createTemporaryDirectory("hook-space-");
    try {
      for (const plugin of pluginsWithHooks) {
        const installed = join(temporary, "with space", plugin.name);
        mkdirSync(join(temporary, "with space"), { recursive: true });
        cpSync(resolve(root, plugin.source), installed, { recursive: true });
        const hooks = json<{ hooks: Record<string, readonly HookEntry[]> }>(
          join(installed, "hooks/hooks.json"),
        ).hooks;
        for (const event of Object.keys(hooks))
          for (const command of hookCommands(hooks, event).filter((value) =>
            value.includes("/hooks/ALLAGENT.md"),
          )) {
            const result = spawnSync("/bin/sh", ["-c", command], {
              encoding: "utf8",
              env: cleanHarnessEnvironment("CLAUDE_PLUGIN_ROOT", installed),
              input: JSON.stringify({ hook_event_name: event }),
            });
            expect(result.status).toBe(0);
            expect(
              JSON.parse(result.stdout).hookSpecificOutput.additionalContext,
            ).not.toBe("");
          }
      }
    } finally {
      await removeTemporaryDirectory(temporary);
    }
  });

  it.each(HARNESS_ROOT_VARIABLES)(
    "should remind once per session at Stop under %s",
    async (variable) => {
      // A one-shot Stop reminder must fire on the session's first stop only: a
      // later stop stays silent, the re-fire a block itself triggers — arriving
      // with stop_hook_active set — stays silent without spending the session's
      // one shot, and every session keeps its own shot. Malformed input
      // identifies neither a session nor its turn state, so it stays silent.
      const temporary = await createTemporaryDirectory("stop-once-");
      try {
        const environment = cleanHarnessEnvironment(
          variable,
          essentialPluginDirectory,
        );
        environment.TMPDIR = temporary;
        const stop = (payload: Record<string, unknown>) =>
          runStopHook(environment, JSON.stringify(payload));

        const first = stop({
          hook_event_name: "Stop",
          session_id: "essential-s1",
          stop_hook_active: false,
        });
        const firstDecision = JSON.parse(first.stdout!);
        expect(first.status).toBe(0);
        expect(firstDecision.decision).toBe("block");
        expect(firstDecision.reason).toContain(".state");

        const second = stop({
          hook_event_name: "Stop",
          session_id: "essential-s1",
          stop_hook_active: false,
        });
        expect(second.status).toBe(0);
        expect(second.stdout).toBe("");

        const interrupted = stop({
          hook_event_name: "Stop",
          session_id: "essential-s2",
          stop_hook_active: true,
        });
        expect(interrupted.status).toBe(0);
        expect(interrupted.stdout).toBe("");

        const afterInterrupted = stop({
          hook_event_name: "Stop",
          session_id: "essential-s2",
          stop_hook_active: false,
        });
        expect(afterInterrupted.status).toBe(0);
        expect(JSON.parse(afterInterrupted.stdout!).decision).toBe("block");

        const malformed = runStopHook(environment, "not json");
        expect(malformed.status).toBe(0);
        expect(malformed.stdout).toBe("");
      } finally {
        await removeTemporaryDirectory(temporary);
      }
    },
  );
});
