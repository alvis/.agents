import { escapeHtml } from "../escape.ts";
import { renderInline } from "../inline.ts";
import { syncAttribute, termKey } from "../sync.ts";
import {
  requireFilledArray,
  requireObject,
  requireString,
} from "../validate.ts";

import type { Block, Definition } from "../types.ts";

/**
 * draws a list of term-and-detail pairs as a description list
 * @param entries the pairs, in the order the author gave them
 * @param path JSON path of `entries`, named verbatim by any refusal
 * @param variant class distinguishing an FAQ from a glossary
 * @param tied whether each term is tied to the runs that name it
 * @returns the pairs as HTML
 */
function renderDefinitions(
  entries: Definition[],
  path: string,
  variant: string,
  tied = false,
): string {
  const pairs = requireFilledArray<Definition>(entries, path)
    .map((entry, index) => {
      const at = `${path}[${index}]`;
      requireObject<Definition>(entry, at);
      const term = escapeHtml(requireString(entry.term, `${at}.term`));
      // the detail is rich, not plain: an answer that cannot carry a
      // provenance pill or a source ref is an answer the reader has to take
      // on trust, which is the thing this board exists not to ask for
      const tie = tied ? syncAttribute("term", termKey(entry.term as string)) : "";

      return `<dt${tie}>${term}</dt><dd>${renderInline(entry.detail, `${at}.detail`)}</dd>`;
    })
    .join("");
  return `<dl class="${variant}">${pairs}</dl>`;
}

/**
 * draws anticipated reviewer questions and their answers
 * @param block the faq block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the questions as HTML
 */
export function renderFaq(
  block: Extract<Block, { type: "faq" }>,
  path: string,
): string {
  return renderDefinitions(block.items, `${path}.items`, "faq");
}

/**
 * draws the terms the board defines rather than assumes
 * @param block the glossary block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the glossary as HTML
 */
export function renderGlossary(
  block: Extract<Block, { type: "glossary" }>,
  path: string,
): string {
  // a glossary entry lights whenever a sentence names it, and vice versa;
  // an FAQ answer is not a term and has nothing to be tied to
  return renderDefinitions(block.entries, `${path}.entries`, "glossary", true);
}
