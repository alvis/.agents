#!/usr/bin/env bun
/**
 * a drop-in for `gh issue`. on a developer machine it runs `gh issue`
 * unchanged; where GitHub's GraphQL endpoint is blocked (see gh/route.ts for
 * why) it serves the subcommands below over REST and refuses everything in
 * UNSUPPORTED by name.
 */

import { list, parseArgs, value } from "./gh/args.ts";
import {
  api,
  parseRepositorySpec,
  printJson,
  readBody,
  requestedFields,
  resolveRepository,
  runWrapper,
  WrapperError,
} from "./gh/route.ts";

import type { ParsedArgs } from "./gh/args.ts";
import type { Handler, Repository } from "./gh/route.ts";

/** `gh issue` subcommands and flags the REST route does not serve, with the reason */
export const UNSUPPORTED: Readonly<Record<string, string>> = {
  "close --duplicate-of":
    "the coding skills do not close issues as duplicates; reference the canonical issue in a comment instead",
  develop: "not used by the coding skills; no REST route implemented",
  list: "not used by the coding skills (lookup uses the search API); no REST route implemented",
  status: "not used by the coding skills; no REST route implemented",
  transfer: "not used by the coding skills; no REST route implemented",
  pin: "not used by the coding skills; no REST route implemented",
  unpin: "not used by the coding skills; no REST route implemented",
  lock: "not used by the coding skills; no REST route implemented",
  unlock: "not used by the coding skills; no REST route implemented",
  delete: "not used by the coding skills; no REST route implemented",
};

/** the REST issue fields this wrapper reads */
interface Issue {
  readonly number: number;
  readonly html_url: string;
  readonly title: string;
  readonly body: string | null;
  readonly state: string;
  readonly state_reason: string | null;
  readonly user: { readonly login: string } | null;
  readonly labels: readonly { readonly name: string }[];
  readonly assignees: readonly { readonly login: string }[];
  readonly created_at: string;
  readonly updated_at: string;
  readonly closed_at: string | null;
  readonly pull_request?: unknown;
}

/** `--json` fields the REST route can produce for `view` */
const ISSUE_FIELDS = [
  "number",
  "url",
  "title",
  "body",
  "state",
  "stateReason",
  "author",
  "labels",
  "assignees",
  "createdAt",
  "updatedAt",
  "closedAt",
] as const;

async function selectIssue(
  parsed: ParsedArgs,
): Promise<{ repository: Repository; number: string }> {
  const selector = parsed.positionals[0];
  if (selector === undefined) throw new WrapperError("an issue number or URL is required");
  const url = /^https?:\/\/[^/]+\/[^/]+\/[^/]+\/issues\/(\d+)/u.exec(selector);
  if (url) return { repository: parseRepositorySpec(selector), number: url[1]! };
  if (!/^#?\d+$/u.test(selector)) throw new WrapperError(`"${selector}" is not an issue number or URL`);
  return {
    repository: await resolveRepository(value(parsed, "repo"), process.env),
    number: selector.replace("#", ""),
  };
}

async function create(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {
    values: ["title", "body", "body-file", "label", "assignee", "milestone"],
    aliases: { t: "title", b: "body", F: "body-file", l: "label", a: "assignee", m: "milestone" },
  });
  const repository = await resolveRepository(value(parsed, "repo"), process.env);
  const title = value(parsed, "title");
  if (title === undefined) throw new WrapperError("--title is required when routed through REST");
  const body: Record<string, unknown> = {
    title,
    body: (await readBody(value(parsed, "body"), value(parsed, "body-file"))) ?? "",
  };
  if (list(parsed, "label").length > 0) body.labels = list(parsed, "label");
  if (list(parsed, "assignee").length > 0) body.assignees = list(parsed, "assignee");
  const milestone = value(parsed, "milestone");
  if (milestone !== undefined) body.milestone = await milestoneNumber(repository, milestone);
  const issue = await api<Issue>(repository, `repos/${repository.owner}/${repository.repo}/issues`, {
    method: "POST",
    body,
  });
  process.stdout.write(`${issue.html_url}\n`);
  return 0;
}

async function milestoneNumber(repository: Repository, milestone: string): Promise<number> {
  if (/^\d+$/u.test(milestone)) return Number(milestone);
  const milestones = await api<{ number: number; title: string }[]>(
    repository,
    `repos/${repository.owner}/${repository.repo}/milestones?state=all&per_page=100`,
  );
  const match = milestones.find((candidate) => candidate.title === milestone);
  if (!match) throw new WrapperError(`milestone "${milestone}" not found`);
  return match.number;
}

async function edit(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {
    values: ["title", "body", "body-file", "add-label", "remove-label", "add-assignee", "remove-assignee", "milestone"],
    booleans: ["remove-milestone"],
    aliases: { t: "title", b: "body", F: "body-file", m: "milestone" },
  });
  const { repository, number } = await selectIssue(parsed);
  const root = `repos/${repository.owner}/${repository.repo}/issues/${number}`;
  const changes: Record<string, unknown> = {};
  const title = value(parsed, "title");
  if (title !== undefined) changes.title = title;
  const body = await readBody(value(parsed, "body"), value(parsed, "body-file"));
  if (body !== undefined) changes.body = body;
  const milestone = value(parsed, "milestone");
  if (milestone !== undefined) changes.milestone = await milestoneNumber(repository, milestone);
  if (parsed.booleans.has("remove-milestone")) changes.milestone = null;
  if (Object.keys(changes).length > 0) await api(repository, root, { method: "PATCH", body: changes });
  const labels = list(parsed, "add-label");
  if (labels.length > 0) await api(repository, `${root}/labels`, { method: "POST", body: { labels } });
  for (const label of list(parsed, "remove-label"))
    await api(repository, `${root}/labels/${encodeURIComponent(label)}`, { method: "DELETE" });
  const assignees = list(parsed, "add-assignee");
  if (assignees.length > 0) await api(repository, `${root}/assignees`, { method: "POST", body: { assignees } });
  const removed = list(parsed, "remove-assignee");
  if (removed.length > 0) await api(repository, `${root}/assignees`, { method: "DELETE", body: { assignees: removed } });
  process.stdout.write(`https://${repository.host}/${repository.owner}/${repository.repo}/issues/${number}\n`);
  return 0;
}

async function comment(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, { values: ["body", "body-file"], aliases: { b: "body", F: "body-file" } });
  const { repository, number } = await selectIssue(parsed);
  const body = await readBody(value(parsed, "body"), value(parsed, "body-file"));
  if (body === undefined) throw new WrapperError("--body or --body-file is required when routed through REST");
  const created = await api<{ html_url: string }>(
    repository,
    `repos/${repository.owner}/${repository.repo}/issues/${number}/comments`,
    { method: "POST", body: { body } },
  );
  process.stdout.write(`${created.html_url}\n`);
  return 0;
}

async function close(argv: readonly string[]): Promise<number> {
  if (argv.some((arg) => arg === "--duplicate-of" || arg.startsWith("--duplicate-of=")))
    throw new WrapperError(`gh issue close --duplicate-of is unavailable through REST: ${UNSUPPORTED["close --duplicate-of"]}`);
  const parsed = parseArgs(argv, { values: ["comment", "reason"], aliases: { c: "comment", r: "reason" } });
  const { repository, number } = await selectIssue(parsed);
  const root = `repos/${repository.owner}/${repository.repo}/issues/${number}`;
  const reason = value(parsed, "reason");
  if (reason !== undefined && !["completed", "not planned"].includes(reason))
    throw new WrapperError(`invalid --reason "${reason}"; use completed or "not planned"`);
  const note = value(parsed, "comment");
  if (note !== undefined) await api(repository, `${root}/comments`, { method: "POST", body: { body: note } });
  await api(repository, root, {
    method: "PATCH",
    body: { state: "closed", state_reason: reason === "not planned" ? "not_planned" : "completed" },
  });
  return 0;
}

async function reopen(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, { values: ["comment"], aliases: { c: "comment" } });
  const { repository, number } = await selectIssue(parsed);
  const root = `repos/${repository.owner}/${repository.repo}/issues/${number}`;
  const note = value(parsed, "comment");
  if (note !== undefined) await api(repository, `${root}/comments`, { method: "POST", body: { body: note } });
  await api(repository, root, { method: "PATCH", body: { state: "open" } });
  return 0;
}

async function view(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {});
  const { repository, number } = await selectIssue(parsed);
  const issue = await api<Issue>(repository, `repos/${repository.owner}/${repository.repo}/issues/${number}`);
  const fields = value(parsed, "json");
  if (fields === undefined) {
    process.stdout.write(`${issue.title} #${issue.number}\n${issue.state.toUpperCase()} • ${issue.user?.login}\n\n${issue.body ?? ""}\n\nView this issue on GitHub: ${issue.html_url}\n`);
    return 0;
  }
  const projections: Record<(typeof ISSUE_FIELDS)[number], unknown> = {
    number: issue.number,
    url: issue.html_url,
    title: issue.title,
    body: issue.body ?? "",
    state: issue.state.toUpperCase(),
    stateReason: issue.state_reason?.toUpperCase() ?? "",
    author: { login: issue.user?.login },
    labels: issue.labels.map((label) => ({ name: label.name })),
    assignees: issue.assignees.map((assignee) => ({ login: assignee.login })),
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    closedAt: issue.closed_at,
  };
  const names = requestedFields(fields, ISSUE_FIELDS) as (typeof ISSUE_FIELDS)[number][];
  await printJson(Object.fromEntries(names.map((name) => [name, projections[name]])), value(parsed, "jq"));
  return 0;
}

/** the REST implementation of every supported subcommand */
const HANDLERS: Readonly<Record<string, Handler>> = { create, edit, comment, close, reopen, view };

/**
 * runs one `gh issue` invocation on the selected route
 * @param argv - arguments after `gh-issue.ts`, starting with the subcommand
 * @param env - process environment
 * @returns the exit code
 */
export async function main(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
): Promise<number> {
  return await runWrapper("issue", HANDLERS, UNSUPPORTED, argv, env);
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
