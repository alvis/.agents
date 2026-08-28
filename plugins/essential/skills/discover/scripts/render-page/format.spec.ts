import { describe, expect, it } from "vitest";

import { FORMATTERS, formatCodeBlocks, runFormatter } from "./format.ts";

import type { FormatTools, FormatterSpec } from "./format.ts";
import type { Block, PageData } from "./types.ts";

/** a run that records what it was asked, so a spec never needs this machine. */
function fake(
  installed: string[],
  run: (spec: FormatterSpec, code: string) => string | null = (_, code) =>
    code.replaceAll("  ", " "),
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
    expect(FORMATTERS.typescript[0].command).toBe("prettier");
    expect(FORMATTERS.json[0].command).toBe("prettier");
    expect(FORMATTERS.python.map(({ command }) => command)).toStrictEqual([
      "ruff",
      "black",
    ]);
  });
});

describe("fn:runFormatter", () => {
  it("should return what the filter wrote", () => {
    expect(runFormatter({ command: "cat", args: [] }, "a\nb\n")).toBe("a\nb\n");
  });

  it("should decline rather than erase when the tool exits non-zero", () => {
    // `rustfmt` resolves on PATH through `rustup` on a machine with no toolchain
    // and fails on every input, so presence on PATH cannot be the whole probe
    expect(runFormatter({ command: "false", args: [] }, "fn main() {}")).toBeNull();
  });

  it("should decline a command that does not exist at all", () => {
    expect(runFormatter({ command: "no-such-formatter", args: [] }, "x")).toBeNull();
  });

  it("should decline empty output rather than take it", () => {
    expect(runFormatter({ command: "true", args: [] }, "x")).toBeNull();
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
    const tools = fake(["rustfmt"], () => null);
    formatCodeBlocks(board([{ type: "code", language: "rust", code: "fn m(){}" }]), tools);

    expect(tools.warnings[0]).toBe(
      "rust: 1 excerpt left unformatted because rustfmt is installed but refused the source (first at sections[0].blocks[0])",
    );
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
    formatCodeBlocks(data, fake(["prettier"], () => "{}\n"));

    expect((data.sections[0].blocks[0] as { code: string }).code).toBe("{}");
  });
});
