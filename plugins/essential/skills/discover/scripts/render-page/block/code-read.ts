import { escapeHtml } from "../escape.ts";
import { RenderError } from "../error.ts";
import { renderInline } from "../inline.ts";
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

import type { Span } from "../span.ts";
import type { CodeComment, CodeTie, TokenSpan } from "../types.ts";

/** the severities a reviewer note may carry. */
const SEVERITIES = Object.keys(
  RISK_SEVERITY_LABEL,
) as (keyof typeof RISK_SEVERITY_LABEL)[];

/** the shape a grammar's name has to have before it can become a class. */
const TOKEN_KIND = /^[a-z][a-z0-9-]*$/;

/**
 * reads which lines each tie covers, keyed by line
 * @param ties the author-supplied ties
 * @param path JSON path of `ties`, named verbatim by any refusal
 * @param lines how many lines the excerpt has
 * @returns each line's tie key, by 1-based line number
 */
export function readTies(
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
export function readComments(
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
export function readHighlight(
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
 * reads the colour ranges the CLI layer measured, refusing any it did not.
 *
 * these are builder output rather than author input, so validating them looks
 * redundant — until a data file writes the field itself. A kind reaches the
 * page as a class name, so it is checked against a grammar rather than escaped:
 * the closed shape is what stops the field being a way to write a selector, and
 * an offset outside the excerpt would silently draw the colour somewhere else.
 * @param tokens the measured ranges
 * @param path JSON path of `tokens`, named verbatim by any refusal
 * @param length how many characters the excerpt has
 * @returns the ranges as spans, ready to cut
 */
export function readTokens(
  tokens: unknown,
  path: string,
  length: number,
): Span[] {
  return requireArray<TokenSpan>(tokens, path).map((token, index) => {
    const at = `${path}[${index}]`;
    requireObject<TokenSpan>(token, at);
    const kind = requireString(token.kind, `${at}.kind`);
    if (!TOKEN_KIND.test(kind))
      throw new RenderError(
        `${at}.kind: ${JSON.stringify(kind)} is not a lowercase dashed word, so it cannot name a colour`,
      );
    const { start, end } = token;
    if (!Number.isInteger(start) || (start as number) < 0)
      throw new RenderError(
        `${at}.start: required an offset of 0 or more, received ${JSON.stringify(start)}`,
      );
    if (!Number.isInteger(end) || (end as number) <= (start as number))
      throw new RenderError(
        `${at}.end: required an offset past ${String(start)}, received ${JSON.stringify(end)}`,
      );
    if ((end as number) > length)
      throw new RenderError(
        `${at}.end: ${String(end)} is past the end of a ${String(length)}-character excerpt`,
      );

    return { start: start as number, end: end as number, className: `t-${kind}` };
  });
}
