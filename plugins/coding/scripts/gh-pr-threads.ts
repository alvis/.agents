#!/usr/bin/env bun
/**
 * prints every review thread of a pull request as one JSON array in the
 * shape gh/threads.ts defines: thread membership by comment ID, resolution,
 * outdated state, path, and line. `gh pr` has no thread subcommand, so this
 * sits beside the gh-pr.ts wrapper; it reads through GraphQL on a developer
 * machine and through the cloud proxy's `/ccr/` route where GraphQL is
 * blocked. read-only: resolution changes go through the review publisher.
 *
 * usage: gh-pr-threads.ts <number|url> [--repo [HOST/]OWNER/REPO]
 */

import { spawnSync } from "node:child_process";

import { parseArgs, value } from "./gh/args.ts";
import { detectRoute } from "./gh/detect.ts";
import { parseRepositorySpec, resolveRepository, WrapperError } from "./gh/route.ts";
import { listReviewThreads } from "./gh/threads.ts";

/**
 * runs `gh` synchronously and parses its JSON output
 * @param arguments_ - the `gh` arguments
 * @returns the parsed stdout
 */
function ghJson(arguments_: readonly string[]): unknown {
  const completed = spawnSync("gh", arguments_, { encoding: "utf8" });
  if (completed.status !== 0)
    throw new WrapperError(completed.stderr.trim() || `gh exited ${completed.status}`, completed.status ?? 1);
  return JSON.parse(completed.stdout);
}

/**
 * prints one pull request's review threads
 * @param argv - arguments after the script
 * @param env - process environment
 * @returns the exit code
 */
export async function main(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
): Promise<number> {
  try {
    const parsed = parseArgs(argv, {});
    const selector = parsed.positionals[0];
    if (selector === undefined) throw new WrapperError("a pull request number or URL is required");
    const url = /^https?:\/\/[^/]+\/[^/]+\/[^/]+\/pull\/(\d+)/u.exec(selector);
    if (!url && !/^#?\d+$/u.test(selector))
      throw new WrapperError(`"${selector}" is not a pull request number or URL`);
    const repository = url
      ? parseRepositorySpec(selector)
      : await resolveRepository(value(parsed, "repo"), env);
    const number = Number(url ? url[1] : selector.replace("#", ""));
    const threads = listReviewThreads(ghJson, detectRoute(env), { ...repository, number });
    process.stdout.write(`${JSON.stringify(threads)}\n`);
    return 0;
  } catch (error) {
    if (!(error instanceof WrapperError)) throw error;
    process.stderr.write(`gh-pr-threads: ${error.message}\n`);
    return error.exitCode;
  }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
