import { RenderError } from "../error.ts";
import { escapeHtml } from "../escape.ts";
import { slugOf } from "../id.ts";
import {
  optionalString,
  requireArray,
  requireFilledArray,
  requireObject,
  requireString,
} from "../validate.ts";
import { walkBlocks } from "../walk.ts";

import type { Block, Variant, VariantsBlock } from "../types.ts";

/**
 * the block types a track made for prose would make scroll.
 *
 * code and tables are as wide as their longest line, and every figure is drawn
 * at its natural size and never scaled to fit, so a panel holding one needs the
 * wide track or its reader scrolls sideways inside a column of text.
 */
const WIDE = new Set([
  "code",
  "codepair",
  "diff",
  "table",
  "diagram",
  "mermaid",
  "svg",
  "image",
  "embed",
]);

/**
 * reads the alternatives, refusing a list that is not a comparison
 * @param value the author-supplied items
 * @param path JSON path of `value`, named verbatim by any refusal
 * @returns the items, each with a label and blocks that could be drawn
 */
function readItems(value: unknown, path: string): Variant[] {
  const items = requireArray<Variant>(value, path);
  // one alternative is a section with a heading, and drawing it as a grid of
  // one would say "compare these" about nothing
  if (items.length < 2)
    throw new RenderError(
      `${path}: required at least two variants, received ${items.length}`,
    );

  return items.map((entry, index) => {
    const at = `${path}[${index}]`;
    const item = requireObject<Variant>(entry, at);

    return {
      label: requireString(item.label, `${at}.label`),
      blocks: requireFilledArray<Block>(item.blocks, `${at}.blocks`),
    };
  });
}

/**
 * refuses a variants block held, at any depth, by another
 * @param items the outer block's items, already read
 * @param path JSON path of the outer block's `items`
 */
function refuseNesting(items: Variant[], path: string): void {
  for (const [index, item] of items.entries()) {
    const inner = walkBlocks(item.blocks, `${path}[${index}].blocks`).find(
      ({ block }) => block?.type === "variants",
    );
    // a track holds one grid: a second inside it would size itself against a
    // column already divided, and no width the reader has would fit both
    if (inner)
      throw new RenderError(
        `${inner.path}.type: required a block other than "variants", received "variants" inside the variants block at ${path.replace(/\.items$/, "")}`,
      );
  }
}

/**
 * chooses the track the panels are laid out in, from what they hold
 * @param items the alternatives
 * @param path JSON path of `items`
 * @returns `wide` when any panel holds something that is drawn wide, else `prose`
 */
function densityOf(items: Variant[], path: string): "wide" | "prose" {
  const wide = items.some((item, index) =>
    walkBlocks(item.blocks, `${path}[${index}].blocks`).some(({ block }) =>
      WIDE.has(block?.type),
    ),
  );

  return wide ? "wide" : "prose";
}

/**
 * draws alternatives side by side, each a panel of whole blocks.
 *
 * the held blocks are drawn by the caller rather than by an import, for the
 * reason `renderDisclosure` gives: the dispatcher already draws every block
 * type, and importing it back here would put the two in a cycle.
 * @param block the variants block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @param draw how a held block is drawn
 * @returns the comparison as HTML
 */
export function renderVariants(
  block: VariantsBlock,
  path: string,
  draw: (block: Block, path: string) => string,
): string {
  const title = optionalString(block.title, `${path}.title`);
  const items = readItems(block.items, `${path}.items`);
  refuseNesting(items, `${path}.items`);

  const slug = slugOf(path, "variants");
  const panels = items
    .map((item, index) => {
      const id = `${slug}-${index}`;
      const inner = item.blocks
        .map((held, position) =>
          draw(held, `${path}.items[${index}].blocks[${position}]`),
        )
        .join("");

      return `<div class="variant" role="group" aria-labelledby="${id}"><h4 class="variant-label" id="${id}">${escapeHtml(item.label)}</h4>${inner}</div>`;
    })
    .join("");

  return `<div class="variants">${title === undefined ? "" : `<h3 class="variants-title">${escapeHtml(title)}</h3>`}<div class="variants-grid" data-grid-density="${densityOf(items, `${path}.items`)}">${panels}</div></div>`;
}
