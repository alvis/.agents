import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import {
  createGitHubApi as createLiveGitHubApi,
  generateReviewerTasks,
  inspectReviewerTaskBlock,
  main,
  renderDirectionTaskBlock,
  renderReviewerTaskBlock,
  runReviewerTasksCli,
  upsertReviewerTaskBlock,
  type DirectionApproval,
  type GitHubApi,
} from "./generate-reviewer-tasks";

const headOid = "1".repeat(40);
const baseOid = "2".repeat(40);
const otherOid = "3".repeat(40);
const shortHead = headOid.slice(0, 7);
const body = "Summary\n\n## 🧪 Verification\n\n- [x] Tests pass.\n";
const startMarker = "<!-- coding:reviewer-tasks:start -->";
const endMarker = "<!-- coding:reviewer-tasks:end -->";
const revisionMarker = `<!-- coding:reviewer-tasks:revision head=${headOid} base=${baseOid} -->`;
const organization = { owner: { login: "acme", type: "Organization" } };
const personal = { owner: { login: "alice", type: "User" } };
const dryArgs = ["acme/widget#7", "--hostname", "github.example.com", "--head", headOid, "--base", baseOid];
const applyArgs = [...dryArgs, "--apply"];

interface Fixture {
  /** the first pull-request read */
  pull?: unknown;
  /** every later pull-request read; defaults to the first */
  latest?: unknown;
  pages?: unknown[];
  repository?: unknown;
  commits?: unknown[];
  admins?: unknown[];
}

function pullRequest(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    base: { sha: baseOid },
    body,
    commits: 2,
    draft: false,
    head: { sha: headOid },
    merged: false,
    state: "open",
    user: { login: "author" },
    ...fields,
  };
}

function createGitHubApi(fixture: Fixture = {}) {
  let pullReads = 0;
  return {
    get: vi.fn(async (path: string): Promise<unknown> => {
      if (path === "repos/acme/widget/pulls/7") {
        pullReads += 1;
        const first = "pull" in fixture ? fixture.pull : pullRequest();
        return pullReads === 1 ? first : (fixture.latest ?? first);
      }
      if (path === "repos/acme/widget") return "repository" in fixture ? fixture.repository : organization;
      throw new Error(`unexpected GET ${path}`);
    }),
    list: vi.fn(async (path: string): Promise<unknown[]> => {
      if (path === "repos/acme/widget/pulls/7/commits")
        return (
          fixture.commits ?? [
            { author: { login: "author" }, sha: "a".repeat(40) },
            { author: { login: "ASSIGNED" }, sha: "b".repeat(40) },
          ]
        );
      if (path === "orgs/acme/members?role=admin") return fixture.admins ?? [{ login: "owner" }];
      throw new Error(`unexpected LIST ${path}`);
    }),
    listPages: vi.fn(async (path: string): Promise<unknown[]> => {
      if (path === "repos/acme/widget/pulls/7/requested_reviewers")
        return fixture.pages ?? [{ teams: [], users: [{ login: "assigned" }] }];
      throw new Error(`unexpected LIST PAGES ${path}`);
    }),
    patch: vi.fn(async (_path: string, _fields: Record<string, unknown>): Promise<unknown> => ({})),
  } satisfies GitHubApi;
}

function review(mention: string, revision = shortHead): string {
  return `- [ ] ${mention} reviews ${revision}`;
}

function approve(mention: string, revision = shortHead): string {
  return `- [ ] ${mention} approves ${revision}`;
}

function approveDirection(mention: string, zone = "red", revision = shortHead): string {
  return `- [ ] ${mention} approves the direction of ${revision} (${zone} zone) by PR review or comment.`;
}

function verifyBlackZone(revision = shortHead): string {
  return `- [ ] Verify the black-zone scope and risk controls for ${revision}.`;
}

function managed(tasks: string[], revision = revisionMarker): string {
  return [startMarker, revision, ...tasks, endMarker].join("\n");
}

function render(fields: { hasBlackZoneVerification?: boolean; headOid?: string; baseOid?: string; mentions?: string[] } = {}): string {
  return renderReviewerTaskBlock({
    authorMention: "@author",
    baseOid,
    hasBlackZoneVerification: false,
    headOid,
    mentions: ["@alice"],
    ...fields,
  });
}

function renderDirection(directionApproval: DirectionApproval, revision: { headOid?: string; baseOid?: string } = {}): string {
  return renderDirectionTaskBlock({ baseOid, directionApproval, headOid, ...revision });
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "reviewer-task-gh-"));
  onTestFinished(() => rmSync(directory, { force: true, recursive: true }));
  return directory;
}

/** puts an executable `gh` running `script` first on PATH */
function useGh(script: string): void {
  const directory = temporaryDirectory();
  writeFileSync(join(directory, "gh"), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  vi.stubEnv("PATH", `${directory}:${process.env.PATH ?? ""}`);
}

function captureOutput() {
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  return {
    stderr: () => stderr.mock.calls.map(([chunk]) => String(chunk)).join(""),
    stdout: () => stdout.mock.calls.map(([chunk]) => String(chunk)).join(""),
  };
}

describe("fn:generateReviewerTasks", () => {
  it("should combine assigned users, teams, and commit authors by account", async () => {
    const github = createGitHubApi({
      pages: [
        {
          teams: [{ slug: "platform" }, { organization: { login: "partner" }, slug: "core" }],
          users: [{ login: "assigned" }],
        },
      ],
    });

    await expect(generateReviewerTasks(github, "acme/widget", 7)).resolves.toEqual({
      authorMention: "@author",
      baseOid,
      body,
      commitCount: 2,
      draft: false,
      headOid,
      mentions: ["@assigned", "@acme/platform", "@partner/core", "@author"],
      state: "open",
    });
    expect(github.list).not.toHaveBeenCalledWith("orgs/acme/members?role=admin");
  });

  it("should assign the PR creator an approval task even when another account authored the commits", async () => {
    const github = createGitHubApi({ pull: pullRequest({ user: { login: "creator" } }) });

    const result = await generateReviewerTasks(github, "acme/widget", 7);

    expect(result.mentions).toEqual(["@assigned", "@author"]);
    expect(result.authorMention).toBe("@creator");
  });

  it("should treat a null PR body as empty", async () => {
    const github = createGitHubApi({ pull: pullRequest({ body: null }) });

    await expect(generateReviewerTasks(github, "acme/widget", 7)).resolves.toMatchObject({ body: "" });
  });

  it.each([true, false])("should use a personal owner for draft=%s with no assignee", async (draft) => {
    const github = createGitHubApi({
      commits: [{ author: { login: "author" }, sha: "a".repeat(40) }],
      pages: [{ teams: [], users: [] }],
      pull: pullRequest({ commits: 1, draft }),
      repository: personal,
    });

    await expect(generateReviewerTasks(github, "acme/widget", 7)).resolves.toMatchObject({
      mentions: ["@alice", "@author"],
    });
  });

  it("should use every discoverable organization owner when nobody is assigned", async () => {
    const github = createGitHubApi({
      admins: [{ login: "owner-one" }, { login: "owner-two" }],
      commits: [{ author: { login: "owner-one" }, sha: "a".repeat(40) }],
      pages: [{ teams: [], users: [] }],
      pull: pullRequest({ commits: 1 }),
    });

    await expect(generateReviewerTasks(github, "acme/widget", 7)).resolves.toMatchObject({
      mentions: ["@owner-one", "@owner-two"],
    });
  });

  it("should leave organization fallback until the ready-state read", async () => {
    const github = createGitHubApi({ pages: [{ teams: [], users: [] }], pull: pullRequest({ draft: true }) });

    await expect(generateReviewerTasks(github, "acme/widget", 7)).resolves.toMatchObject({
      mentions: ["@author", "@ASSIGNED"],
    });
    expect(github.list).not.toHaveBeenCalledWith("orgs/acme/members?role=admin");
  });

  it("should include reviewers from every requested-reviewer page", async () => {
    const github = createGitHubApi({
      pages: [
        { teams: [], users: [{ login: "first" }] },
        { teams: [{ slug: "second" }], users: [{ login: "third" }] },
      ],
    });

    await expect(generateReviewerTasks(github, "acme/widget", 7)).resolves.toMatchObject({
      mentions: ["@first", "@third", "@acme/second", "@author", "@ASSIGNED"],
    });
  });

  it("should reject managed reviewer tasks in a draft", async () => {
    const github = createGitHubApi({
      pull: pullRequest({ body: upsertReviewerTaskBlock(body, render()), draft: true }),
    });

    await expect(generateReviewerTasks(github, "acme/widget", 7)).rejects.toThrow(
      "draft PR must not contain managed reviewer tasks",
    );
  });

  const fingerprint = "f".repeat(40);
  it.each<[string, Fixture, string]>([
    ["a non-object pull request", { pull: [] }, "pull request is invalid"],
    ["a closed pull request", { pull: pullRequest({ state: "closed" }) }, "pull request must be open and unmerged"],
    ["a merged pull request", { pull: pullRequest({ merged: true }) }, "pull request must be open and unmerged"],
    ["a non-object head", { pull: pullRequest({ head: "main" }) }, "pull request head is invalid"],
    ["a non-object base", { pull: pullRequest({ base: null }) }, "pull request base is invalid"],
    ["a missing PR creator", { pull: pullRequest({ user: undefined }) }, "pull request author is invalid"],
    ["a PR creator without a login", { pull: pullRequest({ user: {} }) }, "pull request author login is missing"],
    ["an unsafe PR creator login", { pull: pullRequest({ user: { login: "bad name" } }) }, "pull request author login is invalid"],
    ["a missing draft state", { pull: pullRequest({ draft: undefined }) }, "pull request draft state is missing"],
    ["a non-string body", { pull: pullRequest({ body: 1 }) }, "pull request body is invalid"],
    ["a fractional commit count", { pull: pullRequest({ commits: 1.5 }) }, "pull request commit count is invalid"],
    ["a negative commit count", { pull: pullRequest({ commits: -1 }) }, "pull request commit count is invalid"],
    ["a base without a SHA", { pull: pullRequest({ base: {} }) }, "pull request base sha is missing"],
    ["an uppercase head SHA", { pull: pullRequest({ head: { sha: "A".repeat(40) } }) }, "pull request head must be a full lowercase 40-character SHA"],
    ["an abbreviated base SHA", { pull: pullRequest({ base: { sha: "2".repeat(39) } }) }, "pull request base must be a full lowercase 40-character SHA"],
    ["no requested-reviewer pages", { pages: [] }, "requested reviewer lookup returned no pages"],
    ["a non-object requested-reviewer page", { pages: [[]] }, "requested reviewers page 1 is invalid"],
    ["non-object repository metadata", { repository: null }, "repository metadata is invalid"],
    ["a non-object repository owner", { repository: { owner: "acme" } }, "repository owner is invalid"],
    ["an unsafe repository owner login", { repository: { owner: { login: "ac me", type: "Organization" } } }, "repository owner login is invalid"],
    ["a repository owner without a type", { repository: { owner: { login: "acme" } } }, "repository owner type is missing"],
    ["a non-array assigned user list", { pages: [{ teams: [], users: {} }] }, "assigned reviewer list is invalid"],
    ["a non-object assigned user", { pages: [{ teams: [], users: ["alice"] }] }, "assigned reviewer 1 is invalid"],
    ["an unsafe assigned account login", { pages: [{ teams: [], users: [{ login: "bad\n- [x] injected" }] }] }, "assigned reviewer login is invalid"],
    ["a non-array assigned team list", { pages: [{ teams: null, users: [] }] }, "assigned team list is invalid"],
    ["a non-object assigned team", { pages: [{ teams: ["platform"], users: [] }] }, "assigned team 1 is invalid"],
    ["a non-object team organization", { pages: [{ teams: [{ organization: "acme", slug: "core" }], users: [] }] }, "assigned team 1 organization is invalid"],
    ["a team organization without a login", { pages: [{ teams: [{ organization: {}, slug: "core" }], users: [] }] }, "assigned team 1 organization login is missing"],
    ["an organization-less team on a personal repository", { pages: [{ teams: [{ slug: "core" }], users: [] }], repository: personal }, "assigned team 1 has no organization account"],
    ["a team without a slug", { pages: [{ teams: [{}], users: [] }] }, "assigned team 1 slug is missing"],
    ["an unsafe team organization login", { pages: [{ teams: [{ organization: { login: "bad org" }, slug: "core" }], users: [] }] }, "assigned team 1 organization login is invalid"],
    ["an unsafe assigned team slug", { pages: [{ teams: [{ slug: "bad/team" }], users: [] }] }, "assigned team 1 slug is invalid"],
    ["an unassigned repository with an unsupported owner type", { pages: [{ teams: [], users: [] }], repository: { owner: { login: "acme", type: "Enterprise" } } }, "unsupported repository owner type: Enterprise"],
    ["an organization with no discoverable owners", { admins: [], pages: [{ teams: [], users: [] }] }, "organization acme has no discoverable owner accounts"],
    ["a truncated commit list", { pull: pullRequest({ commits: 3 }) }, "PR acme/widget#7 commit list is incomplete: expected 3, received 2"],
    ["a PR with no commits", { commits: [], pull: pullRequest({ commits: 0 }) }, "PR acme/widget#7 has no GitHub-mapped commit author accounts"],
    ["a non-object commit", { commits: ["a"], pull: pullRequest({ commits: 1 }) }, "pull request commit is invalid"],
    ["a commit without a SHA", { commits: [{ author: { login: "author" } }], pull: pullRequest({ commits: 1 }) }, "pull request commit sha is missing"],
    ["an unmapped commit author", { commits: [{ author: null, sha: fingerprint }], pull: pullRequest({ commits: 1 }) }, `commit ${fingerprint} has no GitHub-mapped author account`],
    ["a non-object commit author", { commits: [{ author: "author", sha: fingerprint }], pull: pullRequest({ commits: 1 }) }, `commit ${fingerprint} author is invalid`],
    ["an unsafe commit author login", { commits: [{ author: { login: "a b" }, sha: fingerprint }], pull: pullRequest({ commits: 1 }) }, `commit ${fingerprint} author login is invalid`],
  ])("should reject %s", async (_case, fixture, message) => {
    await expect(generateReviewerTasks(createGitHubApi(fixture), "acme/widget", 7)).rejects.toEqual(new Error(message));
  });
});

describe("fn:renderReviewerTaskBlock", () => {
  it("should bind every reviewer and black-zone task to the exact revision", () => {
    expect(render({ hasBlackZoneVerification: true, mentions: ["@alice", "@acme/platform"] })).toBe(
      managed([review("@alice"), review("@acme/platform"), approve("@author"), verifyBlackZone()]),
    );
  });

  it.each<[string, Parameters<typeof render>[0], string]>([
    ["an abbreviated head", { headOid: shortHead }, "head must be a full lowercase 40-character SHA"],
    ["an uppercase base", { baseOid: "A".repeat(40) }, "base must be a full lowercase 40-character SHA"],
    ["no reviewers", { mentions: [] }, "at least one reviewer mention is required"],
    ["an unsafe reviewer mention", { mentions: ["@bad name"] }, "reviewer mention is invalid: @bad name"],
  ])("should reject %s", (_case, fields, message) => {
    expect(() => render(fields)).toThrow(new Error(message));
  });

  it.each(["@acme/platform", "author"])("should reject the author mention %s", (authorMention) => {
    expect(() =>
      renderReviewerTaskBlock({ authorMention, baseOid, hasBlackZoneVerification: false, headOid, mentions: ["@alice"] }),
    ).toThrow(new Error(`author mention is invalid: ${authorMention}`));
  });
});

describe("fn:renderDirectionTaskBlock", () => {
  it.each(["yellow", "red", "black"] as const)("should render the %s-zone direction approval as the only exact-revision task", (zone) => {
    expect(renderDirection({ approverMention: "@lead", zone })).toBe(managed([approveDirection("@lead", zone)]));
  });

  it.each<[string, DirectionApproval, { headOid?: string; baseOid?: string }, string]>([
    ["an abbreviated head", { approverMention: "@lead", zone: "red" }, { headOid: shortHead }, "head must be a full lowercase 40-character SHA"],
    ["an uppercase base", { approverMention: "@lead", zone: "red" }, { baseOid: "A".repeat(40) }, "base must be a full lowercase 40-character SHA"],
    ["a direction approver with a space", { approverMention: "@bad name", zone: "red" }, {}, "direction approval is invalid: @bad name (red zone)"],
    ["a bot direction approver", { approverMention: "@lead[bot]", zone: "red" }, {}, "direction approval is invalid: @lead[bot] (red zone)"],
    ["a green direction approval", { approverMention: "@lead", zone: "green" as "red" }, {}, "direction approval is invalid: @lead (green zone)"],
  ])("should reject %s", (_case, directionApproval, revision, message) => {
    expect(() => renderDirection(directionApproval, revision)).toThrow(new Error(message));
  });
});

describe("fn:upsertReviewerTaskBlock", () => {
  const block = render();

  it("should insert one managed block inside Verification", () => {
    expect(upsertReviewerTaskBlock(body, block)).toBe(`Summary\n\n## 🧪 Verification\n\n${block}\n\n- [x] Tests pass.\n`);
  });

  it("should preserve checked tasks on an exact retry", () => {
    const checkedBody = upsertReviewerTaskBlock(body, block).replace("- [ ] @alice reviews", "- [x] @alice reviews");

    expect(upsertReviewerTaskBlock(checkedBody, block)).toBe(checkedBody);
  });

  it("should insert a valid managed block into a CRLF body without doubling carriage returns", () => {
    const inserted = upsertReviewerTaskBlock(body.replaceAll("\n", "\r\n"), block);

    expect(inserted).not.toContain("\r\r\n");
    expect(inspectReviewerTaskBlock(inserted, headOid, baseOid)?.block).toBe(block.replaceAll("\n", "\r\n"));
  });

  it("should refresh changed assignments and retain checks for unchanged tasks", () => {
    const checked = upsertReviewerTaskBlock(body, block)
      .replace("- [ ] @alice reviews", "- [x] @alice reviews")
      .replace("- [ ] @author approves", "- [X] @author approves");
    const next = render({ mentions: ["@alice", "@bob"] });

    expect(upsertReviewerTaskBlock(checked, next)).toBe(
      upsertReviewerTaskBlock(body, next)
        .replace("- [ ] @alice reviews", "- [x] @alice reviews")
        .replace("- [ ] @author approves", "- [x] @author approves"),
    );
  });

  it("should clear checks when a full head or base changes behind the same short SHA", () => {
    const checked = upsertReviewerTaskBlock(body, block)
      .replace("- [ ] @alice reviews", "- [x] @alice reviews")
      .replace("- [ ] @author approves", "- [x] @author approves");
    for (const revision of [{ headOid: `${shortHead}${"3".repeat(33)}` }, { baseOid: otherOid }]) {
      const next = render(revision);

      expect(upsertReviewerTaskBlock(checked, next)).toBe(upsertReviewerTaskBlock(body, next));
    }
  });

  it("should clear a checked direction approval when the head moves", () => {
    const stale = upsertReviewerTaskBlock(
      body,
      renderDirection({ approverMention: "@lead", zone: "red" }, { headOid: otherOid }),
    ).replace("- [ ] @lead", "- [x] @lead");
    const next = renderDirection({ approverMention: "@lead", zone: "red" });

    expect(upsertReviewerTaskBlock(stale, next)).toBe(upsertReviewerTaskBlock(body, next));
  });

  it("should preserve CRLF and checked tasks when refreshing assignments", () => {
    const checked = upsertReviewerTaskBlock(body, block)
      .replace("- [ ] @alice reviews", "- [x] @alice reviews")
      .replaceAll("\n", "\r\n");
    const next = render({ mentions: ["@alice", "@bob"] });
    const expectedBlock = next.replace("- [ ] @alice reviews", "- [x] @alice reviews").replaceAll("\n", "\r\n");

    expect(upsertReviewerTaskBlock(checked, next)).toBe(
      `Summary\r\n\r\n## 🧪 Verification\r\n\r\n${expectedBlock}\r\n\r\n- [x] Tests pass.\r\n`,
    );
  });

  it("should ignore fenced headings when locating the end of Verification", () => {
    const prior = `## Verification\n\n\`\`\`markdown\n## Example\n\`\`\`\n\n${block}\n\n## Notes\nRetain this.\n`;
    const next = render({ mentions: ["@bob"] });

    expect(upsertReviewerTaskBlock(prior, next)).toBe(prior.replace(block, next));
  });

  it.each([
    ["before", `${block}\n\n## Verification\n\nChecks.\n`],
    ["after", `## Verification\n\nChecks.\n\n## Notes\n\n${block}\n`],
  ])("should reject a managed block %s the Verification section", (_case, prior) => {
    expect(() => upsertReviewerTaskBlock(prior, block)).toThrow("reviewer task block must be inside Verification");
  });

  it.each(["```markdown", "~~~markdown"])("should reject a managed block inside a %s code fence", (fence) => {
    const fenced = `${body}\n${fence}\n${block}\n${fence.slice(0, 3)}\n`;

    expect(() => upsertReviewerTaskBlock(fenced, block)).toThrow("reviewer task markers must be outside fenced code");
  });

  it("should keep a fence open across lines that cannot close it", () => {
    const fenced = `${body}\n\`\`\` \`inline\`\n\`\`\`\`\n~~~~\n\`\`\`\n\`\`\`\` trailing\n${block}\n\`\`\`\`\n`;

    expect(() => upsertReviewerTaskBlock(fenced, block)).toThrow("reviewer task markers must be outside fenced code");
  });

  it("should not open a fence on a backtick line whose info string holds a backtick", () => {
    expect(inspectReviewerTaskBlock(`\`\`\` \`inline\`\n${block}`, headOid, baseOid)?.block).toBe(block);
  });

  it.each(["Summary\n", "## Verification\n\n## Verification\n"])("should reject a body without exactly one Verification section", (prior) => {
    expect(() => upsertReviewerTaskBlock(prior, block)).toThrow(
      "PR body must contain exactly one level-two Verification section",
    );
  });
});

describe("fn:inspectReviewerTaskBlock", () => {
  const complete = managed([
    review("@alice"),
    review("@acme/platform"),
    approve("@author"),
    verifyBlackZone(),
  ]);

  it("should return the bounds of a valid exact-revision block", () => {
    const prior = `Intro\n${complete}\r\nOutro`;

    expect(inspectReviewerTaskBlock(prior, headOid, baseOid)).toEqual({
      block: complete,
      end: 6 + complete.length,
      start: 6,
    });
  });

  it("should return null for a body without managed markers", () => {
    expect(inspectReviewerTaskBlock(body, headOid, baseOid)).toBeNull();
  });

  it("should accept checked tasks with either check mark", () => {
    const checked = complete.replace("- [ ] @alice", "- [x] @alice").replace("- [ ] @author", "- [X] @author");

    expect(inspectReviewerTaskBlock(checked, headOid, baseOid)?.block).toBe(checked);
  });

  const valid = [review("@alice"), approve("@author")];
  it.each<[string, string, string]>([
    ["a second start marker", `${startMarker}\n${complete}`, "PR body contains malformed reviewer task markers"],
    ["a start marker alone", startMarker, "PR body contains malformed reviewer task markers"],
    ["an end marker alone", endMarker, "PR body contains malformed reviewer task markers"],
    ["reversed markers", `## Verification\n\n${endMarker}\n${startMarker}`, "PR body contains malformed reviewer task markers"],
    ["a start marker inside a line", `Intro ${complete}`, "PR body contains malformed reviewer task markers"],
    ["text after the end marker", `${complete} outro`, "PR body contains malformed reviewer task markers"],
    ["a lone carriage return after the end marker", `${complete}\routro`, "PR body contains malformed reviewer task markers"],
    ["an end marker inside fenced code", complete.replace(`\n${endMarker}`, `\n\`\`\`\n${endMarker}`), "reviewer task markers must be outside fenced code"],
    ["a block without tasks", [startMarker, revisionMarker, endMarker].join("\n"), "PR body contains malformed reviewer task markers"],
    ["text after the start marker", complete.replace(startMarker, `${startMarker} note`), "PR body contains malformed reviewer task markers"],
    ["text before the end marker", complete.replace(`\n${endMarker}`, `\nnote ${endMarker}`), "PR body contains malformed reviewer task markers"],
    ["a missing revision marker", managed(valid, "<!-- revision -->"), "managed reviewer task has invalid revision"],
    ["a non-task line", managed([...valid, "note"]), "managed reviewer task has invalid shape"],
    ["a stale black-zone verification", managed([...valid, verifyBlackZone("2222222")]), "managed reviewer task has invalid revision"],
    ["a duplicated black-zone verification", managed([...valid, verifyBlackZone(), verifyBlackZone()]), "managed reviewer task is duplicated"],
    ["a green direction approval", managed([approveDirection("@lead", "green")]), "managed reviewer task has invalid shape or revision"],
    ["a duplicated author approval", managed([...valid, approve("@author")]), "managed reviewer task has invalid shape or revision"],
    ["an author approval after the black-zone verification", managed([review("@alice"), verifyBlackZone(), approve("@author")]), "managed reviewer task has invalid shape or revision"],
    ["a team author approval", managed([review("@alice"), approve("@acme/platform")]), "managed reviewer task has invalid shape or revision"],
    ["an unsafe author approval mention", managed([review("@alice"), approve("@bad[x]")]), "managed reviewer task has invalid shape or revision"],
    ["a stale author approval", managed([review("@alice"), approve("@author", "2222222")]), "managed reviewer task has invalid shape or revision"],
    ["a singular approval verb", managed([review("@alice"), "- [ ] @author approve 1111111"]), "managed reviewer task has invalid shape or revision"],
    ["an unsafe reviewer mention", managed([review("@bad[x]"), approve("@author")]), "managed reviewer task has invalid shape or revision"],
    ["a stale reviewer task", managed([review("@alice", "2222222"), approve("@author")]), "managed reviewer task has invalid shape or revision"],
    ["a reviewer after the black-zone verification", managed([...valid, verifyBlackZone(), review("@bob")]), "managed reviewer task has invalid shape or revision"],
    ["a reviewer after the author approval", managed([...valid, review("@bob")]), "managed reviewer task has invalid shape or revision"],
    ["a reviewer repeated in another case", managed([review("@alice"), review("@ALICE"), approve("@author")]), "managed reviewer task is duplicated"],
    ["no reviewer", managed([approve("@author")]), "managed reviewer task has no reviewer"],
    ["no author approval", managed([review("@alice")]), "managed reviewer task has no author approval"],
  ])("should reject %s", (_case, prior, message) => {
    expect(() => inspectReviewerTaskBlock(prior, headOid, baseOid)).toThrow(new Error(message));
  });

  it.each([
    [otherOid, baseOid],
    [headOid, otherOid],
  ])("should reject a block pinned to another head or base (head %s, base %s)", (expectedHead, expectedBase) => {
    expect(() => inspectReviewerTaskBlock(complete, expectedHead, expectedBase)).toThrow(
      new Error("managed reviewer task has invalid revision"),
    );
  });

  describe("direction-only block", () => {
    const direction = managed([approveDirection("@lead", "black")]);

    it("should accept a checked direction approval bound to the exact revision", () => {
      const checked = direction.replace("- [ ]", "- [x]");

      expect(inspectReviewerTaskBlock(checked, headOid, baseOid)?.block).toBe(checked);
    });

    it.each([
      [otherOid, baseOid],
      [headOid, otherOid],
    ])("should reject a direction approval pinned to another head or base (head %s, base %s)", (expectedHead, expectedBase) => {
      expect(() => inspectReviewerTaskBlock(direction, expectedHead, expectedBase)).toThrow(
        new Error("managed reviewer task has invalid revision"),
      );
    });

    it.each<[string, string, string]>([
      ["a stale direction approval", managed([approveDirection("@lead", "red", "2222222")]), "managed reviewer task has invalid revision"],
      ["a direction approval without its review-or-comment instruction", managed([approveDirection("@lead").replace(" by PR review or comment.", ".")]), "managed reviewer task has invalid shape or revision"],
      ["a duplicated direction approval", managed([approveDirection("@lead"), approveDirection("@lead")]), "managed reviewer task is duplicated"],
      ["a bot direction approver", managed([approveDirection("@lead[bot]")]), "managed reviewer task has invalid shape or revision"],
      ["a reviewer task after the direction approval", managed([approveDirection("@lead"), review("@alice")]), "direction approval must be the only managed task"],
      ["reviewer tasks before the direction approval", managed([...valid, approveDirection("@lead")]), "direction approval must be the only managed task"],
      ["a black-zone verification beside the direction approval", managed([approveDirection("@lead"), verifyBlackZone()]), "direction approval must be the only managed task"],
    ])("should reject %s", (_case, prior, message) => {
      expect(() => inspectReviewerTaskBlock(prior, headOid, baseOid)).toThrow(new Error(message));
    });
  });
});

describe("fn:createGitHubApi", () => {
  it("should read paginated CLI output larger than the synchronous process buffer", async () => {
    const directory = temporaryDirectory();
    // Two MiB exceeds Node's one-MiB default spawnSync buffer.
    const payload = "a".repeat(2 * 1024 * 1024);
    writeFileSync(join(directory, "response.json"), JSON.stringify([[{ body: payload }]]));
    useGh(`cat '${join(directory, "response.json")}'`);

    await expect(createLiveGitHubApi("github.com").list("repos/acme/widget/pulls/7/commits")).resolves.toEqual([
      { body: payload },
    ]);
  });

  it("should send PATCH fields to gh as JSON on standard input", async () => {
    useGh("cat");

    await expect(createLiveGitHubApi("github.com").patch("repos/acme/widget/pulls/7", { body: "updated" })).resolves.toEqual({
      body: "updated",
    });
  });

  it.each([
    ["a failing gh command with its trimmed stderr", 'echo " HTTP 404 " >&2; exit 3', "gh api failed (3): HTTP 404"],
    ["a signalled gh command", "kill -9 $$", "gh api failed (SIGKILL): "],
    ["non-JSON gh output", "echo not-json", "gh api returned invalid JSON"],
  ])("should reject %s", async (_case, script, message) => {
    useGh(script);

    await expect(createLiveGitHubApi("github.com").get("repos/acme/widget")).rejects.toThrow(new Error(message));
  });

  it("should reject a gh command that exits before reading its input", async () => {
    useGh("exit 0");
    // Eight MiB overfills the pipe buffer, so the write fails once gh has exited.
    const fields = { body: "a".repeat(8 * 1024 * 1024) };

    await expect(createLiveGitHubApi("github.com").patch("repos/acme/widget/pulls/7", fields)).rejects.toThrow(/EPIPE/);
  });

  it("should reject when gh is not installed", async () => {
    vi.stubEnv("PATH", temporaryDirectory());

    await expect(createLiveGitHubApi("github.com").get("repos/acme/widget")).rejects.toThrow(/gh/);
  });

  it("should bind every REST call to the selected GitHub hostname", async () => {
    const execute = vi.fn((commandArgs: string[]) => (commandArgs.includes("--slurp") ? [[]] : {}) as unknown);
    const github = createLiveGitHubApi("ghe.example.com:8443", execute);
    const paginate = (path: string) => [
      ["--hostname", "ghe.example.com:8443", "--method", "GET", "--paginate", "--slurp", path, "-f", "per_page=100"],
    ];

    await github.get("repos/acme/widget");
    await github.list("repos/acme/widget/pulls/7/commits");
    await github.listPages("repos/acme/widget/pulls/7/requested_reviewers");
    await github.patch("repos/acme/widget/pulls/7", { body: "updated" });

    expect(execute.mock.calls).toEqual([
      [["--hostname", "ghe.example.com:8443", "repos/acme/widget"]],
      paginate("repos/acme/widget/pulls/7/commits"),
      paginate("repos/acme/widget/pulls/7/requested_reviewers"),
      [["--hostname", "ghe.example.com:8443", "--method", "PATCH", "repos/acme/widget/pulls/7", "--input", "-"], { body: "updated" }],
    ]);
  });

  it("should reject a hostname that is not a bare host before running gh", () => {
    const execute = vi.fn();

    expect(() => createLiveGitHubApi("https://github.com", execute)).toThrow("hostname must be a bare GitHub host");
    expect(execute).not.toHaveBeenCalled();
  });

  it("should reject a non-array paginated response", async () => {
    const github = createLiveGitHubApi("github.com", () => ({}));

    await expect(github.listPages("repos/acme/widget/pulls/7/commits")).rejects.toThrow(
      new Error("GitHub paginated response for repos/acme/widget/pulls/7/commits is not an array"),
    );
  });

  it("should reject a non-array list page", async () => {
    const github = createLiveGitHubApi("github.com", () => [[], {}]);

    await expect(github.list("repos/acme/widget/pulls/7/commits")).rejects.toThrow(
      new Error("GitHub list page 2 for repos/acme/widget/pulls/7/commits is invalid"),
    );
  });
});

describe("cmd:reviewer-tasks", () => {
  const plainBlock = managed([review("@assigned"), review("@author"), approve("@author")]);

  it("should print the block without writing on a dry run", async () => {
    const github = createGitHubApi();

    await expect(runReviewerTasksCli(dryArgs, github)).resolves.toMatchObject({ applied: false, block: plainBlock, body });
    expect(github.patch).not.toHaveBeenCalled();
  });

  it("should add the black-zone verification when asked", async () => {
    const result = await runReviewerTasksCli([...dryArgs, "--black-zone"], createGitHubApi());

    expect(result.block).toBe(managed([review("@assigned"), review("@author"), approve("@author"), verifyBlackZone()]));
  });

  it("should update the unchanged ready PR body", async () => {
    const github = createGitHubApi();

    await expect(runReviewerTasksCli(applyArgs, github)).resolves.toMatchObject({
      applied: true,
      baseOid,
      block: plainBlock,
      headOid,
      mentions: ["@assigned", "@author"],
    });
    expect(github.patch).toHaveBeenCalledWith("repos/acme/widget/pulls/7", {
      body: `Summary\n\n## 🧪 Verification\n\n${plainBlock}\n\n- [x] Tests pass.\n`,
    });
  });

  it("should return the persisted block after preserving checked tasks", async () => {
    const priorBody = upsertReviewerTaskBlock(body, render({ mentions: ["@assigned"] })).replace(
      "- [ ] @assigned reviews",
      "- [x] @assigned reviews",
    );
    const github = createGitHubApi({ pull: pullRequest({ body: priorBody }) });

    const result = await runReviewerTasksCli(applyArgs, github);

    expect(result.block).toBe(plainBlock.replace("- [ ] @assigned reviews", "- [x] @assigned reviews"));
    expect(result.body).toBe(upsertReviewerTaskBlock(priorBody, plainBlock));
    expect(github.patch).toHaveBeenCalledWith("repos/acme/widget/pulls/7", { body: result.body });
  });

  it("should reject a fenced-only Verification heading before writing the PR body", async () => {
    const github = createGitHubApi({ pull: pullRequest({ body: "```markdown\n## Verification\n```\n" }) });

    await expect(runReviewerTasksCli(applyArgs, github)).rejects.toThrow(
      "PR body must contain exactly one level-two Verification section",
    );
    expect(github.patch).not.toHaveBeenCalled();
  });

  it.each([" ", "x"])("should reject a draft preflight containing a [%s] managed reviewer task", async (check) => {
    const block = render().replace("- [ ]", `- [${check}]`);
    const github = createGitHubApi({ pull: pullRequest({ body: `${body}\n${block}\n`, draft: true }) });

    await expect(runReviewerTasksCli(dryArgs, github)).rejects.toThrow("draft PR must not contain managed reviewer tasks");
    expect(github.patch).not.toHaveBeenCalled();
  });

  it("should preflight a draft PR without writing", async () => {
    const github = createGitHubApi({ pull: pullRequest({ draft: true }) });

    await expect(runReviewerTasksCli(dryArgs, github)).resolves.toMatchObject({ applied: false, block: plainBlock, draft: true });
    expect(github.patch).not.toHaveBeenCalled();
  });

  it.each([
    ["draft on the first read", { pull: pullRequest({ draft: true }) }],
    ["converted to draft before the write", { latest: pullRequest({ draft: true }) }],
  ])("should refuse to write reviewer tasks while the PR is %s", async (_case, fixture) => {
    const github = createGitHubApi(fixture);

    await expect(runReviewerTasksCli(applyArgs, github)).rejects.toEqual(
      new Error("refusing to add reviewer tasks while PR acme/widget#7 is draft"),
    );
    expect(github.patch).not.toHaveBeenCalled();
  });

  it.each([
    ["head", ["--head", otherOid]],
    ["base", ["--base", otherOid]],
  ])("should refuse a live PR whose %s differs from the pinned revision", async (_case, pinned) => {
    const args = [...applyArgs, ...pinned];
    const github = createGitHubApi();

    await expect(runReviewerTasksCli(args, github)).rejects.toThrow(
      new Error("live PR revision does not match the pinned head and base"),
    );
    expect(github.patch).not.toHaveBeenCalled();
  });

  it.each([
    ["head", { head: { sha: otherOid } }],
    ["base", { base: { sha: otherOid } }],
    ["commit count", { commits: 3 }],
    ["creator", { user: { login: "someone" } }],
  ])("should refuse a write when the %s changes during generation", async (_case, fields) => {
    const github = createGitHubApi({ latest: pullRequest(fields) });

    await expect(runReviewerTasksCli(applyArgs, github)).rejects.toEqual(
      new Error("PR revision changed before reviewer task update"),
    );
    expect(github.patch).not.toHaveBeenCalled();
  });

  it("should refuse a write when the body changes during generation", async () => {
    const github = createGitHubApi({ latest: pullRequest({ body: `${body}\nConcurrent edit.\n` }) });

    await expect(runReviewerTasksCli(applyArgs, github)).rejects.toEqual(
      new Error("PR body changed before reviewer task update"),
    );
    expect(github.patch).not.toHaveBeenCalled();
  });

  it("should reject a PR closed between reviewer resolution and the write", async () => {
    const github = createGitHubApi({ latest: pullRequest({ state: "closed" }) });

    await expect(runReviewerTasksCli(applyArgs, github)).rejects.toThrow("pull request must be open and unmerged");
    expect(github.patch).not.toHaveBeenCalled();
  });

  describe("direction review", () => {
    const draftGitHub = (fixture: Fixture = {}) => createGitHubApi({ pull: pullRequest({ draft: true }), ...fixture });

    it.each(["yellow", "red", "black"])("should render only the %s-zone direction approval for the named approver", async (zone) => {
      const github = draftGitHub();

      const result = await runReviewerTasksCli(
        [...dryArgs, "--direction-zone", zone, "--direction-approver", "lead"],
        github,
      );

      expect(result).toMatchObject({ applied: false, block: managed([approveDirection("@lead", zone)]), mentions: [] });
      expect(github.listPages).not.toHaveBeenCalled();
    });

    it.each(["lead", "@lead"])("should normalize the approver %s to one mention", async (approver) => {
      const result = await runReviewerTasksCli(
        [...dryArgs, "--direction-zone", "red", "--direction-approver", approver],
        draftGitHub(),
      );

      expect(result.block).toBe(managed([approveDirection("@lead", "red")]));
    });

    it("should accept a 39-character approver login", async () => {
      const login = `a-${"b".repeat(37)}`;
      const result = await runReviewerTasksCli([...dryArgs, "--direction-zone", "red", "--direction-approver", login], draftGitHub());

      expect(result.block).toBe(managed([approveDirection(`@${login}`, "red")]));
    });

    it("should report that no task applies to a green direction review", async () => {
      const github = draftGitHub();

      await expect(runReviewerTasksCli([...dryArgs, "--direction-zone", "green"], github)).resolves.toMatchObject({
        applied: false,
        block: null,
      });
      expect(github.patch).not.toHaveBeenCalled();
    });

    it("should refuse a green direction review whose live revision differs from the pinned one", async () => {
      await expect(
        runReviewerTasksCli([...dryArgs, "--direction-zone", "green"], draftGitHub({ pull: pullRequest({ draft: true, head: { sha: otherOid } }) })),
      ).rejects.toEqual(new Error("live PR revision does not match the pinned head and base"));
    });

    it("should write the direction approval while the PR stays draft", async () => {
      const github = draftGitHub();

      const result = await runReviewerTasksCli([...applyArgs, "--direction-zone", "yellow", "--direction-approver", "lead"], github);

      expect(result).toMatchObject({ applied: true, block: managed([approveDirection("@lead", "yellow")]), draft: true });
      expect(github.patch).toHaveBeenCalledWith("repos/acme/widget/pulls/7", { body: upsertReviewerTaskBlock(body, result.block!) });
    });

    it("should keep the checked direction approval when a draft is refreshed at the same revision", async () => {
      const priorBody = upsertReviewerTaskBlock(body, renderDirection({ approverMention: "@lead", zone: "red" })).replace("- [ ] @lead", "- [x] @lead");
      const github = draftGitHub({ pull: pullRequest({ body: priorBody, draft: true }) });

      const result = await runReviewerTasksCli([...applyArgs, "--direction-zone", "red", "--direction-approver", "lead"], github);

      expect(result).toMatchObject({ applied: true, block: managed([approveDirection("@lead", "red").replace("- [ ]", "- [x]")]), body: priorBody });
    });

    it.each([
      ["a dry run", dryArgs, ["--direction-zone", "green"]],
      ["a dry run", dryArgs, ["--direction-zone", "red", "--direction-approver", "lead"]],
      ["an applied run", applyArgs, ["--direction-zone", "red", "--direction-approver", "lead"]],
    ])("should refuse %s with %j on a ready PR", async (_case, args, direction) => {
      const github = createGitHubApi();

      await expect(runReviewerTasksCli([...args, ...direction], github)).rejects.toEqual(
        new Error("direction-review PR acme/widget#7 must stay draft"),
      );
      expect(github.patch).not.toHaveBeenCalled();
    });

    it("should refuse a direction write when the PR becomes ready during generation", async () => {
      const github = draftGitHub({ latest: pullRequest() });

      await expect(
        runReviewerTasksCli([...applyArgs, "--direction-zone", "red", "--direction-approver", "lead"], github),
      ).rejects.toEqual(new Error("direction-review PR acme/widget#7 must stay draft"));
      expect(github.patch).not.toHaveBeenCalled();
    });

    it("should refuse a direction write when the PR body changes during generation", async () => {
      const github = draftGitHub({ latest: pullRequest({ body: `${body}\nConcurrent edit.\n`, draft: true }) });

      await expect(
        runReviewerTasksCli([...applyArgs, "--direction-zone", "red", "--direction-approver", "lead"], github),
      ).rejects.toEqual(new Error("PR body changed before reviewer task update"));
      expect(github.patch).not.toHaveBeenCalled();
    });
  });

  it.each<[string, string[], string]>([
    ["an unknown direction zone", ["--direction-zone", "purple"], "--direction-zone must be one of green, yellow, red, black: purple\nusage: "],
    ["an approver without a zone", ["--direction-approver", "lead"], "--direction-approver requires --direction-zone\nusage: "],
    ["an approver for a green zone", ["--direction-zone", "green", "--direction-approver", "lead"], "--direction-approver is not allowed for a green direction zone"],
    ["a yellow zone without an approver", ["--direction-zone", "yellow"], "--direction-zone yellow requires --direction-approver\nusage: "],
    ["a green zone applied", ["--direction-zone", "green", "--apply"], "--apply is not allowed for a green direction zone, which carries no managed task\nusage: "],
    ["a black-zone verification with a direction zone", ["--direction-zone", "red", "--direction-approver", "lead", "--black-zone"], "--black-zone is not allowed with --direction-zone, whose draft carries only the direction approval\nusage: "],
    ["a black-zone verification with a green direction zone", ["--black-zone", "--direction-zone", "green"], "--black-zone is not allowed with --direction-zone"],
    ["a leading-hyphen approver", ["--direction-zone", "red", "--direction-approver", "-lead"], "direction approver login is invalid: -lead\nusage: "],
    ["a doubled-hyphen approver", ["--direction-zone", "red", "--direction-approver", "le--ad"], "direction approver login is invalid: le--ad\nusage: "],
    ["a trailing-hyphen approver", ["--direction-zone", "red", "--direction-approver", "lead-"], "direction approver login is invalid: lead-\nusage: "],
    ["a bot approver", ["--direction-zone", "red", "--direction-approver", "lead[bot]"], "direction approver login is invalid: lead[bot]\nusage: "],
    ["a team approver", ["--direction-zone", "red", "--direction-approver", "@acme/leads"], "direction approver login is invalid: @acme/leads\nusage: "],
    ["a bare at sign", ["--direction-zone", "red", "--direction-approver", "@"], "direction approver login is invalid: @\nusage: "],
    ["a 40-character approver", ["--direction-zone", "red", "--direction-approver", "a".repeat(40)], `direction approver login is invalid: ${"a".repeat(40)}\nusage: `],
    ["an unknown argument", ["--force"], "unknown argument: --force\nusage: "],
    ["a flag without a value", ["--direction-zone"], "--direction-zone requires a value\nusage: "],
    ["an empty flag value", ["--direction-approver", ""], "--direction-approver requires a value\nusage: "],
    ["an abbreviated pinned head", ["--head", shortHead], "head must be a full lowercase 40-character SHA"],
    ["an uppercase pinned base", ["--base", "A".repeat(40)], "base must be a full lowercase 40-character SHA"],
    ["a URL hostname", ["--hostname", "https://github.com"], "hostname must be a bare GitHub host\nusage: "],
  ])("should reject %s before reading GitHub", async (_case, extra, message) => {
    const github = createGitHubApi();

    await expect(runReviewerTasksCli([...dryArgs, ...extra], github)).rejects.toThrow(message);
    expect(github.get).not.toHaveBeenCalled();
  });

  it.each([
    ["no arguments", []],
    ["--help", ["acme/widget#7", "--help"]],
    ["-h", ["-h"]],
  ])("should answer %s with the usage that names every flag", async (_case, args) => {
    await expect(runReviewerTasksCli(args, createGitHubApi())).rejects.toThrow(
      /^usage: generate-reviewer-tasks\.ts <owner\/repo>#<number>(?=.*--hostname <host>)(?=.*--head <sha>)(?=.*--base <sha>)(?=.*--black-zone)(?=.*--direction-zone <green\|yellow\|red\|black>)(?=.*--direction-approver <login>)(?=.*--apply)/,
    );
  });

  it.each(["acme/widget", "acme/widget#0"])("should reject the PR target %s", async (target) => {
    await expect(runReviewerTasksCli([target, ...dryArgs.slice(1)], createGitHubApi())).rejects.toThrow(
      `invalid PR target: ${target}\nusage: `,
    );
  });
});

describe("fn:main", () => {
  it("should print the dry-run block and succeed", async () => {
    const output = captureOutput();

    await expect(main(dryArgs, createGitHubApi())).resolves.toBe(0);
    expect(output.stdout()).toBe(`${managed([review("@assigned"), review("@author"), approve("@author")])}\n`);
    expect(output.stderr()).toBe("");
  });

  it("should report that no task applies to a green direction review", async () => {
    const output = captureOutput();

    await expect(main([...dryArgs, "--direction-zone", "green"], createGitHubApi({ pull: pullRequest({ draft: true }) }))).resolves.toBe(0);
    expect(output.stdout()).toBe("no managed task applies: the independent AI gate record approves a green direction-review draft\n");
  });

  it("should print the applied result as JSON", async () => {
    const github = createGitHubApi();
    const output = captureOutput();

    await expect(main(applyArgs, github)).resolves.toBe(0);
    expect(JSON.parse(output.stdout())).toMatchObject({
      applied: true,
      body: github.patch.mock.calls[0]?.[1]?.body,
      headOid,
    });
  });

  it("should print the failure and exit 1", async () => {
    const output = captureOutput();

    await expect(main([...dryArgs, "--force"], createGitHubApi())).resolves.toBe(1);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toMatch(/^unknown argument: --force\nusage: .*\n$/);
  });

  it("should reach GitHub through gh when no transport is given", async () => {
    vi.stubEnv("PATH", temporaryDirectory());
    const output = captureOutput();

    await expect(main(dryArgs)).resolves.toBe(1);
    expect(output.stderr()).toMatch(/gh/);
  });
});
