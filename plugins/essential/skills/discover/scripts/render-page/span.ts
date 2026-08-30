import { escapeHtml } from "./escape.ts";

/** a run of an excerpt that wants a class, measured on raw offsets. */
export interface Span {
  /** first character covered, 0-based */
  start: number;
  /** first character past the run */
  end: number;
  /** the class the run carries, and the only thing it contributes */
  className: string;
}

/** one piece of an excerpt, after every overlap has been cut apart. */
export interface Segment {
  /** first character covered, 0-based */
  start: number;
  /** first character past the piece */
  end: number;
  /** every class covering it, in the order the spans were given */
  classes: string[];
}

/**
 * cuts overlapping runs into one flat list that never overlaps.
 *
 * colour and selection are measured independently and routinely disagree about
 * where they end: a highlighted argument starts inside a keyword's token and
 * finishes outside it. Nesting them would emit `<a><b></a></b>`, so instead
 * every start and end becomes a cut point and each piece between two cut points
 * carries the classes of everything covering it. The result is flat by
 * construction, which is what keeps two features from producing invalid markup
 * between them.
 * @param spans the runs to cut apart, in the order their classes should read
 * @param from first character of the window, 0-based
 * @param to first character past the window
 * @returns the window's pieces, in order, covering it exactly once
 */
export function cutSpans(spans: Span[], from: number, to: number): Segment[] {
  if (to <= from) return [];
  const cuts = new Set<number>([from, to]);
  for (const span of spans) {
    if (span.start > from && span.start < to) cuts.add(span.start);
    if (span.end > from && span.end < to) cuts.add(span.end);
  }
  const edges = [...cuts].sort((left, right) => left - right);

  return edges.slice(0, -1).map((start, index) => {
    const end = edges[index + 1];

    return {
      start,
      end,
      classes: spans
        .filter((span) => span.start <= start && span.end >= end)
        .map((span) => span.className),
    };
  });
}

/**
 * draws a window of an excerpt, escaping as it slices.
 *
 * the order matters and is the whole guarantee: the text is sliced on raw
 * offsets and each slice is escaped as it is written, so a span boundary can
 * never fall inside an entity and no author byte can reach the page as markup.
 * Escaping first and measuring afterwards would do both.
 * @param text the excerpt, exactly as the block carries it
 * @param spans the runs wanting a class, in the order their classes should read
 * @param from first character of the window, 0-based
 * @param to first character past the window
 * @param after HTML to emit once the walk reaches a given offset
 * @returns the window as HTML
 */
export function drawRun(
  text: string,
  spans: Span[],
  from: number,
  to: number,
  after: Map<number, string> = new Map(),
): string {
  return cutSpans(spans, from, to)
    .map((segment) => {
      const escaped = escapeHtml(text.slice(segment.start, segment.end));
      const drawn = segment.classes.length
        ? `<span class="${segment.classes.join(" ")}">${escaped}</span>`
        : escaped;

      return `${drawn}${after.get(segment.end) ?? ""}`;
    })
    .join("");
}
