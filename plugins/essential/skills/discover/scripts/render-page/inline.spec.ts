import { describe, expect, it } from "vitest";

import { escapeHtml } from "./escape.ts";
import { renderInline } from "./inline.ts";

/**
 * renders a rich-text value at a fixed path
 * @param value the value to render
 * @returns the rendered HTML
 */
function html(value: unknown): string {
  return renderInline(value, "text");
}

describe("fn:renderInline", () => {
  it("should render a bare string exactly as an escaped string", () => {
    // every data file written before runs existed keeps rendering to the same
    // bytes, which is the whole reason a string is legal here at all
    const written = `a & b <c> "d" 'e'`;

    expect(html(written)).toBe(escapeHtml(written));
  });

  it("should refuse a value that is neither a string nor runs", () => {
    expect(() => html(undefined)).toThrow("text: required non-empty string");
    expect(() => html({ kind: "text", text: "x" })).toThrow(
      "text: required non-empty string",
    );
  });

  it("should refuse an empty run array", () => {
    // an empty array renders to nothing, which is a silently missing sentence
    expect(() => html([])).toThrow("text: required non-empty array");
  });

  it("should join runs in the order they were authored", () => {
    expect(html(["the ", { kind: "code", text: "sync" }, " endpoint"])).toBe(
      'the <code class="mono">sync</code> endpoint',
    );
  });

  it("should escape every run's text, whatever the run is", () => {
    const attack = '<img src=x onerror="alert(1)">';

    for (const run of [
      attack,
      { kind: "text", text: attack },
      { kind: "code", text: attack },
      { kind: "mark", text: attack },
      { kind: "dim", text: attack },
      { kind: "sub", text: attack },
      { kind: "term", text: attack, definition: attack },
      { kind: "link", text: attack, href: "https://example.com" },
      { kind: "source", text: attack, ref: attack },
      { kind: "provenance", text: attack, level: "measured" },
    ])
      expect(html([run])).not.toContain("<img");
  });

  it("should draw each run kind as its own element", () => {
    expect(html([{ kind: "text", text: "t" }])).toBe("t");
    expect(html([{ kind: "code", text: "t" }])).toBe('<code class="mono">t</code>');
    expect(html([{ kind: "mark", text: "t" }])).toBe("<mark>t</mark>");
    expect(html([{ kind: "dim", text: "t" }])).toBe('<span class="dim">t</span>');
    expect(html([{ kind: "sub", text: "t" }])).toBe('<span class="sub">t</span>');
    expect(html([{ kind: "term", text: "t", definition: "d" }])).toBe(
      '<span class="term" data-sync="term:t" title="d">t</span>',
    );
    expect(html([{ kind: "tie", text: "t", key: "strip" }])).toBe(
      '<span class="tie" data-sync="tie:strip">t</span>',
    );
    expect(html([{ kind: "link", text: "t", href: "https://x.test/y" }])).toBe(
      '<a href="https://x.test/y">t</a>',
    );
    // the id is authored, not drawn: it has to reach find-in-page and the
    // accessibility tree, which CSS generated content does not
    expect(html([{ kind: "source", text: "t", ref: "R-3" }])).toBe(
      '<span class="source-ref" data-source="R-3">t <span class="source-id">[R-3]</span></span>',
    );
    expect(html([{ kind: "provenance", text: "t", level: "estimated" }])).toBe(
      '<span class="provenance" data-provenance="estimated"><span class="provenance-level">estimated</span> t</span>',
    );
  });

  it("should refuse an unknown run kind by name", () => {
    expect(() => html([{ kind: "bold", text: "t" }])).toThrow(
      'text[0].kind: required one of "text", "code", "mark", "dim", "sub", "term", "tie", "link", "source", "provenance", received "bold"',
    );
  });

  it("should refuse a field the run's own kind does not carry, by JSON path", () => {
    // an ignored field is an instruction the author believes was followed
    expect(() => html(["a", { kind: "code", text: "t", href: "https://x.test" }])).toThrow(
      'text[1].href: a "code" run carries only "kind", "text"',
    );
    expect(() => html([{ kind: "link", text: "t", href: "https://x.test", ref: "R-1" }])).toThrow(
      'text[0].ref: a "link" run carries only "kind", "text", "href"',
    );
  });

  it("should refuse a run missing the field its kind requires", () => {
    expect(() => html([{ kind: "term", text: "t" }])).toThrow(
      "text[0].definition: required non-empty string",
    );
    expect(() => html([{ kind: "link", text: "t" }])).toThrow(
      "text[0].href: required non-empty string",
    );
    expect(() => html([{ kind: "provenance", text: "t" }])).toThrow(
      "text[0].level: required one of",
    );
  });

  it("should refuse a run that is not an object", () => {
    expect(() => html([["nested"]])).toThrow("text[0]: required object");
    expect(() => html([null])).toThrow("text[0]: required object");
  });

  it("should refuse a link scheme that can execute", () => {
    // the page is otherwise only ever given data; a link is the one field an
    // author could use to hand it code instead
    for (const href of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "data:text/html,<script>x</script>",
      "vbscript:x",
    ])
      expect(() => html([{ kind: "link", text: "t", href }])).toThrow(
        "text[0].href: link scheme",
      );
  });

  it("should accept a relative, fragment, or mailto link", () => {
    for (const href of ["#s-risk", "/board.html", "./sibling.html", "mailto:a@b.test"])
      expect(html([{ kind: "link", text: "t", href }])).toContain(
        `href="${href}"`,
      );
  });

  it("should refuse an empty run string, not render an empty span", () => {
    expect(() => html(["a", ""])).toThrow("text[1]: required non-empty string");
  });
});
