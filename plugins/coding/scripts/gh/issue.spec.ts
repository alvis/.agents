import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { cloud, requestBody, restCalls, runScript } from "./spec-harness.ts";
import { SUBCOMMANDS } from "./issue.ts";

import type { RunOptions } from "./spec-harness.ts";

const scripts = join(import.meta.dirname, "..");
const project = "repos/example/project";
const issue = { html_url: "https://github.com/example/project/issues/12" };

/** runs the `gh-issue-<argv[0]>.ts` drop-in with the remaining arguments against the fake gh */
function run(argv: readonly string[], options: RunOptions = {}) {
  const [subcommand, ...rest] = argv;
  return runScript(join(scripts, `gh-issue-${subcommand}.ts`), rest, options);
}

describe("cmd:gh-issue-<subcommand>", () => {
  it("should ship one drop-in per REST subcommand", () => {
    const dropIns = readdirSync(scripts)
      .map((name) => /^gh-issue-([a-z-]+)\.ts$/u.exec(name)?.[1])
      .filter((name) => name !== undefined)
      .sort();
    expect(dropIns).toEqual(Object.keys(SUBCOMMANDS).sort());
  });

  it("should pass every argument through to gh unchanged outside a cloud session", () => {
    const argv = ["edit", "12", "--add-label", "bug", "--repo", "example/project"];
    const result = run(argv, { nativeExit: 4 });
    expect(result.calls).toEqual([{ args: ["issue", ...argv], stdin: "" }]);
    expect(result.status).toBe(4);
  });

  it("should create an issue and print its URL", () => {
    const result = run(["create", "--repo", "example/project", "-t", "New", "--body-file", "-"], {
      env: cloud,
      stdin: "Text",
      routes: { [`${project}/issues`]: { body: issue } },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(`${issue.html_url}\n`);
    expect(requestBody(result, `POST ${project}/issues`)).toEqual({ title: "New", body: "Text" });
  });

  it("should edit the title and body of an issue named by URL in one request", () => {
    const result = run(["edit", issue.html_url, "--title", "Renamed", "--body-file", "-"], {
      env: cloud,
      stdin: "New text",
      routes: { [`${project}/issues/12`]: { body: issue } },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(restCalls(result)).toEqual([`PATCH ${project}/issues/12`]);
    expect(requestBody(result, `PATCH ${project}/issues/12`)).toEqual({ title: "Renamed", body: "New text" });
  });

  it.each([
    [["edit", "12", "--add-label", "bug"], "--add-label"],
    [["comment", "12", "--body", "text"], "--body"],
  ])("should refuse %j by naming %s instead of ignoring it", (argv, flag) => {
    const result = run([...argv, "--repo", "example/project"], { env: cloud });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(flag);
    expect(result.calls).toEqual([]);
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
    [["comment", "12", "--edit-last", "--body-file", "-"]],
    [["comment", "12", "--delete-last", "--yes"]],
  ])("should pass %j through to gh unchanged outside a cloud session", (argv) => {
    const result = run([...argv, "--repo", "example/project"]);
    expect(result.calls).toEqual([{ args: ["issue", ...argv, "--repo", "example/project"], stdin: "" }]);
    expect(result.status).toBe(0);
  });

  const comments = [
    { id: 7, user: { login: "me" }, html_url: `${issue.html_url}#issuecomment-7` },
    { id: 8, user: { login: "other" }, html_url: `${issue.html_url}#issuecomment-8` },
    { id: 9, user: { login: "me" }, html_url: `${issue.html_url}#issuecomment-9` },
    { id: 10, user: { login: "other" }, html_url: `${issue.html_url}#issuecomment-10` },
  ];

  it("should edit the viewer's last comment by id", () => {
    const result = run(["comment", "12", "--repo", "example/project", "--edit-last", "--body-file", "-"], {
      env: cloud,
      stdin: "Corrected",
      routes: {
        "": { body: { login: "me" } },
        [`${project}/issues/12/comments`]: { body: comments },
        [`${project}/issues/comments/9`]: { body: comments[2] },
      },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(`${comments[2]!.html_url}\n`);
    expect(restCalls(result).at(-1)).toBe(`PATCH ${project}/issues/comments/9`);
    expect(requestBody(result, `PATCH ${project}/issues/comments/9`)).toEqual({ body: "Corrected" });
  });

  it("should delete the viewer's last comment by id", () => {
    const result = run(["comment", "12", "--repo", "example/project", "--delete-last", "--yes"], {
      env: cloud,
      routes: {
        "": { body: { login: "me" } },
        [`${project}/issues/12/comments`]: { body: comments },
        [`${project}/issues/comments/9`]: { body: "" },
      },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(restCalls(result).at(-1)).toBe(`DELETE ${project}/issues/comments/9`);
  });

  it("should page through every comment to find the viewer's last one", () => {
    const page = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, user: { login: "me" } }));
    const result = run(["comment", "12", "--repo", "example/project", "--delete-last", "--yes"], {
      env: cloud,
      routes: {
        "": { body: { login: "me" } },
        [`${project}/issues/12/comments`]: { body: page },
        [`${project}/issues/12/comments?per_page=100&page=2`]: { body: [{ id: 150, user: { login: "me" } }] },
        [`${project}/issues/comments/150`]: { body: "" },
      },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(restCalls(result).at(-1)).toBe(`DELETE ${project}/issues/comments/150`);
  });

  it("should refuse when the viewer has no comment on the issue", () => {
    const result = run(["comment", "12", "--repo", "example/project", "--delete-last", "--yes"], {
      env: cloud,
      routes: { "": { body: { login: "nobody" } }, [`${project}/issues/12/comments`]: { body: comments } },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no comment by nobody");
    expect(restCalls(result).some((call) => call.startsWith("PATCH") || call.startsWith("DELETE"))).toBe(false);
  });

  it.each([
    [["comment", "12", "--delete-last"], "--yes"],
    [["comment", "12", "--edit-last", "--delete-last", "--yes"], "--edit-last"],
    [["comment", "12", "--edit-last"], "--body-file"],
    [["comment", "12", "--delete-last", "--yes", "--body-file", "note.md"], "--body-file"],
  ])("should refuse %j by naming %s before any write", (argv, flag) => {
    const result = run([...argv, "--repo", "example/project"], { env: cloud });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(flag);
    expect(result.calls).toEqual([]);
  });
});
