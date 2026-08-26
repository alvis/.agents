import { installSyncGroup } from "./sync.ts";

/**
 * lights every element tied to whichever one the reader is on.
 *
 * one call covers every family the page can carry — author pins and their
 * cards, a glossary term and its entry, a specimen region and the lines that
 * produce it — because the family is already inside the key. Nothing here
 * knows what a pin is.
 *
 * members are made focusable, so the tie is reachable without a pointer. That
 * costs a tab stop per tied span, which is the price of the tie existing at all
 * for a keyboard reader: a highlight only a mouse can raise is a highlight some
 * readers are simply never shown.
 * @param root where to look for ties
 */
export function installTies(root: ParentNode = document): void {
  installSyncGroup(
    [...root.querySelectorAll<HTMLElement>("[data-sync]")].map((element) => ({
      element,
      key: element.dataset.sync ?? "",
    })),
    { focusable: true },
  );
}
