import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SUBCOMMANDS, UNSUPPORTED } from "./pr.ts";
import { detectRoute, parseRepositorySpec } from "./route.ts";

interface Call {
  readonly args: string[];
  readonly stdin: string;
}

interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly calls: Call[];
}

/** a REST response keyed by a path prefix the fake gh matches */
type Routes = Record<string, { readonly body: unknown; readonly exit?: number }>;

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
};
const passingRun = {
  name: "test",
  status: "completed",
  conclusion: "success",
  details_url: "https://github.com/example/project/actions/runs/12/job/34",
  started_at: "2026-09-28T09:58:00Z",
  completed_at: "2026-09-28T10:00:00Z",
};

/**
 * runs the `gh-pr-<argv[0]>.ts` drop-in with the remaining arguments against a fake `gh` that records every call and answers
 * `gh api` paths from `routes`; any other call is the native passthrough
 */
function run(
  argv: readonly string[],
  options: { env?: Record<string, string>; routes?: Routes; nativeExit?: number; stdin?: string } = {},
): Run {
  const root = mkdtempSync(join(tmpdir(), "gh-pr-spec-"));
  try {
    const record = join(root, "calls.jsonl");
    writeFileSync(
      join(root, "gh"),
      `#!/usr/bin/env bun
import { appendFileSync, readFileSync } from "node:fs";
const args = process.argv.slice(2);
const stdin = args.includes("--input") ? readFileSync(0, "utf8") : "";
appendFileSync(process.env.FAKE_RECORD, JSON.stringify({ args, stdin }) + "\\n");
if (args[0] !== "api") { process.stdout.write("native " + args.join(" ") + "\\n"); process.exit(Number(process.env.FAKE_NATIVE_EXIT)); }
const path = args.find((arg) => arg.startsWith("repos/")) ?? "";
const routes = JSON.parse(process.env.FAKE_ROUTES);
const key = Object.keys(routes).filter((prefix) => path.startsWith(prefix)).sort((a, b) => b.length - a.length)[0];
if (key === undefined) { process.stderr.write("no fake route for " + path); process.exit(3); }
const route = routes[key];
const paginate = args.includes("--slurp");
process.stdout.write(JSON.stringify(paginate && !Array.isArray(route.body?.[0]) ? [route.body] : route.body));
process.exit(route.exit ?? 0);
`,
      { mode: 0o755 },
    );
    const [subcommand, ...rest] = argv;
    const result = spawnSync("bun", [join(scripts, `gh-pr-${subcommand}.ts`), ...rest], {
      encoding: "utf8",
      input: options.stdin ?? "",
      env: {
        ...process.env,
        PATH: `${root}:${process.env.PATH}`,
        FAKE_RECORD: record,
        FAKE_ROUTES: JSON.stringify(options.routes ?? {}),
        FAKE_NATIVE_EXIT: String(options.nativeExit ?? 0),
        GH_ROUTE: "",
        CLAUDE_CODE_REMOTE: "",
        ...options.env,
      },
    });
    const calls = existsSync(record)
      ? readFileSync(record, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Call)
      : [];
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const cloud = { CLAUDE_CODE_REMOTE: "true" };
const project = "repos/example/project";
const pullRoutes: Routes = {
  [`${project}/pulls/7`]: { body: pull },
  [`${project}/commits/${head}/check-runs`]: { body: { check_runs: [passingRun] } },
  [`${project}/commits/${head}/status`]: { body: { statuses: [] } },
};

/** the REST calls a run made, as `METHOD path` */
function restCalls(result: Run): string[] {
  return result.calls
    .filter((call) => call.args[0] === "api")
    .map((call) => {
      const method = call.args[call.args.indexOf("--method") + 1];
      return `${call.args.includes("--method") ? method : "GET"} ${call.args.find((arg) => arg.startsWith("repos/"))}`;
    });
}

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
    const dropIns = readdirSync(scripts)
      .map((name) => /^gh-pr-([a-z-]+)\.ts$/u.exec(name)?.[1])
      .filter((name) => name !== undefined)
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
          workflowName: "",
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

  it("should refuse a flag the REST route cannot honor instead of ignoring it", () => {
    const result = run(["view", "7", "--repo", "example/project", "--web"], { env: cloud });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--web");
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
