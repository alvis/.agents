import { RenderError } from "./error.ts";
import { requireString } from "./validate.ts";

/**
 * the names a page has already claimed, one peer group per kind. keying it by
 * the same `kind` the refusal names is what keeps a caller from pairing one
 * kind's name with the other kind's set. `ref` is the odd one: a citation
 * code is never a DOM id, but it is claimed once per page like the rest, so
 * it is tracked here rather than in a second structure threaded beside this
 * one.
 */
export type PageIds = Record<
  "finding" | "probe" | "question" | "ref" | "section",
  Set<string>
>;

/**
 * builds the empty ledger a page starts from, one set per peer group.
 *
 * both the renderer and the test contexts start here rather than writing the
 * groups out, so adding a group is one edit and cannot leave a caller holding
 * a ledger missing the set a refusal reads.
 * @returns a fresh ledger claiming nothing
 */
export function freshIds(): PageIds {
  return {
    finding: new Set(),
    probe: new Set(),
    question: new Set(),
    ref: new Set(),
    section: new Set(),
  };
}

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

/** a citation code is drawn inside a fixed chip, so it has to stay short. */
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9-]{0,5}$/;

/**
 * reads a question's citation code, refusing a malformed or reused one.
 *
 * the code is the one name a question keeps across edits: it is drawn on the
 * drawer chip, beside the question, on the summary row, and in the reply the
 * reader copies. Two questions sharing one would make every later citation
 * ambiguous in exactly the conversation the code exists to serve, so a
 * duplicate is refused rather than disambiguated.
 * @param ref the author-supplied code
 * @param path JSON path of the owning block, named by the refusal
 * @param ids every id claimed so far, whose `ref` set is extended in place
 * @returns the code as a string
 */
export function requireFreshRef(
  ref: unknown,
  path: string,
  ids: PageIds,
): string {
  const value = requireString(ref, `${path}.ref`);
  if (!SAFE_REF.test(value))
    throw new RenderError(
      `${path}.ref: citation code ${JSON.stringify(value)} must match [A-Za-z0-9][A-Za-z0-9-]{0,5} — it is drawn inside a chip, so it has to stay short`,
    );
  if (ids.ref.has(value))
    throw new RenderError(
      `${path}.ref: duplicate citation code ${JSON.stringify(value)}`,
    );
  ids.ref.add(value);

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
