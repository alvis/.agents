import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const here = import.meta.dirname;
const pluginRoot = resolve(here, "../..");
const hooks = JSON.parse(
  readFileSync(resolve(pluginRoot, "hooks/hooks.json"), "utf8"),
) as {
  hooks: { Stop: readonly { hooks: readonly { command: string }[] }[] };
};
const stopCommand = hooks.hooks.Stop.flatMap(({ hooks: entries }) => entries)
  .find(({ command }) => command.includes("validate-plan-stop"))!.command;
const sessionId = "session-current";
const turnId = "turn-current";
const validPlan = `<proposed_plan>
# T3 plan validation

## Goal

Validate one plan.

## Requirements

- Return corrective feedback.

## Boundary

Only the Essential hooks change.

## Direction

Validate the current turn at Stop.

## Context

The plan tool is not called.
</proposed_plan>`;

function createAssistantMessage(
  messageTurnId: string,
  text: string,
  phase = "final_answer",
): string {
  return JSON.stringify({
    type: "response_item",
    payload: {
      content: [{ text, type: "output_text" }],
      internal_chat_message_metadata_passthrough: {
        turn_id: messageTurnId,
      },
      phase,
      role: "assistant",
      type: "message",
    },
  });
}

function runHook({
  active = false,
  environment = "codex",
  lines = [createAssistantMessage(turnId, validPlan)],
  permissionMode = "bypassPermissions",
  lastAssistantMessage,
  runtimeRoot,
  transcriptPath,
}: {
  readonly active?: boolean;
  readonly environment?: "claude" | "codex" | "grok";
  readonly lines?: readonly string[];
  readonly permissionMode?: string;
  readonly lastAssistantMessage?: string;
  readonly runtimeRoot?: string;
  readonly transcriptPath?: string;
} = {}): ReturnType<typeof spawnSync> {
  const ownsRoot = runtimeRoot === undefined;
  const root = runtimeRoot ?? mkdtempSync(resolve(tmpdir(), "validate-plan-stop-"));
  try {
    const transcript = transcriptPath ?? resolve(root, "transcript.jsonl");
    if (transcriptPath === undefined)
      writeFileSync(transcript, `${lines.join("\n")}\n`);

    const environmentVariables = { ...process.env };
    delete environmentVariables.CLAUDE_PLUGIN_ROOT;
    delete environmentVariables.PLUGIN_ROOT;
    delete environmentVariables.GROK_PLUGIN_ROOT;
    environmentVariables.TMPDIR = root;
    environmentVariables[
      environment === "claude"
        ? "CLAUDE_PLUGIN_ROOT"
        : environment === "grok"
          ? "GROK_PLUGIN_ROOT"
          : "PLUGIN_ROOT"
    ] = pluginRoot;

    return spawnSync("/bin/bash", ["-c", stopCommand], {
      encoding: "utf8",
      env: environmentVariables,
      input: JSON.stringify({
        last_assistant_message: lastAssistantMessage,
        hook_event_name: "Stop",
        permission_mode: permissionMode,
        session_id: sessionId,
        stop_hook_active: active,
        transcript_path: transcript,
        turn_id: turnId,
      }),
    });
  } finally {
    if (ownsRoot) rmSync(root, { recursive: true, force: true });
  }
}

function parseHookOutput(
  result: ReturnType<typeof spawnSync>,
): Record<string, unknown> {
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout!) as Record<string, unknown>;
}

describe("Codex plan Stop validator", () => {
  it("should allow a valid plan from the current turn", () => {
    const result = runHook();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("should return the existing heading feedback", () => {
    const result = runHook({
      lines: [
        createAssistantMessage(
          turnId,
          "<proposed_plan>\n## Context\n\nIncomplete.\n</proposed_plan>",
        ),
      ],
    });
    const decision = parseHookOutput(result);
    expect(decision.decision).toBe("block");
    expect(decision.reason).toContain(
      "missing headings: Goal, Requirements, Boundary, Direction.",
    );
  });

  it.each([
    ["unclosed", "<proposed_plan>\n## Goal\n"],
    ["reversed", `</proposed_plan>\n${validPlan.slice(0, -17)}`],
    ["multiple", `${validPlan}\n${validPlan}`],
  ])("should reject a %s plan envelope", (_name, text) => {
    const decision = parseHookOutput(
      runHook({ lines: [createAssistantMessage(turnId, text)] }),
    );
    expect(decision.decision).toBe("block");
    expect(decision.reason).toContain(
      "exactly one complete <proposed_plan> block",
    );
  });

  it("should use the newest plan for the current turn only", () => {
    const incomplete =
      "<proposed_plan>\n## Context\n\nIncomplete.\n</proposed_plan>";
    const result = runHook({
      lines: [
        createAssistantMessage(turnId, incomplete),
        createAssistantMessage(turnId, validPlan),
        createAssistantMessage("turn-other", incomplete),
      ],
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("should allow an ordinary response newer than the current turn plan", () => {
    const result = runHook({
      permissionMode: "plan",
      lines: [
        createAssistantMessage(turnId, "<proposed_plan>"),
        createAssistantMessage(turnId, "The requested explanation is complete."),
      ],
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("should validate the direct response before a valid transcript plan", () => {
    const decision = parseHookOutput(
      runHook({ lastAssistantMessage: "<proposed_plan>" }),
    );
    expect(decision.decision).toBe("block");
  });

  it("should accept a direct plan without reading an unavailable transcript", () => {
    const result = runHook({
      permissionMode: "plan",
      lastAssistantMessage: validPlan,
      transcriptPath: "/private/unavailable/transcript.jsonl",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("should ignore malformed commentary after the current final response", () => {
    const result = runHook({
      permissionMode: "plan",
      lines: [
        createAssistantMessage(turnId, validPlan),
        createAssistantMessage(turnId, "<proposed_plan>", "commentary"),
      ],
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("should report missing current response without borrowing another turn's plan", () => {
    const decision = parseHookOutput(
      runHook({
        permissionMode: "plan",
        lines: [createAssistantMessage("turn-previous", "<proposed_plan>")],
      }),
    );
    expect(decision).toEqual({
      systemMessage: expect.stringContaining("Plan validation is unavailable"),
    });
  });

  it("should allow an inline explanation of plan delimiters", () => {
    const result = runHook({
      lastAssistantMessage: "The `<proposed_plan>` delimiter starts a plan.",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("should allow an incomplete plan example inside a code fence", () => {
    const result = runHook({
      lastAssistantMessage: "Example:\n```markdown\n<proposed_plan>\n## Goal\n```",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("should stop visibly when the permitted retry is still invalid", () => {
    const root = mkdtempSync(resolve(tmpdir(), "validate-plan-stop-retry-"));
    try {
      const first = parseHookOutput(
        runHook({
          lines: [createAssistantMessage(turnId, "<proposed_plan>")],
          runtimeRoot: root,
        }),
      );
      expect(first.decision).toBe("block");
      const decision = parseHookOutput(
        runHook({
          active: true,
          lines: [createAssistantMessage(turnId, "<proposed_plan>")],
          runtimeRoot: root,
        }),
      );
      expect(decision.continue).toBe(false);
      expect(decision.stopReason).toContain("Plan validation still failed");
      expect(decision.systemMessage).toBe(decision.stopReason);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("should not spend its retry on the stop-first continuation", () => {
    const root = mkdtempSync(resolve(tmpdir(), "validate-plan-stop-shared-"));
    try {
      const environmentVariables = {
        ...process.env,
        PLUGIN_ROOT: pluginRoot,
        TMPDIR: root,
      };
      delete environmentVariables.CLAUDE_PLUGIN_ROOT;
      delete environmentVariables.GROK_PLUGIN_ROOT;
      const reminder = spawnSync(
        "/bin/bash",
        [resolve(here, "stop-first"), resolve(pluginRoot, "hooks/STOP.md")],
        {
          encoding: "utf8",
          env: environmentVariables,
          input: JSON.stringify({
            hook_event_name: "Stop",
            permission_mode: "plan",
            session_id: sessionId,
            stop_hook_active: false,
            turn_id: turnId,
          }),
        },
      );
      expect(parseHookOutput(reminder).decision).toBe("block");

      const firstPlanDecision = parseHookOutput(
        runHook({
          active: true,
          lines: [createAssistantMessage(turnId, "<proposed_plan>")],
          runtimeRoot: root,
        }),
      );
      expect(firstPlanDecision.decision).toBe("block");

      const retryDecision = parseHookOutput(
        runHook({
          active: true,
          lines: [createAssistantMessage(turnId, "<proposed_plan>")],
          runtimeRoot: root,
        }),
      );
      expect(retryDecision.continue).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("should report an unavailable transcript without exposing its path", () => {
    const transcriptPath = "/private/unavailable/codex-transcript.jsonl";
    const decision = parseHookOutput(runHook({ transcriptPath }));
    expect(decision).toEqual({
      systemMessage: expect.stringContaining("Plan validation is unavailable"),
    });
    expect(decision.systemMessage).not.toContain(transcriptPath);
  });

  it("should report malformed transcript JSON as unavailable", () => {
    const decision = parseHookOutput(runHook({ lines: ["not json"] }));
    expect(decision).toEqual({
      systemMessage: expect.stringContaining("Plan validation is unavailable"),
    });
  });

  it.each([
    ["claude", "plan"],
    ["grok", "plan"],
    ["codex", "default"],
  ] as const)(
    "should do nothing under %s in %s mode",
    (environment, permissionMode) => {
      const result = runHook({ environment, permissionMode });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe("");
    },
  );

});
