import { readFile } from "node:fs/promises";

import { RenderError } from "./error.ts";
import { packDocument } from "./pack.ts";
import { isSvgPath, mimeOf, resolveSrc } from "./reference.ts";

import type { Block, PageData } from "./types.ts";

/** the block types that name a file beside the data, and how each is read. */
const FILE_BLOCKS = new Set(["svg", "embed", "image"]);

/**
 * how large a file may be before it is refused, by block type.
 *
 * base64 inflates by about a third, so an image is carried at ~1.33× the
 * number below; the ceiling is deliberately low because a board is one file a
 * reader downloads before seeing anything. An embed is allowed more, because a
 * packed prototype legitimately carries its own fonts and scripts.
 */
const BUDGET: Record<string, number> = {
  embed: 4 * 1024 * 1024,
  image: 2 * 1024 * 1024,
  svg: 1024 * 1024,
};

/** one file a board names, and the block type that decides how it is read. */
interface Source {
  /** the path exactly as the author wrote it, which keys the result */
  src: string;
  /** the naming block's type */
  type: string;
  /** JSON path of the naming block, used verbatim in every refusal */
  path: string;
}

/**
 * how a block type reads the file it names.
 *
 * two blocks may share one file only if they read it the same way, so this is
 * the predicate the conflict check asks — not whether the block types differ.
 * An `.svg` named by an `image` block is markup exactly as it is for an `svg`
 * block, and refusing that pair would refuse a drawing reused as a captioned
 * picture for no reason.
 * @param type the naming block's type
 * @param src the path exactly as the author wrote it
 * @returns the form the file is read into
 */
function readingOf(type: string, src: string): "packed" | "markup" | "encoded" {
  if (type === "embed") return "packed";
  if (type === "svg" || isSvgPath(src)) return "markup";

  return "encoded";
}

/**
 * lists every file a board's data names.
 *
 * pure, and asked of the data rather than the rendered page, because the reads
 * have to happen before rendering: `renderPage` is handed contents, never
 * paths.
 * @param data the board's data, as read from disk
 * @returns each file named, without duplicates, in the order met
 * @throws when two blocks claim the same file and would read it differently,
 *   which cannot be satisfied — the same bytes cannot be both a packed
 *   document and an encoded picture
 */
export function sourcesOf(data: PageData): Source[] {
  const found = (data?.sections ?? []).flatMap((section, outer) =>
    (section?.blocks ?? [])
      .map((block: Block, inner) => ({ block, path: `sections[${outer}].blocks[${inner}]` }))
      .filter(({ block }) => FILE_BLOCKS.has(block?.type))
      .filter(({ block }) => typeof (block as { src?: unknown }).src === "string")
      .map(({ block, path }) => ({
        src: (block as unknown as { src: string }).src,
        type: block.type,
        path,
      })),
  );

  const byName = new Map<string, Source>();
  for (const source of found) {
    const seen = byName.get(source.src);
    const reading = readingOf(source.type, source.src);
    if (seen && readingOf(seen.type, seen.src) !== reading)
      throw new RenderError(
        `${source.path}.src: ${JSON.stringify(source.src)} is read as ${readingOf(seen.type, seen.src)} by the ${seen.type} block at ${seen.path} and as ${reading} by this ${source.type} block, and one file cannot be both`,
      );
    if (!seen) byName.set(source.src, source);
  }

  return [...byName.values()];
}

/** reads one named file the way its block type needs it. */
async function readSource(source: Source, base: string): Promise<string> {
  const where = `${source.path}.src`;
  const file = resolveSrc(source.src, base, where);
  const reading = readingOf(source.type, source.src);
  if (reading === "packed") {
    const packed = await packDocument(file, where);
    refuseWeight(Buffer.byteLength(packed), source, packed.length);

    return packed;
  }

  const body = await readFile(file).catch(() => {
    throw new RenderError(`cannot read ${JSON.stringify(source.src)} at ${file}`);
  });
  refuseWeight(body.byteLength, source, body.byteLength);
  // an SVG is inlined as markup rather than encoded, so its own text inherits
  // the page's tokens and stays selectable; every other picture is encoded
  if (reading === "markup") return body.toString("utf8");

  return `data:${mimeOf(file, where)};base64,${body.toString("base64")}`;
}

/** refuses a file above its type's budget, naming what it would have cost. */
function refuseWeight(bytes: number, source: Source, raw: number): void {
  const limit = BUDGET[source.type] ?? Number.POSITIVE_INFINITY;
  if (bytes <= limit) return;
  const carried = source.type === "image" ? Math.ceil((raw * 4) / 3) : bytes;
  throw new RenderError(
    `${source.path}.src: ${JSON.stringify(source.src)} is ${bytes.toLocaleString("en-US")} bytes, above the ${limit.toLocaleString("en-US")}-byte budget for a ${source.type} block; it would add ${carried.toLocaleString("en-US")} bytes to a board a reader downloads before seeing anything`,
  );
}

/**
 * reads every file a board names, keyed by the `src` the author wrote.
 *
 * keyed by the written form, not the resolved one, so the renderer can look a
 * file up using exactly what it reads out of the block. What each value holds
 * depends on the block that named it: an embed is a packed document, an SVG is
 * markup, and any other picture is a data URL.
 * @param data the board's data
 * @param base the directory the data file sits in
 * @returns the contents, ready to hand to `renderPage`
 */
export async function readSources(
  data: PageData,
  base: string,
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    sourcesOf(data).map(
      async (source) => [source.src, await readSource(source, base)] as const,
    ),
  );

  return Object.fromEntries(entries);
}
