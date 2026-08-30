import type { Run } from "../types.ts";

/**
 * how much of a next action the board draws before it stops.
 *
 * six of this tree's seven streams write one sentence of 64 to 142 characters,
 * so the budget is what holds the seventh — a paragraph — to the same shape
 * rather than what shortens the other six.
 */
const LEAD = 160;

/** the two markers a state file writes emphasis and code with. */
const MARKUP = /\*\*([^*]+)\*\*|`([^`]+)`/gu;

/** where a sentence ends: terminal punctuation with a space or nothing after. */
const SENTENCE = /[.!?](?=\s|$)/u;

/** the opening of a next action, and whether it is all of one. */
interface Lead {
  /** the opening, as runs */
  runs: Run[];
  /** whether anything was left behind */
  clipped: boolean;
}

/**
 * what a run says, with nothing about how it is drawn.
 * @param run the run
 * @returns its text
 */
function textOf(run: Run): string {
  return typeof run === "string" ? run : run.text;
}

/**
 * the same run, saying less.
 * @param run the run
 * @param text what it should say instead
 * @returns the shortened run
 */
function shorten(run: Run, text: string): Run {
  return typeof run === "string" ? text : { ...run, text };
}

/**
 * a state file's markup, read as the inline vocabulary this format has.
 *
 * `Run` carries `mark` and `code`, which mean exactly what `**` and a backtick
 * mean in the file the prose was read out of. There is no markup pass-through
 * anywhere in this format, so a paragraph handed over verbatim reaches the
 * board as literal asterisks — the emphasis becomes punctuation rather than
 * emphasis, which is the one thing it was written not to be.
 * @param text one paragraph of a state file
 * @returns the paragraph as runs
 */
function runsOf(text: string): Run[] {
  const runs: Run[] = [];
  let at = 0;

  for (const found of text.matchAll(MARKUP)) {
    if (found.index > at)
      runs.push({ kind: "text", text: text.slice(at, found.index) });
    runs.push(
      found[1]
        ? { kind: "mark", text: found[1] }
        : { kind: "code", text: found[2]! },
    );
    at = found.index + found[0].length;
  }
  if (at < text.length) runs.push({ kind: "text", text: text.slice(at) });

  return runs;
}

/**
 * the opening sentence of a next action, as runs.
 *
 * a next action is a paragraph of prose written for whoever picks the stream
 * up, and this board is a rail of one-line entries. Cutting it at a fixed
 * count is what the two call sites used to do between them and neither could
 * be read: three of seven owner chips stopped inside a word, and the rail's
 * longest entry ran to 1,307 characters beside a median of 110. A sentence is
 * the unit the prose is already written in, so that is where this stops —
 * and when it stops early it says so, because a reader cannot otherwise tell
 * an opening from a whole.
 * @param next the stream's next action, verbatim
 * @returns its opening and whether that is all of it
 */
function lead(next: string): Lead {
  const whole = runsOf(next.replace(/\s+/gu, " ").trim());
  const runs: Run[] = [];
  let room = LEAD;

  for (const run of whole) {
    if (room <= 0) break;
    const text = textOf(run);
    const ends = SENTENCE.exec(text);
    // a sentence that fits ends the lead; one that does not is cut at the last
    // word inside the budget, so either way the cut lands between words
    const stops = ends !== null && ends.index < room;
    const end = stops
      ? ends.index + 1
      : text.length <= room
        ? text.length
        : Math.max(text.lastIndexOf(" ", room), 1);

    runs.push(shorten(run, text.slice(0, end)));
    room = stops || end < text.length ? 0 : room - text.length;
  }

  const kept = runs.reduce((total, run) => total + textOf(run).length, 0);
  const said = whole.reduce((total, run) => total + textOf(run).length, 0);

  return { runs, clipped: kept < said };
}

/**
 * the same opening with nothing but its words, for a field that holds no runs.
 * @param next the stream's next action, verbatim
 * @returns the opening as one string, ending in an ellipsis where it was cut
 */
export function leadText(next: string): string {
  const { runs, clipped } = lead(next);

  return `${runs.map(textOf).join("")}${clipped ? " …" : ""}`;
}

/**
 * the same opening as runs, saying where it stopped short.
 *
 * the ellipsis is a `dim` run rather than a character on the end of the prose,
 * because it is the board talking about the record rather than anything the
 * record says.
 * @param next the stream's next action, verbatim
 * @returns the opening, followed by a quiet ellipsis where it was cut
 */
export function leadRuns(next: string): Run[] {
  const { runs, clipped } = lead(next);

  return clipped ? [...runs, { kind: "dim", text: " …" }] : runs;
}
