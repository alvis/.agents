import { RenderError } from "../error.ts";
import { escapeHtml } from "../escape.ts";
import { renderInline } from "../inline.ts";
import {
  optionalString,
  requireArray,
  requireFilledArray,
  requireObject,
  requireOneOf,
  requireString,
} from "../validate.ts";
import { LEDGER_TONES } from "../vocabulary.ts";

import type {
  Block,
  LedgerEntry,
  LedgerFact,
  LedgerGroup,
  LedgerProgress,
} from "../types.ts";

/**
 * reads one side of a progress reading
 * @param value the candidate
 * @param path JSON path of `value`, named verbatim by any refusal
 * @returns the count
 */
function requireCount(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
    throw new RenderError(
      `${path}: required a count, received ${JSON.stringify(value)}`,
    );

  return value;
}

/**
 * draws the named facts a group or a row opens for.
 *
 * a definition list, because that is what these are: a reader looking for the
 * owner of a row finds it by its name, and a list of sentences would make them
 * read all of it to find out whether the field is there at all.
 * @param facts the facts
 * @param path JSON path of `facts`, named verbatim by any refusal
 * @returns the list as HTML, or nothing where there are no facts to draw
 */
function renderFacts(facts: unknown, path: string): string {
  const rows = requireArray<LedgerFact>(facts, path)
    .map((fact, index) => {
      const at = `${path}[${index}]`;
      requireObject<LedgerFact>(fact, at);
      const label = escapeHtml(requireString(fact.label, `${at}.label`));

      return `<div class="ledger-fact"><dt>${label}</dt><dd>${renderInline(fact.value, `${at}.value`)}</dd></div>`;
    })
    .join("");

  return rows ? `<dl class="ledger-facts">${rows}</dl>` : "";
}

/**
 * draws how far a group has run, as a bar that also states its numbers
 * @param progress the reading, where the group carries one
 * @param path JSON path of `progress`, named verbatim by any refusal
 * @returns the bar as HTML, or nothing where nothing was measured
 */
function renderProgress(progress: unknown, path: string): string {
  if (progress === undefined) return "";
  requireObject<LedgerProgress>(progress, path);
  const of = requireCount((progress as LedgerProgress).of, `${path}.of`);
  const done = requireCount((progress as LedgerProgress).done, `${path}.done`);
  // more done than there are is not a rounding problem, it is a wrong number,
  // and drawn as a full bar it would report a group that had finished
  if (done > of)
    throw new RenderError(
      `${path}: ${done} done out of ${of} is more than all of them`,
    );
  const fill = of === 0 ? 0 : Math.round((done / of) * 100);

  return `<span class="meter ledger-meter" role="img" aria-label="${done} of ${of} done"><i style="--fill:${fill}%"></i></span><span class="ledger-count">${done}/${of}</span>`;
}

/**
 * draws the twisty a disclosure in this block opens by.
 *
 * a real span rather than a marker or generated content: a summary laid out in
 * columns stops rendering the native marker, and the affordance would have
 * vanished exactly where the row gained something worth opening. The glyph is
 * hidden from assistive technology, which is already told this is a disclosure
 * and told whether it is open.
 * @param glyph the mark to draw, empty where a row does not open
 * @returns the twisty as HTML
 */
function twist(glyph: string): string {
  return `<span class="ledger-twist" aria-hidden="true">${glyph}</span>`;
}

/**
 * draws one row, which opens for everything the record holds about it.
 *
 * a row with no facts behind it is drawn flat rather than as a disclosure that
 * opens onto nothing: a twisty is a promise of detail, and one that has none
 * to give teaches a reader to stop opening the rows that do.
 * @param entry the row
 * @param path JSON path of `entry`, named verbatim by any refusal
 * @returns the row as HTML
 */
function renderEntry(entry: LedgerEntry, path: string): string {
  requireObject<LedgerEntry>(entry, path);
  const code = escapeHtml(requireString(entry.code, `${path}.code`));
  const status = escapeHtml(requireString(entry.status, `${path}.status`));
  const tone =
    entry.tone === undefined
      ? "neutral"
      : requireOneOf(entry.tone, [...LEDGER_TONES], `${path}.tone`);
  const line = [
    `<span class="ledger-code">${code}</span>`,
    `<span class="ledger-what">${renderInline(entry.title, `${path}.title`)}</span>`,
    `<span class="ledger-status">${status}</span>`,
  ].join("");
  const facts = renderFacts(entry.facts, `${path}.facts`);

  return `<li class="ledger-entry" data-tone="${tone}">${
    facts
      ? `<details class="ledger-row"><summary>${twist("\u25b8")}${line}</summary><div class="ledger-detail">${facts}</div></details>`
      : `<div class="ledger-row is-flat">${twist("")}${line}</div>`
  }</li>`;
}

/**
 * draws one group and the rows under it.
 *
 * open by default, because a board of closed groups answers nothing until it
 * is clicked; the rows are what close, and opening one is how a reader asks
 * for the rest of a record rather than for another page.
 * @param group the group
 * @param path JSON path of `group`, named verbatim by any refusal
 * @returns the group as HTML
 */
function renderGroup(group: LedgerGroup, path: string): string {
  requireObject<LedgerGroup>(group, path);
  const label = escapeHtml(requireString(group.label, `${path}.label`));
  const note =
    group.note === undefined
      ? ""
      : `<span class="ledger-group-note">${renderInline(group.note, `${path}.note`)}</span>`;
  const entries = requireArray<LedgerEntry>(group.entries, `${path}.entries`)
    .map((entry, index) => renderEntry(entry, `${path}.entries[${index}]`))
    .join("");
  const empty = optionalString(group.empty, `${path}.empty`);

  return [
    `<details class="ledger-group" open>`,
    `<summary>${twist("\u25b8")}<span class="ledger-group-name">${label}</span>${note}${renderProgress(group.progress, `${path}.progress`)}</summary>`,
    `<div class="ledger-group-body">`,
    renderFacts(group.facts, `${path}.facts`),
    entries
      ? `<ul class="ledger-entries">${entries}</ul>`
      : `<p class="ledger-empty">${escapeHtml(empty ?? "nothing recorded")}</p>`,
    `</div>`,
    `</details>`,
  ].join("");
}

/**
 * draws grouped rows that each open for the whole of their record
 * @param block the ledger block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the ledger as HTML
 */
export function renderLedger(
  block: Extract<Block, { type: "ledger" }>,
  path: string,
): string {
  const groups = requireFilledArray<LedgerGroup>(block.groups, `${path}.groups`)
    .map((group, index) => renderGroup(group, `${path}.groups[${index}]`))
    .join("");

  return `<div class="ledger">${groups}</div>`;
}
