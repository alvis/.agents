/**
 * the schemes a link may use.
 *
 * a relative or fragment href is always fine; a scheme is not, because
 * `javascript:` and `data:` both turn a link into a way to run code in a page
 * that is otherwise only ever given data.
 */
export const SCHEMES = ["http:", "https:", "mailto:"];

/**
 * the characters a browser drops from a URL before it parses one.
 *
 * a scheme test that runs before this strip is not a test of what the browser
 * will do with the href: a leading space or a tab inside the scheme both reach
 * the URL parser as `javascript:alert(1)`, so a pattern anchored at the first
 * character of the raw string simply fails to match and lets both through.
 */
const IGNORED = /[\u0000-\u0020\u007f]/g;

/**
 * reads the scheme a browser would take from an href.
 *
 * one place decides this for the whole renderer. An author's `link` run and an
 * author's inlined SVG put a URL into the same document with the same powers,
 * and the two were checked by two patterns that had already drifted apart: one
 * refused every scheme outside an allowlist, the other refused two by name and
 * let `javascript:` straight through.
 * @param href the author-supplied URL
 * @returns the lower-cased scheme with its colon, or undefined where there is none
 */
export function schemeOf(href: string): string | undefined {
  return /^[a-z][a-z0-9+.-]*:/i.exec(href.replace(IGNORED, ""))?.[0].toLowerCase();
}

/**
 * whether a URL is one this renderer will put into a page
 * @param href the author-supplied URL
 * @returns true where the URL carries no scheme, or one of `SCHEMES`
 */
export function allowedHref(href: string): boolean {
  const scheme = schemeOf(href);

  return !scheme || SCHEMES.includes(scheme);
}

/**
 * whether a URL stays inside the document it sits in.
 *
 * a fragment and nothing else. Asked of an inlined drawing's every `href` and
 * every `url(...)`, because a board's whole contract is that it makes no
 * request, and a drawing is the one place an author hands over markup rather
 * than data.
 * @param href the author-supplied URL
 * @returns true where the URL names a fragment of this document
 */
export function localHref(href: string): boolean {
  return href.replace(IGNORED, "").startsWith("#");
}

/**
 * whether a URL leaves the machine the board was rendered on.
 *
 * the same reader as `schemeOf`, so a scheme spelt with a leading space or a
 * tab is one thing everywhere rather than remote to one caller and local to the
 * next.
 * @param href the author-supplied URL or path
 * @returns true where it names a scheme or a protocol-relative host
 */
export function remoteHref(href: string): boolean {
  return Boolean(schemeOf(href)) || href.replace(IGNORED, "").startsWith("//");
}
