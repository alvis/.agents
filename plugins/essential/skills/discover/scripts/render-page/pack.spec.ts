import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { packDocument } from "./pack.ts";

/** a one-pixel PNG, so an inlined picture has real bytes behind it. */
const PIXEL = Buffer.from("iVBORw0KGgo=", "base64");

/**
 * writes a set of files into a fresh directory and packs the entry
 * @param files each file's path, relative to the directory, and its contents
 * @param entry which of them to pack
 * @returns the packed document
 */
async function pack(files: Record<string, string | Buffer>, entry = "app.html"): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), "pack-test-"));
  for (const [name, body] of Object.entries(files)) {
    await mkdir(join(base, name, ".."), { recursive: true });
    await writeFile(join(base, name), body);
  }

  return packDocument(join(base, entry), "b");
}

describe("fn:packDocument", () => {
  it("should replace a stylesheet link with the stylesheet itself", async () => {
    const out = await pack({
      "app.html": `<html><link rel="stylesheet" href="site.css"></html>`,
      "site.css": "b{color:red}",
    });

    expect(out).toEqual("<html><style>b{color:red}</style></html>");
  });

  it("should leave a link that is not a stylesheet alone", async () => {
    const out = await pack({ "app.html": `<link rel="canonical" href="page.html">` });

    expect(out).toEqual(`<link rel="canonical" href="page.html">`);
  });

  it("should replace a script src with the script itself", async () => {
    const out = await pack({
      "app.html": `<script src="app.js" defer></script>`,
      "app.js": "console.log(1)",
    });

    expect(out).toEqual(`<script defer>console.log(1)</script>`);
  });

  // the string would close the element it is being put inside; broken up, the
  // parser reads past it and the JavaScript still means the same thing
  it("should break up a closing script tag hiding inside the code", async () => {
    const out = await pack({
      "app.html": `<script src="app.js"></script>`,
      "app.js": `const html = "</script><img>"`,
    });

    expect(out).toContain(String.raw`<\/script>`);
    expect(out.match(/<\/script>/g)).toHaveLength(1);
  });

  it("should encode a picture into the document", async () => {
    const out = await pack({ "app.html": `<img src="a.png" alt="x">`, "a.png": PIXEL });

    expect(out).toEqual(`<img src="data:image/png;base64,iVBORw0KGgo=" alt="x">`);
  });

  it("should encode a picture a stylesheet points at", async () => {
    const out = await pack({
      "app.html": `<style>b{background:url("a.png")}</style>`,
      "a.png": PIXEL,
    });

    expect(out).toContain(`url("data:image/png;base64,iVBORw0KGgo=")`);
  });

  it("should follow an @import and inline what it pulls in", async () => {
    const out = await pack({
      "app.html": `<link rel="stylesheet" href="css/site.css">`,
      "css/site.css": `@import "base.css"; b{color:red}`,
      "css/base.css": "a{color:blue}",
    });

    expect(out).toEqual("<style>a{color:blue} b{color:red}</style>");
  });

  it("should refuse an @import chain deeper than it will follow", async () => {
    await expect(
      pack({
        "app.html": `<link rel="stylesheet" href="a.css">`,
        "a.css": `@import "b.css";`,
        "b.css": `@import "c.css";`,
        "c.css": `@import "d.css";`,
        "d.css": `@import "e.css";`,
        "e.css": `@import "a.css";`,
      }),
    ).rejects.toThrow(/more than 4 files deep/);
  });

  it("should leave a data url alone", async () => {
    const out = await pack({ "app.html": `<img src="data:image/gif;base64,R0lGOD">` });

    expect(out).toEqual(`<img src="data:image/gif;base64,R0lGOD">`);
  });

  it.each([
    ["a stylesheet", `<link rel="stylesheet" href="https://cdn.test/a.css">`],
    ["a script", `<script src="//cdn.test/a.js"></script>`],
    ["a picture", `<img src="http://cdn.test/a.png">`],
  ])("should refuse %s loaded over the network", async (_, markup) => {
    await expect(pack({ "app.html": markup })).rejects.toThrow(/no network requests at all/);
  });

  // the packer rewrites the shapes it knows; the sweep is what catches every
  // other way a document can still reach out
  it("should refuse a reference no rewriting step looks at", async () => {
    await expect(pack({ "app.html": `<iframe src="https://cdn.test/x"></iframe>` })).rejects.toThrow(
      /still loads "https:\/\/cdn.test\/x" over the network/,
    );
  });

  it("should refuse a font the packed CSS would still fetch, saying where it sat", async () => {
    await expect(
      pack({ "app.html": `<style>@font-face{src:url(https://cdn.test/a.woff2)}</style>` }),
    ).rejects.toThrow(/b <style> url\(\): "https:\/\/cdn.test\/a.woff2" is a remote reference/);
  });

  // the one place CSS is never rewritten, so it is the one place the closing
  // sweep has to look at style rather than at src and href
  it("should refuse a remote url hiding in an inline style attribute", async () => {
    await expect(
      pack({ "app.html": `<div style="background:url(https://cdn.test/a.png)"></div>` }),
    ).rejects.toThrow(/still loads "https:\/\/cdn.test\/a.png" over the network/);
  });

  // a link is somewhere the reader may choose to go, not something the
  // document loads, so it costs the page nothing
  it("should leave a remote link the reader would have to click", async () => {
    const out = await pack({ "app.html": `<a href="https://example.test/docs">docs</a>` });

    expect(out).toContain(`href="https://example.test/docs"`);
  });

  it("should refuse a file above the document's own directory", async () => {
    await expect(pack({ "app.html": `<img src="../secret.png">` })).rejects.toThrow(/resolves outside/);
  });

  it("should name the file it could not read", async () => {
    await expect(pack({ "app.html": `<img src="absent.png">` })).rejects.toThrow(
      /cannot read "absent.png" at .*absent\.png/,
    );
  });

  it("should say which document it could not open", async () => {
    await expect(pack({ "app.html": "x" }, "absent.html")).rejects.toThrow(
      /cannot read the embedded document at .*absent\.html/,
    );
  });
});
