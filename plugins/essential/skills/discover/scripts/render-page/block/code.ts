import { drawRun } from "../span.ts";
import { escapeHtml } from "../escape.ts";
import { syncAttribute } from "../sync.ts";
import { RenderError } from "../error.ts";
import {
  optionalString,
  requireArray,
  requireObject,
  requireString,
} from "../validate.ts";
import {
  readComments,
  readHighlight,
  readTies,
  readTokens,
} from "./code-read.ts";
import { placeSelections } from "./code-select.ts";

import type { PlacedSelection } from "./code-select.ts";
import type { Span } from "../span.ts";
import type { Block, CodeExcerpt } from "../types.ts";

/** an excerpt drawn, against the selections it turned out to carry. */
interface Drawn {
  /** the path chip and the excerpt itself, without caption or notes */
  html: string;
  /** every selection on it, located and numbered */
  placed: PlacedSelection[];
}

/**
 * draws a source excerpt, held verbatim and escaped as it is sliced
 * @param block the code block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the excerpt as HTML
 */
export function renderCode(
  block: Extract<Block, { type: "code" }>,
  path: string,
): string {
  const caption = optionalString(block.caption, `${path}.caption`);
  const { html, placed } = drawExcerpt(block, path, 1);
  const notes = drawNotes(placed);
  if (!caption && !notes && html.startsWith("<pre")) return html;

  // a figure, so the caption and the notes are associated with the excerpt
  // rather than floating above it as paragraphs that happen to sit nearby
  return `<figure class="code-figure">${html}${notes}${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}</figure>`;
}

/**
 * draws two excerpts to be read against each other.
 *
 * the panels share one number sequence and one note list, which is what makes
 * the pair read as a single annotated comparison rather than as two blocks that
 * happen to sit side by side: note 3 is note 3 wherever the reader finds it.
 * @param block the code pair
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the pair as HTML
 */
export function renderCodePair(
  block: Extract<Block, { type: "codepair" }>,
  path: string,
): string {
  const eyebrow = optionalString(block.eyebrow, `${path}.eyebrow`);
  const caption = optionalString(block.caption, `${path}.caption`);
  const panels = requirePanels(block.panels, `${path}.panels`);
  const placed: PlacedSelection[] = [];
  const drawn = panels.map((panel, index) => {
    const one = drawExcerpt(panel, `${path}.panels[${index}]`, placed.length + 1);
    placed.push(...one.placed);

    return `<div class="code-panel">${one.html}</div>`;
  });

  return [
    `<figure class="code-pair">`,
    eyebrow ? `<p class="code-eyebrow">${escapeHtml(eyebrow)}</p>` : "",
    caption ? `<figcaption class="code-pair-title">${escapeHtml(caption)}</figcaption>` : "",
    `<div class="code-panels">${drawn.join("")}</div>`,
    drawNotes(placed),
    `</figure>`,
  ].join("");
}

/**
 * reads a pair's two panels, refusing any other count by JSON path.
 *
 * two is the whole shape: a pair with one panel has nothing to compare against
 * and a pair with three has no side-by-side reading, and both would otherwise
 * lay out as something the author did not ask for rather than be refused.
 * @param panels the author-supplied panels
 * @param path JSON path of `panels`, named verbatim by any refusal
 * @returns the two panels
 */
function requirePanels(panels: unknown, path: string): CodeExcerpt[] {
  const read = requireArray<CodeExcerpt>(panels, path);
  if (read.length !== 2)
    throw new RenderError(
      `${path}: required exactly 2 panels, received ${String(read.length)}`,
    );
  for (const [index, panel] of read.entries())
    requireObject<CodeExcerpt>(panel, `${path}[${index}]`);

  return read;
}

/**
 * draws one excerpt: its path chip, then the excerpt itself.
 * @param excerpt the excerpt as the author wrote it
 * @param path JSON path of `excerpt`, named verbatim by any refusal
 * @param from the number the first of its selections carries
 * @returns the drawn excerpt and the selections it turned out to carry
 */
function drawExcerpt(
  excerpt: CodeExcerpt,
  path: string,
  from: number,
): Drawn {
  const code = requireString(excerpt.code, `${path}.code`);
  const language = requireString(excerpt.language, `${path}.language`);
  const label = optionalString(excerpt.label, `${path}.label`);
  const placed = placeSelections(
    excerpt.selections ?? [],
    code,
    `${path}.selections`,
    from,
  );
  const tokens = readTokens(excerpt.tokens ?? [], `${path}.tokens`, code.length);
  const head = label
    ? `<p class="code-path"><span class="code-path-file">${escapeHtml(label)}</span><span class="code-path-language">${escapeHtml(language)}</span></p>`
    : "";
  const plain =
    !placed.length &&
    !tokens.length &&
    excerpt.highlight === undefined &&
    excerpt.ties === undefined &&
    excerpt.comments === undefined;

  // an excerpt nobody has marked up is still one escaped string, exactly as it
  // was before any of this existed, so the boards that use none of these
  // features did not gain a byte
  const inner = plain
    ? escapeHtml(code)
    : drawLines(excerpt, code, path, tokens, placed);

  return {
    html: `${head}<pre class="code" data-language="${escapeHtml(language)}"><code>${inner}</code></pre>`,
    placed,
  };
}

/**
 * draws the numbered notes that read under an excerpt or a pair.
 * @param placed the located selections, in reading order
 * @returns the note list as HTML, or nothing when there are no selections
 */
function drawNotes(placed: PlacedSelection[]): string {
  if (!placed.length) return "";
  const items = placed
    .map(
      (one) =>
        `<li class="code-note" value="${String(one.number)}"><span class="code-note-body">${one.note}</span></li>`,
    )
    .join("");

  return `<ol class="code-notes">${items}</ol>`;
}

/**
 * draws an excerpt line by line, so a line can be marked, tied, or commented on
 * @param excerpt the excerpt as the author wrote it
 * @param code the excerpt text
 * @param path JSON path of `excerpt`, named verbatim by any refusal
 * @param tokens the measured colour ranges
 * @param placed the located selections
 * @returns the lines as HTML, newlines preserved
 */
function drawLines(
  excerpt: CodeExcerpt,
  code: string,
  path: string,
  tokens: Span[],
  placed: PlacedSelection[],
): string {
  // each row carries its own line break, so a line is what the author wrote
  // rather than what a split left behind: `"a\nb\n"` is two lines, and
  // splitting on the break makes it three, the last of them empty
  const rows = code.match(/[^\n]*\n|[^\n]+/gu) ?? [];
  const marked = readHighlight(excerpt.highlight ?? [], `${path}.highlight`, rows.length);
  const tied = readTies(excerpt.ties ?? [], `${path}.ties`, rows.length);
  const commented = readComments(excerpt.comments ?? [], `${path}.comments`, rows.length);
  // colour first and selection second, so a picked keyword reads as a keyword
  // that is picked rather than the other way round
  const spans = [
    ...tokens,
    ...placed.map((one) => ({
      start: one.start,
      end: one.end,
      className: "code-pick",
    })),
  ];
  const after = new Map(
    placed.map((one) => [
      one.end,
      `<sup class="code-pick-mark">${String(one.number)}</sup>`,
    ]),
  );
  let at = 0;

  return rows
    .map((row, index) => {
      const number = index + 1;
      const line = row.replace(/\n$/u, "");
      const start = at;
      at += row.length;
      const key = tied.get(number);
      const text = drawRun(code, spans, start, start + line.length, after);
      const drawn = marked.has(number) ? `<mark>${text}</mark>` : text;
      const classes = `code-line${marked.has(number) ? " is-marked" : ""}`;
      // the break lives inside the span rather than between two of them, so a
      // copied excerpt still carries its line breaks and no stray text node
      // sits between the line boxes; the last row carries one only where the
      // author wrote one, which is what the unmarked path emits too
      const own = `<span class="${classes}"${key ? syncAttribute("tie", key) : ""}>${drawn}${row.slice(line.length)}</span>`;

      return `${own}${(commented.get(number) ?? []).join("")}`;
    })
    .join("");
}
