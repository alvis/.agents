import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { detectRoute } from "./detect.ts";
import { SUBCOMMANDS, UNSUPPORTED } from "./pr.ts";
import { parseRepositorySpec } from "./route.ts";
import { cloud, restCalls, runScript } from "./spec-harness.ts";

import type { Routes, RunOptions } from "./spec-harness.ts";

const scripts = join(import.meta.dirname, "..");
const head = "1".repeat(40);
const base = "2".repeat(40);
const pull = {
  number: 7,
  html_url: "https://github.com/example/project/pull/7",
  title: "Add widgets",
  body: "Body text",
  state: "open",
  draft: true,
  user: { login: "author" },
  base: { ref: "main", sha: base },
  head: {
    ref: "feat/widgets",
    sha: head,
    repo: {
      name: "project",
      full_name: "example/project",
      node_id: "R_1",
      owner: { login: "example", node_id: "U_1" },
    },
  },
  changed_files: 3,
  additions: 10,
  deletions: 2,
  mergeable_state: "clean",
  created_at: "2026-09-28T10:00:00Z",
  updated_at: "2026-09-28T11:00:00Z",
  closed_at: null,
  merged_at: null,
  merge_commit_sha: "3".repeat(40),
  labels: [{ node_id: "L_1", name: "implementation", description: null, color: "ededed" }],
  assignees: [{ node_id: "U_3", login: "assignee" }],
};
const passingRun = {
  name: "test",
  status: "completed",
  conclusion: "success",
  details_url: "https://github.com/example/project/actions/runs/12/job/34",
  started_at: "2026-09-28T09:58:00Z",
  completed_at: "2026-09-28T10:00:00Z",
};

/** runs the `gh-pr-<argv[0]>.ts` drop-in with the remaining arguments against the fake gh */
function run(argv: readonly string[], options: RunOptions = {}) {
  const [subcommand, ...rest] = argv;
  return runScript(join(scripts, `gh-pr-${subcommand}.ts`), rest, options);
}

const project = "repos/example/project";
const pullRoutes: Routes = {
  [`${project}/pulls/7`]: { body: pull },
  [`${project}/commits/${head}/check-runs`]: { body: { check_runs: [passingRun] } },
  [`${project}/commits/${head}/status`]: { body: { statuses: [] } },
};

describe("fn:detectRoute", () => {
  it.each([
    [{}, "native"],
    [{ CLAUDE_CODE_REMOTE: "true" }, "rest"],
    [{ CLAUDE_CODE_REMOTE: "false" }, "native"],
    [{ CLAUDE_CODE_REMOTE: "true", GH_ROUTE: "native" }, "native"],
    [{ GH_ROUTE: "rest" }, "rest"],
  ] as const)("should route %j as %s", (env, expected) => {
    expect(detectRoute(env)).toBe(expected);
  });
});

describe("cmd:gh-pr-<subcommand>", () => {
  it("should ship one drop-in per REST subcommand and none for an unsupported one", () => {
    // gh-pr-threads.ts has no `gh pr` counterpart and serves itself
    const dropIns = readdirSync(scripts)
      .map((name) => /^gh-pr-([a-z-]+)\.ts$/u.exec(name)?.[1])
      .filter((name) => name !== undefined && name !== "threads")
      .sort();
    expect(dropIns).toEqual(Object.keys(SUBCOMMANDS).sort());
    expect(dropIns.filter((name) => name in UNSUPPORTED)).toEqual([]);
  });

  it("should pass every argument through to gh unchanged outside a cloud session", () => {
    const argv = ["view", "7", "--json", "number", "--repo", "example/project"];
    const result = run(argv, { nativeExit: 5 });
    expect(result.calls).toEqual([{ args: ["pr", ...argv], stdin: "" }]);
    expect(result.stdout).toBe(`native pr ${argv.join(" ")}\n`);
    expect(result.status).toBe(5);
  });

  it("should project REST fields onto gh's --json names in a cloud session", () => {
    const result = run(
      [
        "view",
        "7",
        "--repo",
        "example/project",
        "--json",
        "number,state,isDraft,headRefOid,baseRefOid,headRepositoryOwner,mergeStateStatus,statusCheckRollup",
      ],
      { env: cloud, routes: pullRoutes },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      number: 7,
      state: "OPEN",
      isDraft: true,
      headRefOid: head,
      baseRefOid: base,
      headRepositoryOwner: { id: "U_1", login: "example" },
      mergeStateStatus: "CLEAN",
      statusCheckRollup: [
        {
          __typename: "CheckRun",
          name: "test",
          status: "COMPLETED",
          conclusion: "SUCCESS",
          startedAt: "2026-09-28T09:58:00Z",
          completedAt: "2026-09-28T10:00:00Z",
          detailsUrl: passingRun.details_url,
        },
      ],
    });
    expect(result.calls.some((call) => call.args.includes("graphql"))).toBe(false);
  });

  it("should report a merged pull request as MERGED", () => {
    const result = run(["view", "7", "-R", "example/project", "--json", "state", "-q", ".state"], {
      env: cloud,
      routes: { [`${project}/pulls/7`]: { body: { ...pull, state: "closed", merged_at: "2026-09-29T00:00:00Z" } } },
    });
    expect(result.stdout).toBe("MERGED\n");
  });

  it("should project timestamps, merge details, labels and assignees", () => {
    const merged = { ...pull, state: "closed", closed_at: "2026-09-29T00:00:00Z", merged_at: "2026-09-29T00:00:00Z", merged_by: { login: "merger" } };
    const result = run(
      ["view", "7", "--repo", "example/project", "--json", "createdAt,updatedAt,closed,closedAt,mergedAt,mergedBy,mergeCommit,labels,assignees"],
      { env: cloud, routes: { [`${project}/pulls/7`]: { body: merged } } },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      createdAt: "2026-09-28T10:00:00Z",
      updatedAt: "2026-09-28T11:00:00Z",
      closed: true,
      closedAt: "2026-09-29T00:00:00Z",
      mergedAt: "2026-09-29T00:00:00Z",
      mergedBy: { login: "merger" },
      mergeCommit: { oid: "3".repeat(40) },
      labels: [{ id: "L_1", name: "implementation", description: "", color: "ededed" }],
      assignees: [{ id: "U_3", login: "assignee" }],
    });
  });

  it("should leave the merge commit null on an unmerged pull request", () => {
    const result = run(["view", "7", "--repo", "example/project", "--json", "mergeCommit,mergedAt,closed"], {
      env: cloud,
      routes: pullRoutes,
    });
    expect(JSON.parse(result.stdout)).toEqual({ mergeCommit: null, mergedAt: null, closed: false });
  });

  it("should list the accepted flags for --help without calling GitHub", () => {
    const result = run(["list", "--help"], { env: cloud });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("usage: gh-pr-list.ts");
    expect(result.stdout).toContain("-s, --state <value>");
    expect(result.stdout).toContain("-R, --repo <value>");
    expect(result.calls).toEqual([]);
  });

  it("should select a pull request by its head branch in any fork, preferring an open one", () => {
    const fork = { ...pull, number: 8, head: { ...pull.head, repo: { ...pull.head.repo, owner: { login: "contributor", node_id: "U_2" } } } };
    const result = run(["view", "feat/widgets", "--repo", "example/project", "--json", "number"], {
      env: cloud,
      routes: {
        [`${project}/pulls?state=open`]: { body: [{ ...pull, number: 5, head: { ...pull.head, ref: "other" } }, fork] },
      },
    });
    expect(JSON.parse(result.stdout)).toEqual({ number: 8 });
    expect(restCalls(result)).toEqual([`GET ${project}/pulls?state=open&per_page=100&page=1`]);
  });

  it("should fall back to a closed pull request when no open one has the head branch", () => {
    const result = run(["view", "example:feat/widgets", "--repo", "example/project", "--json", "number"], {
      env: cloud,
      routes: {
        [`${project}/pulls?state=open`]: { body: [] },
        [`${project}/pulls?state=all`]: { body: [{ ...pull, number: 6, state: "closed" }] },
      },
    });
    expect(JSON.parse(result.stdout)).toEqual({ number: 6 });
    expect(restCalls(result)).toEqual([
      `GET ${project}/pulls?state=open&head=example%3Afeat%2Fwidgets&per_page=100&page=1`,
      `GET ${project}/pulls?state=all&head=example%3Afeat%2Fwidgets&per_page=100&page=1`,
    ]);
  });

  it("should list by head branch in any fork and state with the requested fields", () => {
    const result = run(
      ["list", "--repo", "example/project", "--head", "feat/widgets", "--state", "all", "--json", "number,headRepositoryOwner"],
      { env: cloud, routes: { [`${project}/pulls?`]: { body: [{ ...pull, number: 5, head: { ...pull.head, ref: "other" } }, pull] } } },
    );
    expect(JSON.parse(result.stdout)).toEqual([
      { number: 7, headRepositoryOwner: { id: "U_1", login: "example" } },
    ]);
    expect(restCalls(result)).toEqual([`GET ${project}/pulls?state=all&per_page=100&page=1`]);
  });

  it("should print merged pull requests as MERGED like gh", () => {
    const merged = { ...pull, state: "closed", merged_at: "2026-09-29T10:00:00Z" };
    const result = run(["list", "--repo", "example/project", "--state", "all"], {
      env: cloud,
      routes: { [`${project}/pulls?`]: { body: [merged, { ...pull, number: 8, state: "closed" }] } },
    });
    expect(result.stdout).toBe("7\tAdd widgets\tfeat/widgets\tMERGED\n8\tAdd widgets\tfeat/widgets\tCLOSED\n");
  });

  it("should stop reading pages once --limit pull requests are found", () => {
    const page = Array.from({ length: 100 }, (_, index) => ({ ...pull, number: index + 1 }));
    const result = run(["list", "--repo", "example/project", "--limit", "100", "--json", "number"], {
      env: cloud,
      routes: { [`${project}/pulls?`]: { body: page } },
    });
    expect(JSON.parse(result.stdout)).toHaveLength(100);
    expect(restCalls(result)).toEqual([`GET ${project}/pulls?state=open&per_page=100&page=1`]);
  });

  it("should create a draft pull request from a stdin body and print its URL", () => {
    const result = run(
      ["create", "--repo", "example/project", "--draft", "--title", "Add widgets", "--body-file", "-", "--base", "main", "--head", "example:feat/widgets"],
      { env: cloud, stdin: "Body from stdin", routes: { [`${project}/pulls`]: { body: pull } } },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(`${pull.html_url}\n`);
    const call = result.calls.find((entry) => entry.args.includes("POST"))!;
    expect(JSON.parse(call.stdin)).toEqual({
      title: "Add widgets",
      body: "Body from stdin",
      base: "main",
      head: "example:feat/widgets",
      draft: true,
    });
  });

  it("should edit the base through REST", () => {
    const result = run(["edit", "7", "--repo", "example/project", "--base", "develop"], {
      env: cloud,
      routes: pullRoutes,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(restCalls(result)).toEqual([`GET ${project}/pulls/7`, `PATCH ${project}/pulls/7`]);
    expect(JSON.parse(result.calls.at(-1)!.stdin)).toEqual({ base: "develop" });
  });

  it.each([
    [["ready", "7"], "ready_for_review"],
    [["ready", "7", "--undo"], "convert_to_draft"],
  ])("should change draft state through the cloud proxy route for %j", (argv, route) => {
    const result = run([...argv, "--repo", "example/project"], {
      env: cloud,
      routes: { ...pullRoutes, [`${project}/pulls/7/ccr/`]: { body: {} } },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(restCalls(result).at(-1)).toBe(`POST ${project}/pulls/7/ccr/${route}`);
  });

  it("should merge with the selected method and keep the branch", () => {
    const result = run(["merge", "7", "--repo", "example/project", "--squash", "--delete-branch=false"], {
      env: cloud,
      routes: { ...pullRoutes, [`${project}/pulls/7/merge`]: { body: { merged: true } } },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(restCalls(result)).toEqual([`GET ${project}/pulls/7`, `PUT ${project}/pulls/7/merge`]);
    expect(JSON.parse(result.calls.at(-1)!.stdin)).toEqual({ merge_method: "squash" });
  });

  it.each([["--delete-branch"], ["-d"]])("should refuse merge %s before any write", (flag) => {
    const result = run(["merge", "7", "--squash", flag, "--repo", "example/project"], { env: cloud, routes: pullRoutes });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(UNSUPPORTED["--delete-branch"]);
    expect(result.calls).toEqual([]);
  });

  it.each([
    [passingRun, 0],
    [{ ...passingRun, conclusion: "failure" }, 1],
    [{ ...passingRun, status: "in_progress", conclusion: null, completed_at: null }, 8],
  ] as const)("should exit like gh pr checks for %j", (checkRun, exit) => {
    const result = run(["checks", "7", "--repo", "example/project"], {
      env: cloud,
      routes: { ...pullRoutes, [`${project}/commits/${head}/check-runs`]: { body: { check_runs: [checkRun] } } },
    });
    expect(result.status).toBe(exit);
  });

  it.each([
    [["view", "7", "--web"], "--web"],
    [["checks", "7", "--json", "name"], "--json"],
    [["create", "--title", "Add widgets", "--body", "text"], "--body"],
  ])("should refuse %j by naming %s instead of ignoring it", (argv, flag) => {
    const result = run([...argv, "--repo", "example/project"], { env: cloud });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(flag);
    expect(result.calls).toEqual([]);
  });

  it("should refuse a --json field the REST route cannot produce", () => {
    const result = run(["view", "7", "--repo", "example/project", "--json", "reviewDecision"], {
      env: cloud,
      routes: pullRoutes,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("reviewDecision");
  });

});

describe("fn:parseRepositorySpec", () => {
  it.each([
    ["https://x-access-token:secret@github.com/example/project.git", "github.com"],
    ["ssh://git@ghe.example.com:2222/example/project.git", "ghe.example.com"],
    ["git@github.com:example/project.git", "github.com"],
    ["ghe.example.com/example/project", "ghe.example.com"],
  ])("should drop credentials and ports from %s", (spec, host) => {
    expect(parseRepositorySpec(spec)).toEqual({ host, owner: "example", repo: "project" });
  });
});
