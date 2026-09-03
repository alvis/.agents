#!/usr/bin/env bun
// Read-chain budget gate: measures, per modeled scenario, how many bytes,
// instruction tokens, and tool calls an agent must load from this
// repository's plugin instructions before it can act, and reports whether
// that measurement stays within the scenario's seeded budget.
//
// Cost model ported from the plugin-context-slimming audit's
// `artifacts/scenarios.ts` cost simulator: every mandated load is one tool
// call; each call carries a fixed 120-token overhead and produces 200
// tokens of output; every agent starts from a 25,000-token base context
// (system prompt, tool schemas, CLAUDE.md); bytes convert to tokens at
// bytes / 4. README.md files are maintainer documents (see
// `decisions/script-retirements.md` in the owning work stream) and are
// never mandated agent context, so no fixture step may name one.
//
// A step belongs to a scenario only when that scenario's own events mandate
// it. A payload or direction that binds a read to "before delegating" or
// "before composing a first handover" is not charged to a scenario that
// never delegates and never composes one, and a file nothing links to is
// charged to nobody. A phantom step inflates both sides of a before/after
// comparison and lets a later slice book its removal as a saving.
//
// A fourth step kind, `inject`, models hook-injected payload files
// (`ALLAGENT.md`, `MAINAGENT.md`, `SUBAGENT.md`) that `SessionStart` and
// `SubagentStart` hooks pipe into a session's context before the agent
// issues its first tool call. Injection costs bytes but zero tool calls —
// unlike a `read` step, nothing "loads" it, so it never increments `calls`
// or the per-call overhead/output charged to `instructionTokens`.
//
// Three token metrics are reported, and they are NOT interchangeable:
//   - `instructionTokens` is the full context an agent holds after loading
//     every mandated step: base context + per-call overhead/output (charged
//     only for read/run/work calls, never inject) + every step's bytes
//     (read, run, work, AND inject). This models real session cost and is
//     worth watching, but it is not reducible by restructuring reads: work
//     steps are irreducible content, not instruction overhead.
//   - `instructionTokensExcludingWork` sums tokens(bytes) over every step EXCEPT
//     `kind: "work"` — i.e. `read`, `run`, AND `inject` steps, no base
//     context, no per-call overhead/output. This mirrors the audit's own
//     `artifacts/scenarios.ts` cost simulator exactly (`if (s.kind !==
//     "work") instr += add`) and is the metric SC-1 and its slice-10
//     targets are expressed in. `run` steps (script/tool output the agent
//     must load, e.g. `$ resolve-state-workspace`, `Agent(...) -> report`)
//     count here because they are NOT irreducible: the audit's after-model
//     drops several scripts outright and resizes others, and none of that
//     saving would register if `run` steps were excluded alongside `work`.
//     `inject` steps count here too — hook payloads are exactly the kind of
//     read-chain content later slices rewrite to shrink. Only `kind: "work"`
//     (the agent's own generated work turns — writing code, composing a
//     fix, analyzing a diff) is irreducible and excluded.
//     When lowering a budget for a later slice, lower `instructionTokensExcludingWork`
//     against the audit-derived target; `instructionTokens` stays a
//     secondary, informational figure.
//   - `bytes` is the raw sum across every step (read, run, work, and inject),
//     matching `instructionTokens`'s scope.
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

/** Tokens present before any scenario step loads: system prompt, tool schemas, CLAUDE.md. */
export const BASE_CONTEXT_TOKENS = 25_000;
/** Tokens of tool_use/result framing charged on every mandated-load call. */
export const CALL_OVERHEAD_TOKENS = 120;
/** Tokens of assistant output charged on every mandated-load call. */
export const OUTPUT_TOKENS_PER_CALL = 200;
/** Bytes-to-tokens conversion used throughout the cost model. */
export const BYTES_PER_TOKEN = 4;

/** One mandated load: a repository-relative file the agent must read. */
export interface ReadStep {
  readonly kind: "read";
  /** Repository-relative path, resolved against the repo root at measurement time. */
  readonly path: string;
}

/**
 * One mandated load that is not a file read but is still mandated context:
 * script or tool-call output the agent must hold (e.g. a state-write
 * receipt, a subagent's report). Counted toward `instructionTokensExcludingWork`
 * because restructuring the chain CAN remove or shrink it — see the audit's
 * after-model, which drops several of these outright.
 */
export interface RunStep {
  readonly kind: "run";
  readonly label: string;
  /** Byte size to charge for this step, hand-measured or estimated by the fixture author. */
  readonly bytes: number;
}

/**
 * One mandated step that is the agent's own generated work turn (writing
 * code, composing a fix, analyzing a diff), not a load of existing content.
 * Irreducible: no read-chain restructuring removes it, so it is excluded
 * from `instructionTokensExcludingWork`.
 */
export interface WorkStep {
  readonly kind: "work";
  readonly label: string;
  /** Byte size to charge for this step, hand-measured or estimated by the fixture author. */
  readonly bytes: number;
}

/**
 * One mandated hook-injected payload: a repository-relative file that a
 * `SessionStart` or `SubagentStart` hook pipes into the session's context
 * before the agent's first tool call. Measured from disk exactly like a
 * `ReadStep`, but it costs no tool call — nothing "reads" it, the harness
 * injects it — so it contributes bytes without incrementing `calls` and
 * without the per-call overhead/output charged to `instructionTokens`.
 */
export interface InjectStep {
  readonly kind: "inject";
  /** Repository-relative path, resolved against the repo root at measurement time. */
  readonly path: string;
}

export type FixtureStep = ReadStep | RunStep | WorkStep | InjectStep;

export interface ScenarioBudget {
  readonly bytes: number;
  /** Includes work-turn bytes/tokens; informational only — NOT the SC-1 metric. */
  readonly instructionTokens: number;
  /** Budget for tokens excluding `kind: "work"` steps — the metric SC-1 and slice-10 targets are expressed in. */
  readonly instructionTokensExcludingWork: number;
  readonly calls: number;
}

export interface Scenario {
  readonly description: string;
  readonly budget: ScenarioBudget;
  readonly steps: readonly FixtureStep[];
}

export type Fixture = Record<string, Scenario>;

export interface ScenarioMeasurement {
  readonly name: string;
  readonly bytes: number;
  /** Includes work-turn bytes/tokens; informational only — NOT the SC-1 metric. */
  readonly instructionTokens: number;
  /** Σ tokens(bytes) over every step except `kind: "work"` — no base, overhead, or output. */
  readonly instructionTokensExcludingWork: number;
  readonly calls: number;
}

const isReadmePath = (path: string): boolean =>
  path.split("/").pop()?.toLowerCase() === "readme.md";

export const tokensForBytes = (bytes: number): number =>
  Math.round(bytes / BYTES_PER_TOKEN);

/** Resolves the byte size a fixture step charges to the scenario total. */
export function resolveStepBytes(step: FixtureStep, repoRoot: string): number {
  if (step.kind === "run" || step.kind === "work") return step.bytes;
  if (isReadmePath(step.path)) {
    throw new Error(
      `read-chain-scenarios.json names a README.md, which is never mandated agent context: ${step.path}`,
    );
  }
  const absolute = resolve(repoRoot, step.path);
  try {
    return statSync(absolute).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `read-chain-scenarios.json names a path that no longer exists, update the fixture: ${step.path}`,
      );
    }
    throw error;
  }
}

/**
 * Measures one scenario's mandated read chain: every `read`, `run`, and
 * `work` step is one tool call, so each accumulates the base context,
 * per-call overhead, and per-call output of the ported cost model. An
 * `inject` step is not a tool call — a hook injects it — so it contributes
 * its bytes and nothing else. Together they are the context an agent must
 * hold before it can act.
 */
export function measureScenario(
  name: string,
  scenario: Scenario,
  repoRoot: string,
): ScenarioMeasurement {
  let bytes = 0;
  let calls = 0;
  let stepTokens = 0;
  let instructionTokensExcludingWork = 0;
  for (const step of scenario.steps) {
    const stepBytes = resolveStepBytes(step, repoRoot);
    bytes += stepBytes;
    if (step.kind !== "inject") calls += 1;
    stepTokens += tokensForBytes(stepBytes);
    if (step.kind !== "work") instructionTokensExcludingWork += tokensForBytes(stepBytes);
  }
  const instructionTokens =
    BASE_CONTEXT_TOKENS + calls * (CALL_OVERHEAD_TOKENS + OUTPUT_TOKENS_PER_CALL) + stepTokens;
  return { name, bytes, instructionTokens, instructionTokensExcludingWork, calls };
}

export function measureFixture(fixture: Fixture, repoRoot: string): ScenarioMeasurement[] {
  return Object.entries(fixture).map(([name, scenario]) =>
    measureScenario(name, scenario, repoRoot),
  );
}

export interface BudgetCheck extends ScenarioMeasurement {
  readonly budget: ScenarioBudget;
  readonly withinBudget: boolean;
}

export function checkBudget(measurement: ScenarioMeasurement, budget: ScenarioBudget): BudgetCheck {
  return {
    ...measurement,
    budget,
    withinBudget:
      measurement.bytes <= budget.bytes &&
      measurement.instructionTokens <= budget.instructionTokens &&
      measurement.instructionTokensExcludingWork <= budget.instructionTokensExcludingWork &&
      measurement.calls <= budget.calls,
  };
}

function formatRow(check: BudgetCheck): string {
  const flag = check.withinBudget ? "PASS" : "FAIL";
  return [
    flag,
    check.name,
    `bytes ${check.bytes}/${check.budget.bytes}`,
    `tokens ${check.instructionTokens}/${check.budget.instructionTokens}`,
    `tokens-excl-work ${check.instructionTokensExcludingWork}/${check.budget.instructionTokensExcludingWork}`,
    `calls ${check.calls}/${check.budget.calls}`,
  ].join("  ");
}

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dirname, "..");
  const fixturePath = resolve(repoRoot, "scripts/read-chain-scenarios.json");
  const fixture: Fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const measurements = measureFixture(fixture, repoRoot);
  const rows = measurements.map((m) => checkBudget(m, fixture[m.name]!.budget));
  for (const row of rows) console.log(formatRow(row));
  const failed = rows.filter((row) => !row.withinBudget);
  if (failed.length > 0) {
    console.error(`\n${failed.length} scenario(s) exceeded their read-chain budget.`);
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
