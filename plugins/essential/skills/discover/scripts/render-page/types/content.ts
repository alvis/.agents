import type { Rich } from "./inline.ts";

// the repeated shapes blocks are built from: figures, cells, and entries.

/** a labelled statistic rendered into the masthead or a metric strip. */
export interface Metric {
  /** short uppercase caption naming what the value measures */
  label: string;
  /** the measured value, already formatted for display */
  value: string;
}

/** a verdict-carrying table cell. */
export interface Cell {
  /** the cell's visible text */
  text: Rich;
  /**
   * judgement carried alongside the text, drawn as a leading glyph
   * (`+`, `~`, `!`) as well as a colour so it survives greyscale
   */
  verdict?: "good" | "mixed" | "bad";
}

/** one entry of a `steps` block. */
export interface Step {
  /** the step's short name */
  title: string;
  /** one or two sentences on what the step involves */
  text: string;
  /** progress, drawn as a word, a glyph, a marker edge, and only then a colour */
  state?: "done" | "current" | "todo";
}

/** one entry of a `findings` block. */
export interface Finding {
  /**
   * a short stable citation anchor, drawn as a mono badge.
   *
   * it appears in the page and in the copied reply, so a reader can answer
   * "which finding?" with a token both sides already share.
   */
  id?: string;
  /** the finding's one-line claim */
  title: string;
  /** how much the finding matters, encoded on four channels */
  severity: "critical" | "elevated" | "watch" | "clear";
  /** the body: what was observed and why it bites */
  text: string;
  /** the team or person the mitigation is routed to */
  owner?: string;
  /** what the claim rests on, or the cheapest probe that would settle it */
  evidence?: string;
}

/**
 * one bullet, optionally led by the clause that carries its claim.
 *
 * `lead` exists because a bullet that opens with its conclusion is scannable
 * and one that buries it is not; the renderer bolds the lead and leaves the
 * rest at reading weight, so the author states the split rather than marking
 * it up.
 */
export interface Point {
  /** the claim, set in bold ahead of the rest */
  lead?: string;
  /** the argument, at reading weight */
  text: Rich;
}

/** one term-and-detail pair, used by both `faq` and `glossary`. */
export interface Definition {
  /** the question asked, or the term being defined */
  term: string;
  /** the answer or definition, which may carry provenance and source runs */
  detail: Rich;
}

/** one labelled `n of m` reading in a `readiness` block. */
export interface Meter {
  /** what is being rated */
  label: string;
  /** the rating reached */
  value: number;
  /** the rating available; `value` may not exceed it */
  of: number;
  /** an optional clause on what would move the reading */
  note?: string;
}

/** one person an item is routed to. */
export interface Person {
  /** the person or team the work sits with */
  name: string;
  /** the chip's glyph; derived from `name` when absent */
  initials?: string;
  /** what they own here, if the name alone does not say */
  role?: string;
  /** when it is due, as already-formatted text */
  due?: string;
}

/** one row of a `risk-matrix` block. */
export interface Risk {
  /** what could go wrong */
  risk: Rich;
  /** how bad it would be, drawn as a word and a pill, never colour alone */
  severity: "low" | "medium" | "high" | "critical";
  /** how likely it is, in the author's own words */
  likelihood: string;
  /** what is being done about it */
  mitigation: Rich;
}

/** one entry on a `timeline` rail. */
export interface Moment {
  /** the date, week, or timestamp, as already-formatted text */
  when: string;
  /** what happens then */
  title: Rich;
  /** progress, drawn as a word and a marker as well as a colour */
  state?: "done" | "active" | "pending";
  /**
   * what sort of entry this is, drawn as a word above the title.
   *
   * a build log is not a plan read back. Some of its entries confirm what was
   * planned, some are what the code turned out to say, some are departures,
   * and some are work still owed — and a rail that draws all four alike leaves
   * a reader to re-derive the difference from the prose of every entry. It is
   * optional, so every timeline written before this stays a rail of plain
   * moments; the words each value draws are in `MOMENT_KIND_LABEL`.
   */
  kind?: "plan-confirmed" | "discovery" | "deviation" | "todo";
  /** what would make this moment worth rechecking */
  tags?: string[];
}

/**
 * one departure from the plan, and what was done about it.
 *
 * four fields rather than a before-and-after pair, because a departure a
 * reader can only see is not one they can judge: the choice taken and the
 * condition that would reopen it are what turn a discrepancy into a decision
 * somebody can agree or disagree with.
 */
export interface Deviation {
  /** what the departure is about, drawn as its title */
  title: string;
  /** what the plan said would happen */
  planned: Rich;
  /** what the code turned out to say instead */
  found: Rich;
  /** the choice taken, which is the conservative one by construction */
  chose: Rich;
  /** what would make this worth reopening, where anything would */
  revisit?: Rich;
}

/** one lane of a `kanban` block. */
export interface Lane {
  /** the lane's name, which is what lane membership means */
  label: string;
  /** the cards in it, in the order the author put them */
  cards: Rich[];
}

/**
 * one column of a `table` block, when a bare heading is not enough.
 *
 * a plain string stays valid and means a column with no width or alignment of
 * its own, so the common case costs an author nothing.
 */
export interface Column {
  /** the column heading */
  label: string;
  /** a CSS length or percentage applied to the column, e.g. `"30%"` */
  width?: string;
  /** text alignment inside the column; defaults to the sheet's own */
  align?: "left" | "center" | "right";
}

/**
 * one entry of the page's footer sources.
 *
 * a source states where a claim came from and how far the author stands
 * behind it, so a reader can weigh the page without reopening the work that
 * produced it.
 */
export interface Source {
  /** what the source is, in the author's own words */
  label: string;
  /** where to find it: a path, a ticket, a query, already formatted */
  ref?: string;
  /** how far the author stands behind what it supports */
  level?: "measured" | "estimated" | "assumed" | "invented";
}

/**
 * one row of a `table` block when it carries provenance of its own.
 *
 * a bare `Cell[]` stays valid and means a row making no provenance claim, so
 * an existing table costs its author nothing.
 */
export interface Row {
  /** the row's cells, which must still be as long as `columns` */
  cells: Cell[];
  /** how far the author stands behind this row */
  provenance?: {
    /** the level, drawn as a pill in the row's last cell */
    level: "measured" | "estimated" | "assumed" | "invented";
    /** what the level refers to; defaults to the level's own word */
    text?: string;
  };
}

/** one entry in a file tree, drawn with box-drawing rules rather than images. */
export interface TreeItem {
  /** the file or directory name, drawn verbatim in a mono face */
  name: string;
  /** what it is for, drawn dimmed to the right of the name */
  note?: string;
  /** entries nested beneath it; presence is what makes this a directory */
  children?: TreeItem[];
}

/**
 * one width the author says an embedded document is meant to be read at.
 *
 * declared rather than detected: the host resizes the frame, so the embedded
 * document does not have to cooperate, report its own size, or be reachable
 * from the page at all.
 */
export interface Viewport {
  /** what to call it on the button — "Phone", "Desktop", a device name */
  name: string;
  /** the frame's width in CSS pixels at this setting */
  width: number;
  /** the frame's height in CSS pixels at this setting */
  height: number;
}

/**
 * one numbered annotation an author placed on a figure.
 *
 * the position is a percentage of the figure, so it holds wherever the picture
 * is scaled to; there is no leader line by decision, so the pin and its card
 * are tied by their shared number and a synchronized highlight instead.
 */
export interface Pin {
  /** how far across the figure the pin sits, 0 to 100 */
  x: number;
  /** how far down the figure the pin sits, 0 to 100 */
  y: number;
  /** what the pin is pointing out */
  text: Rich;
}
