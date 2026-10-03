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
    const result = run(["create", "--repo", "example/project", "-t", "New", "-b", "Text"], {
      env: cloud,
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

  it("should refuse a flag the coding skills never pass instead of ignoring it", () => {
    const result = run(["edit", "12", "--repo", "example/project", "--add-label", "bug"], { env: cloud });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--add-label");
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
});
