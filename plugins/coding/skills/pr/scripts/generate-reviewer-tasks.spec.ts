import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  createGitHubApi as createLiveGitHubApi,
  generateReviewerTasks,
  inspectReviewerTaskBlock,
  renderReviewerTaskBlock,
  runReviewerTasksCli,
  upsertReviewerTaskBlock,
  type GitHubApi,
} from "./generate-reviewer-tasks";

const headOid = "1".repeat(40);
const baseOid = "2".repeat(40);
const body = "Summary\n\n## 🧪 Verification\n\n- [x] Tests pass.\n";

function createGitHubApi(overrides: Partial<GitHubApi> = {}): GitHubApi {
  const get = overrides.get ?? vi.fn(async (path: string) => {
      if (path.endsWith("/pulls/7"))
        return {
          base: { sha: baseOid },
          body,
          commits: 2,
          draft: false,
          merged: false,
          state: "open",
          head: { sha: headOid }, user: { login: "author" },
        };
      if (path.endsWith("/requested_reviewers"))
        return { teams: [], users: [{ login: "assigned" }] };
      if (path === "repos/acme/widget")
        return { owner: { login: "acme", type: "Organization" } };
      throw new Error(`unexpected GET ${path}`);
    });
  return {
    get,
    listPages: vi.fn(async (path: string) => [await get(path)]),
    list: vi.fn(async (path: string) => {
      if (path.endsWith("/commits"))
        return [
          { author: { login: "author" }, sha: "a".repeat(40) },
          { author: { login: "ASSIGNED" }, sha: "b".repeat(40) },
        ];
      if (path === "orgs/acme/members?role=admin") return [{ login: "owner" }];
      throw new Error(`unexpected LIST ${path}`);
    }),
    patch: vi.fn(async () => ({})),
    ...overrides,
  };
}

describe("fn:generateReviewerTasks", () => {
  it("should combine assigned users, teams, and commit authors by account", async () => {
    const github = createGitHubApi({
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/pulls/7"))
          return {
            base: { sha: baseOid },
            body,
            commits: 2,
            draft: false,
            merged: false,
            state: "open",
            head: { sha: headOid }, user: { login: "author" },
          };
        if (path.endsWith("/requested_reviewers"))
          return {
            teams: [{ slug: "platform" }],
            users: [{ login: "assigned" }],
          };
        if (path === "repos/acme/widget")
          return { owner: { login: "acme", type: "Organization" } };
        throw new Error(`unexpected GET ${path}`);
      }),
    });

    await expect(
      generateReviewerTasks(github, "acme/widget", 7),
    ).resolves.toMatchObject({
      authorMention: "@author",
      baseOid,
      body,
      headOid,
      mentions: ["@assigned", "@acme/platform", "@author"],
    });
    expect(github.list).not.toHaveBeenCalledWith(
      "orgs/acme/members?role=admin",
    );
  });

  it("should assign the PR creator an approval task even when another account authored the commits", async () => {
    const github = createGitHubApi({
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/pulls/7"))
          return { base: { sha: baseOid }, body, commits: 2, draft: false, merged: false, state: "open", head: { sha: headOid }, user: { login: "creator" } };
        if (path.endsWith("/requested_reviewers"))
          return { teams: [], users: [{ login: "assigned" }] };
        if (path === "repos/acme/widget")
          return { owner: { login: "acme", type: "Organization" } };
        throw new Error(`unexpected GET ${path}`);
      }),
    });

    const result = await generateReviewerTasks(github, "acme/widget", 7);
    expect(result.mentions).toEqual(["@assigned", "@author"]);
    expect(result.authorMention).toBe("@creator");
    expect(renderReviewerTaskBlock({ ...result, hasBlackZoneVerification: false }))
      .toContain(`- [ ] @creator approves ${headOid.slice(0, 7)}`);
  });

  it.each([true, false])("should use a personal owner for draft=%s with no assignee", async (draft) => {
    const github = createGitHubApi({
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/pulls/7"))
          return {
            base: { sha: baseOid },
            body,
            commits: 1,
            draft,
            merged: false,
            state: "open",
            head: { sha: headOid }, user: { login: "author" },
          };
        if (path.endsWith("/requested_reviewers"))
          return { teams: [], users: [] };
        if (path === "repos/alice/widget")
          return { owner: { login: "alice", type: "User" } };
        throw new Error(`unexpected GET ${path}`);
      }),
      list: vi.fn(async () => [
        { author: { login: "author" }, sha: "a".repeat(40) },
      ]),
    });

    await expect(
      generateReviewerTasks(github, "alice/widget", 7),
    ).resolves.toMatchObject({ mentions: ["@alice", "@author"] });
  });

  it("should use every discoverable organization owner when nobody is assigned", async () => {
    const github = createGitHubApi({
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/pulls/7"))
          return {
            base: { sha: baseOid },
            body,
            commits: 1,
            draft: false,
            merged: false,
            state: "open",
            head: { sha: headOid }, user: { login: "author" },
          };
        if (path.endsWith("/requested_reviewers"))
          return { teams: [], users: [] };
        if (path === "repos/acme/widget")
          return { owner: { login: "acme", type: "Organization" } };
        throw new Error(`unexpected GET ${path}`);
      }),
      list: vi.fn(async (path: string) => {
        if (path.endsWith("/commits"))
          return [{ author: { login: "owner-one" }, sha: "a".repeat(40) }];
        if (path === "orgs/acme/members?role=admin")
          return [{ login: "owner-one" }, { login: "owner-two" }];
        throw new Error(`unexpected LIST ${path}`);
      }),
    });

    await expect(
      generateReviewerTasks(github, "acme/widget", 7),
    ).resolves.toMatchObject({ mentions: ["@owner-one", "@owner-two"] });
  });

  it("should leave organization fallback until the ready-state read", async () => {
    const github = createGitHubApi({
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/pulls/7"))
          return { base: { sha: baseOid }, body, commits: 2, draft: true, merged: false, state: "open", head: { sha: headOid }, user: { login: "author" } };
        if (path.endsWith("/requested_reviewers")) return { teams: [], users: [] };
        if (path === "repos/acme/widget")
          return { owner: { login: "acme", type: "Organization" } };
        throw new Error(`unexpected GET ${path}`);
      }),
    });

    await expect(generateReviewerTasks(github, "acme/widget", 7)).resolves.toMatchObject({
      mentions: ["@author", "@ASSIGNED"],
    });
    expect(github.list).not.toHaveBeenCalledWith("orgs/acme/members?role=admin");
  });

  it("should include reviewers from every requested-reviewer page", async () => {
    const github = createGitHubApi({
      listPages: vi.fn(async () => [
        { teams: [], users: [{ login: "first" }] },
        { teams: [{ slug: "second" }], users: [{ login: "third" }] },
      ]),
    });

    await expect(generateReviewerTasks(github, "acme/widget", 7)).resolves.toMatchObject({
      mentions: ["@first", "@third", "@acme/second", "@author", "@ASSIGNED"],
    });
    expect(github.listPages).toHaveBeenCalledWith("repos/acme/widget/pulls/7/requested_reviewers");
  });

  it("should reject an unmapped commit author", async () => {
    const github = createGitHubApi({
      list: vi.fn(async () => [
        { author: null, sha: "f".repeat(40) },
        { author: { login: "author" }, sha: "e".repeat(40) },
      ]),
    });

    await expect(
      generateReviewerTasks(github, "acme/widget", 7),
    ).rejects.toEqual(
      new Error(`commit ${"f".repeat(40)} has no GitHub-mapped author account`),
    );
  });

  it("should reject a missing PR creator account", async () => {
    const github = createGitHubApi({
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/pulls/7"))
          return { base: { sha: baseOid }, body, commits: 2, draft: false, merged: false, state: "open", head: { sha: headOid } };
        if (path.endsWith("/requested_reviewers"))
          return { teams: [], users: [{ login: "assigned" }] };
        if (path === "repos/acme/widget")
          return { owner: { login: "acme", type: "Organization" } };
        throw new Error(`unexpected GET ${path}`);
      }),
    });

    await expect(generateReviewerTasks(github, "acme/widget", 7))
      .rejects.toThrow("pull request author is invalid");
  });

  it("should reject a PR with no commit author accounts", async () => {
    const github = createGitHubApi({
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/pulls/7"))
          return {
            base: { sha: baseOid },
            body,
            commits: 0,
            draft: false,
            merged: false,
            state: "open",
            head: { sha: headOid }, user: { login: "author" },
          };
        if (path.endsWith("/requested_reviewers"))
          return { teams: [], users: [{ login: "assigned" }] };
        if (path === "repos/acme/widget")
          return { owner: { login: "acme", type: "Organization" } };
        throw new Error(`unexpected GET ${path}`);
      }),
      list: vi.fn(async () => []),
    });

    await expect(
      generateReviewerTasks(github, "acme/widget", 7),
    ).rejects.toEqual(
      new Error("PR acme/widget#7 has no GitHub-mapped commit author accounts"),
    );
  });

  it("should reject a truncated GitHub commit list", async () => {
    const github = createGitHubApi({
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/pulls/7"))
          return {
            base: { sha: baseOid },
            body,
            commits: 251,
            draft: false,
            merged: false,
            state: "open",
            head: { sha: headOid }, user: { login: "author" },
          };
        if (path.endsWith("/requested_reviewers"))
          return { teams: [], users: [{ login: "assigned" }] };
        if (path === "repos/acme/widget")
          return { owner: { login: "acme", type: "Organization" } };
        throw new Error(`unexpected GET ${path}`);
      }),
      list: vi.fn(async () =>
        Array.from({ length: 250 }, (_, index) => ({
          author: { login: "author" },
          sha: index.toString(16).padStart(40, "0"),
        })),
      ),
    });

    await expect(
      generateReviewerTasks(github, "acme/widget", 7),
    ).rejects.toEqual(
      new Error(
        "PR acme/widget#7 commit list is incomplete: expected 251, received 250",
      ),
    );
  });

  it("should reject an unsafe assigned account login", async () => {
    const github = createGitHubApi({
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/pulls/7"))
          return {
            base: { sha: baseOid },
            body,
            commits: 2,
            draft: false,
            merged: false,
            state: "open",
            head: { sha: headOid }, user: { login: "author" },
          };
        if (path.endsWith("/requested_reviewers"))
          return { teams: [], users: [{ login: "bad\n- [x] injected" }] };
        if (path === "repos/acme/widget")
          return { owner: { login: "acme", type: "Organization" } };
        throw new Error(`unexpected GET ${path}`);
      }),
    });

    await expect(
      generateReviewerTasks(github, "acme/widget", 7),
    ).rejects.toEqual(new Error("assigned reviewer login is invalid"));
  });

  it("should reject an unsafe assigned team slug", async () => {
    const github = createGitHubApi({
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/pulls/7"))
          return {
            base: { sha: baseOid },
            body,
            commits: 2,
            draft: false,
            merged: false,
            state: "open",
            head: { sha: headOid }, user: { login: "author" },
          };
        if (path.endsWith("/requested_reviewers"))
          return { teams: [{ slug: "bad/team" }], users: [] };
        if (path === "repos/acme/widget")
          return { owner: { login: "acme", type: "Organization" } };
        throw new Error(`unexpected GET ${path}`);
      }),
    });

    await expect(
      generateReviewerTasks(github, "acme/widget", 7),
    ).rejects.toEqual(new Error("assigned team 1 slug is invalid"));
  });

  it("should reject an organization with no discoverable owners", async () => {
    const github = createGitHubApi({
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/pulls/7"))
          return {
            base: { sha: baseOid },
            body,
            commits: 2,
            draft: false,
            merged: false,
            state: "open",
            head: { sha: headOid }, user: { login: "author" },
          };
        if (path.endsWith("/requested_reviewers"))
          return { teams: [], users: [] };
        if (path === "repos/acme/widget")
          return { owner: { login: "acme", type: "Organization" } };
        throw new Error(`unexpected GET ${path}`);
      }),
      list: vi.fn(async (path: string) => {
        if (path.endsWith("/commits"))
          return [{ author: { login: "author" }, sha: "a".repeat(40) }];
        if (path === "orgs/acme/members?role=admin") return [];
        throw new Error(`unexpected LIST ${path}`);
      }),
    });

    await expect(
      generateReviewerTasks(github, "acme/widget", 7),
    ).rejects.toEqual(
      new Error("organization acme has no discoverable owner accounts"),
    );
  });
});

describe("fn:renderReviewerTaskBlock", () => {
  it("should bind every reviewer and black-zone task to the exact revision", () => {
    expect(
      renderReviewerTaskBlock({ authorMention: "@author",
        baseOid,
        hasBlackZoneVerification: true,
        headOid,
        mentions: ["@alice", "@acme/platform"],
      }),
    ).toBe(
      "<!-- coding:reviewer-tasks:start -->\n" +
        `<!-- coding:reviewer-tasks:revision head=${headOid} base=${baseOid} -->\n` +
        `- [ ] @alice reviews ${headOid.slice(0, 7)}\n` +
        `- [ ] @acme/platform reviews ${headOid.slice(0, 7)}\n` +
        `- [ ] @author approves ${headOid.slice(0, 7)}\n` +
        `- [ ] Verify the black-zone scope and risk controls for ${headOid.slice(0, 7)}.\n` +
        "<!-- coding:reviewer-tasks:end -->",
    );
  });
});

describe("fn:upsertReviewerTaskBlock", () => {
  const block = renderReviewerTaskBlock({ authorMention: "@author",
    headOid,
    baseOid,
    mentions: ["@alice"],
    hasBlackZoneVerification: false,
  });

  it("should insert one managed block inside Verification", () => {
    const inserted = upsertReviewerTaskBlock(body, block);
    expect(inserted).toBe(
      "Summary\n\n## 🧪 Verification\n\n" + block + "\n\n- [x] Tests pass.\n",
    );
  });

  it("should preserve checked tasks on an exact retry", () => {
    const checkedBody = upsertReviewerTaskBlock(body, block).replace(
      "- [ ] @alice reviews",
      "- [x] @alice reviews",
    );
    expect(upsertReviewerTaskBlock(checkedBody, block)).toBe(checkedBody);
  });

  it("should insert a valid managed block into a CRLF body without doubling carriage returns", () => {
    const inserted = upsertReviewerTaskBlock(body.replaceAll("\n", "\r\n"), block);

    expect(inserted).not.toContain("\r\r\n");
    expect(inspectReviewerTaskBlock(inserted, headOid, baseOid)?.block).toBe(
      block.replaceAll("\n", "\r\n"),
    );
  });

  it("should refresh changed assignments and retain checks for unchanged tasks", () => {
    const inserted = upsertReviewerTaskBlock(body, block);
    const checked = inserted
      .replace("- [ ] @alice reviews", "- [x] @alice reviews")
      .replace("- [ ] @author approves", "- [x] @author approves");
    const next = renderReviewerTaskBlock({ authorMention: "@author", headOid, baseOid, mentions: ["@alice", "@bob"], hasBlackZoneVerification: false });
    const refreshed = upsertReviewerTaskBlock(checked, next);
    expect(refreshed).toContain(`- [x] @alice reviews ${headOid.slice(0, 7)}`);
    expect(refreshed).toContain(`- [x] @author approves ${headOid.slice(0, 7)}`);
    expect(refreshed).toContain(`- [ ] @bob reviews ${headOid.slice(0, 7)}`);
    expect(refreshed.match(/coding:reviewer-tasks:start/g)).toHaveLength(1);
  });

  it("should clear checks when a full head or base changes behind the same short SHA", () => {
    const checked = upsertReviewerTaskBlock(body, block)
      .replace("- [ ] @alice reviews", "- [x] @alice reviews")
      .replace("- [ ] @author approves", "- [x] @author approves");
    for (const revision of [
      { headOid: `${headOid.slice(0, 7)}${"3".repeat(33)}`, baseOid },
      { headOid, baseOid: "3".repeat(40) },
    ]) {
      const next = renderReviewerTaskBlock({ authorMention: "@author", ...revision, mentions: ["@alice"], hasBlackZoneVerification: false });
      const refreshed = upsertReviewerTaskBlock(checked, next);
      expect(refreshed).toContain(`- [ ] @alice reviews ${headOid.slice(0, 7)}`);
      expect(refreshed).toContain(`- [ ] @author approves ${headOid.slice(0, 7)}`);
      expect(refreshed).not.toContain("- [x] @alice reviews");
    }
  });

  it("should reject a manually altered managed task", () => {
    const inserted = upsertReviewerTaskBlock(body, block);
    expect(() => upsertReviewerTaskBlock(inserted.replace("@alice reviews", "@alice approve"), block))
      .toThrow("managed reviewer task has invalid shape or revision");
  });

  it("should reject missing, duplicate, or singular author approval tasks", () => {
    const inserted = upsertReviewerTaskBlock(body, block);
    const approval = `- [ ] @author approves ${headOid.slice(0, 7)}`;
    for (const invalid of [
      inserted.replace(`${approval}\n`, ""),
      inserted.replace(approval, `${approval}\n${approval}`),
      inserted.replace(approval, approval.replace("approves", "approve")),
    ])
      expect(() => inspectReviewerTaskBlock(invalid, headOid, baseOid))
        .toThrow(/managed reviewer task/);
  });

  it("should preserve CRLF and checked tasks when refreshing assignments", () => {
    const checked = upsertReviewerTaskBlock(body, block)
      .replace("- [ ] @alice reviews", "- [x] @alice reviews")
      .replaceAll("\n", "\r\n");
    const next = renderReviewerTaskBlock({ authorMention: "@author", headOid, baseOid, mentions: ["@alice", "@bob"], hasBlackZoneVerification: false });
    const expectedBlock = next.replace("- [ ] @alice reviews", "- [x] @alice reviews").replaceAll("\n", "\r\n");

    expect(upsertReviewerTaskBlock(checked, next)).toBe(
      `Summary\r\n\r\n## 🧪 Verification\r\n\r\n${expectedBlock}\r\n\r\n- [x] Tests pass.\r\n`,
    );
  });

  it.each(["```markdown", "~~~markdown"])("should reject a managed block inside a %s code fence", (fence) => {
    const fenced = `${body}\n${fence}\n${block}\n${fence.slice(0, 3)}\n`;

    expect(() => upsertReviewerTaskBlock(fenced, block)).toThrow(
      "reviewer task markers must be outside fenced code",
    );
  });

  it("should reject a body without exactly one Verification section", () => {
    expect(() => upsertReviewerTaskBlock("Summary\n", block)).toThrow(
      "PR body must contain exactly one level-two Verification section",
    );
  });

  it("should ignore fenced headings when locating the end of Verification", () => {
    const prior = `## Verification\n\n\`\`\`markdown\n## Example\n\`\`\`\n\n${block}\n\n## Notes\nRetain this.\n`;
    const next = renderReviewerTaskBlock({ authorMention: "@author", headOid, baseOid, mentions: ["@bob"], hasBlackZoneVerification: false });

    expect(upsertReviewerTaskBlock(prior, next)).toBe(prior.replace(block, next));
  });

  it("should reject reversed managed markers", () => {
    expect(() =>
      upsertReviewerTaskBlock(
        `## Verification\n\n${"<!-- coding:reviewer-tasks:end -->"}\n${"<!-- coding:reviewer-tasks:start -->"}`,
        block,
      ),
    ).toThrow("PR body contains malformed reviewer task markers");
  });
});

describe("fn:createGitHubApi", () => {
  it("should read paginated CLI output larger than the synchronous process buffer", async () => {
    const directory = mkdtempSync(join(tmpdir(), "reviewer-task-gh-"));
    // Two MiB exceeds Node's one-MiB default spawnSync buffer.
    const payload = "a".repeat(2 * 1024 * 1024);
    writeFileSync(join(directory, "response.json"), JSON.stringify([[{ body: payload }]]));
    writeFileSync(join(directory, "gh"), `#!/bin/sh\ncat '${join(directory, "response.json")}'\n`, { mode: 0o755 });
    vi.stubEnv("PATH", `${directory}:${process.env.PATH ?? ""}`);

    try {
      await expect(createLiveGitHubApi("github.com").list("repos/acme/widget/pulls/7/commits"))
        .resolves.toEqual([{ body: payload }]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("should bind every REST call to the selected GitHub hostname", async () => {
    const execute = vi.fn(
      (commandArgs: string[]) =>
        (commandArgs.includes("--slurp") ? [[]] : {}) as unknown,
    );
    const github = createLiveGitHubApi("ghe.example.com", execute);

    await github.get("repos/acme/widget");
    await github.list("repos/acme/widget/pulls/7/commits");
    await github.listPages("repos/acme/widget/pulls/7/requested_reviewers");
    await github.patch("repos/acme/widget/pulls/7", { body: "updated" });

    expect(execute.mock.calls).toEqual([
      [["--hostname", "ghe.example.com", "repos/acme/widget"]],
      [
        [
          "--hostname",
          "ghe.example.com",
          "--method",
          "GET",
          "--paginate",
          "--slurp",
          "repos/acme/widget/pulls/7/commits",
          "-f",
          "per_page=100",
        ],
      ],
      [
        [
          "--hostname",
          "ghe.example.com",
          "--method",
          "GET",
          "--paginate",
          "--slurp",
          "repos/acme/widget/pulls/7/requested_reviewers",
          "-f",
          "per_page=100",
        ],
      ],
      [
        [
          "--hostname",
          "ghe.example.com",
          "--method",
          "PATCH",
          "repos/acme/widget/pulls/7",
          "--input",
          "-",
        ],
        { body: "updated" },
      ],
    ]);
  });
});

describe("cmd:reviewer-tasks", () => {
  const args = [
    "acme/widget#7",
    "--hostname",
    "github.example.com",
    "--head",
    headOid,
    "--base",
    baseOid,
    "--apply",
  ];

  it("should reject a fenced-only Verification heading before writing the PR body", async () => {
    const original = createGitHubApi();
    const github = createGitHubApi({
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/pulls/7"))
          return { base: { sha: baseOid }, body: "```markdown\n## Verification\n```\n", commits: 2, draft: false, merged: false, state: "open", head: { sha: headOid }, user: { login: "author" } };
        return original.get(path);
      }),
    });

    await expect(runReviewerTasksCli(args, github)).rejects.toThrow(
      "PR body must contain exactly one level-two Verification section",
    );
    expect(github.patch).not.toHaveBeenCalled();
  });

  it.each([" ", "x"])("should reject a draft preflight containing a [%s] managed reviewer task", async (check) => {
    const block = renderReviewerTaskBlock({ authorMention: "@author", headOid, baseOid, mentions: ["@alice"], hasBlackZoneVerification: false })
      .replace("- [ ]", `- [${check}]`);
    const original = createGitHubApi();
    const github = createGitHubApi({
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/pulls/7"))
          return { base: { sha: baseOid }, body: `${body}\n${block}\n`, commits: 2, draft: true, merged: false, state: "open", head: { sha: headOid }, user: { login: "author" } };
        return original.get(path);
      }),
    });

    await expect(runReviewerTasksCli(args.filter((argument) => argument !== "--apply"), github))
      .rejects.toThrow("draft PR must not contain managed reviewer tasks");
    expect(github.patch).not.toHaveBeenCalled();
  });

  it("should refuse to write reviewer tasks while the PR is draft", async () => {
    const github = createGitHubApi({
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/pulls/7"))
          return {
            base: { sha: baseOid },
            body,
            commits: 2,
            draft: true,
            merged: false,
            state: "open",
            head: { sha: headOid }, user: { login: "author" },
          };
        if (path.endsWith("/requested_reviewers"))
          return { teams: [], users: [{ login: "assigned" }] };
        if (path === "repos/acme/widget")
          return { owner: { login: "acme", type: "Organization" } };
        throw new Error(`unexpected GET ${path}`);
      }),
    });

    await expect(runReviewerTasksCli(args, github)).rejects.toEqual(
      new Error(
        "refusing to add reviewer tasks while PR acme/widget#7 is draft",
      ),
    );
    expect(github.patch).not.toHaveBeenCalled();
  });

  it("should refuse a write when the head changes during generation", async () => {
    const get = vi
      .fn<GitHubApi["get"]>()
      .mockImplementationOnce(async () => ({
        base: { sha: baseOid },
        body,
        commits: 2,
        draft: false,
        merged: false,
        state: "open",
        head: { sha: headOid }, user: { login: "author" },
      }))
      .mockImplementationOnce(async () => ({
        teams: [],
        users: [{ login: "assigned" }],
      }))
      .mockImplementationOnce(async () => ({
        owner: { login: "acme", type: "Organization" },
      }))
      .mockImplementationOnce(async () => ({
        base: { sha: baseOid },
        body,
        commits: 2,
        draft: false,
        merged: false,
        state: "open",
        head: { sha: "3".repeat(40) }, user: { login: "author" },
      }));
    const github = createGitHubApi({ get });

    await expect(runReviewerTasksCli(args, github)).rejects.toEqual(
      new Error("PR revision changed before reviewer task update"),
    );
    expect(github.patch).not.toHaveBeenCalled();
  });

  it("should refuse a write when the body changes during generation", async () => {
    const get = vi
      .fn<GitHubApi["get"]>()
      .mockImplementationOnce(async () => ({
        base: { sha: baseOid },
        body,
        commits: 2,
        draft: false,
        merged: false,
        state: "open",
        head: { sha: headOid }, user: { login: "author" },
      }))
      .mockImplementationOnce(async () => ({
        teams: [],
        users: [{ login: "assigned" }],
      }))
      .mockImplementationOnce(async () => ({
        owner: { login: "acme", type: "Organization" },
      }))
      .mockImplementationOnce(async () => ({
        base: { sha: baseOid },
        body: `${body}\nConcurrent edit.\n`,
        commits: 2,
        draft: false,
        merged: false,
        state: "open",
        head: { sha: headOid }, user: { login: "author" },
      }));
    const github = createGitHubApi({ get });

    await expect(runReviewerTasksCli(args, github)).rejects.toEqual(
      new Error("PR body changed before reviewer task update"),
    );
    expect(github.patch).not.toHaveBeenCalled();
  });

  it("should reject a PR closed between reviewer resolution and the write", async () => {
    let pullReads = 0;
    const github = createGitHubApi({
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/pulls/7")) {
          pullReads += 1;
          return { base: { sha: baseOid }, body, commits: 2, draft: false, merged: false, state: pullReads === 1 ? "open" : "closed", head: { sha: headOid }, user: { login: "author" } };
        }
        if (path.endsWith("/requested_reviewers"))
          return { teams: [], users: [{ login: "assigned" }] };
        if (path === "repos/acme/widget")
          return { owner: { login: "acme", type: "Organization" } };
        throw new Error(`unexpected GET ${path}`);
      }),
    });

    await expect(runReviewerTasksCli(args, github)).rejects.toThrow("pull request must be open and unmerged");
    expect(github.patch).not.toHaveBeenCalled();
  });

  it("should reject a merged PR during the first read", async () => {
    const github = createGitHubApi({
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/pulls/7"))
          return { base: { sha: baseOid }, body, commits: 2, draft: false, merged: true, state: "closed", head: { sha: headOid }, user: { login: "author" } };
        throw new Error(`unexpected GET ${path}`);
      }),
    });

    await expect(runReviewerTasksCli(args, github)).rejects.toThrow("pull request must be open and unmerged");
    expect(github.patch).not.toHaveBeenCalled();
  });

  it("should update the unchanged ready PR body", async () => {
    const github = createGitHubApi();

    await expect(runReviewerTasksCli(args, github)).resolves.toMatchObject({
      applied: true,
      baseOid,
      headOid,
      mentions: ["@assigned", "@author"],
    });
    expect(github.patch).toHaveBeenCalledWith("repos/acme/widget/pulls/7", {
      body:
        "Summary\n\n## 🧪 Verification\n\n" +
        "<!-- coding:reviewer-tasks:start -->\n" +
        `<!-- coding:reviewer-tasks:revision head=${headOid} base=${baseOid} -->\n` +
        `- [ ] @assigned reviews ${headOid.slice(0, 7)}\n` +
        `- [ ] @author reviews ${headOid.slice(0, 7)}\n` +
        `- [ ] @author approves ${headOid.slice(0, 7)}\n` +
        "<!-- coding:reviewer-tasks:end -->\n\n" +
        "- [x] Tests pass.\n",
    });
  });

  it("should return the persisted block after preserving checked tasks", async () => {
    const prior = renderReviewerTaskBlock({ authorMention: "@author",
      headOid,
      baseOid,
      mentions: ["@assigned"],
      hasBlackZoneVerification: false,
    });
    const priorBody = upsertReviewerTaskBlock(body, prior).replace(
      "- [ ] @assigned reviews",
      "- [x] @assigned reviews",
    );
    const github = createGitHubApi({
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/pulls/7"))
          return { base: { sha: baseOid }, body: priorBody, commits: 2, draft: false,
          merged: false,
          state: "open", head: { sha: headOid }, user: { login: "author" } };
        if (path.endsWith("/requested_reviewers"))
          return { teams: [], users: [{ login: "assigned" }] };
        if (path === "repos/acme/widget")
          return { owner: { login: "acme", type: "Organization" } };
        throw new Error(`unexpected GET ${path}`);
      }),
    });
    const result = await runReviewerTasksCli(args, github);
    expect(result.block).toContain(`- [x] @assigned reviews ${headOid.slice(0, 7)}`);
    expect(result.block).toContain(`- [ ] @author reviews ${headOid.slice(0, 7)}`);
    expect(result.body).toContain(result.block);
    expect(github.patch).toHaveBeenCalledWith("repos/acme/widget/pulls/7", { body: result.body });
  });
});
