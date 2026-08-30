import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { RenderError } from "./error.ts";
import { remoteHref } from "./href.ts";

/**
 * resolves what a path actually points at.
 *
 * `resolve` is lexical and has no idea a component is a symlink, so a link
 * sitting beside the data file reads as inside the root by every string test
 * and outside it by the only one that decides anything — what gets opened.
 *
 * Only the part that exists can be resolved, and the rest is kept as written:
 * a missing file still has to be judged against the same root as a present one,
 * and on a machine where the temporary directory is itself a link, resolving
 * one side and not the other reads every absent file as an escape.
 * @param full a lexically resolved path
 * @returns the path with every existing link followed
 */
function actual(full: string): string {
  const missing: string[] = [];
  let head = full;

  for (;;) {
    try {
      const real = realpathSync(head);

      return missing.length ? resolve(real, ...missing) : real;
    } catch {
      const up = dirname(head);
      // the filesystem root is its own parent, so nothing above this exists
      // either and the path is as resolved as it will get
      if (up === head) return full;
      missing.unshift(basename(head));
      head = up;
    }
  }
}

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
  if (remoteHref(src))
    throw new RenderError(
      `${path}: ${JSON.stringify(src)} is a remote reference, and a board must render with no network requests at all; copy the file in beside the data instead`,
    );
  if (isAbsolute(src))
    throw new RenderError(
      `${path}: ${JSON.stringify(src)} is an absolute path, which renders only on the machine that wrote it; use a path relative to the data file`,
    );
  const full = resolve(base, src.split(/[?#]/)[0]);
  const inside = relative(actual(root), actual(full));
  // `..` at the front is the only shape that escapes, and testing the resolved
  // relative path rather than the string the author wrote is what catches
  // `a/../../b`
  if (inside.startsWith(`..${sep}`) || inside === "..")
    throw new RenderError(
      `${path}: ${JSON.stringify(src)} resolves outside ${root}, and a board may only inline files at or below its own data file`,
    );

  return full;
}
