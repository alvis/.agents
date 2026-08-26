import { escapeHtml } from "../escape.ts";
import {
  requireFilledArray,
  requireObject,
  requireString,
} from "../validate.ts";

import type { Metric } from "../types.ts";

/**
 * draws a metric strip as a description list, one term-value pair per metric
 * @param items the metrics to draw, at least one
 * @param path JSON path of `items`, named verbatim by any refusal
 * @returns the strip as HTML
 */
export function renderMetrics(items: Metric[], path: string): string {
  return `<dl class="metrics">${requireFilledArray<Metric>(items, path)
    .map((item, index) => {
      const at = `${path}[${index}]`;
      requireObject<Metric>(item, at);
      return `<div class="metric"><dt>${escapeHtml(requireString(item.label, `${at}.label`))}</dt><dd>${escapeHtml(requireString(item.value, `${at}.value`))}</dd></div>`;
    })
    .join("")}</dl>`;
}
