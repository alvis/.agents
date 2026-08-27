import { decodeText } from "../entity.ts";
import { localHref } from "../href.ts";

import type { MarkupNode, MarkupTag } from "../markup.ts";

/**
 * every element an inlined drawing may hold, in its canonical spelling.
 *
 * an allowlist rather than a list of the dangerous ones, because a drawing is
 * rebuilt from what this names: an element nobody thought of is refused by
 * being absent, where a denylist lets it through by the same absence. The set
 * is shapes, text, and the paint they are drawn with — everything that can
 * fetch, script, animate, or hold a document of its own is simply not here.
 */
const ELEMENTS = [
  "svg", "g", "defs", "symbol", "use", "title", "desc", "marker",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textPath", "clipPath", "mask", "pattern",
  "linearGradient", "radialGradient", "stop", "filter",
  "feBlend", "feColorMatrix", "feComposite", "feDropShadow", "feFlood",
  "feGaussianBlur", "feMerge", "feMergeNode", "feMorphology", "feOffset",
];

/** every attribute an inlined drawing may carry, in its canonical spelling. */
const ATTRIBUTES = [
  "id", "class", "role", "aria-label", "aria-labelledby", "aria-describedby",
  "aria-hidden", "xmlns", "xmlns:xlink", "xml:space", "href", "xlink:href",
  "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points",
  "width", "height", "dx", "dy", "transform", "viewBox", "preserveAspectRatio",
  "overflow", "visibility", "display", "pathLength", "textLength",
  "lengthAdjust", "startOffset",
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width",
  "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset",
  "stroke-opacity", "stroke-miterlimit", "opacity", "color", "paint-order",
  "vector-effect", "shape-rendering", "text-rendering",
  "font-family", "font-size", "font-weight", "font-style", "letter-spacing",
  "word-spacing", "text-anchor", "dominant-baseline", "alignment-baseline",
  "baseline-shift", "writing-mode",
  "clip-path", "clip-rule", "clipPathUnits", "mask", "maskUnits",
  "maskContentUnits", "filter", "marker-start", "marker-mid", "marker-end",
  "markerUnits", "markerWidth", "markerHeight", "refX", "refY", "orient",
  "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform",
  "spreadMethod", "patternUnits", "patternContentUnits", "patternTransform",
  "in", "in2", "result", "stdDeviation", "flood-color", "flood-opacity",
  "mode", "type", "values", "operator", "k1", "k2", "k3", "k4", "radius",
];

/**
 * why a particular element is refused, where the general reason understates it.
 *
 * absence from `ELEMENTS` is what refuses these; this only makes the refusal
 * say what the author actually reached for, because "not on the list" reads as
 * an oversight where "would run with the page's own origin" reads as the point.
 */
const NOTED: Record<string, string> = {
  a: "carries an <a>, which would make part of a drawing a link the board never authored",
  animate: "carries an SVG animation element, which can rewrite an attribute after these checks have run",
  animatemotion: "carries an SVG animation element, which can rewrite an attribute after these checks have run",
  animatetransform: "carries an SVG animation element, which can rewrite an attribute after these checks have run",
  embed: "carries an <embed>, which would load a document of its own inside the page",
  foreignobject: "carries a <foreignObject>, which can hold arbitrary markup the rest of these checks do not see",
  iframe: "carries an <iframe>, which would load a document of its own inside the page",
  image: "carries an <image>, which would leave a reference in the page for a reader's browser to fetch",
  object: "carries an <object>, which would load a document of its own inside the page",
  script: "carries a <script>, which would run with the page's own origin",
  set: "carries an SVG animation element, which can rewrite an attribute after these checks have run",
  style: "carries a <style>, which can fetch over the network with @import and reaches the whole page",
};

/** the one namespace a drawing may declare, against the attribute declaring it. */
const NAMESPACES: Record<string, string> = {
  xmlns: "http://www.w3.org/2000/svg",
  "xmlns:xlink": "http://www.w3.org/1999/xlink",
};

/** the attributes read as a URL rather than as paint. */
const POINTERS = new Set(["href", "xlink:href"]);

/** a reference to something else the drawing paints with. */
const URLS = /url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\)?/gi;

/** an element or attribute name against its canonical spelling. */
const canonical = (names: string[]): Map<string, string> =>
  new Map(names.map((name) => [name.toLowerCase(), name]));

/** every allowed element, found by the lower-cased name a parser reports. */
const ELEMENT = canonical(ELEMENTS);

/** every allowed attribute, found by the lower-cased name a parser reports. */
const ATTRIBUTE = canonical(ATTRIBUTES);

/**
 * checks a parsed drawing and returns it in the vocabulary above.
 *
 * every name comes back in its canonical spelling and every value comes back
 * resolved, so what is written out is what was judged rather than the bytes
 * that happened to pass beside it.
 * @param nodes the drawing as parsed
 * @param refuse what to call with a plain-language reason, which never returns
 * @returns the same drawing, in the allowed vocabulary
 */
export function cleanDrawing(
  nodes: MarkupNode[],
  refuse: (because: string) => never,
): MarkupNode[] {
  return nodes.map((node) =>
    node.kind === "text"
      ? { kind: "text" as const, text: resolve(node.text, "text", refuse) }
      : cleanTag(node, refuse),
  );
}

/**
 * checks one element, its attributes, and everything it holds
 * @param tag the element as parsed
 * @param refuse what to call with a plain-language reason
 * @returns the element in the allowed vocabulary
 */
function cleanTag(tag: MarkupTag, refuse: (because: string) => never): MarkupTag {
  const lower = tag.name.toLowerCase();
  const name = ELEMENT.get(lower);
  if (!name)
    refuse(
      NOTED[lower] ??
        `carries a <${tag.name}> element, which is not one an inlined drawing may hold; a drawing is rebuilt from a fixed set of shape, text and paint elements`,
    );

  return {
    kind: "tag",
    name,
    attributes: tag.attributes.map((attribute) => cleanAttribute(attribute, name, refuse)),
    children: cleanDrawing(tag.children, refuse),
  };
}

/**
 * checks one attribute and returns it resolved
 * @param attribute the attribute as parsed
 * @param on the element carrying it, named in every refusal
 * @param refuse what to call with a plain-language reason
 * @returns the attribute in its canonical spelling, value resolved
 */
function cleanAttribute(
  attribute: { name: string; value: string },
  on: string,
  refuse: (because: string) => never,
): { name: string; value: string } {
  const lower = attribute.name.toLowerCase();
  const name = ATTRIBUTE.get(lower);
  if (!name)
    refuse(
      lower.startsWith("on")
        ? "carries an inline event handler, which would run with the page's own origin"
        : lower === "style"
          ? `carries a style attribute on <${on}>; an inlined drawing is painted with presentation attributes, which are what this rebuilds`
          : `carries a ${JSON.stringify(attribute.name)} attribute on <${on}>, which is not one an inlined drawing may carry`,
    );
  const value = resolve(attribute.value, `the ${name} attribute on <${on}>`, refuse);
  const declared = NAMESPACES[name];
  if (declared !== undefined) {
    if (value !== declared)
      refuse(
        `declares ${JSON.stringify(name)} as ${JSON.stringify(value)}; an inlined drawing may declare only ${JSON.stringify(declared)}`,
      );

    return { name, value };
  }
  if (POINTERS.has(name) && !localHref(value))
    refuse(
      `points at ${JSON.stringify(value)} from ${name} on <${on}>, and an inlined drawing may only point within the page`,
    );
  for (const [, quoted, single, bare] of value.matchAll(URLS)) {
    const target = quoted ?? single ?? bare ?? "";
    if (!localHref(target))
      refuse(
        `points at ${JSON.stringify(target)} from ${name} on <${on}>, and an inlined drawing may only point within the page`,
      );
  }

  return { name, value };
}

/**
 * resolves the character references in one value, refusing what it cannot.
 * @param raw the value or text as authored
 * @param where what carried it, named in the refusal
 * @param refuse what to call with a plain-language reason
 * @returns the resolved text
 */
function resolve(
  raw: string,
  where: string,
  refuse: (because: string) => never,
): string {
  const { text, unresolved } = decodeText(raw);
  if (unresolved !== undefined)
    refuse(
      `carries ${JSON.stringify(unresolved)} in ${where}, which is a character reference this does not resolve; write a bare ampersand as &amp;`,
    );

  return text;
}
