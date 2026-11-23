import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const helper = resolve(import.meta.dirname, "fetch-review-loop-discussion.sh");
const prUrl = "https://github.example.test/octo/repo/pull/42";
const metadata = {
  host: "github.example.test",
  number: 42,
  owner: "octo",
  repo: "repo",
  url: prUrl,
};
const issueCommentsEndpoint = "repos/octo/repo/issues/42/comments?per_page=100";
const reviewsEndpoint = "repos/octo/repo/pulls/42/reviews?per_page=100";
const inlineCommentsEndpoint = "repos/octo/repo/pulls/42/comments?per_page=100";
const pages: Record<string, unknown[][]> = {
  [issueCommentsEndpoint]: [[{ id: 1 }], [{ id: 2 }]],
  [reviewsEndpoint]: [[{ id: 3, body: "P1: missing test" }]],
  [inlineCommentsEndpoint]: [[{ id: 4 }, { id: 5 }]],
};
const threads = { threads: [{ id: "T1", comment_ids: [4, 5] }] };
const roots: string[] = [];

interface Fixture {
  readonly failing?: string;
}

/** lays out a fake coding plugin whose gh, resolver and threads helper serve fixed pages */
function fixture({ failing }: Fixture = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "fetch-discussion-"));
  roots.push(root);
  const bin = resolve(root, "bin");
  const skill = resolve(root, "plugin/skills/pr");
  mkdirSync(bin);
  mkdirSync(resolve(skill, "scripts"), { recursive: true });
  mkdirSync(resolve(root, "plugin/scripts"));
  const requests = resolve(root, "requests.jsonl");
  writeFileSync(
    resolve(bin, "gh"),
    [
      "#!/usr/bin/env bash",
      'jq -cn \'$ARGS.positional\' --args -- "$@" >>"$GH_REQUESTS"',
      'endpoint=${!#}',
      '[ "$endpoint" = "$GH_FAILING" ] && exit 7',
      'jq -c --arg endpoint "$endpoint" \'.[$endpoint]\' <<<"$GH_PAGES"',
    ].join("\n"),
  );
  chmodSync(resolve(bin, "gh"), 0o755);
  writeFileSync(
    resolve(skill, "scripts/resolve-pr.sh"),
    `#!/usr/bin/env bash\n[ "$1" = "${prUrl}" ] || exit 2\nprintf '%s\\n' '${JSON.stringify(metadata)}'\n`,
  );
  writeFileSync(
    resolve(root, "plugin/scripts/gh-pr-threads.ts"),
    `if (process.env.GH_FAILING === "threads") process.exit(9);\nconsole.log(JSON.stringify(${JSON.stringify(threads)}));\n`,
  );
  const env = {
    ...process.env,
    CODING_PR_SKILL_DIR: skill,
    GH_FAILING: failing ?? "",
    GH_PAGES: JSON.stringify(pages),
    GH_REQUESTS: requests,
    PATH: `${bin}:${process.env.PATH}`,
  };
  const readRequests = (): string[][] =>
    readFileSync(requests, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]);
  return { env, readRequests };
}

function records(stdout: string): unknown[] {
  return stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as unknown);
}

function record(kind: string, value: unknown) {
  return {
    host: "github.example.test",
    owner: "octo",
    repo: "repo",
    pr_number: 42,
    kind,
    value,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("pull-request discussion collection", () => {
  it("should print every page of every discussion kind as tagged records, threads last", () => {
    const { env } = fixture();

    const result = spawnSync("/bin/bash", [helper, prUrl], { encoding: "utf8", env });

    expect(result.status, result.stderr).toBe(0);
    expect(records(result.stdout)).toEqual([
      record("issue_comment", { id: 1 }),
      record("issue_comment", { id: 2 }),
      record("review", { id: 3, body: "P1: missing test" }),
      record("inline_comment", { id: 4 }),
      record("inline_comment", { id: 5 }),
      record("review_threads", threads),
    ]);
  });

  it("should read each REST connection through every page without a write method or payload", () => {
    const { env, readRequests } = fixture();

    spawnSync("/bin/bash", [helper, prUrl], { encoding: "utf8", env });

    expect(readRequests()).toEqual(
      [issueCommentsEndpoint, reviewsEndpoint, inlineCommentsEndpoint].map(
        (endpoint) => [
          "api",
          "--hostname",
          "github.example.test",
          "--paginate",
          "--slurp",
          endpoint,
        ],
      ),
    );
  });

  it.each([
    ["issue comments", issueCommentsEndpoint, 7],
    ["reviews", reviewsEndpoint, 7],
    ["inline comments", inlineCommentsEndpoint, 7],
    ["review threads", "threads", 9],
  ])(
    "should print no record when the %s read fails",
    (_source, failing, status) => {
      const { env } = fixture({ failing });

      const result = spawnSync("/bin/bash", [helper, prUrl], { encoding: "utf8", env });

      expect({ status: result.status, stdout: result.stdout }).toEqual({
        status,
        stdout: "",
      });
    },
  );

  it("should bind the canonical coordinates in a sourcing shell", () => {
    const { env } = fixture();

    const result = spawnSync(
      "/bin/bash",
      [
        "-c",
        'source "$0" "$1" >/dev/null && printf "%s %s %s %s" "$HOST" "$OWNER" "$REPO" "$PR_NUMBER"',
        helper,
        prUrl,
      ],
      { encoding: "utf8", env },
    );

    expect(result.stdout).toBe("github.example.test octo repo 42");
  });
});
