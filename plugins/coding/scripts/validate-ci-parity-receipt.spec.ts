import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const validator = resolve(import.meta.dirname, "validate-ci-parity-receipt.sh");
const workflowResults = [
  {
    command: "bunx vitest run",
    kind: "test",
    ref: "target-sha",
    source: ".github/workflows/ci.yml:test",
    status: 0,
  },
];

function passingReceipt(): Record<string, unknown> {
  return {
    applicability_mode: "conservative_pull_request",
    execution_engine: "jj-run",
    missing_secret_approval: { approved: false, names: [], sha: null },
    overall: "pass",
    target: { base: "target-base", kind: "standalone", sha: "target-sha" },
    workflow_command_results: workflowResults,
  };
}

function run(
  receipt: Record<string, unknown>,
  options: {
    readonly expectedMissingSecretNames?: readonly string[];
    readonly expectedWorkflowResults?: readonly Record<string, unknown>[];
  } = {},
) {
  return spawnSync("/bin/bash", [validator], {
    encoding: "utf8",
    env: {
      ...process.env,
      CI_PARITY_EXPECTED_MISSING_SECRET_NAMES_JSON: JSON.stringify(
        options.expectedMissingSecretNames ?? [],
      ),
      CI_PARITY_EXPECTED_WORKFLOW_COMMAND_RESULTS_JSON: JSON.stringify(
        options.expectedWorkflowResults ?? workflowResults,
      ),
      CI_PARITY_RECEIPT_JSON: JSON.stringify(receipt),
      TARGET_BASE: "target-base",
      TARGET_KIND: "standalone",
      TARGET_SHA: "target-sha",
    },
  });
}

describe("CI-parity receipt validation", () => {
  it("should accept an exact revision-bound passing receipt", () => {
    const result = run(passingReceipt());
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("CI_PARITY_RECEIPT_GATE=accepted\n");
  });

  it.each([
    ["a changed base", { target: { base: "stale-base", kind: "standalone", sha: "target-sha" } }],
    ["a changed head", { target: { base: "target-base", kind: "standalone", sha: "stale-sha" } }],
    ["a non-jj runner", { execution_engine: "git-worktree" }],
    ["a missing runner", { execution_engine: undefined }],
  ])("should reject %s", (_name, override) => {
    const receipt = { ...passingReceipt(), ...override };
    if (override.execution_engine === undefined)
      delete receipt.execution_engine;
    expect(run(receipt).status).toBe(42);
  });

  it("should accept exact missing-secret approval", () => {
    const results = workflowResults.map((result) => ({
      ...result,
      status: "not_run_missing_secret",
    }));
    const receipt = {
      ...passingReceipt(),
      missing_secret_approval: {
        approved: true,
        names: ["API_TOKEN", "SIGNING_KEY"],
        sha: "target-sha",
      },
      overall: "approved_without_local_run",
      workflow_command_results: results,
    };
    const accepted = run(receipt, {
      expectedMissingSecretNames: ["API_TOKEN", "SIGNING_KEY"],
      expectedWorkflowResults: results,
    });
    expect(accepted.status, accepted.stderr).toBe(0);

    const mismatched = run(receipt, {
      expectedMissingSecretNames: ["API_TOKEN"],
      expectedWorkflowResults: results,
    });
    expect(mismatched.status).toBe(42);
  });

  it("should reject a passing receipt when secrets were expected", () => {
    expect(
      run(passingReceipt(), { expectedMissingSecretNames: ["API_TOKEN"] })
        .status,
    ).toBe(42);
  });

  it("should reject an approval fragment without a complete receipt", () => {
    expect(
      run(
        {
          missing_secret_approval: {
            approved: true,
            names: ["API_TOKEN"],
            sha: "target-sha",
          },
        },
        { expectedMissingSecretNames: ["API_TOKEN"] },
      ).status,
    ).toBe(42);
  });
});
