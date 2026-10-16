import { describe, expect, it } from "vitest";

import { StubElement } from "../dom-support.ts";
import { renderCode } from "./block/code.ts";
import { renderDiagram } from "./diagram.ts";
import { DIAGRAM_CSS } from "./diagram/style.ts";
import { RenderError } from "./error.ts";
import { renderInline } from "./inline.ts";
import { installDiagramDetail } from "./runtime/detail.ts";
import { installTies } from "./runtime/tie.ts";

import type { DiagramBlock } from "./diagram/shape.ts";

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

describe("fn:renderDiagram pins", () => {
  it("should place the pins inside the scroller, against the drawing", () => {
    const html = renderDiagram(
      diagram({ pins: [{ x: 20, y: 40, text: "The seam" }] }),
      at,
    );

    // the pin layer sits within the frame that scrolls, wrapped around the
    // drawing alone, so a sideways scroll carries the pins with the graph
    expect(html).toContain(
      `<div class="diagram-frame"><div class="pin-frame"><svg`,
    );
    expect(html).toContain(`</svg><div class="pin-layer"`);
    expect(html).toContain(`--pin-x:20%;--pin-y:40%`);
  });

  it("should give the frame a width the drawing sets, not the scroller", () => {
    expect(DIAGRAM_CSS).toContain(".diagram-frame > .pin-frame{width:max-content}");
  });

  it("should tie each pin to its own card under the drawing", () => {
    const html = renderDiagram(
      diagram({
        pins: [
          { x: 10, y: 10, text: "First" },
          { x: 90, y: 80, text: "Second" },
        ],
      }),
      at,
    );
    const keys = [...html.matchAll(/data-sync="pin:([^"]+)"/g)].map(
      (one) => one[1],
    );

    // two ends per pin, scoped by the figure so a second annotated graph on the
    // same page cannot light this one's cards
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(2);
    expect(keys[0]).toMatch(/:1$/);
    expect(html.indexOf(`<ol class="pin-notes">`)).toBeGreaterThan(
      html.indexOf(`</div>`),
    );
  });

  it("should leave an unpinned graph exactly as it was", () => {
    const html = renderDiagram(diagram(), at);

    expect(html).toContain(`<div class="diagram-frame"><svg`);
    expect(html).not.toContain("pin-frame");
    expect(html).not.toContain("pin-notes");
  });

  it("should refuse a pin placed off the drawing, by its own path", () => {
    expect(refusal(diagram({ pins: [{ x: 140, y: 10, text: "Off" }] }))).toBe(
      `${at}.pins[0].x: required a percentage from 0 to 100, received 140`,
    );
  });
});

describe("fn:renderDiagram details", () => {
  /** a graph whose middle node is the only one that explains itself. */
  const detailed = () =>
    diagram({
      nodes: [
        { id: "a", label: "Alpha", layer: 0 },
        { id: "b", label: "Beta", layer: 1, detail: "What Beta holds" },
        { id: "c", label: "Gamma", layer: 2 },
      ],
    });

  it("should let exactly the boxes with a detail be chosen", () => {
    const html = renderDiagram(detailed(), at);
    const marked = [...html.matchAll(/data-diagram-node="([^"]+)"/g)].map(
      (one) => one[1],
    );

    expect(marked).toStrictEqual(["b"]);
  });

  it("should mark the same nodes the templates were written for", () => {
    const html = renderDiagram(
      diagram({
        nodes: [
          { id: "a", label: "Alpha", layer: 0, detail: "Alpha holds" },
          { id: "b", label: "Beta", layer: 1, detail: "Beta holds" },
          { id: "c", label: "Gamma", layer: 2 },
        ],
      }),
      at,
    );
    const pick = (attribute: string) =>
      [...html.matchAll(new RegExp(`${attribute}="([^"]+)"`, "g"))].map(
        (one) => one[1],
      );

    // the drawing and the templates each decide this from their own copy of
    // the node; when they disagree the page invites a reader to choose a box
    // that cannot be chosen, and nothing else on the page says so
    expect(pick("data-diagram-node")).toStrictEqual(pick("data-diagram-detail"));
  });

  it("should offer no host when no node explains itself", () => {
    const html = renderDiagram(diagram(), at);

    expect(html).not.toContain("data-diagram-detail-host");
    expect(html).not.toContain("data-diagram-node");
  });

  it("should refuse an unusable detail by the node's own path", () => {
    expect(
      refusal(
        diagram({
          nodes: [
            { id: "a", label: "Alpha", layer: 0 },
            { id: "b", label: "Beta", layer: 1, detail: 7 },
            { id: "c", label: "Gamma", layer: 2 },
          ],
        }),
      ),
    ).toContain(`${at}.nodes[1].detail`);
  });
});

describe("fn:renderDiagram marks", () => {
  /** a graph whose middle node carries every mark a node may. */
  const marked = () =>
    diagram({
      nodes: [
        { id: "a", label: "Alpha", layer: 0 },
        {
          id: "b",
          label: "Beta",
          layer: 1,
          note: "owns the order",
          step: 2,
          emphasis: true,
          tie: "order",
          detail: "What Beta holds",
        },
        { id: "c", label: "Gamma", layer: 2, step: 3 },
      ],
    });

  /**
   * picks the opening tag of the node group that wraps a label
   * @param html the rendered figure
   * @param label the node's label
   * @returns the group's opening tag
   */
  function groupOf(html: string, label: string): string {
    return (
      new RegExp(`<g class="dg-node[^>]*>(?=<title>[^<]*${label})`).exec(html)?.[0] ?? ""
    );
  }

  it("should draw an emphasised box with a class and set only fill and stroke for it", () => {
    const html = renderDiagram(marked(), at);
    const rule = /\.dg-node\.is-emphasis \.dg-box\{([^}]*)\}/.exec(DIAGRAM_CSS)?.[1] ?? "";
    const properties = rule.split(";").map((one) => one.split(":")[0]?.trim());

    expect(groupOf(html, "Beta")).toContain('class="dg-node dg-node-domain is-emphasis"');
    expect(groupOf(html, "Alpha")).not.toContain("is-emphasis");
    // a rule that set dash or weight would erase the channels that carry the
    // role without colour
    expect(properties.filter(Boolean)).toStrictEqual(["fill", "stroke"]);
  });

  it("should carry the tie key and the detail key on one node", () => {
    const group = groupOf(renderDiagram(marked(), at), "Beta");

    expect(group).toContain('data-diagram-node="b"');
    expect(group).toContain('data-sync="tie:order"');
  });

  it("should keep a box chosen and lit at once, because they are different classes", () => {
    const key = /data-sync="([^"]+)"/.exec(groupOf(renderDiagram(marked(), at), "Beta"))?.[1];
    const node = new StubElement("g", {
      "data-sync": key ?? "",
      "data-diagram-node": "b",
    });
    const host = new StubElement("div", { "data-diagram-detail-host": "" });
    const figure = new StubElement("figure", { class: "diagram" }, [node, host]);
    const page = new StubElement("div", {}, [figure]);
    installTies(page as unknown as ParentNode);
    installDiagramDetail(page as unknown as ParentNode);

    node.dispatch("mouseenter");
    node.dispatch("click");

    expect(node.classList.contains("is-active")).toBe(true);
    expect(node.classList.contains("is-chosen")).toBe(true);
  });

  it("should light a prose run, a code line and a node from one tie key", () => {
    // A1 — each end is drawn by its own renderer, so the key it emits is the
    // one the page would carry
    const prose = renderInline([{ kind: "tie", text: "the order", key: "order" }], "p");
    const code = renderCode(
      {
        type: "code",
        language: "typescript",
        code: "const a = 1;\nconst order = 2;",
        ties: [{ key: "order", lines: [2] }],
      } as Parameters<typeof renderCode>[0],
      "c",
    );
    const keys = [prose, code, renderDiagram(marked(), at)].map(
      (html) => /data-sync="([^"]+)"/.exec(html)?.[1] ?? "",
    );
    const [run, line, node] = keys.map(
      (key) => new StubElement("span", { "data-sync": key }),
    ) as [StubElement, StubElement, StubElement];
    const bystander = new StubElement("span", { "data-sync": "tie:other" });
    const page = new StubElement("div", {}, [run, line, node, bystander]);
    installTies(page as unknown as ParentNode);

    node.dispatch("mouseenter");

    expect(keys).toStrictEqual(["tie:order", "tie:order", "tie:order"]);
    expect(run.classList.contains("is-active")).toBe(true);
    expect(line.classList.contains("is-active")).toBe(true);
    expect(bystander.classList.contains("is-active")).toBe(false);
  });

  it("should invert a lit box so that it cannot be taken for an emphasised one", () => {
    const fill = (selector: string) =>
      new RegExp(`${selector.replaceAll(".", "\\.")} \\.dg-box\\{[^}]*fill:([^;}]*)`).exec(
        DIAGRAM_CSS,
      )?.[1];

    expect(fill(".dg-node.is-active")).toBeDefined();
    expect(fill(".dg-node.is-active")).not.toBe(fill(".dg-node.is-emphasis"));
  });

  it("should draw every step badge inside the emitted drawing", () => {
    // A2 — a badge sits on its box's corner, so the boxes nearest the edges of
    // the drawing are where one could be clipped
    const html = renderDiagram(
      diagram({
        nodes: [
          { id: "a", label: "Alpha", layer: 0, step: 1 },
          { id: "b", label: "Beta", layer: 1, step: 99 },
          { id: "c", label: "Gamma", layer: 2, step: 3 },
        ],
      }),
      at,
    );
    const [, width, height] = /<svg width="(\d+)" height="(\d+)"/.exec(html)?.map(Number) ?? [];
    const tiles = [
      ...html.matchAll(
        /<g class="dg-step"[^>]*><rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="(\d+)" height="(\d+)"/g,
      ),
    ].map((one) => ({ x: Number(one[1]), y: Number(one[2]), w: Number(one[3]), h: Number(one[4]) }));

    expect(tiles).toHaveLength(3);
    for (const { x, y, w, h } of tiles) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(width ?? 0);
      expect(y + h).toBeLessThanOrEqual(height ?? 0);
    }
  });

  it("should not resize the drawing when steps are added", () => {
    const stepped = diagram().nodes.map((node, index) => ({ ...node, step: index + 1 }));
    const size = (html: string) => /<svg width="\d+" height="\d+"/.exec(html)?.[0];

    expect(size(renderDiagram(diagram({ nodes: stepped }), at))).toBe(
      size(renderDiagram(diagram(), at)),
    );
  });

  it("should lead the title and the text list with the step", () => {
    const html = renderDiagram(marked(), at);

    expect(html).toContain("<title>Step 2: Beta — owns the order</title>");
    expect(html).toContain("<li>Step 3: Gamma");
    expect(html).toContain("<li>Alpha");
  });

  it("should hide the badge from assistive tech, which has the words already", () => {
    expect(renderDiagram(marked(), at)).toContain('<g class="dg-step" aria-hidden="true">');
  });

  it("should draw a graph without marks exactly as it was", () => {
    const html = renderDiagram(diagram(), at);
    const falsy = diagram().nodes.map((node) => ({ ...node, emphasis: false }));

    expect(html).not.toMatch(/is-emphasis|dg-step|Step \d|data-sync/);
    expect(renderDiagram(diagram({ nodes: falsy }), at)).toBe(html);
  });

  it("should refuse an emphasis that is not a boolean, by the node's path", () => {
    const nodes = [{ id: "a", label: "Alpha", layer: 0, emphasis: "yes" }];

    expect(refusal(diagram({ nodes }))).toBe(
      `${at}.nodes[0].emphasis: required true or false, received "yes"`,
    );
  });

  it("should refuse a step outside 1 to 99 or not whole, by the node's path", () => {
    for (const step of [0, 100, 1.5, "2"]) {
      const nodes = [{ id: "a", label: "Alpha", layer: 0, step }];

      expect(refusal(diagram({ nodes }))).toBe(
        `${at}.nodes[0].step: required an integer from 1 to 99, received ${JSON.stringify(step)}`,
      );
    }
  });

  it("should refuse a step used twice, naming the second node", () => {
    const nodes = [
      { id: "a", label: "Alpha", layer: 0, step: 4 },
      { id: "b", label: "Beta", layer: 1, step: 4 },
    ];

    expect(refusal(diagram({ nodes }))).toBe(
      `${at}.nodes[1].step: required a step number used once, received 4 for a second time`,
    );
  });

  it("should refuse a tie that is not a non-empty string, by the node's path", () => {
    const nodes = [{ id: "a", label: "Alpha", layer: 0, tie: 7 }];

    expect(refusal(diagram({ nodes }))).toBe(
      `${at}.nodes[0].tie: required non-empty string, received 7`,
    );
  });
});
