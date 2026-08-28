import { describe, expect, it } from "vitest";

import { RenderError } from "./error.ts";
import {
  acceptPrismRuntime,
  colourCodeBlocks,
  evaluatePrism,
  flattenTokens,
  highlighterOnce,
  PRISM_CDN_URL,
  PRISM_SHA256,
} from "./prism.ts";

import type { Highlighter } from "./prism.ts";
import type { Block, PageData, TokenSpan } from "./types.ts";

/** a bundle that publishes the one function this build asks a bundle for. */
const TOY = `
var Prism = {
  languages: { toy: {} },
  tokenize: function (code) {
    return [{ type: "keyword", content: code.slice(0, 5) }, code.slice(5)];
  },
};
`;

/**
 * flattens a grammar tree
 * @param node the tree to walk
 * @returns the ranges it holds
 */
function ranges(node: Parameters<typeof flattenTokens>[0]): TokenSpan[] {
  const out: TokenSpan[] = [];
  flattenTokens(node, 0, out);

  return out;
}

/**
 * wraps blocks as a board
 * @param blocks the blocks the board's one section holds
 * @returns the board
 */
function board(blocks: Block[]): PageData {
  return { sections: [{ blocks }] } as unknown as PageData;
}

describe("const:PRISM_CDN_URL", () => {
  it("should pin the release it downloads and the digest it will run", () => {
    expect(PRISM_CDN_URL).toContain("prismjs@1.29.0");
    expect(PRISM_SHA256).toHaveLength(64);
  });
});

describe("fn:flattenTokens", () => {
  it("should measure each run against where it sits in the excerpt", () => {
    expect(ranges(["ab", { type: "keyword", content: "cde" }, "f"])).toStrictEqual([
      { start: 2, end: 5, kind: "keyword" },
    ]);
  });

  it("should keep a nested run's parent as well as the run itself", () => {
    // the two overlap, and the span engine cuts overlaps apart rather than
    // nesting them, so both names reach the piece they share
    expect(
      ranges([
        {
          type: "string",
          content: ["'a", { type: "interpolation", content: "$b" }, "c'"],
        },
      ]),
    ).toStrictEqual([
      { start: 0, end: 6, kind: "string" },
      { start: 2, end: 4, kind: "interpolation" },
    ]);
  });

  it("should measure a run's alias beside its own name", () => {
    // the palette is written in families, and a grammar that calls the name
    // after `fn` a function-definition aliases it `function` — the alias is
    // what carries the colour
    expect(
      ranges([{ type: "function-definition", alias: "function", content: "go" }]),
    ).toStrictEqual([
      { start: 0, end: 2, kind: "function-definition" },
      { start: 0, end: 2, kind: "function" },
    ]);
  });

  it("should take every alias when a run carries a list of them", () => {
    expect(
      ranges([{ type: "a", alias: ["b", "C d"], content: "xy" }]),
    ).toStrictEqual([
      { start: 0, end: 2, kind: "a" },
      { start: 0, end: 2, kind: "b" },
    ]);
  });

  it("should drop a name that could not be a class rather than emit it", () => {
    expect(ranges([{ type: 'a" onclick="b', content: "xy" }])).toStrictEqual([]);
  });

  it("should still measure past a dropped run, so later offsets stay true", () => {
    expect(ranges([{ type: "A B", content: "xy" }, { type: "keyword", content: "z" }])).toStrictEqual([
      { start: 2, end: 3, kind: "keyword" },
    ]);
  });
});

describe("fn:acceptPrismRuntime", () => {
  it("should refuse bytes that are not the ones this build was pinned to", () => {
    expect(() => acceptPrismRuntime("not the bundle", "cached")).toThrow(RenderError);
  });

  it("should name the digest it got, so the pin can be checked by hand", () => {
    // a version pin says which release was asked for; only a digest says which
    // one arrived, and the builder runs these bytes rather than inlining them
    expect(() => acceptPrismRuntime("x")).toThrow(
      /hashes to 2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881, not the pinned/,
    );
  });

  it("should tell a cached copy and a downloaded one apart in its remedy", () => {
    expect(() => acceptPrismRuntime("x", "cached")).toThrow(/delete .*prism-1\.29\.0\.cache\.js/);
    expect(() => acceptPrismRuntime("x")).toThrow(/check https:\/\/cdn\.jsdelivr\.net/);
  });
});

describe("fn:evaluatePrism", () => {
  it("should hand back a tokenizer that measures ranges over the excerpt", () => {
    expect(evaluatePrism(TOY).tokenize("const x", "toy")).toStrictEqual([
      { start: 0, end: 5, kind: "keyword" },
    ]);
  });

  it("should measure nothing for a language the bundle has no grammar for", () => {
    expect(evaluatePrism(TOY).tokenize("const x", "cobol")).toStrictEqual([]);
  });

  it("should resolve a language the grammar set spells differently", () => {
    const prism = evaluatePrism(TOY.replace("toy:", "bash:"));

    expect(prism.tokenize("const x", "zsh")).toHaveLength(1);
  });

  it("should refuse a bundle that publishes no tokenizer", () => {
    expect(() => evaluatePrism("var Prism = { languages: {} };")).toThrow(
      new RenderError(
        "the Prism bundle ran but published no tokenize function, so it is not the highlighter",
      ),
    );
  });

  it("should run the bundle in a realm that cannot see this process", () => {
    // the containment claim, checked rather than asserted: a bundle evaluated
    // here has the language's built-ins and nothing else
    const probe = evaluatePrism(
      'var seen = typeof process + "," + typeof require + "," + typeof fetch;' +
        "var Prism = { languages: { toy: {} }, tokenize: function () { return [{ type: 'x', content: seen }]; } };",
    );

    expect(probe.tokenize("q", "toy")).toStrictEqual([
      { start: 0, end: 29, kind: "x" },
    ]);
  });
});

describe("fn:highlighterOnce", () => {
  it("should load the bundle once however many boards ask for it", async () => {
    let loads = 0;
    const once = highlighterOnce(
      () => undefined,
      () => {
        loads += 1;

        return Promise.resolve(TOY);
      },
    );
    await Promise.all([once(), once(), once()]);

    expect(loads).toBe(1);
  });

  it("should leave the board uncoloured and say so rather than stop the build", async () => {
    // colour is an enhancement: no cache and no network is a line on stderr,
    // not a run that produces nothing
    const said: string[] = [];
    const once = highlighterOnce(
      (message) => said.push(message),
      () => Promise.reject(new RenderError("no cached Prism runtime")),
    );

    expect(await once()).toBeUndefined();
    expect(said).toStrictEqual([
      "code is rendered without colour: no cached Prism runtime",
    ]);
  });

  it("should survive a bundle that runs but is not the highlighter", async () => {
    const said: string[] = [];
    const once = highlighterOnce(
      (message) => said.push(message),
      () => Promise.resolve("var Prism = 1;"),
    );

    expect(await once()).toBeUndefined();
    expect(said[0]).toContain("published no tokenize function");
  });
});

describe("fn:colourCodeBlocks", () => {
  /** a highlighter that colours the first two characters of anything. */
  const stub: Highlighter = {
    tokenize: () => [{ start: 0, end: 2, kind: "keyword" }],
  };

  it("should write the ranges the renderer reads", () => {
    const data = board([{ type: "code", language: "toy", code: "abcd" }]);
    colourCodeBlocks(data, stub);

    expect((data.sections[0].blocks[0] as { tokens: TokenSpan[] }).tokens).toStrictEqual([
      { start: 0, end: 2, kind: "keyword" },
    ]);
  });

  it("should overwrite ranges a data file wrote itself", () => {
    // what the renderer draws is what the builder measured, or nothing: an
    // authored `tokens` never survives to the page
    const data = board([
      {
        type: "code",
        language: "toy",
        code: "abcd",
        tokens: [{ start: 0, end: 4, kind: "smuggled" }],
      },
    ]);
    colourCodeBlocks(data, undefined);

    expect(
      (data.sections[0].blocks[0] as { tokens?: TokenSpan[] }).tokens,
    ).toBeUndefined();
  });

  it("should reach both panels of a pair", () => {
    const data = board([
      {
        type: "codepair",
        panels: [
          { language: "toy", code: "abcd" },
          { language: "toy", code: "efgh" },
        ],
      },
    ]);
    colourCodeBlocks(data, stub);
    const { panels } = data.sections[0].blocks[0] as {
      panels: { tokens: TokenSpan[] }[];
    };

    expect(panels.every(({ tokens }) => tokens.length === 1)).toBe(true);
  });
});
