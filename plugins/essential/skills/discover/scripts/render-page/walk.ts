import type { Block, CodeExcerpt, PageData, Section } from "./types.ts";

/** one block a board holds, against where in the data it sits. */
export interface Placed {
  /** the block itself, exactly as the author wrote it */
  block: Block;
  /** its JSON path, used verbatim by every refusal that names it */
  path: string;
}

/**
 * walks every block a list holds, including the ones a container nests.
 *
 * `disclosure` is the only block carrying blocks of its own, and a flat walk
 * saw none of them. One walk, shared by everything that asks a question of a
 * board's blocks, is what keeps those answers from disagreeing: a picture
 * behind a disclosure was once resolved by the reader that recursed and missed
 * by the one that did not, and a Mermaid graph behind one shipped with neither
 * its library nor a refusal because the guard deciding that never looked
 * inside.
 * anything that is not a list walks as an empty one, because this runs before
 * validation: `section.ts` and `disclosure.ts` both name a malformed `blocks`
 * by its JSON path, and a walk that trusted the shape crashed with a raw
 * TypeError first, replacing a refusal that reads with one that does not.
 * @param blocks the blocks to walk
 * @param at JSON path of `blocks`, extended as the walk descends
 * @returns every block met, each with its own JSON path, outermost first
 */
export function walkBlocks(blocks: Block[] | undefined, at: string): Placed[] {
  if (!Array.isArray(blocks)) return [];

  return blocks.flatMap((block, index) => {
    const path = `${at}[${index}]`;

    return [
      { block, path },
      ...walkBlocks((block as { blocks?: Block[] } | null)?.blocks, `${path}.blocks`),
    ];
  });
}

/**
 * walks every block a board holds, section by section.
 *
 * asked of the data rather than of the rendered page, because the answers
 * decide what rendering is handed: which files to read, and whether to fetch
 * 3.5 MB of graph runtime at all.
 * @param data the board's data, as read from disk
 * @returns every block on the board, each with its own JSON path
 */
export function pageBlocks(data: PageData): Placed[] {
  const sections: Section[] = Array.isArray(data?.sections) ? data.sections : [];

  return sections.flatMap((section, index) =>
    walkBlocks(section?.blocks, `sections[${index}].blocks`),
  );
}

/**
 * says whether a board holds a block of one type, at any depth.
 *
 * asked of the data rather than of the rendered HTML, because the answers
 * decide what rendering is handed: whether 3.5 MB of graph runtime is fetched
 * at all, and whether a page carries the sheet for a format it never draws.
 * Asked through the same walk that resolves a board's files, so a block behind
 * a disclosure is one this sees — read flat, a graph nested there once shipped
 * with the marker its loader matches on, no library to draw it, and no refusal
 * either.
 * @param data the board's data, as read from disk
 * @param type the block type to look for
 * @returns true where the board holds one
 */
export function usesBlock(data: PageData, type: Block["type"]): boolean {
  return pageBlocks(data).some((placed) => placed.block?.type === type);
}

/** one source excerpt a board holds, against where in the data it sits. */
export interface PlacedCode {
  /** the excerpt itself, exactly as the author wrote it */
  excerpt: CodeExcerpt;
  /** its JSON path, used verbatim by every refusal that names it */
  path: string;
}

/**
 * collects every source excerpt on a board, standalone or half of a pair.
 *
 * the CLI layer formats and colours excerpts before rendering, and a panel of
 * a pair is an excerpt like any other: missing them here would leave half of
 * every comparison unformatted and grey, which is exactly the half a reader is
 * comparing against.
 * @param data the board's data, as read from disk
 * @returns every excerpt on the board, each with its own JSON path
 */
export function codeExcerpts(data: PageData): PlacedCode[] {
  return pageBlocks(data).flatMap(({ block, path }) => {
    if (block?.type === "code") return [{ excerpt: block, path }];
    if (block?.type !== "codepair") return [];
    const panels = Array.isArray(block.panels) ? block.panels : [];

    return panels.map((excerpt, index) => ({
      excerpt,
      path: `${path}.panels[${index}]`,
    }));
  });
}
