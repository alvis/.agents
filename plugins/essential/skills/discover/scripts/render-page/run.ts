import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { buildAssets } from "./bundle.ts";
import { renderFile } from "./file.ts";
import { highlighterOnce } from "./prism.ts";
import { RenderError } from "./error.ts";
import { readBoardEntry } from "./set.ts";
import {
  requireFilledArray,
  requireObject,
  requireString,
} from "./validate.ts";

import type { BoardEntry, BoardSet } from "./types/set.ts";

/** one board of a run, as the run's own file declares it. */
export interface RunBoard extends Omit<BoardEntry, "href"> {
  /** the data file this board is rendered from, relative to the run file */
  data: string;
  /** the file name this board is written as, inside the output directory */
  out: string;
}

/** a whole run: what it is called, and every board it produces. */
export interface RunFile {
  /** what the run is called, shown above every board's set list */
  label: string;
  /** every board of the run, in reading order */
  boards: (RunBoard & BoardEntry)[];
}

/**
 * reads a run file, refusing one that would produce a broken set.
 *
 * `href` is derived from the output name rather than authored beside it: the
 * two would otherwise have to agree, and the first time they did not the run
 * would render fifteen boards with a dead link between them and say nothing.
 * @param source the run file's contents
 * @param path the run file's own path, named verbatim by any refusal
 * @returns the run, with every board's href filled in
 */
export function readRun(source: string, path: string): RunFile {
  let raw: RunFile;
  try {
    raw = JSON.parse(source) as RunFile;
  } catch (error) {
    throw new RenderError(
      `${path} is not valid JSON: ${(error as Error).message}`,
    );
  }
  requireObject<RunFile>(raw, "run");
  requireString(raw.label, "run.label");
  const boards = requireFilledArray<RunBoard>(raw.boards, "run.boards").map(
    (board, index) => {
      const at = `run.boards[${index}]`;
      requireObject<RunBoard>(board, at);
      const out = requireString(board.out, `${at}.out`);
      // the boards of a run all land in one directory and link each other by
      // name, so an output that names a directory — or leaves one — is a link
      // the reader follows to nothing
      if (isAbsolute(out) || out.includes("/"))
        throw new RenderError(
          `${at}.out: ${JSON.stringify(out)} must be a plain file name; every board of a run is written side by side and links its siblings by name`,
        );

      return {
        ...readBoardEntry({ ...board, href: `./${out}` }, at),
        data: requireString(board.data, `${at}.data`),
        out,
      };
    },
  );
  // two boards writing one file leaves the run a board short, with the later
  // one silently overwriting the earlier
  const files = new Set<string>();
  for (const [index, board] of boards.entries()) {
    if (files.has(board.out))
      throw new RenderError(
        `run.boards[${index}].out: two boards write ${JSON.stringify(board.out)}`,
      );
    files.add(board.out);
  }

  return { label: raw.label, boards };
}

/**
 * renders every board of a run into one directory.
 *
 * the assets are built once and shared, and every board is handed the same
 * board list, so the set each one carries is the same set by construction
 * rather than by fifteen files agreeing.
 * @param runPath path to the run file
 * @param outDir directory every board is written into
 * @returns the path each board was written to, in the order declared
 */
export async function renderRun(
  runPath: string,
  outDir: string,
): Promise<string[]> {
  const source = await readFile(runPath, "utf8").catch(() => {
    throw new RenderError(`cannot read run file: ${runPath}`);
  });
  const run = readRun(source, runPath);
  const base = dirname(runPath);
  const set: BoardSet = {
    label: run.label,
    boards: run.boards.map(({ id, label, href, blurb }) => ({
      id,
      label,
      href,
      ...(blurb === undefined ? {} : { blurb }),
    })),
  };
  const assets = await buildAssets();
  const written: string[] = [];
  // one at a time rather than in parallel: a refusal names one board, and a
  // run that fails halfway should have stopped at the board it names
  // one highlighter for the whole run: the bundle is read, hashed and evaluated
  // once however many of the boards turn out to hold code
  const highlight = highlighterOnce();
  for (const board of run.boards) {
    const out = join(outDir, board.out);
    await renderFile(resolve(base, board.data), out, { ...assets, set }, highlight);
    written.push(out);
  }

  return written;
}
