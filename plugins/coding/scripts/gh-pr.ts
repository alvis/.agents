#!/usr/bin/env bun
/**
 * a drop-in for `gh pr`. on a developer machine it runs `gh pr` unchanged; in
 * environments that block GitHub's GraphQL endpoint (see gh/route.ts for why)
 * it serves the subcommands below through REST and the Claude Code cloud
 * proxy's `/ccr/` routes, and refuses everything in UNSUPPORTED by name.
 */

import { list, parseArgs, value } from "./gh/args.ts";
import {
  checkFromRun,
  checkFromStatus,
  rollupFromRun,
  rollupFromStatus,
} from "./gh/checks.ts";
import {
  api,
  apiList,
  currentBranch,
  parseRepositorySpec,
  printJson,
  readBody,
  requestedFields,
  resolveRepository,
  runWrapper,
  WrapperError,
} from "./gh/route.ts";

import type { CheckRun, CommitStatus } from "./gh/checks.ts";
import type { ParsedArgs } from "./gh/args.ts";
import type { Handler, Repository } from "./gh/route.ts";

/** the REST pull-request fields this wrapper reads */
interface Pull {
  readonly number: number;
  readonly html_url: string;
  readonly title: string;
  readonly body: string | null;
  readonly state: string;
  readonly draft?: boolean;
  readonly user: { readonly login: string } | null;
  readonly base: { readonly ref: string; readonly sha: string };
  readonly head: {
    readonly ref: string;
    readonly sha: string;
    readonly user?: { readonly login: string };
    readonly repo: {
      readonly name: string;
      readonly full_name: string;
      readonly node_id: string;
      readonly owner: { readonly login: string; readonly node_id: string };
    } | null;
  };
  readonly changed_files?: number;
  readonly additions?: number;
  readonly deletions?: number;
  readonly mergeable_state?: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly closed_at: string | null;
  readonly merged_at: string | null;
}

/**
 * operations the REST route cannot serve, with the reason; each fails fast
 * instead of half-working. the first group has no REST or `/ccr/` route at
 * all; the second has a REST route the coding skills never needed
 */
export const UNSUPPORTED: Readonly<Record<string, string>> = {
  revert: "GitHub exposes pull-request revert only through GraphQL (revertPullRequest)",
  status: "the cross-repository status summary is a GraphQL search with no REST equivalent",
  "closing-issue links":
    "closingIssuesReferences and add/removeCloseIssueReferences are GraphQL-only; list resolving issues on the PR body's closing line (`Closes #<n>, closes #<m>`) instead",
  "gh stack":
    "the gh-stack extension calls GitHub itself and cannot be rerouted by this wrapper",
  checkout: "not used by the coding skills; no REST route implemented",
  lock: "not used by the coding skills; no REST route implemented",
  unlock: "not used by the coding skills; no REST route implemented",
  "update-branch": "not used by the coding skills; no REST route implemented",
};

/** `--json` fields the REST route can produce for `view` and `list` */
const PR_FIELDS = [
  "number",
  "url",
  "title",
  "body",
  "state",
  "isDraft",
  "baseRefName",
  "baseRefOid",
  "headRefName",
  "headRefOid",
  "headRepository",
  "headRepositoryOwner",
  "author",
  "changedFiles",
  "additions",
  "deletions",
  "createdAt",
  "updatedAt",
  "closedAt",
  "mergedAt",
  "mergeStateStatus",
  "statusCheckRollup",
] as const;

/** fields the list endpoint omits, which need the per-PR detail read */
const DETAIL_FIELDS = new Set(["changedFiles", "additions", "deletions", "mergeStateStatus"]);

/** `--json` fields `checks` can produce */
const CHECK_FIELDS = ["name", "bucket", "state", "link", "startedAt", "completedAt", "workflow"];

/**
 * projects one REST pull request onto `gh`'s field names
 * @param repository - target repository
 * @param pull - REST pull request
 * @param fields - requested field names
 * @returns the projection
 */
async function project(
  repository: Repository,
  pull: Pull,
  fields: readonly string[],
): Promise<Record<string, unknown>> {
  const detail = fields.some((field) => DETAIL_FIELDS.has(field)) && pull.changed_files === undefined
    ? await api<Pull>(repository, `repos/${repository.owner}/${repository.repo}/pulls/${pull.number}`)
    : pull;
  const headOwner = detail.head.repo?.owner.login ?? detail.head.user?.login;
  const projections: Record<string, () => unknown> = {
    number: () => detail.number,
    url: () => detail.html_url,
    title: () => detail.title,
    body: () => detail.body ?? "",
    state: () => (detail.merged_at ? "MERGED" : String(detail.state).toUpperCase()),
    isDraft: () => detail.draft === true,
    baseRefName: () => detail.base.ref,
    baseRefOid: () => detail.base.sha,
    headRefName: () => detail.head.ref,
    headRefOid: () => detail.head.sha,
    headRepository: () => (detail.head.repo ? { id: detail.head.repo.node_id, name: detail.head.repo.name } : null),
    headRepositoryOwner: () => ({ id: detail.head.repo?.owner.node_id ?? "", login: headOwner }),
    author: () => ({ login: detail.user?.login }),
    changedFiles: () => detail.changed_files,
    additions: () => detail.additions,
    deletions: () => detail.deletions,
    createdAt: () => detail.created_at,
    updatedAt: () => detail.updated_at,
    closedAt: () => detail.closed_at,
    mergedAt: () => detail.merged_at,
    mergeStateStatus: () => String(detail.mergeable_state ?? "unknown").toUpperCase(),
  };
  const entries: [string, unknown][] = [];
  for (const field of fields) {
    entries.push([
      field,
      field === "statusCheckRollup"
        ? await rollup(repository, detail.head.sha)
        : projections[field]!(),
    ]);
  }
  return Object.fromEntries(entries);
}

async function readRuns(repository: Repository, sha: string): Promise<CheckRun[]> {
  const pages = await api<{ check_runs: CheckRun[] }[]>(
    repository,
    `repos/${repository.owner}/${repository.repo}/commits/${sha}/check-runs?per_page=100`,
    { paginate: true },
  );
  return pages.flatMap((page) => page.check_runs);
}

async function readStatuses(repository: Repository, sha: string): Promise<CommitStatus[]> {
  const pages = await api<{ statuses: CommitStatus[] }[]>(
    repository,
    `repos/${repository.owner}/${repository.repo}/commits/${sha}/status?per_page=100`,
    { paginate: true },
  );
  return pages.flatMap((page) => page.statuses);
}

async function rollup(repository: Repository, sha: string): Promise<unknown[]> {
  const [runs, statuses] = await Promise.all([
    readRuns(repository, sha),
    readStatuses(repository, sha),
  ]);
  return [...runs.map(rollupFromRun), ...statuses.map(rollupFromStatus)];
}

/**
 * resolves a pull-request selector — number, URL, or branch — like `gh pr`
 * @param repository - target repository
 * @param selector - the positional selector, or undefined for the current branch
 * @returns the target repository and the REST pull request
 */
async function selectPull(
  repository: Repository,
  selector: string | undefined,
): Promise<{ repository: Repository; pull: Pull }> {
  const url = selector ? /^https?:\/\/[^/]+\/[^/]+\/[^/]+\/pull\/(\d+)/u.exec(selector) : null;
  const target = url ? parseRepositorySpec(selector!) : repository;
  const root = `repos/${target.owner}/${target.repo}`;
  const number = url?.[1] ?? (selector && /^#?\d+$/u.test(selector) ? selector.replace("#", "") : undefined);
  if (number !== undefined)
    return { repository: target, pull: await api<Pull>(target, `${root}/pulls/${number}`) };
  const branch = selector ?? (await currentBranch());
  const [owner, ref] = branch.includes(":") ? branch.split(":", 2) : [target.owner, branch];
  const candidates = await api<Pull[]>(
    target,
    `${root}/pulls?state=all&per_page=100&head=${encodeURIComponent(`${owner}:${ref}`)}`,
  );
  const pull = candidates.find((candidate) => candidate.state === "open") ?? candidates[0];
  if (!pull) throw new WrapperError(`no pull requests found for branch "${ref}"`);
  return { repository: target, pull };
}

async function repositoryFor(parsed: ParsedArgs): Promise<Repository> {
  return await resolveRepository(value(parsed, "repo"), process.env);
}

async function view(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {});
  const { repository, pull } = await selectPull(await repositoryFor(parsed), parsed.positionals[0]);
  const fields = value(parsed, "json");
  if (fields === undefined) {
    process.stdout.write(
      `${pull.title} #${pull.number}\n${pull.merged_at ? "MERGED" : String(pull.state).toUpperCase()}${pull.draft ? " (draft)" : ""} • ${pull.user?.login} wants to merge into ${pull.base.ref} from ${pull.head.ref}\n\n${pull.body ?? ""}\n\nView this pull request on GitHub: ${pull.html_url}\n`,
    );
    return 0;
  }
  await printJson(await project(repository, pull, requestedFields(fields, PR_FIELDS)), value(parsed, "jq"));
  return 0;
}

async function listPulls(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {
    values: ["head", "base", "state", "limit", "author"],
    aliases: { H: "head", B: "base", s: "state", L: "limit", A: "author" },
  });
  const repository = await repositoryFor(parsed);
  const state = value(parsed, "state") ?? "open";
  if (!["open", "closed", "merged", "all"].includes(state))
    throw new WrapperError(`invalid --state "${state}"`);
  const query = new URLSearchParams({ state: state === "merged" ? "closed" : state, per_page: "100" });
  const head = value(parsed, "head");
  if (head) query.set("head", head.includes(":") ? head : `${repository.owner}:${head}`);
  const base = value(parsed, "base");
  if (base) query.set("base", base);
  const author = value(parsed, "author");
  const limit = Number(value(parsed, "limit") ?? 30);
  const pulls = (
    await apiList<Pull>(repository, `repos/${repository.owner}/${repository.repo}/pulls?${query}`)
  )
    .filter((pull) => state !== "merged" || pull.merged_at)
    .filter((pull) => !author || pull.user?.login === author)
    .slice(0, limit);
  const fields = value(parsed, "json");
  if (fields === undefined) {
    for (const pull of pulls)
      process.stdout.write(`${pull.number}\t${pull.title}\t${pull.head.ref}\t${String(pull.state).toUpperCase()}\n`);
    return 0;
  }
  const names = requestedFields(fields, PR_FIELDS);
  const rows = [];
  for (const pull of pulls) rows.push(await project(repository, pull, names));
  await printJson(rows, value(parsed, "jq"));
  return 0;
}

async function create(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {
    values: ["title", "body", "body-file", "base", "head", "label", "reviewer", "assignee"],
    booleans: ["draft"],
    aliases: { t: "title", b: "body", F: "body-file", B: "base", H: "head", d: "draft", l: "label", r: "reviewer", a: "assignee" },
  });
  const repository = await repositoryFor(parsed);
  const root = `repos/${repository.owner}/${repository.repo}`;
  const title = value(parsed, "title");
  if (title === undefined) throw new WrapperError("--title is required when routed through REST");
  const base =
    value(parsed, "base") ?? (await api<{ default_branch: string }>(repository, root)).default_branch;
  const pull = await api<Pull>(repository, `${root}/pulls`, {
    method: "POST",
    body: {
      title,
      body: (await readBody(value(parsed, "body"), value(parsed, "body-file"))) ?? "",
      base,
      head: value(parsed, "head") ?? (await currentBranch()),
      draft: parsed.booleans.has("draft"),
    },
  });
  await applyIssueMetadata(repository, pull.number, parsed);
  process.stdout.write(`${pull.html_url}\n`);
  return 0;
}

async function applyIssueMetadata(repository: Repository, number: number, parsed: ParsedArgs): Promise<void> {
  const root = `repos/${repository.owner}/${repository.repo}`;
  const labels = [...list(parsed, "label"), ...list(parsed, "add-label")];
  if (labels.length > 0) await api(repository, `${root}/issues/${number}/labels`, { method: "POST", body: { labels } });
  for (const label of list(parsed, "remove-label"))
    await api(repository, `${root}/issues/${number}/labels/${encodeURIComponent(label)}`, { method: "DELETE" });
  const reviewers = [...list(parsed, "reviewer"), ...list(parsed, "add-reviewer")];
  if (reviewers.length > 0)
    await api(repository, `${root}/pulls/${number}/requested_reviewers`, { method: "POST", body: reviewerBody(reviewers) });
  const removedReviewers = list(parsed, "remove-reviewer");
  if (removedReviewers.length > 0)
    await api(repository, `${root}/pulls/${number}/requested_reviewers`, { method: "DELETE", body: reviewerBody(removedReviewers) });
  const assignees = [...list(parsed, "assignee"), ...list(parsed, "add-assignee")];
  if (assignees.length > 0)
    await api(repository, `${root}/issues/${number}/assignees`, { method: "POST", body: { assignees } });
  const removedAssignees = list(parsed, "remove-assignee");
  if (removedAssignees.length > 0)
    await api(repository, `${root}/issues/${number}/assignees`, { method: "DELETE", body: { assignees: removedAssignees } });
}

function reviewerBody(reviewers: readonly string[]): { reviewers: string[]; team_reviewers: string[] } {
  return {
    reviewers: reviewers.filter((reviewer) => !reviewer.includes("/")),
    team_reviewers: reviewers.filter((reviewer) => reviewer.includes("/")).map((team) => team.split("/")[1]!),
  };
}

async function edit(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {
    values: ["title", "body", "body-file", "base", "add-label", "remove-label", "add-reviewer", "remove-reviewer", "add-assignee", "remove-assignee"],
    aliases: { t: "title", b: "body", F: "body-file", B: "base" },
  });
  const { repository, pull } = await selectPull(await repositoryFor(parsed), parsed.positionals[0]);
  const changes: Record<string, string> = {};
  const title = value(parsed, "title");
  if (title !== undefined) changes.title = title;
  const body = await readBody(value(parsed, "body"), value(parsed, "body-file"));
  if (body !== undefined) changes.body = body;
  const base = value(parsed, "base");
  if (base !== undefined) changes.base = base;
  if (Object.keys(changes).length > 0)
    await api(repository, `repos/${repository.owner}/${repository.repo}/pulls/${pull.number}`, { method: "PATCH", body: changes });
  await applyIssueMetadata(repository, pull.number, parsed);
  process.stdout.write(`${pull.html_url}\n`);
  return 0;
}

async function ready(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, { booleans: ["undo"] });
  const { repository, pull } = await selectPull(await repositoryFor(parsed), parsed.positionals[0]);
  // GitHub has no REST endpoint for the draft state; these are the Claude Code cloud proxy's routes
  const route = parsed.booleans.has("undo") ? "convert_to_draft" : "ready_for_review";
  await api(repository, `repos/${repository.owner}/${repository.repo}/pulls/${pull.number}/ccr/${route}`, { method: "POST" });
  return 0;
}

async function merge(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {
    values: ["subject", "body", "body-file", "match-head-commit"],
    booleans: ["merge", "squash", "rebase", "delete-branch", "auto", "disable-auto"],
    aliases: { m: "merge", s: "squash", r: "rebase", d: "delete-branch", t: "subject", b: "body", F: "body-file" },
  });
  const { repository, pull } = await selectPull(await repositoryFor(parsed), parsed.positionals[0]);
  const root = `repos/${repository.owner}/${repository.repo}`;
  const methods = (["merge", "squash", "rebase"] as const).filter((method) => parsed.booleans.has(method));
  if (parsed.booleans.has("disable-auto")) {
    await api(repository, `${root}/pulls/${pull.number}/ccr/auto_merge`, { method: "DELETE" });
    return 0;
  }
  if (methods.length !== 1) throw new WrapperError("specify exactly one of --merge, --squash, or --rebase");
  if (parsed.booleans.has("auto")) {
    await api(repository, `${root}/pulls/${pull.number}/ccr/auto_merge`, { method: "PUT", body: { merge_method: methods[0] } });
    return 0;
  }
  const body: Record<string, string> = { merge_method: methods[0]! };
  const subject = value(parsed, "subject");
  if (subject !== undefined) body.commit_title = subject;
  const message = await readBody(value(parsed, "body"), value(parsed, "body-file"));
  if (message !== undefined) body.commit_message = message;
  const sha = value(parsed, "match-head-commit");
  if (sha !== undefined) body.sha = sha;
  await api(repository, `${root}/pulls/${pull.number}/merge`, { method: "PUT", body });
  if (parsed.booleans.has("delete-branch") && pull.head.repo?.full_name === `${repository.owner}/${repository.repo}`)
    await api(repository, `${root}/git/refs/heads/${pull.head.ref}`, { method: "DELETE" });
  return 0;
}

async function checks(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {});
  const { repository, pull } = await selectPull(await repositoryFor(parsed), parsed.positionals[0]);
  const entries = [
    ...(await readRuns(repository, pull.head.sha)).map(checkFromRun),
    ...(await readStatuses(repository, pull.head.sha)).map(checkFromStatus),
  ];
  const fields = value(parsed, "json");
  if (fields === undefined) {
    for (const entry of entries)
      process.stdout.write(`${entry.name}\t${entry.bucket}\t${entry.link ?? ""}\n`);
  } else {
    const names = requestedFields(fields, CHECK_FIELDS);
    await printJson(
      entries.map((entry) => Object.fromEntries(names.map((name) => [name, entry[name as keyof typeof entry]]))),
      value(parsed, "jq"),
    );
  }
  // `gh pr checks` exits 1 when a check failed and 8 while any is pending
  if (entries.some((entry) => entry.bucket === "fail" || entry.bucket === "cancel")) return 1;
  return entries.some((entry) => entry.bucket === "pending") ? 8 : 0;
}

async function review(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {
    values: ["body", "body-file"],
    booleans: ["approve", "request-changes", "comment"],
    aliases: { a: "approve", r: "request-changes", c: "comment", b: "body", F: "body-file" },
  });
  const events = (["approve", "request-changes", "comment"] as const).filter((event) => parsed.booleans.has(event));
  if (events.length !== 1) throw new WrapperError("specify exactly one of --approve, --request-changes, or --comment");
  const { repository, pull } = await selectPull(await repositoryFor(parsed), parsed.positionals[0]);
  const body = await readBody(value(parsed, "body"), value(parsed, "body-file"));
  const event = { approve: "APPROVE", "request-changes": "REQUEST_CHANGES", comment: "COMMENT" }[events[0]!];
  await api(repository, `repos/${repository.owner}/${repository.repo}/pulls/${pull.number}/reviews`, {
    method: "POST",
    body: body === undefined ? { event } : { event, body },
  });
  return 0;
}

async function comment(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, { values: ["body", "body-file"], aliases: { b: "body", F: "body-file" } });
  const { repository, pull } = await selectPull(await repositoryFor(parsed), parsed.positionals[0]);
  const body = await readBody(value(parsed, "body"), value(parsed, "body-file"));
  if (body === undefined) throw new WrapperError("--body or --body-file is required when routed through REST");
  const created = await api<{ html_url: string }>(
    repository,
    `repos/${repository.owner}/${repository.repo}/issues/${pull.number}/comments`,
    { method: "POST", body: { body } },
  );
  process.stdout.write(`${created.html_url}\n`);
  return 0;
}

async function setState(argv: readonly string[], state: "open" | "closed"): Promise<number> {
  const parsed = parseArgs(argv, {
    values: state === "closed" ? ["comment"] : [],
    booleans: state === "closed" ? ["delete-branch"] : [],
    aliases: { c: "comment", d: "delete-branch" },
  });
  const { repository, pull } = await selectPull(await repositoryFor(parsed), parsed.positionals[0]);
  const root = `repos/${repository.owner}/${repository.repo}`;
  const note = value(parsed, "comment");
  if (note !== undefined) await api(repository, `${root}/issues/${pull.number}/comments`, { method: "POST", body: { body: note } });
  await api(repository, `${root}/pulls/${pull.number}`, { method: "PATCH", body: { state } });
  if (parsed.booleans.has("delete-branch") && pull.head.repo?.full_name === `${repository.owner}/${repository.repo}`)
    await api(repository, `${root}/git/refs/heads/${pull.head.ref}`, { method: "DELETE" });
  return 0;
}

async function diff(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, { booleans: ["name-only", "patch"] });
  const { repository, pull } = await selectPull(await repositoryFor(parsed), parsed.positionals[0]);
  const root = `repos/${repository.owner}/${repository.repo}/pulls/${pull.number}`;
  if (parsed.booleans.has("name-only")) {
    const files = await apiList<{ filename: string }>(repository, `${root}/files?per_page=100`);
    process.stdout.write(files.map((file) => `${file.filename}\n`).join(""));
    return 0;
  }
  const accept = parsed.booleans.has("patch") ? "application/vnd.github.patch" : "application/vnd.github.diff";
  process.stdout.write(await api<string>(repository, root, { accept, raw: true }));
  return 0;
}

/** the REST implementation of every supported subcommand */
const HANDLERS: Readonly<Record<string, Handler>> = {
  view,
  list: listPulls,
  create,
  edit,
  ready,
  merge,
  checks,
  review,
  comment,
  close: (argv) => setState(argv, "closed"),
  reopen: (argv) => setState(argv, "open"),
  diff,
};

/**
 * runs one `gh pr` invocation on the selected route
 * @param argv - arguments after `gh-pr.ts`, starting with the subcommand
 * @param env - process environment
 * @returns the exit code
 */
export async function main(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
): Promise<number> {
  return await runWrapper("pr", HANDLERS, UNSUPPORTED, argv, env);
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
