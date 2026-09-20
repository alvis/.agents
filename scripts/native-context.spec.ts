import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

interface HookSource {
  readonly hooks: Readonly<
    Record<
      string,
      readonly {
        readonly hooks: readonly { readonly command: string }[];
      }[]
    >
  >;
}

interface DeliveryParams {
  readonly plugin: string;
  readonly event: string;
  readonly audience: string;
  readonly input: string;
  readonly rootVariable: string;
  readonly compatibilityAlias: boolean;
  readonly suppress: boolean;
}

const repository = resolve(import.meta.dirname, "..");
const harnessEnvironments = [
  {
    harness: "claude",
    rootVariable: "CLAUDE_PLUGIN_ROOT",
    compatibilityAlias: false,
  },
  { harness: "codex", rootVariable: "PLUGIN_ROOT", compatibilityAlias: false },
  {
    harness: "grok",
    rootVariable: "GROK_PLUGIN_ROOT",
    compatibilityAlias: false,
  },
  {
    harness: "codex with compatibility alias",
    rootVariable: "PLUGIN_ROOT",
    compatibilityAlias: true,
  },
  {
    harness: "grok with compatibility alias",
    rootVariable: "GROK_PLUGIN_ROOT",
    compatibilityAlias: true,
  },
] as const;

describe("native lifecycle context without installed specialists", () => {
  for (const plugin of readdirSync(join(repository, "plugins"))) {
    const path = join(repository, "plugins", plugin, "hooks/hooks.json");
    if (!existsSync(path)) continue;
    const hooks = JSON.parse(readFileSync(path, "utf8")) as HookSource;
    for (const event of ["SessionStart", "SubagentStart"]) {
      const audiences = new Set(
        hooks.hooks[event]
          ?.flatMap((entry) => entry.hooks)
          .flatMap(({ command }) =>
            [
              ...command.matchAll(
                /\/hooks\/(ALLAGENT|MAINAGENT|SUBAGENT)\.md/g,
              ),
            ].map((match) => match[1]!),
          ),
      );
      for (const audience of audiences) {
        it.each(["startup", "resume"])(
          `should execute ${plugin} ${event} ${audience} on %s`,
          (source) => {
            assertDelivery({
              plugin,
              event,
              audience,
              input: JSON.stringify({ source }),
              rootVariable: "PLUGIN_ROOT",
              compatibilityAlias: false,
              suppress: event === "SessionStart" && source === "resume",
            });
          },
        );
      }
    }
  }

  for (const source of ["startup", "clear", "resume", "compact"]) {
    it.each(harnessEnvironments)(
      `should route ${source} main context under $harness`,
      ({ rootVariable, compatibilityAlias }) => {
        assertDelivery({
          plugin: "essential",
          event: "SessionStart",
          audience: "MAINAGENT",
          input: JSON.stringify({ source }),
          rootVariable,
          compatibilityAlias,
          suppress: source === "resume" || source === "compact",
        });
      },
    );
  }

  it.each([
    '{"source":"future"}',
    '{"source":null}',
    '{"source":["resume"]}',
    '{"source":false}',
    '{"source":42}',
    "{}",
    "null",
    "[]",
    '{"source":"resume"}\n{}',
    "{",
    "",
  ])(
    "should retain startup context for unknown or malformed input %s",
    (input) => {
      assertDelivery({
        plugin: "essential",
        event: "SessionStart",
        audience: "MAINAGENT",
        input,
        rootVariable: "PLUGIN_ROOT",
        compatibilityAlias: false,
        suppress: false,
      });
    },
  );

  it.each(["startup", "clear", "resume", "compact"])(
    "should route shared Essential context on %s",
    (source) => {
      assertDelivery({
        plugin: "essential",
        event: "SessionStart",
        audience: "ALLAGENT",
        input: JSON.stringify({ source }),
        rootVariable: "PLUGIN_ROOT",
        compatibilityAlias: false,
        suppress: source === "resume" || source === "compact",
      });
    },
  );

  it.each(["startup", "clear", "resume", "compact"])(
    "should preserve child context regardless of parent source %s",
    (source) => {
      assertDelivery({
        plugin: "essential",
        event: "SubagentStart",
        audience: "SUBAGENT",
        input: JSON.stringify({ source }),
        rootVariable: "PLUGIN_ROOT",
        compatibilityAlias: false,
        suppress: false,
      });
    },
  );

  it.each(["startup", "clear", "resume", "compact"])(
    "should reject missing plugin roots on %s",
    (source) => {
      for (const command of payloadCommands(
        "essential",
        "SessionStart",
        "ALLAGENT",
      )) {
        const result = spawnSync("bash", ["-c", command], {
          encoding: "utf8",
          input: JSON.stringify({ source }),
          env: { PATH: process.env.PATH },
        });

        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe("");
      }
    },
  );
});

function assertDelivery(params: DeliveryParams): void {
  const {
    plugin,
    event,
    audience,
    input,
    rootVariable,
    compatibilityAlias,
    suppress,
  } = params;
  const root = mkdtempSync(join(tmpdir(), "native context "));
  try {
    const pluginRoot = join(root, "plugin root");
    mkdirSync(join(pluginRoot, "hooks"), { recursive: true });
    writeFileSync(
      join(pluginRoot, `hooks/${audience}.md`),
      "marker={{PLUGIN_DIR}}\n",
    );
    const outputs = payloadCommands(plugin, event, audience)
      .map((command) => {
        const result = spawnSync("bash", ["-c", command], {
          encoding: "utf8",
          input,
          env: {
            PATH: process.env.PATH,
            HOME: join(root, "empty home"),
            CODEX_HOME: join(root, "absent codex"),
            CLAUDE_CONFIG_DIR: join(root, "absent claude"),
            GROK_HOME: join(root, "absent grok"),
            CLAUDE_PLUGIN_ROOT: compatibilityAlias
              ? join(root, "wrong compatibility root")
              : undefined,
            [rootVariable]: pluginRoot,
          },
        });
        expect(result.status, result.stderr).toBe(0);
        return result.stdout;
      })
      .filter((output) => output !== "");

    expect(outputs.map((output) => JSON.parse(output))).toEqual(
      suppress
        ? []
        : [
            {
              hookSpecificOutput: {
                hookEventName: event,
                additionalContext: `marker=${pluginRoot}\n`,
              },
            },
          ],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function payloadCommands(
  plugin: string,
  event: string,
  audience: string,
): readonly string[] {
  const hooks = JSON.parse(
    readFileSync(
      join(repository, "plugins", plugin, "hooks/hooks.json"),
      "utf8",
    ),
  ) as HookSource;
  const commands = hooks.hooks[event]
    ?.flatMap((entry) => entry.hooks)
    .filter((hook) => hook.command.includes(`/hooks/${audience}.md`))
    .map((hook) => hook.command);
  if (!commands?.length)
    throw new Error(`missing ${plugin} ${audience} context command`);
  return commands;
}
