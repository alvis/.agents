import { RenderError } from "../error.ts";
import { escapeHtml } from "../escape.ts";
import {
  optionalString,
  requireFilledArray,
  requireObject,
  requireString,
} from "../validate.ts";

import type { Block, Meter, Person } from "../types.ts";

/**
 * reads a whole number within a range, refusing anything that is not one
 * @param value the candidate
 * @param path JSON path of `value`, named verbatim by any refusal
 * @param limit the largest acceptable value
 * @returns the number
 */
function requireCount(value: unknown, path: string, limit: number): number {
  if (typeof value !== "number" || !Number.isInteger(value))
    throw new RenderError(
      `${path}: required a whole number, received ${JSON.stringify(value)}`,
    );
  // a reading outside its own scale is not a rounding problem, it is a wrong
  // number: 6/5 drawn as a full bar would quietly report a perfect score
  if (value < 0 || value > limit)
    throw new RenderError(
      `${path}: required a number between 0 and ${limit}, received ${value}`,
    );
  return value;
}

/**
 * draws labelled `n of m` readings as bars that also state their numbers
 * @param block the readiness block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the readings as HTML
 */
export function renderReadiness(
  block: Extract<Block, { type: "readiness" }>,
  path: string,
): string {
  const rows = requireFilledArray<Meter>(block.items, `${path}.items`)
    .map((item, index) => {
      const at = `${path}.items[${index}]`;
      requireObject<Meter>(item, at);
      const label = escapeHtml(requireString(item.label, `${at}.label`));
      const of = requireCount(item.of, `${at}.of`, Number.MAX_SAFE_INTEGER);
      if (of < 1)
        throw new RenderError(`${at}.of: required at least 1, received ${of}`);
      const value = requireCount(item.value, `${at}.value`, of);
      const note = optionalString(item.note, `${at}.note`);
      // the number is text beside the bar, not a title on it: a bar alone
      // reports a ratio nobody can read back, and a tooltip reaches neither
      // touch nor a screen reader
      return `<li class="meter-row"><span class="meter-label">${label}</span><span class="meter" role="img" aria-label="${value} of ${of}"><i style="--fill:${Math.round((value / of) * 100)}%"></i></span><span class="meter-value">${value}/${of}</span>${note ? `<span class="meter-note">${escapeHtml(note)}</span>` : ""}</li>`;
    })
    .join("");
  return `<ul class="readiness">${rows}</ul>`;
}

/**
 * derives a chip's glyph from a name when the author gave none
 * @param name the person or team
 * @returns up to two initials, uppercased
 */
function initialsOf(name: string): string {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * draws who each piece of work is routed to
 * @param block the owners block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the chips as HTML
 */
export function renderOwners(
  block: Extract<Block, { type: "owners" }>,
  path: string,
): string {
  const chips = requireFilledArray<Person>(block.people, `${path}.people`)
    .map((person, index) => {
      const at = `${path}.people[${index}]`;
      requireObject<Person>(person, at);
      const name = requireString(person.name, `${at}.name`);
      const initials =
        optionalString(person.initials, `${at}.initials`) ?? initialsOf(name);
      const role = optionalString(person.role, `${at}.role`);
      const due = optionalString(person.due, `${at}.due`);
      // the glyph is aria-hidden because the name follows it in full: read
      // aloud, "R S Rina S." is the same person announced twice
      const tail = [role, due ? `due ${due}` : ""].filter(Boolean).join(" · ");
      return `<li class="owner-chip"><span class="owner-initials" aria-hidden="true">${escapeHtml(initials)}</span><span class="owner-name">${escapeHtml(name)}</span>${tail ? `<span class="owner-meta">${escapeHtml(tail)}</span>` : ""}</li>`;
    })
    .join("");
  return `<ul class="owners">${chips}</ul>`;
}
