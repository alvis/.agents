import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { cloud, runScript } from "./spec-harness.ts";
import { SUBCOMMANDS } from "./repo.ts";

import type { RunOptions } from "./spec-harness.ts";

const scripts = join(import.meta.dirname, "..");
const repository = {
  node_id: "R_1",
  name: "project",
  full_name: "example/project",
  html_url: "https://github.com/example/project",
  description: null,
  default_branch: "main",
  private: true,
  visibility: "internal",
  owner: { login: "example", node_id: "U_1" },
};

/** runs the `gh-repo-<argv[0]>.ts` drop-in with the remaining arguments against the fake gh */
function run(argv: readonly string[], options: RunOptions = {}) {
  const [subcommand, ...rest] = argv;
  return runScript(join(scripts, `gh-repo-${subcommand}.ts`), rest, options);
}

describe("cmd:gh-repo-<subcommand>", () => {
  it("should ship one drop-in per REST subcommand", () => {
    const dropIns = readdirSync(scripts)
      .map((name) => /^gh-repo-([a-z-]+)\.ts$/u.exec(name)?.[1])
      .filter((name) => name !== undefined)
      .sort();
    expect(dropIns).toEqual(Object.keys(SUBCOMMANDS).sort());
  });

  it("should pass every argument through to gh unchanged outside a cloud session", () => {
    const argv = ["view", "example/project", "--json", "name"];
    const result = run(argv, { nativeExit: 2 });
    expect(result.calls).toEqual([{ args: ["repo", ...argv], stdin: "" }]);
    expect(result.status).toBe(2);
  });

  it("should project REST fields onto gh's --json names in a cloud session", () => {
    const result = run(
      ["view", "example/project", "--json", "nameWithOwner,owner,defaultBranchRef,isPrivate,visibility,description"],
      { env: cloud, routes: { "repos/example/project": { body: repository } } },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      nameWithOwner: "example/project",
      owner: { id: "U_1", login: "example" },
      defaultBranchRef: { name: "main" },
      isPrivate: true,
      visibility: "INTERNAL",
      description: "",
    });
  });

  it("should resolve --repo when no positional repository is given", () => {
    const result = run(["view", "--repo", "example/project", "--json", "url", "-q", ".url"], {
      env: cloud,
      routes: { "repos/example/project": { body: repository } },
    });
    expect(result.stdout).toBe(`${repository.html_url}\n`);
  });

  it("should clone through git over HTTPS, forwarding flags after --", () => {
    const result = run(["clone", "example/project", "work", "--", "--depth", "1"], { env: cloud, fakeGit: true });
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls).toEqual([
      { args: ["git", "clone", "--depth", "1", "https://github.com/example/project.git", "work"], stdin: "" },
    ]);
  });
});
