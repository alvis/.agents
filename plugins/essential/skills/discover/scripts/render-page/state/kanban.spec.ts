import { describe, expect, it } from "vitest";

import { streamKanban, taskKanban } from "./kanban.ts";
import { renderPage } from "../page.ts";

import type { Stream, Task } from "./parse.ts";
import type { Tree } from "./read.ts";
import type { Block, DetailedCard, LedgerFact, PageData, Rich } from "../types.ts";

/** the read time every board below prints. */
const AT = "2026-08-29 12:00Z";

/** a planned task, which every case adjusts to the row it needs. */
const TASK: Task = {
  id: "AAA",
  mark: "-",
  status: "planned",
  task: "Write the parser [targets: parse.ts]",
  owner: "role: Generalist engineer; agent: Ada; planned: model=x",
  depends: "—",
  required: "yes",
  acceptance: "SC-1",
  evidence: "wait",
  unblock: "",
};

/** the stream every case starts from. */
const STREAM: Stream = {
  id: "alpha",
  claimed: "",
  phase: "working",
  phaseKey: "Phase",
  updated: "2026-08-29T09:00:00Z",
  owner: "Ada",
  next: "finish the parser",
  blockedOn: "",
  tasks: [TASK],
  malformed: 0,
};

/**
 * builds a tree out of the streams a case cares about
 * @param streams the streams, each over the default stream
 * @returns the tree
 */
function tree(streams: Partial<Stream>[] = [{}]): Tree {
  return {
    project: "sample",
    streams: streams.map((stream) => ({ ...STREAM, ...stream })),
    excluded: [],
    leases: [],
    leaseProblems: [],
  };
}

/**
 * builds a task over the default one
 * @param id the task's id
 * @param mark the glyph in its mark column
 * @param status the word in its status column
 * @param evidence its evidence column
 * @returns the task
 */
function task(id: string, mark: string, status: string, evidence = ""): Task {
  return {
    ...TASK,
    id,
    mark,
    status,
    evidence,
    unblock: /unblock:\s*(.+)$/u.exec(evidence)?.[1] ?? "",
  };
}

/**
 * reads a board's kanban as lane labels mapped to the first code run of each card
 * @param data the page data
 * @returns each lane's label and the ids its cards lead with
 */
function lanes(data: PageData): Record<string, string[]> {
  return Object.fromEntries(
    boardOf(data).lanes.map((lane) => [lane.label, lane.cards.map(leadId)]),
  );
}

/**
 * finds a board's kanban
 * @param data the page data
 * @returns its kanban block
 */
function boardOf(data: PageData): Extract<Block, { type: "kanban" }> {
  return data.sections
    .flatMap((section) => section.blocks)
    .find((block): block is Extract<Block, { type: "kanban" }> => block.type === "kanban")!;
}

/**
 * reads what a card shows in its lane
 * @param card the card
 * @returns its face
 */
function faceOf(card: Rich | DetailedCard): Rich {
  return typeof card === "object" && !Array.isArray(card) ? card.face : card;
}

/**
 * finds the identifier a card leads with
 * @param card the card
 * @returns the text of its first code run
 */
function leadId(card: Rich | DetailedCard): string {
  const face = faceOf(card);
  const run = typeof face === "string" ? undefined : face[0];

  return typeof run === "object" && run.kind === "code" ? run.text : "";
}

/**
 * finds the card a board leads with an id
 * @param data the page data
 * @param id the id the card leads with
 * @returns the card
 */
function cardOf(data: PageData, id: string): Rich | DetailedCard {
  return boardOf(data).lanes.flatMap((lane) => lane.cards).find((one) => leadId(one) === id)!;
}

/**
 * reads what opening a card shows, as text
 * @param data the page data
 * @param id the id the card leads with
 * @returns the modal's title and each fact's label against its text
 */
function detailOf(data: PageData, id: string): { title: string; facts: Record<string, string> } {
  const card = cardOf(data, id) as DetailedCard;
  const text = (fact: LedgerFact): string =>
    typeof fact.value === "string"
      ? fact.value
      : fact.value.map((run) => (typeof run === "string" ? run : run.text)).join("");

  return {
    title: card.detail.title,
    facts: Object.fromEntries(card.detail.facts.map((fact) => [fact.label, text(fact)])),
  };
}

/**
 * reads every word a card says
 * @param data the page data
 * @param id the id the card leads with
 * @returns the card's text
 */
function cardText(data: PageData, id: string): string {
  const face = faceOf(cardOf(data, id));

  return typeof face === "string"
    ? face
    : face.map((run) => (typeof run === "string" ? run : run.text)).join("");
}

describe("fn:taskKanban", () => {
  const STREAM_TASKS = [
    task("API", "-", "planned"),
    task("API01", "✓", "done"),
    task("API02", "⧗", "working"),
    task("API03", "⧗", "working"),
    task("MIG", "X", "failed", "attempt: 1; retry: smaller batches"),
    task("DOC", "!", "blocked"),
    task("VAL", "-", "planned"),
    task("OLD", "↪", "superseded"),
    task("CUT", "⊘", "cancelled"),
  ];
  const STREAM_TASKS_BOARD = taskKanban(tree([{ tasks: STREAM_TASKS }]), { stream: "alpha", reason: "named" }, AT);

  it("should place each leaf task in the lane its status names", () => {
    // API is a roll-up of its subtasks, and the retired rows have no lane
    expect(lanes(STREAM_TASKS_BOARD)).toEqual({
      Planned: ["VAL"],
      Working: ["API02", "API03"],
      Blocked: ["DOC"],
      Failed: ["MIG"],
      Done: ["API01"],
    });
  });

  it("should count a task blocked when its mark and status disagree", () => {
    const board = taskKanban(
      tree([{ tasks: [task("AAA", "!", "working"), task("BBB", "⧗", "done"), task("CCC", "✓", "working")] }]),
      { stream: "alpha", reason: "named" },
      AT,
    );

    expect(lanes(board).Blocked).toEqual(["AAA", "BBB", "CCC"]);
  });

  it("should not count a task as done while its mark and status disagree", () => {
    const tasks = [task("AAA", "✓", "done"), task("BBB", "⧗", "done")];
    const board = taskKanban(tree([{ tasks }]), { stream: "alpha", reason: "named" }, AT);
    const streams = streamKanban(tree([{ tasks }]), { stream: "", reason: "no session" }, AT);

    expect(board.masthead.meta).toContainEqual({ label: "Done", value: "1 of 2" });
    expect(cardText(streams, "alpha")).toContain("1/2 done");
    expect(streams.masthead.meta).toContainEqual({ label: "Open tasks", value: "1" });
  });

  it("should name a task's agent, else its role, else the owner cell as written", () => {
    const owned = (owner: string): Task => ({ ...task("AAA", "-", "planned"), owner });
    const board = taskKanban(
      tree([{ tasks: [owned("role: Tester; agent: unavailable (no runtime)"), { ...owned("Kai at payments"), id: "BBB" }] }]),
      { stream: "alpha", reason: "named" },
      AT,
    );

    expect(cardText(board, "AAA")).toContain("Tester");
    expect(cardText(board, "AAA")).not.toContain("unavailable");
    expect(cardText(board, "BBB")).toContain("Kai at payments");
  });

  it("should name a board read from a tree with no project after the stream alone", () => {
    const board = taskKanban({ ...tree(), project: "" }, { stream: "alpha", reason: "named" }, AT);

    expect(board.id).toBe("project-status-alpha");
  });

  it("should say what unblocks a blocked task, or that nothing is recorded", () => {
    const board = taskKanban(
      tree([{ tasks: [task("AAA", "!", "blocked", "unblock: ask payments"), task("BBB", "!", "blocked")] }]),
      { stream: "alpha", reason: "named" },
      AT,
    );

    expect(cardText(board, "AAA")).toContain("ask payments");
    expect(cardText(board, "BBB")).toContain("no unblock: action recorded");
  });

  it("should draw a task whose status it does not know in a lane of its own", () => {
    const board = taskKanban(
      tree([{ tasks: [task("AAA", "?", "paused")] }]),
      { stream: "alpha", reason: "named" },
      AT,
    );

    expect(Object.entries(lanes(board)).find(([, ids]) => ids.includes("AAA"))?.[0]).not.toMatch(
      /^(Planned|Working|Blocked|Failed|Done)$/u,
    );
  });

  it("should count the retired tasks it leaves off the lanes", () => {
    // OLD and CUT are retired leaves; the count is what the note claims
    const callouts = STREAM_TASKS_BOARD.sections
      .find((section) => section.id === "board")!
      .blocks.filter((block) => block.type === "callout");

    expect(callouts).toEqual([expect.objectContaining({ lead: "2 retired" })]);
  });

  it("should open a task card onto every field its row records", () => {
    const board = taskKanban(
      tree([{ tasks: [{ ...task("AAA", "!", "blocked", "unblock: ask payments"), depends: "BBB", acceptance: "SC-2" }] }]),
      { stream: "alpha", reason: "named" },
      AT,
    );

    expect(detailOf(board, "AAA")).toEqual({
      title: "AAA: Write the parser",
      facts: {
        Lane: "Blocked",
        Status: "blocked",
        Mark: "!",
        Owner: "role: Generalist engineer; agent: Ada; planned: model=x",
        Targets: "parse.ts",
        "Depends on": "BBB",
        Required: "yes",
        Acceptance: "SC-2",
        Evidence: "unblock: ask payments",
        Unblock: "ask payments",
      },
    });
  });

  it("should say in a task's detail why a disagreeing row is in Blocked", () => {
    const board = taskKanban(tree([{ tasks: [task("AAA", "⧗", "done")] }]), { stream: "alpha", reason: "named" }, AT);

    expect(detailOf(board, "AAA").facts.Lane).toBe("Blocked: marked ⧗ but its status says done");
  });

  it("should render to a page", () => {
    expect(renderPage(STREAM_TASKS_BOARD, { css: "", boot: "", runtime: "" })).toContain("kanban-card");
  });
});

describe("fn:streamKanban", () => {
  const BOARD = streamKanban(
    tree([
      { id: "alpha", phase: "working" },
      { id: "beta", phase: "reviewing", blockedOn: "reviewer sign-off" },
      { id: "gamma", phase: "completed" },
      { id: "delta", phase: "planned" },
    ]),
    { stream: "", reason: "no session" },
    AT,
  );

  it("should place each stream in the lane its phase names", () => {
    expect(lanes(BOARD)).toEqual({
      Planned: ["delta"],
      Working: ["alpha"],
      Reviewing: ["beta"],
      Completed: ["gamma"],
    });
  });

  it("should keep a blocked stream in its phase lane and say what it waits on", () => {
    expect(cardText(BOARD, "beta")).toContain("done blocked on: reviewer sign-off");
  });

  it("should draw a stream with no recorded phase in a lane of its own", () => {
    const board = streamKanban(tree([{ id: "alpha", phase: "" }]), { stream: "", reason: "no session" }, AT);

    expect(Object.keys(lanes(board))).toHaveLength(5);
  });

  it("should say which lease it could not read", () => {
    const unread = streamKanban(
      { ...tree(), leaseProblems: [{ id: "alpha", reason: "holds a lease.json that is a link" }] },
      { stream: "", reason: "no session" },
      AT,
    );
    const reading = unread.sections.find((section) => section.id === "reading")!;

    expect(reading.blocks.filter((block) => block.type === "callout")).toEqual([
      expect.objectContaining({ lead: "1 unread", text: "alpha: holds a lease.json that is a link" }),
    ]);
  });

  it("should name a board read from a tree with no project after no project", () => {
    const board = streamKanban({ ...tree(), project: "" }, { stream: "", reason: "no session" }, AT);

    expect(board.id).toBe("project-status");
  });

  it("should count the blocked streams in the masthead", () => {
    expect(BOARD.masthead.meta).toContainEqual({ label: "Blocked", value: "1" });
  });

  it("should open a stream card onto its record and the tasks it still owes", () => {
    const board = streamKanban(
      tree([
        {
          blockedOn: "reviewer sign-off",
          tasks: [task("AAA", "✓", "done"), task("BBB", "⧗", "working"), task("CCC", "!", "blocked", "unblock: ask payments")],
        },
      ]),
      { stream: "", reason: "no session" },
      AT,
    );

    expect(detailOf(board, "alpha")).toEqual({
      title: "alpha",
      facts: {
        Phase: "working (from the Phase header)",
        Updated: "2026-08-29T09:00:00Z",
        "Next owner": "Ada",
        "Next action": "finish the parser",
        "Blocked on": "reviewer sign-off",
        Tasks: "1 of 3 done: 1 working, 1 blocked",
        BBB: "Write the parser · Working",
        CCC: "Write the parser · Blocked: ask payments",
      },
    });
  });

  it("should render to a page", () => {
    expect(renderPage(BOARD, { css: "", boot: "", runtime: "" })).toContain("kanban-card");
  });
});
