import { PROVENANCE } from "./vocabulary.ts";

import type { Provenance } from "./vocabulary.ts";

/** one provenance claim the page makes, as the reply reports it. */
export interface Claim {
  /** how far the author stands behind it */
  level: Provenance;
  /** what it refers to, or the empty string when nothing named it */
  subject: string;
}

/**
 * tests whether a level is one the scale names
 * @param value the level as authored
 * @returns whether it belongs to the scale
 */
function isLevel(value: unknown): value is Provenance {
  return PROVENANCE.includes(value as Provenance);
}

/**
 * reads the claim a node makes, if it makes one.
 *
 * three shapes carry provenance: an inline run, a table row, and a footer
 * source. Each is recognised by its own fields rather than by where it sits,
 * so a block type added later carries provenance the moment it holds one of
 * them — the sweep never needs teaching about a new block.
 * @param node the node to read
 * @returns the claim, or `undefined` when the node makes none
 */
function claimOf(node: Record<string, unknown>): Claim | undefined {
  // an inline run: {kind: "provenance", level, text}
  if (node.kind === "provenance" && isLevel(node.level))
    return {
      level: node.level,
      subject: typeof node.text === "string" ? node.text : "",
    };
  // a footer source: {label, level}
  if (isLevel(node.level) && typeof node.label === "string")
    return { level: node.level, subject: node.label };
  // a table row: {cells, provenance: {level, text}}
  const held = node.provenance;
  if (held !== null && typeof held === "object") {
    const { level, text } = held as Record<string, unknown>;
    if (isLevel(level))
      return { level, subject: typeof text === "string" ? text : "" };
  }

  return undefined;
}

/**
 * collects every provenance claim the page data makes, in reading order.
 *
 * the sweep runs over the data rather than the rendered markup, so the reply
 * carries the same claims whether or not the reader has JavaScript — and the
 * page never has to be parsed back out of its own HTML.
 * @param value any part of the page data
 * @returns each claim, in the order the page draws it
 */
export function collectClaims(value: unknown): Claim[] {
  if (Array.isArray(value)) return value.flatMap(collectClaims);
  if (value === null || typeof value !== "object") return [];

  const node = value as Record<string, unknown>;
  const own = claimOf(node);

  // a node that makes a claim is not descended into for that claim again: the
  // shapes above hold their level in a leaf, never in a nested claim
  return [
    ...(own ? [own] : []),
    ...Object.entries(node)
      .filter(([key]) => !(own && key === "provenance"))
      .flatMap(([, held]) => collectClaims(held)),
  ];
}

/**
 * renders the claims as a block, strongest evidence first
 * @param claims every claim the page makes
 * @returns the block, or the empty string when the page claims nothing
 */
export function formatClaims(claims: Claim[]): string {
  // the scale's own order, so a reader scanning the reply meets the measured
  // figures before the ones standing in for figures nobody has
  return PROVENANCE.flatMap((level) =>
    claims
      .filter((claim) => claim.level === level)
      .map(({ subject }) => `- ${level}: ${subject || "(unattributed)"}`),
  ).join("\n");
}

/**
 * renders the caveat an invented figure earns.
 *
 * an invented figure stands in for one nobody has yet, so a reply carrying it
 * without saying so hands the reader a number to act on. This line is what
 * keeps the copied reply from sounding more confident than the page.
 * @param claims every claim the page makes
 * @returns the caveat, or the empty string when nothing was invented
 */
export function formatCaveats(claims: Claim[]): string {
  const invented = claims.filter(({ level }) => level === "invented");
  if (invented.length === 0) return "";

  const named = invented
    .map(({ subject }) => subject || "(unattributed)")
    .join(", ");
  const count = invented.length;

  return `> Caution: ${count} figure${count === 1 ? " is" : "s are"} invented, standing in for evidence nobody has yet: ${named}.`;
}
