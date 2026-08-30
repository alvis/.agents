/**
 * what a board may name beside its own data, and how each is read.
 *
 * nothing here touches a disk. `page.ts` reaches this module through the
 * blocks that ask what a reference *is*, and a renderer whose whole contract
 * is purity cannot be one import away from `node:fs`; what resolves a path
 * against a root lives in `resolve-src.ts`, on the IO side of that line.
 */

import { RenderError } from "./error.ts";

/** what each extension is inlined as; an unlisted one is refused, not guessed. */
const MIME: Record<string, string> = {
  ".apng": "image/apng",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

/**
 * names the media type a file is inlined as.
 *
 * an unknown extension is refused rather than guessed at, because a wrong
 * media type produces a broken picture at read time with nothing to say why.
 * @param file the path whose extension decides the type
 * @param path JSON-ish path naming the reference, used in the refusal
 * @returns the media type
 */
export function mimeOf(file: string, path: string): string {
  const dot = file.lastIndexOf(".");
  const mime = dot === -1 ? undefined : MIME[file.slice(dot).toLowerCase()];
  if (!mime)
    throw new RenderError(
      `${path}: ${JSON.stringify(file)} has no extension this can inline; expected one of ${Object.keys(MIME).join(", ")}`,
    );

  return mime;
}

/**
 * reports whether a reference names an SVG, which is inlined as markup.
 * @param src the reference as written
 * @returns true when the path ends in `.svg`
 */
export function isSvgPath(src: string): boolean {
  return /\.svg$/i.test(src.split(/[?#]/)[0]);
}
