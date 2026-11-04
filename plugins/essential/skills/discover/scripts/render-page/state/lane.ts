import { isBlocked, isRetired, says } from "./parse.ts";

import type { Stream, Task } from "./parse.ts";

/** the task lanes, in the order work moves through them, keyed by status */
export const TASK_LANES = [
  ["planned", "Planned"],
  ["working", "Working"],
  ["blocked", "Blocked"],
  ["failed", "Failed"],
  ["done", "Done"],
] as const;

/** the mark each status is written with, so a row whose two disagree can be told */
const MARKS: Record<string, string> = {
  planned: "-",
  working: "⧗",
  done: "✓",
  failed: "X",
  blocked: "!",
  superseded: "↪",
  cancelled: "⊘",
};

/**
 * lists the tasks a lane can hold: leaves that no revision retired
 *
 * every count on either board is taken over these, so a roll-up parent or a
 * retired row can never be counted as open or as done where no card shows it
 * @param stream the stream
 * @returns its drawable tasks, in table order
 */
export function drawable(stream: Stream): Task[] {
  return stream.tasks.filter((task) => !isRetired(task) && isLeaf(task, stream.tasks));
}

/**
 * names the lane a task belongs in
 * @param task the task
 * @returns the status of its lane, or empty where its status is none the board knows
 */
export function laneOf(task: Task): string {
  if (isBlocked(task) || disagrees(task)) return "blocked";
  const known = TASK_LANES.find(([status]) => says(task.status, status));

  return known ? known[0] : "";
}

/**
 * names a task's lane as its heading reads
 * @param task the task
 * @returns the lane's label, or the unrecorded lane's where the board knows no status for it
 */
export function laneLabel(task: Task): string {
  const lane = laneOf(task);

  return TASK_LANES.find(([status]) => status === lane)?.[1] ?? "Status unrecorded";
}

/**
 * whether a row's mark and status name different states
 *
 * both have to be ones the board knows, since a word it does not know is a gap
 * in the record rather than a contradiction in it
 * @param task the task
 * @returns true where the mark is not the one its status is written with
 */
export function disagrees(task: Task): boolean {
  const expected = MARKS[task.status.toLowerCase()];

  return expected !== undefined && Object.values(MARKS).includes(task.mark) && task.mark !== expected;
}

/**
 * whether a task is work someone executes rather than a roll-up of its children
 *
 * a parent with subtasks only reports what they report, so a board that drew
 * it beside them would count the same work twice; subtask ids are the parent's
 * id plus two digits, which is how the children are found
 * @param task the task
 * @param tasks every task in the same stream
 * @returns true where no other task is a subtask of it
 */
export function isLeaf(task: Task, tasks: Task[]): boolean {
  // compared as text rather than built into a pattern: the id comes from a
  // file, and a file is not a place to take regular-expression syntax from
  return !tasks.some(
    (other) =>
      other.id.startsWith(task.id) &&
      /^\d{2}$/u.test(other.id.slice(task.id.length)),
  );
}
