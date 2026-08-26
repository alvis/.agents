import { RenderError } from "./error.ts";
import { requireString } from "./validate.ts";

/**
 * the ids a page has already claimed, one peer group per kind. keying it by
 * the same `kind` the refusal names is what keeps a caller from pairing one
 * kind's name with the other kind's set.
 */
export type PageIds = Record<
  "finding" | "probe" | "question" | "section",
  Set<string>
>;

/** the only ids that survive `s-`/`q-`/`f-` prefixing as a usable fragment. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/**
 * reads an id, refusing one unusable as a URL fragment or already claimed by
 * an earlier peer of its kind
 * @param id the author-supplied id
 * @param path JSON path of the owning block or section, named by the refusal
 * @param kind the peer group the id must be unique within, named by the
 *   refusal and selecting that group's set from `ids`
 * @param ids every id claimed so far, one set per kind, extended in place;
 *   sections, questions and findings each carry their own set, because the
 *   `s-`, `q-` and `f-` prefixes keep one from colliding with another in
 *   the DOM
 * @returns the id as a string
 */
export function requireFreshId(
  id: unknown,
  path: string,
  kind: "finding" | "probe" | "question" | "section",
  ids: PageIds,
): string {
  const value = requireString(id, `${path}.id`);
  // the section emits id="s-${value}" and the nav emits href="#s-${value}", so
  // a space or a `#` produces a fragment that silently fails to navigate — a
  // dead link with no error. refuse before the duplicate check below, so a
  // malformed id is never admitted to the claimed set
  if (!SAFE_ID.test(value))
    throw new RenderError(
      `${path}.id: ${kind} id ${JSON.stringify(value)} must match [A-Za-z0-9_-]+ to be a safe URL fragment`,
    );
  const seen = ids[kind];
  // two questions sharing an id share one radio group and one textarea target,
  // so one answer silently overwrites the other and the reply loses a line;
  // two sections sharing one emit a repeated DOM id, and the second nav link
  // jumps to the first section; two findings sharing one make a citation that
  // cites both, which is to say neither
  if (seen.has(value))
    throw new RenderError(
      `${path}.id: duplicate ${kind} id ${JSON.stringify(value)}`,
    );
  seen.add(value);
  return value;
}

/**
 * derives a stable DOM id from a JSON path.
 *
 * a figure needs an id to be labelled by its own title, but nothing in the
 * data supplies one — the path is the only name a block always has, and it is
 * already unique within the page.
 * @param path JSON path of the block the id is for
 * @param prefix a short kind marker, so two block kinds at the same path
 *   cannot collide
 * @returns the id, safe to use as a URL fragment
 */
export function slugOf(path: string, prefix: string): string {
  // a trailing separator from `blocks[1]` would leak into every id built on
  // this one, producing `dg-blocks-1--title` rather than `dg-blocks-1-title`
  return `${prefix}-${path.replaceAll(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}
