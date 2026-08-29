import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { readRun, renderRun } from "./render-page/run.ts";
import { removeDirectory, temporaryDirectory } from "./test-support.ts";

/** the scripts directory, which every path below is relative to. */
const scripts = import.meta.dirname;

/** the example set, which is what the skill ships as its own documentation. */
const RUN = join(scripts, "..", "examples", "data", "run.json");

/** the block dispatcher, read for the list of types it actually handles. */
const DISPATCHER = join(scripts, "render-page", "block.ts");

/** the inline vocabulary, read for the list of run kinds it actually accepts. */
const INLINE = join(scripts, "render-page", "types", "inline.ts");

/**
 * elements whose reference is fetched without the reader doing anything.
 *
 * an `<a href>` is deliberately not here: a link costs nothing until it is
 * followed, and counting it as a network request would forbid a board from
 * citing anything that lives on the web.
 */
const SUBRESOURCE = new Set([
  "audio",
  "embed",
  "iframe",
  "image",
  "img",
  "input",
  "link",
  "object",
  "script",
  "source",
  "track",
  "use",
  "video",
]);

/** every opening tag, so a subresource can be told from a link. */
const TAG = /<([a-z][a-z0-9-]*)\b([^>]*)>/gi;

/** one reference attribute, in any of the three shapes HTML allows. */
const REFERENCE =
  /\s(?:src|href|srcset|data|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/** a reference that names a scheme or a protocol-relative host. */
const REMOTE = /^\s*(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** a reference that resolves without leaving the document. */
const LOCAL = /^\s*(?:data:|mailto:|about:blank|#|$)/i;

/** a stylesheet reaching for another file. */
const CSS_URL = /url\(\s*['"]?\s*((?:https?:|\/\/)[^'")]+)/gi;

/** the packed prototype inside a frame, which is a document of its own. */
const SRCDOC = /srcdoc="([^"]*)"/gi;

/** undoes the escaping a value went through to sit inside an attribute. */
function unescapeHtml(text: string): string {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

/**
 * lists every reference in a document that would cost a network request.
 *
 * the frame's packed document is unescaped and scanned as a document rather
 * than trusted, because that is where a prototype's own stylesheets and
 * scripts end up and it is the one place a missed reference would hide.
 * @param html the rendered document
 * @returns each fetched remote reference, as `<element> value`
 */
function fetchedRemotely(html: string): string[] {
  const found: string[] = [];
  for (const [, element, attributes] of html.matchAll(TAG)) {
    for (const match of attributes!.matchAll(REFERENCE)) {
      const value = unescapeHtml(match[1] ?? match[2] ?? match[3] ?? "");
      // an SVG namespace is an identifier the parser reads, never a fetch
      if (element!.toLowerCase() === "svg") continue;
      if (value.startsWith("http://www.w3.org/")) continue;
      if (LOCAL.test(value) || !REMOTE.test(value)) continue;
      if (SUBRESOURCE.has(element!.toLowerCase()))
        found.push(`<${element}> ${value}`);
    }
  }
  for (const [, url] of html.matchAll(CSS_URL)) found.push(`url() ${url}`);
  for (const [, frame] of html.matchAll(SRCDOC))
    found.push(...fetchedRemotely(unescapeHtml(frame!)));

  return found;
}

/** collects every `type` and `kind` an authored board uses, at any depth. */
function vocabularyOf(node: unknown, into: Record<string, Set<string>>): void {
  if (Array.isArray(node)) {
    for (const value of node) vocabularyOf(value, into);

    return;
  }
  if (!node || typeof node !== "object") return;

  const record = node as Record<string, unknown>;
  for (const [field, bucket] of [
    ["type", "block"],
    ["kind", "run"],
  ] as const)
    if (typeof record[field] === "string") into[bucket]!.add(record[field]);
  for (const value of Object.values(record)) vocabularyOf(value, into);
}

/** renders the whole example set once and returns each board's HTML. */
async function renderExamples(): Promise<Record<string, string>> {
  const out = await temporaryDirectory();
  try {
    const written = await renderRun(RUN, out);
    const boards = await Promise.all(
      written.map(async (file) => [file, await readFile(file, "utf8")] as const),
    );

    return Object.fromEntries(boards);
  } finally {
    await removeDirectory(out);
  }
}

/** reads the vocabulary every board in the set actually uses. */
async function usedVocabulary(): Promise<Record<string, Set<string>>> {
  const into = { block: new Set<string>(), run: new Set<string>() };
  const run = readRun(await readFile(RUN, "utf8"), RUN);
  for (const board of run.boards)
    vocabularyOf(
      JSON.parse(await readFile(join(dirname(RUN), board.data), "utf8")),
      into,
    );

  return into;
}

describe("the example board set", () => {
  it("should render every board the run declares", async () => {
    const boards = await renderExamples();

    expect(Object.keys(boards)).toHaveLength(17);
    for (const [file, html] of Object.entries(boards)) {
      expect(html, file).toMatch(/^<!doctype html>/u);
      expect(html.length, file).toBeGreaterThan(50_000);
    }
  });

  it("should fetch nothing over the network, in any board", async () => {
    const boards = await renderExamples();

    for (const [file, html] of Object.entries(boards))
      expect(fetchedRemotely(html), file).toEqual([]);
  });

  it("should render every block type the dispatcher handles", async () => {
    // read from the dispatcher rather than listed here: a hand-kept list is
    // one somebody forgets to extend, and a block type that reaches no board
    // is exactly the thing this test exists to catch
    const dispatcher = await readFile(DISPATCHER, "utf8");
    const handled = [...dispatcher.matchAll(/case "([a-z-]+)":/gu)].map(
      ([, type]) => type!,
    );
    const { block } = await usedVocabulary();

    expect(handled.length).toBeGreaterThan(30);
    expect(handled.filter((type) => !block!.has(type))).toEqual([]);
  });

  it("should carry a format's sheet only into a board that draws it", async () => {
    // the sheets are appended per board, which is what keeps a board holding
    // no card and no excerpt at exactly the bytes it rendered before either
    // format existed. Named from the data rather than by hand, so a second
    // board authoring the block moves the expectation with it
    const run = readRun(await readFile(RUN, "utf8"), RUN);
    const drawn = new Set<string>();
    for (const board of run.boards) {
      const into = { block: new Set<string>(), run: new Set<string>() };
      vocabularyOf(
        JSON.parse(await readFile(join(dirname(RUN), board.data), "utf8")),
        into,
      );
      if (into.block.has("observations")) drawn.add(basename(board.out));
    }
    const boards = await renderExamples();
    const carrying = Object.entries(boards)
      .filter(([, html]) => html.includes(".observation-tick{"))
      .map(([file]) => basename(file));

    expect(drawn.size).toBeGreaterThan(0);
    expect(carrying.sort()).toEqual([...drawn].sort());
  });

  it("should use every inline run kind the format accepts", async () => {
    const inline = await readFile(INLINE, "utf8");
    const accepted = [...inline.matchAll(/kind: "([a-z]+)"/gu)].map(
      ([, kind]) => kind!,
    );
    const { run } = await usedVocabulary();

    expect(accepted.length).toBeGreaterThan(8);
    expect(accepted.filter((kind) => !run!.has(kind))).toEqual([]);
  });
});
