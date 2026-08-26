import { escapeHtml } from "../escape.ts";
import { renderInline } from "../inline.ts";
import { syncAttribute } from "../sync.ts";
import {
  optionalString,
  requireArray,
  requireFilledArray,
  requireLine,
  requireObject,
  requireOneOf,
  requireString,
} from "../validate.ts";
import { RISK_SEVERITY_LABEL } from "../vocabulary.ts";

import type { Block, CodeComment, CodeTie } from "../types.ts";

/** the severities a reviewer note may carry. */
const SEVERITIES = Object.keys(RISK_SEVERITY_LABEL) as (keyof typeof RISK_SEVERITY_LABEL)[];

/**
 * reads which lines each tie covers, keyed by line
 * @param ties the author-supplied ties
 * @param path JSON path of `ties`, named verbatim by any refusal
 * @param lines how many lines the excerpt has
 * @returns each line's tie key, by 1-based line number
 */
function readTies(
  ties: unknown,
  path: string,
  lines: number,
): Map<number, string> {
  const keyed = new Map<number, string>();
  for (const [index, tie] of requireArray<CodeTie>(ties, path).entries()) {
    const at = `${path}[${index}]`;
    requireObject<CodeTie>(tie, at);
    const key = requireString(tie.key, `${at}.key`);
    for (const [which, line] of requireFilledArray<unknown>(
      tie.lines,
      `${at}.lines`,
    ).entries())
      keyed.set(requireLine(line, `${at}.lines[${which}]`, lines), key);
  }

  return keyed;
}

/**
 * reads the reviewer notes anchored to a line, keyed by the line they follow
 * @param comments the author-supplied notes
 * @param path JSON path of `comments`, named verbatim by any refusal
 * @param lines how many lines the excerpt has
 * @returns each line's notes as HTML, by 1-based line number
 */
function readComments(
  comments: unknown,
  path: string,
  lines: number,
): Map<number, string[]> {
  const keyed = new Map<number, string[]>();
  for (const [index, comment] of requireArray<CodeComment>(
    comments,
    path,
  ).entries()) {
    const at = `${path}[${index}]`;
    requireObject<CodeComment>(comment, at);
    const line = requireLine(comment.line, `${at}.line`, lines);
    const severity = comment.severity
      ? requireOneOf(comment.severity, SEVERITIES, `${at}.severity`)
      : undefined;
    const where = optionalString(comment.at, `${at}.at`);
    const head = [
      severity
        ? `<span class="diff-severity" data-severity="${severity}">${RISK_SEVERITY_LABEL[severity]}</span>`
        : "",
      where ? `<span class="diff-where">${escapeHtml(where)}</span>` : "",
    ].join("");

    keyed.set(line, [
      ...(keyed.get(line) ?? []),
      `<span class="diff-comment">${head ? `<span class="diff-comment-head">${head}</span>` : ""}<span class="diff-comment-body">${renderInline(comment.text, `${at}.text`)}</span></span>`,
    ]);
  }

  return keyed;
}

/**
 * reads which lines the author is drawing the eye to
 * @param highlight the author-supplied line numbers
 * @param path JSON path of `highlight`, named verbatim by any refusal
 * @param lines how many lines the excerpt has
 * @returns the marked lines, by 1-based line number
 */
function readHighlight(
  highlight: unknown,
  path: string,
  lines: number,
): Set<number> {
  return new Set(
    requireArray<unknown>(highlight, path).map((line, index) =>
      requireLine(line, `${path}[${index}]`, lines),
    ),
  );
}

/**
 * draws a source excerpt, held verbatim and escaped like any other text
 * @param block the code block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the excerpt as HTML
 */
export function renderCode(
  block: Extract<Block, { type: "code" }>,
  path: string,
): string {
  const code = requireString(block.code, `${path}.code`);
  const language = optionalString(block.language, `${path}.language`);
  const caption = optionalString(block.caption, `${path}.caption`);
  const opening = `<pre class="code"${language ? ` data-language="${escapeHtml(language)}"` : ""}><code>`;
  const annotated =
    block.highlight !== undefined ||
    block.ties !== undefined ||
    block.comments !== undefined;

  // no highlighter and no token spans: the excerpt is one escaped string, so
  // there is no path by which a data file can put an element on the page. An
  // unannotated excerpt stays exactly that one string, so adding the feature
  // did not change a single byte of the boards that do not use it
  const inner = annotated
    ? drawLines(block, code, path)
    : escapeHtml(code);
  const body = `${opening}${inner}</code></pre>`;
  if (!caption) return body;

  // a figure, so the caption is associated with the excerpt rather than
  // floating above it as a paragraph that happens to sit nearby
  return `<figure class="code-figure">${body}<figcaption>${escapeHtml(caption)}</figcaption></figure>`;
}

/**
 * draws an excerpt line by line, so a line can be marked, tied, or commented on
 * @param block the code block
 * @param code the excerpt text
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the lines as HTML, newlines preserved
 */
function drawLines(
  block: Extract<Block, { type: "code" }>,
  code: string,
  path: string,
): string {
  const lines = code.split("\n");
  const marked = readHighlight(block.highlight ?? [], `${path}.highlight`, lines.length);
  const tied = readTies(block.ties ?? [], `${path}.ties`, lines.length);
  const commented = readComments(block.comments ?? [], `${path}.comments`, lines.length);

  return lines
    .map((line, index) => {
      const number = index + 1;
      const key = tied.get(number);
      const text = escapeHtml(line);
      const drawn = marked.has(number) ? `<mark>${text}</mark>` : text;
      const classes = `code-line${marked.has(number) ? " is-marked" : ""}`;
      // the newline lives inside the span, so a marked line's background does
      // not stretch to the width of the widest line below it
      const own = `<span class="${classes}"${key ? syncAttribute("tie", key) : ""}>${drawn}\n</span>`;

      return `${own}${(commented.get(number) ?? []).join("")}`;
    })
    .join("");
}
