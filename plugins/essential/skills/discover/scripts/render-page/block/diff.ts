import { renderCodePair, requirePanels } from "./code.ts";
import { readHighlight, rowsOf } from "./code-read.ts";
import { changedLines, diffWords, pairParagraphs } from "./diff-text.ts";
import { escapeHtml } from "../escape.ts";
import { RenderError } from "../error.ts";
import {
  optionalString,
  requireFilledArray,
  requireObject,
  requireString,
} from "../validate.ts";

import type { Run } from "./diff-text.ts";
import type { Block, CodeExcerpt, DiffPair } from "../types.ts";

/** the column headings a comparison carries when its author names none. */
const COLUMNS = ["Before", "After"] as const;

/** the diff block as authored. */
type Diff = Extract<Block, { type: "diff" }>;

/**
 * draws one side of a pair
 * @param text the side's paragraph
 * @param runs its runs
 * @param side which side it is, which decides the tag a change is drawn in
 * @param empty what an absent side says instead
 * @returns the cell
 */
function drawSide(text: string, runs: Run[], side: "before" | "after", empty: string): string {
  if (!text) return `<td class="diff-${side} is-empty"><span class="diff-none">${empty}</span></td>`;
  const tag = side === "before" ? "del" : "ins";
  const body = runs
    .map(({ text: held, changed }) =>
      changed ? `<${tag} class="diff-change">${escapeHtml(held)}</${tag}>` : escapeHtml(held),
    )
    .join("");

  return `<td class="diff-${side}">${body}</td>`;
}

/**
 * reads the pairs a prose comparison holds, in whichever shape it was authored
 * @param block the diff block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the pairs
 */
function readPairs(block: Diff, path: string): DiffPair[] {
  if (block.pairs !== undefined)
    return requireFilledArray<DiffPair>(block.pairs, `${path}.pairs`).map((pair, index) => {
      const at = `${path}.pairs[${index}]`;
      requireObject<DiffPair>(pair, at);
      for (const side of ["before", "after"] as const)
        if (typeof pair[side] !== "string")
          throw new RenderError(`${at}.${side}: required a string, received ${JSON.stringify(pair[side])}`);
      if (!pair.before.trim() && !pair.after.trim())
        throw new RenderError(`${at}: required text on at least one side, received two empty sides`);

      return { before: pair.before, after: pair.after, label: optionalString(pair.label, `${at}.label`) };
    });

  return pairParagraphs(
    requireString(block.before, `${path}.before`),
    requireString(block.after, `${path}.after`),
  );
}

/**
 * refuses a diff that holds more or fewer than one of its three shapes, since
 * the renderer would otherwise draw one and silently ignore the rest
 * @param block the diff block
 * @param path JSON path of `block`, named verbatim by any refusal
 */
function requireOneShape(block: Diff, path: string): void {
  const shapes = [
    block.pairs !== undefined ? "pairs" : "",
    block.before !== undefined || block.after !== undefined ? "before/after" : "",
    block.panels !== undefined ? "panels" : "",
  ].filter(Boolean);
  if (shapes.length !== 1)
    throw new RenderError(
      `${path}: required exactly one of pairs, before/after or panels, received ${shapes.length ? shapes.join(" and ") : "none"}`,
    );
}

/**
 * reads the two column headings
 * @param columns the headings as authored
 * @param path JSON path of `columns`, named verbatim by any refusal
 * @returns the two headings
 */
function readColumns(columns: unknown, path: string): [string, string] {
  if (columns === undefined) return [...COLUMNS];
  const read = requireFilledArray<string>(columns, path);
  if (read.length !== 2)
    throw new RenderError(`${path}: required exactly 2 headings, received ${String(read.length)}`);

  return [requireString(read[0], `${path}[0]`), requireString(read[1], `${path}[1]`)];
}

/**
 * draws two code excerpts against each other, every changed line highlighted
 * @param block the diff block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @param columns the headings, which label a panel that names no label itself
 * @returns the pair as HTML
 */
function renderCodeDiff(block: Diff, path: string, columns: [string, string]): string {
  const [before, after] = requirePanels(block.panels, `${path}.panels`) as [CodeExcerpt, CodeExcerpt];
  const codes = [
    requireString(before.code, `${path}.panels[0].code`),
    requireString(after.code, `${path}.panels[1].code`),
  ] as const;
  const changed = changedLines(...codes);
  const panel = (index: 0 | 1, lines: number[]): CodeExcerpt => {
    const excerpt = index === 0 ? before : after;
    // the author's own highlight is read first, so a refusal names the line
    // they wrote rather than its place among the changed lines merged beside it
    const own = readHighlight(
      excerpt.highlight ?? [],
      `${path}.panels[${String(index)}].highlight`,
      rowsOf(codes[index]).length,
    );

    return {
      ...excerpt,
      label: excerpt.label ?? columns[index],
      highlight: [...new Set([...own, ...lines])].sort((a, b) => a - b),
    };
  };

  return renderCodePair(
    {
      type: "codepair",
      caption: optionalString(block.title, `${path}.title`),
      panels: [panel(0, changed.before), panel(1, changed.after)],
    },
    path,
  );
}

/**
 * draws a before-and-after comparison, finding the changes itself
 * @param block the diff block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the comparison as HTML
 */
export function renderDiff(block: Diff, path: string): string {
  requireOneShape(block, path);
  const columns = readColumns(block.columns, `${path}.columns`);
  if (block.panels !== undefined) return renderCodeDiff(block, path, columns);

  const title = optionalString(block.title, `${path}.title`);
  const location = optionalString(block.location, `${path}.location`);
  const pairs = readPairs(block, path);
  // whole texts carry no location of their own, so a named location column
  // counts their paragraphs; authored pairs fill it from their labels
  const located = pairs.map((pair, index) => ({
    ...pair,
    label: pair.label ?? (block.pairs === undefined && location ? `¶ ${String(index + 1)}` : undefined),
  }));
  const withPlace = location !== undefined || located.some(({ label }) => label !== undefined);

  const head = `<tr>${withPlace ? `<th scope="col" class="diff-at">${escapeHtml(location ?? "Where")}</th>` : ""}${columns
    .map((heading) => `<th scope="col">${escapeHtml(heading)}</th>`)
    .join("")}</tr>`;
  const rows = located
    .map(({ before, after, label }) => {
      const runs = diffWords(before, after);
      const same = before === after;
      // a row's location is its header cell, so a screen reader announces
      // where a change sits before reading either side of it
      const place = withPlace
        ? `<th scope="row" class="diff-at">${label === undefined ? "" : escapeHtml(label)}</th>`
        : "";

      return `<tr${same ? ' class="is-same"' : ""}>${place}${drawSide(before, runs.before, "before", "(new)")}${drawSide(after, runs.after, "after", "(removed)")}</tr>`;
    })
    .join("");
  const table = `<div class="table-wrap"><table class="diff${withPlace ? " has-place" : ""}"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;

  return title
    ? `<figure class="diff-figure"><figcaption>${escapeHtml(title)}</figcaption>${table}</figure>`
    : table;
}
