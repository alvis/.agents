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
    failure_evidence: null,
  },
];
const skippedWorkflowResult = {
  command: "bunx lint",
  kind: "lint",
  ref: "target-sha",
  source: ".github/workflows/ci.yml:lint",
  status: "not_run_missing_secret",
  failure_evidence: null,
};
const missingVariableFailureWorkflowResults = [
  {
    ...workflowResults[0],
    command: "bunx vitest run --requires-api-token",
    status: 1,
    failure_evidence: {
      name: "API_TOKEN",
      type: "missing_ci_variable",
    },
  },
  {
    ...skippedWorkflowResult,
    command: "bunx lint --requires-signing-key",
    status: 2,
    failure_evidence: {
      name: "SIGNING_KEY",
      type: "missing_ci_variable",
    },
  },
  {
    ...skippedWorkflowResult,
    command: "bunx typecheck",
  },
];

const approvedMissingSecretNames = ["API_TOKEN", "SIGNING_KEY"];
const malformedMissingVariableFailureWorkflowResult = {
  ...workflowResults[0],
  status: 1,
  failure_evidence: {
    name: "API_TOKEN",
    type: "ordinary_command_failure",
  },
};

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

const approvedMissingSecretReceipt = {
  ...passingReceipt(),
  missing_secret_approval: {
    approved: true,
    names: approvedMissingSecretNames,
    sha: "target-sha",
  },
  overall: "approved_without_local_run",
  workflow_command_results: missingVariableFailureWorkflowResults,
};

function approvedReceiptWithResults(
  results: readonly Record<string, unknown>[],
  names: readonly string[] = ["API_TOKEN"],
) {
  return {
    ...passingReceipt(),
    missing_secret_approval: {
      approved: true,
      names,
      sha: "target-sha",
    },
    overall: "approved_without_local_run",
    workflow_command_results: results,
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
    const accepted = run(approvedMissingSecretReceipt, {
      expectedMissingSecretNames: approvedMissingSecretNames,
      expectedWorkflowResults: missingVariableFailureWorkflowResults,
    });
    expect(accepted.status, accepted.stderr).toBe(0);

    const mismatched = run(approvedMissingSecretReceipt, {
      expectedMissingSecretNames: ["API_TOKEN"],
      expectedWorkflowResults: missingVariableFailureWorkflowResults,
    });
    expect(mismatched.status).toBe(42);
  });

  it("should accept attempted results and genuine skips after missing-variable failure", () => {
    const results = [
      workflowResults[0],
      missingVariableFailureWorkflowResults[0],
      missingVariableFailureWorkflowResults[2],
    ];
    const accepted = run(approvedReceiptWithResults(results), {
      expectedMissingSecretNames: ["API_TOKEN"],
      expectedWorkflowResults: results,
    });
    expect(accepted.status, accepted.stderr).toBe(0);
  });

  it("should reject an attempted non-secret failure hidden by approval", () => {
    expect(
      run(approvedReceiptWithResults([
        malformedMissingVariableFailureWorkflowResult,
        skippedWorkflowResult,
      ]), {
        expectedMissingSecretNames: ["API_TOKEN"],
        expectedWorkflowResults: [
          malformedMissingVariableFailureWorkflowResult,
          skippedWorkflowResult,
        ],
      }).status,
    ).toBe(42);
  });

  it("should reject a missing-variable failure without explicit evidence", () => {
    const result = { ...workflowResults[0], status: 1 };
    expect(
      run(approvedReceiptWithResults([result, skippedWorkflowResult]), {
        expectedMissingSecretNames: ["API_TOKEN"],
        expectedWorkflowResults: [result, skippedWorkflowResult],
      }).status,
    ).toBe(42);
  });

  it("should reject an attempted success with failure evidence", () => {
    const result = {
      ...workflowResults[0],
      failure_evidence: missingVariableFailureWorkflowResults[0].failure_evidence,
    };
    expect(
      run(approvedReceiptWithResults([result]), {
        expectedMissingSecretNames: ["API_TOKEN"],
        expectedWorkflowResults: [result],
      }).status,
    ).toBe(42);
  });

  it("should reject a genuine skip with failure evidence", () => {
    const result = {
      ...skippedWorkflowResult,
      failure_evidence: missingVariableFailureWorkflowResults[0].failure_evidence,
    };
    expect(
      run(approvedReceiptWithResults([result]), {
        expectedMissingSecretNames: ["API_TOKEN"],
        expectedWorkflowResults: [result],
      }).status,
    ).toBe(42);
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
