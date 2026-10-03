import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { cloud, runScript } from "./gh/spec-harness.ts";

import type { RunOptions } from "./gh/spec-harness.ts";

const script = join(import.meta.dirname, "gh-pr-threads.ts");
const thread = { comment_ids: [80, 81], resolved: false, outdated: true, path: "src/index.ts", line: null };

/** runs gh-pr-threads.ts against the fake gh */
function run(argv: readonly string[], options: RunOptions = {}) {
  return runScript(script, argv, options);
}

describe("cmd:gh-pr-threads", () => {
  it("should read threads from the cloud proxy route in a cloud session", () => {
    const result = run(["7", "--repo", "example/project"], {
      env: cloud,
      routes: { "repos/example/project/pulls/7/ccr/review_threads": { body: [thread] } },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([thread]);
    expect(result.calls.some((call) => call.args.includes("graphql"))).toBe(false);
  });

  it("should name the cloud route when it does not return a thread array", () => {
    const result = run(["7", "--repo", "example/project"], {
      env: cloud,
      routes: { "repos/example/project/pulls/7/ccr/review_threads": { body: { threads: [thread] } } },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ccr/review_threads did not return a thread array");
  });

  it("should normalize GraphQL threads onto the cloud shape outside a cloud session", () => {
    const done = { hasNextPage: false, endCursor: null };
    const page = {
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              pageInfo: done,
              nodes: [
                {
                  id: "PRRT_1",
                  isResolved: false,
                  isOutdated: true,
                  path: "src/index.ts",
                  line: null,
                  comments: { pageInfo: done, nodes: [{ databaseId: 80 }, { databaseId: 81 }] },
                },
              ],
            },
          },
        },
      },
    };
    const result = run(["https://github.com/example/project/pull/7"], { routes: { graphql: { body: page } } });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([{ ...thread, node_id: "PRRT_1" }]);
    expect(result.calls[0]!.args).toEqual(expect.arrayContaining(["owner=example", "name=project", "number=7"]));
  });

  it("should refuse a selector that is not a pull request", () => {
    const result = run(["feat/widgets", "--repo", "example/project"], { env: cloud });
    expect(result.status).toBe(1);
    expect(result.calls).toEqual([]);
  });
});
