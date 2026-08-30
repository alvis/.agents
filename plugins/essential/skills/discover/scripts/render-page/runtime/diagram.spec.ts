import { afterEach, describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { DIAGRAM_CSS } from "../diagram/style.ts";
import { PAGE_CSS } from "../style.ts";
import { installMermaid, THEME } from "./diagram.ts";

const css = `${PAGE_CSS}${DIAGRAM_CSS}`;

describe("const:THEME", () => {
  // a token that does not exist resolves to the empty string, which the canvas
  // cannot paint, which leaves the sentinel black behind — a graph drawn in
  // black on black, with nothing anywhere reporting a fault. The typo is the
  // whole failure mode, so the names are checked against the stylesheet
  it("should name only tokens the stylesheet defines", () => {
    const undefined_ = [...new Set(Object.values(THEME))].filter(
      (token) => !css.includes(`${token}:`),
    );

    expect(undefined_).toStrictEqual([]);
  });

  it("should give Mermaid the variables it derives the rest from", () => {
    expect(Object.keys(THEME)).toEqual(
      expect.arrayContaining(["background", "primaryColor", "lineColor", "textColor"]),
    );
  });

  it("should follow a page token for every variable it sets", () => {
    const loose = Object.entries(THEME).filter(([, token]) => !token.startsWith("--ui-"));

    expect(loose).toStrictEqual([]);
  });
});

/**
 * builds one Mermaid figure, with the canvas and source `draw` reaches for
 * @param source the diagram text the board carries
 * @returns the figure, with its canvas as the first child
 */
function figure(source: string): StubElement {
  const canvas = new StubElement("div", { "data-mermaid-canvas": "" });
  const text = new StubElement("pre", { "data-mermaid-text": "" });
  text.textContent = source;

  return new StubElement("figure", { "data-mermaid": "" }, [canvas, text]);
}

/**
 * puts a document, a stylesheet reader and a Mermaid that always fails in place
 * @param graph the figure the page holds
 * @param message what Mermaid reports when asked to render
 */
function page(graph: StubElement, message: string): void {
  globalThis.document = {
    documentElement: graph,
    querySelectorAll: () => [graph],
    // the theme is resolved by painting each token onto a canvas, so the
    // failure path cannot be reached without one that answers
    createElement: (tag: string) =>
      tag === "canvas"
        ? {
            width: 0,
            height: 0,
            getContext: () => ({
              fillStyle: "",
              fillRect: () => undefined,
              getImageData: () => ({ data: [0, 0, 0, 255] }),
            }),
          }
        : new StubElement(tag),
  } as unknown as Document;
  (globalThis as { getComputedStyle?: unknown }).getComputedStyle = () => ({
    getPropertyValue: () => "#000000",
  });
  (globalThis as { MutationObserver?: unknown }).MutationObserver = class {
    observe(): void {
      return undefined;
    }
  };
  (globalThis as { mermaid?: unknown }).mermaid = {
    initialize: () => undefined,
    render: () => Promise.reject(new Error(message)),
  };
}

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
  delete (globalThis as { getComputedStyle?: unknown }).getComputedStyle;
  delete (globalThis as { MutationObserver?: unknown }).MutationObserver;
  delete (globalThis as { mermaid?: unknown }).mermaid;
});

describe("fn:installMermaid", () => {
  // Mermaid quotes the offending line of the diagram back in its message, so
  // the message carries whatever the board's author wrote. Writing it as
  // markup would turn a broken diagram into a script the reader never asked for
  it("should show a failure as text rather than as markup", async () => {
    const graph = figure("flowchart TD\n  A --> B");
    page(graph, '<img src=x onerror="alert(1)">');

    await installMermaid(graph);

    const [canvas] = graph.children;
    const [notice] = canvas!.children;
    expect(canvas!.children).toHaveLength(1);
    expect(notice!.tag).toEqual("p");
    expect(notice!.textContent).toEqual(
      'This diagram could not be drawn: <img src=x onerror="alert(1)">',
    );
  });

  it("should mark the figure failed and open its source", async () => {
    const graph = figure("flowchart TD\n  A --> ");
    page(graph, "Parse error on line 2");

    await installMermaid(graph);

    expect(graph.dataset.mermaidState).toEqual("failed");
  });
});
