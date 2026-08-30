import { spawnSync } from "node:child_process";

import { codeExcerpts } from "./walk.ts";

import type { PageData } from "./types.ts";

/** how one formatter is invoked so that it reads stdin and writes stdout. */
export interface FormatterSpec {
  /** the executable, resolved on PATH */
  command: string;
  /** the arguments that put it in filter mode */
  args: string[];
}

/** the seams a caller can replace, so a spec never depends on this machine. */
export interface FormatTools {
  /** whether the command resolves on PATH */
  has: (command: string) => boolean;
  /** runs the formatter as a filter; null when it declined the source */
  run: (spec: FormatterSpec, code: string) => string | null;
  /** where a note about an unformatted excerpt is written */
  warn: (message: string) => void;
}

const prettier = (parser: string): FormatterSpec => ({
  command: "prettier",
  args: ["--parser", parser],
});

/**
 * every language the builder knows how to format, best candidate first.
 *
 * prettier comes first wherever it parses the language, because it is the one
 * tool most likely to already be installed. A language absent from this table
 * is not an error: it is a language nobody has a formatter for, and its
 * excerpts pass through in silence rather than nagging on every build.
 */
export const FORMATTERS: Record<string, FormatterSpec[]> = {
  bash: [{ command: "shfmt", args: [] }],
  css: [prettier("css")],
  go: [{ command: "gofmt", args: [] }],
  graphql: [prettier("graphql")],
  html: [prettier("html")],
  javascript: [prettier("babel")],
  json: [prettier("json")],
  jsonc: [prettier("json")],
  jsx: [prettier("babel")],
  less: [prettier("less")],
  markdown: [prettier("markdown")],
  python: [
    { command: "ruff", args: ["format", "-"] },
    { command: "black", args: ["-q", "-"] },
  ],
  rust: [{ command: "rustfmt", args: ["--emit", "stdout"] }],
  scss: [prettier("scss")],
  shell: [{ command: "shfmt", args: [] }],
  sql: [{ command: "sql-formatter", args: [] }],
  tsx: [prettier("typescript")],
  typescript: [prettier("typescript")],
  yaml: [prettier("yaml")],
};

/**
 * runs a formatter over one excerpt, treating every failure as no opinion.
 *
 * a non-zero exit is the common case rather than the exotic one: `rustfmt`
 * resolves on PATH through `rustup` on a machine with no toolchain installed
 * and fails on every input, so presence on PATH cannot be the whole probe.
 * Empty output is refused for the same reason — a tool that writes its
 * complaint to stderr and nothing to stdout would otherwise erase the excerpt.
 * @param spec the formatter and the arguments that make it a filter
 * @param code the excerpt to format
 * @returns the formatted excerpt, or null when the tool declined it
 */
export function runFormatter(
  spec: FormatterSpec,
  code: string,
): string | null {
  const result = spawnSync(spec.command, spec.args, {
    input: code,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) return null;

  return result.stdout.trim() ? result.stdout : null;
}

/** the tools a real build uses, replaced wholesale by every spec. */
export const SYSTEM_TOOLS: FormatTools = {
  has: (command) => Bun.which(command) !== null,
  run: runFormatter,
  warn: (message) => {
    process.stderr.write(`${message}\n`);
  },
};

/**
 * picks the first candidate for a language that is actually installed.
 * @param language the language to format
 * @param tools the seams this run resolves through
 * @returns the chosen formatter, or undefined when none is installed
 */
function choose(
  language: string,
  tools: FormatTools,
): FormatterSpec | undefined {
  return FORMATTERS[language]?.find((spec) => tools.has(spec.command));
}

/**
 * formats every excerpt on a board, in place, before it reaches the renderer.
 *
 * this is the CLI layer's work, not the renderer's: `renderPage` stays a pure
 * function of the data it is handed, and formatting is what makes an author's
 * selections resolvable — they are matched against the formatted text, so the
 * text has to be settled before rendering starts.
 *
 * a missing formatter is never a build failure. The excerpt renders as the
 * author wrote it and the run says so once per language rather than once per
 * excerpt, so a board with thirty Rust blocks and no `rustfmt` reports one
 * line instead of thirty.
 * @param data the parsed board, mutated in place
 * @param tools the seams this run resolves through
 */
export function formatCodeBlocks(
  data: PageData,
  tools: FormatTools = SYSTEM_TOOLS,
): void {
  const chosen = new Map<string, FormatterSpec | undefined>();
  const unformatted = new Map<string, { count: number; first: string }>();

  for (const { excerpt, path } of codeExcerpts(data)) {
    // a malformed excerpt is left exactly as it is: `block/code.ts` refuses it
    // by its JSON path, and a refusal that reads beats a crash in the walk
    if (typeof excerpt?.code !== "string") continue;
    const language = excerpt.language;
    if (typeof language !== "string" || !FORMATTERS[language]) continue;
    if (!chosen.has(language)) chosen.set(language, choose(language, tools));
    const spec = chosen.get(language);
    const formatted = spec ? tools.run(spec, excerpt.code) : null;
    if (formatted !== null) {
      excerpt.code = formatted.replace(/\n$/, "");
      continue;
    }
    const seen = unformatted.get(language);
    unformatted.set(
      language,
      seen ? { ...seen, count: seen.count + 1 } : { count: 1, first: path },
    );
  }

  for (const [language, { count, first }] of unformatted) {
    const spec = chosen.get(language);
    const reason = spec
      ? `${spec.command} is installed but refused the source`
      : `none of ${FORMATTERS[language].map((one) => one.command).join(", ")} is installed`;
    tools.warn(
      `${language}: ${count} excerpt${count === 1 ? "" : "s"} left unformatted because ${reason} (first at ${first})`,
    );
  }
}
