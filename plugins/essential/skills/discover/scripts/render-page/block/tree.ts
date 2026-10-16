import { RenderError } from "../error.ts";
import { escapeHtml } from "../escape.ts";
import { TREE_STATUSES } from "../types/content.ts";
import {
  optionalString,
  requireFilledArray,
  requireObject,
  requireOneOf,
  requireString,
} from "../validate.ts";
import { renderFilterBar } from "./finding.ts";

import type { PageContext } from "../context.ts";
import type { Block, TreeItem } from "../types.ts";

/** what a change did to an entry, as the tree's items name it. */
type TreeStatus = (typeof TREE_STATUSES)[number];

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

/**
 * the code each status is drawn with in the gutter.
 *
 * three letters and a space: wide enough that no two codes share a prefix, and
 * exactly as wide as the blank an inheriting entry leaves, so the rules and
 * names stay in one column whichever entries are marked.
 */
const CODE: Record<TreeStatus, string> = {
  new: "NEW ",
  changed: "CHG ",
  removed: "DEL ",
  moved: "MOV ",
};

/** what the gutter holds where an entry carries no status of its own. */
const BLANK = " ".repeat(CODE.new.length);

/** each status as a chip names it. */
const LABEL: Record<TreeStatus, string> = {
  new: "New",
  changed: "Changed",
  removed: "Removed",
  moved: "Moved",
};

/** one drawn line, kept apart from its note so the notes can be aligned. */
interface Line {
  /** the rules to the left of the name, exactly as they will be drawn */
  rules: string;
  /** the file or directory name */
  name: string;
  /** what the entry is for, if the author said */
  note?: string;
  /** the section the name links to, when the author named one */
  section?: string;
  /** the status the author wrote on this entry, which the gutter shows */
  status?: TreeStatus;
  /** the status the entry has, its own or its nearest ancestor's */
  effective?: TreeStatus;
}

/**
 * walks the listing depth first, drawing the rules as it descends.
 *
 * the prefix is passed down rather than rebuilt, because whether a trunk
 * continues past a nested block is a fact about the ancestor, not the child:
 * only the parent knows whether it had siblings left. The status travels down
 * the same way, for the same reason: an entry is new because its directory is.
 * @param items the entries at this level
 * @param path JSON path of `items`, named verbatim by any refusal
 * @param prefix the rules already drawn to the left of this level
 * @param inherited the status the parent has, if any
 * @param page what the tree is drawn into, which names the sections a link may reach
 * @returns the lines for this level and everything beneath it
 */
function walk(
  items: TreeItem[],
  path: string,
  prefix: string,
  inherited: TreeStatus | undefined,
  page: PageContext,
): Line[] {
  return requireFilledArray<TreeItem>(items, path).flatMap((item, index) => {
    const at = `${path}[${index}]`;
    requireObject<TreeItem>(item, at);
    const name = requireString(item.name, `${at}.name`);
    const note = optionalString(item.note, `${at}.note`);
    const status =
      item.status === undefined
        ? undefined
        : requireOneOf(item.status, TREE_STATUSES, `${at}.status`);
    const section = optionalString(item.section, `${at}.section`);
    // a link that scrolls nowhere is worse than none: it promises an
    // explanation the page does not hold
    if (section !== undefined && !page.sections.has(section))
      throw new RenderError(
        `${at}.section: no section on this page has id ${JSON.stringify(section)}, so the entry would link nowhere`,
      );
    const last = index === items.length - 1;
    const effective = status ?? inherited;
    const line: Line = {
      rules: `${prefix}${last ? RULE.last : RULE.branch}`,
      name,
      note,
      section,
      status,
      effective,
    };
    const children = item.children;
    return children === undefined
      ? [line]
      : [
          line,
          ...walk(
            children,
            `${at}.children`,
            `${prefix}${last ? RULE.clear : RULE.trunk}`,
            effective,
            page,
          ),
        ];
  });
}

/**
 * draws the gutter cell an entry opens its line with
 * @param status the status the author wrote on the entry, if any
 * @returns the cell, as wide as every other so the columns hold
 */
function gutterOf(status: TreeStatus | undefined): string {
  return status === undefined
    ? `<span class="tree-status">${BLANK}</span>`
    : `<span class="tree-status" data-status="${status}">${CODE[status]}</span>`;
}

/**
 * draws one line, padded so its note joins the column.
 * @param line the line to draw
 * @param column where the notes start, counted from the line's left edge
 * @param gutter whether the tree has a gutter, which every line then opens with
 * @returns the line as HTML, without its line break
 */
function drawLine(line: Line, column: number, gutter: boolean): string {
  const name =
    line.section === undefined
      ? escapeHtml(line.name)
      : `<a class="tree-link" href="#s-${escapeHtml(line.section)}">${escapeHtml(line.name)}</a>`;
  const drawn = `${gutter ? gutterOf(line.status) : ""}${escapeHtml(line.rules)}${name}`;
  if (!line.note) return drawn;

  return `${drawn}${" ".repeat(Math.max(column - extentOf(line, gutter), 1))}<span class="tree-note">${escapeHtml(line.note)}</span>`;
}

/**
 * counts the characters a line occupies before its note
 * @param line the line to measure
 * @param gutter whether the tree has a gutter
 * @returns the line's width in characters, the gutter included
 */
function extentOf(line: Line, gutter: boolean): number {
  return (gutter ? BLANK.length : 0) + [...`${line.rules}${line.name}`].length;
}

/**
 * draws what tells a reader how to read the gutter.
 *
 * one status needs no choosing, so it is a sentence; two or more are a bar of
 * chips over the rows, with the counts the data gives them. The count belongs
 * to the data, not to the selection, for the reason a findings bar's does.
 * @param entries every entry in the tree, root excluded
 * @param present the statuses the entries have, in the order the gutter names them
 * @returns the legend or the chip bar as HTML
 */
function renderKey(entries: Line[], present: TreeStatus[]): string {
  const count = (status: TreeStatus): number =>
    entries.filter((entry) => entry.effective === status).length;
  const [only, second] = present;
  if (only !== undefined && second === undefined) {
    const total = count(only);

    return `<p class="tree-legend">${CODE[only].trim()} marks ${String(total)} ${only} ${total === 1 ? "entry" : "entries"}</p>`;
  }

  return renderFilterBar("Filter entries by status", [
    { value: "all", label: "All", count: entries.length },
    ...present.map((status) => ({
      value: status,
      label: LABEL[status],
      count: count(status),
    })),
  ]);
}

/**
 * draws a directory listing in box-drawing characters.
 *
 * text rather than a picture: it copies into a reply intact, reads in order,
 * scales with the reader's font, and adds nothing to the page's weight. A tree
 * whose entries carry a status gains a gutter, and each line then sits in its
 * own row so a chip can dim it; the break stays inside the row, so the listing
 * still copies as the plain lines it is.
 * @param block the tree block as the author wrote it
 * @param path JSON path of the block, named verbatim by every refusal
 * @param page what the tree is drawn into, which names the sections a link may reach
 * @returns the listing's HTML
 */
export function renderTree(
  block: Extract<Block, { type: "tree" }>,
  path: string,
  page: PageContext,
): string {
  const title = optionalString(block.title, `${path}.title`);
  const root = requireString(block.root, `${path}.root`);
  const entries = walk(block.items, `${path}.items`, "", undefined, page);
  const lines: Line[] = [{ rules: "", name: root }, ...entries];
  const gutter = entries.some((entry) => entry.status !== undefined);
  // notes line up in a column, so the shape of the tree stays readable down
  // the left edge instead of being broken up by prose of varying length
  const column = Math.max(...lines.map((line) => extentOf(line, gutter))) + 2;
  const present = TREE_STATUSES.filter((status) =>
    entries.some((entry) => entry.effective === status),
  );
  // one status is a legend, not a filter, so only a tree with a bar of chips
  // draws a scope and marks its rows: an attribute with no scope around it
  // would let a bar further up the page adopt these rows as its own
  const filtered = present.length > 1;
  const rows = lines.map((line, index) => {
    const row = drawLine(line, column, gutter);
    if (!gutter) return row;
    // the root is the listing's heading, so it never carries a status and is
    // never dimmed; an entry with none still carries the attribute, empty, so
    // choosing a status dims it
    const item =
      !filtered || index === 0 ? "" : ` data-filter-item="${line.effective ?? ""}"`;

    return `<span class="tree-row"${item}>${row}${index === lines.length - 1 ? "" : "\n"}</span>`;
  });
  const scope = filtered ? " data-filter-scope" : "";

  return `<figure class="tree-figure"${scope}>${title ? `<figcaption class="tree-title">${escapeHtml(title)}</figcaption>` : ""}${gutter ? renderKey(entries, present) : ""}<pre class="tree">${rows.join(gutter ? "" : "\n")}</pre></figure>`;
}
