import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { cloud, runScript } from "./gh/spec-harness.ts";
import { UNSUPPORTED } from "./gh-repo.ts";

import type { RunOptions } from "./gh/spec-harness.ts";

const script = join(import.meta.dirname, "gh-repo.ts");
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

/** runs gh-repo.ts against the fake gh */
function run(argv: readonly string[], options: RunOptions = {}) {
  return runScript(script, argv, options);
}

describe("cmd:gh-repo", () => {
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

  it.each(Object.keys(UNSUPPORTED))("should refuse unsupported subcommand %s without calling GitHub", (subcommand) => {
    const result = run([subcommand, "example/project"], { env: cloud });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(UNSUPPORTED[subcommand]);
    expect(result.calls).toEqual([]);
  });
});
