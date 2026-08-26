import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { RenderError } from "./error.ts";

/** root of the Discover skill tree every asset path resolves against. */
const DISCOVER_ROOT = resolve(import.meta.dirname, "..", "..");
const VENDOR_ROOT = join(DISCOVER_ROOT, "assets", "html", "vendor");

/** CDN URL the Tailwind browser runtime downloads from. */
export const TAILWIND_CDN_URL =
  "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4";
/** local cache path for the downloaded Tailwind runtime. */
export const TAILWIND_CACHE = join(VENDOR_ROOT, "tailwind-browser.cache.js");
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

/** how a vendor runtime may be obtained on this run. */
export interface VendorOptions {
  /** download even when a cache exists, and never fall back to one */
  refresh?: boolean;
  /** use the cache only, and refuse rather than reach the network */
  offline?: boolean;
}

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
  if (text.length < MERMAID_BUNDLE_MIN_BYTES)
    throw new RenderError(
      `${detail} is far below the ${MERMAID_BUNDLE_MIN_BYTES} byte floor, so it is not the bundle; re-fetch it with --refresh-mermaid`,
    );
  if (!text.includes(MERMAID_BUNDLE_SIGNATURE))
    throw new RenderError(
      `${detail} does not contain '${MERMAID_BUNDLE_SIGNATURE}', so it is not the expected bundle; re-fetch it with --refresh-mermaid`,
    );
  if (!text.slice(-MERMAID_BUNDLE_TAIL_WINDOW).includes(MERMAID_BUNDLE_TAIL))
    throw new RenderError(
      `${detail} does not end by publishing the global ('${MERMAID_BUNDLE_TAIL}' is absent from its last ${MERMAID_BUNDLE_TAIL_WINDOW} bytes), so the body is truncated or the release changed how it exports; re-fetch it with --refresh-mermaid`,
    );
  if (DYNAMIC_IMPORT_RE.test(text))
    throw new RenderError(
      `${detail} contains a dynamic import(), so some diagram types would load over the network and silently render empty in a self-contained board; pin a UMD build that bundles every grammar`,
    );
}

/**
 * loads a vendored browser runtime from cache or the CDN.
 *
 * this is the only place that reaches the network. the cache is a build
 * artifact, not source: it is gitignored, it regenerates on demand, and its
 * absence is recoverable everywhere except under `offline`.
 * @param label the runtime's name, used in every message
 * @param url where a fresh copy is downloaded from
 * @param cache where the copy is kept between runs
 * @param options how the runtime may be obtained
 * @param accept a validator run against whichever copy is returned
 * @returns the runtime JavaScript source
 */
export async function getVendorRuntime(
  label: string,
  url: string,
  cache: string,
  options: VendorOptions = {},
  accept?: (text: string, origin?: string) => void,
): Promise<string> {
  const checked = (text: string, origin: string): string => {
    accept?.(text, origin);
    return text;
  };
  if (options.offline) {
    if (await exists(cache))
      return checked(await readFile(cache, "utf8"), "cached");
    throw new RenderError(
      `no cached ${label} runtime; run once with network or without --offline`,
    );
  }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok)
      throw new Error(`${response.status} ${response.statusText}`);
    const patched = checked(patchFffd(await response.text()), "downloaded");
    if (patched.includes(RAW_FFFD))
      throw new RenderError(
        `U+FFFD survived patching the downloaded ${label} runtime`,
      );
    await mkdir(dirname(cache), { recursive: true });
    await writeFile(cache, patched, "utf8");
    return patched;
  } catch (error) {
    if (!options.refresh && (await exists(cache))) {
      console.error(
        `warning: could not fetch latest ${label} (${String(error as Error)}); falling back to cached runtime ${cache}`,
      );
      return checked(await readFile(cache, "utf8"), "cached");
    }
    throw new RenderError(
      `could not fetch ${label} runtime from ${url}: ${String(error as Error)}`,
    );
  }
}

/**
 * loads the Tailwind browser runtime from cache or the CDN.
 * @param options how the runtime may be obtained
 * @returns the runtime JavaScript source
 */
export const getTailwindRuntime = (
  options: VendorOptions = {},
): Promise<string> =>
  getVendorRuntime("Tailwind", TAILWIND_CDN_URL, TAILWIND_CACHE, options);

/**
 * loads the Mermaid bundle from cache or the CDN and validates its shape.
 * @param options how the runtime may be obtained
 * @returns the bundle JavaScript source
 */
export const getMermaidRuntime = (
  options: VendorOptions = {},
): Promise<string> =>
  getVendorRuntime(
    "Mermaid",
    MERMAID_CDN_URL,
    MERMAID_CACHE,
    options,
    acceptMermaidRuntime,
  );
