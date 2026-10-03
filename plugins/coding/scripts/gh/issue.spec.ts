import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { cloud, requestBody, restCalls, runScript } from "./spec-harness.ts";
import { SUBCOMMANDS, UNSUPPORTED } from "./issue.ts";

import type { RunOptions } from "./spec-harness.ts";

const scripts = join(import.meta.dirname, "..");
const project = "repos/example/project";
const issue = {
  number: 12,
  html_url: "https://github.com/example/project/issues/12",
  title: "Widgets break",
  body: "Steps",
  state: "closed",
  state_reason: "not_planned",
  user: { login: "reporter" },
  labels: [{ name: "bug" }],
  assignees: [{ login: "fixer" }],
  created_at: "2026-09-28T10:00:00Z",
  updated_at: "2026-09-28T11:00:00Z",
  closed_at: "2026-09-29T00:00:00Z",
};
const issueRoutes = { [`${project}/issues/12`]: { body: issue } };

/** runs the `gh-issue-<argv[0]>.ts` drop-in with the remaining arguments against the fake gh */
function run(argv: readonly string[], options: RunOptions = {}) {
  const [subcommand, ...rest] = argv;
  return runScript(join(scripts, `gh-issue-${subcommand}.ts`), rest, options);
}

describe("cmd:gh-issue-<subcommand>", () => {
  it("should ship one drop-in per REST subcommand and none for an unsupported one", () => {
    const dropIns = readdirSync(scripts)
      .map((name) => /^gh-issue-([a-z-]+)\.ts$/u.exec(name)?.[1])
      .filter((name) => name !== undefined)
      .sort();
    expect(dropIns).toEqual(Object.keys(SUBCOMMANDS).sort());
    expect(dropIns.filter((name) => name in UNSUPPORTED)).toEqual([]);
  });

  it("should pass every argument through to gh unchanged outside a cloud session", () => {
    const argv = ["close", "12", "--duplicate-of", "3", "--repo", "example/project"];
    const result = run(argv, { nativeExit: 4 });
    expect(result.calls).toEqual([{ args: ["issue", ...argv], stdin: "" }]);
    expect(result.status).toBe(4);
  });

  it("should project REST fields onto gh's --json names in a cloud session", () => {
    const result = run(
      ["view", "12", "--repo", "example/project", "--json", "number,state,stateReason,author,labels,assignees"],
      { env: cloud, routes: issueRoutes },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      number: 12,
      state: "CLOSED",
      stateReason: "NOT_PLANNED",
      author: { login: "reporter" },
      labels: [{ name: "bug" }],
      assignees: [{ login: "fixer" }],
    });
  });

  it("should take the repository from an issue URL", () => {
    const result = run(["view", issue.html_url, "--json", "title", "--jq", ".title"], {
      env: cloud,
      routes: issueRoutes,
    });
    expect(result.stdout).toBe("Widgets break\n");
  });

  it("should create an issue with labels and a named milestone", () => {
    const result = run(
      ["create", "--repo", "example/project", "-t", "New", "-b", "Text", "-l", "bug", "--label", "ui", "-m", "v2"],
      {
        env: cloud,
        routes: {
          [`${project}/milestones`]: { body: [{ number: 5, title: "v2" }] },
          [`${project}/issues`]: { body: issue },
        },
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(`${issue.html_url}\n`);
    expect(requestBody(result, `POST ${project}/issues`)).toEqual({
      title: "New",
      body: "Text",
      labels: ["bug", "ui"],
      milestone: 5,
    });
  });

  it("should split an edit into field, label, and assignee requests", () => {
    const result = run(
      ["edit", "12", "--repo", "example/project", "--title", "Renamed", "--add-label", "bug", "--remove-label", "needs triage", "--remove-assignee", "fixer"],
      { env: cloud, routes: { [`${project}/issues/12`]: { body: issue } } },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(restCalls(result)).toEqual([
      `PATCH ${project}/issues/12`,
      `POST ${project}/issues/12/labels`,
      `DELETE ${project}/issues/12/labels/needs%20triage`,
      `DELETE ${project}/issues/12/assignees`,
    ]);
    expect(requestBody(result, `PATCH ${project}/issues/12`)).toEqual({ title: "Renamed" });
    expect(requestBody(result, `DELETE ${project}/issues/12/assignees`)).toEqual({ assignees: ["fixer"] });
  });

  it("should post a comment from a stdin body", () => {
    const result = run(["comment", "12", "--repo", "example/project", "--body-file", "-"], {
      env: cloud,
      stdin: "Looks fixed",
      routes: { [`${project}/issues/12/comments`]: { body: { html_url: `${issue.html_url}#c1` } } },
    });
    expect(result.stdout).toBe(`${issue.html_url}#c1\n`);
    expect(requestBody(result, `POST ${project}/issues/12/comments`)).toEqual({ body: "Looks fixed" });
  });

  it.each([
    [[], "completed"],
    [["--reason", "not planned"], "not_planned"],
  ])("should close with reason %j as %s", (flags, reason) => {
    const result = run(["close", "12", "--repo", "example/project", ...flags], { env: cloud, routes: issueRoutes });
    expect(result.status, result.stderr).toBe(0);
    expect(requestBody(result, `PATCH ${project}/issues/12`)).toEqual({ state: "closed", state_reason: reason });
  });

  it("should comment before reopening", () => {
    const result = run(["reopen", "12", "--repo", "example/project", "-c", "Regressed"], {
      env: cloud,
      routes: issueRoutes,
    });
    expect(restCalls(result)).toEqual([`POST ${project}/issues/12/comments`, `PATCH ${project}/issues/12`]);
    expect(requestBody(result, `PATCH ${project}/issues/12`)).toEqual({ state: "open" });
  });

  it("should refuse duplicate closure by name", () => {
    const result = run(["close", "12", "--repo", "example/project", "--duplicate-of", "3"], { env: cloud });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(UNSUPPORTED["close --duplicate-of"]);
    expect(result.calls).toEqual([]);
  });
});
