import { freshIds } from "./id.ts";

import type { PageIds } from "./id.ts";
import type { BoardSet } from "./types/set.ts";

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
  /** the id of the board being drawn, which is what marks it as current */
  id: string;
  /**
   * every board of the run, when this board was rendered as part of one.
   *
   * a hub indexes it and every board lists it; a board rendered on its own
   * has neither, which is why this is optional rather than an empty set.
   */
  set?: BoardSet;
}

/**
 * builds an empty context, for a page that claims no ids and inlines nothing.
 * @returns a fresh context
 */
export function emptyContext(): PageContext {
  return {
    ids: freshIds(),
    files: {},
    id: "page",
  };
}
