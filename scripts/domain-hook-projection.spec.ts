import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { projectDomainHooks } from "./domain-hook-projection.ts";

interface HookSource {
  readonly hooks: Record<
    string,
    { matcher?: string; hooks: { command: string }[] }[]
  >;
}

describe("fn:projectDomainHooks", () => {
  it("should derive registrations that execute the current canonical runtime", () => {
    const root = mkdtempSync(join(tmpdir(), "domain projection "));
    try {
      const canonical = join(
        root,
        "plugins/essential/scripts/domain-context.ts",
      );
      const pluginRoot = join(root, "plugins/fixture");
      mkdirSync(join(root, "plugins/essential/scripts"), { recursive: true });
      mkdirSync(join(root, "plugins/essential/.codex-plugin"), {
        recursive: true,
      });
      mkdirSync(join(pluginRoot, "hooks"), { recursive: true });
      mkdirSync(join(pluginRoot, "scripts"), { recursive: true });
      writeFileSync(
        join(root, "plugins/essential/.codex-plugin/plugin.json"),
        JSON.stringify({ name: "essential" }),
      );
      const resolver = join(pluginRoot, "scripts/plugin-root");
      writeFileSync(
        resolver,
        readFileSync(join(import.meta.dirname, "plugin-root")),
      );
      chmodSync(resolver, 0o755);
      writeFileSync(
        join(pluginRoot, "hooks/context.json"),
        JSON.stringify({
          request_patterns: ["fixture"],
          tool_patterns: [],
          agent_patterns: [],
        }),
      );
      writeFileSync(join(pluginRoot, "hooks/ALLAGENT.md"), "fixture\n");
      writeFileSync(
        join(pluginRoot, "hooks/hooks.json"),
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                matcher: "protected",
                hooks: [{ type: "command", command: "exit 73" }],
              },
              {
                matcher: ".*",
                hooks: [
                  {
                    type: "command",
                    command: "bun /hooks/scripts/domain-context.js",
                  },
                ],
              },
            ],
          },
        }),
      );

      for (const marker of ["first", "revised"]) {
        const source = `export function runNativeDomainHook(root, event, payload) {\n  process.stdout.write(JSON.stringify([${JSON.stringify(marker)}, root, event, payload]));\n}\nif (import.meta.main) runNativeDomainHook(process.argv[2], process.argv[3], process.argv[4]);\n`;
        writeFileSync(canonical, source);
        expect(projectDomainHooks(root)).toEqual([
          join(pluginRoot, "hooks/hooks.json"),
        ]);
        const hooks = JSON.parse(
          readFileSync(join(pluginRoot, "hooks/hooks.json"), "utf8"),
        ) as HookSource;
        const commands = hooks.hooks.SessionStart.flatMap(
          (entry) => entry.hooks,
        ).filter(({ command }) =>
          command.includes("/scripts/domain-context.ts"),
        );

        for (const registrations of Object.values(hooks.hooks)) {
          for (const registration of registrations.filter((entry) =>
            entry.hooks.some(({ command }) =>
              command.includes("/scripts/domain-context.ts"),
            ),
          )) {
            expect(registration.matcher).toBe("*");
          }
        }
        expect(JSON.stringify(hooks)).not.toContain("domain-context.js");
        expect(
          existsSync(join(pluginRoot, "hooks/scripts/domain-context.ts")),
        ).toBe(false);

        const outputs = commands.map(({ command }) => {
          expect(command).not.toContain(source);
          const result = spawnSync("bash", ["-c", command], {
            encoding: "utf8",
            env: { PATH: process.env.PATH, PLUGIN_ROOT: pluginRoot },
          });
          expect(result.status, result.stderr).toBe(0);
          return JSON.parse(result.stdout);
        });
        expect(outputs).toEqual([
          [marker, pluginRoot, "SessionStart", "ALLAGENT"],
        ]);
        const protectedHook = hooks.hooks.PreToolUse.flatMap(
          (entry) => entry.hooks,
        ).find(({ command }) => command === "exit 73");
        expect(spawnSync("bash", ["-c", protectedHook!.command]).status).toBe(
          73,
        );
        const projected = readFileSync(
          join(pluginRoot, "hooks/hooks.json"),
          "utf8",
        );
        projectDomainHooks(root);
        expect(readFileSync(join(pluginRoot, "hooks/hooks.json"), "utf8")).toBe(
          projected,
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
