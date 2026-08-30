import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { parseStream } from "./parse.ts";

import type { Stream } from "./parse.ts";

/** how long after finishing a stream stays on the board, in days. */
const GRACE_DAYS = 3;

/** one stream the board deliberately does not show, and why. */
export interface Excluded {
  /** the directory it was found in */
  id: string;
  /** the sentence the board prints for it */
  reason: string;
}

/** everything one `.state` tree had to say. */
export interface Tree {
  /** the streams the board draws */
  streams: Stream[];
  /** the ones it read and set aside, each with its reason */
  excluded: Excluded[];
}

/**
 * whether a finished stream is recent enough to still be worth drawing
 * @param stream the stream
 * @param now when the board is being built
 * @returns true where it should stay on the board
 */
function withinGrace(stream: Stream, now: Date): boolean {
  const updated = Date.parse(stream.updated);
  // an unreadable timestamp keeps the stream: a board that hides a stream
  // because it could not read one line of it is a board that hides exactly the
  // stream someone needs to go and fix
  if (Number.isNaN(updated)) return true;

  return now.getTime() - updated <= GRACE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * reads every live workstream out of a `.state` tree.
 *
 * only `works/` is ever enumerated. Archived streams are excluded by their
 * location and nothing else — there is no name to match, no flag to read and
 * no rule that could be written wrongly, because the code never looks in the
 * directory they are in. A stream is dropped from the board for one other
 * reason: it says it is `completed` and has not been touched for three days.
 * @param stateDir the `.state` directory
 * @param now when the board is being built, which the grace window is measured
 *   against
 * @returns the streams to draw and the ones set aside
 */
export async function readTree(stateDir: string, now: Date): Promise<Tree> {
  const works = join(stateDir, "works");
  const entries = await readdir(works, { withFileTypes: true }).catch(() => {
    throw new Error(
      `no workstreams to read: ${works} is not a directory, so this is not a .state tree`,
    );
  });

  const streams: Stream[] = [];
  const excluded: Excluded[] = [];
  // sorted, because a board built twice from one tree must be the same board,
  // and readdir order is the filesystem's business rather than a promise
  const found = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const entry of found) {
    const text = await readFile(join(works, entry, "state.md"), "utf8").catch(
      () => "",
    );
    if (!text) {
      excluded.push({ id: entry, reason: "holds no state.md to read" });
      continue;
    }
    const stream = parseStream(entry, text);
    if (stream.phase === "completed" && !withinGrace(stream, now)) {
      excluded.push({
        id: entry,
        reason: `completed and last updated ${stream.updated || "at an unrecorded time"}, past the ${GRACE_DAYS}-day window`,
      });
      continue;
    }
    streams.push(stream);
  }

  return { streams, excluded };
}
