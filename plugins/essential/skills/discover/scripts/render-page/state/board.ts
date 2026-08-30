import { leadRuns, leadText } from "./lead.ts";
import { says } from "./parse.ts";
import { readingSection } from "./reading.ts";

import type { Block, Metric, PageData, Section } from "../types.ts";
import type { Stream, Task } from "./parse.ts";
import type { Tree } from "./read.ts";

/** the table the blocker section draws, when there is anything to draw. */
const BLOCKER_COLUMNS = ["Stream", "Task", "What is stuck", "Owner", "Unblock"];

/**
 * whether a task is stuck.
 *
 * both the mark and the status are read, because the two can disagree — a row
 * marked `!` whose status still says `working` is exactly the row an
 * operations board exists to surface, and reading only one of the two columns
 * would let it pass as ordinary work.
 * @param task the task
 * @returns true where it is blocked
 */
function isBlocked(task: Task): boolean {
  return task.mark === "!" || says(task.status, "blocked");
}

/**
 * whether a task is finished
 * @param task the task
 * @returns true where it is done
 */
function isDone(task: Task): boolean {
  return says(task.status, "done");
}

/**
 * draws what is stuck, first, because it is why this board gets opened
 * @param streams the streams on the board
 * @returns the section
 */
function blockerSection(streams: Stream[]): Section {
  const rows = streams.flatMap((stream) =>
    stream.tasks.filter(isBlocked).map((task) => ({
      cells: [
        { text: [{ kind: "code" as const, text: stream.id }] },
        { text: [{ kind: "code" as const, text: task.id }] },
        { text: task.task, verdict: "bad" as const },
        { text: task.owner || "unassigned" },
        task.unblock
          ? { text: task.unblock }
          : { text: "no unblock: action recorded", verdict: "bad" as const },
      ],
    })),
  );

  return {
    id: "blocked",
    label: "Blocked",
    eyebrow: "First",
    title: rows.length
      ? `${rows.length} task${rows.length === 1 ? "" : "s"} cannot move`
      : "Nothing is blocked",
    blocks: rows.length
      ? [{ type: "table", columns: BLOCKER_COLUMNS, rows }]
      : [
          {
            type: "callout",
            tone: "good",
            title: "No stuck work",
            lead: "Clear",
            text: "No task in any live stream carries a blocked mark or a blocked status. Everything below is either running or waiting on its turn.",
          },
        ],
  };
}

/**
 * draws one lane per workstream, holding only its unfinished tasks.
 *
 * the finished ones are counted in the next section rather than drawn here: a
 * lane of ninety done rows and one working row hides the working row, and the
 * question this section answers is what each stream still owes.
 * @param streams the streams on the board
 * @returns the section
 */
function laneSection(streams: Stream[]): Section {
  const lanes = streams.map((stream) => {
    const open = stream.tasks.filter((task) => !isDone(task));

    return {
      label: stream.id,
      cards: open.length
        ? open.map((task) => [
            { kind: "code" as const, text: task.id },
            ` ${task.task}`,
            { kind: "dim" as const, text: ` — ${task.status}` },
          ])
        : [[{ kind: "dim" as const, text: "every recorded task is done" }]],
    };
  });

  return {
    id: "lanes",
    label: "Streams",
    eyebrow: "Open work",
    title: "What each stream still owes",
    blocks: [{ type: "kanban", lanes }],
  };
}

/**
 * draws how far each stream has run, and who is holding it
 * @param streams the streams on the board
 * @returns the section
 */
function progressSection(streams: Stream[]): Section {
  // a stream with no task table has nothing to measure, and a meter drawn out
  // of nothing would read as no progress rather than as no record
  const measured = streams.filter((stream) => stream.tasks.length > 0);
  const blocks: Block[] = [
    {
      type: "readiness",
      items: measured.map((stream) => ({
        label: stream.id,
        value: stream.tasks.filter(isDone).length,
        of: stream.tasks.length,
        note: stream.phase || "phase unrecorded",
      })),
    },
  ];
  const owned = streams.filter((stream) => stream.owner);
  if (owned.length)
    blocks.push({
      type: "owners",
      people: owned.map((stream) => ({
        name: stream.owner,
        role: stream.id,
        due: leadText(stream.next),
      })),
    });

  return {
    id: "progress",
    label: "Progress",
    eyebrow: "Rolled up",
    title: "How far each stream has run",
    blocks,
  };
}

/**
 * draws the streams in the order they were last written to
 * @param streams the streams on the board
 * @returns the section
 */
function recentSection(streams: Stream[]): Section {
  const ordered = [...streams].sort((one, two) =>
    two.updated.localeCompare(one.updated),
  );

  return {
    id: "recent",
    label: "Recent",
    eyebrow: "By last write",
    title: "What was touched, most recent first",
    blocks: [
      {
        type: "timeline",
        items: ordered.map((stream) => ({
          when: stream.updated || "unrecorded",
          title: [
            { kind: "code" as const, text: stream.id },
            " — ",
            ...(stream.next
              ? leadRuns(stream.next)
              : [{ kind: "dim" as const, text: "no next action recorded" }]),
          ],
          // `every` is true over nothing, so a stream whose task table could
          // not be read was drawn finished here while its own tag said it was
          // working. `progressSection` already refuses to measure a stream it
          // has no tasks for, and this agrees with it
          state:
            stream.tasks.length && stream.tasks.every(isDone)
              ? ("done" as const)
              : stream.tasks.some((task) => says(task.status, "working"))
                ? ("active" as const)
                : ("pending" as const),
          tags: [stream.phase || "phase unrecorded"],
        })),
      },
    ],
  };
}

/**
 * builds a project-state board from a `.state` tree.
 *
 * pure: it is handed what was read and returns the page data, so the renderer
 * never learns that `.state` exists and this can be tested against a tree that
 * was never on a disk.
 * @param tree everything the tree had to say
 * @param at when the board was built, as already-formatted text
 * @returns the page data
 */
export function stateBoard(tree: Tree, at: string): PageData {
  const tasks = tree.streams.flatMap((stream) => stream.tasks);
  const meta: Metric[] = [
    { label: "Live streams", value: `${tree.streams.length}` },
    { label: "Open tasks", value: `${tasks.filter((task) => !isDone(task)).length}` },
    { label: "Blocked", value: `${tasks.filter(isBlocked).length}` },
    { label: "Read at", value: at },
  ];

  return {
    kind: "project-state",
    // the tree the board was read from names it, because the id is also the
    // key its reader's notes are saved under: one constant for every tree
    // this mode is ever pointed at is one set of notes for all of them, and a
    // run holding two state boards is refused for a duplicate no author wrote
    id: tree.project ? `project-state-${tree.project}` : "project-state",
    action: "Read where the work stands",
    title: "Project state",
    masthead: {
      eyebrow: "Operations",
      headline: "Where every live workstream stands right now",
      lede: "One lane per stream, blockers first, and the record's own gaps stated rather than smoothed over. Archived streams are not here because this never looks in the directory they are in.",
      meta,
    },
    sections: [
      blockerSection(tree.streams),
      laneSection(tree.streams),
      progressSection(tree.streams),
      recentSection(tree.streams),
      readingSection(tree),
    ],
  };
}
