import { requireFilledArray, requireOneOf } from "../validate.ts";
import { CHOICE_TAGS } from "../types.ts";

/**
 * draws a choice's tags as badges, refusing any word outside `questions.md`'s
 * closed vocabulary
 * @param tags the author-supplied tags, or `undefined` for an untagged choice
 * @param id document id the option's `aria-describedby` points at, so the
 *   tags stay announced once they are out of the radio's accessible name
 * @param at JSON path of the owning choice, extended by the refusal
 * @returns the badge markup, or `""` when the choice carries no tags
 */
export function renderTags(tags: unknown, id: string, at: string): string {
  if (tags === undefined) return "";
  const path = `${at}.tags`;
  // an unrecognised word rendered as a badge reads as an endorsement the page
  // never made — `[Blessed]` looks exactly as official as `[Recommended]` —
  // so the vocabulary is closed at validation time rather than at style time
  const badges = requireFilledArray<unknown>(tags, path)
    .map((tag, index) => {
      const value = requireOneOf(tag, CHOICE_TAGS, `${path}[${index}]`);
      return `<span class="badge" data-tag="${value}">${value}</span>`;
    })
    .join("");
  return `<span class="badges" id="${id}">${badges}</span>`;
}
