/**
 * the `gh pr` subcommands behind the `gh-pr-<subcommand>.ts` drop-ins. on a
 * developer machine each runs `gh pr <subcommand>` unchanged; in environments
 * that block GitHub's GraphQL endpoint (see route.ts for why) it is served
 * through REST and the Claude Code cloud proxy's `/ccr/` routes.
 */

import { JSON_FLAGS, parseArgs, value } from "./args.ts";
import {
  checkFromRun,
  checkFromStatus,
  rollupFromRun,
  rollupFromStatus,
} from "./checks.ts";
import {
  api,
  apiItems,
  currentBranch,
  parseRepositorySpec,
  printJson,
  readBody,
  requestedFields,
  resolveRepository,
  runWrapper,
  WrapperError,
} from "./route.ts";

import type { CheckRun, CommitStatus } from "./checks.ts";
import type { ParsedArgs } from "./args.ts";
import type { Handler, Repository } from "./route.ts";

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
  readonly merge_commit_sha: string | null;
  readonly merged_by?: { readonly login: string } | null;
  readonly labels: readonly { readonly node_id: string; readonly name: string; readonly description: string | null; readonly color: string }[];
  readonly assignees: readonly { readonly node_id: string; readonly login: string }[];
}

/**
 * operations the coding skills run that the REST route cannot serve, with the
 * reason; a flag here fails fast instead of half-working
 */
export const UNSUPPORTED: Readonly<Record<string, string>> = {
  "closing-issue links":
    "closingIssuesReferences and add/removeCloseIssueReferences are GraphQL-only; list resolving issues on the PR body's closing line (`Closes #<n>, closes #<m>`) instead",
  "gh stack":
    "the gh-stack extension calls GitHub itself and cannot be rerouted by this wrapper",
  "--delete-branch":
    "the Claude Code cloud proxy refuses deleting a branch ref through REST and git push alike; delete the branch from a developer machine",
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
  "mergeStateStatus",
  "statusCheckRollup",
  "createdAt",
  "updatedAt",
  "closed",
  "closedAt",
  "mergedAt",
  "mergedBy",
  "mergeCommit",
  "labels",
  "assignees",
] as const;

/** fields the list endpoint omits, which need the per-PR detail read */
const DETAIL_FIELDS = new Set(["changedFiles", "additions", "deletions", "mergeStateStatus", "mergedBy"]);

/**
 * names a pull request's state as `gh` does, which REST reports as `closed` for merged ones
 * @param pull - REST pull request
 * @returns OPEN, CLOSED or MERGED
 */
function displayState(pull: Pull): string {
  return pull.merged_at ? "MERGED" : String(pull.state).toUpperCase();
}

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
    state: () => displayState(detail),
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
    mergeStateStatus: () => String(detail.mergeable_state ?? "unknown").toUpperCase(),
    createdAt: () => detail.created_at,
    updatedAt: () => detail.updated_at,
    closed: () => detail.state === "closed",
    closedAt: () => detail.closed_at,
    mergedAt: () => detail.merged_at,
    mergedBy: () => (detail.merged_by ? { login: detail.merged_by.login } : null),
    mergeCommit: () => (detail.merged_at && detail.merge_commit_sha ? { oid: detail.merge_commit_sha } : null),
    labels: () =>
      detail.labels.map((label) => ({ id: label.node_id, name: label.name, description: label.description ?? "", color: label.color })),
    assignees: () => detail.assignees.map((assignee) => ({ id: assignee.node_id, login: assignee.login })),
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
  // like `gh pr view`, the current branch is looked up in the target repository's
  // own namespace, while a named branch matches any head, a fork's included
  const branch = selector ?? `${target.owner}:${await currentBranch()}`;
  const [owner, ref] = branch.includes(":") ? branch.split(":", 2) : [undefined, branch];
  const head = owner === undefined ? "" : `&head=${encodeURIComponent(`${owner}:${ref}`)}`;
  const pull =
    (await firstHead(target, `${root}/pulls?state=open${head}`, ref!)) ??
    (await firstHead(target, `${root}/pulls?state=all${head}`, ref!));
  if (!pull) throw new WrapperError(`no pull requests found for branch "${ref}"`);
  return { repository: target, pull };
}

/**
 * finds the first pull request on a list endpoint whose head branch is `ref`
 * @param repository - supplies the host
 * @param path - the pulls list path
 * @param ref - the head branch name
 * @returns the pull request, or undefined when no page has one
 */
async function firstHead(repository: Repository, path: string, ref: string): Promise<Pull | undefined> {
  for await (const pull of apiItems<Pull>(repository, path)) if (pull.head.ref === ref) return pull;
  return undefined;
}

async function repositoryFor(parsed: ParsedArgs): Promise<Repository> {
  return await resolveRepository(value(parsed, "repo"), process.env);
}

async function view(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, JSON_FLAGS);
  const { repository, pull } = await selectPull(await repositoryFor(parsed), parsed.positionals[0]);
  const fields = value(parsed, "json");
  if (fields === undefined) {
    process.stdout.write(
      `${pull.title} #${pull.number}\n${displayState(pull)}${pull.draft ? " (draft)" : ""} • ${pull.user?.login} wants to merge into ${pull.base.ref} from ${pull.head.ref}\n\n${pull.body ?? ""}\n\nView this pull request on GitHub: ${pull.html_url}\n`,
    );
    return 0;
  }
  await printJson(await project(repository, pull, requestedFields(fields, PR_FIELDS)), value(parsed, "jq"));
  return 0;
}

async function listPulls(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {
    values: ["head", "state", "limit", ...JSON_FLAGS.values],
    aliases: { H: "head", s: "state", L: "limit", ...JSON_FLAGS.aliases },
  });
  const repository = await repositoryFor(parsed);
  const state = value(parsed, "state") ?? "open";
  if (!["open", "closed", "merged", "all"].includes(state))
    throw new WrapperError(`invalid --state "${state}"`);
  const query = new URLSearchParams({ state: state === "merged" ? "closed" : state });
  // REST filters a head only as OWNER:BRANCH, while `gh pr list --head` matches the branch in any fork
  const head = value(parsed, "head");
  if (head?.includes(":")) query.set("head", head);
  const ref = head?.includes(":") ? head.split(":", 2)[1] : head;
  const limit = Number(value(parsed, "limit") ?? 30);
  const pulls: Pull[] = [];
  for await (const pull of apiItems<Pull>(repository, `repos/${repository.owner}/${repository.repo}/pulls?${query}`)) {
    if (ref !== undefined && pull.head.ref !== ref) continue;
    if (state === "merged" && !pull.merged_at) continue;
    pulls.push(pull);
    if (pulls.length >= limit) break;
  }
  const fields = value(parsed, "json");
  if (fields === undefined) {
    for (const pull of pulls)
      process.stdout.write(`${pull.number}\t${pull.title}\t${pull.head.ref}\t${displayState(pull)}\n`);
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
    values: ["title", "body-file", "base", "head"],
    booleans: ["draft"],
    aliases: { t: "title", F: "body-file", B: "base", H: "head", d: "draft" },
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
      body: (await readBody(value(parsed, "body-file"))) ?? "",
      base,
      head: value(parsed, "head") ?? (await currentBranch()),
      draft: parsed.booleans.has("draft"),
    },
  });
  process.stdout.write(`${pull.html_url}\n`);
  return 0;
}

async function edit(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {
    values: ["title", "body-file", "base"],
    aliases: { t: "title", F: "body-file", B: "base" },
  });
  const { repository, pull } = await selectPull(await repositoryFor(parsed), parsed.positionals[0]);
  const changes: Record<string, string> = {};
  const title = value(parsed, "title");
  if (title !== undefined) changes.title = title;
  const body = await readBody(value(parsed, "body-file"));
  if (body !== undefined) changes.body = body;
  const base = value(parsed, "base");
  if (base !== undefined) changes.base = base;
  if (Object.keys(changes).length > 0)
    await api(repository, `repos/${repository.owner}/${repository.repo}/pulls/${pull.number}`, { method: "PATCH", body: changes });
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
    booleans: ["merge", "squash", "rebase", "delete-branch"],
    aliases: { m: "merge", s: "squash", r: "rebase", d: "delete-branch" },
  });
  // refused before any write, so a merge never half-completes
  if (parsed.booleans.has("delete-branch"))
    throw new WrapperError(`gh pr merge --delete-branch is unavailable through REST: ${UNSUPPORTED["--delete-branch"]}`);
  const methods = (["merge", "squash", "rebase"] as const).filter((method) => parsed.booleans.has(method));
  if (methods.length !== 1) throw new WrapperError("specify exactly one of --merge, --squash, or --rebase");
  const { repository, pull } = await selectPull(await repositoryFor(parsed), parsed.positionals[0]);
  await api(repository, `repos/${repository.owner}/${repository.repo}/pulls/${pull.number}/merge`, {
    method: "PUT",
    body: { merge_method: methods[0] },
  });
  return 0;
}

async function checks(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {});
  const { repository, pull } = await selectPull(await repositoryFor(parsed), parsed.positionals[0]);
  const entries = [
    ...(await readRuns(repository, pull.head.sha)).map(checkFromRun),
    ...(await readStatuses(repository, pull.head.sha)).map(checkFromStatus),
  ];
  for (const entry of entries) process.stdout.write(`${entry.name}\t${entry.bucket}\t${entry.link ?? ""}\n`);
  // `gh pr checks` exits 1 when a check failed and 8 while any is pending
  if (entries.some((entry) => entry.bucket === "fail" || entry.bucket === "cancel")) return 1;
  return entries.some((entry) => entry.bucket === "pending") ? 8 : 0;
}

/** the REST implementation of every subcommand with a `gh-pr-<subcommand>.ts` drop-in */
export const SUBCOMMANDS: Readonly<Record<string, Handler>> = {
  view,
  list: listPulls,
  create,
  edit,
  ready,
  merge,
  checks,
};

/**
 * runs one `gh pr <subcommand>` invocation on the selected route
 * @param subcommand - the drop-in's `gh pr` subcommand
 * @param argv - arguments after the subcommand
 * @param env - process environment
 * @returns the exit code
 */
export async function run(
  subcommand: string,
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
): Promise<number> {
  return await runWrapper("pr", subcommand, SUBCOMMANDS, argv, env);
}
