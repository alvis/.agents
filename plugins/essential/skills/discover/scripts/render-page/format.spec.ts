import { describe, expect, it } from "vitest";

import { FORMATTERS, formatCodeBlocks, runFormatter } from "./format.ts";

import type { FormatOutcome, FormatTools, FormatterSpec } from "./format.ts";
import type { Block, PageData } from "./types.ts";

/** a run that records what it was asked, so a spec never needs this machine. */
function fake(
  installed: string[],
  run: (spec: FormatterSpec, code: string) => FormatOutcome = (_, code) => ({
    formatted: code.replaceAll("  ", " "),
  }),
): FormatTools & { asked: string[]; warnings: string[] } {
  const asked: string[] = [];
  const warnings: string[] = [];

  return {
    asked,
    warnings,
    has: (command) => {
      asked.push(command);

      return installed.includes(command);
    },
    run,
    warn: (message) => warnings.push(message),
  };
}

/**
 * wraps blocks as a board
 * @param blocks the blocks the board's one section holds
 * @returns the board
 */
function board(blocks: Block[]): PageData {
  return { sections: [{ blocks }] } as unknown as PageData;
}

describe("const:FORMATTERS", () => {
  it("should reach prettier first wherever prettier parses the language", () => {
    // prettier is the tool most likely to already be installed, so a language
    // it parses should never fall through to something rarer
    expect(FORMATTERS.get("typescript")?.[0].command).toBe("prettier");
    expect(FORMATTERS.get("json")?.[0].command).toBe("prettier");
    expect(FORMATTERS.get("python")?.map(({ command }) => command)).toStrictEqual(
      ["ruff", "black"],
    );
  });

  it("should hold no language Object.prototype lends it", () => {
    // the table is a lookup keyed by what the author wrote, so a plain object
    // would answer `constructor` with a function where this promises a list
    for (const name of ["constructor", "toString", "valueOf", "hasOwnProperty"])
      expect(FORMATTERS.get(name)).toBeUndefined();
  });
});

describe("fn:runFormatter", () => {
  it("should return what the filter wrote", () => {
    expect(runFormatter({ command: "cat", args: [] }, "a\nb\n")).toStrictEqual({
      formatted: "a\nb\n",
    });
  });

  it("should decline rather than erase when the tool exits non-zero", () => {
    // `rustfmt` resolves on PATH through `rustup` on a machine with no toolchain
    // and fails on every input, so presence on PATH cannot be the whole probe
    expect(
      runFormatter({ command: "false", args: [] }, "fn main() {}"),
    ).toStrictEqual({ declined: "false is installed but refused the source" });
  });

  it("should decline a command that does not exist at all", () => {
    expect(
      runFormatter({ command: "no-such-formatter", args: [] }, "x"),
    ).toStrictEqual({ declined: "no-such-formatter could not be run" });
  });

  it("should decline empty output rather than take it", () => {
    expect(runFormatter({ command: "true", args: [] }, "x")).toStrictEqual({
      declined: "true wrote nothing",
    });
  });

  it("should decline output that lost words the author wrote", () => {
    // a tool can stop halfway, print the prefix it managed and still exit 0;
    // taking that fragment replaces the excerpt with a part of itself, and
    // every selection then anchors onto code the board never shows
    expect(
      runFormatter(
        { command: "sed", args: ["-n", "1p"] },
        "const alpha = 1;\nconst beta = 2;\n",
      ),
    ).toStrictEqual({
      declined: "sed exited 0 but dropped 3 words of the excerpt",
    });
  });

  it("should count a single lost word in the singular", () => {
    expect(
      runFormatter({ command: "sed", args: ["-n", "1p"] }, "alpha\nbeta\n"),
    ).toStrictEqual({
      declined: "sed exited 0 but dropped 1 word of the excerpt",
    });
  });

  it("should take output whose words were only re-cased", () => {
    // `sql-formatter` upper-cases keywords, which is a formatting decision
    // rather than a change to what the author wrote
    expect(
      runFormatter({ command: "tr", args: ["a-z", "A-Z"] }, "select 1"),
    ).toStrictEqual({ formatted: "SELECT 1" });
  });

  it("should kill a formatter that never finishes", () => {
    // without this the build waits forever on one wedged third-party binary,
    // with nothing drawn and nothing said
    expect(
      runFormatter({ command: "sleep", args: ["2"] }, "x", 100),
    ).toStrictEqual({
      declined: "sleep did not finish within 0.1s and was killed",
    });
  });

  it("should decline bytes that are not valid UTF-8", () => {
    expect(
      runFormatter(
        { command: "bash", args: ["-c", "cat > /dev/null; printf '\\377'"] },
        "x",
      ),
    ).toStrictEqual({
      declined: "bash returned bytes that are not valid UTF-8",
    });
  });

  it("should keep a replacement character the author wrote themselves", () => {
    expect(runFormatter({ command: "cat", args: [] }, "a \uFFFD b")).toStrictEqual({
      formatted: "a \uFFFD b",
    });
  });
});

describe("fn:formatCodeBlocks", () => {
  it("should rewrite the excerpt the renderer will read", () => {
    const data = board([
      { type: "code", language: "typescript", code: "const  a  = 1;" },
    ]);
    formatCodeBlocks(data, fake(["prettier"]));

    expect((data.sections[0].blocks[0] as { code: string }).code).toBe(
      "const a = 1;",
    );
  });

  it("should pass through a language only Object.prototype answers to", () => {
    // the walk hands this an author-supplied name, so a plain lookup table
    // reads a function back for `constructor` and crashes with a raw
    // TypeError where an unknown language should pass through in silence
    const tools = fake([]);
    const data = board([
      { type: "code", language: "constructor", code: "x  y" },
    ]);
    formatCodeBlocks(data, tools);

    expect((data.sections[0].blocks[0] as { code: string }).code).toBe("x  y");
    expect(tools.warnings).toStrictEqual([]);
  });

  it("should probe once a run rather than once a block", () => {
    const tools = fake(["prettier"]);
    formatCodeBlocks(
      board([
        { type: "code", language: "typescript", code: "a  b" },
        { type: "code", language: "typescript", code: "c  d" },
        { type: "code", language: "json", code: "{  }" },
      ]),
      tools,
    );

    expect(tools.asked).toStrictEqual(["prettier", "prettier"]);
  });

  it("should reach a panel of a pair, which is half of every comparison", () => {
    const data = board([
      {
        type: "codepair",
        panels: [
          { language: "typescript", code: "a  b" },
          { language: "typescript", code: "c  d" },
        ],
      },
    ]);
    formatCodeBlocks(data, fake(["prettier"]));
    const { panels } = data.sections[0].blocks[0] as {
      panels: { code: string }[];
    };

    expect(panels.map(({ code }) => code)).toStrictEqual(["a b", "c d"]);
  });

  it("should reach an excerpt behind a disclosure", () => {
    const data = board([
      {
        type: "disclosure",
        summary: "Why",
        blocks: [{ type: "code", language: "typescript", code: "a  b" }],
      },
    ] as unknown as Block[]);
    formatCodeBlocks(data, fake(["prettier"]));
    const { blocks } = data.sections[0].blocks[0] as { blocks: { code: string }[] };

    expect(blocks[0].code).toBe("a b");
  });

  it("should leave the excerpt alone and say so once when nothing is installed", () => {
    const tools = fake([]);
    const data = board([
      { type: "code", language: "rust", code: "fn  main() {}" },
      { type: "code", language: "rust", code: "fn  other() {}" },
    ]);
    formatCodeBlocks(data, tools);

    expect((data.sections[0].blocks[0] as { code: string }).code).toBe(
      "fn  main() {}",
    );
    expect(tools.warnings).toHaveLength(1);
    expect(tools.warnings[0]).toBe(
      "rust: 2 excerpts left unformatted because none of rustfmt is installed (first at sections[0].blocks[0])",
    );
  });

  it("should name the installed tool when it is the one that refused", () => {
    const tools = fake(["rustfmt"], () => ({
      declined: "rustfmt is installed but refused the source",
    }));
    formatCodeBlocks(board([{ type: "code", language: "rust", code: "fn m(){}" }]), tools);

    expect(tools.warnings[0]).toBe(
      "rust: 1 excerpt left unformatted because rustfmt is installed but refused the source (first at sections[0].blocks[0])",
    );
  });

  it("should say why an excerpt was left alone, and leave it alone", () => {
    // a formatter that hangs, truncates, or writes bytes that are not UTF-8 is
    // still never allowed to fail the build: it costs one line on stderr and
    // the author's own text, which is exactly what a missing formatter costs
    const tools = fake(["rustfmt"], () => ({
      declined: "rustfmt did not finish within 60s and was killed",
    }));
    const data = board([{ type: "code", language: "rust", code: "fn  m(){}" }]);
    formatCodeBlocks(data, tools);

    expect((data.sections[0].blocks[0] as { code: string }).code).toBe(
      "fn  m(){}",
    );
    expect(tools.warnings).toStrictEqual([
      "rust: 1 excerpt left unformatted because rustfmt did not finish within 60s and was killed (first at sections[0].blocks[0])",
    ]);
  });

  it("should pass a language nobody formats through in silence", () => {
    const tools = fake([]);
    const data = board([{ type: "code", language: "text", code: "a  b" }]);
    formatCodeBlocks(data, tools);

    expect((data.sections[0].blocks[0] as { code: string }).code).toBe("a  b");
    expect(tools.warnings).toStrictEqual([]);
    expect(tools.asked).toStrictEqual([]);
  });

  it("should leave a malformed excerpt for the renderer to refuse by path", () => {
    const tools = fake(["prettier"]);
    const data = board([
      { type: "code", code: "a  b" },
      { type: "code", language: "typescript" },
    ] as unknown as Block[]);

    expect(() => formatCodeBlocks(data, tools)).not.toThrow();
    expect(tools.warnings).toStrictEqual([]);
  });

  it("should not leave a trailing newline the formatter added", () => {
    const data = board([{ type: "code", language: "json", code: "{}" }]);
    formatCodeBlocks(data, fake(["prettier"], () => ({ formatted: "{}\n" })));

    expect((data.sections[0].blocks[0] as { code: string }).code).toBe("{}");
  });
});
