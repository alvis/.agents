/** the header keys a phase is written under, in the order they are looked for. */
const PHASE_KEYS = ["Phase", "Lifecycle status"];

/** the columns a row must have to be read at all, as the header spells them. */
const NEEDED = {
  id: "ID",
  mark: "Mark",
  status: "Status",
  task: "Task",
  owner: "Owner",
  evidence: "Evidence",
};

/**
 * the columns the board draws where a table has them.
 *
 * wanted rather than needed, because requiring them would count every row of a
 * table written without them as unreadable — and this board is opened when
 * something has already gone wrong, which is the worst moment to hide six
 * streams behind a column one of them omitted.
 */
const WANTED = {
  depends: "Depends on",
  required: "Required",
  acceptance: "Acceptance",
};

/** what an alignment rule's cells look like, in every spelling GitHub accepts. */
const RULE = /^:?-+:?$/;

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
  /** what it waits on, where the table records dependencies */
  depends: string;
  /** whether the record calls it required, in the record's own wording */
  required: string;
  /** what would show it is finished, where the table records that */
  acceptance: string;
  /** the evidence column entire, which is where the next action is written */
  evidence: string;
  /** the `unblock:` clause, where the evidence column carries one */
  unblock: string;
}

/** one workstream, as its `state.md` records it. */
export interface Stream {
  /** the work id, which is its directory name */
  id: string;
  /**
   * the `Work ID` its file records, where that is not the directory name.
   *
   * the directory is what a stream is addressed by and a filesystem cannot
   * hold two of one name, so it is the id. A file claiming another name is a
   * fact about the record — obeyed, it would let one stream take another's
   * place on the board, or take the name of one the board excludes — so it is
   * carried and drawn beside the phase spelling rather than acted on.
   */
  claimed: string;
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
 * whether a word the record wrote is the word being asked about.
 *
 * the file's own spelling is what this board draws, so the folding happens at
 * the comparison rather than in the data: a stream whose phase reads
 * `Completed` is completed however it was typed, and a row whose status reads
 * `Blocked` is the row an operations board exists to surface.
 * @param recorded the value exactly as the file wrote it
 * @param word the word being asked about, in lower case
 * @returns true where the two are the same word
 */
export function says(recorded: string, word: string): boolean {
  return recorded.toLowerCase() === word;
}

/**
 * whether a task is stuck.
 *
 * both the mark and the status are read, because the two can disagree — a row
 * marked `!` whose status still says `working` is exactly the row an operations
 * board exists to surface, and reading only one of the two columns would let it
 * pass as ordinary work.
 * @param task the task
 * @returns true where it is blocked
 */
export function isBlocked(task: Task): boolean {
  return task.mark === "!" || says(task.status, "blocked");
}

/**
 * whether a task is finished
 * @param task the task
 * @returns true where it is done
 */
export function isDone(task: Task): boolean {
  return says(task.status, "done");
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
 * @returns the cells between the opening and closing pipe, or an empty array
 *   where the line is not a row at all
 */
function cells(line: string): string[] {
  // a leading and a trailing empty part, because a row opens and closes with a
  // pipe; the width itself is checked against the header rather than a constant
  const parts = line.trim().split("|");

  return parts.length < 3 ? [] : parts.slice(1, -1).map((cell) => cell.trim());
}

/**
 * whether a row is the alignment rule under a table's header
 * @param row the row's cells
 * @returns true where every cell is a rule
 */
function isRule(row: string[]): boolean {
  return row.length > 0 && row.every((cell) => RULE.test(cell));
}

/**
 * finds each column the board reads in a table's header row.
 *
 * by name rather than by position: a header written in a different order used
 * to be read positionally, so owner, status and task all shifted while nothing
 * was counted as unreadable — the exact harm the width check exists to
 * prevent, arriving through the header instead of through a row.
 * @param row the header row's cells
 * @returns where each column sits, or undefined where a needed one is missing
 */
function columns(row: string[]): Record<string, number> | undefined {
  const find = (name: string): number =>
    row.findIndex((cell) => cell === name || cell.startsWith(`${name} `));
  const at: Record<string, number> = {};
  for (const [key, name] of Object.entries(NEEDED)) {
    const index = find(name);
    if (index < 0) return undefined;
    at[key] = index;
  }
  for (const [key, name] of Object.entries(WANTED)) {
    const index = find(name);
    if (index >= 0) at[key] = index;
  }

  return at;
}

/**
 * reads the task table out of a state file.
 *
 * the header is found by the alignment rule beneath it, which is what makes a
 * row a table row in Markdown, and its columns are then located by name. Every
 * later row is read until prose ends the table. A row that cannot be read is
 * counted rather than guessed at and rather than dropped: the board draws that
 * count as a data-quality note, so a table this cannot read says so instead of
 * quietly reporting a stream with fewer tasks than it has.
 * @param lines the file, split into lines
 * @returns the tasks, and how many rows could not be read
 */
function tasks(lines: string[]): [Task[], number] {
  const start = lines.findIndex(
    (line, index) =>
      cells(line).length > 0 && isRule(cells(lines[index + 1] ?? "")),
  );
  if (start < 0) return [[], 0];

  const head = cells(lines[start]!);
  const at = columns(head);
  const found: Task[] = [];
  let malformed = 0;
  for (const line of lines.slice(start + 1)) {
    const text = line.trim();
    // a blank line inside the table is not the end of it, and neither is an
    // indented row; taking either as the end dropped every row that followed
    // and counted none of them
    if (!text) continue;
    if (!text.startsWith("|")) break;
    const row = cells(line);
    if (isRule(row)) continue;
    if (at === undefined || row.length !== head.length) {
      malformed += 1;
      continue;
    }
    // a wanted column the header did not have reads as an empty cell rather
    // than as a missing field, so every task has the same shape however the
    // stream that wrote it chose to lay its table out
    const cell = (key: string): string =>
      at[key] === undefined ? "" : row[at[key]!]!;
    const evidence = cell("evidence");
    found.push({
      id: cell("id"),
      mark: cell("mark"),
      status: cell("status"),
      task: cell("task"),
      owner: cell("owner"),
      depends: cell("depends"),
      required: cell("required"),
      acceptance: cell("acceptance"),
      evidence,
      unblock: /unblock:\s*(.+)$/.exec(evidence)?.[1]?.trim() ?? "",
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
  const claimed = header(lines, "Work ID");
  const [found, malformed] = tasks(lines);

  return {
    id,
    claimed: claimed === id ? "" : claimed,
    phase: phaseKey ? header(lines, phaseKey) : "",
    phaseKey,
    updated: header(lines, "Updated"),
    owner: header(lines, "Next owner"),
    next: header(lines, "Next action"),
    tasks: found,
    malformed,
  };
}
