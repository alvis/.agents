import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { SpawnSyncReturns } from "node:child_process";

const verifier = join(import.meta.dirname, "verify-code-owner.ts");
const repository = {
  default_branch: "main",
  name: "repo",
  owner: { login: "octo", type: "Organization" },
};

function createCodeownersResponse(content: string): {
  content: string;
  encoding: "base64";
  type: "file";
} {
  return {
    content: Buffer.from(content).toString("base64"),
    encoding: "base64",
    type: "file",
  };
}

function runVerifier(
  responses: Record<string, unknown>,
  username = "alice",
  options: {
    ref?: string;
    account?: string;
    repo?: string;
    args?: string[];
  } = {},
): SpawnSyncReturns<string> {
  const directory = mkdtempSync(join(tmpdir(), "code-owner-"));
  const gh = join(directory, "gh");
  writeFileSync(
    gh,
    `#!/usr/bin/env bun
const path = process.argv.at(-1);
const responses = JSON.parse(process.env.FAKE_API);
if (!(path in responses)) {
  console.error("gh: Not Found (HTTP 404)");
  process.exit(1);
}
if (responses[path] === "forbidden") {
  console.error("gh: Forbidden (HTTP 403)");
  process.exit(1);
}
if (process.argv.includes("Accept: application/vnd.github.raw+json")) {
  if (responses[path].raw_fixture !== "large") process.exit(1);
  process.stdout.write("* @alice\\n" + "# filler\\n".repeat(120000));
  process.exit(0);
}
console.log(JSON.stringify(responses[path]));
`,
    { mode: 0o755 },
  );
  const result = spawnSync(
    "bun",
    [
      "run",
      verifier,
      ...(options.args ?? [
        `--username=${username}`,
        `--repo-account=${options.account ?? "octo"}`,
        `--repo-name=${options.repo ?? "repo"}`,
      ]),
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CODE_OWNER_GH_BIN: gh,
        CODE_OWNER_REF: options.ref,
        FAKE_API: JSON.stringify(responses),
      },
    },
  );
  rmSync(directory, { recursive: true, force: true });
  return result;
}

describe("cmd: verify-code-owner", () => {
  it.each([
    ["alice", "octo", "repo"],
    ["--username=alice", "--repo-account=octo"],
    ["--username=", "--repo-account=octo", "--repo-name=repo"],
    [
      "--username=alice",
      "--repo-account=octo",
      "--repo-name=repo",
      "--unknown=yes",
    ],
  ])("should reject invalid command arguments: %j", (...args) => {
    const result = runVerifier({}, "alice", { args });

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("usage:");
  });

  it("should accept only the account owner for a personal repository", () => {
    const responses = {
      "repos/octo/repo": {
        ...repository,
        owner: { login: "octo", type: "User" },
      },
    };
    expect(runVerifier(responses, "octo").status).toBe(0);
    expect(runVerifier(responses, "alice").status).toBe(1);
  });

  it("should accept an active organization owner", () => {
    const result = runVerifier({
      "repos/octo/repo": repository,
      "orgs/octo/memberships/alice": { role: "admin", state: "active" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("owns organization");
  });

  it("should accept a listed user with write access on the selected base revision", () => {
    const result = runVerifier(
      {
        "repos/octo/repo": repository,
        "orgs/octo/memberships/alice": "forbidden",
        "repos/octo/repo/contents/.github/CODEOWNERS?ref=abc":
          createCodeownersResponse("* @alice\n"),
        "repos/octo/repo/codeowners/errors?ref=abc": { errors: [] },
        "repos/octo/repo/collaborators/alice/permission": {
          permission: "write",
        },
      },
      "alice",
      { ref: "abc" },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("listed in .github/CODEOWNERS");
  });

  it("should accept a listed team member only when the team can write the repository", () => {
    const base = {
      "repos/octo/repo": repository,
      "repos/octo/repo/contents/CODEOWNERS?ref=main":
        createCodeownersResponse("* @octo/core\n"),
      "repos/octo/repo/codeowners/errors?ref=main": { errors: [] },
      "orgs/octo/teams/core/memberships/alice": { state: "active" },
    };
    const path = "orgs/octo/teams/core/repos/octo/repo";
    expect(
      runVerifier({ ...base, [path]: { permissions: { push: true } } }).status,
    ).toBe(0);
    expect(
      runVerifier({ ...base, [path]: { permissions: { pull: true } } }).status,
    ).toBe(1);
  });

  it("should read a valid CODEOWNERS file above the Contents API base64 limit", () => {
    const result = runVerifier({
      "repos/octo/repo": repository,
      "repos/octo/repo/contents/CODEOWNERS?ref=main": {
        type: "file",
        encoding: "none",
        content: "",
        size:
          Buffer.byteLength("* @alice\n") +
          120000 * Buffer.byteLength("# filler\n"),
        raw_fixture: "large",
      },
      "repos/octo/repo/codeowners/errors?ref=main": { errors: [] },
      "repos/octo/repo/collaborators/alice/permission": { permission: "write" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("listed in CODEOWNERS");
  });

  it("should check a listed user after an inaccessible team", () => {
    const result = runVerifier({
      "repos/octo/repo": repository,
      "repos/octo/repo/contents/CODEOWNERS?ref=main": createCodeownersResponse(
        "* @octo/core @alice\n",
      ),
      "repos/octo/repo/codeowners/errors?ref=main": { errors: [] },
      "orgs/octo/teams/core/memberships/alice": "forbidden",
      "repos/octo/repo/collaborators/alice/permission": { permission: "write" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("listed in CODEOWNERS");
  });

  it("should ignore an invalid CODEOWNERS line and a lower-priority file", () => {
    const result = runVerifier({
      "repos/octo/repo": repository,
      "repos/octo/repo/contents/.github/CODEOWNERS?ref=main":
        createCodeownersResponse("* @bob\n!bad @alice\n"),
      "repos/octo/repo/contents/CODEOWNERS?ref=main":
        createCodeownersResponse("* @alice\n"),
      "repos/octo/repo/codeowners/errors?ref=main": {
        errors: [{ line: 2, path: ".github/CODEOWNERS" }],
      },
      "repos/octo/repo/collaborators/alice/permission": { permission: "write" },
    });
    expect(result.status).toBe(1);
  });

  it("should fail closed when GitHub cannot verify CODEOWNERS", () => {
    const result = runVerifier({
      "repos/octo/repo": repository,
      "repos/octo/repo/contents/.github/CODEOWNERS?ref=main":
        createCodeownersResponse("* @alice\n"),
      "repos/octo/repo/codeowners/errors?ref=main": "forbidden",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("code_owner_unknown");
  });
});
