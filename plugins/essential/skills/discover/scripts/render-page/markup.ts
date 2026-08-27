import { escapeHtml } from "./escape.ts";

/** run of text between two tags. */
export interface MarkupText {
  /** what this node is */
  kind: "text";
  /** the text as authored, references unresolved */
  text: string;
}

/** one element, with the elements and text it holds. */
export interface MarkupTag {
  /** what this node is */
  kind: "tag";
  /** the element's name, exactly as authored */
  name: string;
  /** its attributes, in the order written, values as authored */
  attributes: { name: string; value: string }[];
  /** what it holds, in document order */
  children: MarkupNode[];
}

/** anything the reader produces. */
export type MarkupNode = MarkupTag | MarkupText;

/** a tag or attribute name, as generous as a browser's own tokenizer. */
const NAME = /[a-z][a-z0-9:._-]*/iy;

/**
 * what separates one attribute from the next.
 *
 * `/` is in here rather than treated as a close, because that is what HTML's
 * before-attribute-name state does with it: `<a/onclick=…>` carries a live
 * handler that a separator of whitespace alone never even reaches.
 */
const SEPARATOR = /[\s/]*/y;

/** what sits between an attribute's name and its value. */
const ASSIGN = /\s*=\s*/y;

/** an attribute's value, quoted either way or bare. */
const VALUE = /"([^"]*)"|'([^']*)'|([^\s>]*)/y;

/**
 * reads hand-authored markup into a tree.
 *
 * a tree rather than a scan, because the question a scan cannot answer is what
 * the browser will *do* with the bytes: a pattern looking for a handler reads
 * `href="x"onclick="…"` as one attribute and the parser reads it as two, and
 * every check built on the first reading is answering about a document nobody
 * will ever load. What comes back here is what the parser sees, so the rules
 * applied to it are rules about the real document.
 *
 * Comments, processing instructions and doctypes are read and dropped: none of
 * them draws anything, and each is a place for bytes to hide from a reader.
 * @param source the markup as authored
 * @param refuse what to call with a plain-language reason, which never returns
 * @returns the nodes at the top level, in document order
 */
export function readMarkup(
  source: string,
  refuse: (because: string) => never,
): MarkupNode[] {
  const roots: MarkupNode[] = [];
  const open: MarkupTag[] = [];
  const hold = (node: MarkupNode): void => {
    (open.at(-1)?.children ?? roots).push(node);
  };
  let at = 0;

  while (at < source.length) {
    const next = source.indexOf("<", at);
    if (next === -1) {
      hold({ kind: "text", text: source.slice(at) });
      break;
    }
    if (next > at) hold({ kind: "text", text: source.slice(at, next) });
    at = skip(source, next, refuse) ?? (source.startsWith("</", next)
      ? readClose(source, next, open, refuse)
      : readOpen(source, next, open, hold, refuse));
  }
  const left = open.at(-1);
  if (left)
    refuse(`leaves <${left.name}> open, so it is not markup this can rebuild`);

  return roots;
}

/**
 * steps over a comment, processing instruction, doctype, or character data.
 * @param source the markup being read
 * @param at where the `<` sits
 * @param refuse what to call with a plain-language reason
 * @returns where reading resumes, or undefined when this is an ordinary tag
 */
function skip(
  source: string,
  at: number,
  refuse: (because: string) => never,
): number | undefined {
  if (source.startsWith("<!--", at)) return past(source, at, "-->", 4, "comment", refuse);
  if (source.startsWith("<![CDATA[", at))
    return past(source, at, "]]>", 9, "character-data section", refuse);
  if (!source.startsWith("<!", at) && !source.startsWith("<?", at)) return undefined;
  const end = source.indexOf(">", at);
  if (end === -1)
    refuse("holds a declaration that is never closed, so it is not markup this can rebuild");
  // an internal subset defines entities of the author's own, which every check
  // downstream would then be reading through a table it never saw
  if (source.slice(at, end).includes("["))
    refuse("declares entities of its own, which this cannot resolve and so will not inline");

  return end + 1;
}

/**
 * steps past a delimited run, refusing one that never ends.
 * @param source the markup being read
 * @param at where the run starts
 * @param close the delimiter that ends it
 * @param opened how long the opening delimiter is
 * @param what the run's name, used in the refusal
 * @param refuse what to call with a plain-language reason
 * @returns where reading resumes
 */
function past(
  source: string,
  at: number,
  close: string,
  opened: number,
  what: string,
  refuse: (because: string) => never,
): number {
  const end = source.indexOf(close, at + opened);
  if (end === -1)
    refuse(`holds a ${what} that is never closed, so it is not markup this can rebuild`);

  return end + close.length;
}

/**
 * reads one closing tag and matches it against what is open.
 * @param source the markup being read
 * @param at where the `<` sits
 * @param open the elements still open, innermost last
 * @param refuse what to call with a plain-language reason
 * @returns where reading resumes
 */
function readClose(
  source: string,
  at: number,
  open: MarkupTag[],
  refuse: (because: string) => never,
): number {
  NAME.lastIndex = at + 2;
  const closed = NAME.exec(source);
  const end = source.indexOf(">", at);
  if (!closed || end === -1)
    refuse(`holds ${JSON.stringify(source.slice(at, at + 16))}, which is not a tag this can read`);
  const inner = open.at(-1);
  if (!inner || inner.name.toLowerCase() !== closed[0].toLowerCase())
    refuse(
      inner
        ? `closes </${closed[0]}> where <${inner.name}> is open, so it is not markup this can rebuild`
        : `closes </${closed[0]}> where nothing is open, so it is not markup this can rebuild`,
    );
  open.pop();

  return end + 1;
}

/**
 * reads one opening tag with its attributes.
 * @param source the markup being read
 * @param at where the `<` sits
 * @param open the elements still open, innermost last
 * @param hold what to call with the element once it is read
 * @param refuse what to call with a plain-language reason
 * @returns where reading resumes
 */
function readOpen(
  source: string,
  at: number,
  open: MarkupTag[],
  hold: (node: MarkupNode) => void,
  refuse: (because: string) => never,
): number {
  NAME.lastIndex = at + 1;
  const named = NAME.exec(source);
  if (!named)
    refuse(`holds ${JSON.stringify(source.slice(at, at + 16))}, which is not a tag this can read`);
  const tag: MarkupTag = { kind: "tag", name: named[0], attributes: [], children: [] };
  let cursor = NAME.lastIndex;

  for (;;) {
    SEPARATOR.lastIndex = cursor;
    const separator = SEPARATOR.exec(source)?.[0] ?? "";
    cursor = SEPARATOR.lastIndex;
    if (cursor >= source.length)
      refuse(`holds a <${tag.name}> tag that is never closed, so it is not markup this can rebuild`);
    if (source[cursor] === ">") {
      hold(tag);
      // only a `/` immediately before the `>` closes the tag, which is the rule
      // the parser applies; anywhere else it was a separator
      if (!separator.endsWith("/")) open.push(tag);

      return cursor + 1;
    }
    NAME.lastIndex = cursor;
    const attribute = NAME.exec(source);
    if (!attribute)
      refuse(
        `holds ${JSON.stringify(source.slice(cursor, cursor + 16))} inside a <${tag.name}> tag, which is not an attribute this can read`,
      );
    cursor = NAME.lastIndex;
    ASSIGN.lastIndex = cursor;
    if (!ASSIGN.exec(source)) {
      tag.attributes.push({ name: attribute[0], value: "" });
      continue;
    }
    VALUE.lastIndex = ASSIGN.lastIndex;
    const held = VALUE.exec(source);
    tag.attributes.push({
      name: attribute[0],
      value: held?.[1] ?? held?.[2] ?? held?.[3] ?? "",
    });
    cursor = VALUE.lastIndex;
  }
}

/**
 * writes a tree back out as markup.
 *
 * what a page carries is this, not the bytes the author wrote: every name and
 * value here has been through the caller's rules, so what the browser parses is
 * exactly what was checked rather than something that merely passed beside it.
 * @param nodes the nodes to write, in document order
 * @returns the markup
 */
export function writeMarkup(nodes: MarkupNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === "text") return escapeHtml(node.text);
      const attributes = node.attributes
        .map(({ name, value }) => ` ${name}="${escapeHtml(value)}"`)
        .join("");

      return node.children.length
        ? `<${node.name}${attributes}>${writeMarkup(node.children)}</${node.name}>`
        : `<${node.name}${attributes} />`;
    })
    .join("");
}
