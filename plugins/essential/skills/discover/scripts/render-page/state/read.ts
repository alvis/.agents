import { lstat, readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { parseStream, says } from "./parse.ts";

import type { Stream } from "./parse.ts";

/** how long after finishing a stream stays on the board, in days. */
export const GRACE_DAYS = 3;

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

/** who holds one live stream's main-agent lease, and until when. */
export interface Lease {
  /** the stream the lease is on */
  stream: string;
  /** the session that holds it */
  session: string;
  /** when it lapses, in seconds since the epoch */
  expiresAtSeconds: number;
}

/** everything one `.state` tree had to say. */
export interface Tree {
  /** the project the tree was read from, named after its directory */
  project: string;
  /** the streams the board draws */
  streams: Stream[];
  /** the ones it read and set aside, each with its reason */
  excluded: Excluded[];
  /** the leases held on the streams it draws */
  leases: Lease[];
  /** the lease files it found and could not read, each with its reason */
  leaseProblems: Excluded[];
}

/**
 * names the project a tree was read from.
 *
 * the directory holding `.state` is the project, and its name is what a reader
 * calls it. It is folded to a slug because it becomes both a board id and the
 * storage key beneath it, and a key is not the place for a space or a leading
 * dot. Two projects of one name under different parents still answer to one
 * slug — a run holding both is refused by name, which is the right answer, and
 * two rendered apart is the residue this cannot reach from a directory alone.
 * @param stateDir the `.state` directory the tree was read from
 * @returns the project's name as a slug, empty where it has no directory
 */
function projectOf(stateDir: string): string {
  return basename(dirname(stateDir))
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
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
  const leases: Lease[] = [];
  const leaseProblems: Excluded[] = [];
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
    if (says(stream.phase, "completed") && !withinGrace(stream, now)) {
      excluded.push({
        id: entry,
        reason: `completed and last updated ${stream.updated || "at an unrecorded time"}, past the ${GRACE_DAYS}-day window`,
      });
      continue;
    }
    streams.push(stream);
    const lease = await readLease(join(works, entry, "lease.json"), entry);
    if (typeof lease === "string") leaseProblems.push({ id: entry, reason: lease });
    else if (lease) leases.push(lease);
  }

  return {
    project: projectOf(stateDir),
    streams,
    excluded,
    leases,
    leaseProblems,
  };
}

/**
 * reads who holds one stream's lease.
 *
 * only the holder and the expiry are taken; the token digest beside them is
 * never read, because nothing here has any use for it. A link is refused for
 * the same reason a linked `state.md` is: it can point anywhere, and a lease
 * borrowed from another stream would put this session inside the wrong one.
 * @param file the lease file
 * @param stream the stream it sits in
 * @returns the lease; a sentence saying why it could not be read; or nothing
 *   where the stream holds no lease
 */
async function readLease(
  file: string,
  stream: string,
): Promise<Lease | string | undefined> {
  const stats = await lstat(file).catch(() => undefined);
  if (!stats) return undefined;
  if (!stats.isFile())
    return "holds a lease.json that is a link rather than a file, so whoever it names is not taken to hold this stream";
  const recorded = await readFile(file, "utf8")
    .then((text): unknown => JSON.parse(text))
    .catch(() => undefined);
  const session = field(recorded, "owner_session");
  const expires = field(recorded, "expires_at_epoch");
  if (typeof session !== "string" || !session || typeof expires !== "number" || !Number.isFinite(expires))
    return "holds a lease.json that does not record a holder and an expiry, so nobody is taken to hold this stream";

  return { stream, session, expiresAtSeconds: expires };
}

/**
 * reads one field of a parsed JSON value without trusting its shape
 * @param value whatever the file parsed to
 * @param key the field wanted
 * @returns the field's value, or undefined where the value is not an object
 */
function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}
