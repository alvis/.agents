import { readFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { removeDirectory, temporaryDirectory } from "../../test-support.ts";
import { renderRun } from "../run.ts";

const discover = resolve(import.meta.dirname, "../../..");
const data = join(discover, "examples/data");

/** how a module says a hook must be there: a query it refuses to null-check. */
const HOOK = /querySelector(?:<[^>]*>)?\(\s*"(\[[^"]+\])"\s*\)!/g;

const sources = await Promise.all(
  (await readdir(import.meta.dirname))
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".spec.ts"))
    .map((name) => readFile(join(import.meta.dirname, name), "utf8")),
);

/**
 * every hook the runtime demands rather than tests for.
 *
 * read out of the runtime's own source, and out of all of it rather than the
 * entry module alone: `installDrawer` asserts three hooks of its own, and a
 * board missing one throws on load exactly as a missing `[data-drawer]` does.
 * Reading source is what keeps a hook added to the wiring covered without
 * anyone remembering to list it here.
 */
const HOOKS = [
  ...new Set(
    sources.flatMap((text) => [...text.matchAll(HOOK)].map(([, held]) => held!)),
  ),
];

/**
 * the hooks whose contract belongs to a question rather than to the page.
 *
 * `installVerdicts` reaches for the note inside the decision field the reader
 * just pressed, so a board carrying no decision question carries no note and is
 * right not to. Named here so it gets the contract it does have, below, rather
 * than an exemption from the one it does not.
 */
const SCOPED = ["[data-verdict-note]"];

/** the reply-half hooks the runtime still demands outright, inside its branch */
const DEMANDED = [
  "[data-reply-open]",
  "[data-copy]",
  "[data-copy-status]",
  "[data-reply-dialog]",
];

/**
 * every hook the drawer's reply half is drawn from, present together or absent
 * together.
 *
 * a board can be all reading — the hub is one — and HB2 draws no tally, no
 * reply and nothing to copy there rather than a count that could only ever say
 * zero. Three of these the runtime still demands with a bare `!`, inside the
 * branch it takes only where the page holds a question; the other three it
 * queries and checks. Named here so they get the contract they do have, below,
 * rather than an exemption from the one they do not.
 */
const REPLYING = [
  ...DEMANDED,
  "[data-chip-strip]",
  "[data-unanswered-count]",
  "[data-reply]",
];

/** the hooks every board must carry, whatever it is about. */
const REQUIRED = HOOKS.filter(
  (selector) => !SCOPED.includes(selector) && !REPLYING.includes(selector),
);

// the whole set renders once: every board goes through the path the command
// line uses, the hub included, and a hub has no meaning rendered on its own
const out = await temporaryDirectory();
const written = await renderRun(join(data, "run.json"), out);
const pages = new Map(
  await Promise.all(
    written.map(
      async (path) => [basename(path), await readFile(path, "utf8")] as const,
    ),
  ),
);

afterAll(async () => {
  await removeDirectory(out);
});

const names = [...pages.keys()];

/**
 * the page's authored markup, with every script and stylesheet left out.
 *
 * both carry the selectors verbatim — the runtime is this directory inlined,
 * and the stylesheet paints by the same attributes — so searching the whole
 * document finds each hook in the text that asked for it and never in the
 * element that has to answer it.
 * @param html the rendered document
 * @returns the markup alone
 */
function markupOf(html: string): string {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, "");
}

/**
 * whether markup carries an attribute under exactly this name.
 *
 * whole name, not substring: `data-reply` reads straight through
 * `data-reply-dialog`, so a board holding only the dialog would satisfy a
 * contract asking for the reply itself.
 * @param markup the markup to search
 * @param selector the attribute selector a module asserts on, brackets and all
 * @returns true where the attribute is present under that name
 */
function carries(markup: string, selector: string): boolean {
  return new RegExp(`\\s${selector.slice(1, -1)}(?=[\\s=>/])`).test(markup);
}

/**
 * whether a board asks the reader anything at all
 * @param markup the page's markup
 * @returns true where the page holds at least one question
 */
function asks(markup: string): boolean {
  return carries(markup, "[data-question]");
}

/**
 * every decision question a page holds
 * @param markup the page's markup
 * @returns each field, from its opening tag to its close
 */
function decisions(markup: string): string[] {
  return [
    ...markup.matchAll(
      /<fieldset[^>]*data-question-kind="decision"[\s\S]*?<\/fieldset>/g,
    ),
  ].map(([field]) => field);
}

describe("fn:start hooks", () => {
  it("should have found the hooks it claims to check", () => {
    // the list is read out of source, so a changed call shape would empty it
    // and leave every assertion below passing over nothing
    expect(HOOKS.length).toBeGreaterThan(20);
  });

  it("should hold no scoped hook the runtime stopped asking for", () => {
    // an exemption that outlives its query is an exemption nobody notices
    expect(HOOKS).toEqual(expect.arrayContaining([...SCOPED, ...DEMANDED]));
  });

  it("should check every example board", async () => {
    // a board left out of the run is a board this contract never sees, and the
    // gap would read as a pass
    const held = (await readdir(data)).filter(
      (name) => name.endsWith(".json") && name !== "run.json",
    );

    expect(names).toHaveLength(held.length);
  });

  it.each(names)("should find every hook it demands on %s", (name) => {
    // presence, not placement: that each hook sits where the runtime looks for
    // it is proven by driving a rendered page, which no stub stands in for
    const markup = markupOf(pages.get(name)!);
    const missing = REQUIRED.filter((selector) => !carries(markup, selector));

    expect(missing).toStrictEqual([]);
  });

  it("should have found boards on both sides of the reply contract", () => {
    // each half of the contract below is vacuous on the wrong kind of board,
    // so the set has to hold at least one of each for either to mean anything
    const split = names.map((name) => asks(markupOf(pages.get(name)!)));

    expect(split).toContain(true);
    expect(split).toContain(false);
  });

  it.each(names)("should draw the reply half only where %s asks", (name) => {
    // HB2: the tally, the reply, the copy and the chips are one thing. A board
    // holding some of them is one whose drawer offers a reader a message it
    // cannot fill, or fills one it cannot show
    const markup = markupOf(pages.get(name)!);
    const held = REPLYING.filter((selector) => carries(markup, selector));

    expect(held).toStrictEqual(asks(markup) ? REPLYING : []);
  });

  it("should have found the decision questions its scoped contract is about", () => {
    // no decision question anywhere and the contract below reads as a pass
    expect(
      names.flatMap((name) => decisions(markupOf(pages.get(name)!))),
    ).not.toHaveLength(0);
  });

  it.each(names)("should give every decision question its note on %s", (name) => {
    // `installVerdicts` reveals the note the moment a verdict says "change",
    // asserting it into existence inside the field it just found
    const bare = decisions(markupOf(pages.get(name)!)).filter(
      (field) => !SCOPED.every((selector) => carries(field, selector)),
    );

    expect(bare).toStrictEqual([]);
  });

  it.each(names)("should name the page it saves under on %s", (name) => {
    // the id keys every answer and note; without it a board would read and
    // write another board's saved state
    expect(pages.get(name)).toContain("data-page-id=");
  });
});
