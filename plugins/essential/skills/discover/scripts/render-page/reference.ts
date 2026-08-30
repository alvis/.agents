import { isAbsolute, relative, resolve, sep } from "node:path";

import { RenderError } from "./error.ts";

/** anything that would make a board reach off its own disk. */
const REMOTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

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
 * turns one author-written `src` into a path that is safe to read.
 *
 * paths resolve against the data file's own directory rather than the working
 * directory, so a board renders the same whoever runs it and from wherever.
 * @param src the path as the author wrote it
 * @param base the directory the reference is relative to
 * @param path JSON-ish path naming the reference, used in every refusal
 * @param root the directory nothing may resolve above; defaults to `base`
 * @returns the absolute path to read
 */
export function resolveSrc(
  src: string,
  base: string,
  path: string,
  root = base,
): string {
  if (REMOTE.test(src))
    throw new RenderError(
      `${path}: ${JSON.stringify(src)} is a remote reference, and a board must render with no network requests at all; copy the file in beside the data instead`,
    );
  if (isAbsolute(src))
    throw new RenderError(
      `${path}: ${JSON.stringify(src)} is an absolute path, which renders only on the machine that wrote it; use a path relative to the data file`,
    );
  const full = resolve(base, src.split(/[?#]/)[0]);
  const inside = relative(root, full);
  // `..` at the front is the only shape that escapes, and testing the resolved
  // relative path rather than the string the author wrote is what catches
  // `a/../../b`
  if (inside.startsWith(`..${sep}`) || inside === "..")
    throw new RenderError(
      `${path}: ${JSON.stringify(src)} resolves outside ${root}, and a board may only inline files at or below its own data file`,
    );

  return full;
}

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
 * reports whether a reference points off the machine.
 * @param src the reference as written
 * @returns true when it names a scheme or a protocol-relative host
 */
export function isRemote(src: string): boolean {
  return REMOTE.test(src);
}

/**
 * reports whether a reference names an SVG, which is inlined as markup.
 * @param src the reference as written
 * @returns true when the path ends in `.svg`
 */
export function isSvgPath(src: string): boolean {
  return /\.svg$/i.test(src.split(/[?#]/)[0]);
}
