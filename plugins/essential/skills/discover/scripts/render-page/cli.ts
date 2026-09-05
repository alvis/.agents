import { resolve } from "node:path";

import { buildAssets } from "./bundle.ts";
import { renderFile } from "./file.ts";
import { renderRun } from "./run.ts";

/**
 * runs the command line interface.
 * @param argv arguments after the script name
 * @returns the process exit code
 */
export async function main(argv = Bun.argv.slice(2)): Promise<number> {
  const usage =
    "usage: bun scripts/render-page/cli.ts <data.json> -o <out.html>\n" +
    "       bun scripts/render-page/cli.ts --set <run.json> -o <out-dir>";
  const set = argv.indexOf("--set");
  const rest = set === -1 ? argv : argv.filter((_, index) => index !== set);
  const output = rest.indexOf("-o");
  const target = output === -1 ? "" : (rest[output + 1] ?? "");
  const positional =
    output === -1
      ? rest
      : rest.filter((_, index) => index !== output && index !== output + 1);
  const subject = set === -1 ? "data file" : "run file";
  const complaint =
    output === -1
      ? `missing the -o ${set === -1 ? "<out.html>" : "<out-dir>"} flag`
      : !target || target.startsWith("-")
        ? `-o needs an output path, received ${JSON.stringify(target)}`
        : positional.length !== 1
          ? `expected exactly one ${subject}, received ${positional.length}`
          : "";
  if (complaint) {
    console.error(`${usage}\nrender-page/cli.ts: error: ${complaint}`);
    return 2;
  }
  try {
    // a run renders every board with one set of assets and one board list, so
    // it is a mode of its own rather than a loop the caller writes
    if (set === -1)
      await renderFile(
        resolve(positional[0]),
        resolve(target),
        await buildAssets(),
      );
    else await renderRun(resolve(positional[0]), resolve(target));

    return 0;
  } catch (error) {
    console.error(`render-page/cli.ts: error: ${(error as Error).message}`);
    return 1;
  }
}


if (import.meta.main) process.exit(await main());
