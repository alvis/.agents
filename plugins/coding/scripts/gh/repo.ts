/**
 * the `gh repo` subcommands behind the `gh-repo-<subcommand>.ts` drop-ins.
 * on a developer machine each runs `gh repo <subcommand>` unchanged; where
 * GitHub's GraphQL endpoint is blocked (see route.ts for why) `view` is served
 * over REST and `clone` through plain `git`.
 */

import { $ } from "bun";

import { JSON_FLAGS, parseArgs, value } from "./args.ts";
import {
  api,
  parseRepositorySpec,
  printJson,
  requestedFields,
  resolveRepository,
  runWrapper,
  WrapperError,
} from "./route.ts";

import type { Handler, Repository } from "./route.ts";

/** the REST repository fields this wrapper reads */
interface RestRepository {
  readonly full_name: string;
  readonly html_url: string;
  readonly default_branch: string;
}

/** `--json` fields the REST route can produce for `view` */
const REPO_FIELDS = ["nameWithOwner", "url", "defaultBranchRef"] as const;

async function target(selector: string | undefined, flag: string | undefined): Promise<Repository> {
  return selector === undefined
    ? await resolveRepository(flag, process.env)
    : parseRepositorySpec(selector, process.env.GH_HOST ?? "github.com");
}

async function view(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, JSON_FLAGS);
  const fields = value(parsed, "json");
  if (fields === undefined) throw new WrapperError("--json is required when routed through REST");
  const repository = await target(parsed.positionals[0], value(parsed, "repo"));
  const rest = await api<RestRepository>(repository, `repos/${repository.owner}/${repository.repo}`);
  const projections: Record<(typeof REPO_FIELDS)[number], unknown> = {
    nameWithOwner: rest.full_name,
    url: rest.html_url,
    defaultBranchRef: { name: rest.default_branch },
  };
  const names = requestedFields(fields, REPO_FIELDS) as (typeof REPO_FIELDS)[number][];
  await printJson(Object.fromEntries(names.map((name) => [name, projections[name]])), value(parsed, "jq"));
  return 0;
}

async function clone(argv: readonly string[]): Promise<number> {
  const separator = argv.indexOf("--");
  const own = separator === -1 ? argv : argv.slice(0, separator);
  const gitFlags = separator === -1 ? [] : argv.slice(separator + 1);
  const parsed = parseArgs(own, {});
  const [selector, directory] = parsed.positionals;
  if (selector === undefined) throw new WrapperError("gh repo clone needs a repository");
  const repository = parseRepositorySpec(selector, process.env.GH_HOST ?? "github.com");
  const url = `https://${repository.host}/${repository.owner}/${repository.repo}.git`;
  const result = await $`git clone ${gitFlags} ${url} ${directory ?? repository.repo}`.nothrow();
  return result.exitCode;
}

/** the REST implementation of every subcommand with a `gh-repo-<subcommand>.ts` drop-in */
export const SUBCOMMANDS: Readonly<Record<string, Handler>> = { view, clone };

/**
 * runs one `gh repo <subcommand>` invocation on the selected route
 * @param subcommand - the drop-in's `gh repo` subcommand
 * @param argv - arguments after the subcommand
 * @param env - process environment
 * @returns the exit code
 */
export async function run(
  subcommand: string,
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
): Promise<number> {
  return await runWrapper("repo", subcommand, SUBCOMMANDS, argv, env);
}
