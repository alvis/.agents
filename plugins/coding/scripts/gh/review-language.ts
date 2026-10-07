/**
 * recognizes review-verdict language, which only coding:pr's revision-bound
 * review publisher may post; kept free of runtime-specific imports so the
 * publisher, its guard, and the gh-pr-comment drop-in share one definition.
 */

/** wording that states or implies a review verdict */
export const REVIEW_LANGUAGE_PATTERN =
  /(?:^|\b)(?:approve(?:d|s)?|request(?:ed|s)? changes|review verdict|substantive verdict|must change|not reviewed|goal and requirements|overall review)(?:\b|:)/i;
