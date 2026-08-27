import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  fixture,
  removeDirectory,
  temporaryDirectory,
} from "../test-support.ts";
import { RenderError } from "./error.ts";
import { readRun, renderRun } from "./run.ts";

/**
 * builds the smallest renderable board
 * @param id the board's id
 * @param kind the board's kind
 * @returns the board as JSON text
 */
function board(id: string, kind = "specimen-board"): string {
  return JSON.stringify({
    kind,
    id,
    action: "Review",
    title: id,
    masthead: { eyebrow: "e", headline: "h", lede: "l" },
    sections: [
      {
        id: "one",
        label: "One",
        title: "One",
        blocks: [{ type: "prose", text: "A sentence." }],
      },
    ],
    reply: { heading: "Reply", template: "{{summary}}" },
  });
}

/** a two-board run, as its file declares it. */
const RUN = JSON.stringify({
  label: "Conflux discovery",
  boards: [
    {
      id: "first",
      label: "First board",
      data: "first.json",
      out: "first.html",
      blurb: "Where the run starts.",
    },
    { id: "hub", label: "Board hub", data: "hub.json", out: "hub.html" },
  ],
});

describe("fn:readRun", () => {
  it("should derive each board's href from the file it writes", () => {
    const run = readRun(RUN, "run.json");

    expect(run.boards.map(({ href }) => href)).toEqual([
      "./first.html",
      "./hub.html",
    ]);
  });

  it("should refuse an output that is not a plain file name", () => {
    const run = JSON.parse(RUN) as { boards: { out: string }[] };
    run.boards[1].out = "nested/hub.html";

    expect(() => readRun(JSON.stringify(run), "run.json")).toThrow(
      /run\.boards\[1\]\.out/u,
    );
  });

  it("should refuse two boards writing one file", () => {
    const run = JSON.parse(RUN) as { boards: { out: string }[] };
    run.boards[1].out = "first.html";

    expect(() => readRun(JSON.stringify(run), "run.json")).toThrow(
      /two boards write "first\.html"/u,
    );
  });

  it("should refuse a run file that is not JSON, naming the file", () => {
    expect(() => readRun("{", "run.json")).toThrow(
      /run\.json is not valid JSON/u,
    );
  });

  it("should refuse a run with no boards at all", () => {
    expect(() =>
      readRun(JSON.stringify({ label: "Empty", boards: [] }), "run.json"),
    ).toThrow(RenderError);
  });
});

describe("fn:renderRun", () => {
  it("should give every board the same set, each marking itself", async () => {
    const root = await temporaryDirectory();
    try {
      const run = await fixture(root, "run.json", RUN);
      await fixture(root, "first.json", board("first"));
      await fixture(root, "hub.json", board("hub", "board-hub"));
      const out = join(root, "out");

      const written = await renderRun(run, out);
      const [first, hub] = await Promise.all(
        written.map(async (path) => readFile(path, "utf8")),
      );

      expect(written).toEqual([join(out, "first.html"), join(out, "hub.html")]);
      for (const html of [first, hub]) {
        expect(html).toContain('data-board-link="first"');
        expect(html).toContain('data-board-link="hub"');
        // counted on the links themselves: the stylesheet the page carries
        // also names the attribute, and matching the bare attribute counts
        // the CSS rules too
        expect(
          html.match(/data-board-link="[^"]+" href="[^"]+" aria-current="page"/gu),
        ).toHaveLength(1);
      }
      expect(first).toMatch(/data-board-link="first"[^>]*aria-current="page"/u);
      expect(hub).toMatch(/data-board-link="hub"[^>]*aria-current="page"/u);
    } finally {
      await removeDirectory(root);
    }
  });

  it("should refuse a board whose own id the run does not list", async () => {
    const root = await temporaryDirectory();
    try {
      const run = await fixture(root, "run.json", RUN);
      // the run calls it `first`; the board calls itself something else, so
      // neither entry can be marked current
      await fixture(root, "first.json", board("renamed"));
      await fixture(root, "hub.json", board("hub", "board-hub"));

      await expect(renderRun(run, join(root, "out"))).rejects.toThrow(
        /does not list the board being rendered/u,
      );
    } finally {
      await removeDirectory(root);
    }
  });

  it("should report a run file it cannot read by path", async () => {
    await expect(renderRun("/nowhere/run.json", "/tmp/out")).rejects.toThrow(
      /cannot read run file/u,
    );
  });
});
