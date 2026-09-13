import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

interface HookSource {
  readonly hooks: Readonly<Record<string, readonly {
    readonly hooks: readonly { readonly command: string }[];
  }[]>>;
}

const repository = resolve(import.meta.dirname, "..");
const harnessEnvironments = [
  { harness: "claude", rootVariable: "CLAUDE_PLUGIN_ROOT", compatibilityAlias: false },
  { harness: "codex", rootVariable: "PLUGIN_ROOT", compatibilityAlias: false },
  { harness: "grok", rootVariable: "GROK_PLUGIN_ROOT", compatibilityAlias: false },
  { harness: "codex with compatibility alias", rootVariable: "PLUGIN_ROOT", compatibilityAlias: true },
  { harness: "grok with compatibility alias", rootVariable: "GROK_PLUGIN_ROOT", compatibilityAlias: true },
] as const;

describe("native startup context without installed specialists", () => {
  for (const plugin of ["essential", "web"]) {
    it.each(harnessEnvironments)(`should deliver ${plugin} main context under $harness`, ({ rootVariable, compatibilityAlias }) => {
      const root = mkdtempSync(join(tmpdir(), "native context "));
      try {
        const pluginRoot = join(root, "plugin root");
        mkdirSync(join(pluginRoot, "hooks"), { recursive: true });
        writeFileSync(join(pluginRoot, "hooks/MAINAGENT.md"), "marker={{PLUGIN_DIR}}\n");
        const hooks = JSON.parse(readFileSync(join(repository, "plugins", plugin, "hooks/hooks.json"), "utf8")) as HookSource;
        const command = hooks.hooks.SessionStart?.flatMap((entry) => entry.hooks)
          .find((hook) => hook.command.includes("/hooks/MAINAGENT.md"))?.command;
        if (command === undefined) throw new Error(`missing ${plugin} main context command`);
        const result = spawnSync("bash", ["-c", command], {
          encoding: "utf8",
          env: {
            PATH: process.env.PATH,
            HOME: join(root, "empty home"),
            CODEX_HOME: join(root, "absent codex"),
            CLAUDE_CONFIG_DIR: join(root, "absent claude"),
            GROK_HOME: join(root, "absent grok"),
            ...(compatibilityAlias ? { CLAUDE_PLUGIN_ROOT: join(root, "wrong compatibility root") } : {}),
            [rootVariable]: pluginRoot,
          },
        });

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).not.toBe("");
        expect(JSON.parse(result.stdout)).toEqual({
          hookSpecificOutput: {
            hookEventName: "SessionStart",
            additionalContext: `marker=${pluginRoot}\n`,
          },
        });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
