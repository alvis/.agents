/**
 * the `gh issue` subcommands behind the `gh-issue-<subcommand>.ts` drop-ins.
 * on a developer machine each runs `gh issue <subcommand>` unchanged; where
 * GitHub's GraphQL endpoint is blocked (see route.ts for why) it is served
 * over REST.
 */

import { parseArgs, value } from "./args.ts";
import {
  api,
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
    values: ["title", "body", "body-file"],
    aliases: { t: "title", b: "body", F: "body-file" },
  });
  const repository = await resolveRepository(value(parsed, "repo"), process.env);
  const title = value(parsed, "title");
  if (title === undefined) throw new WrapperError("--title is required when routed through REST");
  const body = { title, body: (await readBody(value(parsed, "body"), value(parsed, "body-file"))) ?? "" };
  const issue = await api<Issue>(repository, `repos/${repository.owner}/${repository.repo}/issues`, {
    method: "POST",
    body,
  });
  process.stdout.write(`${issue.html_url}\n`);
  return 0;
}

async function edit(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {
    values: ["title", "body", "body-file"],
    aliases: { t: "title", b: "body", F: "body-file" },
  });
  const { repository, number } = await selectIssue(parsed);
  const changes: Record<string, string> = {};
  const title = value(parsed, "title");
  if (title !== undefined) changes.title = title;
  const body = await readBody(value(parsed, "body"), value(parsed, "body-file"));
  if (body !== undefined) changes.body = body;
  if (Object.keys(changes).length > 0)
    await api(repository, `repos/${repository.owner}/${repository.repo}/issues/${number}`, { method: "PATCH", body: changes });
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
