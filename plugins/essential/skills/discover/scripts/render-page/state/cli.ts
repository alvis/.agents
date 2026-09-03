import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { stateBoard } from "./board.ts";
import { readTree } from "./read.ts";

/**
 * writes the moment the board was built, as the board prints it
 * @param now when the board is being built
 * @returns the timestamp, to the minute
 */
function stamp(now: Date): string {
  return `${now.toISOString().slice(0, 16).replace("T", " ")}Z`;
}

/**
 * runs the state board command line interface.
 *
 * this reads `.state` and writes page data — it never renders. Keeping the two
 * apart is what lets `renderPage` stay a pure function of its data: the board
 * this produces is an ordinary data file, indistinguishable from a hand-written
 * one, and `render-page/cli.ts` turns it into a page without knowing where it came
 * from.
 * @param argv arguments after the script name
 * @param now when the board is being built
 * @returns the process exit code
 */
export async function main(
  argv = Bun.argv.slice(2),
  now = new Date(),
): Promise<number> {
  const usage = "usage: bun scripts/render-page/state/cli.ts <.state> -o <board.json>";
  const output = argv.indexOf("-o");
  const target = output === -1 ? "" : (argv[output + 1] ?? "");
  const positional =
    output === -1
      ? argv
      : argv.filter((_, index) => index !== output && index !== output + 1);
  const complaint =
    output === -1
      ? "missing the -o <board.json> flag"
      : !target || target.startsWith("-")
        ? `-o needs an output path, received ${JSON.stringify(target)}`
        : positional.length !== 1
          ? `expected exactly one .state directory, received ${positional.length}`
          : "";
  if (complaint) {
    console.error(`${usage}\nstate/cli.ts: error: ${complaint}`);
    return 2;
  }
  try {
    const tree = await readTree(resolve(positional[0] as string), now);
    const out = resolve(target);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify(stateBoard(tree, stamp(now)), null, 2)}\n`);
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
