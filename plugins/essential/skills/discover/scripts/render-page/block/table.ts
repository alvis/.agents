import { escapeHtml } from "../escape.ts";
import { RenderError } from "../error.ts";
import { renderInline } from "../inline.ts";
import { provenancePill, readProvenance } from "../provenance.ts";
import {
  optionalString,
  requireArray,
  requireFilledArray,
  requireObject,
  requireOneOf,
  requireString,
} from "../validate.ts";
import { COLUMN_ALIGNMENTS, VERDICTS, VERDICT_LABEL } from "../vocabulary.ts";

import type { Block, Cell, Column, Row } from "../types.ts";

/**
 * reads one column heading, which may be a bare string or a shaped column
 * @param column the heading as authored
 * @param path JSON path of `column`, named verbatim by any refusal
 * @returns the column's label, width and alignment
 */
function readColumn(column: string | Column, path: string): Column {
  // a bare string stays valid and means a column with no width or alignment
  // of its own, so the common case costs an author nothing
  if (typeof column === "string") return { label: requireString(column, path) };
  // both shapes are accepted here, so a refusal that names only one of them
  // sends the author to fix the wrong thing
  if (column === null || typeof column !== "object" || Array.isArray(column))
    throw new RenderError(
      `${path}: required a non-empty string or a column object, received ${JSON.stringify(column)}`,
    );
  return {
    label: requireString(column.label, `${path}.label`),
    width: optionalString(column.width, `${path}.width`),
    align:
      column.align === undefined
        ? undefined
        : requireOneOf(column.align, COLUMN_ALIGNMENTS, `${path}.align`),
  };
}

/**
 * reads one row, which may be a bare cell array or a row carrying provenance
 * @param row the row as authored
 * @param path JSON path of `row`, named verbatim by any refusal
 * @returns the row's cells and its provenance claim, if it makes one
 */
function readRow(row: Cell[] | Row, path: string): Row {
  // a bare array stays valid and means a row making no provenance claim, so
  // a table written before row provenance existed costs its author nothing
  if (Array.isArray(row)) return { cells: requireArray<Cell>(row, path) };
  // both shapes are accepted here, so a refusal naming only one of them sends
  // the author to fix the wrong thing
  if (row === null || typeof row !== "object")
    throw new RenderError(
      `${path}: required an array of cells or a row object, received ${JSON.stringify(row)}`,
    );
  return {
    cells: requireArray<Cell>(row.cells, `${path}.cells`),
    provenance:
      row.provenance === undefined
        ? undefined
        : readProvenance(row.provenance, `${path}.provenance`),
  };
}

/**
 * draws a comparison table, refusing any row whose width misses the header
 * @param block the table block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the table as HTML, wrapped for horizontal overflow
 */
export function renderTable(
  block: Extract<Block, { type: "table" }>,
  path: string,
): string {
  const columns = requireFilledArray<string | Column>(
    block.columns,
    `${path}.columns`,
  ).map((column, index) => readColumn(column, `${path}.columns[${index}]`));
  // width and alignment ride a <colgroup> rather than per-cell styles, so one
  // declaration covers every row and a wide evidence column stays wide as the
  // table grows. An alignment set here cascades to the cells below it
  const group = columns.some(({ width, align }) => width ?? align)
    ? `<colgroup>${columns
        .map(({ width, align }) => {
          const rules = [
            width ? `width:${width}` : "",
            align ? `text-align:${align}` : "",
          ]
            .filter(Boolean)
            .join(";");
          return rules ? `<col style="${escapeHtml(rules)}">` : "<col>";
        })
        .join("")}</colgroup>`
    : "";
  const head = columns
    .map(({ label }) => `<th scope="col">${escapeHtml(label)}</th>`)
    .join("");
  const body = requireArray<Cell[] | Row>(block.rows, `${path}.rows`)
    .map((row, r) => {
      const { cells, provenance } = readRow(row, `${path}.rows[${r}]`);
      // a ragged row misaligns every cell after it, silently and invisibly
      if (cells.length !== columns.length)
        throw new RenderError(
          `${path}.rows[${r}]: required ${columns.length} cells to match columns, received ${cells.length}`,
        );
      // the pill rides the last cell rather than a column of its own, so a
      // row that makes a provenance claim stays as wide as one that does not
      const last = cells.length - 1;
      return `<tr${provenance ? ` data-row-provenance="${provenance.level}"` : ""}>${cells
        .map((cell, c) => {
          const at = `${path}.rows[${r}][${c}]`;
          requireObject<Cell>(cell, at);
          const pill =
            provenance && c === last
              ? provenancePill(provenance, "row-provenance")
              : "";
          const text = `${renderInline(cell.text, `${at}.text`)}${pill}`;
          if (cell.verdict === undefined) return `<td>${text}</td>`;
          // an unrecognised verdict draws neither glyph nor sr-only label, so
          // it degrades SC-6 to colour alone; refuse it rather than emit it
          const verdict = requireOneOf(cell.verdict, VERDICTS, `${at}.verdict`);
          return `<td data-verdict="${verdict}"><span class="sr-only">${VERDICT_LABEL[verdict]}: </span>${text}</td>`;
        })
        .join("")}</tr>`;
    })
    .join("");
  return `<div class="table-wrap"><table>${group}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
