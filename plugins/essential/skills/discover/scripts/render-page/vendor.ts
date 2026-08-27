import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { RenderError } from "./error.ts";

/** root of the Discover skill tree every asset path resolves against. */
const DISCOVER_ROOT = resolve(import.meta.dirname, "..", "..");
const VENDOR_ROOT = join(DISCOVER_ROOT, "assets", "html", "vendor");

/** CDN URL the Mermaid runtime downloads from. */
export const MERMAID_CDN_URL =
  "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
/** local cache path for the downloaded Mermaid bundle. */
export const MERMAID_CACHE = join(VENDOR_ROOT, "mermaid.cache.js");
/** substring identifying an official Mermaid release bundle. */
export const MERMAID_BUNDLE_SIGNATURE = "flowchart-v2";
const MERMAID_BUNDLE_TAIL = 'globalThis["mermaid"] =';
const MERMAID_BUNDLE_TAIL_WINDOW = 4096;
const MERMAID_BUNDLE_MIN_BYTES = 1_000_000;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(/;
const RAW_FFFD = "�";
const ESCAPED_FFFD = "\\uFFFD";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * replaces raw U+FFFD replacement characters with their escaped source form.
 *
 * a bundle inlined into HTML travels through a document whose encoding we do
 * not control; a raw replacement character that survives that trip is a
 * corrupted byte in the middle of executable source.
 * @param text vendor runtime text as downloaded
 * @returns patched text safe to embed verbatim in generated HTML
 */
export function patchFffd(text: string): string {
  return text.replaceAll(RAW_FFFD, ESCAPED_FFFD);
}

/**
 * refuses anything that is not a whole, self-contained Mermaid release.
 *
 * the dynamic-import check is the one that matters most for a self-contained
 * board: a build that lazy-loads its grammars renders those diagrams empty
 * offline, and does it silently, long after anyone is watching.
 * @param text the bundle source to judge
 * @param origin where the text came from, named in any refusal
 */
export function acceptMermaidRuntime(text: string, origin = "downloaded"): void {
  const detail = `the ${origin} Mermaid runtime (${text.length} bytes)`;
  const remedy =
    origin === "cached"
      ? `delete ${MERMAID_CACHE} so the next run downloads a fresh copy`
      : `pin a release that does, or check ${MERMAID_CDN_URL} by hand`;
  if (text.length < MERMAID_BUNDLE_MIN_BYTES)
    throw new RenderError(
      `${detail} is far below the ${MERMAID_BUNDLE_MIN_BYTES} byte floor, so it is not the bundle; ${remedy}`,
    );
  if (!text.includes(MERMAID_BUNDLE_SIGNATURE))
    throw new RenderError(
      `${detail} does not contain '${MERMAID_BUNDLE_SIGNATURE}', so it is not the expected bundle; ${remedy}`,
    );
  if (!text.slice(-MERMAID_BUNDLE_TAIL_WINDOW).includes(MERMAID_BUNDLE_TAIL))
    throw new RenderError(
      `${detail} does not end by publishing the global ('${MERMAID_BUNDLE_TAIL}' is absent from its last ${MERMAID_BUNDLE_TAIL_WINDOW} bytes), so the body is truncated or the release changed how it exports; ${remedy}`,
    );
  if (DYNAMIC_IMPORT_RE.test(text))
    throw new RenderError(
      `${detail} contains a dynamic import(), so some diagram types would load over the network and silently render empty in a self-contained board; pin a UMD build that bundles every grammar`,
    );
}

/**
 * loads a vendored browser runtime, preferring the copy already on disk.
 *
 * this is the only place that reaches the network, and it reaches it once:
 * the cache is what makes a board reproducible offline, so a validated copy
 * is returned without asking the CDN whether a newer one exists. a cached
 * copy that fails validation is fatal rather than silently re-downloaded,
 * because the refusal names the file to delete and the next run then fetches.
 * @param label the runtime's name, used in every message
 * @param url where a fresh copy is downloaded from when the cache is empty
 * @param cache where the copy is kept between runs
 * @param accept a validator run against whichever copy is returned
 * @returns the runtime JavaScript source
 */
export async function getVendorRuntime(
  label: string,
  url: string,
  cache: string,
  accept?: (text: string, origin?: string) => void,
): Promise<string> {
  if (await exists(cache)) {
    const cached = await readFile(cache, "utf8");
    accept?.(cached, "cached");
    return cached;
  }
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  } catch (error) {
    throw new RenderError(
      `no cached ${label} runtime at ${cache}, and it could not be downloaded from ${url}: ${String(error as Error)}`,
    );
  }
  if (!response.ok)
    throw new RenderError(
      `no cached ${label} runtime at ${cache}, and ${url} answered ${response.status} ${response.statusText}`,
    );
  const patched = patchFffd(await response.text());
  if (patched.includes(RAW_FFFD))
    throw new RenderError(
      `U+FFFD survived patching the downloaded ${label} runtime`,
    );
  accept?.(patched, "downloaded");
  await mkdir(dirname(cache), { recursive: true });
  await writeFile(cache, patched, "utf8");
  return patched;
}

/**
 * loads the Mermaid bundle, preferring the cache, and validates its shape.
 * @returns the bundle JavaScript source
 */
export const getMermaidRuntime = (): Promise<string> =>
  getVendorRuntime(
    "Mermaid",
    MERMAID_CDN_URL,
    MERMAID_CACHE,
    acceptMermaidRuntime,
  );
