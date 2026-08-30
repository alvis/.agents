/**
 * the named character references an inlined drawing may use.
 *
 * a short table rather than the whole HTML set, because anything left over is
 * refused rather than passed through: a reference this does not resolve is one
 * the checks downstream would read differently from the browser, and
 * `j&colon;` reaching a scheme test as six literal characters is exactly how a
 * `javascript:` URL walks past a pattern anchored on `javascript:`.
 *
 * a `Map` rather than an object, because the key is a name the author wrote:
 * an object answers `constructor`, `toString` and `valueOf` out of its own
 * prototype, and `&constructor;` resolving to a function's source is a
 * reference passed through under the name of one refused.
 */
const NAMED = new Map<string, string>(
  Object.entries({
    Tab: "\t",
    NewLine: "\n",
    amp: "&",
    apos: "'",
    ast: "*",
    bsol: "\\",
    bull: "•",
    cent: "¢",
    colon: ":",
    comma: ",",
    commat: "@",
    copy: "©",
    deg: "°",
    dollar: "$",
    equals: "=",
    excl: "!",
    ge: "≥",
    grave: "`",
    gt: ">",
    hellip: "…",
    hyphen: "-",
    laquo: "«",
    lcub: "{",
    ldquo: "“",
    le: "≤",
    lowbar: "_",
    lpar: "(",
    lsquo: "‘",
    lt: "<",
    mdash: "—",
    micro: "µ",
    middot: "·",
    minus: "−",
    nbsp: " ",
    ndash: "–",
    ne: "≠",
    num: "#",
    para: "¶",
    percnt: "%",
    period: ".",
    plus: "+",
    plusmn: "±",
    pound: "£",
    quest: "?",
    quot: '"',
    raquo: "»",
    rcub: "}",
    rdquo: "”",
    reg: "®",
    rpar: ")",
    rsquo: "’",
    sect: "§",
    semi: ";",
    sol: "/",
    times: "×",
    trade: "™",
    verbar: "|",
    yen: "¥",
  }),
);

/** a character reference, numeric or named, semicolon optional as a browser has it. */
const REFERENCE = /&(?:#x([0-9a-f]+)|#(\d+)|([a-z][a-z0-9]*));?/gi;

/** what an author wrote, resolved as far as this can resolve it. */
export interface Decoded {
  /** the text with every reference this knows resolved */
  text: string;
  /** the first reference left unresolved, which the caller refuses */
  unresolved?: string;
}

/**
 * resolves the character references a browser would resolve.
 *
 * every check that follows reads the result rather than the bytes the author
 * wrote, because the browser resolves these before it parses a URL, and a check
 * that runs on the raw form is answering a different question from the one that
 * decides what happens.
 *
 * The candidates are found in the *authored* text rather than in the result, so
 * an ampersand this put there itself is never mistaken for one the author left
 * unresolved: `&amp;D` resolves to `&D` and is finished with, where a second
 * pass over the result would read those same two characters as a reference
 * nobody wrote.
 * @param value the attribute value or text as authored
 * @returns the resolved text, and the first reference this could not resolve
 */
export function decodeText(value: string): Decoded {
  let unresolved: string | undefined;
  const text = value.replaceAll(
    REFERENCE,
    (whole, hex: string | undefined, digits: string | undefined, name: string | undefined) => {
      if (hex !== undefined) return codePoint(Number.parseInt(hex, 16));
      if (digits !== undefined) return codePoint(Number.parseInt(digits, 10));
      const named = name === undefined ? undefined : NAMED.get(name);
      if (named !== undefined) return named;
      unresolved ??= whole;

      return whole;
    },
  );

  return unresolved === undefined ? { text } : { text, unresolved };
}

/**
 * turns a numeric reference into the character it names.
 *
 * a reference outside Unicode, or naming a surrogate half, becomes the
 * replacement character rather than being thrown at: it cannot become part of a
 * scheme, and refusing the file over it would refuse a drawing for a typo.
 * @param code the code point the reference names
 * @returns the character
 */
function codePoint(code: number): string {
  if (!Number.isInteger(code) || code < 1 || code > 0x10ffff) return "\uFFFD";

  return code >= 0xd800 && code <= 0xdfff ? "\uFFFD" : String.fromCodePoint(code);
}
