import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { nativeDomainPayloadCommand } from "./harness_contract.ts";

interface HookCommand {
  readonly type: string;
  readonly command: string;
}

interface HookRegistration {
  readonly matcher?: string;
  readonly hooks: readonly HookCommand[];
}

interface HookConfiguration {
  readonly hooks: Record<string, readonly HookRegistration[]>;
}

/**
 * regenerates native domain registrations that invoke Essential's canonical runtime
 * @param repositoryRoot marketplace source root
 * @returns all generated paths
 */
export function projectDomainHooks(repositoryRoot: string): readonly string[] {
  const artifacts = readdirSync(join(repositoryRoot, "plugins")).flatMap(
    (plugin) => {
      const root = join(repositoryRoot, "plugins", plugin);
      if (!existsSync(join(root, "hooks/context.json"))) return [];
      const path = join(root, "hooks/hooks.json");
      const configuration: HookConfiguration = JSON.parse(
        readFileSync(path, "utf8"),
      );
      const hooks = { ...configuration.hooks };
      for (const event of [
        "SessionStart",
        "SubagentStart",
        "UserPromptSubmit",
        "PreToolUse",
        "PostToolUse",
      ]) {
        const retained = (hooks[event] ?? []).filter(
          (entry) =>
            !entry.hooks.some(
              (hook) =>
                hook.command.includes("runNativeDomainHook(") ||
                hook.command.includes("/domain-context.") ||
                hook.command.includes("/hooks/ALLAGENT.md") ||
                hook.command.includes("/hooks/MAINAGENT.md"),
            ),
        );
        const payloadNames = (
          ["SubagentStart", "PostToolUse"].includes(event)
            ? ["ALLAGENT"]
            : ["ALLAGENT", "MAINAGENT"]
        ).filter((name) => existsSync(join(root, "hooks", `${name}.md`)));
        hooks[event] = [
          ...retained,
          ...payloadNames.map((name) => ({
            matcher: "*",
            hooks: [
              {
                type: "command",
                command: nativeDomainPayloadCommand(event, name),
              },
            ],
          })),
        ];
      }
      return [
        {
          path,
          content: `${JSON.stringify({ ...configuration, hooks }, null, 2)}\n`,
        },
      ];
    },
  );
  for (const artifact of artifacts) {
    writeFileSync(artifact.path, artifact.content, "utf8");
  }
  return artifacts.map((artifact) => artifact.path);
}

if (import.meta.main) {
  const files = projectDomainHooks(
    process.argv[2] ?? resolve(import.meta.dirname, ".."),
  );
  process.stdout.write(`generated ${files.length} domain hook artifacts\n`);
}
