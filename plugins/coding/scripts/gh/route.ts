/**
 * routes `gh pr`, `gh issue` and `gh repo` calls for the coding plugin.
 *
 * most coding agents' cloud environments, Claude Code on the web among them,
 * block GitHub's GraphQL endpoint by network policy, and most of these `gh`
 * subcommands are GraphQL-backed. confining an agent to scoped REST routes is
 * also the safer access model. so on a developer machine the wrappers pass
 * straight through to `gh`, while in such an environment they reroute every
 * supported subcommand to `gh api repos/{owner}/{repo}/...` REST calls (plus
 * the Claude Code cloud proxy's `/ccr/` routes where GitHub offers no REST
 * equivalent) and refuse the rest by name.
 */

import { $ } from "bun";

import { detectRoute } from "./detect.ts";

/** a GitHub repository the REST route addresses */
export interface Repository {
  readonly host: string;
  readonly owner: string;
  readonly repo: string;
}

/** a usage or capability error that the wrapper reports and exits on */
export class WrapperError extends Error {
  /**
   * @param message - what the caller asked for and why it cannot run
   * @param exitCode - the process exit code to report
   */
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

/** a `--help` request, carrying the flag lines of the subcommand that received it */
export class HelpRequest extends Error {
  /**
   * @param flags - one line per accepted flag
   */
  constructor(readonly flags: readonly string[]) {
    super("help requested");
  }
}

/**
 * runs the real `gh` with the caller's exact arguments and terminal
 * @param group - the `gh` command group, such as `pr`
 * @param argv - every argument after the group, unchanged
 * @returns the `gh` exit code
 */
export async function passthrough(group: string, argv: readonly string[]): Promise<number> {
  const child = Bun.spawn(["gh", group, ...argv], {
    stdio: ["inherit", "inherit", "inherit"],
  });
  return await child.exited;
}

/** options for one `gh api` REST call */
export interface ApiOptions {
  readonly method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  readonly body?: unknown;
  readonly paginate?: boolean;
}

/**
 * performs one REST call through `gh api`, which keeps `gh`'s own
 * authentication, host configuration, and proxy settings
 * @param repository - supplies the host
 * @param path - the REST path, such as `repos/o/r/pulls/1`
 * @param options - method, JSON body, pagination
 * @returns parsed JSON
 */
export async function api<T = unknown>(
  repository: Pick<Repository, "host">,
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const args = ["api", "--hostname", repository.host];
  if (options.method) args.push("--method", options.method);
  if (options.paginate) args.push("--paginate", "--slurp");
  args.push(path);
  const result =
    options.body === undefined
      ? await $`gh ${args}`.quiet().nothrow()
      : await $`gh ${[...args, "--input", "-"]} < ${new Response(JSON.stringify(options.body))}`
          .quiet()
          .nothrow();
  if (result.exitCode !== 0)
    throw new WrapperError(
      result.stderr.toString().trim() || `gh api ${path} exited ${result.exitCode}`,
      result.exitCode,
    );
  const text = result.stdout.toString();
  return (text.trim() === "" ? null : JSON.parse(text)) as T;
}

/**
 * reads a list endpoint one page at a time, so a caller that has what it
 * needs stops before fetching the rest
 * @param repository - supplies the host
 * @param path - the REST list path, without paging parameters
 * @yields each item in order
 */
export async function* apiItems<T = unknown>(
  repository: Pick<Repository, "host">,
  path: string,
): AsyncGenerator<T> {
  const separator = path.includes("?") ? "&" : "?";
  for (let page = 1; ; page += 1) {
    const items = await api<T[]>(repository, `${path}${separator}per_page=${PAGE_SIZE}&page=${page}`);
    yield* items;
    if (items.length < PAGE_SIZE) return;
  }
}

/** GitHub's largest REST page; a shorter page is the last one */
const PAGE_SIZE = 100;

/**
 * parses `[HOST/]OWNER/REPO` or a repository URL
 * @param spec - the `--repo`, `GH_REPO`, or URL value
 * @param defaultHost - host used when the spec names none
 * @returns the repository
 */
export function parseRepositorySpec(spec: string, defaultHost = "github.com"): Repository {
  // credentials and ports belong to the transport, not to the host `gh api --hostname` takes
  const url = /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/u.exec(spec);
  if (url) return { host: url[1]!, owner: url[2]!, repo: url[3]! };
  const scp = /^(?:[^@]+@)?([^:/]+):([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(spec);
  if (scp) return { host: scp[1]!, owner: scp[2]!, repo: scp[3]! };
  const parts = spec.split("/");
  if (parts.length === 3 && parts.every(Boolean))
    return { host: parts[0]!, owner: parts[1]!, repo: parts[2]! };
  if (parts.length === 2 && parts.every(Boolean))
    return { host: defaultHost, owner: parts[0]!, repo: parts[1]! };
  throw new WrapperError(`cannot parse repository "${spec}"; expected [HOST/]OWNER/REPO`);
}

/**
 * resolves the target repository the way `gh` does for these wrappers:
 * `--repo`, then `GH_REPO`, then the `origin` remote of the current checkout
 * @param flag - the `--repo`/`-R` value
 * @param env - process environment
 * @returns the repository
 */
export async function resolveRepository(
  flag: string | undefined,
  env: Record<string, string | undefined>,
): Promise<Repository> {
  const host = env.GH_HOST ?? "github.com";
  const spec = flag ?? env.GH_REPO;
  if (spec) return parseRepositorySpec(spec, host);
  const remote = await $`git remote get-url origin`.quiet().nothrow();
  if (remote.exitCode !== 0)
    throw new WrapperError("no --repo given and the current directory has no origin remote");
  return parseRepositorySpec(remote.stdout.toString().trim(), host);
}

/**
 * returns the checked-out branch name
 * @returns the branch, or throws when detached
 */
export async function currentBranch(): Promise<string> {
  const result = await $`git branch --show-current`.quiet().nothrow();
  const branch = result.stdout.toString().trim();
  if (result.exitCode !== 0 || branch === "")
    throw new WrapperError("no pull request selector given and HEAD is not on a branch");
  return branch;
}

/**
 * reads a `--body-file` value, where `-` means stdin
 * @param bodyFile - body file path or `-`
 * @returns the body text, or undefined when no file is given
 */
export async function readBody(bodyFile: string | undefined): Promise<string | undefined> {
  if (bodyFile === undefined) return undefined;
  return bodyFile === "-" ? await Bun.stdin.text() : await Bun.file(bodyFile).text();
}

/**
 * prints a `--json` projection the way `gh` does, applying `--jq` when given
 * @param value - the projected object or array
 * @param jq - an optional jq expression
 */
export async function printJson(value: unknown, jq: string | undefined): Promise<void> {
  const json = JSON.stringify(value, null, 2);
  if (jq === undefined) {
    process.stdout.write(`${json}\n`);
    return;
  }
  const result = await $`jq -rc ${jq} < ${new Response(json)}`.quiet().nothrow();
  if (result.exitCode !== 0)
    throw new WrapperError(result.stderr.toString().trim() || "jq failed", result.exitCode);
  process.stdout.write(result.stdout.toString());
}

/**
 * selects requested `--json` fields from a projection table, rejecting any
 * field this route cannot produce by name
 * @param fields - the comma-separated `--json` value
 * @param available - the fields this route can produce
 * @returns the validated field names
 */
export function requestedFields(fields: string, available: readonly string[]): string[] {
  const names = fields.split(",").map((name) => name.trim()).filter(Boolean);
  const unknown = names.filter((name) => !available.includes(name));
  if (unknown.length > 0)
    throw new WrapperError(
      `--json field(s) ${unknown.join(", ")} are not available through the REST route; available: ${available.join(", ")}`,
    );
  return names;
}

/**
 * a REST implementation of one subcommand; one marked `routesItself` also
 * serves the native route, because it validates its input before either
 */
export type Handler = ((argv: readonly string[]) => Promise<number>) & { readonly routesItself?: boolean };

/**
 * runs one `gh-<group>-<subcommand>.ts` drop-in: native passthrough, or the
 * REST handler for the subcommand, which answers `--help` with its own flags
 * @param group - the `gh` command group, such as `pr`
 * @param subcommand - the drop-in's subcommand, a key of `handlers`
 * @param handlers - REST handlers by subcommand
 * @param argv - arguments after the subcommand
 * @param env - process environment
 * @returns the exit code
 */
export async function runWrapper(
  group: string,
  subcommand: string,
  handlers: Readonly<Record<string, Handler>>,
  argv: readonly string[],
  env: Record<string, string | undefined>,
): Promise<number> {
  const handler = handlers[subcommand]!;
  if (detectRoute(env) === "native" && !handler.routesItself) return await passthrough(group, [subcommand, ...argv]);
  try {
    return await handler(argv);
  } catch (error) {
    if (error instanceof HelpRequest) {
      process.stdout.write(`usage: gh-${group}-${subcommand}.ts [arguments] [flags]\n\nflags:\n${error.flags.join("\n")}\n`);
      return 0;
    }
    if (!(error instanceof WrapperError)) throw error;
    process.stderr.write(`gh-${group}-${subcommand}: ${error.message}\n`);
    return error.exitCode;
  }
}
