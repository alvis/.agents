import { describe, expect, it } from "vitest";

import { buildAssets } from "./bundle.ts";
import { renderPage } from "./page.ts";

import type { PageData } from "./types.ts";

/** the smallest page that renders, so the assertions are about assets. */
function page(): PageData {
  return {
    kind: "ranked-options",
    id: "fixture",
    action: "Ranked options",
    title: "Fixture",
    masthead: { eyebrow: "e", headline: "h", lede: "l" },
    sections: [],
    reply: { heading: "Generated reply", template: "{{answers}}" },
  };
}

describe("fn:buildAssets", () => {
  it("should carry the page stylesheet and both scripts", async () => {
    const assets = await buildAssets();

    // the diagram rules are composed in here rather than in the renderer, so
    // a page that draws nothing still ships them and the cascade order holds
    expect(assets.css).toContain(":root{");
    expect(assets.css).toContain(".diagram-frame{");
    // the boot script exists to beat the first paint, so it must stay small
    // enough to be worth putting in the head at all
    expect(assets.boot.length).toBeLessThan(assets.runtime.length);
    expect(assets.boot).toContain("data-theme");
  });

  it("should bundle the same bytes every time", async () => {
    const [first, second] = await Promise.all([buildAssets(), buildAssets()]);

    // the bundler writes path comments, so a build that leaked an absolute
    // path would render differently on another machine and the boards would
    // stop being reproducible
    expect(second).toStrictEqual(first);
    expect(first.runtime).not.toContain("/Users/");
    expect(first.boot).not.toContain("/Users/");
  });
});

describe("fn:renderPage assets", () => {
  it("should emit exactly the assets it is given and reach for nothing", () => {
    const html = renderPage(page(), {
      css: "CSS_MARKER{}",
      boot: "BOOT_MARKER;",
      runtime: "RUNTIME_MARKER;",
    });

    // the whole point of taking assets as data: a caller controls what the
    // page carries, and the renderer contributes no stylesheet of its own
    expect(html).toContain("<style>\nCSS_MARKER{}\n</style>");
    expect(html).toContain("<script>\nBOOT_MARKER;\n</script>");
    expect(html).toContain("<script>\nRUNTIME_MARKER;\n</script>");
    expect(html).not.toContain(":root{");
    expect(html).not.toContain(".drawer-bar{");
  });

  it("should still place the boot script ahead of the body", () => {
    const html = renderPage(page(), {
      css: "",
      boot: "BOOT_MARKER;",
      runtime: "RUNTIME_MARKER;",
    });

    // a scheme applied after the body exists is a flash of the wrong palette,
    // which is the one thing the second script cannot fix
    expect(html.indexOf("BOOT_MARKER;")).toBeLessThan(html.indexOf("<body"));
    expect(html.indexOf("RUNTIME_MARKER;")).toBeGreaterThan(
      html.indexOf("<body"),
    );
  });
});
