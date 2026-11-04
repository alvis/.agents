import { streamDetail, summaryOf, taskDetail } from "./detail.ts";
import { disagrees, drawable, isLeaf, laneOf, TASK_LANES } from "./lane.ts";
import { leadText } from "./lead.ts";
import { isBlocked, isRetired, says } from "./parse.ts";
import { GRACE_DAYS } from "./read.ts";
import { readingSection } from "./reading.ts";

import type { Block, DetailedCard, Lane, PageData, Run, Section } from "../types.ts";
import type { Stream, Task } from "./parse.ts";
import type { Tree } from "./read.ts";
import type { Scope } from "./scope.ts";

/** the stream lanes, in the order the phase table runs, keyed by phase. */
const STREAM_LANES = [
  ["planned", "Planned"],
  ["working", "Working"],
  ["reviewing", "Reviewing"],
  ["completed", "Completed"],
] as const;

/**
 * builds the Kanban of every live stream, one lane per phase.
 *
 * a blocked stream keeps its phase lane, because where a stream sits and what
 * is stopping it are separate facts; the card says what it waits on instead.
 * @param tree everything the tree had to say
 * @param scope how the board was chosen
 * @param at when the board was built, as already-formatted text
 * @returns the page data
 */
export function streamKanban(tree: Tree, scope: Scope, at: string): PageData {
  const lanes: Lane[] = STREAM_LANES.map(([phase, label]) => ({
    label,
    cards: tree.streams.filter((stream) => says(stream.phase, phase)).map(streamCard),
  }));
  const known = new Set<string>(STREAM_LANES.map(([phase]) => phase));
  const unknown = tree.streams.filter((stream) => !known.has(stream.phase.toLowerCase()));
  if (unknown.length) lanes.push({ label: "Phase unrecorded", cards: unknown.map(streamCard) });
  const open = tree.streams
    .flatMap(drawable)
    .filter((task) => laneOf(task) !== "done").length;

  return {
    kind: "project-state",
    id: tree.project ? `project-status-${tree.project}` : "project-status",
    action: "See where every stream stands",
    title: "Status",
    masthead: {
      eyebrow: "Status",
      headline: "Every live workstream, by phase",
      lede: `${scope.reason} A blocked stream stays in its phase and says what it is waiting on; a completed stream stays for ${GRACE_DAYS} days after its last update.`,
      meta: [
        { label: "Live streams", value: `${tree.streams.length}` },
        { label: "Blocked", value: `${tree.streams.filter((stream) => stream.blockedOn).length}` },
        { label: "Open tasks", value: `${open}` },
        { label: "Read at", value: at },
      ],
    },
    sections: [
      { id: "board", label: "Board", eyebrow: "By phase", title: "Streams", blocks: [{ type: "kanban", lanes }] },
      statusReading(tree),
    ],
  };
}

/**
 * builds the Kanban of one stream's tasks, one lane per status.
 *
 * only leaf tasks are drawn: a parent with subtasks only reports what they
 * report. Retired tasks are left off and counted, because an approved revision
 * closed them without their being work anyone has left to do.
 * @param tree everything the tree had to say
 * @param scope the stream to draw, which `scopeOf` found live
 * @param at when the board was built, as already-formatted text
 * @returns the page data
 */
export function taskKanban(tree: Tree, scope: Scope, at: string): PageData {
  const stream = tree.streams.find((one) => one.id === scope.stream)!;
  const drawn = drawable(stream);
  const retired = stream.tasks.filter((task) => isRetired(task) && isLeaf(task, stream.tasks)).length;
  const lanes: Lane[] = TASK_LANES.map(([status, label]) => ({
    label,
    cards: drawn.filter((task) => laneOf(task) === status).map(taskCard),
  }));
  const unknown = drawn.filter((task) => laneOf(task) === "");
  if (unknown.length) lanes.push({ label: "Status unrecorded", cards: unknown.map(taskCard) });
  const blocks: Block[] = [{ type: "kanban", lanes }];
  if (retired)
    blocks.push({
      type: "callout",
      tone: "neutral",
      title: "Retired tasks are not on the lanes",
      lead: `${retired} retired`,
      text: "Superseded and cancelled tasks were closed by an approved plan revision, so no one has them left to do. Their rows stay in the stream's task table.",
    });

  return {
    kind: "project-state",
    id: tree.project ? `project-status-${tree.project}-${stream.id}` : `project-status-${stream.id}`,
    action: "See where this stream's tasks stand",
    title: `Status: ${stream.id}`,
    masthead: {
      eyebrow: "Status",
      headline: `${stream.id}, task by task`,
      lede: `${scope.reason} A task whose mark and status disagree is drawn as blocked, since that is the cheaper mistake.`,
      meta: [
        { label: "Phase", value: stream.phase || "unrecorded" },
        { label: "Done", value: `${drawn.filter((task) => laneOf(task) === "done").length} of ${drawn.length}` },
        { label: "Blocked on", value: stream.blockedOn || "nothing" },
        { label: "Read at", value: at },
      ],
    },
    sections: [
      { id: "board", label: "Board", eyebrow: "By status", title: "Tasks", blocks },
      statusReading(tree),
    ],
  };
}

/**
 * draws how the tree read, with the leases this board could not read.
 *
 * the lease decided which board this is, so a lease it could not read belongs
 * beside the rest of the record's gaps; the operations board never reads a
 * lease for anything and does not carry the note.
 * @param tree everything the tree had to say
 * @returns the section
 */
function statusReading(tree: Tree): Section {
  const section = readingSection(tree);
  if (!tree.leaseProblems.length) return section;

  return {
    ...section,
    blocks: [
      ...section.blocks,
      {
        type: "callout",
        tone: "bad",
        title: "Some leases could not be read",
        lead: `${tree.leaseProblems.length} unread`,
        text: tree.leaseProblems.map((stream) => `${stream.id}: ${stream.reason}`).join(". "),
      },
    ],
  };
}

/**
 * draws one task as a card: its id, what it is, who holds it, and what frees it
 *
 * the card opens onto every column its row holds, since the face has room for
 * four of them
 * @param task the task
 * @returns the card
 */
function taskCard(task: Task): DetailedCard {
  const runs: Run[] = [{ kind: "code", text: task.id }, " ", summaryOf(task)];
  const owner = ownerOf(task.owner);
  if (owner) runs.push({ kind: "sub", text: owner });
  if (isBlocked(task))
    runs.push({ kind: "mark", text: task.unblock ? `unblock: ${task.unblock}` : "no unblock: action recorded" });
  else if (disagrees(task))
    runs.push({ kind: "mark", text: `marked ${task.mark} but its status says ${task.status}` });

  return { face: runs, detail: taskDetail(task) };
}

/**
 * draws one stream as a card: its id, how far it has got, what it waits on, and what is next
 *
 * the card opens onto the stream's record and the tasks it still owes
 * @param stream the stream
 * @returns the card
 */
function streamCard(stream: Stream): DetailedCard {
  const counted = drawable(stream);
  const runs: Run[] = [
    { kind: "code", text: stream.id },
    " ",
    { kind: "dim", text: `${counted.filter((task) => laneOf(task) === "done").length}/${counted.length} done` },
  ];
  if (stream.blockedOn) runs.push(" ", { kind: "mark", text: `blocked on: ${stream.blockedOn}` });
  runs.push({ kind: "sub", text: stream.next ? `next: ${leadText(stream.next)}` : "no next action recorded" });
  if (stream.owner) runs.push({ kind: "sub", text: `owner: ${stream.owner}` });

  return { face: runs, detail: streamDetail(stream) };
}

/**
 * picks the name a reader knows an owner cell by
 *
 * the canonical cell carries role, agent, and settings in one line; the agent
 * is who to ask, then the role, and a cell in neither shape is shown whole
 * @param owner the owner cell, verbatim
 * @returns the name to print, empty where the cell is
 */
function ownerOf(owner: string): string {
  const agent = /agent:\s*([^;]+)/u.exec(owner)?.[1]?.trim();
  const role = /role:\s*([^;]+)/u.exec(owner)?.[1]?.trim();

  return agent && !agent.startsWith("unavailable") ? agent : (role ?? owner.trim());
}
