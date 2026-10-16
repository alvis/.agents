/**
 * the `gh issue` subcommands behind the `gh-issue-<subcommand>.ts` drop-ins.
 * on a developer machine each runs `gh issue <subcommand>` unchanged; where
 * GitHub's GraphQL endpoint is blocked (see route.ts for why) it is served
 * over REST.
 */

import { parseArgs, value } from "./args.ts";
import {
  api,
  apiItems,
  parseRepositorySpec,
  readBody,
  resolveRepository,
  runWrapper,
  WrapperError,
} from "./route.ts";

import type { ParsedArgs } from "./args.ts";
import type { Handler, Repository } from "./route.ts";

/** the REST issue fields this wrapper reads */
interface Issue {
  readonly html_url: string;
}

/** the REST issue-comment fields this wrapper reads */
interface IssueComment {
  readonly id: number;
  readonly user: { readonly login: string } | null;
}

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
    values: ["title", "body-file"],
    aliases: { t: "title", F: "body-file" },
  });
  const repository = await resolveRepository(value(parsed, "repo"), process.env);
  const title = value(parsed, "title");
  if (title === undefined) throw new WrapperError("--title is required when routed through REST");
  const body = { title, body: (await readBody(value(parsed, "body-file"))) ?? "" };
  const issue = await api<Issue>(repository, `repos/${repository.owner}/${repository.repo}/issues`, {
    method: "POST",
    body,
  });
  process.stdout.write(`${issue.html_url}\n`);
  return 0;
}

async function edit(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {
    values: ["title", "body-file"],
    aliases: { t: "title", F: "body-file" },
  });
  const { repository, number } = await selectIssue(parsed);
  const changes: Record<string, string> = {};
  const title = value(parsed, "title");
  if (title !== undefined) changes.title = title;
  const body = await readBody(value(parsed, "body-file"));
  if (body !== undefined) changes.body = body;
  if (Object.keys(changes).length > 0)
    await api(repository, `repos/${repository.owner}/${repository.repo}/issues/${number}`, { method: "PATCH", body: changes });
  process.stdout.write(`https://${repository.host}/${repository.owner}/${repository.repo}/issues/${number}\n`);
  return 0;
}

/**
 * finds the viewer's most recent comment on an issue, reading every page
 * @param repository - the issue's repository
 * @param number - the issue number
 * @returns the comment id
 */
async function viewerLastComment(repository: Repository, number: string): Promise<number> {
  const { login } = await api<{ login: string }>(repository, "user");
  let last: number | undefined;
  for await (const item of apiItems<IssueComment>(
    repository,
    `repos/${repository.owner}/${repository.repo}/issues/${number}/comments`,
  ))
    if (item.user?.login === login) last = item.id;
  if (last === undefined) throw new WrapperError(`no comment by ${login} on issue #${number} to edit or delete`);
  return last;
}

/**
 * posts, edits, or deletes a comment on an issue the way `gh issue comment`
 * does: a new comment by default, or the viewer's last one with `--edit-last`
 * or `--delete-last --yes`. the target is not checked for being an issue:
 * a pull-request number writes that pull request's conversation comments
 * (see skills/pr/directions/review-publishing.md, "Guarded routes and limits")
 * @param argv - arguments after the subcommand
 * @returns the exit code
 */
async function comment(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {
    values: ["body-file"],
    booleans: ["edit-last", "delete-last", "yes"],
    aliases: { F: "body-file" },
  });
  const editLast = parsed.booleans.has("edit-last");
  const deleteLast = parsed.booleans.has("delete-last");
  if (editLast && deleteLast) throw new WrapperError("--edit-last and --delete-last cannot be combined");
  if (deleteLast && !parsed.booleans.has("yes"))
    throw new WrapperError("--delete-last needs --yes to confirm when routed through REST");
  const bodyFile = value(parsed, "body-file");
  if (deleteLast && bodyFile !== undefined) throw new WrapperError("--body-file cannot be combined with --delete-last");
  if (!deleteLast && bodyFile === undefined) throw new WrapperError("--body-file is required when routed through REST");
  const { repository, number } = await selectIssue(parsed);
  const root = `repos/${repository.owner}/${repository.repo}/issues`;
  if (deleteLast) {
    await api(repository, `${root}/comments/${await viewerLastComment(repository, number)}`, { method: "DELETE" });
    return 0;
  }
  const body = (await readBody(bodyFile))!;
  const written = editLast
    ? await api<{ html_url: string }>(
        repository,
        `${root}/comments/${await viewerLastComment(repository, number)}`,
        { method: "PATCH", body: { body } },
      )
    : await api<{ html_url: string }>(repository, `${root}/${number}/comments`, { method: "POST", body: { body } });
  process.stdout.write(`${written.html_url}\n`);
  return 0;
}

/** the REST implementation of every subcommand with a `gh-issue-<subcommand>.ts` drop-in */
export const SUBCOMMANDS: Readonly<Record<string, Handler>> = { create, edit, comment };

/**
 * runs one `gh issue <subcommand>` invocation on the selected route
 * @param subcommand - the drop-in's `gh issue` subcommand
 * @param argv - arguments after the subcommand
 * @param env - process environment
 * @returns the exit code
 */
export async function run(
  subcommand: string,
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
): Promise<number> {
  return await runWrapper("issue", subcommand, SUBCOMMANDS, argv, env);
}
