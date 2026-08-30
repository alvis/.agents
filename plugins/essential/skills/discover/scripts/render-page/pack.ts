import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { RenderError } from "./error.ts";
import { remoteHref } from "./href.ts";
import { mimeOf } from "./reference.ts";
import { resolveSrc } from "./resolve-src.ts";

/** references that need no network, so the sweep leaves them alone. */
const SELF_CONTAINED = /^(?:data:|about:blank$|#|$)/i;

/** how many `@import` hops are followed before the chain is called a loop. */
const IMPORT_DEPTH = 4;

/** one attribute value, in any of the three shapes HTML allows. */
const ATTRIBUTE = /(\s(?:src|href)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

/** every opening tag, so the sweep can tell an `<a href>` from a subresource. */
const TAG = /<([a-z][a-z0-9-]*)\b([^>]*)>/gi;

/** a CSS reference to another file. */
const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

/** a stylesheet pulling in another stylesheet. */
const CSS_IMPORT = /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)[^;]*;/gi;

/** the body of a `<style>` element, whose CSS is packed like any other. */
const STYLE = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi;

/** a `<script src>` element, which is replaced by its own contents. */
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

/** a `<link>` element, which becomes a `<style>` when it is a stylesheet. */
const LINK = /<link\b([^>]*)>/gi;

/** an `<img>` element, whose file is inlined as a data URL. */
const IMAGE = /<img\b([^>]*)>/gi;

/** replaces every match, awaiting each replacement in turn. */
async function replaceAll(
  text: string,
  pattern: RegExp,
  replace: (match: RegExpExecArray) => Promise<string>,
): Promise<string> {
  const matches = [...text.matchAll(pattern)] as RegExpExecArray[];
  const replaced = await Promise.all(matches.map(replace));

  return matches.reduceRight(
    (carry, match, index) =>
      carry.slice(0, match.index) +
      replaced[index] +
      carry.slice(match.index + match[0].length),
    text,
  );
}

/** reads one attribute out of a tag's attribute text. */
function attributeOf(attributes: string, name: string): string | undefined {
  const found = new RegExp(
    `\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  ).exec(attributes);

  return found ? (found[1] ?? found[2] ?? found[3]) : undefined;
}

/** reads a file the packed document points at, refusing what cannot be read. */
async function contentsOf(
  reference: string,
  base: string,
  path: string,
): Promise<{ file: string; body: Buffer }> {
  const file = resolveSrc(reference, base, path, base);
  const body = await readFile(file).catch(() => {
    throw new RenderError(
      `${path}: cannot read ${JSON.stringify(reference)} at ${file}`,
    );
  });

  return { file, body };
}

/** inlines every file a stylesheet points at, following `@import` in turn. */
async function packStyles(
  css: string,
  base: string,
  path: string,
  depth: number,
): Promise<string> {
  if (depth > IMPORT_DEPTH)
    throw new RenderError(
      `${path}: @import is more than ${IMPORT_DEPTH} files deep, which is either a very long chain or a loop`,
    );
  const imported = await replaceAll(css, CSS_IMPORT, async (match) => {
    const reference = match[2] ?? match[4] ?? "";
    if (SELF_CONTAINED.test(reference)) return match[0];
    const { file, body } = await contentsOf(reference, base, `${path} @import`);

    return packStyles(body.toString("utf8"), dirname(file), path, depth + 1);
  });

  return replaceAll(imported, CSS_URL, async (match) => {
    const reference = match[2];
    if (SELF_CONTAINED.test(reference)) return match[0];
    const { file, body } = await contentsOf(reference, base, `${path} url()`);
    const mime = mimeOf(file, `${path} url()`);

    return `url("data:${mime};base64,${body.toString("base64")}")`;
  });
}

/** refuses any reference the packed document would still fetch at read time. */
function refuseRemote(document: string, path: string): void {
  for (const [, name, attributes] of document.matchAll(TAG)) {
    const source = attributeOf(attributes, "src");
    // an `<a href>` is a place the reader may choose to go, not something the
    // document loads, so it is the one href this leaves alone
    const link = name.toLowerCase() === "a" ? undefined : attributeOf(attributes, "href");
    // an inline `style` is the one place CSS is not rewritten, because it is
    // never handed to `packStyles`; every `<style>` body and every stylesheet
    // has already been refused by then if it reached out
    const styled = [...(attributeOf(attributes, "style") ?? "").matchAll(CSS_URL)].map(
      ([, , reference]) => reference,
    );
    for (const reference of [source, link, ...styled])
      if (reference && !SELF_CONTAINED.test(reference) && remoteHref(reference))
        throw new RenderError(
          `${path}: the packed document still loads ${JSON.stringify(reference)} over the network, and a board must render with no requests at all`,
        );
  }
}

/**
 * packs one HTML file and everything it loads into a single document.
 *
 * this is what lets the author hand over a *path* rather than markup: the
 * builder reads the entry file, pulls its stylesheets, scripts and pictures
 * into the document itself, and refuses anything that would still reach the
 * network. The result is a string the renderer puts in `srcdoc`, so the board
 * stays one file with no subresources of its own.
 * @param entry absolute path to the document to pack
 * @param path JSON path of the block naming it, used in every refusal
 * @returns the packed document
 */
export async function packDocument(entry: string, path: string): Promise<string> {
  const base = dirname(entry);
  const source = await readFile(entry, "utf8").catch(() => {
    throw new RenderError(`${path}: cannot read the embedded document at ${entry}`);
  });

  const styled = await replaceAll(source, LINK, async (match) => {
    const relation = attributeOf(match[1], "rel") ?? "";
    const href = attributeOf(match[1], "href");
    if (!/\bstylesheet\b/i.test(relation) || !href) return match[0];
    if (SELF_CONTAINED.test(href)) return match[0];
    const { file, body } = await contentsOf(href, base, `${path} <link>`);
    const css = await packStyles(body.toString("utf8"), dirname(file), `${path} <link>`, 1);

    return `<style>${css}</style>`;
  });

  const inlined = await replaceAll(styled, STYLE, async (match) =>
    `${match[1]}${await packStyles(match[2], base, `${path} <style>`, 1)}${match[3]}`,
  );

  const scripted = await replaceAll(inlined, SCRIPT, async (match) => {
    const src = attributeOf(match[1], "src");
    if (!src || SELF_CONTAINED.test(src)) return match[0];
    const { body } = await contentsOf(src, base, `${path} <script>`);
    const rest = match[1].replace(ATTRIBUTE, "").trim();
    // a `</script` inside the code would close the element it is being put
    // inside, so it is broken up rather than escaped: the parser stops looking
    // for the end tag, and the JavaScript still reads as the same string
    const code = body.toString("utf8").replaceAll(/<\/script/gi, String.raw`<\/script`);

    return `<script${rest ? ` ${rest}` : ""}>${code}</script>`;
  });

  const packed = await replaceAll(scripted, IMAGE, async (match) => {
    const src = attributeOf(match[1], "src");
    if (!src || SELF_CONTAINED.test(src)) return match[0];
    const { file, body } = await contentsOf(src, base, `${path} <img>`);
    const mime = mimeOf(file, `${path} <img>`);
    const url = `data:${mime};base64,${body.toString("base64")}`;

    return match[0].replace(ATTRIBUTE, (_, lead: string) => `${lead}"${url}"`);
  });

  refuseRemote(packed, path);

  return packed;
}
