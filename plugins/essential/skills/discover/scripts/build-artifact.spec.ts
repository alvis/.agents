import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  BuildError,
  build,
  bundleVendorRuntime,
  resolveSource,
} from "./build-artifact.ts";
import { removeDirectory, runBun, temporaryDirectory } from "./test-support.ts";

import type {
  VendorFetch,
  VendorRuntimeBundle,
} from "./build-artifact.ts";

const scripts = import.meta.dirname;
const discover = resolve(scripts, "..");
const builder = join(scripts, "build-artifact.ts");
const tailwindRuntime: VendorRuntimeBundle = {
  includesMermaid: false,
  script: "globalThis.__discoverTailwind = true;",
  versions: ["@tailwindcss/browser@test"],
};

function vendorFetch(versionPlan: readonly string[]): VendorFetch {
  const versions = [...versionPlan];
  return async (url) => {
    if (url.endsWith("/latest")) {
      const version = url.includes("tailwindcss")
        ? versions.shift()
        : "11.17.2";
      return Response.json({ version });
    }
    if (url.includes("@tailwindcss/browser@"))
      return new Response("globalThis.__discoverTailwind = true;");
    if (url.includes("mermaid@"))
      return new Response('globalThis["mermaid"] = { run() {} };');
    return new Response("missing", { status: 404 });
  };
}

describe("source composition and building", () => {
  it("should resolve example and template slugs", async () => {
    expect(await resolveSource("specimen-board")).toBe(
      join(discover, "examples/src/specimen-board"),
    );
    expect(await resolveSource("page")).toBe(
      join(discover, "templates/src/page"),
    );
    await expect(
      resolveSource("missing-board-for-test"),
    ).rejects.toBeInstanceOf(BuildError);
  });
  it.each([false, true])(
    "should build self-contained output in artifact=%s mode",
    async (artifact) => {
      await expect(
        build(join(discover, "examples/html/specimen-board.html"), {
          artifact,
          runtime: tailwindRuntime,
        }),
      ).resolves.toBeTypeOf("string");
    },
  );
  it("should resolve fresh versions, bundle downloaded assets, and clean up", async () => {
    const root = await temporaryDirectory();
    try {
      const fetcher = vendorFetch(["4.3.3", "4.3.4"]);
      const first = await bundleVendorRuntime({
        fetcher,
        temporaryRoot: root,
      });
      const second = await bundleVendorRuntime({
        fetcher,
        temporaryRoot: root,
      });
      expect(first.versions).toEqual(["@tailwindcss/browser@4.3.3"]);
      expect(second.versions).toEqual(["@tailwindcss/browser@4.3.4"]);
      expect(await readdir(root)).toEqual([]);
    } finally {
      await removeDirectory(root);
    }
  });
  it("should download Mermaid only when the board needs it", async () => {
    const root = await temporaryDirectory();
    try {
      const requests: string[] = [];
      const fetcher: VendorFetch = async (url, options) => {
        requests.push(url);
        return vendorFetch(["4.3.3"])(url, options);
      };
      const runtime = await bundleVendorRuntime({
        fetcher,
        includeMermaid: true,
        temporaryRoot: root,
      });
      expect(runtime.includesMermaid).toBe(true);
      expect(requests.some((url) => url.includes("mermaid"))).toBe(true);
      const sandbox = { document: { querySelector: () => null } };
      runInNewContext(runtime.script, sandbox);
      expect(Reflect.get(sandbox, "__discoverTailwind")).toBe(true);
      expect(Reflect.get(sandbox, "mermaid")).toBeTypeOf("object");
      expect(await readdir(root)).toEqual([]);
    } finally {
      await removeDirectory(root);
    }
  });
  it.each([
    [
      "globalThis.__notMermaid = {};",
      "the latest Mermaid browser bundle does not publish the global runtime discovery.js requires",
    ],
    [
      'globalThis["mermaid"] = {}; import("./chunk.js");',
      "the latest Mermaid browser bundle contains a dynamic import(), so it cannot produce a self-contained board",
    ],
  ])(
    "should reject an incompatible Mermaid runtime",
    async (mermaidRuntime, message) => {
      const root = await temporaryDirectory();
      try {
        const fetcher: VendorFetch = async (url) => {
          if (url.endsWith("/latest"))
            return Response.json({
              version: url.includes("tailwindcss") ? "4.3.3" : "11.17.2",
            });
          if (url.includes("@tailwindcss/browser@"))
            return new Response("globalThis.__discoverTailwind = true;");
          if (url.includes("mermaid@")) return new Response(mermaidRuntime);
          return new Response("missing", { status: 404 });
        };
        await expect(
          bundleVendorRuntime({
            includeMermaid: true,
            temporaryRoot: root,
            fetcher,
          }),
        ).rejects.toEqual(new BuildError(message));
        expect(await readdir(root)).toEqual([]);
      } finally {
        await removeDirectory(root);
      }
    },
  );
  it("should clean up after a vendor resolution failure", async () => {
    const root = await temporaryDirectory();
    try {
      await expect(
        bundleVendorRuntime({
          fetcher: async () => Response.json({ version: "not-a-version" }),
          temporaryRoot: root,
        }),
      ).rejects.toBeInstanceOf(BuildError);
      expect(await readdir(root)).toEqual([]);
    } finally {
      await removeDirectory(root);
    }
  });
  it("should clean up after a vendor download failure", async () => {
    const root = await temporaryDirectory();
    try {
      await expect(
        bundleVendorRuntime({
          fetcher: async (url) =>
            url.endsWith("/latest")
              ? Response.json({ version: "4.3.3" })
              : new Response("unavailable", {
                  status: 503,
                  statusText: "Service Unavailable",
                }),
          temporaryRoot: root,
        }),
      ).rejects.toBeInstanceOf(BuildError);
      expect(await readdir(root)).toEqual([]);
    } finally {
      await removeDirectory(root);
    }
  });
  it("should preserve context and clean up after a response body failure", async () => {
    const root = await temporaryDirectory();
    const failure = new Error("stream terminated");
    try {
      let thrown: unknown;
      try {
        await bundleVendorRuntime({
          fetcher: async () =>
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.error(failure);
                },
              }),
            ),
          temporaryRoot: root,
        });
      } catch (error) {
        thrown = error;
      }
      const error = thrown as BuildError;
      expect(error).toEqual(
        new BuildError(
          "could not read Tailwind package metadata from https://registry.npmjs.org/@tailwindcss%2Fbrowser/latest",
        ),
      );
      expect(error.cause).toBe(failure);
      expect(await readdir(root)).toEqual([]);
    } finally {
      await removeDirectory(root);
    }
  });
  it("should clean up after Bun rejects a downloaded runtime", async () => {
    const root = await temporaryDirectory();
    try {
      await expect(
        bundleVendorRuntime({
          fetcher: async (url) =>
            url.endsWith("/latest")
              ? Response.json({ version: "4.3.3" })
              : new Response("globalThis.__discoverTailwind = ;"),
          temporaryRoot: root,
        }),
      ).rejects.toBeInstanceOf(BuildError);
      expect(await readdir(root)).toEqual([]);
    } finally {
      await removeDirectory(root);
    }
  });
});

describe("board builder command-line handling", () => {
  it("should accept the help option", () => {
    const result = runBun(builder, ["--help"]);
    expect(result.exitCode).toBe(0);
  });
  it("should report missing source as an argument error", () => {
    const result = runBun(builder);
    expect(result.exitCode).toBe(2);
  });
  it("should emit a composed page and print only its path", async () => {
    const root = await temporaryDirectory();
    try {
      const out = join(root, "page.html");
      const result = runBun(builder, [
        join(discover, "templates/src/page"),
        "--emit-page",
        out,
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(out);
      expect((await stat(out)).isFile()).toBe(true);
    } finally {
      await removeDirectory(root);
    }
  });
  it.each(["--offline", "--refresh-tailwind", "--refresh-mermaid"])(
    "should reject the removed cache option %s",
    (option) => {
      const result = runBun(builder, [option]);
      expect(result.exitCode).toBe(2);
    },
  );
  it("should accept the equals-form emit-page option", async () => {
    const root = await temporaryDirectory();
    try {
      const page = join(root, "page.html");
      const emitted = runBun(builder, [
        join(discover, "templates/src/page"),
        `--emit-page=${page}`,
      ]);
      expect(emitted).toMatchObject({ exitCode: 0, stderr: "" });
      expect(emitted.stdout.trim()).toBe(page);
      expect((await stat(page)).isFile()).toBe(true);
    } finally {
      await removeDirectory(root);
    }
  });
});
