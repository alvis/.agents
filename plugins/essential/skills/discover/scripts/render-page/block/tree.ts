import { escapeHtml } from "../escape.ts";
import {
  optionalString,
  requireFilledArray,
  requireObject,
  requireString,
} from "../validate.ts";

import type { Block, TreeItem } from "../types.ts";

/** the four rules a listing is drawn from, named so the intent survives. */
const RULE = {
  /** an entry with siblings still to come */
  branch: "├── ",
  /** the last entry at its level */
  last: "└── ",
  /** the trunk continuing past a nested block */
  trunk: "│   ",
  /** the gap where a trunk has ended */
  clear: "    ",
} as const;

/** one drawn line, kept apart from its note so the notes can be aligned. */
interface Line {
  /** the rules and the name, exactly as they will be drawn */
  drawn: string;
  /** what the entry is for, if the author said */
  note?: string;
}

/**
 * walks the listing depth first, drawing the rules as it descends.
 *
 * the prefix is passed down rather than rebuilt, because whether a trunk
 * continues past a nested block is a fact about the ancestor, not the child:
 * only the parent knows whether it had siblings left.
 * @param items the entries at this level
 * @param path JSON path of `items`, named verbatim by any refusal
 * @param prefix the rules already drawn to the left of this level
 * @returns the lines for this level and everything beneath it
 */
function walk(items: TreeItem[], path: string, prefix: string): Line[] {
  return requireFilledArray<TreeItem>(items, path).flatMap((item, index) => {
    const at = `${path}[${index}]`;
    requireObject<TreeItem>(item, at);
    const name = requireString(item.name, `${at}.name`);
    const note = optionalString(item.note, `${at}.note`);
    const last = index === items.length - 1;
    const line: Line = { drawn: `${prefix}${last ? RULE.last : RULE.branch}${name}`, note };
    const children = item.children;
    return children === undefined
      ? [line]
      : [
          line,
          ...walk(children, `${at}.children`, `${prefix}${last ? RULE.clear : RULE.trunk}`),
        ];
  });
}

/**
 * draws a directory listing in box-drawing characters.
 *
 * text rather than a picture: it copies into a reply intact, reads in order,
 * scales with the reader's font, and adds nothing to the page's weight.
 * @param block the tree block as the author wrote it
 * @param path JSON path of the block, named verbatim by every refusal
 * @returns the listing's HTML
 */
export function renderTree(block: Extract<Block, { type: "tree" }>, path: string): string {
  const title = optionalString(block.title, `${path}.title`);
  const root = requireString(block.root, `${path}.root`);
  const lines = [
    { drawn: root } as Line,
    ...walk(block.items, `${path}.items`, ""),
  ];
  // notes line up in a column, so the shape of the tree stays readable down
  // the left edge instead of being broken up by prose of varying length
  const column = Math.max(...lines.map((line) => [...line.drawn].length)) + 2;
  const drawn = lines
    .map(({ drawn, note }) => {
      const text = escapeHtml(drawn);
      if (!note) return text;
      const pad = " ".repeat(Math.max(column - [...drawn].length, 1));
      return `${text}${pad}<span class="tree-note">${escapeHtml(note)}</span>`;
    })
    .join("\n");
  return `<figure class="tree-figure">${title ? `<figcaption class="tree-title">${escapeHtml(title)}</figcaption>` : ""}<pre class="tree">${drawn}</pre></figure>`;
}
