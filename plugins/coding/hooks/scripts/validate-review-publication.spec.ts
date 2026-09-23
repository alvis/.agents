import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONTRACT_VERSION,
  classifyReviewPublicationCommand,
  createReviewPublicationReceipt,
} from "../../skills/pr/scripts/review-publication.ts";

import type { SpawnSyncReturns } from "node:child_process";

interface HookResult {
  readonly decision?: string;
  readonly hookSpecificOutput?: {
    readonly hookEventName: string;
    readonly permissionDecision: string;
    readonly permissionDecisionReason: string;
  };
  readonly reason?: string;
}

interface HarnessCase {
  readonly field: string;
  readonly harness: string;
  readonly roots: Readonly<Record<string, string>>;
  readonly tool: string;
}

const pluginRoot = resolve(import.meta.dirname, "../..");
const hookPath = join(pluginRoot, "hooks/scripts/validate-review-publication");
const contractPath = join(
  pluginRoot,
  "skills/pr/scripts/review-publication.ts",
);
const harnessCases: readonly HarnessCase[] = [
  {
    harness: "claude",
    tool: "Bash",
    field: "command",
    roots: { CLAUDE_PLUGIN_ROOT: pluginRoot },
  },
  {
    harness: "codex",
    tool: "exec_command",
    field: "cmd",
    roots: {
      PLUGIN_ROOT: pluginRoot,
      GROK_PLUGIN_ROOT: "/stale-grok",
      CLAUDE_PLUGIN_ROOT: "/stale-claude",
    },
  },
  {
    harness: "grok",
    tool: "shell_command",
    field: "command",
    roots: {
      GROK_PLUGIN_ROOT: pluginRoot,
      CLAUDE_PLUGIN_ROOT: "/stale-claude",
    },
  },
];
const protectedCommands = [
  'gh pr review 35 --approve --body "Looks good"',
  'gh -R acme/app pr review 35 --approve --body "Looks good"',
  'gh --repo=acme/app pr comment 35 --body "Evidence receipt"',
  "gh --hostname github.com api -X POST repos/acme/app/pulls/35/reviews",
  'gh pr comment 35 --body "Evidence receipt: APPROVE"',
  'gh issue comment 35 --body "Supplemental evidence: no blockers"',
  "gh pr review 35 --body-file review.md --comment",
  "gh pr comment 35 --body-file -",
  "gh api repos/acme/app/pulls/35/reviews --input payload.json",
  "gh api repos/acme/app/pulls/35/reviews --input=-",
  "gh api --method POST repos/acme/app/pulls/35/comments -f body=issue",
  "gh api -X PATCH repos/acme/app/pulls/comments/12 -f body=changed",
  "gh api -X POST repos/acme/app/pulls/35/comments/12/replies -f body=reply",
  "gh api -X POST repos/acme/app/pulls/35/reviews/12/events -f event=APPROVE",
  "gh api -X DELETE repos/acme/app/issues/comments/12",
  "gh api repos/acme/app/issues/35/comments -F body=@review.md",
  'gh api graphql -f \'query=mutation { alias: addComment(input:{subjectId:"x",body:"Approved"}) { clientMutationId } }\'',
  "gh api graphql -f 'query=mutation { submitPullRequestReview(input:{pullRequestReviewId:\"x\",event:APPROVE}) { clientMutationId } }'",
  "gh api graphql -f 'query=mutation { resolveReviewThread(input:{threadId:\"x\"}) { clientMutationId } }'",
  "gh api graphql --input mutation.json",
  "gh api graphql --input -",
  "gh api graphql -F query=@mutation.graphql",
  'gh api --hostname github.com graphql -f \'query=mutation { addComment(input:{subjectId:"x",body:"Approved"}) { clientMutationId } }\'',
  "gh api --method=POST repos/acme/app/issues/35/comments --raw-field=body=Approved",
  "gh api -XPOST repos/acme/app/pulls/35/reviews",
  "gh api repos/acme/app/pulls/35/reviews/12 --method PUT --input payload.json",
  "gh api repos/acme/app/issues/35/comments -fbody=Approved",
  "gh api https://api.github.com/repos/acme/app/issues/35/comments -f body=Approved",
  "gh api https://ghe.example/api/v3/repos/acme/app/pulls/35/reviews -f event=APPROVE",
  "gh api https://api.github.com/graphql --input mutation.json",
  "gh api https://api.github.com/graphql?tracking=1 --input mutation.json",
  "gh api https://ghe.example/api/graphql --input mutation.json",
  "gh api repos/acme/app/issues/35/comments -f body=Approved --template graphql",
  "gh api repos/acme/app/issues/35/comments -f body=Approved --template -XGET",
  "gh api repos/acme/app/issues/35/comments -ifbody=Approved",
  'gh api graphql -f=\'query=mutation { addComment(input:{subjectId:"x",body:"Approved"}) { clientMutationId } }\'',
  "gh api graphql -F=query=@mutation.graphql",
  'gh api graphql -f\'query=mutation { addComment(input:{subjectId:"x",body:"Approved"}) { clientMutationId } }\'',
  'gh api -f \'query=mutation { addComment(input:{subjectId:"x",body:"Approved"}) { clientMutationId } }\' graphql',
  "gh api --input payload.json graphql",
  "gh api repos/acme/app/issues/35/comments -X GET -X POST",
  "gh api user\ngh pr review 35 --approve",
  "gh api user\ngh -R acme/app pr review 35 --approve",
  "gh -R acme/app pr review 35 --approve; echo done",
  "gh api user $(gh pr review 35 --approve)",
  "gh api repos/acme/app/issues/35/comments --method POST; echo done",
];

describe("review publication shell guard", () => {
  it.each(protectedCommands)("should deny before execution: %s", (command) => {
    expect(classifyReviewPublicationCommand(command, pluginRoot).decision).toBe(
      "deny",
    );
  });

  it.each([
    "rtk gh pr review 35 --approve",
    "rtk proxy gh pr comment 35 --body-file review.md",
    "env GH_HOST=github.com gh issue comment 35 --body Approved",
    "command gh pr review 35 --approve",
    "bash -c 'gh pr review 35 --approve'",
    "sh -c 'gh pr comment 35 --body Approved'",
    "zsh -c 'gh api -X POST repos/acme/app/issues/35/comments --input -'",
    "env GH_HOST=github.com rtk proxy bash -c 'command gh pr review 35 --approve'",
    "bash -c 'gh pr review 35 --approve' extra-argument",
  ])("should preserve denial through supported wrappers: %s", (command) => {
    expect(classifyReviewPublicationCommand(command, pluginRoot).decision).toBe(
      "deny",
    );
  });

  it.each([
    "gh pr view 35 --json headRefOid",
    "gh api repos/acme/app/pulls/35/reviews",
    "gh api --method GET repos/acme/app/issues/35/comments",
    "gh api graphql -f 'query=query { viewer { login } }'",
    "git status --porcelain",
    "printf 'ordinary command'",
  ])("should preserve unrelated and read-only commands: %s", (command) => {
    expect(classifyReviewPublicationCommand(command, pluginRoot).decision).toBe(
      "ignore",
    );
  });

  it("should allow only the canonical publisher invocation to bypass raw-write denial", () => {
    const publisher = `bun '${contractPath}' publish --approval '/tmp/approved review.json'`;

    expect(
      classifyReviewPublicationCommand(publisher, pluginRoot).decision,
    ).toBe("allow");
    expect(
      classifyReviewPublicationCommand(`rtk proxy ${publisher}`, pluginRoot)
        .decision,
    ).toBe("allow");
    expect(
      classifyReviewPublicationCommand(
        `${publisher}; gh pr comment 35 --body Approved`,
        pluginRoot,
      ).decision,
    ).toBe("deny");
    expect(
      classifyReviewPublicationCommand(
        "bun /tmp/review-publication.ts publish --approval receipt.json",
        pluginRoot,
      ).decision,
    ).not.toBe("allow");
  });

  it.each(harnessCases)(
    "should emit a $harness denial before a shell transport can write",
    ({ harness, tool, field, roots }) => {
      const input = JSON.stringify({
        tool_name: tool,
        tool_input: {
          [field]: 'gh pr comment 35 --body "evidence receipt: APPROVE"',
        },
      });
      const result = runHook({ input, roots });
      const output = JSON.parse(result.stdout) as HookResult;

      expect(result.status).toBe(0);
      expect(output).toEqual(
        harness === "grok"
          ? { decision: "deny", reason: expect.any(String) }
          : {
              hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: expect.any(String),
              },
            },
      );
      expect(executeTransportAfterHook(result)).toEqual([]);
    },
  );

  it("should let read-only shell traffic reach the transport", () => {
    const result = runHook({
      input: JSON.stringify({
        tool_name: "exec_command",
        tool_input: { cmd: "gh pr view 35" },
      }),
      roots: { PLUGIN_ROOT: pluginRoot },
    });

    expect({
      status: result.status,
      stdout: result.stdout,
      traffic: executeTransportAfterHook(result),
    }).toEqual({ status: 0, stdout: "", traffic: ["transport-executed"] });
  });

  it.each(["{", "{}", '{"tool_input":{}}'])(
    "should fail safely on malformed hook input: %s",
    (input) => {
      expect(
        executeTransportAfterHook(
          runHook({ input, roots: { PLUGIN_ROOT: pluginRoot } }),
        ),
      ).toEqual([]);
    },
  );

  it("should deny execution when the installed review contract is unavailable", () => {
    const result = runHook({
      input: JSON.stringify({
        tool_name: "Bash",
        tool_input: { command: "gh pr review 35 --approve" },
      }),
      roots: { PLUGIN_ROOT: "/missing-coding-plugin" },
    });

    expect(result.status).toBe(2);
    expect(executeTransportAfterHook(result)).toEqual([]);
  });

  it("should treat ordinary hook failure as non-blocking, but missing roots as blocking", () => {
    const nonblocking = spawnSync("bash", ["-c", "exit 1"], {
      encoding: "utf8",
    });
    const missingRoot = runHook({
      input: JSON.stringify({
        tool_name: "Bash",
        tool_input: { command: "gh pr review 35 --approve" },
      }),
      roots: {},
    });

    expect(executeTransportAfterHook(nonblocking)).toEqual([
      "transport-executed",
    ]);
    expect(missingRoot.status).toBe(2);
    expect(executeTransportAfterHook(missingRoot)).toEqual([]);
  });

  it("should block when the native manifest points to an unavailable hook", () => {
    const missingRoot = mkdtempSync(join(tmpdir(), "review-hook-missing-"));
    try {
      const manifest = JSON.parse(
        readFileSync(join(pluginRoot, "hooks/hooks.json"), "utf8"),
      ) as {
        hooks: {
          PreToolUse: Array<{ hooks: Array<{ command: string }> }>;
        };
      };
      const command = manifest.hooks.PreToolUse[0]?.hooks[0]?.command;
      if (command === undefined) throw new Error("missing native hook command");
      const result = spawnSync("bash", ["-c", command], {
        encoding: "utf8",
        env: { ...process.env, PLUGIN_ROOT: missingRoot },
        input: JSON.stringify({
          tool_name: "Bash",
          tool_input: { command: "gh pr review 35 --approve" },
        }),
      });

      expect(result.status).toBe(2);
      expect(executeTransportAfterHook(result)).toEqual([]);
    } finally {
      rmSync(missingRoot, { recursive: true, force: true });
    }
  });

  it.each(["missing", "changed"] as const)(
    "should stop guarded publication before transport when its installed template is %s",
    (state) => {
      const directory = mkdtempSync(join(tmpdir(), "review-guard-publisher-"));
      try {
        const scripts = join(directory, "skills/pr/scripts");
        const templates = join(directory, "skills/pr/templates");
        mkdirSync(scripts, { recursive: true });
        cpSync(contractPath, join(scripts, "review-publication.ts"));
        cpSync(join(pluginRoot, "skills/pr/templates"), templates, {
          recursive: true,
        });
        const identity = {
          agent_id: "reviewer-session",
          capability: "independent-code-review",
          login: "reviewer",
        };
        const receipt = createReviewPublicationReceipt({
          contract_version: CONTRACT_VERSION,
          kind: "review",
          publisher: {
            agent_id: "publisher-session",
            capability: "publication-agent",
            login: "publisher",
          },
          reviewer: identity,
          semantic_approval: {
            approved: true,
            evidence_sha256: "a".repeat(64),
            reviewer_agent_id: identity.agent_id,
            reviewer_capability: identity.capability,
            reviewer_login: identity.login,
          },
          target: {
            base_oid: "2".repeat(40),
            base_ref: "main",
            head_oid: "1".repeat(40),
            host: "github.com",
            owner: "example",
            repo: "project",
            pr_author_login: "author",
            pull_number: 35,
          },
          authorization: {
            black_zone_receipt: null,
            review_evidence_sha256: "a".repeat(64),
            zone: "green",
          },
          assessment: {
            alerts: {
              must_change: null,
              worth_considering: null,
              unanchored: null,
            },
            statistics: { files_changed: 1, additions: 1, deletions: 0 },
            previous_reports: [],
            verdict_sentence: "The boundary correction is ready.",
            findings: [],
            goal_alignment: "Meets the requested input boundary.",
            requirements_alignment: "Empty input remains supported.",
            intent_behavior: "The guard precedes indexing.",
            limitations: { entries: [], review_complete: true },
            minimality: "Only the guard changes.",
            reuse: "Uses the existing parser.",
            standards: [
              {
                standard: "universal",
                result: "passes",
                evidence: "The entrypoint checks empty input.",
              },
            ],
            substantive_verdict: "APPROVE",
            summary: "The guard fixes the empty-input boundary.",
            tests: {
              confidence: "convincing",
              execution: {
                status: "executed",
                evidence: "The empty-input test passed.",
              },
              sensitivity:
                "Removing the guard makes the empty-input test throw.",
            },
            trust_caps: [],
          },
        });
        const approvalPath = join(directory, "approval.json");
        const installedContract = join(scripts, "review-publication.ts");
        const templatePath = join(templates, "inline-review.md");
        const transportPath = join(directory, "transport.log");
        const executable = join(directory, "gh");
        writeFileSync(approvalPath, JSON.stringify(receipt));
        writeFileSync(
          executable,
          `#!/bin/sh\nprintf invoked > '${transportPath}'\nexit 1\n`,
          { mode: 0o755 },
        );
        if (state === "missing") rmSync(templatePath);
        else
          writeFileSync(
            templatePath,
            readFileSync(templatePath, "utf8").replace(
              "<!--",
              "<!-- Changed guidance.\n",
            ),
          );
        const hook = runHook({
          input: JSON.stringify({
            tool_name: "exec_command",
            tool_input: {
              cmd: `bun '${installedContract}' publish --approval '${approvalPath}'`,
            },
          }),
          roots: { PLUGIN_ROOT: directory },
        });

        expect(hook.status).toBe(0);
        expect(JSON.parse(hook.stdout)).toMatchObject({
          hookSpecificOutput: { permissionDecision: "allow" },
        });
        const publication = spawnSync(
          "bun",
          [installedContract, "publish", "--approval", approvalPath],
          {
            encoding: "utf8",
            env: { ...process.env, REVIEW_PUBLICATION_GH_BIN: executable },
          },
        );
        expect(publication.status).not.toBe(0);
        expect(existsSync(transportPath)).toBe(false);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it("should catch a seeded classifier bypass and restore the real guard", () => {
    const directory = mkdtempSync(join(tmpdir(), "review-gate-mutation-"));
    const scriptDirectory = join(directory, "skills/pr/scripts");
    mkdirSync(scriptDirectory, { recursive: true });
    const source = readFileSync(contractPath, "utf8");
    const mutant = source.replace(
      "const decision = classifyReviewPublicationCommand(command, pluginRoot);",
      'const decision = { decision: "allow", reason: "seeded classification bypass" } as const;',
    );
    const input = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "gh pr review 35 --approve" },
    });
    try {
      writeFileSync(join(scriptDirectory, "review-publication.ts"), mutant);
      const result = runHook({ input, roots: { PLUGIN_ROOT: directory } });

      expect(() =>
        expect(executeTransportAfterHook(result)).toEqual([]),
      ).toThrow();
      expect(
        executeTransportAfterHook(
          runHook({ input, roots: { PLUGIN_ROOT: pluginRoot } }),
        ),
      ).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function runHook(params: {
  readonly input: string;
  readonly roots: Readonly<Record<string, string>>;
}): SpawnSyncReturns<string> {
  return spawnSync("bash", [hookPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: "",
      GROK_PLUGIN_ROOT: "",
      PLUGIN_ROOT: "",
      ...params.roots,
    },
    input: params.input,
  });
}

function executeTransportAfterHook(
  result: SpawnSyncReturns<string>,
): readonly string[] {
  if (result.status === 2) return [];
  const output =
    result.stdout.trim() === ""
      ? {}
      : (JSON.parse(result.stdout) as HookResult);
  if (
    output.decision === "deny" ||
    output.hookSpecificOutput?.permissionDecision === "deny"
  )
    return [];
  const transport = spawnSync(
    process.execPath,
    ["-e", 'process.stdout.write("transport-executed")'],
    { encoding: "utf8" },
  );
  if (transport.status !== 0) throw new Error(transport.stderr);
  return [transport.stdout];
}
