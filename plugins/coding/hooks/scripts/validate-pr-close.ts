#!/usr/bin/env bun
/**
 * PreToolUse guard that refuses to close a pull request that still changes
 * files: a `direction-review` draft closes only once its peel-off leaves zero
 * residual diff (coding:directions/staged-delivery.md), and a close the agent
 * means anyway goes through `gh-pr-close.ts --force`, which this guard does not
 * check. Closes through raw REST or GraphQL calls are outside its reach
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { CLOSE_FLAGS, parseArgs, value } from "../../scripts/gh/args.ts";
import {
  hookEnvelope,
  parseShellWords,
  splitShellSegments,
  unwrapCommand,
} from "../../scripts/gh/guard.ts";

import type { GuardDecision } from "../../scripts/gh/guard.ts";

/** a pull request's identity and how many files it still changes */
export interface PullChanges {
  readonly changedFiles: number;
  readonly number: number;
}

/**
 * reads one pull request's changed-file count from the repository at `cwd`
 * unless `repo` names one, throwing with the reason when it cannot
 */
export type PullChangesReader = (
  selector: string | undefined,
  repo: string | undefined,
  cwd: string,
) => PullChanges;

/** one close found in a shell command */
interface CloseInvocation {
  /** the arguments after `close`, with any repository flag given before `pr` */
  readonly argv: readonly string[];
  /** where the close starts among the segment's words */
  readonly index: number;
  /** whether it runs the coding drop-in, the only close that takes `--force` */
  readonly viaDropIn: boolean;
}

const DROP_IN = "gh-pr-close.ts";
// shell keywords and launchers that run the command after them, so a close behind one still runs
const LAUNCHERS = ["do", "then", "else", "elif", "time", "xargs", "nohup", "exec", "sudo", "doas", "env", "command", "builtin", "nice", "timeout", "rtk", "proxy", "!", "{"];
// matches every spelling this guard governs, so any other command skips parsing
const CLOSE_TEXT = /\bpr\s+close\b|gh-pr-close\.ts/u;
// a close at a command position, behind any assignments, launchers, and their flags, for a command the segment splitter cannot read
const CLOSE_AT_COMMAND = new RegExp(
  String.raw`(?:^|[\n;&|(\x60]|\$\(|-c\s+['"])\s*(?:(?:[A-Za-z_]\w*=\S*|-\S+|\d\S*|(?:\S*\/)?(?:${LAUNCHERS.join("|").replace("{", "\\{")}))\s+)*` +
    String.raw`(?:\S*\/)?(?:gh\s+(?:(?:-R\s*|--repo[=\s])\S+\s+)*pr\s+close\b|(?:bun\s+(?:run\s+)?)?\S*gh-pr-close\.ts\b)`,
  "u",
);
// a leading shell assignment such as `FOO=1`, which still leaves the close at the command position
const ASSIGNMENT = /^[A-Za-z_]\w*=/u;
// an assignment that silently changes which repository gh closes in
const TARGET_ASSIGNMENT = /^GH_(?:REPO|HOST)=/u;
// an env option that runs the close in another directory
const CHDIR = /^(?:-C|--chdir(?:=.*)?)$/u;
// text the shell expands after this guard has read the command
const UNEXPANDED = /[$`]/u;
// an argument that needs no quoting when shown back as a command
const PLAIN_ARGUMENT = /^[\w./:@=+-]+$/u;
// the changed-file read gets 20 seconds, well under Claude Code's 60-second hook timeout: a harness that times a hook out runs the command, so a read that never answers must fail first to refuse the close
const READ_TIMEOUT_MS = 20_000;
const DRAFT_WARNING =
  "If this is a direction-review draft, finish the peel-off in coding:directions/staged-delivery.md first; a draft closes only once its residual diff is zero.";

/**
 * decides whether a shell command may close the pull requests it names
 * @param command exact command string supplied to the shell tool
 * @param pluginRoot resolved coding plugin root, for the forced-close command
 * @param cwd directory the command starts in
 * @param readChanges reads a pull request's changed-file count
 * @returns deny with the reason, or ignore to leave the command to the harness
 */
export function classifyPrCloseCommand(
  command: string,
  pluginRoot: string,
  cwd: string,
  readChanges: PullChangesReader,
): GuardDecision {
  const ignore: GuardDecision = { decision: "ignore", reason: "no close of a pull request with changes" };
  if (!CLOSE_TEXT.test(command)) return ignore;
  const unreadable = (error: unknown): GuardDecision => ({
    decision: "deny",
    reason: `Close refused: this command could not be read safely (${(error as Error).message}). Run the close as one plain command so the pull request it names can be checked. ${DRAFT_WARNING}`,
  });
  let segments: ReturnType<typeof splitShellSegments>;
  try {
    segments = splitShellSegments(command);
  } catch (error) {
    // a heredoc or substitution that only mentions a close, such as a commit message, runs nothing
    return CLOSE_AT_COMMAND.test(command) ? unreadable(error) : ignore;
  }
  let directory: string | null = cwd;
  for (const segment of segments) {
    let words: readonly string[];
    let unwrapped: readonly string[];
    try {
      words = parseShellWords(segment.text);
      unwrapped = unwrapCommand(words);
    } catch (error) {
      if (CLOSE_TEXT.test(segment.text)) return unreadable(error);
      continue;
    }
    if (unwrapped[0] === "pushd" || unwrapped[0] === "popd") {
      directory = null;
      continue;
    }
    if (unwrapped[0] === "cd") {
      const target = unwrapped[1];
      directory = directory !== null && unwrapped.length === 2 && target !== "-" && !/[$`~]/u.test(target!) ? resolve(directory, target!) : null;
      continue;
    }
    const invocation = findClose(unwrapped);
    if (invocation === null) continue;
    if (!unwrapped.slice(0, invocation.index).every((word) => ASSIGNMENT.test(word)))
      return {
        decision: "deny",
        reason: `Close refused: the close runs inside another command, so the pull request it closes cannot be checked. Run it as one plain command. ${DRAFT_WARNING}`,
      };
    if (words.some((word) => TARGET_ASSIGNMENT.test(word)))
      return {
        decision: "deny",
        reason: `Close refused: GH_REPO or GH_HOST changes which repository gh closes in. Name it with --repo [HOST/]OWNER/REPO instead. ${DRAFT_WARNING}`,
      };
    const moved = words[0] === "env" && words.some((word) => CHDIR.test(word));
    const refusal = checkClose(invocation, pluginRoot, moved ? null : directory, readChanges);
    if (refusal !== null) return { decision: "deny", reason: refusal };
  }
  return ignore;
}

/**
 * reads a pull request's changed-file count through the coding `gh pr view`
 * drop-in, so the check also works where GitHub's GraphQL endpoint is blocked
 * @param pluginRoot resolved coding plugin root
 * @param timeoutMs how long a read may take before it counts as unreadable
 * @returns the reader
 */
export function createPullChangesReader(pluginRoot: string, timeoutMs = READ_TIMEOUT_MS): PullChangesReader {
  return (selector, repo, cwd) => {
    const result = spawnSync(
      "bun",
      [
        join(pluginRoot, "scripts/gh-pr-view.ts"),
        ...(selector === undefined ? [] : [selector]),
        ...(repo === undefined ? [] : ["--repo", repo]),
        "--json",
        "number,changedFiles",
      ],
      { cwd, encoding: "utf8", timeout: timeoutMs },
    );
    if (result.error !== undefined)
      throw new Error(
        (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT"
          ? `gh pr view gave no answer within ${timeoutMs / 1000} seconds`
          : result.error.message,
      );
    if (result.status !== 0) throw new Error(result.stderr.trim() || `gh pr view exited ${result.status}`);
    const parsed = JSON.parse(result.stdout) as Partial<PullChanges>;
    if (!Number.isInteger(parsed.number) || !Number.isInteger(parsed.changedFiles))
      throw new Error(`gh pr view returned no changed-file count: ${result.stdout.trim()}`);
    return { number: parsed.number!, changedFiles: parsed.changedFiles! };
  };
}

/**
 * finds `gh [-R <repo>] pr close …` at any word, or a run of the coding close
 * drop-in, so a launcher or loop keyword in front of either cannot hide it
 * @param words one unwrapped simple command
 * @returns the close, or null when the command runs none
 */
function findClose(words: readonly string[]): CloseInvocation | null {
  for (let index = 0; index < words.length; index += 1) {
    const program = basename(words[index]!);
    if (program === DROP_IN) {
      const start = index - (words[index - 1] === "run" && words[index - 2] === "bun" ? 2 : words[index - 1] === "bun" ? 1 : 0);
      if (runsDropIn(words.slice(0, start))) return { argv: words.slice(index + 1), index: start, viaDropIn: true };
      continue;
    }
    if (program !== "gh") continue;
    // gh accepts the repository flag before the `pr` group too
    const repository: string[] = [];
    let next = index + 1;
    while (next < words.length && words[next] !== "pr") {
      const word = words[next]!;
      if (word === "-R" || word === "--repo") {
        repository.push("--repo", words[next + 1] ?? "");
        next += 2;
      } else if (word.startsWith("--repo=")) {
        repository.push(word);
        next += 1;
      } else if (word.startsWith("-R")) {
        repository.push("--repo", word.slice(2));
        next += 1;
      } else break;
    }
    if (words[next] === "pr" && words[next + 1] === "close")
      return { argv: [...words.slice(next + 2), ...repository], index, viaDropIn: false };
  }
  return null;
}

/**
 * tells whether the words before the drop-in run it, rather than name it as a
 * file for a reader such as `grep` or `git add`
 * @param before the words before the drop-in or its `bun` launcher
 * @returns true when nothing but assignments precede it, or when the nearest word that is not a flag is a launcher
 */
function runsDropIn(before: readonly string[]): boolean {
  if (before.every((word) => ASSIGNMENT.test(word))) return true;
  const launcher = before.findLast((word) => !/^[-\d]/u.test(word));
  return launcher !== undefined && LAUNCHERS.includes(basename(launcher));
}

/**
 * checks one close
 * @param invocation the close
 * @param pluginRoot resolved coding plugin root
 * @param cwd directory the close runs in, or null when a `cd` or `env -C` left it unknown
 * @param readChanges reads a pull request's changed-file count
 * @returns the refusal, or null when the close may run
 */
function checkClose(
  invocation: CloseInvocation,
  pluginRoot: string,
  cwd: string | null,
  readChanges: PullChangesReader,
): string | null {
  if (invocation.argv.some((argument) => argument === "--help" || argument === "-h")) return null;
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(invocation.argv, CLOSE_FLAGS);
  } catch (error) {
    return `Close refused: its arguments could not be read (${(error as Error).message}). ${DRAFT_WARNING}`;
  }
  const selector = parsed.positionals[0];
  const repo = value(parsed, "repo");
  if ([selector, repo].some((target) => target !== undefined && UNEXPANDED.test(target)))
    return `Close refused: the pull request or repository is a shell expression, which this hook reads before the shell expands it. Spell both literally. ${DRAFT_WARNING}`;
  const forcedClose = `bun "${join(pluginRoot, "scripts", DROP_IN)}" ${[...invocation.argv.filter((argument) => !/^--force(?:=|$)/u.test(argument)), "--force"].map(quote).join(" ")}`;
  const force = `To close it deliberately, run \`${forcedClose}\`; this hook does not check a forced close.`;
  if (parsed.booleans.has("force"))
    return invocation.viaDropIn
      ? null
      : `Close refused: \`gh pr close\` has no --force flag, so gh would reject this command. ${DRAFT_WARNING} ${force}`;
  if (repo === undefined && cwd === null)
    return `Close refused: the close runs in a directory this hook cannot follow, so its repository is unknown. Name it with --repo. ${DRAFT_WARNING}`;
  let changes: PullChanges;
  try {
    changes = readChanges(selector, repo, cwd ?? ".");
  } catch (error) {
    return `Close refused: whether the pull request still has changes could not be read (${(error as Error).message}). ${DRAFT_WARNING} ${force}`;
  }
  if (changes.changedFiles === 0) return null;
  return `Close refused: pull request #${changes.number} still changes ${changes.changedFiles} file${changes.changedFiles === 1 ? "" : "s"}. ${DRAFT_WARNING} ${force}`;
}

/**
 * quotes one argument for display as a shell word, keeping a variable expandable
 * @param argument the argument
 * @returns the argument, quoted when it holds shell syntax
 */
function quote(argument: string): string {
  if (PLAIN_ARGUMENT.test(argument)) return argument;
  return UNEXPANDED.test(argument) ? `"${argument.replace(/["\\]/gu, "\\$&")}"` : `'${argument.replaceAll("'", `'\\''`)}'`;
}

/**
 * reads the hook input and prints a denial when the command may not run
 * @param pluginRoot coding plugin root the entry script resolved from the harness
 */
function main(pluginRoot: string): void {
  let command: string;
  let cwd = process.cwd();
  try {
    const envelope = JSON.parse(readFileSync(0, "utf8")) as Record<string, unknown>;
    const toolInput = (envelope.tool_input ?? envelope.toolInput) as Record<string, unknown> | undefined;
    const candidate = toolInput?.command ?? toolInput?.cmd;
    if (typeof candidate !== "string") throw new Error("shell command is missing");
    command = candidate;
    if (typeof envelope.cwd === "string") cwd = envelope.cwd;
  } catch (error) {
    process.stdout.write(
      hookEnvelope({ decision: "deny", reason: `Close validation is unavailable: ${(error as Error).message}` }),
    );
    return;
  }
  const decision = classifyPrCloseCommand(command, pluginRoot, cwd, createPullChangesReader(pluginRoot));
  if (decision.decision !== "ignore") process.stdout.write(hookEnvelope(decision));
}

if (import.meta.main) main(process.argv[2] ?? join(import.meta.dirname, "../.."));
