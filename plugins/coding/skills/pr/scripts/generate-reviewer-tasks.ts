#!/usr/bin/env bun

import { spawn } from "node:child_process";

/** Minimal GitHub REST transport used by reviewer-task generation. */
export interface GitHubApi {
  get(path: string): Promise<unknown>;
  list(path: string): Promise<unknown[]>;
  listPages(path: string): Promise<unknown[]>;
  patch(path: string, fields: Record<string, unknown>): Promise<unknown>;
}

/** Inputs required to render an exact-revision reviewer task block. */
export interface ReviewerTaskBlockInput {
  authorMention: string;
  baseOid: string;
  hasBlackZoneVerification: boolean;
  headOid: string;
  mentions: string[];
}

/** Live PR data and resolved reviewer mentions. */
export interface ReviewerTaskGeneration {
  authorMention: string;
  baseOid: string;
  body: string;
  commitCount: number;
  draft: boolean;
  headOid: string;
  mentions: string[];
  state: "open";
}

/** Result returned by the reviewer-task CLI workflow. */
export interface ReviewerTaskCliResult extends ReviewerTaskGeneration {
  applied: boolean;
  block: string;
}

interface PullRequestTarget {
  number: number;
  repository: string;
}

interface PullRequestSnapshot {
  authorMention: string;
  baseOid: string;
  body: string;
  commitCount: number;
  draft: boolean;
  headOid: string;
  state: "open";
}

interface ReviewerTaskCliOptions extends PullRequestTarget {
  expectedBaseOid: string;
  expectedHeadOid: string;
  hasBlackZoneVerification: boolean;
  hostname: string;
  shouldApply: boolean;
}

type GitHubCommand = (
  args: string[],
  input?: Record<string, unknown>,
) => unknown | Promise<unknown>;

const START_MARKER = "<!-- coding:reviewer-tasks:start -->";
const END_MARKER = "<!-- coding:reviewer-tasks:end -->";
const REVISION_MARKER = /^<!-- coding:reviewer-tasks:revision head=([0-9a-f]{40}) base=([0-9a-f]{40}) -->$/;
const FULL_OID = /^[0-9a-f]{40}$/;
// Match the review summary's abbreviated SHA; the hidden marker retains exact OIDs.
const SHORT_OID_LENGTH = 7;
// GitHub supplies identity length; these patterns only exclude unsafe Markdown characters.
const ACCOUNT_NAME = "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?";
const ACCOUNT_LOGIN = new RegExp(`^${ACCOUNT_NAME}(?:\\[bot\\])?$`);
const TEAM_SLUG = new RegExp(`^${ACCOUNT_NAME}$`);
const REVIEWER_MENTION = new RegExp(
  `^@${ACCOUNT_NAME}(?:\\[bot\\])?(?:/${ACCOUNT_NAME})?$`,
);
const HOSTNAME =
  /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[1-9]\d{0,4})?$/;
const USAGE =
  "usage: generate-reviewer-tasks.ts <owner/repo>#<number> --hostname <host> --head <sha> --base <sha> [--black-zone] [--apply]";

/** Resolve all required reviewer identities from live GitHub metadata. */
export async function generateReviewerTasks(
  github: GitHubApi,
  repository: string,
  pullRequestNumber: number,
): Promise<ReviewerTaskGeneration> {
  const pullPath = `repos/${repository}/pulls/${pullRequestNumber}`;
  const pull = parsePullRequestSnapshot(await github.get(pullPath));
  if (pull.draft && inspectReviewerTaskBlock(pull.body))
    throw new Error("draft PR must not contain managed reviewer tasks");
  const requestedPages = await github.listPages(`${pullPath}/requested_reviewers`);
  if (requestedPages.length === 0)
    throw new Error("requested reviewer lookup returned no pages");
  const requested = requestedPages.map((page, index) =>
    expectRecord(page, `requested reviewers page ${index + 1}`),
  );
  const repositoryMetadata = expectRecord(
    await github.get(`repos/${repository}`),
    "repository metadata",
  );
  const repositoryOwner = readRepositoryOwner(repositoryMetadata);
  const assignedUsers = requested.flatMap((page) =>
    readAccountLogins(page.users, "assigned reviewer"),
  );
  const assignedTeams = requested.flatMap((page) =>
    readTeamMentions(
      page.teams,
      repositoryOwner.type === "Organization" ? repositoryOwner.login : null,
    ),
  );
  const fallbackUsers =
    (!pull.draft || repositoryOwner.type === "User") &&
    assignedUsers.length + assignedTeams.length === 0
      ? await resolveFallbackAccounts(github, repositoryOwner)
      : [];
  const commits = await github.list(`${pullPath}/commits`);
  if (commits.length !== pull.commitCount)
    throw new Error(
      `PR ${repository}#${pullRequestNumber} commit list is incomplete: expected ${pull.commitCount}, received ${commits.length}`,
    );
  const codeAuthors = readCommitAuthorLogins(commits);
  if (codeAuthors.length === 0)
    throw new Error(
      `PR ${repository}#${pullRequestNumber} has no GitHub-mapped commit author accounts`,
    );
  const mentions = deduplicateMentions([
    ...assignedUsers.map(mentionAccount),
    ...assignedTeams,
    ...fallbackUsers.map(mentionAccount),
    ...codeAuthors.map(mentionAccount),
  ]);
  if (mentions.length === 0)
    throw new Error("no reviewer accounts could be resolved");
  return { ...pull, mentions };
}

/** Render one marker-delimited set of unchecked exact-revision tasks. */
export function renderReviewerTaskBlock(input: ReviewerTaskBlockInput): string {
  validateOid(input.headOid, "head");
  validateOid(input.baseOid, "base");
  if (input.mentions.length === 0)
    throw new Error("at least one reviewer mention is required");
  for (const mention of input.mentions)
    if (!REVIEWER_MENTION.test(mention))
      throw new Error(`reviewer mention is invalid: ${mention}`);
  if (
    !REVIEWER_MENTION.test(input.authorMention) ||
    input.authorMention.includes("/")
  )
    throw new Error(`author mention is invalid: ${input.authorMention}`);
  const revision = input.headOid.slice(0, SHORT_OID_LENGTH);
  const tasks = input.mentions.map(
    (mention) => `- [ ] ${mention} reviews ${revision}`,
  );
  tasks.push(`- [ ] ${input.authorMention} approves ${revision}`);
  if (input.hasBlackZoneVerification)
    tasks.push(
      `- [ ] Verify the black-zone scope and risk controls for ${revision}.`,
    );
  return [
    START_MARKER,
    `<!-- coding:reviewer-tasks:revision head=${input.headOid} base=${input.baseOid} -->`,
    ...tasks,
    END_MARKER,
  ].join("\n");
}

/** Insert or replace the managed task block in one Verification section. */
export function upsertReviewerTaskBlock(body: string, block: string): string {
  const existing = inspectReviewerTaskBlock(body);
  const sections = [
    ...body.matchAll(
      /^##(?:[ \t]+\S+)*[ \t]+Verification(?:[ \t]+\[[^\]\r\n]+\])?[ \t]*\r?$/gim,
    ),
  ].filter((section) => !isInsideMarkdownFence(body, section.index!));
  if (sections.length !== 1)
    throw new Error(
      "PR body must contain exactly one level-two Verification section",
    );
  const sectionStart = sections[0]!.index!;
  const sectionEnd =
    [...body.matchAll(/^##\s+/gm)]
      .map((heading) => heading.index!)
      .find(
        (offset) =>
          offset > sectionStart && !isInsideMarkdownFence(body, offset),
      ) ?? body.length;
  if (existing) {
    if (existing.start < sectionStart || existing.end > sectionEnd)
      throw new Error("reviewer task block must be inside Verification");
    if (normalizeTaskChecks(existing.block) === normalizeTaskChecks(block))
      return body;
    const sameRevision =
      existing.block.split(/\r?\n/)[1] === block.split("\n")[1];
    const checkedTasks = new Set(
      (sameRevision ? existing.block.split(/\r?\n/) : [])
        .filter((line) => /^- \[[xX]\] /.test(line))
        .map(normalizeTaskChecks),
    );
    const refreshed = block
      .split("\n")
      .map((line) =>
        checkedTasks.has(line) ? line.replace("- [ ] ", "- [x] ") : line,
      )
      .join(existing.block.includes("\r\n") ? "\r\n" : "\n");
    return body.slice(0, existing.start) + refreshed + body.slice(existing.end);
  }
  const headingEnd = sectionStart + sections[0]![0].length;
  const insertion = body[headingEnd - 1] === "\r" ? headingEnd - 1 : headingEnd;
  const suffix = body.slice(insertion).replace(/^\r?\n(?:\r?\n)?/, "");
  const newline = body.includes("\r\n") ? "\r\n" : "\n";
  return `${body.slice(0, insertion)}${newline}${newline}${block.replaceAll("\n", newline)}${newline}${newline}${suffix}`;
}

/** Validate an existing managed block against the pinned revision. */
export function inspectReviewerTaskBlock(
  body: string,
  headOid?: string,
  baseOid?: string,
): { block: string; start: number; end: number } | null {
  const starts = findOccurrences(body, START_MARKER);
  const ends = findOccurrences(body, END_MARKER);
  if (starts.length === 0 && ends.length === 0) return null;
  if (starts.length !== 1 || ends.length !== 1 || starts[0]! > ends[0]!)
    throw new Error("PR body contains malformed reviewer task markers");
  const start = starts[0]!;
  const end = ends[0]! + END_MARKER.length;
  if (
    (start > 0 && body[start - 1] !== "\n") ||
    (end < body.length && body[end] !== "\n" &&
      !(body[end] === "\r" && body[end + 1] === "\n"))
  )
    throw new Error("PR body contains malformed reviewer task markers");
  if (isInsideMarkdownFence(body, start) || isInsideMarkdownFence(body, ends[0]!))
    throw new Error("reviewer task markers must be outside fenced code");
  const block = body.slice(start, end);
  const lines = block.split(/\r?\n/);
  if (
    lines.length < 4 ||
    lines[0] !== START_MARKER ||
    lines.at(-1) !== END_MARKER
  )
    throw new Error("PR body contains malformed reviewer task markers");
  const revision = REVISION_MARKER.exec(lines[1]!);
  if (!revision ||
    (headOid && revision[1] !== headOid) ||
    (baseOid && revision[2] !== baseOid))
    throw new Error("managed reviewer task has invalid revision");
  const shortHead = revision[1]!.slice(0, SHORT_OID_LENGTH);
  const seen = new Set<string>();
  let sawAuthorApproval = false;
  let sawBlackZone = false;
  for (const line of lines.slice(2, -1)) {
    const task = /^- \[[ xX]\] (.+)$/.exec(line)?.[1];
    if (!task) throw new Error("managed reviewer task has invalid shape");
    const black = /^Verify the black-zone scope and risk controls for ([0-9a-f]+)\.$/.exec(task);
    if (black) {
      if (black[1] !== shortHead)
        throw new Error("managed reviewer task has invalid revision");
      if (sawBlackZone) throw new Error("managed reviewer task is duplicated");
      sawBlackZone = true;
      continue;
    }
    const approval = /^(@[^ ]+) approves ([0-9a-f]+)$/.exec(task);
    if (approval) {
      if (
        sawAuthorApproval ||
        sawBlackZone ||
        !REVIEWER_MENTION.test(approval[1]!) ||
        approval[1]!.includes("/") ||
        approval[2] !== shortHead
      )
        throw new Error("managed reviewer task has invalid shape or revision");
      sawAuthorApproval = true;
      continue;
    }
    const review = /^(@[^ ]+) reviews ([0-9a-f]+)$/.exec(task);
    const mention = review?.[1];
    if (
      !review ||
      !mention ||
      !REVIEWER_MENTION.test(mention) ||
      review[2] !== shortHead ||
      sawBlackZone ||
      sawAuthorApproval
    )
      throw new Error("managed reviewer task has invalid shape or revision");
    if (seen.has(mention.toLowerCase())) throw new Error("managed reviewer task is duplicated");
    seen.add(mention.toLowerCase());
  }
  if (seen.size === 0) throw new Error("managed reviewer task has no reviewer");
  if (!sawAuthorApproval)
    throw new Error("managed reviewer task has no author approval");
  return { block, start, end };
}

/** Parse CLI arguments, generate tasks, and optionally update the pinned PR. */
export async function runReviewerTasksCli(
  args: string[],
  github?: GitHubApi,
): Promise<ReviewerTaskCliResult> {
  const options = parseCliOptions(args);
  const resolvedGitHub = github ?? createGitHubApi(options.hostname);
  const generated = await generateReviewerTasks(
    resolvedGitHub,
    options.repository,
    options.number,
  );
  assertPinnedRevision(generated, options);
  const block = renderReviewerTaskBlock({
    authorMention: generated.authorMention,
    baseOid: generated.baseOid,
    hasBlackZoneVerification: options.hasBlackZoneVerification,
    headOid: generated.headOid,
    mentions: generated.mentions,
  });
  if (!options.shouldApply) return { ...generated, applied: false, block };
  if (generated.draft)
    throw new Error(
      `refusing to add reviewer tasks while PR ${options.repository}#${options.number} is draft`,
    );
  const pullPath = `repos/${options.repository}/pulls/${options.number}`;
  const latest = parsePullRequestSnapshot(await resolvedGitHub.get(pullPath));
  if (
    latest.headOid !== options.expectedHeadOid ||
    latest.baseOid !== options.expectedBaseOid ||
    latest.commitCount !== generated.commitCount ||
    latest.authorMention !== generated.authorMention
  )
    throw new Error("PR revision changed before reviewer task update");
  if (latest.draft)
    throw new Error(
      `refusing to add reviewer tasks while PR ${options.repository}#${options.number} is draft`,
    );
  if (latest.body !== generated.body)
    throw new Error("PR body changed before reviewer task update");
  const updatedBody = upsertReviewerTaskBlock(latest.body, block);
  await resolvedGitHub.patch(pullPath, { body: updatedBody });
  const persistedBlock = inspectReviewerTaskBlock(
    updatedBody,
    options.expectedHeadOid,
    options.expectedBaseOid,
  )?.block;
  if (!persistedBlock) throw new Error("reviewer task block is missing after update");
  return { ...generated, applied: true, block: persistedBlock, body: updatedBody };
}

/** Create a GitHub REST transport backed by the authenticated gh CLI. */
export function createGitHubApi(
  hostname: string,
  executeGitHubCommand: GitHubCommand = runGitHubApi,
): GitHubApi {
  validateHostname(hostname);
  const paginated = async (path: string): Promise<unknown[]> => {
    const pages = await executeGitHubCommand([
      "--hostname",
      hostname,
      "--method",
      "GET",
      "--paginate",
      "--slurp",
      path,
      "-f",
      "per_page=100",
    ]);
    if (!Array.isArray(pages))
      throw new Error(`GitHub paginated response for ${path} is not an array`);
    return pages;
  };
  return {
    get: async (path) => executeGitHubCommand(["--hostname", hostname, path]),
    list: async (path) => {
      const pages = await paginated(path);
      return pages.flatMap((page, index) => {
        if (!Array.isArray(page))
          throw new Error(
            `GitHub list page ${index + 1} for ${path} is invalid`,
          );
        return page;
      });
    },
    listPages: async (path) => paginated(path),
    patch: async (path, fields) =>
      executeGitHubCommand(
        ["--hostname", hostname, "--method", "PATCH", path, "--input", "-"],
        fields,
      ),
  };
}

function parseCliOptions(args: string[]): ReviewerTaskCliOptions {
  if (args.length === 0 || args.includes("--help") || args.includes("-h"))
    throw new Error(USAGE);
  const target = parsePullRequestTarget(args[0]!);
  let expectedHeadOid = "";
  let expectedBaseOid = "";
  let hostname = "";
  let hasBlackZoneVerification = false;
  let shouldApply = false;
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--black-zone") hasBlackZoneVerification = true;
    else if (argument === "--apply") shouldApply = true;
    else if (
      argument === "--head" ||
      argument === "--base" ||
      argument === "--hostname"
    ) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value\n${USAGE}`);
      if (argument === "--head") expectedHeadOid = value;
      else if (argument === "--base") expectedBaseOid = value;
      else hostname = value;
      index += 1;
    } else throw new Error(`unknown argument: ${argument}\n${USAGE}`);
  }
  validateOid(expectedHeadOid, "head");
  validateOid(expectedBaseOid, "base");
  validateHostname(hostname);
  return {
    ...target,
    expectedBaseOid,
    expectedHeadOid,
    hasBlackZoneVerification,
    hostname,
    shouldApply,
  };
}

function parsePullRequestTarget(value: string): PullRequestTarget {
  const match = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#([1-9]\d*)$/.exec(value);
  if (!match) throw new Error(`invalid PR target: ${value}\n${USAGE}`);
  return { number: Number(match[2]), repository: match[1]! };
}

function parsePullRequestSnapshot(value: unknown): PullRequestSnapshot {
  const pull = expectRecord(value, "pull request");
  if (pull.state !== "open" || pull.merged !== false)
    throw new Error("pull request must be open and unmerged");
  const head = expectRecord(pull.head, "pull request head");
  const base = expectRecord(pull.base, "pull request base");
  const author = expectRecord(pull.user, "pull request author");
  const authorLogin = readString(author, "login", "pull request author");
  validateAccountLogin(authorLogin, "pull request author");
  if (typeof pull.draft !== "boolean")
    throw new Error("pull request draft state is missing");
  if (pull.body !== null && typeof pull.body !== "string")
    throw new Error("pull request body is invalid");
  if (!Number.isInteger(pull.commits) || Number(pull.commits) < 0)
    throw new Error("pull request commit count is invalid");
  const baseOid = readString(base, "sha", "pull request base");
  const headOid = readString(head, "sha", "pull request head");
  validateOid(baseOid, "pull request base");
  validateOid(headOid, "pull request head");
  return {
    authorMention: mentionAccount(authorLogin),
    baseOid,
    body: pull.body ?? "",
    commitCount: Number(pull.commits),
    draft: pull.draft,
    headOid,
    state: "open",
  };
}

async function resolveFallbackAccounts(
  github: GitHubApi,
  owner: { login: string; type: string },
): Promise<string[]> {
  if (owner.type === "User") return [owner.login];
  if (owner.type !== "Organization")
    throw new Error(`unsupported repository owner type: ${owner.type}`);
  const owners = readAccountLogins(
    await github.list(`orgs/${owner.login}/members?role=admin`),
    "organization owner",
  );
  if (owners.length === 0)
    throw new Error(
      `organization ${owner.login} has no discoverable owner accounts`,
    );
  return owners;
}

function readRepositoryOwner(repositoryMetadata: Record<string, unknown>): {
  login: string;
  type: string;
} {
  const owner = expectRecord(repositoryMetadata.owner, "repository owner");
  const login = readString(owner, "login", "repository owner");
  validateAccountLogin(login, "repository owner");
  return {
    login,
    type: readString(owner, "type", "repository owner"),
  };
}

function readCommitAuthorLogins(commits: unknown[]): string[] {
  return commits.map((value) => {
    const commit = expectRecord(value, "pull request commit");
    const sha = readString(commit, "sha", "pull request commit");
    if (commit.author === null)
      throw new Error(`commit ${sha} has no GitHub-mapped author account`);
    const author = expectRecord(commit.author, `commit ${sha} author`);
    const login = readString(author, "login", `commit ${sha} author`);
    validateAccountLogin(login, `commit ${sha} author`);
    return login;
  });
}

function readAccountLogins(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} list is invalid`);
  return value.map((entry, index) => {
    const login = readString(
      expectRecord(entry, `${label} ${index + 1}`),
      "login",
      label,
    );
    validateAccountLogin(login, label);
    return login;
  });
}

function readTeamMentions(
  value: unknown,
  repositoryOrganization: string | null,
): string[] {
  if (!Array.isArray(value)) throw new Error("assigned team list is invalid");
  return value.map((entry, index) => {
    const team = expectRecord(entry, `assigned team ${index + 1}`);
    const organizationLogin =
      team.organization === undefined
        ? repositoryOrganization
        : readString(
            expectRecord(
              team.organization,
              `assigned team ${index + 1} organization`,
            ),
            "login",
            `assigned team ${index + 1} organization`,
          );
    if (organizationLogin === null)
      throw new Error(`assigned team ${index + 1} has no organization account`);
    const slug = readString(team, "slug", `assigned team ${index + 1}`);
    validateAccountLogin(
      organizationLogin,
      `assigned team ${index + 1} organization`,
    );
    if (!TEAM_SLUG.test(slug))
      throw new Error(`assigned team ${index + 1} slug is invalid`);
    return `@${organizationLogin}/${slug}`;
  });
}

function deduplicateMentions(mentions: string[]): string[] {
  const seen = new Set<string>();
  return mentions.filter((mention) => {
    const identity = mention.toLowerCase();
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function mentionAccount(login: string): string {
  return `@${login}`;
}

function assertPinnedRevision(
  generated: ReviewerTaskGeneration,
  options: ReviewerTaskCliOptions,
): void {
  if (
    generated.headOid !== options.expectedHeadOid ||
    generated.baseOid !== options.expectedBaseOid
  )
    throw new Error("live PR revision does not match the pinned head and base");
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} is invalid`);
  return value as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${label} ${key} is missing`);
  return value;
}

function validateOid(value: string, label: string): void {
  if (!FULL_OID.test(value))
    throw new Error(`${label} must be a full lowercase 40-character SHA`);
}

function validateHostname(value: string): void {
  if (!HOSTNAME.test(value))
    throw new Error(`hostname must be a bare GitHub host\n${USAGE}`);
}

function validateAccountLogin(value: string, label: string): void {
  if (!ACCOUNT_LOGIN.test(value)) throw new Error(`${label} login is invalid`);
}

function normalizeTaskChecks(block: string): string {
  return block.replaceAll("\r\n", "\n").replace(/^- \[[ xX]\]/gm, "- [ ]");
}

function isInsideMarkdownFence(body: string, offset: number): boolean {
  let fence: { character: string; length: number } | null = null;
  for (const line of body.slice(0, offset).split(/\r?\n/)) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!match) continue;
    const marker = match[1]!;
    if (fence === null) {
      if (marker[0] === "`" && match[2]!.includes("`")) continue;
      fence = { character: marker[0]!, length: marker.length };
    } else if (
      marker[0] === fence.character &&
      marker.length >= fence.length &&
      match[2]!.trim() === ""
    ) fence = null;
  }
  return fence !== null;
}

function findOccurrences(value: string, search: string): number[] {
  const offsets: number[] = [];
  let offset = value.indexOf(search);
  while (offset !== -1) {
    offsets.push(offset);
    offset = value.indexOf(search, offset + search.length);
  }
  return offsets;
}

async function runGitHubApi(
  args: string[],
  input?: Record<string, unknown>,
): Promise<unknown> {
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("gh", ["api", ...args], { stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    let settled = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", (error) => {
      if (!settled) { settled = true; reject(error); }
    });
    child.stdin.on("error", (error) => {
      if (!settled) { settled = true; reject(error); }
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      if (code !== 0)
        reject(new Error(`gh api failed (${code ?? signal}): ${stderr.trim()}`));
      else resolve(stdout);
    });
    child.stdin.end(input === undefined ? undefined : JSON.stringify(input));
  });
  try {
    return JSON.parse(output);
  } catch (cause) {
    throw new Error("gh api returned invalid JSON", { cause });
  }
}

async function main(args: string[]): Promise<void> {
  const result = await runReviewerTasksCli(args);
  process.stdout.write(
    result.applied ? `${JSON.stringify(result)}\n` : `${result.block}\n`,
  );
}

if (import.meta.main)
  main(process.argv.slice(2)).catch((cause: unknown) => {
    const error = cause as Error;
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
