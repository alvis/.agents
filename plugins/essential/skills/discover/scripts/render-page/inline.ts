import { escapeHtml } from "./escape.ts";
import { RenderError } from "./error.ts";
import { SCHEMES, schemeOf } from "./href.ts";
import { syncAttribute, termKey } from "./sync.ts";
import { optionalString, requireObject, requireOneOf, requireString } from "./validate.ts";
import { PROVENANCE } from "./vocabulary.ts";

import type { Rich, Run } from "./types.ts";

/**
 * every run kind, and the fields it carries beyond `kind` and `text`.
 *
 * this is the whole vocabulary: a run key that is not listed here is refused
 * rather than ignored, so a typo in a data file surfaces as a refusal instead
 * of as silently missing emphasis.
 */
const RUN_FIELDS = {
  text: [],
  code: [],
  mark: [],
  dim: [],
  sub: [],
  term: ["definition", "for"],
  tie: ["key"],
  link: ["href"],
  source: ["ref"],
  provenance: ["level"],
} as const satisfies Record<string, readonly string[]>;

/** every run kind, in the order a refusal quotes them. */
const RUN_KINDS = Object.keys(RUN_FIELDS) as (keyof typeof RUN_FIELDS)[];

/**
 * reads a link target, refusing a scheme that could execute.
 *
 * the scheme is read from the normalised href and the authored one is what is
 * returned, because stripping is the right model for deciding what the href
 * *means* and the wrong one for deciding what it *is* — `http://x/a b` and
 * `http://x/ab` are different URLs.
 * @param href the author-supplied href
 * @param path JSON path of the value, named verbatim by the refusal
 * @returns the href unchanged
 */
function readHref(href: string, path: string): string {
  const scheme = schemeOf(href);
  if (scheme && !SCHEMES.includes(scheme))
    throw new RenderError(
      `${path}: link scheme ${JSON.stringify(scheme)} is not one of ${SCHEMES.map(
        (allowed) => JSON.stringify(allowed),
      ).join(", ")}`,
    );

  return href;
}

/**
 * draws one validated run.
 *
 * every branch escapes, and none of them accepts markup from the data file:
 * an author states what a span *is*, and this decides what it looks like.
 * @param run the run to draw
 * @param path JSON path of the run, named verbatim by any refusal
 * @returns the run as HTML
 */
function draw(run: Exclude<Run, string>, path: string): string {
  const text = escapeHtml(requireString(run.text, `${path}.text`));

  switch (run.kind) {
    case "text":
      return text;
    case "code":
      return `<code class="mono">${text}</code>`;
    case "mark":
      return `<mark>${text}</mark>`;
    case "dim":
      return `<span class="dim">${text}</span>`;
    case "sub":
      return `<span class="sub">${text}</span>`;
    case "term": {
      const definition = requireString(run.definition, `${path}.definition`);
      // the words themselves carry the tie, so a term and its entry stay in
      // step without a third id for the author to keep aligned
      const named = optionalString(run.for, `${path}.for`) ?? run.text;

      return `<span class="term"${syncAttribute("term", termKey(named))} title="${escapeHtml(definition)}">${text}</span>`;
    }
    case "tie":
      return `<span class="tie"${syncAttribute(
        "tie",
        requireString(run.key, `${path}.key`),
      )}>${text}</span>`;
    case "link":
      return `<a href="${escapeHtml(
        readHref(requireString(run.href, `${path}.href`), `${path}.href`),
      )}">${text}</a>`;
    case "source": {
      const ref = escapeHtml(requireString(run.ref, `${path}.ref`));

      return `<span class="source-ref" data-source="${ref}">${text} <span class="source-id">[${ref}]</span></span>`;
    }
    default: {
      const level = requireOneOf(run.level, PROVENANCE, `${path}.level`);

      return `<span class="provenance" data-provenance="${level}"><span class="provenance-level">${level}</span> ${text}</span>`;
    }
  }
}

/**
 * reads one run, refusing an unknown kind and any field its kind does not carry
 * @param run the author-supplied run
 * @param path JSON path of the run, named verbatim by any refusal
 * @returns the run as HTML
 */
function renderRun(run: unknown, path: string): string {
  if (typeof run === "string") return escapeHtml(requireString(run, path));

  requireObject<Run>(run, path);
  const kind = requireOneOf(
    (run as { kind: unknown }).kind,
    RUN_KINDS,
    `${path}.kind`,
  );
  const carried: readonly string[] = ["kind", "text", ...RUN_FIELDS[kind]];

  for (const key of Object.keys(run as object))
    if (!carried.includes(key))
      throw new RenderError(
        `${path}.${key}: a ${JSON.stringify(kind)} run carries only ${carried
          .map((field) => JSON.stringify(field))
          .join(", ")}`,
      );

  return draw(run as Exclude<Run, string>, path);
}

/**
 * renders a rich-text value.
 *
 * a bare string is one text run, which is what keeps every existing data file
 * valid and renders it to the same bytes it always did.
 * @param value the author-supplied string or run array
 * @param path JSON path of the value, named verbatim by any refusal
 * @returns the value as HTML, with every run's text escaped
 */
export function renderInline(value: unknown, path: string): string {
  if (!Array.isArray(value)) return escapeHtml(requireString(value, path));

  if (!value.length)
    throw new RenderError(`${path}: required non-empty array, received []`);

  return (value as Rich[])
    .map((run, index) => renderRun(run, `${path}[${index}]`))
    .join("");
}
