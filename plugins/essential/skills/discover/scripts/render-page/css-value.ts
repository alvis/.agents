import { RenderError } from "./error.ts";

/**
 * the functions a value may call.
 *
 * this is an allowlist and not a denylist because CSS keeps growing: `url()`
 * was once the only way a declaration could fetch, then `image-set()` was, and
 * the next one will arrive without anything here noticing. Naming what is
 * permitted means an unknown function is refused by default, so a value can
 * describe a colour, a length or a gradient and can never reach the network —
 * which is the single promise a self-contained page makes.
 */
const FUNCTIONS = new Set([
  "calc",
  "clamp",
  "color",
  "color-mix",
  "conic-gradient",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "light-dark",
  "linear-gradient",
  "max",
  "min",
  "oklab",
  "oklch",
  "radial-gradient",
  "repeating-conic-gradient",
  "repeating-linear-gradient",
  "repeating-radial-gradient",
  "rgb",
  "rgba",
  "var",
]);

/**
 * one lexical piece of a value.
 *
 * the alternatives are ordered so the specific ones win: a custom property
 * before the separators that would otherwise eat its leading dashes, and a
 * function before the bare keyword that spells the same letters. `*` is
 * deliberately absent from the separators, because `/` is legitimate in
 * `rgb(0 0 0 / 50%)` and the two together would spell a comment.
 */
const TOKEN =
  /(--[a-z0-9-]+)|(#[0-9a-f]{3,8})|([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:%|[a-z]+)?)|([a-z][a-z0-9-]*)\(|([a-z][a-z0-9-]*)|(\))|([\s,\/+-]+)/iy;

/**
 * reads a value destined for a CSS declaration, refusing anything it cannot
 * account for.
 *
 * the value is written into the page verbatim, so this is to a stylesheet what
 * `escapeHtml` is to markup — with the difference that escaping can neutralise
 * every input, and a declaration cannot: there is no encoding of
 * `url(https://…)` that stops it fetching. So this reads the value by grammar
 * instead, and refuses what it does not recognise.
 * @param value the author-supplied value
 * @param path JSON path of the value, named verbatim by any refusal
 * @returns the value, trimmed
 */
export function readCssValue(value: string, path: string): string {
  const read = value.trim();
  let depth = 0;

  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < read.length) {
    const at = TOKEN.lastIndex;
    const token = TOKEN.exec(read);
    if (!token)
      throw new RenderError(
        `${path}: ${JSON.stringify(read[at])} is not part of a colour, length, keyword, or permitted function`,
      );

    const [, , , , fn, , close] = token;
    if (fn !== undefined) {
      if (!FUNCTIONS.has(fn.toLowerCase()))
        throw new RenderError(
          `${path}: ${JSON.stringify(`${fn}(`)} is not a permitted function`,
        );
      depth += 1;
    }
    // a value that closes more than it opened is either a typo or an attempt to
    // finish this declaration and start authoring the next one
    if (close !== undefined && (depth -= 1) < 0)
      throw new RenderError(`${path}: ${JSON.stringify(")")} closes nothing`);
  }

  if (depth > 0) throw new RenderError(`${path}: ${depth} unclosed "("`);

  return read;
}
