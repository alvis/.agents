import type { DiagramBlock } from "../diagram/shape.ts";

import type {
  Cell,
  Column,
  Definition,
  Deviation,
  Finding,
  Lane,
  Meter,
  Metric,
  Moment,
  Person,
  Pin,
  Point,
  Risk,
  Row,
  Step,
  TreeItem,
  Viewport,
} from "./content.ts";
import type { CodeExcerpt } from "./code.ts";
import type { Rich } from "./inline.ts";
import type { LedgerGroup } from "./ledger.ts";
import type { QuestionBlock } from "./question.ts";

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
  /** a bulleted or numbered list, each item optionally led by its claim */
  | { type: "list"; ordered?: boolean; items: Point[] }
  /** an executive summary of two to four strong-lead bullets */
  | { type: "tldr"; title?: string; points: Point[] }
  /** a source excerpt, held verbatim */
  | ({ type: "code" } & CodeExcerpt)
  /** two excerpts read against each other, sharing one annotation sequence */
  | {
      type: "codepair";
      /** the small label above the pair, such as `PAIR B / 3` */
      eyebrow?: string;
      /** a caption read as the pair's title */
      caption?: string;
      /** the two panels, left first */
      panels: CodeExcerpt[];
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
  /**
   * where the build departed from the plan, one entry per departure.
   *
   * the plan and the code are drawn against each other rather than in one
   * paragraph, because the comparison is the claim: a reader checking whether
   * a departure was reasonable reads the two columns, not a sentence that has
   * already reconciled them for them.
   */
  | { type: "deviations"; title?: string; items: Deviation[] }
  /**
   * the merge verdict, filled from every quiz question on the page.
   *
   * it ships showing the unanswered state rather than being built by the
   * runtime, so a board read with scripting off still says plainly that the
   * quiz decides whether to merge instead of showing an empty box.
   */
  | {
      type: "gate";
      title: string;
      /** what the reader may do once every question is right */
      pass: Rich;
      /** what they should do first while any is wrong */
      fail: Rich;
    }
  /** lanes whose membership is itself the claim */
  | { type: "kanban"; lanes: Lane[] }
  /**
   * grouped rows that open for the whole of what is recorded about them.
   *
   * a card can only carry what fits on it, so a record of nine columns per row
   * reaches a lane as three of them and the reader goes back to the source for
   * the rest. A ledger draws the same scannable line and keeps the remaining
   * fields one disclosure away, in native `details` elements: no runtime, open
   * when the page is printed, and already a disclosure to a screen reader.
   */
  | { type: "ledger"; groups: LedgerGroup[] }
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
  /** every question the reader answers, which the reply reads back */
  | QuestionBlock;
