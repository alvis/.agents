import { disagrees, drawable, laneLabel, laneOf, TASK_LANES } from "./lane.ts";
import { factsOf, streamFacts, taskFacts } from "./ledger.ts";
import { isBlocked } from "./parse.ts";

import type { DetailedCard, LedgerFact } from "../types.ts";
import type { Stream, Task } from "./parse.ts";

/** the `[targets: …]` tail a task cell ends with, which names files rather than work */
const TARGETS = /\s*\[targets:\s*([^\]]*)\]\s*$/u;

/**
 * reads what a task is, without the files it names
 * @param task the task
 * @returns its description, the targets tail removed
 */
export function summaryOf(task: Task): string {
  return task.task.replace(TARGETS, "");
}

/**
 * says what is holding a task in the Blocked lane
 * @param task the task
 * @returns the reason, or empty where nothing holds it there
 */
export function blockedReason(task: Task): string {
  if (isBlocked(task)) return task.unblock || "no unblock: action recorded";

  return disagrees(task) ? `marked ${task.mark} but its status says ${task.status}` : "";
}

/**
 * names a task's lane together with whatever holds it there
 * @param task the task
 * @returns the lane, then the reason where there is one
 */
function laneWithReason(task: Task): string {
  const reason = blockedReason(task);

  return reason ? `${laneLabel(task)}: ${reason}` : laneLabel(task);
}

/**
 * builds what opening a task card shows: every column its row holds
 *
 * the lane leads, because a card drawn in Blocked whose status says something
 * else is the one a reader opens to find out why
 * @param task the task
 * @returns the modal's title and facts
 */
export function taskDetail(task: Task): DetailedCard["detail"] {
  return {
    title: `${task.id}: ${summaryOf(task)}`,
    facts: [
      ...factsOf([
        // a blocked row's unblock action has its own fact below, so only a
        // disagreement needs saying here
        ["Lane", disagrees(task) ? `${laneLabel(task)}: ${blockedReason(task)}` : laneLabel(task)],
        ["Status", task.status || "unrecorded"],
        ["Targets", TARGETS.exec(task.task)?.[1]?.trim() ?? ""],
      ]),
      ...taskFacts(task),
    ],
  };
}

/**
 * counts a stream's drawable tasks by lane, done first
 * @param tasks the stream's drawable tasks
 * @returns the tally as a sentence, or empty where there are none
 */
function tally(tasks: Task[]): string {
  if (!tasks.length) return "";
  const open = TASK_LANES.filter(([status]) => status !== "done")
    .map(([status, label]) => [tasks.filter((task) => laneOf(task) === status).length, label] as const)
    .filter(([count]) => count)
    .map(([count, label]) => `${count} ${label.toLowerCase()}`);
  const unknown = tasks.filter((task) => laneOf(task) === "").length;
  if (unknown) open.push(`${unknown} with no recorded status`);
  const done = `${tasks.filter((task) => laneOf(task) === "done").length} of ${tasks.length} done`;

  return open.length ? `${done}: ${open.join(", ")}` : done;
}

/**
 * builds what opening a stream card shows: its record, then what it still owes
 *
 * each unfinished task is a fact named by its id, so the modal answers "what
 * is left here" without the reader switching to that stream's own board
 * @param stream the stream
 * @returns the modal's title and facts
 */
export function streamDetail(stream: Stream): DetailedCard["detail"] {
  const tasks = drawable(stream);
  const owed: LedgerFact[] = tasks
    .filter((task) => laneOf(task) !== "done")
    .map((task) => ({
      label: task.id,
      value: [summaryOf(task), { kind: "dim", text: ` · ${laneWithReason(task)}` }],
    }));

  return {
    title: stream.id,
    facts: [
      ...streamFacts(stream),
      ...factsOf([
        ["Blocked on", stream.blockedOn],
        ["Tasks", tally(tasks)],
      ]),
      ...owed,
    ],
  };
}
