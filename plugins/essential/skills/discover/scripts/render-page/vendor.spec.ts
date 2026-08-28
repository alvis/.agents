import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { RenderError } from "./error.ts";
import { PRISM_CACHE, PRISM_VERSION } from "./prism.ts";
import {
  acceptMermaidRuntime,
  CACHE_ROOT,
  getVendorRuntime,
  MERMAID_CACHE,
  MERMAID_CDN_URL,
  MERMAID_VERSION,
  patchFffd,
} from "./vendor.ts";

/**
 * walks up to the repository this spec is checked out in.
 *
 * the marker is the layout rather than a VCS directory, so the check holds in a
 * jj workspace, a git clone and a linked worktree alike.
 * @returns the absolute repository root
 */
function repositoryRoot(): string {
  let at = import.meta.dirname;
  while (basename(at) !== "plugins") {
    const up = dirname(at);
    if (up === at) throw new Error("this spec is not under plugins/");
    at = up;
  }

  return dirname(at);
}

/** a body that satisfies every Mermaid validator, so a test can break one at a time. */
function bundle(extra = ""): string {
  const filler = "x".repeat(1_000_100);
  return `${filler}flowchart-v2 ${extra} ;globalThis["mermaid"] = {};`;
}

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), "vendor-test-"));
}

describe("const:CACHE_ROOT", () => {
  it("should keep every downloaded bundle outside this repository", () => {
    // D-69 — a checkout carries no vendored copy of somebody else's minified
    // JavaScript. Measured against the repository this spec sits in, so a cache
    // that moved back inside it fails here rather than reading as a path shape
    const root = repositoryRoot();

    for (const cache of [CACHE_ROOT, MERMAID_CACHE, PRISM_CACHE])
      expect(relative(root, cache).startsWith("..")).toBe(true);
  });

  it("should keep both bundles under the one root", () => {
    expect(dirname(MERMAID_CACHE)).toEqual(CACHE_ROOT);
    expect(dirname(PRISM_CACHE)).toEqual(CACHE_ROOT);
  });

  it("should name the release each cached file holds", () => {
    // a filename without the version reads a bundle the pin no longer names
    expect(MERMAID_CDN_URL).toContain(`mermaid@${MERMAID_VERSION}`);
    expect(basename(MERMAID_CACHE)).toEqual(
      `mermaid-${MERMAID_VERSION}.cache.js`,
    );
    expect(basename(PRISM_CACHE)).toEqual(`prism-${PRISM_VERSION}.cache.js`);
  });
});

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
  it("should return the cached copy without reaching the network", async () => {
    const cache = join(await scratch(), "runtime.cache.js");
    await writeFile(cache, "cached body", "utf8");

    expect(
      await getVendorRuntime("Test", "https://invalid.test/none.js", cache),
    ).toEqual("cached body");
  });

  it("should validate the cached copy it returns", async () => {
    const cache = join(await scratch(), "runtime.cache.js");
    await writeFile(cache, "too short to be a bundle", "utf8");

    await expect(
      getVendorRuntime(
        "Mermaid",
        "https://invalid.test/none.js",
        cache,
        acceptMermaidRuntime,
      ),
    ).rejects.toBeInstanceOf(RenderError);
  });

  // a corrupt cache is fatal rather than silently re-downloaded, so the
  // refusal has to name the file whose deletion is the whole remedy
  it("should name the cache file when the cached copy is refused", async () => {
    const cache = join(await scratch(), "runtime.cache.js");
    await writeFile(cache, "too short to be a bundle", "utf8");

    await expect(
      getVendorRuntime(
        "Mermaid",
        "https://invalid.test/none.js",
        cache,
        acceptMermaidRuntime,
      ),
    ).rejects.toThrow(`delete ${MERMAID_CACHE} so the next run downloads a fresh copy`);
  });

  it("should download only when nothing is cached", async () => {
    const cache = join(await scratch(), "nested", "runtime.cache.js");
    const url = "data:text/javascript,downloaded%20body";

    expect(await getVendorRuntime("Test", url, cache)).toEqual("downloaded body");
    expect(await readFile(cache, "utf8")).toEqual("downloaded body");
  });

  it("should name both the missing cache and the failed download", async () => {
    const cache = join(await scratch(), "absent.cache.js");

    await expect(
      getVendorRuntime("Test", "https://invalid.test/none.js", cache),
    ).rejects.toThrow(
      /no cached Test runtime at .*absent\.cache\.js, and it could not be downloaded from https:\/\/invalid\.test\/none\.js/,
    );
  });
});
