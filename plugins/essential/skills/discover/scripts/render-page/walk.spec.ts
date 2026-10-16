import { describe, expect, it } from "vitest";

import { usesBlock, walkBlocks } from "./walk.ts";

import type { Block, PageData } from "./types.ts";

/** a block that holds nothing, so only the walk's own descent is under test. */
const LEAF = { type: "prose", text: "x" } as const;

describe("fn:walkBlocks", () => {
  it("should descend a disclosure at its own blocks path", () => {
    const walked = walkBlocks(
      [{ type: "disclosure", summary: "s", blocks: [LEAF] }],
      "blocks",
    );

    expect(walked.map(({ path }) => path)).toStrictEqual([
      "blocks[0]",
      "blocks[0].blocks[0]",
    ]);
  });

  it("should descend every item of a variants block, in the order it draws them", () => {
    const walked = walkBlocks(
      [
        {
          type: "variants",
          items: [
            { label: "A", blocks: [LEAF, LEAF] },
            { label: "B", blocks: [LEAF] },
          ],
        },
        LEAF,
      ],
      "blocks",
    );

    // outermost first and item by item, which is the document's order too
    expect(walked.map(({ path }) => path)).toStrictEqual([
      "blocks[0]",
      "blocks[0].items[0].blocks[0]",
      "blocks[0].items[0].blocks[1]",
      "blocks[0].items[1].blocks[0]",
      "blocks[1]",
    ]);
  });

  it("should find a variants block held by a disclosure and a container held by a variant", () => {
    const walked = walkBlocks(
      [
        {
          type: "disclosure",
          summary: "s",
          blocks: [
            {
              type: "variants",
              items: [
                { label: "A", blocks: [{ type: "disclosure", summary: "t", blocks: [LEAF] }] },
                { label: "B", blocks: [LEAF] },
              ],
            },
          ],
        },
      ],
      "blocks",
    );

    expect(walked.map(({ path }) => path)).toContain(
      "blocks[0].blocks[0].items[0].blocks[0].blocks[0]",
    );
  });

  it("should not read the items of any other block as blocks", () => {
    // `items` names rows in a metrics block and entries in a list; only a
    // variants block's items hold blocks
    const walked = walkBlocks(
      [{ type: "list", items: [{ type: "prose", text: "a row" }] } as unknown as Block],
      "blocks",
    );

    expect(walked).toHaveLength(1);
  });

  it.each([
    ["items that are not a list", { type: "variants", items: "no" }],
    ["an item that is not an object", { type: "variants", items: [null, 3] }],
    ["an item whose blocks are not a list", { type: "variants", items: [{ blocks: "no" }] }],
  ])("should walk past %s rather than crash before the refusal that names it", (_, block) => {
    expect(() => walkBlocks([block as unknown as Block], "blocks")).not.toThrow();
    expect(walkBlocks([block as unknown as Block], "blocks")).toHaveLength(1);
  });
});

describe("fn:usesBlock", () => {
  it("should see a block type held inside a variant", () => {
    const data = {
      sections: [
        {
          blocks: [
            {
              type: "variants",
              items: [
                { label: "A", blocks: [LEAF] },
                { label: "B", blocks: [{ type: "ledger", groups: [] }] },
              ],
            },
          ],
        },
      ],
    } as unknown as PageData;

    expect(usesBlock(data, "ledger")).toBe(true);
    expect(usesBlock(data, "variants")).toBe(true);
    expect(usesBlock(data, "quiz")).toBe(false);
  });
});
