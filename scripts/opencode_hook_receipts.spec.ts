import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { PLUGIN_ROOT_ANCHOR, PLUGIN_ROOT_GUARD } from "./harness_contract.ts";
import { resolveHookReceipts } from "./opencode_hook_receipts.ts";
import {
  createTemporaryDirectory,
  removeTemporaryDirectory,
  writeFixture,
} from "./test-support.ts";

type JsonObject = Record<string, unknown>;

const contract = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "opencode_contract.json"), "utf8"),
) as JsonObject;

function globalHooks(
  command: string,
  event: string,
  matcher?: string,
): string {
  const registration: Record<string, unknown> = {
    hooks: [{ command, type: "command" }],
  };
  if (matcher !== undefined) registration.matcher = matcher;
  return `${JSON.stringify({ hooks: { [event]: [registration] } })}\n`;
}

function payloadCommand(
  event: string,
  payloadName: string,
  guardedLeadAgent?: string,
): string {
  const leadGuard =
    guardedLeadAgent === undefined
      ? ""
      : `if [ -n "\${PLUGIN_ROOT:-}" ] && [ ! -f "\${CODEX_HOME:-\${HOME}/.codex}/agents/${guardedLeadAgent}.toml" ]; then exit 0; fi; `;
  return `${PLUGIN_ROOT_GUARD}${leadGuard}sed "s|{{PLUGIN_DIR}}|${PLUGIN_ROOT_ANCHOR}|g" "${PLUGIN_ROOT_ANCHOR}/hooks/${payloadName}.md" | jq -Rs '{hookSpecificOutput:{hookEventName:"${event}",additionalContext:.}}'`;
}

describe("OpenCode hook receipt command validation", () => {
  it("should not require a projected agent for an unguarded MAINAGENT payload", async () => {
    const pluginRoot = await createTemporaryDirectory("opencode-hook-receipt-");
    try {
      await writeFixture(
        pluginRoot,
        "hooks/hooks.json",
        globalHooks(payloadCommand("SessionStart", "MAINAGENT"), "SessionStart"),
      );
      await writeFixture(pluginRoot, "hooks/MAINAGENT.md", "payload\n");

      const receipts = resolveHookReceipts({
        contract,
        pluginFiles: ["hooks/MAINAGENT.md", "hooks/hooks.json"],
        pluginName: "coding",
        pluginRoot,
      });

      expect(receipts).toHaveLength(1);
      expect(receipts[0]?.requirements).toEqual({});
    } finally {
      await removeTemporaryDirectory(pluginRoot);
    }
  });

  it.each([
    ["essential", "tech-lead"],
    ["web", "design-lead"],
  ])(
    "should require %s's projected agent for a guarded MAINAGENT payload",
    async (pluginName, leadAgent) => {
      const pluginRoot = await createTemporaryDirectory("opencode-hook-receipt-");
      try {
        await writeFixture(
          pluginRoot,
          "hooks/hooks.json",
          globalHooks(
            payloadCommand("SessionStart", "MAINAGENT", leadAgent),
            "SessionStart",
          ),
        );
        await writeFixture(pluginRoot, "hooks/MAINAGENT.md", "payload\n");

        const receipts = resolveHookReceipts({
          contract,
          pluginFiles: ["hooks/MAINAGENT.md", "hooks/hooks.json"],
          pluginName,
          pluginRoot,
        });

        expect(receipts).toHaveLength(1);
        expect(receipts[0]?.requirements).toEqual({
          projected_agent: leadAgent,
        });
      } finally {
        await removeTemporaryDirectory(pluginRoot);
      }
    },
  );

  it("should reject a recognized payload command with a prefix mutation", async () => {
    const pluginRoot = await createTemporaryDirectory("opencode-hook-receipt-");
    try {
      const command = `${PLUGIN_ROOT_GUARD}sed "s|{{PLUGIN_DIR}}|${PLUGIN_ROOT_ANCHOR}|g" "${PLUGIN_ROOT_ANCHOR}/hooks/ALLAGENT.md" | jq -Rs '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:.}}'`;
      await writeFixture(
        pluginRoot,
        "hooks/hooks.json",
        globalHooks(`true; ${command}`, "SessionStart"),
      );
      await writeFixture(pluginRoot, "hooks/ALLAGENT.md", "payload\n");

      expect(() =>
        resolveHookReceipts({
          contract,
          pluginFiles: ["hooks/ALLAGENT.md", "hooks/hooks.json"],
          pluginName: "fixture",
          pluginRoot,
        }),
      ).toThrow(/unsupported OpenCode hook command/);
    } finally {
      await removeTemporaryDirectory(pluginRoot);
    }
  });

  it("should reject a recognized global script with a suffix mutation", async () => {
    const pluginRoot = await createTemporaryDirectory("opencode-hook-receipt-");
    try {
      const command = `${PLUGIN_ROOT_GUARD}"${PLUGIN_ROOT_ANCHOR}/hooks/scripts/validate-question"`;
      await writeFixture(
        pluginRoot,
        "hooks/hooks.json",
        globalHooks(
          `${command}; true`,
          "PreToolUse",
          "AskUserQuestion|request_user_input|ask_user_question",
        ),
      );
      await writeFixture(pluginRoot, "hooks/scripts/validate-question", "#!/bin/sh\n");
      await writeFixture(pluginRoot, "hooks/scripts/context.sh", "#!/bin/sh\n");

      expect(() =>
        resolveHookReceipts({
          contract,
          pluginFiles: [
            "hooks/hooks.json",
            "hooks/scripts/context.sh",
            "hooks/scripts/validate-question",
          ],
          pluginName: "fixture",
          pluginRoot,
        }),
      ).toThrow(/unsupported OpenCode hook command/);
    } finally {
      await removeTemporaryDirectory(pluginRoot);
    }
  });

  it("should reject a recognized skill script with an argument mutation", async () => {
    const pluginRoot = await createTemporaryDirectory("opencode-hook-receipt-");
    try {
      const command = `bash "${PLUGIN_ROOT_ANCHOR}/skills/commit/scripts/pre-commit-hook.sh" --extra`;
      await writeFixture(
        pluginRoot,
        "skills/commit/SKILL.md",
        [
          "---",
          "name: commit",
          "hooks:",
          "  PreToolUse:",
          '    - matcher: "Bash"',
          "      hooks:",
          "        - type: command",
          `          command: ${JSON.stringify(command)}`,
          "---",
          "",
        ].join("\n"),
      );
      await writeFixture(
        pluginRoot,
        "skills/commit/scripts/pre-commit-hook.sh",
        "#!/bin/sh\n",
      );

      expect(() =>
        resolveHookReceipts({
          contract,
          pluginFiles: [
            "skills/commit/SKILL.md",
            "skills/commit/scripts/pre-commit-hook.sh",
          ],
          pluginName: "coding",
          pluginRoot,
        }),
      ).toThrow(/unsupported OpenCode hook command/);
    } finally {
      await removeTemporaryDirectory(pluginRoot);
    }
  });

  it("should reject an exact command registered under a changed matcher", async () => {
    const pluginRoot = await createTemporaryDirectory("opencode-hook-receipt-");
    try {
      const command = `${PLUGIN_ROOT_GUARD}"${PLUGIN_ROOT_ANCHOR}/hooks/scripts/validate-question"`;
      await writeFixture(
        pluginRoot,
        "hooks/hooks.json",
        globalHooks(command, "PreToolUse", "AskUserQuestion|mutated"),
      );

      expect(() =>
        resolveHookReceipts({
          contract,
          pluginFiles: ["hooks/hooks.json"],
          pluginName: "fixture",
          pluginRoot,
        }),
      ).toThrow(/unsupported OpenCode hook registration/);
    } finally {
      await removeTemporaryDirectory(pluginRoot);
    }
  });
});
