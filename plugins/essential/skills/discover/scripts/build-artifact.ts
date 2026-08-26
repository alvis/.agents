#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

/** defines the external vendor fetch contract */
export type VendorFetch = (
  url: string,
  options?: RequestInit,
) => Promise<Response>;

/** contains one complete browser script and its exact package versions */
export interface VendorRuntimeBundle {
  includesMermaid: boolean;
  script: string;
  versions: string[];
}

/** controls fragment assembly and deterministic runtime injection */
export interface BuildOptions {
  artifact: boolean;
  runtime?: VendorRuntimeBundle;
}

interface VendorDescriptor {
  assetPath: string;
  fileName: string;
  label: string;
  packageName: string;
  registryUrl: string;
  validate?: (text: string) => void;
}

interface DownloadedVendor {
  fileName: string;
  version: string;
}

interface BundleVendorRuntimeOptions {
  includeMermaid?: boolean;
  temporaryRoot?: string;
  fetcher?: VendorFetch;
}

/** resolves every source and asset path against the Discover skill tree */
export const DISCOVER_ROOT = resolve(import.meta.dirname, "..");
const ASSETS_ROOT = join(DISCOVER_ROOT, "assets", "html");
const EXAMPLES_ROOT = join(DISCOVER_ROOT, "examples", "html");
const TEMPLATES_ROOT = join(DISCOVER_ROOT, "templates", "html");
const EXAMPLES_SRC_ROOT = join(DISCOVER_ROOT, "examples", "src");
const TEMPLATES_SRC_ROOT = join(DISCOVER_ROOT, "templates", "src");
const DISCOVERY_CSS = join(ASSETS_ROOT, "discovery.css");
const DISCOVERY_JS = join(ASSETS_ROOT, "discovery.js");
/** marks a board that needs the Mermaid runtime */
export const MERMAID_MARKER_ATTR = "data-mermaid";
const DYNAMIC_IMPORT_RE = /\bimport\s*\(/;
const MERMAID_GLOBAL_RE = /globalThis(?:\["mermaid"\]|\.mermaid)\s*=/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const CDN_ROOT = "https://cdn.jsdelivr.net/npm";
const VENDOR_WORKSPACE_PREFIX = "essential-discover-vendor-";
const SECTIONS_MARKER = "<!-- {{SECTIONS}} -->";
const INCLUDE_RE =
  /^[^\S\n]*<!-- \{\{INCLUDE:[^\S\n]*(?<path>[^\s{}]+)[^\S\n]*\}\} -->[^\S\n]*(?:\n|$)/gm;
const RAW_FFFD = "\ufffd";
const ESCAPED_FFFD = "\\uFFFD";
const GENERATED_BANNER =
  "GENERATED — do not edit; edit sources under plugins/essential/skills/discover/assets/ and rebuild with scripts/build-artifact.ts";
const SELECTION_STYLE = `<style>
      ::selection {
        background: var(--ui-accent-soft);
        color: var(--ui-accent-ink);
      }
    </style>`;
const BOARD_THEME_BLOCK_RE =
  /<style[^>]*\bdata-board-theme\b[^>]*>([\s\S]*?)<\/style>/gi;

const TAILWIND_VENDOR: VendorDescriptor = {
  assetPath: "dist/index.global.js",
  fileName: "tailwind.js",
  label: "Tailwind",
  packageName: "@tailwindcss/browser",
  registryUrl:
    "https://registry.npmjs.org/@tailwindcss%2Fbrowser/latest",
};

const MERMAID_VENDOR: VendorDescriptor = {
  assetPath: "dist/mermaid.min.js",
  fileName: "mermaid.js",
  label: "Mermaid",
  packageName: "mermaid",
  registryUrl: "https://registry.npmjs.org/mermaid/latest",
  validate: acceptMermaidRuntime,
};

/** represents a board, include, or vendor runtime validation failure */
export class BuildError extends Error {}

/**
 * replaces raw U+FFFD replacement characters with their escaped source form
 * @param text vendor runtime text as downloaded
 * @returns patched text safe to embed verbatim in generated HTML
 */
export function patchFffd(text: string): string {
  return text.replaceAll(RAW_FFFD, ESCAPED_FFFD);
}

/**
 * downloads current browser runtimes into a unique workspace and bundles them
 * @param options controls conditional Mermaid inclusion and test boundaries
 * @returns one self-contained browser script with exact package provenance
 */
export async function bundleVendorRuntime(
  options: BundleVendorRuntimeOptions = {},
): Promise<VendorRuntimeBundle> {
  const fetcher = options.fetcher ?? fetch;
  const workspace = await mkdtemp(
    join(options.temporaryRoot ?? tmpdir(), VENDOR_WORKSPACE_PREFIX),
  );
  try {
    const vendors = options.includeMermaid
      ? [TAILWIND_VENDOR, MERMAID_VENDOR]
      : [TAILWIND_VENDOR];
    const downloaded = await Promise.all(
      vendors.map((vendor) => downloadVendor(vendor, workspace, fetcher)),
    );
    await writeFile(
      join(workspace, "discovery.js"),
      await read(DISCOVERY_JS, "discovery.js"),
      "utf8",
    );
    const imports = [
      ...downloaded.map(({ fileName }) => `import "./${fileName}";`),
      'import "./discovery.js";',
    ];
    const entry = join(workspace, "entry.js");
    await writeFile(entry, `${imports.join("\n")}\n`, "utf8");
    const output = join(workspace, "runtime.js");
    const result = spawnSync(
      "bun",
      [
        "build",
        entry,
        "--target=browser",
        "--format=iife",
        "--minify",
        "--outfile",
        output,
      ],
      { encoding: "utf8" },
    );
    if (result.error)
      throw new BuildError("could not start Bun to bundle vendor runtimes", {
        cause: result.error,
      });
    if (result.status !== 0)
      throw new BuildError(
        `could not bundle vendor runtimes: ${result.stderr.trim()}`,
      );
    const script = patchFffd(await readFile(output, "utf8"));
    if (!script)
      throw new BuildError(
        "vendor bundling emitted an empty browser runtime",
      );
    if (DYNAMIC_IMPORT_RE.test(script))
      throw new BuildError(
        "the vendor bundle retained a dynamic import(), so the board would not be self-contained",
      );
    return {
      includesMermaid: options.includeMermaid ?? false,
      script,
      versions: downloaded.map(
        ({ version }, index) => `${vendors[index].packageName}@${version}`,
      ),
    };
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
}

/**
 * resolves a slug or path to an existing board source directory or HTML file
 * @param source slug, file path, or directory path naming a board
 * @returns an existing path accepted by composeDirectory and build
 */
export async function resolveSource(source: string): Promise<string> {
  const candidate = resolve(source);
  if (await isDirectory(candidate)) {
    if (!(await exists(join(candidate, "page.html"))))
      throw new BuildError(`directory source missing page.html: ${candidate}`);
    return candidate;
  }
  if (await exists(candidate)) return candidate;
  const stem = source.endsWith(".html") ? source.slice(0, -5) : source;
  for (const directory of [
    join(EXAMPLES_SRC_ROOT, stem),
    join(TEMPLATES_SRC_ROOT, stem),
  ])
    if (await exists(join(directory, "page.html"))) return directory;
  for (const file of [
    join(EXAMPLES_ROOT, `${stem}.html`),
    join(TEMPLATES_ROOT, `${stem}.html`),
  ])
    if (await exists(file)) return file;
  throw new BuildError(
    `No board source found for '${source}' (looked in ${EXAMPLES_SRC_ROOT}, ${TEMPLATES_SRC_ROOT}, ${EXAMPLES_ROOT} and ${TEMPLATES_ROOT})`,
  );
}
/**
 * composes a modular source directory into one HTML document
 * @param sourceDir directory holding page.html and a sections/ folder
 * @returns the composed document with every include expanded
 */
export async function composeDirectory(sourceDir: string): Promise<string> {
  const page = join(sourceDir, "page.html");
  if (!(await exists(page)))
    throw new BuildError(`directory source missing page.html: ${page}`);
  const shell = await readFile(page, "utf8");
  const sectionsDir = join(sourceDir, "sections");
  const files = (await exists(sectionsDir))
    ? (await readdir(sectionsDir))
        .filter((file) => file.endsWith(".html"))
        .sort()
    : [];
  if (!files.length)
    throw new BuildError(
      `directory source needs at least one sections/*.html file: ${sectionsDir}`,
    );
  const marker = new RegExp(
    `^[^\\S\\n]*${SECTIONS_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\S\\n]*(?:\\n|$)`,
    "gm",
  );
  const matches = shell.match(marker) ?? [];
  if (matches.length !== 1)
    throw new BuildError(
      `page.html must contain exactly one '${SECTIONS_MARKER}' marker line; found ${matches.length}`,
    );
  const sections = (
    await Promise.all(
      files.map((file) => readFile(join(sectionsDir, file), "utf8")),
    )
  ).join("");
  return resolveIncludes(shell.replace(marker, sections), sourceDir);
}
/**
 * compiles a board source into a self-contained HTML document
 * @param sourcePath board file or directory produced by resolveSource
 * @param options artifact selects fragment assembly; runtime supplies a
 *   deterministic bundle for tests and internal validation
 * @returns the generated HTML ready to write to disk
 */
export async function build(
  sourcePath: string,
  options: BuildOptions,
): Promise<string> {
  let html = await ((await isDirectory(sourcePath))
    ? composeDirectory(sourcePath)
    : read(sourcePath, "board source"));
  const css = await read(DISCOVERY_CSS, "discovery.css");
  const hasMermaid = html.includes(MERMAID_MARKER_ATTR);
  const runtime =
    options.runtime ??
    (await bundleVendorRuntime({ includeMermaid: hasMermaid }));
  if (hasMermaid && !runtime.includesMermaid)
    throw new BuildError("a board with data-mermaid needs a Mermaid bundle");
  const theme = html.match(BOARD_THEME_BLOCK_RE)?.[0]?.trim() ?? "";
  html = html.replace(BOARD_THEME_BLOCK_RE, "");
  const cssStyle = inlineStyle(css);
  const runtimeScript = inlineScript(runtime.script);
  const vendorBanner = `<!-- Vendors: ${runtime.versions.join(", ")} -->`;
  let output: string;
  if (options.artifact) {
    const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const themeStyle = html.match(
      /<style\s+type="text\/tailwindcss">[\s\S]*?<\/style>/,
    )?.[0];
    const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/)?.[1];
    const missingParts = [
      ["<title>", title],
      ['<style type="text/tailwindcss">', themeStyle],
      ["<body>", body],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missingParts.length)
      throw new BuildError(
        `Fragment source missing: ${missingParts.join(", ")}`,
      );
    output =
      [
        `<!-- ${GENERATED_BANNER} -->`,
        vendorBanner,
        `<title>${title!.trim()}</title>`,
        themeStyle!,
        SELECTION_STYLE,
        cssStyle,
        ...(theme ? [theme] : []),
        body!.trim(),
        runtimeScript,
      ].join("\n") + "\n";
  } else {
    let headCount = 0;
    html = html.replace(/\s*<\/head>/i, () => {
      headCount += 1;
      return `\n    ${cssStyle}${theme ? `\n    ${theme}` : ""}\n  </head>`;
    });
    if (headCount !== 1)
      throw new BuildError(
        "Could not locate </head> to inject discovery.css and the Tailwind runtime",
      );
    let bodyCount = 0;
    html = html.replace(/\s*<\/body>/i, () => {
      bodyCount += 1;
      return `    ${runtimeScript}\n  </body>`;
    });
    if (bodyCount !== 1)
      throw new BuildError("Could not locate </body> to append discovery.js");
    output = `<!-- ${GENERATED_BANNER} -->\n${vendorBanner}\n${html}`;
  }
  return output;
}

/**
 * derives the default emitted-page path for a modular example or template source
 * @param sourceDir modular source directory under examples/src/ or templates/src/
 * @returns sibling examples/html/ or templates/html/ path ending in .html
 */
export function emitPageDefault(sourceDir: string): string {
  const parent = resolve(sourceDir, "..");
  const name = basename(sourceDir);
  if (parent === resolve(EXAMPLES_SRC_ROOT))
    return join(EXAMPLES_ROOT, `${name}.html`);
  if (parent === resolve(TEMPLATES_SRC_ROOT))
    return join(TEMPLATES_ROOT, `${name}.html`);
  throw new BuildError(
    "--emit-page needs an explicit PATH for a directory source outside examples/src/ or templates/src/",
  );
}
/**
 * parses command-line arguments and builds the requested board artifact
 * @param argv arguments following the script name
 * @returns process exit code: 0 success, 2 usage error, 1 build failure
 */
export async function main(argv = Bun.argv.slice(2)): Promise<number> {
  let artifact = false,
    out: string | undefined,
    emitPage: string | true | undefined,
    source: string | undefined;
  const usage =
    "usage: build-artifact.ts [-h] [--artifact] [-o OUT] [--emit-page [PATH]] [source]";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      console.log(
        `${usage}\n\nCompile a Discover review-surface board into a self-contained HTML artifact.`,
      );
      return 0;
    } else if (arg === "--artifact") artifact = true;
    else if (arg === "-o" || arg === "--out" || arg.startsWith("--out=")) {
      out = arg.startsWith("--out=")
        ? arg.slice("--out=".length)
        : argv[++index];
      if (!out) {
        console.error(
          `${usage}\nbuild-artifact.ts: error: argument ${arg}: expected one argument`,
        );
        return 2;
      }
    } else if (arg === "--emit-page" || arg.startsWith("--emit-page=")) {
      if (arg.startsWith("--emit-page=")) {
        emitPage = arg.slice("--emit-page=".length);
        continue;
      }
      emitPage =
        argv[index + 1] && !argv[index + 1].startsWith("-")
          ? argv[++index]
          : true;
    } else if (arg.startsWith("-")) {
      console.error(
        `${usage}\nbuild-artifact.ts: error: unrecognized arguments: ${arg}`,
      );
      return 2;
    } else if (!source) source = arg;
    else {
      console.error(
        `${usage}\nbuild-artifact.ts: error: unrecognized arguments: ${arg}`,
      );
      return 2;
    }
  }
  try {
    if (!source) {
      console.error(
        `${usage}\nbuild-artifact.ts: error: a board source is required`,
      );
      return 2;
    }
    const sourcePath = await resolveSource(source);
    if (emitPage !== undefined) {
      if (!(await isDirectory(sourcePath)))
        throw new BuildError(
          "--emit-page is only valid for a directory (modular) source",
        );
      const target =
        emitPage === true ? emitPageDefault(sourcePath) : resolve(emitPage);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, await composeDirectory(sourcePath), "utf8");
      console.log(target);
      return 0;
    }
    const output = await build(sourcePath, { artifact });
    const suffix = artifact ? ".artifact.html" : ".html";
    const target = resolve(
      out ??
        join(
          tmpdir(),
          "essential-discover-dist",
          `${basename(sourcePath, extname(sourcePath))}${suffix}`,
        ),
    );
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, output, "utf8");
    console.log(target);
    return 0;
  } catch (error) {
    console.error(`build failed: ${(error as Error).message}`);
    return 1;
  }
}

async function resolveIncludes(
  text: string,
  sourceDir: string,
): Promise<string> {
  const runRoot = resolve(sourceDir, "..");
  let result = "";
  let offset = 0;
  for (const match of text.matchAll(INCLUDE_RE)) {
    const include = match.groups?.path ?? "";
    const target = resolve(runRoot, include);
    if (
      relative(runRoot, target).startsWith("..") ||
      isAbsolute(relative(runRoot, target))
    )
      throw new BuildError(
        `include path '${include}' in ${join(sourceDir, "page.html")} escapes the run root ${runRoot}`,
      );
    if (!(await exists(target)))
      throw new BuildError(
        `missing include '${include}' for ${sourceDir}: ${target}`,
      );
    const partial = await readFile(target, "utf8");
    if (INCLUDE_RE.test(partial))
      throw new BuildError(
        `include ${target} itself includes another partial; keep shared sources one level deep`,
      );
    result += text.slice(offset, match.index) + partial;
    offset = (match.index ?? 0) + match[0].length;
  }
  return result + text.slice(offset);
}

function inlineScript(body: string): string {
  return `<script>\n${body.replaceAll("</script", "<\\/script")}\n</script>`;
}

function inlineStyle(body: string): string {
  if (body.includes("</style"))
    throw new BuildError("stylesheet contains a </style break-out sequence");
  return `<style>\n${body}\n</style>`;
}

async function downloadVendor(
  vendor: VendorDescriptor,
  workspace: string,
  fetcher: VendorFetch,
): Promise<DownloadedVendor> {
  const version = await resolveLatestVersion(vendor, fetcher);
  const url = `${CDN_ROOT}/${vendor.packageName}@${version}/${vendor.assetPath}`;
  const text = patchFffd(
    await fetchVendorText(url, `${vendor.label} runtime`, fetcher),
  );
  vendor.validate?.(text);
  if (text.includes(RAW_FFFD))
    throw new BuildError(
      `U+FFFD survived patching the downloaded ${vendor.label} runtime`,
    );
  await writeFile(join(workspace, vendor.fileName), text, "utf8");
  return { fileName: vendor.fileName, version };
}

async function resolveLatestVersion(
  vendor: VendorDescriptor,
  fetcher: VendorFetch,
): Promise<string> {
  const text = await fetchVendorText(
    vendor.registryUrl,
    `${vendor.label} package metadata`,
    fetcher,
  );
  let metadata: unknown;
  try {
    metadata = JSON.parse(text);
  } catch (error) {
    throw new BuildError(
      `could not parse ${vendor.label} package metadata from ${vendor.registryUrl}`,
      { cause: error as Error },
    );
  }
  if (
    metadata === null ||
    typeof metadata !== "object" ||
    !("version" in metadata) ||
    typeof metadata.version !== "string" ||
    !VERSION_RE.test(metadata.version)
  )
    throw new BuildError(
      `${vendor.label} package metadata returned an invalid latest version`,
    );
  return metadata.version;
}

async function fetchVendorText(
  url: string,
  label: string,
  fetcher: VendorFetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(url, {
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new BuildError(`could not download ${label} from ${url}`, {
      cause: error as Error,
    });
  }
  if (!response.ok)
    throw new BuildError(
      `could not download ${label} from ${url}: ${response.status} ${response.statusText}`,
    );
  try {
    return await response.text();
  } catch (error) {
    throw new BuildError(`could not read ${label} from ${url}`, {
      cause: error as Error,
    });
  }
}

function acceptMermaidRuntime(text: string): void {
  if (!MERMAID_GLOBAL_RE.test(text))
    throw new BuildError(
      "the latest Mermaid browser bundle does not publish the global runtime discovery.js requires",
    );
  if (DYNAMIC_IMPORT_RE.test(text))
    throw new BuildError(
      "the latest Mermaid browser bundle contains a dynamic import(), so it cannot produce a self-contained board",
    );
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function read(path: string, label: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    throw new BuildError(`Missing ${label}: ${path}`);
  }
}

if (import.meta.main) process.exit(await main());
