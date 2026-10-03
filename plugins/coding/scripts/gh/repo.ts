/**
 * the `gh repo` subcommands behind the `gh-repo-<subcommand>.ts` drop-ins.
 * on a developer machine each runs `gh repo <subcommand>` unchanged; where
 * GitHub's GraphQL endpoint is blocked (see route.ts for why) `view` is served
 * over REST and `clone` through plain `git`.
 */

import { $ } from "bun";

import { parseArgs, value } from "./args.ts";
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

/** `gh repo` subcommands the REST route does not serve, with the reason; none has a drop-in */
export const UNSUPPORTED: Readonly<Record<string, string>> = {
  create: "not used by the coding skills; no REST route implemented",
  fork: "not used by the coding skills; no REST route implemented",
  edit: "not used by the coding skills; no REST route implemented",
  list: "not used by the coding skills; no REST route implemented",
  sync: "not used by the coding skills; no REST route implemented",
  rename: "not used by the coding skills; no REST route implemented",
  archive: "not used by the coding skills; no REST route implemented",
  delete: "not used by the coding skills; no REST route implemented",
};

/** the REST repository fields this wrapper reads */
interface RestRepository {
  readonly node_id: string;
  readonly name: string;
  readonly full_name: string;
  readonly html_url: string;
  readonly description: string | null;
  readonly default_branch: string;
  readonly private: boolean;
  readonly visibility?: string;
  readonly owner: { readonly login: string; readonly node_id: string };
}

/** `--json` fields the REST route can produce for `view` */
const REPO_FIELDS = [
  "id",
  "name",
  "nameWithOwner",
  "owner",
  "url",
  "description",
  "defaultBranchRef",
  "isPrivate",
  "visibility",
] as const;

async function target(selector: string | undefined, flag: string | undefined): Promise<Repository> {
  return selector === undefined
    ? await resolveRepository(flag, process.env)
    : parseRepositorySpec(selector, process.env.GH_HOST ?? "github.com");
}

async function view(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {});
  const repository = await target(parsed.positionals[0], value(parsed, "repo"));
  const rest = await api<RestRepository>(repository, `repos/${repository.owner}/${repository.repo}`);
  const fields = value(parsed, "json");
  if (fields === undefined) {
    process.stdout.write(`name:\t${rest.full_name}\ndescription:\t${rest.description ?? ""}\n\n${rest.html_url}\n`);
    return 0;
  }
  const projections: Record<(typeof REPO_FIELDS)[number], unknown> = {
    id: rest.node_id,
    name: rest.name,
    nameWithOwner: rest.full_name,
    owner: { id: rest.owner.node_id, login: rest.owner.login },
    url: rest.html_url,
    description: rest.description ?? "",
    defaultBranchRef: { name: rest.default_branch },
    isPrivate: rest.private,
    visibility: (rest.visibility ?? (rest.private ? "private" : "public")).toUpperCase(),
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
