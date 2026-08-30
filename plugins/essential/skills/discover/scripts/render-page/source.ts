import { escapeHtml } from "./escape.ts";
import { provenancePill } from "./provenance.ts";
import {
  optionalString,
  requireArray,
  requireOneOf,
  requireString,
} from "./validate.ts";
import { PROVENANCE } from "./vocabulary.ts";

import type { Source } from "./types.ts";

/**
 * draws the page's sources as a footer beneath the last section.
 *
 * a source's own pill comes from the same helper the inline runs and table
 * rows use, so the reply's provenance sweep accounts for the footer too — a
 * page whose only invented figure sits in its sources still says so.
 * @param sources the author-supplied sources, or `undefined` when absent
 * @param path JSON path of the value, named verbatim by any refusal
 * @returns the footer as HTML, or `""` when the page declares no sources
 */
export function renderSources(sources: unknown, path: string): string {
  if (sources === undefined) return "";
  // an empty array is a page that declared sources and then listed none: draw
  // nothing rather than a heading promising evidence that is not there
  const entries = requireArray<Source>(sources, path);
  if (entries.length === 0) return "";
  const items = entries
    .map((source, index) => {
      const at = `${path}[${index}]`;
      const label = escapeHtml(requireString(source.label, `${at}.label`));
      const ref = optionalString(source.ref, `${at}.ref`);
      const level =
        source.level === undefined
          ? undefined
          : requireOneOf(source.level, PROVENANCE, `${at}.level`);
      const cite = ref
        ? `<span class="source-id">[${escapeHtml(ref)}]</span>`
        : "";
      const pill = level ? provenancePill({ level }, "source-standing") : "";
      return `<li class="source">${label}${cite}${pill}</li>`;
    })
    .join("");
  return `<footer class="sources"><h2>Sources</h2><ol class="source-list">${items}</ol></footer>`;
}
