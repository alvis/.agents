import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RenderError } from "./error.ts";
import { acceptMermaidRuntime, getVendorRuntime, patchFffd } from "./vendor.ts";

/** a body that satisfies every Mermaid validator, so a test can break one at a time. */
function bundle(extra = ""): string {
  const filler = "x".repeat(1_000_100);
  return `${filler}flowchart-v2 ${extra} ;globalThis["mermaid"] = {};`;
}

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), "vendor-test-"));
}

describe("fn:patchFffd", () => {
  it("should escape a raw replacement character", () => {
    const raw = String.fromCharCode(0xfffd);

    expect(patchFffd(`before${raw}after`)).toEqual("before\\uFFFDafter");
  });

  it("should leave text without one untouched", () => {
    expect(patchFffd("nothing to patch")).toEqual("nothing to patch");
  });
});

describe("fn:acceptMermaidRuntime", () => {
  it("should accept a whole bundle", () => {
    expect(() => acceptMermaidRuntime(bundle())).not.toThrow();
  });

  it("should refuse a body below the size floor", () => {
    expect(() => acceptMermaidRuntime('flowchart-v2 globalThis["mermaid"] =')).toThrow(
      /far below the 1000000 byte floor/,
    );
  });

  it("should refuse a body that is not the expected bundle", () => {
    const wrong = `${"x".repeat(1_000_100)}globalThis["mermaid"] = {};`;

    expect(() => acceptMermaidRuntime(wrong)).toThrow(/does not contain 'flowchart-v2'/);
  });

  it("should refuse a body that never publishes the global", () => {
    const truncated = `${"x".repeat(1_000_100)}flowchart-v2`;

    expect(() => acceptMermaidRuntime(truncated)).toThrow(/does not end by publishing the global/);
  });

  // the one that matters offline: a lazy-loading build renders those diagram
  // types empty, silently, on a machine with no network
  it("should refuse a body that would load grammars over the network", () => {
    expect(() => acceptMermaidRuntime(bundle("import('./flowchart.js')"))).toThrow(
      /contains a dynamic import\(\)/,
    );
  });

  it("should name where the body came from", () => {
    expect(() => acceptMermaidRuntime("short", "cached")).toThrow(/the cached Mermaid runtime/);
  });
});

describe("fn:getVendorRuntime", () => {
  it("should read the cache and skip the network when offline", async () => {
    const cache = join(await scratch(), "runtime.cache.js");
    await writeFile(cache, "cached body", "utf8");

    expect(
      await getVendorRuntime("Test", "https://invalid.test/none.js", cache, {
        offline: true,
      }),
    ).toEqual("cached body");
  });

  it("should refuse offline when nothing is cached", async () => {
    const cache = join(await scratch(), "absent.cache.js");

    await expect(
      getVendorRuntime("Test", "https://invalid.test/none.js", cache, {
        offline: true,
      }),
    ).rejects.toThrow(/no cached Test runtime; run once with network or without --offline/);
  });

  it("should validate the cached copy it returns", async () => {
    const cache = join(await scratch(), "runtime.cache.js");
    await writeFile(cache, "too short to be a bundle", "utf8");

    await expect(
      getVendorRuntime(
        "Mermaid",
        "https://invalid.test/none.js",
        cache,
        { offline: true },
        acceptMermaidRuntime,
      ),
    ).rejects.toBeInstanceOf(RenderError);
  });

  it("should fall back to the cache when the network fails", async () => {
    const cache = join(await scratch(), "runtime.cache.js");
    await writeFile(cache, "stale but usable", "utf8");

    expect(
      await getVendorRuntime("Test", "https://invalid.test/none.js", cache, {}),
    ).toEqual("stale but usable");
  });

  // --refresh exists to get a *new* copy; silently handing back the old one
  // would make the flag a lie precisely when someone is trying to fix a bundle
  it("should refuse rather than fall back when refreshing", async () => {
    const cache = join(await scratch(), "runtime.cache.js");
    await writeFile(cache, "stale", "utf8");

    await expect(
      getVendorRuntime("Test", "https://invalid.test/none.js", cache, {
        refresh: true,
      }),
    ).rejects.toThrow(/could not fetch Test runtime from https:\/\/invalid.test\/none.js/);
  });

  it("should write what it downloads so the next run can work offline", async () => {
    const cache = join(await scratch(), "nested", "runtime.cache.js");
    const url = "data:text/javascript,downloaded%20body";

    expect(await getVendorRuntime("Test", url, cache, {})).toEqual("downloaded body");
    expect(await readFile(cache, "utf8")).toEqual("downloaded body");
  });
});
