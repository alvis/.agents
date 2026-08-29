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
  unblock: "",
};

/** the stream every case below starts from. */
const STREAM: Stream = {
  id: "alpha",
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
 * @returns the page data
 */
function board(
  streams: Partial<Stream>[] = [{}],
  excluded: Tree["excluded"] = [],
): PageData {
  return stateBoard(
    {
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

  it("should draw one lane per stream, holding only what it still owes", () => {
    const open = { ...DONE, id: "AAA02", mark: "⧗", status: "working" };
    const lanes = JSON.stringify(
      blocksOf(board([{ tasks: [DONE, open] }]), "lanes", "kanban"),
    );

    expect(lanes).toContain("AAA02");
    expect(lanes).not.toContain("AAA01");
  });

  it("should say a finished stream is finished rather than drawing an empty lane", () => {
    expect(JSON.stringify(blocksOf(board(), "lanes", "kanban"))).toContain(
      "every recorded task is done",
    );
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
