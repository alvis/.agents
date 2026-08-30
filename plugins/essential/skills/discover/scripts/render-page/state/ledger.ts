import { leadRuns } from "./lead.ts";
import { isBlocked, isDone, says } from "./parse.ts";

import type { LedgerEntry, LedgerFact, LedgerGroup, Section } from "../types.ts";
import type { Stream, Task } from "./parse.ts";

/**
 * collects the facts a record actually has.
 *
 * a field the file left empty is dropped rather than drawn as a blank, because
 * a detail pane of eight labels and two values reads as a record that lost its
 * contents; the absent labels say the same thing by not being there.
 * @param pairs each label against what the record wrote under it
 * @returns the facts worth drawing
 */
function factsOf(pairs: [string, string][]): LedgerFact[] {
  return pairs
    .filter(([, value]) => value.trim())
    .map(([label, value]) => ({ label, value }));
}

/**
 * turns one task row into a row that opens for the whole of its record.
 *
 * the tone follows the row's own state and the status word is drawn beside it,
 * so the two carry the same claim in colour and in text; the mark is kept as a
 * fact of its own because it is a second column that can disagree with the
 * first, and the disagreement is the thing worth seeing.
 * @param task the task
 * @returns the row
 */
function taskEntry(task: Task): LedgerEntry {
  const stuck = isBlocked(task);

  return {
    code: task.id || "unnumbered",
    title: task.task || "no description recorded",
    status: task.status || "unrecorded",
    tone: stuck
      ? "bad"
      : isDone(task)
        ? "good"
        : says(task.status, "working")
          ? "busy"
          : "neutral",
    facts: factsOf([
      ["Mark", task.mark],
      ["Owner", task.owner || "unassigned"],
      ["Depends on", task.depends],
      ["Required", task.required],
      ["Acceptance", task.acceptance],
      ["Evidence", task.evidence],
      // named separately from the evidence it was written inside, because a
      // blocked row is read for one thing and this is it
      ["Unblock", stuck ? task.unblock || "no unblock: action recorded" : ""],
    ]),
  };
}

/**
 * turns one workstream into a group that opens for its own record.
 *
 * only the unfinished tasks are drawn as rows: a stream of ninety done rows
 * and one working row hides the working row, and what this section answers is
 * what each stream still owes. The finished ones are not lost — the bar counts
 * every task the table held, so the rows and the ratio disagree on purpose.
 * @param stream the stream
 * @returns the group
 */
function streamGroup(stream: Stream): LedgerGroup {
  const open = stream.tasks.filter((task) => !isDone(task));

  return {
    label: stream.id,
    note: stream.next
      ? leadRuns(stream.next)
      : [{ kind: "dim", text: "no next action recorded" }],
    ...(stream.tasks.length
      ? {
          progress: {
            done: stream.tasks.filter(isDone).length,
            of: stream.tasks.length,
          },
        }
      : {}),
    facts: factsOf([
      [
        "Phase",
        stream.phase && stream.phaseKey
          ? `${stream.phase} (from the ${stream.phaseKey} header)`
          : stream.phase,
      ],
      ["Updated", stream.updated],
      ["Next owner", stream.owner],
      ["Next action", stream.next],
      // the file naming itself something other than its directory is a fact
      // about the record, not an instruction: the directory is what this board
      // addresses a stream by, and obeying the claim would let one stream take
      // another's place, or take the name of one the board excludes
      [
        "Claims work id",
        stream.claimed ? `${stream.claimed}, which is not its directory` : "",
      ],
      [
        "Unreadable rows",
        stream.malformed
          ? `${stream.malformed} row${stream.malformed === 1 ? "" : "s"} of its task table could not be read`
          : "",
      ],
    ]),
    entries: open.map(taskEntry),
    empty: stream.tasks.length
      ? "every recorded task is done"
      : "no task table could be read here",
  };
}

/**
 * draws what each stream still owes, one group per stream.
 *
 * a task carries nine columns in the record and a card can show three of them,
 * so a reader who wants the acceptance criterion or the blocking dependency
 * would have to leave the board for the source. Here every field the table
 * held is one disclosure away.
 * @param streams the streams on the board
 * @returns the section
 */
export function ledgerSection(streams: Stream[]): Section {
  return {
    id: "owed",
    label: "Streams",
    eyebrow: "Open work",
    title: "What each stream still owes",
    blocks: [{ type: "ledger", groups: streams.map(streamGroup) }],
  };
}
