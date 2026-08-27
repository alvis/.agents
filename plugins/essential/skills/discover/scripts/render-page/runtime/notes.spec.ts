import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { installNotes } from "./notes.ts";
import { emptyState } from "./store.ts";

import type { NoteRequest, NoteResult } from "./note-dialog.ts";
import type { NotesHost } from "./notes.ts";

/** the selection pill, with the layout surface `placePill` reads. */
class StubPill extends StubElement {
  /** the inline style the pill is positioned through */
  readonly style: Record<string, string> = {};
  /** how wide the pill measures */
  offsetWidth = 120;

  /** builds the pill as `createElement("button")` would. */
  constructor() {
    super("button");
  }
}

/** what `window.getSelection()` should report */
let picked: unknown;
/** the deferred selection reads */
let deferred: (() => void)[];
/** the document-level handlers, by event type */
let listening: Record<string, ((event: unknown) => void)[]>;
/** what `window.confirm` should answer */
let confirms: boolean;
/** the whole page */
let page: StubElement;

beforeEach(() => {
  picked = null;
  deferred = [];
  listening = {};
  confirms = true;
  page = new StubElement("body");
  globalThis.Node = class NodeStub {
    static readonly ELEMENT_NODE = 1;
  } as unknown as typeof Node;
  globalThis.document = {
    createElement: (tag: string) =>
      tag === "button" ? new StubPill() : new StubElement(tag),
    body: { append: () => undefined },
    documentElement: { clientWidth: 1440 },
    querySelectorAll: (selector: string) => page.querySelectorAll(selector),
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      (listening[type] ??= []).push(handler);
    },
  } as unknown as Document;
  globalThis.window = {
    getSelection: () => picked,
    setTimeout: (run: () => void) => deferred.push(run),
    confirm: () => confirms,
    scrollX: 0,
    scrollY: 0,
  } as unknown as Window & typeof globalThis;
});

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
  delete (globalThis as { window?: Window }).window;
  delete (globalThis as { Node?: typeof Node }).Node;
});

/** one section, with the controls the feature wires. */
interface Section {
  /** the section element */
  root: StubElement;
  /** a passage a reader can select inside */
  passage: StubElement;
  /** the control that adds a note */
  trigger: StubElement;
  /** the number the control shows */
  tally: StubElement;
  /** the section's own note list */
  list: StubElement;
}

/**
 * builds one section as the renderer emits it
 * @param id the section's id
 * @param label the section's label
 * @returns the section's parts
 */
function section(id: string, label: string): Section {
  const passage = new StubElement("p");
  const tally = new StubElement("span", { "data-note-tally": "" });
  const trigger = new StubElement("button", { "data-note-add": "" }, [tally]);
  const list = new StubElement("ul", { "data-note-list": "" });
  const root = new StubElement(
    "section",
    { "data-section": "", "data-section-id": id, "data-section-label": label },
    [passage, trigger, list],
  );
  page.append(root);

  return { root, passage, trigger, tally, list };
}

/** the wired page, and the handles a test drives it through. */
interface Wired {
  /** the state the feature reads and writes */
  host: NotesHost;
  /** every request the editor was opened with */
  asked: NoteRequest[];
  /** what the editor answers next */
  answer: (result: NoteResult | null) => void;
  /** the drawer list */
  panel: StubElement;
  /** the drawer's count */
  count: StubElement;
  /** the control that drops every note */
  clear: StubElement;
  /** how many times the state was persisted */
  saves: () => number;
}

/**
 * wires the notes feature over whatever sections were built
 * @param state what the reader already holds
 * @returns the host and the handles to drive it
 */
function wire(state = emptyState()): Wired {
  const panel = new StubElement("ul", { "data-note-panel": "" });
  const count = new StubElement("span", { "data-note-count": "" });
  const clear = new StubElement("button", { "data-note-clear": "" });
  const asked: NoteRequest[] = [];
  let saved = 0;
  let next: NoteResult | null = null;

  const host = {
    state,
    save: () => {
      saved += 1;
    },
    ask: (request: NoteRequest) => {
      asked.push(request);

      return Promise.resolve(next);
    },
    panel,
    count,
    clear,
  } as unknown as NotesHost;

  installNotes(host);

  return {
    host,
    asked,
    answer: (result) => {
      next = result;
    },
    panel,
    count,
    clear,
    saves: () => saved,
  };
}

/**
 * reports a selection over a passage, and lets the watcher read it
 * @param text what the reader selected
 * @param inside the passage the selection sits in
 */
function selectPassage(text: string, inside: StubElement): void {
  picked = {
    isCollapsed: false,
    rangeCount: 1,
    toString: () => text,
    getRangeAt: () => ({
      commonAncestorContainer: inside,
      getBoundingClientRect: () => ({ left: 10, bottom: 20 }),
    }),
  };
  settle();
}

/** lets every deferred selection read run, as the zero timer does. */
function settle(): void {
  for (const handler of listening.selectionchange ?? []) handler({});
  for (const run of deferred.splice(0)) run();
}

/**
 * lets the editor's promise resolve and the repaint that follows run
 */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * reads every text an element draws
 * @param held the element to read
 * @returns the texts, in document order
 */
function texts(held: StubElement): string[] {
  return [
    ...(held.textContent ? [held.textContent] : []),
    ...held.children.flatMap(texts),
  ];
}

describe("fn:installNotes", () => {
  it("should report an empty board as holding no notes", () => {
    section("risks", "Risks");

    const { count, clear } = wire();

    expect(count.textContent).toBe("0 notes");
    expect(clear.hidden).toBe(true);
  });

  it("should count one note in the singular", () => {
    section("risks", "Risks");

    const { count } = wire({ ...emptyState(), annotations: { risks: "watch" } });

    expect(count.textContent).toBe("1 note");
  });

  it("should offer to clear only once there is something to clear", () => {
    section("risks", "Risks");

    const { clear } = wire({ ...emptyState(), annotations: { risks: "watch" } });

    expect(clear.hidden).toBe(false);
  });

  it("should tally each section's own notes on its control", () => {
    const risks = section("risks", "Risks");
    const intro = section("intro", "Intro");

    wire({
      ...emptyState(),
      annotations: { risks: "watch" },
      excerpts: { risks: [{ id: "e1", quote: "a passage", note: "why" }] },
    });

    expect(risks.tally.textContent).toBe("2");
    expect(intro.tally.textContent).toBe("");
  });

  it("should draw a section's notes in the section itself", () => {
    const risks = section("risks", "Risks");

    wire({ ...emptyState(), annotations: { risks: "watch" } });

    expect(texts(risks.list)).toContain("watch");
  });

  it("should collect every section's notes into the drawer", () => {
    section("risks", "Risks");
    section("intro", "Intro");

    const { panel } = wire({
      ...emptyState(),
      annotations: { risks: "watch", intro: "read" },
    });

    expect(texts(panel)).toContain("watch");
    expect(texts(panel)).toContain("read");
    expect(texts(panel)).toContain("Risks");
  });

  it("should persist whatever the last change left", () => {
    section("risks", "Risks");

    expect(wire().saves()).toBe(1);
  });

  it("should open a whole-section note when nothing is selected", async () => {
    const risks = section("risks", "Risks");
    const { asked, answer, host } = wire();
    answer({ note: "watch", removed: false });

    risks.trigger.dispatch("click");
    await flush();

    expect(asked[0]).toMatchObject({ title: "Note on Risks", quote: null });
    expect(host.state.annotations.risks).toBe("watch");
  });

  it("should change nothing when the reader abandons the editor", async () => {
    const risks = section("risks", "Risks");
    const { host } = wire({ ...emptyState(), annotations: { risks: "watch" } });

    risks.trigger.dispatch("click");
    await flush();

    expect(host.state.annotations.risks).toBe("watch");
  });

  it("should clear a section note the reader removed", async () => {
    // the key goes with the note: an empty annotation left behind is a row
    // the reader can see the shape of but has nothing to press
    const risks = section("risks", "Risks");
    const { answer, host } = wire({ ...emptyState(), annotations: { risks: "watch" } });
    answer({ note: "watch", removed: true });

    risks.trigger.dispatch("click");
    await flush();

    expect(host.state.annotations).toStrictEqual({});
  });

  it("should note the passage the reader selected in that section", async () => {
    const risks = section("risks", "Risks");
    const { asked, answer, host } = wire();
    answer({ note: "why", removed: false });
    selectPassage("a passage", risks.passage);

    risks.trigger.dispatch("click");
    await flush();

    expect(asked[0]).toMatchObject({ quote: "a passage" });
    expect(host.state.excerpts.risks).toHaveLength(1);
  });

  it("should hold the selection against the press that collapses it", () => {
    // preventDefault on mousedown is what keeps a pointer selection alive long
    // enough for the click to read it
    const risks = section("risks", "Risks");
    wire();
    let prevented = false;

    risks.trigger.dispatch("mousedown", { preventDefault: () => (prevented = true) });

    expect(prevented).toBe(true);
  });

  it("should use the quote armed at pointerdown when the selection is already gone", async () => {
    // on touch the collapse can have happened by the time the press lands, so
    // the control would open a whole-section note over the passage the reader
    // had selected
    const risks = section("risks", "Risks");
    const { asked, answer } = wire();
    answer({ note: "why", removed: false });
    selectPassage("a passage", risks.passage);

    risks.trigger.dispatch("pointerdown");
    picked = null;
    settle();
    risks.trigger.dispatch("click");
    await flush();

    expect(asked[0]).toMatchObject({ quote: "a passage" });
  });

  it.each(["pointerleave", "pointercancel"])(
    "should drop the armed quote when the press %ss the control",
    async (name) => {
      // a press that leaves the button never becomes a click, and the quote it
      // armed must not survive to be used by a later one
      const risks = section("risks", "Risks");
      const { asked, answer } = wire();
      answer({ note: "watch", removed: false });
      selectPassage("a passage", risks.passage);

      risks.trigger.dispatch("pointerdown");
      risks.trigger.dispatch(name);
      picked = null;
      settle();
      risks.trigger.dispatch("click");
      await flush();

      expect(asked[0]).toMatchObject({ quote: null });
    },
  );

  it("should ignore a passage selected in another section", async () => {
    const risks = section("risks", "Risks");
    const intro = section("intro", "Intro");
    const { asked, answer } = wire();
    answer({ note: "watch", removed: false });
    selectPassage("a passage", risks.passage);

    intro.trigger.dispatch("pointerdown");
    intro.trigger.dispatch("click");
    await flush();

    expect(asked[0]).toMatchObject({ title: "Note on Intro", quote: null });
  });

  it("should edit the note a drawer row names", async () => {
    section("risks", "Risks");
    const { panel, asked, answer } = wire({
      ...emptyState(),
      excerpts: { risks: [{ id: "e1", quote: "a passage", note: "why" }] },
    });
    answer({ note: "revised", removed: false });
    const edit = panel.querySelector("[data-note-edit]")!;

    panel.dispatch("click", { target: edit });
    await flush();

    expect(asked[0]).toMatchObject({ note: "why", removable: true });
  });

  it("should remove just the excerpt a row names", async () => {
    section("risks", "Risks");
    const { panel, host } = wire({
      ...emptyState(),
      annotations: { risks: "watch" },
      excerpts: { risks: [{ id: "e1", quote: "a passage", note: "why" }] },
    });
    const drop = panel.querySelectorAll("[data-note-drop]")[1]!;

    panel.dispatch("click", { target: drop });
    await flush();

    expect(host.state.excerpts.risks).toBeUndefined();
    expect(host.state.annotations.risks).toBe("watch");
  });

  it("should clear the section note a whole-section row names", async () => {
    section("risks", "Risks");
    const { panel, host } = wire({ ...emptyState(), annotations: { risks: "watch" } });
    const drop = panel.querySelector("[data-note-drop]")!;

    panel.dispatch("click", { target: drop });
    await flush();

    expect(host.state.annotations).toStrictEqual({});
  });

  it("should ignore a press on the list that hit no control", () => {
    section("risks", "Risks");
    const { panel, host } = wire({ ...emptyState(), annotations: { risks: "watch" } });

    panel.dispatch("click", { target: panel });

    expect(host.state.annotations.risks).toBe("watch");
  });

  it("should ask before dropping every note", () => {
    // destructive and not undoable
    section("risks", "Risks");
    const { clear, host } = wire({ ...emptyState(), annotations: { risks: "watch" } });
    confirms = false;

    clear.dispatch("click");

    expect(host.state.annotations.risks).toBe("watch");
  });

  it("should drop every note once the reader confirms", () => {
    section("risks", "Risks");
    const { clear, count, host } = wire({
      ...emptyState(),
      annotations: { risks: "watch" },
      excerpts: { risks: [{ id: "e1", quote: "a passage", note: "why" }] },
    });

    clear.dispatch("click");

    expect(host.state.annotations).toStrictEqual({});
    expect(host.state.excerpts).toStrictEqual({});
    expect(count.textContent).toBe("0 notes");
  });
});
