import type { PageIds } from "./id.ts";

/**
 * everything a block needs that is not the block.
 *
 * it is one argument rather than several because the list grows: ids came
 * first, files arrived with inlined assets, and a block that needs neither
 * should not have to name both. Passing a context also keeps the reading
 * order right — a block is rendered *in* a page, and this is the page.
 */
export interface PageContext {
  /** the ids the page has claimed so far, one set per kind, extended in place */
  ids: PageIds;
  /**
   * files the CLI layer read and resolved, keyed by the `src` the author
   * wrote.
   *
   * the renderer stays pure by being handed contents rather than paths; a
   * block whose `src` is missing from this map refuses by name rather than
   * reaching for the disk itself.
   */
  files: Record<string, string>;
}

/**
 * builds an empty context, for a page that claims no ids and inlines nothing.
 * @returns a fresh context
 */
export function emptyContext(): PageContext {
  return {
    ids: {
      finding: new Set(),
      probe: new Set(),
      question: new Set(),
      section: new Set(),
    },
    files: {},
  };
}
