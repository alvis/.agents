import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const gate = resolve(import.meta.dirname, "gate-missing-secrets.sh");

function run(environment: NodeJS.ProcessEnv) {
  return spawnSync("/bin/bash", [gate], {
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
}

describe("missing-secret approval gate", () => {
  it("should run locally when the workflow needs no secrets", () => {
    const result = run({
      MISSING_SECRET_NAMES: "",
      TARGET_SHA: "target-sha",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split(/\r?\n/)).toEqual([
      "CI_PARITY_SECRET_GATE=run_local",
      "CI_PARITY_OVERALL=pending_local_run",
    ]);
  });

  it("should not gate on declared names before a failed command", () => {
    const result = run({
      MISSING_SECRET_FAILURE_CONFIRMED: "false",
      MISSING_SECRET_NAMES: "API_TOKEN,SIGNING_KEY",
      MISSING_SECRET_APPROVED: "true",
      MISSING_SECRET_APPROVAL_NAMES: "API_TOKEN,SIGNING_KEY",
      MISSING_SECRET_APPROVAL_SHA: "target-sha",
      TARGET_SHA: "target-sha",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split(/\r?\n/)).toEqual([
      "CI_PARITY_SECRET_GATE=run_local",
      "CI_PARITY_OVERALL=pending_local_run",
    ]);
  });

  it.each([
    ["missing approval", {}],
    [
      "wrong revision",
      {
        MISSING_SECRET_APPROVED: "true",
        MISSING_SECRET_APPROVAL_NAMES: "API_TOKEN,SIGNING_KEY",
        MISSING_SECRET_APPROVAL_SHA: "other-sha",
      },
    ],
    [
      "incomplete names",
      {
        MISSING_SECRET_APPROVED: "true",
        MISSING_SECRET_APPROVAL_NAMES: "API_TOKEN",
        MISSING_SECRET_APPROVAL_SHA: "target-sha",
      },
    ],
  ])("should reject %s", (_name, approval) => {
    const result = run({
      MISSING_SECRET_FAILURE_CONFIRMED: "true",
      MISSING_SECRET_NAMES: "API_TOKEN,SIGNING_KEY",
      TARGET_SHA: "target-sha",
      ...approval,
    });
    expect(result.status).toBe(42);
    expect(result.stdout.trim().split(/\r?\n/)).toEqual([
      "CI_PARITY_SECRET_GATE=stop_before_push",
      "CI_PARITY_OVERALL=blocked",
    ]);
  });

  it("should accept only the exact revision and secret names", () => {
    const result = run({
      MISSING_SECRET_FAILURE_CONFIRMED: "true",
      MISSING_SECRET_APPROVED: "true",
      MISSING_SECRET_APPROVAL_NAMES: "API_TOKEN,SIGNING_KEY",
      MISSING_SECRET_APPROVAL_SHA: "target-sha",
      MISSING_SECRET_NAMES: "API_TOKEN,SIGNING_KEY",
      TARGET_SHA: "target-sha",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split(/\r?\n/)).toEqual([
      "CI_PARITY_SECRET_GATE=approved_without_local_run",
      "CI_PARITY_OVERALL=approved_without_local_run",
    ]);
  });
});
