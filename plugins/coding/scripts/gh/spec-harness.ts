/**
 * runs a gh wrapper script against a fake `gh` (and optionally a fake `git`)
 * on PATH that records every call; shared by the wrapper specs
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** one recorded `gh` or `git` invocation */
export interface Call {
  readonly args: string[];
  readonly stdin: string;
}

/** the outcome of one wrapper run */
export interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly calls: Call[];
}

/** a response keyed by a REST path prefix, or `graphql`, that the fake gh matches */
export type Routes = Record<string, { readonly body: unknown; readonly exit?: number }>;

/** options for one wrapper run */
export interface RunOptions {
  readonly env?: Record<string, string>;
  readonly routes?: Routes;
  readonly nativeExit?: number;
  readonly stdin?: string;
  /** also shadow `git` with a recorder that prefixes its args with `git` */
  readonly fakeGit?: boolean;
}

/** the environment that selects the REST route */
export const cloud = { CLAUDE_CODE_REMOTE: "true" };

const FAKE_GH = `#!/usr/bin/env bun
import { appendFileSync, readFileSync } from "node:fs";
const args = process.argv.slice(2);
const stdin = args.includes("--input") || args[args.indexOf("--body-file") + 1] === "-" ? readFileSync(0, "utf8") : "";
appendFileSync(process.env.FAKE_RECORD, JSON.stringify({ args, stdin }) + "\\n");
if (args[0] !== "api") { process.stdout.write("native " + args.join(" ") + "\\n"); process.exit(Number(process.env.FAKE_NATIVE_EXIT)); }
const path = args.find((arg) => arg.startsWith("repos/")) ?? (args.includes("graphql") ? "graphql" : "");
const routes = JSON.parse(process.env.FAKE_ROUTES);
const key = Object.keys(routes).filter((prefix) => path.startsWith(prefix)).sort((a, b) => b.length - a.length)[0];
if (key === undefined) { process.stderr.write("no fake route for " + path); process.exit(3); }
const route = routes[key];
const paginate = args.includes("--slurp");
process.stdout.write(JSON.stringify(paginate && !Array.isArray(route.body?.[0]) ? [route.body] : route.body));
process.exit(route.exit ?? 0);
`;

const FAKE_GIT = `#!/usr/bin/env bun
import { appendFileSync } from "node:fs";
appendFileSync(process.env.FAKE_RECORD, JSON.stringify({ args: ["git", ...process.argv.slice(2)], stdin: "" }) + "\\n");
`;

/**
 * runs `script` with `argv`; `gh api` paths are answered from `routes` and
 * any other `gh` call is the native passthrough
 * @param script - absolute path of the wrapper
 * @param argv - wrapper arguments
 * @param options - environment, REST routes, native exit code, stdin
 * @returns exit status, output, and recorded calls
 */
export function runScript(script: string, argv: readonly string[], options: RunOptions = {}): Run {
  const root = mkdtempSync(join(tmpdir(), "gh-wrapper-spec-"));
  try {
    const record = join(root, "calls.jsonl");
    writeFileSync(join(root, "gh"), FAKE_GH, { mode: 0o755 });
    if (options.fakeGit) writeFileSync(join(root, "git"), FAKE_GIT, { mode: 0o755 });
    const result = spawnSync("bun", [script, ...argv], {
      encoding: "utf8",
      input: options.stdin ?? "",
      env: {
        ...process.env,
        PATH: `${root}:${process.env.PATH}`,
        FAKE_RECORD: record,
        FAKE_ROUTES: JSON.stringify(options.routes ?? {}),
        FAKE_NATIVE_EXIT: String(options.nativeExit ?? 0),
        GH_ROUTE: "",
        CLAUDE_CODE_REMOTE: "",
        ...options.env,
      },
    });
    const calls = existsSync(record)
      ? readFileSync(record, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Call)
      : [];
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * lists the REST calls a run made
 * @param result - the run
 * @returns each call as `METHOD path`
 */
export function restCalls(result: Run): string[] {
  return result.calls
    .filter((call) => call.args[0] === "api")
    .map((call) => {
      const method = call.args[call.args.indexOf("--method") + 1];
      return `${call.args.includes("--method") ? method : "GET"} ${call.args.find((arg) => arg.startsWith("repos/"))}`;
    });
}

/**
 * returns the JSON body sent to the REST call matching `call`
 * @param result - the run
 * @param call - `METHOD path` as restCalls reports it
 * @returns the parsed request body
 */
export function requestBody(result: Run, call: string): unknown {
  const index = restCalls(result).indexOf(call);
  const recorded = result.calls.filter((entry) => entry.args[0] === "api")[index];
  if (recorded === undefined) throw new Error(`no REST call ${call}`);
  return JSON.parse(recorded.stdin);
}
