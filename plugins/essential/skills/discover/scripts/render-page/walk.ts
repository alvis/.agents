import type { Block, PageData, Section } from "./types.ts";

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
