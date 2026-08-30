import type { Block } from "./block.ts";
import type { Metric, Source } from "./content.ts";

/**
 * every presentation kind the renderer accepts.
 *
 * the list lives beside the page type rather than in the shared vocabulary
 * because it is the one vocabulary the page type itself is written in: kept
 * apart, the union and the list it validates against drift, and nothing in
 * this repository would report it.
 */
export const PAGE_KINDS = [
  "architecture-board",
  "board-hub",
  "brainstorm-spectrum",
  "build-journal",
  "change-walkthrough",
  "domain-explainer",
  "guided-interview",
  "interactive-prototype",
  "plan-review",
  "ranked-options",
  "readiness-check",
  "risk-context-report",
  "semantics-map",
  "specimen-board",
  "triage-board",
] as const;

/** one presentation kind. */
export type PageKind = (typeof PAGE_KINDS)[number];

/** one numbered section of the page. */
export interface Section {
  /** unique anchor the drawer's section navigation links to */
  id: string;
  /** short name shown in that navigation */
  label: string;
  /** optional kicker rendered beside the section number */
  eyebrow?: string;
  /** the section heading, rendered directly above the body */
  title: string;
  /** the section's content, in reading order */
  blocks: Block[];
}

/**
 * author-supplied colour overrides, layered over the built-in tokens.
 *
 * every `--ui-*` token is overridable and none is whitelisted, so a board can
 * carry a product's own palette rather than an approximation of it. The
 * consequence is that the contrast a themed board reaches is the author's to
 * hold: nothing here checks it.
 */
export interface Theme {
  /**
   * hue in degrees for the accent ramp. It rotates `--ui-accent`,
   * `--ui-accent-soft`, `--ui-accent-ink` and `--ui-focus` in both schemes
   * while keeping the lightness and chroma of the built-ins, which is what
   * lets companion boards read as a set from one number each.
   */
  accent?: number;
  /** raw `--ui-*` overrides applied in the light scheme */
  light?: Record<string, string>;
  /** raw `--ui-*` overrides applied in the dark scheme */
  dark?: Record<string, string>;
}

/** the whole presentation, as authored in the data file. */
export interface PageData {
  /** presentation kind; every kind shares one chrome and differs by content */
  kind: PageKind;
  /** stable identifier for the page, emitted as `data-page-id` */
  id: string;
  /** the action label the collapsed drawer carries */
  action: string;
  /** the document title */
  title: string;
  /** the opening block above the first section */
  masthead: {
    /** kicker above the headline */
    eyebrow: string;
    /** the page's one-line claim */
    headline: string;
    /** the paragraph that qualifies the headline */
    lede: string;
    /** optional figures shared by every option below */
    meta?: Metric[];
  };
  /** optional colour overrides for this board alone */
  theme?: Theme;
  /** the page's sections, numbered in the order given */
  sections: Section[];
  /** what the page rests on, listed in a footer beneath the last section */
  sources?: Source[];
  /**
   * the single copyable reply the drawer hosts.
   *
   * optional, because a board that asks nothing has nothing to reply with: an
   * index of other boards is read and left, and a drawer offering to copy an
   * empty reply invites the reader to send one. A board holding any question
   * must carry it, and is refused without it.
   */
  reply?: {
    /** heading shown above the reply */
    heading: string;
    /**
     * reply body, whose `{{name}}` markers are replaced as the reader answers.
     *
     * `{{summary}}` becomes one paragraph saying where the board stands,
     * `{{answers}}` the questions grouped by whether each was confirmed,
     * changed, answered, or left unmarked, and `{{notes}}` the passages the
     * reader annotated. `{{provenance}}` and `{{caveats}}` are filled once at
     * render time, because neither moves as the reader answers.
     */
    template: string;
  };
}
