import { describe, expect, it } from "vitest";

import { stateBoard } from "./board.ts";
import { renderPage } from "../page.ts";

import type { Stream, Task } from "./parse.ts";
import type { Tree } from "./read.ts";
import type { Block, PageData, Section } from "../types.ts";

/** one finished task, which is what most rows in a real tree are. */
const DONE: Task = {
  id: "AAA01",
  mark: "✓",
  status: "done",
  task: "Write the parser",
  owner: "Ada",
  depends: "—",
  required: "yes",
  acceptance: "the table reads back",
  evidence: "parse.spec.ts, 24 cases",
  unblock: "",
};

/** the stream every case below starts from. */
const STREAM: Stream = {
  id: "alpha",
  claimed: "",
  phase: "working",
  phaseKey: "Phase",
  updated: "2026-08-29T09:00:00Z",
  owner: "Ada",
  next: "finish the parser",
  tasks: [DONE],
  malformed: 0,
};

/**
 * builds a board out of the streams a case cares about
 * @param streams the streams on the board
 * @param excluded the streams it set aside
 * @param project the project the tree was read from
 * @returns the page data
 */
function board(
  streams: Partial<Stream>[] = [{}],
  excluded: Tree["excluded"] = [],
  project = "sample",
): PageData {
  return stateBoard(
    {
      project,
      streams: streams.map((stream) => ({ ...STREAM, ...stream })),
      excluded,
    },
    "2026-08-29 12:00Z",
  );
}

/**
 * finds one section of a board
 * @param data the page data
 * @param id the section's id
 * @returns the section
 */
function sectionOf(data: PageData, id: string): Section {
  return data.sections.find((section) => section.id === id)!;
}

/**
 * finds the blocks of one type in a section
 * @param data the page data
 * @param id the section's id
 * @param type the block type
 * @returns every matching block
 */
function blocksOf(data: PageData, id: string, type: string): Block[] {
  return sectionOf(data, id).blocks.filter((block) => block.type === type);
}

describe("fn:stateBoard", () => {
  it("should render as an ordinary board, knowing nothing about where it came from", () => {
    const html = renderPage(board(), { css: "", boot: "", runtime: "" });

    expect(html).toMatch(/^<!doctype html>/u);
    expect(html).toContain('data-kind="project-state"');
  });

  it("should tell two boards apart by the projects they were read from", () => {
    // the id is what the runtime saves a reader's notes under, so one id for
    // every tree this mode is pointed at is one set of notes for all of them:
    // the annotations written against one project's blockers would come back
    // on another's. It is also what a run lists a board by, so two of them
    // under one id is a run refused for a duplicate no author ever wrote
    expect(board([{}], [], "alpha").id).toBe("project-state-alpha");
    expect(board([{}], [], "beta").id).toBe("project-state-beta");
  });

  it("should still name itself where the tree names no project", () => {
    // a tree directly beneath the filesystem root has no directory to be
    // named after, and there is only ever one of those to collide with
    expect(board([{}], [], "").id).toBe("project-state");
  });

  it("should ask nothing, so its drawer offers no reply to send", () => {
    expect(board().reply).toBeUndefined();
  });

  it("should put what is stuck first, with the action that would unstick it", () => {
    const stuck = {
      ...DONE,
      id: "BBB01",
      mark: "!",
      status: "blocked",
      task: "Ship it",
      unblock: "get the signing key",
    };
    const data = board([{ tasks: [DONE, stuck] }]);

    expect(data.sections[0]!.id).toBe("blocked");
    expect(data.sections[0]!.title).toBe("1 task cannot move");
    expect(JSON.stringify(blocksOf(data, "blocked", "table"))).toContain(
      "get the signing key",
    );
  });

  it("should read a blocked mark and a blocked status as the same thing", () => {
    // the two disagree in a real tree: a row marked stuck whose status still
    // says working is exactly the row this board exists to surface
    const marked = { ...DONE, id: "B1", mark: "!", status: "working" };
    const stated = { ...DONE, id: "B2", mark: "⧗", status: "blocked" };

    expect(board([{ tasks: [marked, stated] }]).sections[0]!.title).toBe(
      "2 tasks cannot move",
    );
  });

  it("should say so where a blocked row carries no way out of it", () => {
    const stuck = { ...DONE, mark: "!", status: "blocked", unblock: "" };

    expect(JSON.stringify(blocksOf(board([{ tasks: [stuck] }]), "blocked", "table"))).toContain(
      "no unblock: action recorded",
    );
  });

  it("should say plainly that nothing is stuck rather than drawing an empty table", () => {
    const data = board();

    expect(data.sections[0]!.title).toBe("Nothing is blocked");
    expect(blocksOf(data, "blocked", "table")).toStrictEqual([]);
    expect(blocksOf(data, "blocked", "callout")[0]).toMatchObject({
      tone: "good",
    });
  });

  it("should draw one group per stream, holding only what it still owes", () => {
    const open = { ...DONE, id: "AAA02", mark: "⧗", status: "working" };
    const drawn = JSON.stringify(
      blocksOf(board([{ tasks: [DONE, open] }]), "owed", "ledger"),
    );

    expect(drawn).toContain("AAA02");
    expect(drawn).not.toContain("AAA01");
  });

  it("should count every task in a group's bar, not only the ones it draws", () => {
    // the rows and the ratio disagree on purpose: a stream of ninety done rows
    // and one working row would hide the working row, and the reader still has
    // to be able to see that the ninety exist
    const open = { ...DONE, id: "AAA02", mark: "⧗", status: "working" };
    const [ledger] = blocksOf(board([{ tasks: [DONE, open] }]), "owed", "ledger");

    expect(ledger).toMatchObject({
      groups: [{ label: "alpha", progress: { done: 1, of: 2 } }],
    });
  });

  it("should carry every column of a task row into the row it opens", () => {
    // the whole point of the block: a card showed the id, the summary and the
    // status, and a reader who wanted the acceptance criterion or the blocking
    // dependency had to leave the board and go and read the state file
    const stuck = {
      ...DONE,
      id: "AAA02",
      mark: "!",
      status: "blocked",
      depends: "AAA01",
      acceptance: "the key signs",
      evidence: "tried twice; unblock: get the signing key",
      unblock: "get the signing key",
    };
    const drawn = JSON.stringify(
      blocksOf(board([{ tasks: [stuck] }]), "owed", "ledger"),
    );

    for (const carried of [
      "AAA01",
      "the key signs",
      "tried twice",
      "get the signing key",
    ])
      expect(drawn, carried).toContain(carried);
  });

  it("should say a finished stream is finished rather than drawing an empty group", () => {
    expect(JSON.stringify(blocksOf(board(), "owed", "ledger"))).toContain(
      "every recorded task is done",
    );
  });

  it("should tell a stream with nothing left from one it could not read", () => {
    // the two look identical from outside — no rows — and mean opposite things
    const [ledger] = blocksOf(board([{ tasks: [] }]), "owed", "ledger");

    expect(ledger).toMatchObject({
      groups: [{ empty: "no task table could be read here" }],
    });
  });

  it("should measure only the streams that have something to measure", () => {
    // a meter drawn out of an empty table reads as no progress rather than as
    // no record, and the meter block refuses a total of zero anyway
    const data = board([{ id: "alpha" }, { id: "beta", tasks: [] }]);
    const [meters] = blocksOf(data, "progress", "readiness");

    expect(meters).toMatchObject({
      items: [{ label: "alpha", value: 1, of: 1, note: "working" }],
    });
  });

  it("should not draw a stream whose table it could not read as finished", () => {
    // `every` is true over nothing, so a stream with no readable tasks used to
    // sit on the rail as finished work while the same board tagged it working
    const data = board([
      { id: "unmeasured", tasks: [] },
      { id: "finished", tasks: [DONE] },
    ]);
    const [rail] = blocksOf(data, "recent", "timeline");

    expect(
      (rail as { items: { state: string }[] }).items.map(({ state }) => state),
    ).toStrictEqual(["pending", "done"]);
  });

  it("should order the rail by when each stream was last written to", () => {
    const data = board([
      { id: "older", updated: "2026-08-01T00:00:00Z" },
      { id: "newer", updated: "2026-08-28T00:00:00Z" },
    ]);
    const [rail] = blocksOf(data, "recent", "timeline");

    expect(JSON.stringify(rail)).toContain("newer");
    expect((rail as { items: { when: string }[] }).items[0]!.when).toBe(
      "2026-08-28T00:00:00Z",
    );
  });

  it("should name both spellings of the phase key when the tree uses both", () => {
    const data = board([
      { id: "alpha", phaseKey: "Phase" },
      { id: "beta", phaseKey: "Lifecycle status" },
    ]);
    const said = JSON.stringify(blocksOf(data, "reading", "callout"));

    expect(said).toContain("Phase: alpha");
    expect(said).toContain("Lifecycle status: beta");
  });

  it("should say nothing about spellings when the tree only uses one", () => {
    expect(JSON.stringify(blocksOf(board(), "reading", "callout"))).not.toContain(
      "spelled more than one way",
    );
  });

  it("should read a task status however the file capitalised it", () => {
    // the row an operations board exists to surface is the blocked one, and
    // `Blocked` typed with a capital read as ordinary work
    const shouty = board([
      {
        tasks: [
          { ...DONE, id: "AAA02", mark: "-", status: "Blocked", unblock: "ask Ada" },
        ],
      },
    ]);

    expect(JSON.stringify(blocksOf(shouty, "blocked", "table"))).toContain(
      "AAA02",
    );
    expect(
      JSON.stringify(blocksOf(board([{ tasks: [{ ...DONE, status: "Done" }] }]), "recent", "timeline"),
      ),
    ).toContain('"done"');
  });

  it("should name a file that records a work id other than its own", () => {
    const said = JSON.stringify(
      blocksOf(
        board([{ id: "alpha", claimed: "beta" }]),
        "reading",
        "callout",
      ),
    );

    expect(said).toContain("alpha records beta");
  });

  it("should say nothing about work ids where every file agrees", () => {
    expect(
      JSON.stringify(blocksOf(board(), "reading", "callout")),
    ).not.toContain("work id that is not its own");
  });

  it("should report the rows it could not read, rather than quietly dropping them", () => {
    const said = JSON.stringify(
      blocksOf(board([{ malformed: 2 }]), "reading", "callout"),
    );

    expect(said).toContain("2 rows");
    expect(said).toContain("could not be read");
  });

  it("should list every stream it set aside, with the reason it gave", () => {
    const said = JSON.stringify(
      blocksOf(
        board([{}], [{ id: "long-done", reason: "completed and stale" }]),
        "reading",
        "callout",
      ),
    );

    expect(said).toContain("long-done: completed and stale");
  });

  it("should draw a next action as an opening rather than as a fixed count", () => {
    // the two places a next action is drawn cut it in opposite directions and
    // neither could be read: the owner chip took 80 characters, so three of
    // seven chips stopped inside a word, and the rail took all of it, so its
    // longest entry ran to 1,307 characters beside a median of 110
    const next = `Human review and merge draft PR #94. ${"Then more prose. ".repeat(40)}`;
    const data = board([{ next }]);
    const said = JSON.stringify([
      ...blocksOf(data, "progress", "owners"),
      ...blocksOf(data, "recent", "timeline"),
    ]);

    expect(said).toContain("Human review and merge draft PR #94.");
    expect(said).not.toContain("Then more prose.");
    expect(said).toContain("…");
  });

  it("should draw a state file's markup as meaning, not as punctuation", () => {
    // there is no markup pass-through anywhere in this format, so a paragraph
    // handed over verbatim arrived as literal asterisks and backticks: the
    // board drew "**Batch 2 is delivered.**" exactly as the file writes it
    const data = board([{ next: "Mark `completed` once **merged**." }]);
    const said = JSON.stringify([
      ...blocksOf(data, "progress", "owners"),
      ...blocksOf(data, "recent", "timeline"),
    ]);

    expect(said).not.toContain("**");
    expect(said).not.toContain("`");
    expect(said).toContain('{"kind":"code","text":"completed"}');
    expect(said).toContain('{"kind":"mark","text":"merged"}');
  });

  it("should count the whole tree in the masthead", () => {
    const open = { ...DONE, id: "AAA02", mark: "⧗", status: "working" };
    const stuck = { ...DONE, id: "AAA03", mark: "!", status: "blocked" };

    expect(board([{ tasks: [DONE, open, stuck] }]).masthead.meta).toStrictEqual([
      { label: "Live streams", value: "1" },
      { label: "Open tasks", value: "2" },
      { label: "Blocked", value: "1" },
      { label: "Read at", value: "2026-08-29 12:00Z" },
    ]);
  });
});
