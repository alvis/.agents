import { renderBlock } from "./block.ts";
import { escapeHtml } from "./escape.ts";
import { requireFreshId } from "./id.ts";
import {
  optionalString,
  requireArray,
  requireObject,
  requireString,
} from "./validate.ts";

import type { PageContext } from "./context.ts";
import type { Block, Section } from "./types.ts";

/**
 * draws one section, numbering it and drawing every block it holds
 * @param section the section to draw
 * @param index the section's zero-based position, which sets its number
 * @param page what the section is rendered into: claimed ids, and the files
 *   the CLI layer already read
 * @returns the section as HTML
 */
export function renderSection(section: Section, index: number, page: PageContext): string {
  const at = `sections[${index}]`;
  requireObject<Section>(section, at);
  const number = String(index + 1).padStart(2, "0");
  const id = requireFreshId(section.id, at, "section", page.ids);
  const eyebrow = optionalString(section.eyebrow, `${at}.eyebrow`);
  const label = escapeHtml(requireString(section.label, `${at}.label`));
  const body = requireArray<Block>(section.blocks, `${at}.blocks`)
    .map((block, position) =>
      renderBlock(block, `${at}.blocks[${position}]`, page),
    )
    .join("");

  return `<section class="section" id="s-${escapeHtml(id)}" data-section data-section-id="${escapeHtml(id)}" data-section-label="${label}"><div class="section-heading"><p class="section-no">${number}${eyebrow ? ` · ${escapeHtml(eyebrow)}` : ""}</p><h2>${escapeHtml(requireString(section.title, `${at}.title`))}</h2>${noteControl(label)}</div><div class="section-body">${body}</div><ul class="note-list" data-note-list aria-label="Notes on ${label}"></ul></section>`;
}

/**
 * draws the control that adds a note to a section.
 *
 * it ships in the markup rather than being built by the runtime, so a board
 * read with scripting off still shows that notes are a thing this page does,
 * and the control is in the tab order at first paint rather than after boot.
 * @param label the section's label, which names the control
 * @returns the control as HTML
 */
function noteControl(label: string): string {
  return `<button type="button" class="note-add" data-note-add title="Note this section, or the passage you have selected"><svg class="note-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.5 4.5h15v10.5h-8L7 19.5v-4.5H4.5z" /></svg><span class="note-tally" data-note-tally aria-hidden="true"></span><span class="sr-only">Add a note to ${label}</span></button>`;
}
