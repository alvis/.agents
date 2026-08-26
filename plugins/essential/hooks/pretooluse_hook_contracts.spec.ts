import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { HARNESS_ROOT_VARIABLES } from "../../../scripts/harness_contract.ts";

const plugin = resolve(import.meta.dirname, "..");
const hooks = JSON.parse(
  readFileSync(resolve(plugin, "hooks/hooks.json"), "utf8"),
) as {
  hooks: {
    PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }>;
  };
};
const questions = "AskUserQuestion|request_user_input|ask_user_question";
const plans = "ExitPlanMode|update_plan|enter_plan_mode|exit_plan_mode";
const dispatch = "Agent|spawn_agent|Task|spawn_subagent";
const matchers = [questions, plans, dispatch] as const;
const validTags = [
  "Architectural",
  "Ideal",
  "Recommended",
  "Pragmatic",
  "Hotfix",
  "Workaround",
] as const;
const teammate = "raj-tech-lead-fix-auth";
const compliantPlan = `# Enforce the documented formats

## Goal

One verifiable outcome and the bar that proves it.

## Requirements

- An observable condition the outcome must satisfy.

## Boundary

Inside: the three hook scripts. Outside: content heuristics.

## Direction

Write each check as a bash script, then swap the command entries.

## Context

- **Current state** — nothing implemented yet.
`;
const compliantPrompt = `checkout-refunds

Goal: Restore refund totals so the ledger reconciles to the cent.

Requirements:
- Every refund path reconciles against the ledger fixture.

Boundary:
- Do not touch the payment capture path.

Directions:
- The rounding helper is the likely culprit.

Context:
Path: /work/checkout-refunds

Recent work:
- Parser migration landed; consumer conversion remains — state/journal.md
`;

interface ClaudeEnvelope {
  readonly hookSpecificOutput?: {
    readonly additionalContext?: string;
    readonly permissionDecision?: string;
    readonly permissionDecisionReason?: string;
  };
}
interface GrokEnvelope {
  readonly decision?: string;
  readonly reason?: string;
}
type Envelope = ClaudeEnvelope & GrokEnvelope;

function commandFor(matcher: string): string {
  return hooks.hooks.PreToolUse.find((entry) => entry.matcher === matcher)!
    .hooks[0]!.command;
}

function harnessEnvironment(variable: string): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const name of HARNESS_ROOT_VARIABLES) delete environment[name];
  environment[variable] = plugin;
  return environment;
}

function runHookWithKey(
  key: "tool_input" | "toolInput",
  matcher: string,
  toolInput: Record<string, unknown>,
  variable: string,
): Envelope {
  const completed = spawnSync("bash", ["-c", commandFor(matcher)], {
    encoding: "utf8",
    env: harnessEnvironment(variable),
    input: JSON.stringify({ [key]: toolInput }),
  });
  expect(completed.status, completed.stderr).toBe(0);
  return JSON.parse(completed.stdout) as Envelope;
}

function runHook(
  matcher: string,
  toolInput: Record<string, unknown>,
  variable = "CLAUDE_PLUGIN_ROOT",
): Envelope {
  return runHookWithKey("tool_input", matcher, toolInput, variable);
}

function runCamelHook(
  matcher: string,
  toolInput: Record<string, unknown>,
  variable: string,
): Envelope {
  return runHookWithKey("toolInput", matcher, toolInput, variable);
}

function runHookWithVariables(
  matcher: string,
  toolInput: Record<string, unknown>,
  variables: Record<string, string>,
): Envelope {
  const environment = { ...process.env };
  for (const name of HARNESS_ROOT_VARIABLES) delete environment[name];
  Object.assign(environment, variables);
  const completed = spawnSync("bash", ["-c", commandFor(matcher)], {
    encoding: "utf8",
    env: environment,
    input: JSON.stringify({ tool_input: toolInput }),
  });
  expect(completed.status, completed.stderr).toBe(0);
  return JSON.parse(completed.stdout) as Envelope;
}

function expectAllowed(output: Envelope): void {
  expect(output.decision).toBeUndefined();
  expect(output.reason).toBeUndefined();
  expect(output.hookSpecificOutput?.permissionDecision).toBeUndefined();
  expect(output.hookSpecificOutput?.additionalContext).toBeTruthy();
}

function denialReason(output: Envelope): string {
  expect(output.decision).toBeUndefined();
  expect(output.reason).toBeUndefined();
  expect(output.hookSpecificOutput?.permissionDecision).toBe("deny");
  expect(output.hookSpecificOutput?.permissionDecisionReason).toBeTypeOf(
    "string",
  );
  return output.hookSpecificOutput!.permissionDecisionReason!;
}

function expectGrokAllow(output: Envelope): void {
  expect(output.decision).toBe("allow");
  expect(output.reason).toBeTypeOf("string");
  expect(output.hookSpecificOutput).toBeUndefined();
}

function grokDenialReason(output: Envelope): string {
  expect(output.decision).toBe("deny");
  expect(output.reason).toBeTypeOf("string");
  expect(output.hookSpecificOutput).toBeUndefined();
  return output.reason!;
}

/** payload per matcher that its validator must deny */
const violations: Record<string, Record<string, unknown>> = {
  [questions]: question({
    label: "Consolidate purchasing",
    description: "One supplier.",
  }),
  [plans]: { plan: "## Context\n\nSlow.\n" },
  [dispatch]: { name: "Raj_TechLead", task: "do it" },
};
/** fragment each violation's denial reason must carry */
const violationFragments: Record<string, string> = {
  [questions]: "Consolidate purchasing",
  [plans]: "missing headings",
  [dispatch]: "Raj_TechLead",
};
const matrix = matchers.flatMap((matcher) =>
  HARNESS_ROOT_VARIABLES.map((variable) => [matcher, variable] as const),
);

function question(
  ...options: Array<Record<string, string>>
): Record<string, unknown> {
  return {
    questions: [
      {
        header: "Route",
        multiSelect: false,
        options,
        question: "Which route should we take?",
      },
    ],
  };
}

describe("PreToolUse hook wiring", () => {
  it.each(matrix)(
    "should emit the native allow envelope for %s resolved through %s",
    (matcher, variable) => {
      const output = runHook(matcher, {}, variable);
      if (variable === "GROK_PLUGIN_ROOT") expectGrokAllow(output);
      else expectAllowed(output);
    },
  );

  it.each(matrix)(
    "should emit the native deny envelope for %s resolved through %s",
    (matcher, variable) => {
      const output = runHook(matcher, violations[matcher]!, variable);
      const reason =
        variable === "GROK_PLUGIN_ROOT"
          ? grokDenialReason(output)
          : denialReason(output);
      expect(reason).toContain(violationFragments[matcher]!);
    },
  );

  it.each(matrix)(
    "should validate %s through camelCase toolInput under %s",
    (matcher, variable) => {
      const isGrok = variable === "GROK_PLUGIN_ROOT";
      const denied = runCamelHook(matcher, violations[matcher]!, variable);
      const reason = isGrok
        ? grokDenialReason(denied)
        : denialReason(denied);
      expect(reason).toContain(violationFragments[matcher]!);
      const passed = runCamelHook(matcher, {}, variable);
      if (isGrok) expectGrokAllow(passed);
      else expectAllowed(passed);
    },
  );

  it("should resolve two set harness variables by chain precedence", () => {
    // The grok envelope would appear if grok outranked the winner.
    expectAllowed(
      runHookWithVariables(questions, {}, {
        CLAUDE_PLUGIN_ROOT: plugin,
        GROK_PLUGIN_ROOT: "/plugins/grok",
      }),
    );
    expectAllowed(
      runHookWithVariables(plans, {}, {
        PLUGIN_ROOT: plugin,
        GROK_PLUGIN_ROOT: "/plugins/grok",
      }),
    );
  });
});

describe("question validator", () => {
  it("should deny an option without a tag and name every valid tag", () => {
    const reason = denialReason(
      runHook(
        questions,
        question({
          label: "Consolidate purchasing",
          description: "One supplier.",
        }),
      ),
    );
    expect(reason).toContain("Consolidate purchasing");
    for (const tag of validTags) expect(reason).toContain(tag);
  });
  it.each(["Fast", "Recommeded"])("should deny invalid tag %s by name", (tag) =>
    expect(
      denialReason(
        runHook(
          questions,
          question({ label: `Ship it [${tag}]`, description: "Quick." }),
        ),
      ),
    ).toContain(`[${tag}]`),
  );
  it("should allow a question without a mechanically recommended option", () =>
    expectAllowed(
      runHook(
        questions,
        question(
          { label: "Patch now [Hotfix]", description: "Restores service." },
          { label: "Rebuild [Architectural]", description: "Long-term." },
        ),
      ),
    ));
  it("should accept tags on the first description line", () =>
    expectAllowed(
      runHook(
        questions,
        question({
          label: "Consolidate vendors",
          description: "[Pragmatic] [Recommended]\nMoves purchases.",
        }),
      ),
    ));
  it("should accept tags in the label", () =>
    expectAllowed(
      runHook(
        questions,
        question({
          label: "Consolidate [Pragmatic] [Recommended]",
          description: "Moves purchases.",
        }),
      ),
    ));
  it("should ignore bracketed prose beside a valid tag", () =>
    expectAllowed(
      runHook(
        questions,
        question({
          label: "Use Postgres [Recommended]",
          description: "[Note] requires a migration.",
        }),
      ),
    ));
});

describe("plan validator", () => {
  it("should name only a missing Context heading", () =>
    expect(
      denialReason(
        runHook(plans, { plan: compliantPlan.split("## Context")[0] }),
      ),
    ).toContain("missing headings: Context."));
  it("should name all four missing default-plan headings", () =>
    expect(
      denialReason(
        runHook(plans, {
          plan: "## Context\n\nSlow.\n\n## Summary\n\nFast.\n",
        }),
      ),
    ).toContain("missing headings: Goal, Requirements, Boundary, Direction."));
  it("should allow a complete plan", () =>
    expectAllowed(runHook(plans, { plan: compliantPlan })));
  it("should match headings at any depth and case", () =>
    expectAllowed(
      runHook(plans, {
        plan: "# goal\na\n#### REQUIREMENTS\nb\n### Boundary\nc\n## direction\nd\n### context\ne\n",
      }),
    ));
  it("should not require headings in a Codex step list", () =>
    expectAllowed(
      runHook(plans, { plan: [{ step: "audit", status: "pending" }] }),
    ));
});

describe("dispatch validator", () => {
  it("should name all five missing interface fields", () => {
    const reason = denialReason(
      runHook(dispatch, { prompt: "Please fix the auth bug.", name: teammate }),
    );
    for (const field of [
      "Goal:",
      "Requirements:",
      "Boundary:",
      "Directions:",
      "Context:",
    ])
      expect(reason).toContain(field);
  });
  it("should deny a prose first line", () =>
    expect(
      denialReason(
        runHook(dispatch, {
          prompt: compliantPrompt.replace(
            "checkout-refunds",
            "Fix the refund totals please",
          ),
          name: teammate,
        }),
      ),
    ).toContain("stable reference"));
  it("should deny a field label as the first line", () =>
    expect(
      denialReason(
        runHook(dispatch, {
          prompt: compliantPrompt
            .slice(compliantPrompt.indexOf("\n") + 1)
            .trimStart(),
          name: teammate,
        }),
      ),
    ).toContain("stable reference"));
  it.each([teammate, undefined])(
    "should enforce the prompt ceiling for name %s",
    (name) => {
      const prompt = compliantPrompt + "x".repeat(5_000);
      const reason = denialReason(
        runHook(dispatch, { prompt, ...(name === undefined ? {} : { name }) }),
      );
      expect(reason).toContain(String(prompt.length));
      expect(reason).toContain("4096");
    },
  );
  it.each([
    { prompt: compliantPrompt, name: "Raj_TechLead" },
    { task: "do it", name: "Raj_TechLead" },
  ])("should deny a non-kebab name", (input) =>
    expect(denialReason(runHook(dispatch, input))).toContain("Raj_TechLead"),
  );
  it.each([
    "checkout-refunds",
    "00521233-550e-4441-9bb7-f0c705d79b0a",
    "#158",
    "a".repeat(40),
  ])("should allow stable reference %s", (reference) =>
    expectAllowed(
      runHook(dispatch, {
        prompt: compliantPrompt.replace("checkout-refunds", reference),
        name: teammate,
      }),
    ),
  );
  it("should allow the compliant handover prompt", () =>
    expectAllowed(
      runHook(dispatch, { prompt: compliantPrompt, name: teammate }),
    ));
  it("should allow leading indentation on the stable reference", () =>
    expectAllowed(
      runHook(dispatch, { prompt: `  ${compliantPrompt}`, name: teammate }),
    ));
  it.each([
    "Find every caller of parseRefund across the repo.",
    compliantPrompt,
    "",
  ])("should exempt an unnamed nested spawn", (prompt) =>
    expectAllowed(runHook(dispatch, { prompt, subagent_type: "Explore" })),
  );
});

describe("fail-open behavior", () => {
  it.each([
    [questions, {}],
    [questions, { questions: [] }],
    [plans, {}],
    [dispatch, {}],
    [plans, { plan: [{ step: "audit", status: "pending" }] }],
    [dispatch, { task: "audit the parser" }],
  ] as const)("should allow uncheckable %s payloads", (matcher, input) =>
    expectAllowed(runHook(matcher, input)),
  );
  it.each(matrix)(
    "should fail open identically on malformed stdin for %s under %s",
    (matcher, variable) => {
      const completed = spawnSync("bash", ["-c", commandFor(matcher)], {
        encoding: "utf8",
        env: harnessEnvironment(variable),
        input: "not json at all",
      });
      expect(completed.status, completed.stderr).toBe(0);
      const output = JSON.parse(completed.stdout) as Envelope;
      if (variable === "GROK_PLUGIN_ROOT") expectGrokAllow(output);
      else expectAllowed(output);
    },
  );
});
