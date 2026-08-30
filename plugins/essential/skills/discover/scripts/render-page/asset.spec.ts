import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readSources, sourcesOf } from "./asset.ts";

import type { PageData } from "./types.ts";

/**
 * builds a board whose one section holds the given blocks
 * @param blocks the blocks to place
 * @returns the board's data
 */
function board(blocks: unknown[]): PageData {
  return { sections: [{ blocks }] } as unknown as PageData;
}

/**
 * makes an empty directory nothing else writes into
 * @returns its path
 */
async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), "asset-test-"));
}

describe("fn:sourcesOf", () => {
  it("should list every src the data names, with the type that reads it", () => {
    expect(
      sourcesOf(board([{ type: "svg", src: "a.svg" }, { type: "image", src: "b.png" }])),
    ).toStrictEqual([
      { src: "a.svg", type: "svg", path: "sections[0].blocks[0]" },
      { src: "b.png", type: "image", path: "sections[0].blocks[1]" },
    ]);
  });

  // one drawing used twice is one read, and one entry in the map the renderer
  // looks it up in
  it("should name a repeated src once", () => {
    expect(
      sourcesOf(board([{ type: "svg", src: "a.svg" }, { type: "svg", src: "a.svg" }])),
    ).toHaveLength(1);
  });

  // the same bytes cannot be both a packed document and an encoded picture,
  // and the map is keyed by src, so this would silently serve one block the
  // other's read
  it("should refuse one file two blocks would read differently", () => {
    expect(() =>
      sourcesOf(board([{ type: "embed", src: "x.html" }, { type: "image", src: "x.html" }])),
    ).toThrow(/read as packed by the embed block .* and as encoded by this image block/);
  });

  // a drawing reused as a captioned picture is the same read either way, so
  // refusing the pair would refuse a board that is perfectly satisfiable
  it("should allow one svg named by both an svg block and an image block", () => {
    expect(
      sourcesOf(board([{ type: "svg", src: "a.svg" }, { type: "image", src: "a.svg" }])),
    ).toHaveLength(1);
  });

  it("should still refuse an svg one block would encode and another inline", () => {
    expect(() =>
      sourcesOf(board([{ type: "svg", src: "a.svg" }, { type: "embed", src: "a.svg" }])),
    ).toThrow(/read as markup by the svg block .* and as packed by this embed block/);
  });

  it("should ignore blocks that name no file", () => {
    expect(sourcesOf(board([{ type: "prose", text: "hello" }]))).toStrictEqual([]);
  });

  it("should survive data too malformed to render", () => {
    expect(sourcesOf({} as PageData)).toStrictEqual([]);
    expect(sourcesOf(board([null]))).toStrictEqual([]);
  });
});

describe("fn:readSources", () => {
  it("should key the contents by the src the author wrote", async () => {
    const base = await scratch();
    await mkdir(join(base, "art"), { recursive: true });
    await writeFile(join(base, "art", "mark.svg"), "<svg></svg>", "utf8");

    expect(await readSources(board([{ type: "svg", src: "art/mark.svg" }]), base)).toStrictEqual({
      "art/mark.svg": "<svg></svg>",
    });
  });

  it("should encode a picture as a data url", async () => {
    const base = await scratch();
    await writeFile(join(base, "shot.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    expect(await readSources(board([{ type: "image", src: "shot.png" }]), base)).toStrictEqual({
      "shot.png": "data:image/png;base64,iVBORw==",
    });
  });

  // smaller than base64 and themeable, which is the whole reason the two are
  // read differently
  it("should inline an image block's svg as markup rather than encoding it", async () => {
    const base = await scratch();
    await writeFile(join(base, "mark.svg"), "<svg>ok</svg>", "utf8");

    expect(await readSources(board([{ type: "image", src: "mark.svg" }]), base)).toStrictEqual({
      "mark.svg": "<svg>ok</svg>",
    });
  });

  it("should refuse a picture whose extension it cannot name a type for", async () => {
    const base = await scratch();
    await writeFile(join(base, "shot.tiff"), "x", "utf8");

    await expect(readSources(board([{ type: "image", src: "shot.tiff" }]), base)).rejects.toThrow(
      /has no extension this can inline/,
    );
  });

  it("should refuse a picture above its budget, saying what it would cost", async () => {
    const base = await scratch();
    await writeFile(join(base, "big.png"), Buffer.alloc(2 * 1024 * 1024 + 1));

    await expect(readSources(board([{ type: "image", src: "big.png" }]), base)).rejects.toThrow(
      /above the 2,097,152-byte budget for a image block; it would add 2,796,204 bytes/,
    );
  });

  it("should pack an embed's document rather than reading it verbatim", async () => {
    const base = await scratch();
    await writeFile(join(base, "style.css"), "b{color:red}", "utf8");
    await writeFile(
      join(base, "app.html"),
      '<html><link rel="stylesheet" href="style.css"><body>hi</body></html>',
      "utf8",
    );
    const files = await readSources(board([{ type: "embed", src: "app.html" }]), base);

    expect(files["app.html"]).toContain("<style>b{color:red}</style>");
    expect(files["app.html"]).not.toContain("href=");
  });

  it("should name both the written path and where it looked", async () => {
    const base = await scratch();

    await expect(readSources(board([{ type: "svg", src: "absent.svg" }]), base)).rejects.toThrow(
      /cannot read "absent.svg" at .*absent\.svg/,
    );
  });

  it("should read nothing for a board that names no files", async () => {
    expect(await readSources(board([{ type: "prose", text: "x" }]), "/base")).toStrictEqual({});
  });
});
