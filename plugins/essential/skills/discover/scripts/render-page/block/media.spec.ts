import { describe, expect, it } from "vitest";

import { renderBlock } from "../block.ts";
import { DIAGRAM_CSS } from "../diagram/style.ts";
import { emptyContext } from "../context.ts";

import type { PageContext } from "../context.ts";
import type { Block } from "../types.ts";

/** a one-pixel PNG, already encoded the way the CLI layer hands one over. */
const PIXEL = "data:image/png;base64,iVBORw0KGgo=";

/**
 * renders one block at a fixed path
 * @param block the block to render
 * @param page a context to supply, when the block reads a file
 * @returns the rendered HTML
 */
function html(block: unknown, page?: PageContext): string {
  return renderBlock(block as Block, "b", page ?? emptyContext());
}

/**
 * builds a context holding one file
 * @param src the path the author would have written
 * @param body the file's contents
 * @returns a context that can serve it
 */
function withFile(src: string, body: string): PageContext {
  return { ...emptyContext(), files: { [src]: body } };
}

describe("fn:renderBlock image", () => {
  it("should draw an encoded picture with its own description", () => {
    const out = html({ type: "image", src: "shot.png", alt: "The orders screen" }, withFile("shot.png", PIXEL));

    expect(out).toContain(`<img class="image-shot" src="${PIXEL}"`);
    expect(out).toContain(`alt="The orders screen"`);
  });

  // markup rather than a data URL, so its text stays selectable and its
  // `currentColor` follows the page
  it("should inline an svg as markup rather than as a picture", () => {
    const out = html(
      { type: "image", src: "mark.svg", alt: "Logo" },
      withFile("mark.svg", `<svg viewBox="0 0 4 4"><path d="M0 0h4v4H0Z" fill="currentColor"/></svg>`),
    );

    expect(out).toContain(`<div class="image-drawing" role="img" aria-label="Logo">`);
    expect(out).toContain("currentColor");
    expect(out).not.toContain("<img");
  });

  it("should carry a caption when the author wrote one", () => {
    expect(
      html({ type: "image", src: "shot.png", alt: "a", caption: "Taken 3 June" }, withFile("shot.png", PIXEL)),
    ).toContain(`<figcaption class="image-caption">Taken 3 June</figcaption>`);
  });

  it("should refuse a picture the CLI layer never read", () => {
    expect(() => html({ type: "image", src: "absent.png", alt: "a" })).toThrow(/no file was read/);
  });

  // a bare path here would be a subresource, which is exactly what a
  // self-contained board must not carry
  it("should refuse a picture handed over as anything but a data url", () => {
    expect(() => html({ type: "image", src: "shot.png", alt: "a" }, withFile("shot.png", "shot.png"))).toThrow(
      /other than a data URL/,
    );
  });

  it("should refuse an svg carrying a script", () => {
    expect(() =>
      html({ type: "image", src: "bad.svg", alt: "a" }, withFile("bad.svg", "<svg><script>x()</script></svg>")),
    ).toThrow(/carries a <script>/);
  });

  it.each(["src", "alt"])("should refuse a missing %s", (key) => {
    const block: Record<string, unknown> = { type: "image", src: "shot.png", alt: "a" };
    delete block[key];

    expect(() => html(block, withFile("shot.png", PIXEL))).toThrow(new RegExp(`b\\.${key}`));
  });
});

// a figure is a column flex box, whose default stretch sets the used width of
// every child — so a 22px screenshot was being blown up to the column and
// scaled 51x tall, which reads as an empty box rather than as a picture. A
// max-width bounds the width; it does not stop the stretch
describe("stylesheet:image", () => {
  it("should keep a picture at its own size rather than stretching it to the column", () => {
    expect(DIAGRAM_CSS).toMatch(/\.image-shot\{[^}]*align-self:start/);
    expect(DIAGRAM_CSS).toMatch(/\.image-shot\{[^}]*max-width:100%/);
    expect(DIAGRAM_CSS).toMatch(/\.image-shot\{[^}]*height:auto/);
  });

  it("should draw the widths as one segmented control", () => {
    expect(DIAGRAM_CSS).toMatch(/\.embed-viewports\{[^}]*display:flex/);
    expect(DIAGRAM_CSS).toMatch(/\.embed-viewports \.embed-viewport\{[^}]*border:0/);
  });
});

describe("fn:renderBlock embed", () => {
  const document = "<html><body>hello</body></html>";
  const block = {
    type: "embed",
    src: "app.html",
    alt: "A prototype of the orders screen",
    viewports: [
      { name: "Phone", width: 390, height: 844 },
      { name: "Desktop", width: 1440, height: 900 },
    ],
    chrome: "app.example/orders",
  };

  /**
   * renders the embed above with an optional change
   * @param change what to override on the block
   * @returns the rendered HTML
   */
  function embed(change: Record<string, unknown> = {}): string {
    return html({ ...block, ...change }, withFile("app.html", document));
  }

  // the whole security claim in one attribute: scripts run, but the frame gets
  // an opaque origin and so cannot reach the page's answers
  it("should sandbox the frame with scripts but not same-origin", () => {
    expect(embed()).toContain(`sandbox="allow-scripts"`);
    expect(embed()).not.toContain("allow-same-origin");
  });

  it("should carry the packed document in srcdoc rather than pointing at a file", () => {
    const out = embed();

    expect(out).toContain(`srcdoc="&lt;html&gt;&lt;body&gt;hello&lt;/body&gt;&lt;/html&gt;"`);
    expect(out).not.toContain(`src="app.html"`);
  });

  it("should draw a button for each viewport, the first already pressed", () => {
    const out = embed();

    expect(out).toContain(`data-width="390" data-height="844" title="Phone — 390 by 844 pixels" aria-pressed="true"`);
    expect(out).toContain(`data-width="1440" data-height="900" title="Desktop — 1440 by 900 pixels" aria-pressed="false"`);
    expect(out).toContain("data-embed-rotate");
  });

  // a button reading "Phone" says nothing about what it does; the size is what
  // a reader choosing between two of them is actually choosing. The name and
  // the size stay as real text inside the button rather than as an aria-label,
  // so find-in-page reaches them and a translation engine translates them
  it("should say each viewport's name and size as text, not only as a label", () => {
    const out = embed();

    expect(out).toContain(`<span class="sr-only">Phone — 390 by 844 pixels</span>`);
    expect(out).toContain(`<span class="sr-only">Desktop — 1440 by 900 pixels</span>`);
    expect(out).not.toContain("aria-label=\"Phone");
  });

  // the glyph comes from the width the author declared, never from the name,
  // so a viewport called anything at all still draws the right device
  it("should choose the device glyph by declared width rather than by name", () => {
    const only = (width: number, height: number): string =>
      embed({ viewports: [{ name: "zzz", width, height }] });

    expect(only(380, 800)).toContain(`<rect x="7" y="2.5"`);
    expect(only(820, 1180)).toContain(`<rect x="4" y="3.5"`);
    expect(only(1600, 900)).toContain(`<rect x="2.5" y="4"`);
  });

  // the widths are mutually exclusive and rotation applies to whichever is
  // chosen, so they are two controls rather than one row of four
  it("should group the widths apart from rotation", () => {
    const out = embed();
    const group = out.slice(out.indexOf(`class="embed-viewports"`), out.indexOf("embed-rotate"));

    expect(out).toContain(`<div class="embed-viewports" role="group" aria-label="Viewport">`);
    expect(group.match(/data-embed-viewport/g)).toHaveLength(2);
    expect(group).not.toContain("data-embed-rotate");
  });

  it("should start at the first declared viewport before any script runs", () => {
    expect(embed()).toContain(`style="--embed-width:390px;--embed-height:844px"`);
  });

  it("should show the URL bar text the author wrote", () => {
    expect(embed()).toContain(`<span class="embed-url">app.example/orders</span>`);
  });

  it("should drop the chrome when the author asked for none", () => {
    expect(embed({ chrome: undefined })).toContain("data-embed-bare");
  });

  it("should fall back to a stated ratio when no viewport is declared", () => {
    const out = embed({ viewports: undefined });

    expect(out).toContain("data-embed-fluid");
    expect(out).not.toContain("data-embed-viewport");
  });

  it("should refuse a document the CLI layer never packed", () => {
    expect(() => html({ ...block, src: "absent.html" })).toThrow(/no file was read/);
  });

  it.each([
    ["a width that is not a number", { width: "390" }, /whole number of pixels above zero/],
    ["a width of zero", { width: 0 }, /whole number of pixels above zero/],
    ["a fractional height", { height: 844.5 }, /whole number of pixels above zero/],
    ["a width past any real screen", { width: 99999 }, /is a typo rather than a viewport/],
  ])("should refuse %s", (_, change, complaint) => {
    expect(() => embed({ viewports: [{ name: "Phone", width: 390, height: 844, ...change }] })).toThrow(complaint);
  });

  it("should refuse chrome that is neither text nor a flag", () => {
    expect(() => embed({ chrome: 3 })).toThrow(/required a string to show in the URL bar/);
  });

  it("should escape a document that would otherwise break out of the attribute", () => {
    const out = html(
      { ...block, src: "x.html" },
      withFile("x.html", `<p title="close" onclick='steal()'>&</p>`),
    );

    expect(out).toContain("&quot;close&quot;");
    expect(out).toContain("&amp;");
    expect(out).not.toContain(`onclick='steal()'`);
  });
});
