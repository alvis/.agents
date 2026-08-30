import { spawnSync } from "node:child_process";

import { codeExcerpts } from "./walk.ts";

import type { PageData } from "./types.ts";

/** how long a formatter may run over one excerpt before it is killed. */
const TIMEOUT_SECONDS = 60;

/** what counts as one of the author's words, for the survival check below. */
const WORD = /[\p{L}\p{N}_]+/gu;

/** how one formatter is invoked so that it reads stdin and writes stdout. */
export interface FormatterSpec {
  /** the executable, resolved on PATH */
  command: string;
  /** the arguments that put it in filter mode */
  args: string[];
}

/** what came back from handing one excerpt to one formatter. */
export type FormatOutcome =
  | {
      /** the formatted excerpt, which kept every word the author wrote */
      formatted: string;
    }
  | {
      /** why the excerpt is being left exactly as the author wrote it */
      declined: string;
    };

/** the seams a caller can replace, so a spec never depends on this machine. */
export interface FormatTools {
  /** whether the command resolves on PATH */
  has: (command: string) => boolean;
  /** runs the formatter as a filter, saying why when it declined the source */
  run: (spec: FormatterSpec, code: string) => FormatOutcome;
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
 * counts every word in a chunk of source, folded to lower case.
 *
 * folded because `sql-formatter` upper-cases keywords, which is a formatting
 * decision rather than a change to what the author wrote.
 * @param code the source to read
 * @returns how many times each word occurs
 */
function words(code: string): Map<string, number> {
  const counted = new Map<string, number>();
  for (const [word] of code.matchAll(WORD)) {
    const key = word.toLowerCase();
    counted.set(key, (counted.get(key) ?? 0) + 1);
  }

  return counted;
}

/**
 * how many of the author's words a formatter did not give back.
 *
 * a formatter respaces, reorders and repunctuates; it does not delete the
 * author's identifiers. Anything it dropped means its output is no longer the
 * excerpt that was handed to it — which matters twice over here, because a
 * selection is matched against the formatted text and would then anchor onto
 * code the board never shows. Additions are ignored: a formatter that writes
 * an explicit `return` has still kept everything it was given.
 * @param before the excerpt as the author wrote it
 * @param after what the formatter wrote back
 * @returns the number of words lost, counting repeats separately
 */
function lostWords(before: string, after: string): number {
  const kept = words(after);
  let lost = 0;
  for (const [word, count] of words(before))
    lost += Math.max(0, count - (kept.get(word) ?? 0));

  return lost;
}

/**
 * runs a formatter over one excerpt, treating every failure as no opinion.
 *
 * a non-zero exit is the common case rather than the exotic one: `rustfmt`
 * resolves on PATH through `rustup` on a machine with no toolchain installed
 * and fails on every input, so presence on PATH cannot be the whole probe.
 * Exiting zero is not the whole probe either — a tool can stop halfway, print
 * the prefix it managed and still claim success, and the three checks after
 * the exit status are what keep that from silently replacing the author's code
 * with a fragment of it.
 * @param spec the formatter and the arguments that make it a filter
 * @param code the excerpt to format
 * @param timeoutMs how long to wait before killing it, in milliseconds
 * @returns the formatted excerpt, or the reason it is being left alone
 */
export function runFormatter(
  spec: FormatterSpec,
  code: string,
  timeoutMs: number = TIMEOUT_SECONDS * 1000,
): FormatOutcome {
  // no timeout means one wedged third-party binary hangs the whole build with
  // nothing drawn and nothing said; SIGKILL rather than SIGTERM because a tool
  // that has already stopped responding is not going to honour a polite ask
  const result = spawnSync(spec.command, spec.args, {
    input: code,
    timeout: timeoutMs,
    killSignal: "SIGKILL",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error)
    return {
      declined:
        (result.error as { code?: string }).code === "ETIMEDOUT"
          ? `${spec.command} did not finish within ${timeoutMs / 1000}s and was killed`
          : `${spec.command} could not be run`,
    };
  if (result.signal)
    return { declined: `${spec.command} was killed by ${result.signal}` };
  if (result.status !== 0)
    return { declined: `${spec.command} is installed but refused the source` };

  // read as bytes and decode here, so that invalid UTF-8 is something this can
  // see rather than something the decoder has already turned into U+FFFD
  // behind it. `vendor.ts` treats a surviving replacement character in a
  // downloaded bundle as corruption; source the author wrote deserves the same
  // reading, and the only difference is that this one is not fatal
  const written = result.stdout.toString("utf8");
  if (!written.trim()) return { declined: `${spec.command} wrote nothing` };
  if (written.includes("�") && !code.includes("�"))
    return {
      declined: `${spec.command} returned bytes that are not valid UTF-8`,
    };
  const lost = lostWords(code, written);
  if (lost)
    return {
      declined: `${spec.command} exited 0 but dropped ${lost} word${lost === 1 ? "" : "s"} of the excerpt`,
    };

  return { formatted: written };
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
 * a formatter is never allowed to fail the build, however it failed: a missing
 * one, a wedged one and one that returned a fragment all leave the excerpt as
 * the author wrote it. The run says which happened once per language rather
 * than once per excerpt, so a board with thirty Rust blocks and no `rustfmt`
 * reports one line instead of thirty.
 * @param data the parsed board, mutated in place
 * @param tools the seams this run resolves through
 */
export function formatCodeBlocks(
  data: PageData,
  tools: FormatTools = SYSTEM_TOOLS,
): void {
  const chosen = new Map<string, FormatterSpec | undefined>();
  const unformatted = new Map<
    string,
    { count: number; first: string; reason: string }
  >();

  for (const { excerpt, path } of codeExcerpts(data)) {
    // a malformed excerpt is left exactly as it is: `block/code.ts` refuses it
    // by its JSON path, and a refusal that reads beats a crash in the walk
    if (typeof excerpt?.code !== "string") continue;
    const language = excerpt.language;
    if (typeof language !== "string" || !FORMATTERS[language]) continue;
    if (!chosen.has(language)) chosen.set(language, choose(language, tools));
    const spec = chosen.get(language);
    const outcome = spec
      ? tools.run(spec, excerpt.code)
      : {
          declined: `none of ${FORMATTERS[language].map((one) => one.command).join(", ")} is installed`,
        };
    if ("formatted" in outcome) {
      excerpt.code = outcome.formatted.replace(/\n$/, "");
      continue;
    }
    const seen = unformatted.get(language);
    unformatted.set(
      language,
      seen
        ? { ...seen, count: seen.count + 1 }
        : { count: 1, first: path, reason: outcome.declined },
    );
  }

  for (const [language, { count, first, reason }] of unformatted)
    tools.warn(
      `${language}: ${count} excerpt${count === 1 ? "" : "s"} left unformatted because ${reason} (first at ${first})`,
    );
}
