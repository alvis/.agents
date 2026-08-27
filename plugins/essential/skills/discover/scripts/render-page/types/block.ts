import type { DiagramBlock } from "../diagram/shape.ts";

import type {
  Cell,
  Choice,
  Column,
  Definition,
  Finding,
  Lane,
  Meter,
  Metric,
  Moment,
  Option,
  Person,
  Pin,
  Point,
  Risk,
  Row,
  ScalePoint,
  Step,
  TreeItem,
  Viewport,
} from "./content.ts";
import type { Rich } from "./inline.ts";

/**
 * how the reply reads a question's answer.
 *
 * a decision is something the reader settles; a follow-up is something they may
 * ask for. The reply keeps them apart so an untouched optional question is
 * never reported as a refusal, nor an unasked follow-up as an instruction.
 */
export type Response = "decision" | "follow-up";

/** a run of lines tied to a partner elsewhere on the page. */
export interface CodeTie {
  /** the name this end and its partner share */
  key: string;
  /** the 1-based lines the tie covers */
  lines: number[];
}

/** a reviewer note anchored to one line of an excerpt. */
export interface CodeComment {
  /** the 1-based line the note reads under */
  line: number;
  /** what the reviewer said */
  text: Rich;
  /** how much the note matters, drawn as a word as well as a colour */
  severity?: "critical" | "high" | "medium" | "low";
  /** where the line lives, when the excerpt is not the whole file */
  at?: string;
}

/** the content units a section body can hold in the walking skeleton. */
export type Block =
  /** a paragraph, capped to a comfortable reading measure */
  | { type: "prose"; text: Rich }
  /** a responsive strip of labelled figures */
  | { type: "metrics"; items: Metric[] }
  /** a comparison table; rows must be as long as `columns` */
  | { type: "table"; columns: (string | Column)[]; rows: (Cell[] | Row)[] }
  /**
   * an aside set off from the surrounding prose.
   *
   * `tone` is carried as a word in the heading as well as a colour, so the
   * difference between a warning and a reassurance survives greyscale.
   */
  | {
      type: "callout";
      title: string;
      text: Rich;
      tone?: "neutral" | "good" | "bad";
      lead?: string;
    }
  /** a layered node-and-edge graph, drawn as inline SVG at natural size */
  | DiagramBlock
  /**
   * a single-answer question; `id` names its radio group and must be unique.
   * `recommendation` states which answer the page recommends and why —
   * `questions.md` requires a material decision to explain the recommendation,
   * and a `Recommended` badge states which without stating why
   */
  | {
      type: "choice";
      response?: Response;
      id: string;
      /** the citation code drawn on its chip and beside it, e.g. `D4` */
      ref: string;
      label: string;
      ask: string;
      choices: Choice[];
      recommendation?: string;
    }
  /**
   * a yes/no or single-option question, answered by pressing Approve or
   * Change; `id` becomes the note textarea's document id
   */
  | {
      type: "decision";
      response?: Response;
      id: string;
      /** the citation code drawn on its chip and beside it, e.g. `D4` */
      ref: string;
      label: string;
      ask: string;
      placeholder?: string;
    }
  /** a free-text question; `id` becomes the textarea's document id */
  | {
      type: "note";
      response?: Response;
      id: string;
      /** the citation code drawn on its chip and beside it, e.g. `D4` */
      ref: string;
      label: string;
      ask: string;
      placeholder?: string;
    }
  /** an ordered sequence with numbered markers */
  | { type: "steps"; items: Step[] }
  /**
   * severity-ranked observations, the risk report's core.
   *
   * `filters` adds a chip per severity present. A chip dims what it does not
   * match rather than hiding it, so the set the reader is looking at never
   * shrinks and the counts on the chips keep meaning what they say.
   */
  | { type: "findings"; items: Finding[]; filters?: boolean }
  /** a multi-select question; its answer is a set, joined by `", "` */
  | {
      type: "checklist";
      response?: Response;
      id: string;
      /** the citation code drawn on its chip and beside it, e.g. `D4` */
      ref: string;
      label: string;
      ask: string;
      options: Option[];
    }
  /** a bulleted or numbered list, each item optionally led by its claim */
  | { type: "list"; ordered?: boolean; items: Point[] }
  /** an executive summary of two to four strong-lead bullets */
  | { type: "tldr"; title?: string; points: Point[] }
  /**
   * a source excerpt, held verbatim.
   *
   * the text is escaped like any other author string: there is no highlighter
   * and no markup pass-through, so a code block cannot smuggle elements into
   * the page.
   */
  | {
      type: "code";
      language?: string;
      caption?: string;
      code: string;
      /** 1-based lines the author is drawing the reader's eye to */
      highlight?: number[];
      /** lines tied to whatever else on the page shares their key */
      ties?: CodeTie[];
      /** reviewer notes, each reading directly under the line it is about */
      comments?: CodeComment[];
    }
  /** anticipated reviewer questions, each answer able to carry provenance */
  | { type: "faq"; items: Definition[] }
  /** terms the board defines rather than assumes */
  | { type: "glossary"; entries: Definition[] }
  /** labelled `n of m` readings, drawn as bars and stated as numbers */
  | { type: "readiness"; items: Meter[] }
  /** who each piece of work is routed to */
  | { type: "owners"; people: Person[] }
  /** severity, likelihood and mitigation, one row per risk */
  | { type: "risk-matrix"; caption?: string; rows: Risk[] }
  /** one failure, split into what prevents, detects and contains it */
  | {
      type: "failure-map";
      failure: string;
      prevent: Rich[];
      detect: Rich[];
      contain: Rich[];
    }
  /** a dated or timestamped rail of moments */
  | { type: "timeline"; items: Moment[] }
  /** lanes whose membership is itself the claim */
  | { type: "kanban"; lanes: Lane[] }
  /**
   * what a direction buys, what it costs, and where it stops working.
   *
   * the third column is the one that makes the block honest: wins and costs
   * alone read as a balanced case, while `failsWhen` names the conditions
   * under which the author would not recommend it at all.
   */
  | {
      type: "tradeoffs";
      title?: string;
      wins: Rich[];
      costs: Rich[];
      failsWhen: Rich[];
    }
  /**
   * a directory listing drawn with box-drawing characters.
   *
   * it is text, not a picture: it survives copy and paste into a reply, reads
   * aloud in order, and costs the page nothing.
   */
  | { type: "tree"; title?: string; root: string; items: TreeItem[] }
  /**
   * a Mermaid graph, rendered in the browser from its own source.
   *
   * the source travels with the page and stays visible when the runtime is
   * absent or the graph is malformed, so a broken diagram degrades to the text
   * that describes it rather than to nothing.
   */
  | { type: "mermaid"; title?: string; source: string; alt: string }
  /**
   * a hand-authored SVG, inlined as markup from a file beside the data.
   *
   * inlined rather than referenced, because a board is one file; as markup
   * rather than a data URL, so its own text inherits the page's tokens and
   * stays selectable.
   */
  | {
      type: "svg";
      title?: string;
      src: string;
      alt: string;
      /** numbered annotations the author placed on the drawing */
      pins?: Pin[];
    }
  /**
   * a packed HTML document, embedded in a sandboxed frame.
   *
   * the author names a *path*; the builder packs that file's own stylesheets,
   * scripts and images into one document and hands it over as `srcdoc`. The
   * frame runs scripts but is denied `allow-same-origin`, so a prototype
   * behaves like itself while being unable to read the page it sits in.
   */
  | {
      type: "embed";
      title?: string;
      src: string;
      alt: string;
      /** widths the reader can switch between; the first is the initial one */
      viewports?: Viewport[];
      /** browser chrome around the frame; a string is the URL bar's text */
      chrome?: string | boolean;
    }
  /**
   * a picture, inlined so the board stays one file.
   *
   * an SVG is inlined as markup rather than base64, because that is both
   * smaller and themeable — its own text then inherits the page's tokens.
   */
  | {
      type: "image";
      title?: string;
      src: string;
      alt: string;
      caption?: string;
      /** numbered annotations the author placed on the picture */
      pins?: Pin[];
    }
  /**
   * content the reader opens for themselves.
   *
   * a board earns its length by not spending it up front: the detail that
   * only some readers need goes here, present and findable, without making
   * every reader scroll past it.
   */
  | { type: "disclosure"; summary: string; open?: boolean; blocks: Block[] }
  /**
   * the hub's index of every board the run produced.
   *
   * it carries no fields: the boards come from the run's set file, which
   * is the same list every board's sidebar is drawn from.
   */
  | { type: "boards" }
  /**
   * a list the reader ranks, by dragging or by key.
   *
   * the authored order is the page's own proposal; the reply reports the
   * reader's only once it differs from it, so a list left as drawn is never
   * reported back as a ranking somebody made.
   */
  | { type: "probe"; id: string; label: string; items: string[] }
  /** an ordered scale; its answer carries the chosen ordinal position */
  | {
      type: "scale";
      response?: Response;
      id: string;
      /** the citation code drawn on its chip and beside it, e.g. `D4` */
      ref: string;
      label: string;
      ask: string;
      points: ScalePoint[];
    };
