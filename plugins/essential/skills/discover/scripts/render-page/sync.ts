import { escapeHtml } from "./escape.ts";

/**
 * the families of synchronized tie a page can carry.
 *
 * every tie on the page shares one attribute and one runtime primitive; the
 * family is what keeps a glossary term called `pin` from lighting up pin 1.
 */
export type SyncFamily = "term" | "pin" | "tie";

/**
 * builds the key two elements share to be lit together.
 *
 * the family is part of the key rather than part of a separate attribute,
 * because the runtime then has exactly one selector to install over: the
 * difference between a glossary tie and a pin tie is a matter for the author
 * and the stylesheet, not for the code that counts engagements.
 * @param family which kind of tie this is
 * @param name the name the two ends share within that family
 * @returns the key, ready to place in an attribute value
 */
export function syncKey(family: SyncFamily, name: string): string {
  return `${family}:${name}`;
}

/**
 * builds the attribute that ties an element to its partners
 * @param family which kind of tie this is
 * @param name the name the two ends share within that family
 * @returns the attribute, with a leading space, ready to place in a tag
 */
export function syncAttribute(family: SyncFamily, name: string): string {
  return ` data-sync="${escapeHtml(syncKey(family, name))}"`;
}

/**
 * folds a term to the form both ends of a glossary tie derive their key from.
 *
 * case and punctuation only. A stemmer would let `writing` find `write`, but
 * it would also silently mis-tie every word it guessed wrong, and a glossary
 * that lights the wrong entry is worse than one that lights none. Where the
 * sentence's wording genuinely differs from the glossary's, the author says so
 * with the run's own `for` rather than hoping an algorithm agrees.
 * @param term the term as the author wrote it
 * @returns the folded key
 */
export function termKey(term: string): string {
  return term
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
