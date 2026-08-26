import { escapeHtml } from "../escape.ts";
import { renderInline } from "../inline.ts";
import {
  optionalString,
  requireFilledArray,
  requireObject,
  requireOneOf,
  requireString,
} from "../validate.ts";
import { RISK_SEVERITY_LABEL } from "../vocabulary.ts";

import type { Block, Risk } from "../types.ts";

/** the ratings a risk may carry, most severe first. */
const SEVERITIES = Object.keys(
  RISK_SEVERITY_LABEL,
) as (keyof typeof RISK_SEVERITY_LABEL)[];

/**
 * draws risks as a severity, likelihood and mitigation table
 * @param block the risk-matrix block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the matrix as HTML
 */
export function renderRiskMatrix(
  block: Extract<Block, { type: "risk-matrix" }>,
  path: string,
): string {
  const caption = optionalString(block.caption, `${path}.caption`);
  const rows = requireFilledArray<Risk>(block.rows, `${path}.rows`)
    .map((row, index) => {
      const at = `${path}.rows[${index}]`;
      requireObject<Risk>(row, at);
      const severity = requireOneOf(row.severity, SEVERITIES, `${at}.severity`);
      // the rating is the pill's own text, so the row still reports how bad it
      // is under greyscale, and a copied row carries the word with it
      return `<tr><td>${renderInline(row.risk, `${at}.risk`)}</td><td><span class="severity-pill" data-severity="${severity}">${RISK_SEVERITY_LABEL[severity]}</span></td><td>${escapeHtml(requireString(row.likelihood, `${at}.likelihood`))}</td><td>${renderInline(row.mitigation, `${at}.mitigation`)}</td></tr>`;
    })
    .join("");
  // the caption states that these are assessments rather than measured rates.
  // <caption> rather than a paragraph, so it is announced with the table
  return `<div class="table-wrap"><table class="risk-matrix">${caption ? `<caption>${escapeHtml(caption)}</caption>` : ""}<thead><tr><th scope="col">Risk</th><th scope="col">Severity</th><th scope="col">Likelihood</th><th scope="col">Mitigation</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
