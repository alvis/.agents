import type { DiffPair } from "../types.ts";

/** one run of a compared text: kept on both sides, or only on this one. */
export interface Run {
  /** the run's text, verbatim */
  text: string;
  /** whether the other side lacks it */
  changed: boolean;
}

/**
 * the largest table the longest-common-subsequence pass may build.
 *
 * the table is one cell per pair of units compared, so four million cells is
 * 16 MB of counts and well under a second of building; past it a paragraph or
 * an excerpt is drawn as wholly replaced, which is still true, rather than
 * stalling the build on one enormous block.
 */
const MAX_CELLS = 4_000_000;

/**
 * pairs the units two sequences share, in order.
 * @param before the earlier units
 * @param after the later units
 * @returns each shared unit's index on both sides, in order, or null when the
 *   sequences are too long to compare
 */
export function commonPairs<T>(before: T[], after: T[]): [number, number][] | null {
  const width = after.length + 1;
  if ((before.length + 1) * width > MAX_CELLS) return null;

  // lengths of the longest common run of each pair of suffixes, filled from the
  // end so the walk below can read the table forwards
  const table = new Uint32Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i--)
    for (let j = after.length - 1; j >= 0; j--)
      table[i * width + j] =
        before[i] === after[j]
          ? table[(i + 1) * width + j + 1]! + 1
          : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);

  const pairs: [number, number][] = [];
  for (let i = 0, j = 0; i < before.length && j < after.length; ) {
    if (before[i] === after[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) i++;
    else j++;
  }

  return pairs;
}

/**
 * joins neighbouring runs of the same kind, so a change reads as one mark
 * @param runs the runs to join
 * @returns the joined runs
 */
function join(runs: Run[]): Run[] {
  return runs.reduce<Run[]>((joined, run) => {
    const last = joined.at(-1);
    if (last && last.changed === run.changed) last.text += run.text;
    else if (run.text) joined.push({ ...run });

    return joined;
  }, []);
}

/**
 * word-diffs two paragraphs.
 *
 * whitespace is a unit of its own so a paragraph reads back exactly as
 * written; a space kept between two changed words is folded into the change,
 * so replacing a phrase draws one mark rather than one per word
 * @param before the paragraph as it was
 * @param after the paragraph as it is
 * @returns each side's runs, changed or kept
 */
export function diffWords(before: string, after: string): { before: Run[]; after: Run[] } {
  const left = before.match(/\s+|\S+/gu) ?? [];
  const right = after.match(/\s+|\S+/gu) ?? [];
  const pairs = commonPairs(left, right);
  if (!pairs)
    return {
      before: join([{ text: before, changed: true }]),
      after: join([{ text: after, changed: true }]),
    };

  const partner = new Map(pairs);
  const changedAt = (index: number): boolean => index >= 0 && index < left.length && !partner.has(index);
  for (const [i] of pairs)
    // whitespace kept between two changed words is part of the change
    if (/^\s+$/u.test(left[i]!) && changedAt(i - 1) && changedAt(i + 1)) partner.delete(i);
  const keptLeft = new Set(partner.keys());
  const keptRight = new Set(partner.values());

  return {
    before: join(left.map((text, index) => ({ text, changed: !keptLeft.has(index) }))),
    after: join(right.map((text, index) => ({ text, changed: !keptRight.has(index) }))),
  };
}

/**
 * splits a whole text into paragraphs at its blank lines
 * @param text the text to split
 * @returns the paragraphs, trimmed, empty ones dropped
 */
function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/**
 * pairs the paragraphs of two whole texts.
 *
 * unchanged paragraphs anchor the pairing; between two anchors the remaining
 * paragraphs pair in order, and whatever is left over on one side is an
 * insertion or a removal
 * @param before the whole earlier text
 * @param after the whole later text
 * @returns the pairs, in reading order
 */
export function pairParagraphs(before: string, after: string): DiffPair[] {
  const left = paragraphsOf(before);
  const right = paragraphsOf(after);
  const anchors = [...(commonPairs(left, right) ?? []), [left.length, right.length]];
  const pairs: DiffPair[] = [];
  let i = 0;
  let j = 0;
  for (const [anchorLeft, anchorRight] of anchors) {
    while (i < anchorLeft! || j < anchorRight!)
      pairs.push({
        before: i < anchorLeft! ? left[i++]! : "",
        after: j < anchorRight! ? right[j++]! : "",
      });
    if (anchorLeft! < left.length) pairs.push({ before: left[i++]!, after: right[j++]! });
  }

  return pairs;
}

/**
 * finds the lines of two excerpts that the other lacks
 * @param before the earlier excerpt's code
 * @param after the later excerpt's code
 * @returns each side's changed lines, 1-based
 */
export function changedLines(before: string, after: string): { before: number[]; after: number[] } {
  const left = before.replace(/\n$/u, "").split("\n");
  const right = after.replace(/\n$/u, "").split("\n");
  const pairs = commonPairs(
    left.map((line) => line.trimEnd()),
    right.map((line) => line.trimEnd()),
  );
  const keptLeft = new Set(pairs?.map(([i]) => i));
  const keptRight = new Set(pairs?.map(([, j]) => j));

  return {
    before: left.flatMap((_, index) => (keptLeft.has(index) ? [] : [index + 1])),
    after: right.flatMap((_, index) => (keptRight.has(index) ? [] : [index + 1])),
  };
}
