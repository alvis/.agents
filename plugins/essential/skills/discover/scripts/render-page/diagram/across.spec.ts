import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { renderDiagram } from "../diagram.ts";
import { RenderError } from "../error.ts";
import {
  ACROSS_GAP,
  CAPTION_PAD,
  EDGE_ADVANCE,
  FRAME_PAD,
  LAYER_GAP,
} from "./geometry.ts";
import { place } from "./place.ts";

import type { DiagramBlock, DiagramEdge, DiagramNode, Placement } from "./shape.ts";

/** JSON path every refusal below is expected to name. */
const at = "sections[0].blocks[2]";

/** directory holding the example boards, every one of which renders in CI. */
const EXAMPLES = new URL("../../../examples/data/", import.meta.url);

/** a caption's drawn height, in px: the .78rem mono face at a 16px root, rounded up. */
const CAPTION_HEIGHT = 13;

/** an axis-aligned rectangle, as its left, top, right and bottom edges. */
interface Box {
  /** left edge, in px */
  left: number;
  /** top edge, in px */
  top: number;
  /** right edge, in px */
  right: number;
  /** bottom edge, in px */
  bottom: number;
}

/**
 * builds a seven-layer pipeline that wraps at four, so it turns once.
 *
 * the threshold fans out across the turn: the review table is the top of its
 * stack and the merge pointer is not, so one turn drops straight down the
 * shared column and the other takes the outer lane.
 * @param overrides block fields replaced per test
 * @returns the across-flow diagram block
 */
function pipeline(overrides: Partial<DiagramBlock> = {}): DiagramBlock {
  return {
    type: "diagram",
    title: "Pipeline",
    flow: "across",
    wrap: 4,
    nodes: [
      { id: "thread", label: "New thread", layer: 0, role: "client" },
      { id: "pass", label: "Similarity pass", layer: 1, role: "engine" },
      { id: "pairs", label: "Candidate pairs", layer: 2, role: "derived" },
      { id: "score", label: "Threshold", layer: 3, role: "domain" },
      { id: "review", label: "Review table", layer: 4, role: "source" },
      { id: "pointer", label: "Merge pointer", layer: 4, role: "source" },
      { id: "collapse", label: "Index collapse", layer: 5, role: "engine" },
      { id: "search", label: "Search results", layer: 6, role: "client" },
    ],
    edges: [
      { from: "thread", to: "pass", label: "text" },
      { from: "pass", to: "pairs", label: "scored pair" },
      { from: "pairs", to: "score" },
      { from: "score", to: "review", label: "below" },
      { from: "score", to: "pointer", label: "above", kind: "fanout" },
      { from: "pointer", to: "collapse", label: "link" },
      { from: "collapse", to: "search", label: "survivor", kind: "derive" },
    ],
    ...overrides,
  };
}

/**
 * builds a straight chain of single-node layers.
 * @param count how many layers the chain has
 * @param overrides block fields replaced per test
 * @returns the diagram block, one node per layer and one edge per step
 */
function chain(count: number, overrides: Partial<DiagramBlock> = {}): DiagramBlock {
  const nodes: DiagramNode[] = [...Array(count).keys()].map((layer) => ({
    id: `n${layer}`,
    label: `Node ${layer}`,
    layer,
  }));
  const edges: DiagramEdge[] = nodes
    .slice(1)
    .map((node, index) => ({ from: `n${index}`, to: node.id }));

  return { type: "diagram", title: "Chain", flow: "across", nodes, edges, ...overrides };
}

/**
 * lists every node's box
 * @param placement the measured drawing
 * @returns one rectangle per node, in placement order
 */
function boxes(placement: Placement): Box[] {
  return placement.nodes.map((node) => ({
    left: node.x,
    top: node.y,
    right: node.x + placement.nodeWidth,
    bottom: node.y + placement.nodeHeight,
  }));
}

/**
 * estimates the rectangle a caption paints
 * @param placement the measured drawing
 * @returns one rectangle per labelled edge
 */
function captions(placement: Placement): Box[] {
  return placement.edges.flatMap(({ caption, label }) => {
    if (!caption) return [];
    const width = Math.ceil((label ?? "").length * EDGE_ADVANCE);
    const left =
      caption.anchor === "start"
        ? caption.x
        : caption.anchor === "end"
          ? caption.x - width
          : caption.x - width / 2;
    const top =
      caption.baseline === "middle"
        ? caption.y - CAPTION_HEIGHT / 2
        : caption.y - CAPTION_HEIGHT;

    return [{ left, top, right: left + width, bottom: top + CAPTION_HEIGHT }];
  });
}

/**
 * tells whether two rectangles share any area
 * @param a one rectangle
 * @param b the other
 * @returns true when their interiors intersect
 */
function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * finds the x of every node in a layer
 * @param placement the measured drawing
 * @param layer the layer to read
 * @returns the distinct left edges of that layer's boxes
 */
function columnsOf(placement: Placement, layer: number): number[] {
  return [
    ...new Set(placement.nodes.filter((node) => node.layer === layer).map((node) => node.x)),
  ];
}

/**
 * places a block and returns the refusal it raised.
 * @param block the block under test
 * @returns the message of the raised RenderError
 */
function refusal(block: DiagramBlock): string {
  try {
    place(block, at);
  } catch (error) {
    expect(error).toBeInstanceOf(RenderError);

    return (error as Error).message;
  }
  throw new Error("the block was accepted but should have been refused");
}

/**
 * collects every diagram block anywhere in a parsed board.
 * @param value any part of the board
 * @returns each diagram block found, in document order
 */
function diagramsIn(value: unknown): DiagramBlock[] {
  if (Array.isArray(value)) return value.flatMap(diagramsIn);
  if (typeof value !== "object" || value === null) return [];
  if ((value as { type?: unknown }).type === "diagram") return [value as DiagramBlock];

  return Object.values(value).flatMap(diagramsIn);
}

describe("fn:place across flow", () => {
  it("should draw no box over another", () => {
    const drawn = boxes(place(pipeline(), at));
    const clashes = drawn.flatMap((box, index) =>
      drawn.slice(index + 1).filter((other) => overlaps(box, other)),
    );

    expect(clashes).toStrictEqual([]);
  });

  it("should draw every segment horizontal or vertical", () => {
    const diagonal = place(pipeline(), at).edges.flatMap((edge) =>
      edge.points
        .slice(1)
        .map((point, index) => [edge.points[index], point])
        .filter(([[x1, y1], [x2, y2]]) => x1 !== x2 && y1 !== y2),
    );

    expect(diagonal).toStrictEqual([]);
  });

  it("should read even rows left to right and odd rows right to left", () => {
    const placement = place(chain(7, { wrap: 4 }), at);
    const x = (layer: number): number => columnsOf(placement, layer)[0]!;

    expect([x(0) < x(1), x(1) < x(2), x(2) < x(3)]).toStrictEqual([true, true, true]);
    expect([x(4) > x(5), x(5) > x(6)]).toStrictEqual([true, true]);
  });

  it("should turn every wrap down the column the two rows share", () => {
    // A3: three rows of three turn once on the right and once on the left, and
    // each turn is a single vertical segment because both ends share a column
    const placement = place(chain(9, { wrap: 3 }), at);
    const turns = placement.edges.filter((edge) => edge.to.layer % 3 === 0);

    expect(columnsOf(placement, 2)).toStrictEqual(columnsOf(placement, 3));
    expect(columnsOf(placement, 5)).toStrictEqual(columnsOf(placement, 6));
    expect(columnsOf(placement, 2)[0]).toBeGreaterThan(columnsOf(placement, 5)[0]!);
    expect(turns.map((edge) => edge.points.map(([x]) => x === edge.points[0]![0]))).toStrictEqual([
      [true, true],
      [true, true],
    ]);
  });

  it("should take the outer lane when a turn cannot drop straight down", () => {
    const placement = place(pipeline(), at);
    const contentRight = Math.max(...boxes(placement).map((box) => box.right));
    const [drop, lane] = placement.edges.filter((edge) => edge.from.id === "score");

    expect(drop!.points).toHaveLength(2);
    expect(lane!.points).toHaveLength(4);
    expect(lane!.points[1]![0]).toBeGreaterThan(contentRight);
    expect(lane!.points[1]![0]).toBeLessThan(placement.width);
  });

  it("should keep every caption inside the drawing and off every box", () => {
    const placement = place(pipeline(), at);
    const drawn = boxes(placement);
    const painted = captions(placement);
    const outside = painted.filter(
      (box) =>
        box.left < 0 || box.top < 0 || box.right > placement.width || box.bottom > placement.height,
    );
    const covering = painted.filter((box) => drawn.some((node) => overlaps(box, node)));

    expect(painted).toHaveLength(6);
    expect(outside).toStrictEqual([]);
    expect(covering).toStrictEqual([]);
  });

  it("should size the drawing from its columns, gaps, bands and padding", () => {
    // every turn here is a straight drop and every label is short, so no lane
    // widens a margin and every gap stays at its floor
    const placement = place(chain(7, { wrap: 4 }), at);

    expect(placement.width).toBe(2 * FRAME_PAD + 4 * placement.nodeWidth + 3 * ACROSS_GAP);
    expect(placement.height).toBe(2 * FRAME_PAD + 2 * placement.nodeHeight + LAYER_GAP);
  });

  it("should widen a gap to clear a long caption and its arrowhead", () => {
    const label = "a caption far wider than the floor of a gap";
    const plain = place(chain(3), at);
    const block = chain(3);
    const labelled = place({ ...block, edges: [{ ...block.edges[0]!, label }, block.edges[1]!] }, at);
    const need = Math.ceil(label.length * EDGE_ADVANCE) + 2 * CAPTION_PAD;

    expect(labelled.width - plain.width).toBe(need - ACROSS_GAP);
  });

  it("should double a bent edge's gap, since its caption sits on one half", () => {
    const label = "a caption far wider than the floor of a gap";
    const bent = place(
      {
        type: "diagram",
        title: "Bent",
        flow: "across",
        nodes: [
          { id: "a", label: "A", layer: 0 },
          { id: "b", label: "B", layer: 1 },
          { id: "c", label: "C", layer: 1 },
        ],
        edges: [{ from: "a", to: "c", label }],
      },
      at,
    );
    const need = 2 * (Math.ceil(label.length * EDGE_ADVANCE) + 2 * CAPTION_PAD);

    expect(bent.width).toBe(2 * FRAME_PAD + 2 * bent.nodeWidth + need);
  });
});

describe("fn:place across flow refusals", () => {
  it("should refuse an edge that skips a layer", () => {
    const block = chain(5, { wrap: 2 });

    expect(refusal({ ...block, edges: [...block.edges, { from: "n1", to: "n4" }] })).toBe(
      `${at}.edges[4]: across flow draws only edges between adjacent layers, received "n1" (layer 1) to "n4" (layer 4); use "flow": "down", which routes skips and returns round the margin, or a mermaid block`,
    );
  });

  it("should refuse an edge that runs back a layer", () => {
    const block = chain(3);

    expect(refusal({ ...block, edges: [{ from: "n2", to: "n1" }] })).toBe(
      `${at}.edges[0]: across flow draws only edges between adjacent layers, received "n2" (layer 2) to "n1" (layer 1); use "flow": "down", which routes skips and returns round the margin, or a mermaid block`,
    );
  });

  it("should refuse a wrap on a down flow", () => {
    expect(refusal(chain(3, { flow: "down", wrap: 2 }))).toBe(
      `${at}.wrap: required only with "flow": "across", received 2 with a down flow`,
    );
    expect(refusal(chain(3, { flow: undefined, wrap: 2 }))).toBe(
      `${at}.wrap: required only with "flow": "across", received 2 with a down flow`,
    );
  });

  it("should refuse a wrap below two layers per row", () => {
    expect(refusal(chain(3, { wrap: 1 }))).toBe(
      `${at}.wrap: required an integer of at least 2, received 1`,
    );
    expect(refusal(chain(3, { wrap: 2.5 }))).toBe(
      `${at}.wrap: required an integer of at least 2, received 2.5`,
    );
  });

  it("should refuse an unknown flow", () => {
    expect(refusal(chain(3, { flow: "sideways" as DiagramBlock["flow"] }))).toBe(
      `${at}.flow: required one of "down", "across", received "sideways"`,
    );
  });
});

describe("fn:renderDiagram down flow", () => {
  /** every example diagram that declares no flow, which is every one drawn before across existed. */
  const blocks = readdirSync(EXAMPLES)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => diagramsIn(JSON.parse(readFileSync(new URL(name, EXAMPLES), "utf8"))))
    .filter((block) => block.flow === undefined);

  it("should render every example diagram byte for byte as an explicit down flow", () => {
    const drifted = blocks.filter(
      (block) => renderDiagram({ ...block, flow: "down" }, at) !== renderDiagram(block, at),
    );

    expect(blocks.length).toBeGreaterThan(0);
    expect(drifted.map((block) => block.title)).toStrictEqual([]);
  });

  it("should centre a caption on its line only where the edge routes round the margin", () => {
    // the baseline moved from the edge's routing to its caption; a down flow
    // keeps drawing exactly the captions it drew when routing decided it
    const misplaced = blocks
      .flatMap((block) => place(block, at).edges)
      .filter((edge) => edge.caption && (edge.caption.baseline === "middle") !== edge.around);

    expect(misplaced).toStrictEqual([]);
  });
});
