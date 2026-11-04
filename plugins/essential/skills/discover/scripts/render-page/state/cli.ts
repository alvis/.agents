import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { stateBoard } from "./board.ts";
import { streamKanban, taskKanban } from "./kanban.ts";
import { scopeOf } from "./scope.ts";
import { readTree } from "./read.ts";

/**
 * writes the moment the board was built, as the board prints it
 * @param now when the board is being built
 * @returns the timestamp, to the minute
 */
function stamp(now: Date): string {
  return `${now.toISOString().slice(0, 16).replace("T", " ")}Z`;
}

/** the flags that take a value, each naming what it takes. */
const VALUED = ["-o", "--stream", "--session"] as const;

/**
 * runs the state board command line interface.
 *
 * this reads `.state` and writes page data — it never renders. Keeping the two
 * apart is what lets `renderPage` stay a pure function of its data: the board
 * this produces is an ordinary data file, indistinguishable from a hand-written
 * one, and `render-page/cli.ts` turns it into a page without knowing where it came
 * from. With `--kanban` it writes the status board instead of the operations
 * board: one stream's tasks when `--stream` names it or this session holds its
 * lease, every live stream otherwise.
 * @param argv arguments after the script name
 * @param now when the board is being built
 * @param env the environment, read for this session's id when `--session` is absent
 * @returns the process exit code
 */
export async function main(
  argv = Bun.argv.slice(2),
  now = new Date(),
  env: Record<string, string | undefined> = process.env,
): Promise<number> {
  const usage =
    "usage: bun scripts/render-page/state/cli.ts <.state> -o <board.json> [--kanban [--stream <work-id>] [--session <id>]]";
  const kanban = argv.includes("--kanban");
  const at = (flag: string): number => argv.indexOf(flag);
  const value = (flag: string): string =>
    at(flag) === -1 ? "" : (argv[at(flag) + 1] ?? "");
  const taken = new Set(
    VALUED.flatMap((flag) => (at(flag) === -1 ? [] : [at(flag), at(flag) + 1])),
  );
  const positional = argv.filter(
    (word, index) => !taken.has(index) && word !== "--kanban",
  );
  const swallowed = VALUED.find(
    (flag) => at(flag) !== -1 && (!value(flag) || value(flag).startsWith("-")),
  );
  const complaint =
    at("-o") === -1
      ? "missing the -o <board.json> flag"
      : swallowed
        ? `${swallowed} needs ${swallowed === "-o" ? "an output path" : "a value"}, received ${JSON.stringify(value(swallowed))}`
        : !kanban && (at("--stream") !== -1 || at("--session") !== -1)
          ? "--stream and --session choose a status board, so they need --kanban"
          : positional.length !== 1
            ? `expected exactly one .state directory, received ${positional.length}`
            : "";
  if (complaint) {
    console.error(`${usage}\nstate/cli.ts: error: ${complaint}`);
    return 2;
  }
  try {
    const tree = await readTree(resolve(positional[0] as string), now);
    const scope = kanban
      ? scopeOf(tree, { stream: value("--stream"), session: value("--session") || env.CLAUDE_SESSION_ID }, now)
      : undefined;
    if (typeof scope === "string") {
      console.error(`state/cli.ts: error: ${scope}`);
      return 1;
    }
    const board = !scope
      ? stateBoard(tree, stamp(now))
      : scope.stream
        ? taskKanban(tree, scope, stamp(now))
        : streamKanban(tree, scope, stamp(now));
    const out = resolve(value("-o"));
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify(board, null, 2)}\n`);
    console.error(
      `state/cli.ts: read ${tree.streams.length} live stream${tree.streams.length === 1 ? "" : "s"}, set aside ${tree.excluded.length}`,
    );

    return 0;
  } catch (error) {
    console.error(`state/cli.ts: error: ${(error as Error).message}`);

    return 1;
  }
}


if (import.meta.main) process.exit(await main());
