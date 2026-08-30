import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { parseStream } from "./parse.ts";

import type { Stream } from "./parse.ts";

/** how long after finishing a stream stays on the board, in days. */
const GRACE_DAYS = 3;

/** a date and time with nothing on the end saying which zone they are in. */
const ZONELESS = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/;

/**
 * reads a recorded timestamp as a moment.
 *
 * `Date.parse` reads a date on its own as UTC but a date and time with no zone
 * on the end as host-local, so one tree put a stream on the board in one
 * timezone and off it in another. The date-only rule is the one worth keeping,
 * so a zone-less time is read the same way.
 * @param updated the timestamp as the file records it
 * @returns the moment, or NaN where the line cannot be read as one
 */
function stampedAt(updated: string): number {
  const stamp = updated.trim();
  const zoneless = ZONELESS.exec(stamp);

  return Date.parse(zoneless ? `${zoneless[1]}T${zoneless[2]}Z` : stamp);
}

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
  const updated = stampedAt(stream.updated);
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
 * directory they are in. A `state.md` that is a link rather than a file is not
 * read for the same reason: following one would let a live directory name
 * archived work back onto a board that states its own exclusion as a fact.
 * A stream is dropped from the board for one other reason: it says it is
 * `completed` and has not been touched for three days.
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
    const file = join(works, entry, "state.md");
    const linked = await lstat(file)
      .then((stats) => !stats.isFile())
      .catch(() => false);
    if (linked) {
      excluded.push({
        id: entry,
        reason: "holds a state.md that is a link rather than a file, and a link can point anywhere, including into the archive",
      });
      continue;
    }
    const text = await readFile(file, "utf8").catch(() => "");
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
