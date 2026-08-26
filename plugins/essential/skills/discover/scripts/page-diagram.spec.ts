import { describe, expect, it } from "vitest";

import { DIAGRAM_CSS, renderDiagram } from "./page-diagram.ts";
import { RenderError } from "./render-page.ts";

import type { DiagramBlock } from "./page-diagram.ts";

/** JSON path every refusal below is expected to name. */
const at = "sections[0].blocks[1]";

/**
 * builds a valid three-layer diagram, overridden per test.
 *
 * `a -> c` skips layer 1, so the fixture exercises both routing families.
 */
function diagram(overrides: Record<string, unknown> = {}): DiagramBlock {
  return {
    type: "diagram",
    title: "Flow",
    nodes: [
      { id: "a", label: "Alpha", layer: 0, role: "client" },
      { id: "b", label: "Beta", layer: 1, role: "domain" },
      { id: "c", label: "Gamma", layer: 2, role: "source" },
    ],
    edges: [
      { from: "a", to: "b", label: "send", kind: "flow" },
      { from: "a", to: "c", label: "skips", kind: "derive" },
    ],
    ...overrides,
  } as DiagramBlock;
}

/**
 * renders a block and returns the refusal it raised.
 * @param block the block under test
 * @returns the message of the raised RenderError
 */
function refusal(block: DiagramBlock): string {
  try {
    renderDiagram(block, at);
  } catch (error) {
    expect(error).toBeInstanceOf(RenderError);
    return (error as Error).message;
  }
  throw new Error("the block was accepted but should have been refused");
}

describe("fn:renderDiagram", () => {
  it("should emit the graph at natural size and never scale it to fit", () => {
    const svg = /<svg\b[^>]*>/.exec(renderDiagram(diagram(), at))?.[0] ?? "";

    // R-8: a viewBox smaller than the drawing would shrink its type below the
    // legibility floor, so the drawing carries pixel width and height only
    expect(svg).toMatch(/\bwidth="\d+"/);
    expect(svg).toMatch(/\bheight="\d+"/);
    expect(svg).not.toMatch(/\bviewBox=/);
    expect(svg).not.toMatch(/\bpreserveAspectRatio=/);
    expect(svg).not.toMatch(/width="\d+%"/);
  });

  it("should let a narrow viewport scroll the frame rather than shrink it", () => {
    expect(renderDiagram(diagram(), at)).toContain('<div class="diagram-frame">');
    expect(DIAGRAM_CSS).toMatch(/\.diagram-frame\{[^}]*overflow-x:auto/);
    expect(DIAGRAM_CSS).toMatch(/\.diagram-frame svg\{[^}]*max-width:none/);
  });

  it("should make every node focusable in reading order", () => {
    const html = renderDiagram(diagram(), at);
    const groups = [...html.matchAll(/<g class="dg-node[^"]*" tabindex="0" role="group"><title>([^<]*)<\/title>/g)];

    expect(groups.map((group) => group[1])).toStrictEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
  });

  it("should enumerate every node and edge as clipped text beside the figure", () => {
    const html = renderDiagram(diagram(), at);
    const list = /<div class="sr-only">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";

    expect(list).toContain("<li>Alpha -&gt; Beta: send</li>");
    expect(list).toContain("<li>Alpha -&gt; Gamma: skips</li>");
    expect(list).toContain("<li>Alpha — outside the service boundary, layer 0</li>");
    // the clipped list reuses the page's own .sr-only rule rather than adding one
    expect(DIAGRAM_CSS).not.toContain(".sr-only{");
  });

  it("should name an unlabelled edge by its kind in the text list", () => {
    const html = renderDiagram(
      diagram({ edges: [{ from: "a", to: "b", kind: "fanout" }] }),
      at,
    );

    expect(html).toContain("<li>Alpha -&gt; Beta: fan-out</li>");
  });

  it("should separate roles and kinds before any colour differs", () => {
    const html = renderDiagram(diagram(), at);

    // SC-6 channel 1 — an injective text tag inside each node
    expect(html).toContain(">CLIENT</text>");
    expect(html).toContain(">DOMAIN</text>");
    expect(html).toContain(">SOURCE</text>");
    // SC-6 channel 2 — a distinct stroke pattern per role and per kind
    expect(DIAGRAM_CSS).toMatch(/\.dg-node-client \.dg-box\{[^}]*stroke-dasharray:5 4/);
    expect(DIAGRAM_CSS).toMatch(/\.dg-edge-derive\{[^}]*stroke-dasharray:2 3/);
    expect(DIAGRAM_CSS).toMatch(/\.dg-edge-around\{[^}]*stroke-dasharray:9 5/);
    // SC-6 channel 3 — a distinct arrowhead shape per kind
    const heads = [...html.matchAll(/<marker id="[^"]*-(\w+)"[^>]*>(<path d="[^"]+" \/>)/g)];
    expect(new Set(heads.map((head) => head[2])).size).toBe(heads.length);
  });

  it("should route a layer-skipping edge around the margin and mark it", () => {
    const html = renderDiagram(diagram(), at);
    const skipping = /<path class="dg-edge dg-edge-derive dg-edge-around" d="([^"]+)"/.exec(html);

    // three segments: out to the lane, along it, then back in
    expect(skipping?.[1].split(" L")).toHaveLength(4);
    expect(html).toContain("skips or reverses a layer</span>");
  });

  it("should keep every drawn glyph inside the emitted drawing", () => {
    const html = renderDiagram(diagram(), at);
    const width = Number(/<svg width="(\d+)"/.exec(html)?.[1]);
    const xs = [...html.matchAll(/ x="(-?\d+(?:\.\d+)?)"/g)].map((m) => Number(m[1]));

    // the around-routing gutter must be wide enough for its own labels
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(width);
  });

  it("should give each diagram document-unique arrowhead ids", () => {
    const first = renderDiagram(diagram(), "sections[0].blocks[1]");
    const second = renderDiagram(diagram(), "sections[2].blocks[0]");

    expect(first).toContain('id="dg-sections-0-blocks-1-flow"');
    expect(second).toContain('id="dg-sections-2-blocks-0-flow"');
  });

  it("should list only the roles and kinds the graph actually draws", () => {
    const html = renderDiagram(diagram(), at);

    expect(html).toContain('<span class="dg-key-tag">CLIENT</span>');
    expect(html).not.toContain('<span class="dg-key-tag">ENGINE</span>');
  });
});

describe("fn:renderDiagram refusals", () => {
  it("should refuse a title that is not a non-empty string", () => {
    expect(refusal(diagram({ title: 7 }))).toBe(
      `${at}.title: required non-empty string, received 7`,
    );
  });

  it("should refuse a node label that is not a non-empty string", () => {
    expect(
      refusal(diagram({ nodes: [{ id: "a", label: 7, layer: 0 }] })),
    ).toBe(`${at}.nodes[0].label: required non-empty string, received 7`);
  });

  it("should refuse a node id that is not a non-empty string", () => {
    expect(
      refusal(diagram({ nodes: [{ id: "", label: "Alpha", layer: 0 }] })),
    ).toBe(`${at}.nodes[0].id: required non-empty string, received ""`);
  });

  it("should refuse a layer that is not an integer", () => {
    expect(
      refusal(diagram({ nodes: [{ id: "a", label: "Alpha", layer: 1.5 }] })),
    ).toBe(`${at}.nodes[0].layer: required non-negative integer, received 1.5`);
  });

  it("should refuse a negative layer", () => {
    expect(
      refusal(diagram({ nodes: [{ id: "a", label: "Alpha", layer: -1 }] })),
    ).toBe(`${at}.nodes[0].layer: required non-negative integer, received -1`);
  });

  it("should refuse a missing layer", () => {
    expect(refusal(diagram({ nodes: [{ id: "a", label: "Alpha" }] }))).toBe(
      `${at}.nodes[0].layer: required non-negative integer, received undefined`,
    );
  });

  it("should refuse a duplicate node id", () => {
    expect(
      refusal(
        diagram({
          nodes: [
            { id: "a", label: "Alpha", layer: 0 },
            { id: "a", label: "Beta", layer: 1 },
          ],
        }),
      ),
    ).toBe(
      `${at}.nodes[1].id: required a node id declared once, received "a" for a second time`,
    );
  });

  it("should refuse a node note that is not a non-empty string", () => {
    expect(
      refusal(
        diagram({ nodes: [{ id: "a", label: "Alpha", layer: 0, note: 7 }] }),
      ),
    ).toBe(`${at}.nodes[0].note: required non-empty string, received 7`);
  });

  it("should refuse an explicitly null node note rather than dropping it", () => {
    // null is not "field absent": the reader asked for a note and gave an
    // unusable one, so it must be named, not silently discarded by the
    // truthiness tests that later read it
    expect(
      refusal(
        diagram({ nodes: [{ id: "a", label: "Alpha", layer: 0, note: null }] }),
      ),
    ).toBe(`${at}.nodes[0].note: required non-empty string, received null`);
  });

  it("should refuse an unknown node role", () => {
    expect(
      refusal(
        diagram({ nodes: [{ id: "a", label: "Alpha", layer: 0, role: "queue" }] }),
      ),
    ).toBe(
      `${at}.nodes[0].role: required one of "client", "edge", "domain", "engine", "source", "derived", "ephemeral", received "queue"`,
    );
  });

  it("should refuse an unknown edge kind", () => {
    expect(
      refusal(diagram({ edges: [{ from: "a", to: "b", kind: "sync" }] })),
    ).toBe(
      `${at}.edges[0].kind: required one of "flow", "fanout", "derive", received "sync"`,
    );
  });

  it("should refuse an edge whose source names no declared node", () => {
    expect(
      refusal(diagram({ edges: [{ from: "zz", to: "b" }] })),
    ).toBe(
      `${at}.edges[0].from: required the id of a declared node, received "zz" which no node declares`,
    );
  });

  it("should refuse an edge whose target names no declared node", () => {
    expect(
      refusal(diagram({ edges: [{ from: "a", to: "zz" }] })),
    ).toBe(
      `${at}.edges[0].to: required the id of a declared node, received "zz" which no node declares`,
    );
  });

  it("should refuse an edge that starts and ends at one node", () => {
    expect(refusal(diagram({ edges: [{ from: "a", to: "a" }] }))).toBe(
      `${at}.edges[0]: required two different nodes, received "a" at both ends`,
    );
  });

  it("should refuse an edge inside a single layer, which the router cannot draw", () => {
    expect(
      refusal(
        diagram({
          nodes: [
            { id: "a", label: "Alpha", layer: 0 },
            { id: "b", label: "Beta", layer: 0 },
          ],
          edges: [{ from: "a", to: "b" }],
        }),
      ),
    ).toBe(
      `${at}.edges[0]: required two nodes in different layers, received "a" and "b" both in layer 0`,
    );
  });

  it("should refuse a graph that declares no node", () => {
    expect(refusal(diagram({ nodes: [] }))).toBe(
      `${at}.nodes: required non-empty array, received []`,
    );
  });

  it("should refuse the first offence and render nothing", () => {
    // two faults; only the earlier one is reported
    expect(
      refusal(
        diagram({
          nodes: [
            { id: "a", label: 7, layer: 0 },
            { id: "b", label: "Beta", layer: -3 },
          ],
        }),
      ),
    ).toBe(`${at}.nodes[0].label: required non-empty string, received 7`);
  });
});
