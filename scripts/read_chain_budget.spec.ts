import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkBudget,
  measureFixture,
  measureScenario,
  resolveStepBytes,
  tokensForBytes,
  type Fixture,
} from "./read_chain_budget.ts";

const repoRoot = resolve(import.meta.dirname, "..");
const fixturePath = resolve(repoRoot, "scripts/read-chain-scenarios.json");
const fixture: Fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

// Re-seeding rule. Every budget in the fixture equals its own last measurement, so the
// gate fails on any byte added to any file in a modelled chain — including from a change
// that never touches plugins/coding. That is the design: it forces the question of
// whether the added bytes earn a place on a mandated read path, not whether they are
// few. The author of the change that added them re-seeds, in the same commit, by running
// scripts/read_chain_budget.ts and writing the measured figures back into
// scripts/read-chain-scenarios.json, and justifies the addition in that change's PR. Do
// not re-seed someone else's failing budget as a drive-by. A re-seed whose only purpose
// is to clear the gate dissolves the ratchet: remove the bytes, or move them off the
// mandated path so the chain does not pay for them.

describe("read-chain-scenarios.json fixture", () => {
  it("names at least the five audited scenarios S1, S2, S4, S5, S9", () => {
    const names = Object.keys(fixture);
    for (const id of ["S1", "S2", "S4", "S5", "S9"]) {
      expect(names.some((name) => name.startsWith(id + " "))).toBe(true);
    }
  });

  it("names no README.md path: README files are maintainer documents, never agent context", () => {
    for (const [name, scenario] of Object.entries(fixture)) {
      for (const step of scenario.steps) {
        if (step.kind !== "read") continue;
        expect(step.path.toLowerCase().endsWith("readme.md"), `${name}: ${step.path}`).toBe(false);
      }
    }
  });

  it("resolves every mandated read path against the repository root", () => {
    for (const [name, scenario] of Object.entries(fixture)) {
      for (const step of scenario.steps) {
        if (step.kind !== "read") continue;
        const absolute = resolve(repoRoot, step.path);
        expect(existsSync(absolute), `${name}: missing ${step.path}`).toBe(true);
      }
    }
  });

  // 9,600 B is the amended SC-4 ceiling for plugins/coding/directions/WORKFLOW.md:
  // it is coding's single session-entry file under R-1 (one entry file per plugin),
  // mandated by plugins/coding/hooks/ALLAGENT.md on any intent to write, review or
  // publish code, so four of the five modelled scenarios bill every byte of it. S5
  // is delegation-only and never reads it, which is why its numbers do not move
  // across this slice. The original 8,192 B target was withdrawn: reaching it
  // required splitting the file, which relocates bytes into a new file rather than
  // removing them from the chain, and adds a call to the three scenarios that reach
  // verification, not to all four that read the file: the split-off content is read
  // at the verification event, and S4 reviews a change without ever running lint or
  // tests. Re-derive it from the fixture by listing each scenario's non-read steps —
  // S1, S2 and S9 carry lint and type/test runs, S4 carries none. Do not cite 8,192.
  // This assertion belongs to the commit that produces the cut WORKFLOW.md (slice 04)
  // — it fails against base prose (15,690 B) by design, since that tree predates the
  // cut; do not add it to a commit whose own tree still has the uncut file.
  it("keeps plugins/coding/directions/WORKFLOW.md at or under the 9,600 B SC-4 ceiling", () => {
    const bytes = statSync(resolve(repoRoot, "plugins/coding/directions/WORKFLOW.md")).size;
    expect(bytes).toBeLessThanOrEqual(9_600);
  });
});

describe("tokensForBytes", () => {
  it("converts bytes to tokens at 4 bytes per token", () => {
    expect(tokensForBytes(4000)).toBe(1000);
  });

  it("rounds to the nearest token", () => {
    expect(tokensForBytes(10)).toBe(3); // 2.5 -> rounds to 3 (Math.round)
    expect(tokensForBytes(6)).toBe(2); // 1.5 -> rounds to 2
  });
});

describe("resolveStepBytes", () => {
  it("returns the fixture's byte size for a run step", () => {
    expect(resolveStepBytes({ kind: "run", label: "$ verify.sh", bytes: 300 }, repoRoot)).toBe(300);
  });

  it("returns the fixture's byte size for a work step", () => {
    expect(resolveStepBytes({ kind: "work", label: "work call 1", bytes: 6000 }, repoRoot)).toBe(6000);
  });

  it("returns the real file size for a read step", () => {
    const bytes = resolveStepBytes(
      { kind: "read", path: "plugins/coding/directions/WORKFLOW.md" },
      repoRoot,
    );
    expect(bytes).toBeGreaterThan(0);
  });

  it("rejects a README.md read step even if one is passed directly", () => {
    expect(() =>
      resolveStepBytes({ kind: "read", path: "plugins/coding/README.md" }, repoRoot),
    ).toThrow(/README/);
  });

  it("names the fixture path and tells the reader to update the fixture when a read step's file no longer exists", () => {
    let thrown: unknown;
    try {
      resolveStepBytes(
        { kind: "read", path: "plugins/coding/references/does-not-exist.md" },
        repoRoot,
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain("plugins/coding/references/does-not-exist.md");
    expect(message).toMatch(/no longer exists/);
    expect(message).toMatch(/update the fixture/);
  });
});

describe("measureScenario", () => {
  it("charges the base context, per-call overhead, and per-call output on top of step bytes", () => {
    const scenario = {
      description: "single work step",
      budget: { bytes: 0, instructionTokens: 0, instructionTokensExcludingWork: 0, calls: 0 },
      steps: [{ kind: "work" as const, label: "one step", bytes: 4000 }],
    };
    const measured = measureScenario("test", scenario, repoRoot);
    expect(measured.bytes).toBe(4000);
    expect(measured.calls).toBe(1);
    // 25_000 base + 1 * (120 + 200) overhead/output + 4000/4 step tokens
    expect(measured.instructionTokens).toBe(25_000 + 320 + 1000);
  });

  it("counts every step as one tool call, including run and work steps", () => {
    const scenario = {
      description: "two steps",
      budget: { bytes: 0, instructionTokens: 0, instructionTokensExcludingWork: 0, calls: 0 },
      steps: [
        { kind: "run" as const, label: "a", bytes: 100 },
        { kind: "work" as const, label: "b", bytes: 100 },
      ],
    };
    expect(measureScenario("test", scenario, repoRoot).calls).toBe(2);
  });

  it("counts instructionTokensExcludingWork over read and run steps, excluding only work steps and base/overhead", () => {
    const scenario = {
      description: "one read, one run, one work step",
      budget: { bytes: 0, instructionTokens: 0, instructionTokensExcludingWork: 0, calls: 0 },
      steps: [
        { kind: "read" as const, path: "plugins/coding/directions/WORKFLOW.md" },
        { kind: "run" as const, label: "$ verify.sh", bytes: 300 },
        { kind: "work" as const, label: "work call 1", bytes: 6000 },
      ],
    };
    const measured = measureScenario("test", scenario, repoRoot);
    const workflowBytes = resolveStepBytes(scenario.steps[0]!, repoRoot);
    // The read step's and the run step's tokens count; the work step's do not.
    expect(measured.instructionTokensExcludingWork).toBe(tokensForBytes(workflowBytes) + tokensForBytes(300));
    expect(measured.instructionTokensExcludingWork).toBeLessThan(measured.instructionTokens);
  });

  it("leaves instructionTokensExcludingWork at 0 when a scenario has only work steps", () => {
    const scenario = {
      description: "work steps only",
      budget: { bytes: 0, instructionTokens: 0, instructionTokensExcludingWork: 0, calls: 0 },
      steps: [{ kind: "work" as const, label: "a", bytes: 100 }],
    };
    expect(measureScenario("test", scenario, repoRoot).instructionTokensExcludingWork).toBe(0);
  });

  it("counts a run step's tokens even with no read steps present", () => {
    const scenario = {
      description: "run step only",
      budget: { bytes: 0, instructionTokens: 0, instructionTokensExcludingWork: 0, calls: 0 },
      steps: [{ kind: "run" as const, label: "$ verify.sh", bytes: 300 }],
    };
    expect(measureScenario("test", scenario, repoRoot).instructionTokensExcludingWork).toBe(tokensForBytes(300));
  });
});

describe("checkBudget", () => {
  it("passes when the measurement is at or under every budget figure", () => {
    const measurement = { name: "s", bytes: 100, instructionTokens: 1000, instructionTokensExcludingWork: 500, calls: 2 };
    const result = checkBudget(measurement, {
      bytes: 100,
      instructionTokens: 1000,
      instructionTokensExcludingWork: 500,
      calls: 2,
    });
    expect(result.withinBudget).toBe(true);
  });

  it("fails when any single figure exceeds its budget", () => {
    const measurement = { name: "s", bytes: 101, instructionTokens: 1000, instructionTokensExcludingWork: 500, calls: 2 };
    const result = checkBudget(measurement, {
      bytes: 100,
      instructionTokens: 1000,
      instructionTokensExcludingWork: 500,
      calls: 2,
    });
    expect(result.withinBudget).toBe(false);
  });

  it("fails when instructionTokensExcludingWork alone exceeds its budget, even if instructionTokens is under", () => {
    const measurement = { name: "s", bytes: 100, instructionTokens: 900, instructionTokensExcludingWork: 501, calls: 2 };
    const result = checkBudget(measurement, {
      bytes: 100,
      instructionTokens: 1000,
      instructionTokensExcludingWork: 500,
      calls: 2,
    });
    expect(result.withinBudget).toBe(false);
  });
});

describe("read-chain budget gate (live measurement)", () => {
  const measurements = measureFixture(fixture, repoRoot);

  it("measures a positive byte, token, and call count for every scenario", () => {
    for (const measurement of measurements) {
      expect(measurement.bytes).toBeGreaterThan(0);
      expect(measurement.instructionTokens).toBeGreaterThan(0);
      expect(measurement.instructionTokensExcludingWork).toBeGreaterThan(0);
      expect(measurement.calls).toBeGreaterThan(0);
    }
  });

  it("keeps instructionTokensExcludingWork strictly under instructionTokens for every scenario (base/overhead/fixed steps excluded)", () => {
    for (const measurement of measurements) {
      expect(measurement.instructionTokensExcludingWork).toBeLessThan(measurement.instructionTokens);
    }
  });

  it("stays within its seeded budget for every scenario, on every metric including instructionTokensExcludingWork", () => {
    for (const measurement of measurements) {
      const budget = fixture[measurement.name]!.budget;
      const result = checkBudget(measurement, budget);
      expect(
        result.withinBudget,
        `${measurement.name}: bytes ${measurement.bytes}/${budget.bytes}, ` +
          `tokens ${measurement.instructionTokens}/${budget.instructionTokens}, ` +
          `tokens-excl-work ${measurement.instructionTokensExcludingWork}/${budget.instructionTokensExcludingWork}, ` +
          `calls ${measurement.calls}/${budget.calls}`,
      ).toBe(true);
    }
  });
});
