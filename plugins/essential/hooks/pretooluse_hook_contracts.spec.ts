import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
const questions = "AskUserQuestion|request_user_input|request_user_input_async|ask_user_question";
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

## 🎯 Goal

Incomplete plan submissions receive actionable feedback before execution.

## 🧭 Context

- **Current Scenario** — Incomplete plans can pass without feedback. Without validation, users must find missing sections themselves.
- **Current state** — nothing implemented yet.

## 📋 Requirements

- Missing sections produce actionable feedback.

### Expected Delivery

- A plan-heading validator invoked by the native hooks.

## 🚧 Boundary

Inside: the three hook scripts.

## ✂️ Out of Scope

- Content heuristics — headings suffice; declined.

## 📍 Working environment

Directory: /work/plan-validation. Version control: jj workspace.

Branch(es): \`fix/plan-validation\` (git)

## 🗂️ Tasks

- TST: Validate the plan.

## 🛠️ Direction

Write each check as a bash script, then swap the command entries.
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

function runPlanInWorkspace({
  plan,
  cwd = process.cwd(),
  eventCwd,
  variable = "CLAUDE_PLUGIN_ROOT",
}: {
  readonly plan: string;
  readonly cwd?: string;
  readonly eventCwd?: string;
  readonly variable?: string;
}): Envelope {
  const completed = spawnSync("bash", ["-c", commandFor(plans)], {
    cwd,
    encoding: "utf8",
    env: harnessEnvironment(variable),
    input: JSON.stringify({ cwd: eventCwd, tool_input: { plan } }),
  });
  expect(completed.status, completed.stderr).toBe(0);
  return JSON.parse(completed.stdout) as Envelope;
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
      const output = runHook(matcher, matcher === questions ? question({ label: "Proceed [Recommended]", description: "Continue validation." }) : {}, variable);
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
      const passed = runCamelHook(matcher, matcher === questions ? question({ label: "Proceed [Recommended]", description: "Continue validation." }) : {}, variable);
      if (isGrok) expectGrokAllow(passed);
      else expectAllowed(passed);
    },
  );

  it("should resolve two set harness variables by chain precedence", () => {
    expect(grokDenialReason(
      runHookWithVariables(questions, violations[questions]!, {
        CLAUDE_PLUGIN_ROOT: "/plugins/claude-compatibility",
        GROK_PLUGIN_ROOT: plugin,
      }),
    )).toContain("Consolidate purchasing");
    expectAllowed(
      runHookWithVariables(plans, {}, {
        PLUGIN_ROOT: plugin,
        GROK_PLUGIN_ROOT: "/plugins/grok",
      }),
    );
  });
});

describe("portable rejection guidance", () => {
  const cases = [
    ["malformed question", questions, {}, "questions"],
    ["untagged option", questions, question({ label: "Ship now" }), "questions"],
    ["unknown option tag", questions, question({ label: "Ship now [Fast]" }), "questions"],
    ["incomplete plan", plans, { plan: "## Context\nIncomplete." }, "plan"],
  ] as const;

  it.each(cases.flatMap(([name, matcher, input, guide]) =>
    HARNESS_ROOT_VARIABLES.map((variable) => ({ name, matcher, input, guide, variable })),
  ))("should name one portable guide for $name under $variable", ({ matcher, input, guide, variable }) => {
    const output = runHook(matcher, input, variable);
    const reason = variable === "GROK_PLUGIN_ROOT"
      ? grokDenialReason(output)
      : denialReason(output);

    expect(reason.split(`essential:directions/${guide}.md`)).toHaveLength(2);
    expect(reason.split(`directions/${guide}.md`)).toHaveLength(2);
    expect(reason).not.toContain(plugin);
  });
});

describe("question validator", () => {
  function runAsyncQuestion(toolInput: Record<string, unknown>): Envelope {
    const entry = hooks.hooks.PreToolUse.find(({ matcher }) =>
      matcher.split("|").includes("request_user_input_async"),
    );
    const completed = spawnSync("bash", ["-c", entry!.hooks[0]!.command], {
      encoding: "utf8",
      env: harnessEnvironment("PLUGIN_ROOT"),
      input: JSON.stringify({ tool_name: "request_user_input_async", tool_input: toolInput }),
    });
    expect(completed.status, completed.stderr).toBe(0);
    return JSON.parse(completed.stdout) as Envelope;
  }

  it.each([
    ["tagged strings", { questions: [{ title: "Choose a route", options: ["Ship [Recommended]", "Wait [Pragmatic]"] }] }],
    ["free text", { questions: [{ title: "What constraint must we preserve?" }] }],
  ])("should accept async %s questions", (_name, toolInput) => {
    expectAllowed(runAsyncQuestion(toolInput));
  });

  it("should deny untagged async options and allow a corrected new call", () => {
    const reason = denialReason(runAsyncQuestion({
      questions: [{ title: "Choose a route", options: ["Ship now", "Wait [Pragmatic]"] }],
    }));
    expect(reason).toContain("Ship now");
    for (const tag of validTags) expect(reason).toContain(tag);
    expectAllowed(runAsyncQuestion({
      questions: [{ title: "Choose a route", options: ["Ship now [Recommended]", "Wait [Pragmatic]"] }],
    }));
  });

  it.each([{}, { questions: [] }, { questions: "invalid" }, { questions: [{ question: "Choose?", options: [42] }] }])(
    "should deny malformed question payload %j",
    (input) => expect(denialReason(runHook(questions, input))).toBeTruthy(),
  );

  it.each(HARNESS_ROOT_VARIABLES)("should deny missing question envelopes under %s", (variable) => {
    const completed = spawnSync("bash", ["-c", commandFor(questions)], {
      encoding: "utf8",
      env: harnessEnvironment(variable),
      input: JSON.stringify({ tool_name: "request_user_input" }),
    });
    expect(completed.status, completed.stderr).toBe(0);
    const output = JSON.parse(completed.stdout) as Envelope;
    expect(variable === "GROK_PLUGIN_ROOT" ? grokDenialReason(output) : denialReason(output)).toBeTruthy();
  });

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
  it("should require a proposed branch or bookmark in a Git-backed working environment", () => {
    const plan = compliantPlan.replace("Branch(es): `fix/plan-validation` (git)", "");
    const reason = denialReason(runHook(plans, { plan }));

    expect(reason).toContain("essential:references/naming.md");
  });

  it.each(["build", "chore", "ci", "docs", "feat", "fix", "perf", "refactor", "revert", "style", "test"])(
    "should accept proposed %s branch names without existing refs",
    (type) => {
      for (const name of [`${type}/proposed-work`, `${type}/proposed-work/01-first-slice`, `${type}/proposed-work/99-last-slice`]) {
        expectAllowed(runHook(plans, { plan: compliantPlan.replace("fix/plan-validation", name) }));
      }
    },
  );

  it.each([
    "Branch(es): fix/proposed-work (git)",
    "Bookmark(s): `feat/proposed-work/02-parser` (jj)",
    "- **Branch(es):** `fix/proposed-work` (git)",
    "* **Bookmark(s)**: refactor/proposed-work (jj)",
    "Branch(es): fix/proposed-work (git)\nBookmark(s): feat/proposed-work/01-parser (jj)",
    "### Workspace details\n\nBookmark(s): feat/proposed-work (jj)",
    "Branch(es): fix/proposed-work/01-parser, fix/proposed-work/02-tests (git)",
    "Bookmark(s): `feat/proposed-work/01-parser`, feat/proposed-work/02-tests, `feat/proposed-work/99-final` (jj)",
  ])("should accept a working ref declaration formatted as %s", (declaration) => {
    expectAllowed(runHook(plans, { plan: compliantPlan.replace("Branch(es): `fix/plan-validation` (git)", declaration) }));
  });

  it.each([
    "feature/proposed-work", "main", "fix/", "fix/Uppercase", "fix/under_score", "fix/two--hyphens",
    "fix/-leading", "fix/trailing-", "fix/work/00-zero", "fix/work/1-single", "fix/work/100-three",
    "fix/work/01-", "fix/work/01-bad_slice", "fix/work/01-slice/extra", "fix/work/ab-slice",
  ])("should deny a malformed proposed name %s", (name) => {
    const reason = denialReason(runHook(plans, { plan: compliantPlan.replace("fix/plan-validation", name) }));

    expect(reason).toContain(name);
    expect(reason).toContain("essential:references/naming.md");
  });

  it.each([
    "Branch(es): (git)", "Bookmark(s): `` (jj)",
    "Branch(es): `fix/valid` (git)\nBookmark(s): invalid/work (jj)",
    "Branch(es): `fix/valid` (git)\nBookmark(s): `feat/unclosed (jj)",
    "Branch(es): fix/valid, feature/invalid (git)",
    "Bookmark(s): feat/valid/01-parser, feat/valid/00-invalid (jj)",
    "Branch(es): , fix/valid (git)", "Branch(es): fix/valid, (git)",
    "Bookmark(s): fix/valid,,feat/valid (jj)",
    "Branch(es): `fix/one, fix/two` (git)",
  ])("should deny missing or invalid names among all list entries: %s", (declaration) => {
    expect(denialReason(runHook(plans, { plan: compliantPlan.replace("Branch(es): `fix/plan-validation` (git)", declaration) }))).toContain("essential:references/naming.md");
  });

  it.each([
    "Branch(es): fix/work (jj)", "Bookmark(s): fix/work (git)",
    "Branch(es): fix/work", "Bookmark(s): fix/work (hg)",
    "Branch(es): fix/work (git) ignored/work",
  ])("should deny a missing or mismatched VCS marker: %s", (declaration) => {
    expect(denialReason(runHook(plans, { plan: compliantPlan.replace("Branch(es): `fix/plan-validation` (git)", declaration) }))).toContain("essential:directions/plan.md");
  });

  it.each(["## 🗂️ Tasks", "# Enforce the documented formats"])(
    "should not use a declaration outside Working environment at %s",
    (heading) => {
      const plan = compliantPlan.replace("Branch(es): `fix/plan-validation` (git)", "").replace(heading, `${heading}\n\nBranch(es): fix/elsewhere (git)`);
      expect(denialReason(runHook(plans, { plan }))).toContain("essential:references/naming.md");
    },
  );

  it("should prefer the event repository over a non-Git process directory", () => {
    const root = mkdtempSync(resolve(tmpdir(), "plan-event-git-"));
    try {
      expect(denialReason(runPlanInWorkspace({
        cwd: root,
        eventCwd: process.cwd(),
        plan: compliantPlan.replace("Branch(es): `fix/plan-validation` (git)", ""),
      }))).toContain("essential:references/naming.md");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("should fall back to the Git process directory for an empty event directory", () => {
    expect(denialReason(runPlanInWorkspace({ eventCwd: "", plan: compliantPlan.replace("Branch(es): `fix/plan-validation` (git)", "") }))).toContain("essential:references/naming.md");
  });

  it("should exempt a non-Git event directory even when the process is in Git", () => {
    const root = mkdtempSync(resolve(tmpdir(), "plan-event-non-git-"));
    try {
      for (const declaration of ["", "Branch(es): invalid/work (git)"]) {
        expectAllowed(runPlanInWorkspace({ eventCwd: root, plan: compliantPlan.replace("Branch(es): `fix/plan-validation` (git)", declaration) }));
      }
      expectAllowed(runPlanInWorkspace({ cwd: root, plan: compliantPlan.replace("Branch(es): `fix/plan-validation` (git)", "") }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("should require bookmarks in non-colocated Git-backed jj workspaces", () => {
    const root = mkdtempSync(resolve(tmpdir(), "plan-jj-git-"));
    try {
      const initialized = spawnSync("jj", ["git", "init", "--no-colocate", root], { encoding: "utf8" });
      expect(initialized.status, initialized.stderr).toBe(0);
      const plan = compliantPlan.replace("Branch(es): `fix/plan-validation` (git)", "");
      expect(denialReason(runPlanInWorkspace({ eventCwd: root, plan }))).toContain("essential:references/naming.md");
      expectAllowed(runPlanInWorkspace({ eventCwd: root, plan: compliantPlan.replace("Branch(es):", "Bookmark(s):").replace("(git)", "(jj)") }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(["CLAUDE_PLUGIN_ROOT", "PLUGIN_ROOT", "GROK_PLUGIN_ROOT"])(
    "should enforce ref names through the native %s envelope",
    (variable) => {
      const output = runPlanInWorkspace({ variable, plan: compliantPlan.replace("fix/plan-validation", "invalid/work") });
      const reason = variable === "GROK_PLUGIN_ROOT" ? grokDenialReason(output) : denialReason(output);
      expect(reason).toContain("essential:references/naming.md");
    },
  );

  it("should allow a plan whose body exceeds pipe buffering after its first heading", () => {
    const plan = compliantPlan + "Detailed rationale.\n".repeat(20_000);
    expectAllowed(runHook(plans, { plan }));
  });

  it.each(["CLAUDE_PLUGIN_ROOT", "PLUGIN_ROOT"])("should reject a missing working environment through %s", (variable) => {
    expect(denialReason(runHook(plans, { plan: compliantPlan.replace("## 📍 Working environment", "") }, variable))).toContain("missing headings: Working environment.");
  });

  it.each(["CLAUDE_PLUGIN_ROOT", "PLUGIN_ROOT"])("should accept a large plan presentation through %s", (variable) => {
    expectAllowed(runHook(plans, { plan: compliantPlan + "Detailed rationale.\n".repeat(2_000) }, variable));
  });

  it("should validate Grok's session-local plan before exit", () => {
    const root = mkdtempSync(resolve(tmpdir(), "grok-plan-"));
    try {
      const transcriptPath = resolve(root, "updates.jsonl");
      writeFileSync(transcriptPath, "");
      writeFileSync(resolve(root, "plan.md"), compliantPlan.replace("## 📍 Working environment", ""));
      const result = spawnSync("bash", ["-c", commandFor(plans)], {
        encoding: "utf8",
        env: harnessEnvironment("GROK_PLUGIN_ROOT"),
        input: JSON.stringify({
          toolName: "exit_plan_mode",
          toolInput: {},
          transcriptPath,
        }),
      });
      expect(result.status, result.stderr).toBe(0);
      expect(grokDenialReason(JSON.parse(result.stdout))).toContain("missing headings: Working environment.");
      writeFileSync(resolve(root, "plan.md"), compliantPlan + "Detailed rationale.\n".repeat(2_000));
      const corrected = spawnSync("bash", ["-c", commandFor(plans)], {
        encoding: "utf8",
        env: harnessEnvironment("GROK_PLUGIN_ROOT"),
        input: JSON.stringify({ toolName: "exit_plan_mode", toolInput: {}, transcriptPath }),
      });
      expect(corrected.status, corrected.stderr).toBe(0);
      expectGrokAllow(JSON.parse(corrected.stdout));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("should deny Grok plan exit without a recoverable session plan", () => {
    const result = spawnSync("bash", ["-c", commandFor(plans)], {
      encoding: "utf8",
      env: harnessEnvironment("GROK_PLUGIN_ROOT"),
      input: JSON.stringify({ toolName: "exit_plan_mode", toolInput: {} }),
    });
    expect(result.status, result.stderr).toBe(0);
    expect(grokDenialReason(JSON.parse(result.stdout))).toMatch(/plan/i);
  });

  it("should validate Claude's explicit disk plan before exit", () => {
    const root = mkdtempSync(resolve(tmpdir(), "claude-plan-"));
    try {
      const planFilePath = resolve(root, "approved plan.md");
      writeFileSync(planFilePath, compliantPlan.replace("## 📍 Working environment", ""));
      const result = spawnSync("bash", ["-c", commandFor(plans)], {
        encoding: "utf8",
        env: harnessEnvironment("CLAUDE_PLUGIN_ROOT"),
        input: JSON.stringify({ tool_name: "ExitPlanMode", tool_input: { planFilePath } }),
      });
      expect(result.status, result.stderr).toBe(0);
      expect(denialReason(JSON.parse(result.stdout))).toContain("missing headings: Working environment.");
      writeFileSync(planFilePath, compliantPlan + "Detailed rationale.\n".repeat(2_000));
      const corrected = spawnSync("bash", ["-c", commandFor(plans)], {
        encoding: "utf8",
        env: harnessEnvironment("CLAUDE_PLUGIN_ROOT"),
        input: JSON.stringify({ tool_name: "ExitPlanMode", tool_input: { planFilePath } }),
      });
      expect(corrected.status, corrected.stderr).toBe(0);
      expectAllowed(JSON.parse(corrected.stdout));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("should deny Claude plan exit without inline or disk content", () => {
    const result = spawnSync("bash", ["-c", commandFor(plans)], {
      encoding: "utf8",
      env: harnessEnvironment("CLAUDE_PLUGIN_ROOT"),
      input: JSON.stringify({ tool_name: "ExitPlanMode", tool_input: {} }),
    });
    expect(result.status, result.stderr).toBe(0);
    expect(denialReason(JSON.parse(result.stdout))).toMatch(/plan/i);
  });

  it("should name only a missing Out of Scope heading", () =>
    expect(
      denialReason(
        runHook(plans, { plan: compliantPlan.replace("## ✂️ Out of Scope", "") }),
      ),
    ).toContain("missing headings: Out of Scope."));
  it("should name only a missing Context heading", () =>
    expect(
      denialReason(
        runHook(plans, { plan: compliantPlan.replace("## 🧭 Context", "") }),
      ),
    ).toContain("missing headings: Context."));
  it("should name every missing default-plan heading", () =>
    expect(
      denialReason(
        runHook(plans, {
          plan: "## Context\n\nSlow.\n\n## Summary\n\nFast.\n",
        }),
      ),
    ).toContain("missing headings: Goal, Requirements, Boundary, Out of Scope, Working environment, Tasks, Direction."));
  it("should reject a plan missing Tasks", () =>
    expect(denialReason(runHook(plans, { plan: compliantPlan.replace(/## 🗂️ Tasks\n\n- TST: Validate the plan\.\n\n/, "") }))).toContain("missing headings: Tasks."));
  it("should allow a complete plan", () =>
    expectAllowed(runHook(plans, { plan: compliantPlan })));
  it("should match headings at any depth and case", () =>
    expectAllowed(
      runHook(plans, {
        plan: "# goal\na\n#### REQUIREMENTS\nb\n### Boundary\nc\n## out of scope\nNone.\n## WORKING ENVIRONMENT\n/work; jj workspace.\nBranch(es): fix/plan-validation (git)\n## Tasks\nf\n## direction\nd\n### context\ne\n",
      }),
    ));
  it("should recognize compound emoji prefixes at different heading depths", () =>
    expectAllowed(
      runHook(plans, {
        plan: "# 🎯 goal\na\n#### 🧑🏽‍💻 CONTEXT\nb\n### 📋 Requirements\nc\n## 🚧 boundary\nd\n#### ✂️ OUT OF SCOPE\nNone.\n### 📍 Working environment\n/work; jj workspace.\nBranch(es): fix/plan-validation (git)\n### 🗂️ Tasks\nf\n### 🛠️ direction\ne\n",
      }),
    ));
  it("should not treat prefixed words or longer names as required headings", () =>
    expect(
      denialReason(
        runHook(plans, {
          plan: compliantPlan.replace("## 🎯 Goal", "## Project Goal\n## 🎯 Goalkeeper"),
        }),
      ),
    ).toContain("missing headings: Goal."));
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
    [plans, {}],
    [dispatch, {}],
    [plans, { plan: [{ step: "audit", status: "pending" }] }],
    [dispatch, { task: "audit the parser" }],
  ] as const)("should allow uncheckable %s payloads", (matcher, input) =>
    expectAllowed(runHook(matcher, input)),
  );
  it.each(matrix)(
    "should report malformed stdin for %s under %s",
    (matcher, variable) => {
      const completed = spawnSync("bash", ["-c", commandFor(matcher)], {
        encoding: "utf8",
        env: harnessEnvironment(variable),
        input: "not json at all",
      });
      expect(completed.status, completed.stderr).toBe(0);
      const output = JSON.parse(completed.stdout) as Envelope;
      if (matcher === questions || matcher === plans) {
        expect(variable === "GROK_PLUGIN_ROOT" ? grokDenialReason(output) : denialReason(output)).toBeTruthy();
      } else if (variable === "GROK_PLUGIN_ROOT") expectGrokAllow(output);
      else expectAllowed(output);
    },
  );
});


describe("unconditional validation", () => {
  it.each(HARNESS_ROOT_VARIABLES)("should reject malformed plans and questions despite the retired validation switch under %s", (variable) => {
    for (const [matcher, toolInput] of [[plans, { plan: "incomplete" }], [questions, { questions: [] }]] as const) {
      const output = runHookWithVariables(matcher, toolInput, {
        [variable]: plugin,
        ESSENTIAL_VALIDATION_ENABLED: "0",
      });

      expect(variable === "GROK_PLUGIN_ROOT" ? grokDenialReason(output) : denialReason(output)).toBeTruthy();
    }
  });
});
