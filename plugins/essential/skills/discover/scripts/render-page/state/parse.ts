/** the header keys a phase is written under, in the order they are looked for. */
const PHASE_KEYS = ["Phase", "Lifecycle status"];

/** how many columns the canonical task table has. */
const COLUMNS = 9;

/** one task, as the canonical table rows it. */
export interface Task {
  /** the task's identifier, unique within its stream */
  id: string;
  /** the glyph in the mark column, whatever it is */
  mark: string;
  /** the word in the status column */
  status: string;
  /** what the task is */
  task: string;
  /** who it sits with */
  owner: string;
  /** the `unblock:` clause, where the evidence column carries one */
  unblock: string;
}

/** one workstream, as its `state.md` records it. */
export interface Stream {
  /** the work id, which is also its directory name */
  id: string;
  /** the lifecycle phase it reports */
  phase: string;
  /**
   * the header key the phase was read from.
   *
   * carried rather than normalised away, because the tree spells it two ways
   * and a board that silently picks one is a board nobody can use to find the
   * stream that spelled it the other.
   */
  phaseKey: string;
  /** when it was last written, as the ISO timestamp it records */
  updated: string;
  /** who it is waiting on */
  owner: string;
  /** what happens next, as one line */
  next: string;
  /** its tasks, in table order */
  tasks: Task[];
  /** rows the table held that could not be read as tasks */
  malformed: number;
}

/**
 * reads one `- Key: value` header line.
 *
 * the first occurrence, not the last: two streams in this tree repeat their
 * closing headers further down the file, and a reader taking the last one
 * would report a stale owner for exactly the streams that are hardest to read
 * by hand.
 * @param lines the file, split into lines
 * @param key the header key
 * @returns the value with any surrounding backticks removed, or an empty
 *   string where the file carries no such header
 */
function header(lines: string[], key: string): string {
  const found = lines.find((line) => line.startsWith(`- ${key}:`));

  return found === undefined
    ? ""
    : found
        .slice(`- ${key}:`.length)
        .trim()
        .replace(/^`|`$/g, "");
}

/**
 * splits one table row into its cells
 * @param line the row, pipes and all
 * @returns the cells, or an empty array where the row is not the shape the
 *   canonical table has
 */
function cells(line: string): string[] {
  const parts = line.split("|");
  // a leading and a trailing empty part, because the row opens and closes with
  // a pipe; anything else is a row this cannot read rather than one it guesses
  if (parts.length !== COLUMNS + 2) return [];

  return parts.slice(1, -1).map((cell) => cell.trim());
}

/**
 * reads the task table out of a state file.
 *
 * the header row is found rather than assumed at a fixed offset, and every
 * later row is read until the table ends. A row of the wrong width is counted
 * instead of guessed at: a nine-column table read as eight silently shifts
 * every owner one column left, which is worse than saying a row was unreadable.
 * @param lines the file, split into lines
 * @returns the tasks, and how many rows could not be read
 */
function tasks(lines: string[]): [Task[], number] {
  const start = lines.findIndex((line) => line.startsWith("| ID | Mark |"));
  if (start < 0) return [[], 0];

  const found: Task[] = [];
  let malformed = 0;
  // the row after the header is the alignment rule, which is skipped by the
  // same width check every other row goes through only if it happens to be
  // narrow, so it is skipped by name instead
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("|")) break;
    if (/^\|\s*-+\s*\|/.test(line)) continue;
    const row = cells(line);
    if (row.length !== COLUMNS) {
      malformed += 1;
      continue;
    }
    const [id, mark, status, task, , , , owner, evidence] = row as string[];
    found.push({
      id: id!,
      mark: mark!,
      status: status!,
      task: task!,
      owner: owner!,
      unblock: /unblock:\s*(.+)$/.exec(evidence!)?.[1]?.trim() ?? "",
    });
  }

  return [found, malformed];
}

/**
 * reads one workstream out of the text of its `state.md`.
 *
 * every field is optional in the sense that a missing one yields an empty
 * string rather than a refusal. This board is read when something has gone
 * wrong somewhere, and one stream written in an unexpected shape must not be
 * able to stop the other six from being seen; what the file did not say is
 * drawn on the board instead.
 * @param id the work id, taken from the directory name
 * @param text the file's contents
 * @returns the stream
 */
export function parseStream(id: string, text: string): Stream {
  const lines = text.split("\n");
  const phaseKey = PHASE_KEYS.find((key) => header(lines, key)) ?? "";
  const [found, malformed] = tasks(lines);

  return {
    id: header(lines, "Work ID") || id,
    phase: phaseKey ? header(lines, phaseKey) : "",
    phaseKey,
    updated: header(lines, "Updated"),
    owner: header(lines, "Next owner"),
    next: header(lines, "Next action"),
    tasks: found,
    malformed,
  };
}
