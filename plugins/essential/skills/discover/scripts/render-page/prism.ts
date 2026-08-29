import { createHash } from "node:crypto";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";

import { RenderError } from "./error.ts";
import { CACHE_ROOT, getVendorRuntime } from "./vendor.ts";
import { codeExcerpts } from "./walk.ts";

import type { PageData, TokenSpan } from "./types.ts";

/** the release the pinned digest below was taken from. */
export const PRISM_VERSION = "1.29.0";

/** the grammars the bundle carries, beyond the four its core already holds. */
export const PRISM_GRAMMARS = [
  "typescript",
  "jsx",
  "tsx",
  "json",
  "rust",
  "go",
  "python",
  "bash",
  "sql",
  "yaml",
  "markdown",
  "diff",
  "toml",
  "scss",
];

/** where a fresh copy of the bundle is downloaded from. */
export const PRISM_CDN_URL = `https://cdn.jsdelivr.net/combine/npm/prismjs@${PRISM_VERSION}/prism.min.js,${PRISM_GRAMMARS.map(
  (name) => `npm/prismjs@${PRISM_VERSION}/components/prism-${name}.min.js`,
).join(",")}`;

/**
 * the digest of the exact bytes this build is willing to run.
 *
 * the builder evaluates this bundle, which is a far stronger thing to do than
 * inline one, so the check is the bytes themselves rather than a substring of
 * them: a version pin says which release was asked for, and only a digest says
 * which one arrived. A mismatch never fails the build — the excerpt renders
 * uncoloured and the run says so — because refusing to run unexpected code and
 * refusing to produce a board are different decisions.
 */
export const PRISM_SHA256 =
  "294705dc8c1329c8f3296e1b1fb957106a55ce418948f952c044bdba8e601589";

/** where the bundle is kept between runs, beside every other one. */
export const PRISM_CACHE = join(
  CACHE_ROOT,
  `prism-${PRISM_VERSION}.cache.js`,
);

/**
 * language names the grammar set knows under another spelling.
 *
 * a `Map` rather than an object, because the key is a name the author wrote:
 * an object answers `constructor`, `toString` and `valueOf` out of its own
 * prototype, so those three languages would be spelled as a function here.
 * An empty spelling means the grammar set has none, which is not the same
 * answer as having no entry at all.
 */
const ALIASES = new Map<string, string>(
  Object.entries({
    jsonc: "json",
    mjs: "javascript",
    plaintext: "",
    shell: "bash",
    sh: "bash",
    svg: "markup",
    text: "",
    xml: "markup",
    zsh: "bash",
  }),
);

/** the shape a grammar's name has to have before it can become a class. */
const KIND = /^[a-z][a-z0-9-]*$/;

/** one node of the tree the grammar returns: text, or a named run of it. */
type PrismNode =
  | string
  | PrismNode[]
  | { type: string; content: PrismNode; alias?: string | string[] };

/** what the builder does with an excerpt once a grammar has been found. */
export interface Highlighter {
  /** measures an excerpt's colour ranges, empty when the language is unknown */
  tokenize: (code: string, language: string) => TokenSpan[];
}

/**
 * measures how much text a node covers.
 *
 * counted rather than read off the node's own `length`, so the offsets below
 * are consistent with the text by construction: a range that disagreed with the
 * excerpt would colour the wrong characters and nothing would say so.
 * @param node the node to measure
 * @returns how many characters it covers
 */
function widthOf(node: PrismNode): number {
  if (typeof node === "string") return node.length;
  if (Array.isArray(node))
    return node.reduce((total, one) => total + widthOf(one), 0);

  return widthOf(node.content);
}

/**
 * flattens the grammar's tree into ranges over the excerpt.
 *
 * a nested run keeps its parent's range as well as its own: the two overlap,
 * and the span engine cuts overlaps apart rather than nesting them, so both
 * names reach the piece they share.
 *
 * a run's aliases are measured beside its name for the same reason. A grammar
 * calls the name after `fn` a `function-definition` and aliases it `function`,
 * and the palette is written in families rather than in every grammar's own
 * vocabulary, so the alias is what actually carries the colour.
 * @param node the node to walk
 * @param at where the node starts in the excerpt, 0-based
 * @param out the ranges found so far, appended to in place
 * @returns where the node ends in the excerpt
 */
export function flattenTokens(
  node: PrismNode,
  at: number,
  out: TokenSpan[],
): number {
  if (typeof node === "string") return at + node.length;
  if (Array.isArray(node))
    return node.reduce((from, one) => flattenTokens(one, from, out), at);
  const end = at + widthOf(node);
  const names = [node.type, ...[node.alias ?? []].flat()];
  // an unexpected name is dropped rather than refused: it reaches the page as a
  // class, and a grammar this build has not seen is the builder's problem
  for (const kind of names)
    if (KIND.test(kind)) out.push({ start: at, end, kind });
  flattenTokens(node.content, at, out);

  return end;
}

/**
 * refuses any bytes but the ones this build was pinned to.
 * @param text the bundle source to judge
 * @param origin where the text came from, named in any refusal
 */
export function acceptPrismRuntime(text: string, origin = "downloaded"): void {
  const digest = createHash("sha256").update(text).digest("hex");
  if (digest === PRISM_SHA256) return;
  const remedy =
    origin === "cached"
      ? `delete ${PRISM_CACHE} so the next run downloads a fresh copy`
      : `check ${PRISM_CDN_URL} by hand before trusting it`;
  throw new RenderError(
    `the ${origin} Prism bundle (${text.length} characters) hashes to ${digest}, not the pinned ${PRISM_SHA256}; ${remedy}`,
  );
}

/**
 * evaluates the bundle and hands back the one function this build wants.
 *
 * the context is bare on purpose: a fresh realm with the language's own
 * built-ins and nothing else, so the bundle cannot read a file, open a socket,
 * or see this process at all. Running third-party source in the builder is the
 * accepted cost of colouring without shipping a parser (D-76), and the digest
 * above plus this context are the two things that bound it.
 * @param source the bundle source
 * @returns the highlighter it published
 */
export function evaluatePrism(source: string): Highlighter {
  const sandbox: Record<string, unknown> = {};
  sandbox.global = sandbox;
  const context = createContext(sandbox);
  runInContext(source, context, { timeout: 10_000 });
  const prism = sandbox.Prism as
    | { languages: Record<string, unknown>; tokenize: Function }
    | undefined;
  if (typeof prism?.tokenize !== "function")
    throw new RenderError(
      "the Prism bundle ran but published no tokenize function, so it is not the highlighter",
    );

  return {
    tokenize: (code, language) => {
      const name = ALIASES.get(language) ?? language;
      const grammar =
        name && Object.hasOwn(prism.languages, name)
          ? prism.languages[name]
          : undefined;
      if (!grammar || typeof code !== "string") return [];
      const out: TokenSpan[] = [];
      flattenTokens(prism.tokenize(code, grammar) as PrismNode, 0, out);

      return out;
    },
  };
}

/**
 * loads the highlighter at most once, however many boards ask for it.
 *
 * colour is an enhancement, so every way this can fail — no cache and no
 * network, a digest that moved, a bundle that does not run — ends in an
 * uncoloured board and a line on stderr rather than in a build that stops.
 * @param warn where a note about an uncoloured run is written
 * @param load where the bundle's bytes come from, already checked
 * @returns a thunk that resolves the highlighter, or undefined once it cannot
 */
export function highlighterOnce(
  warn: (message: string) => void = (message) => {
    process.stderr.write(`${message}\n`);
  },
  load: () => Promise<string> = () =>
    getVendorRuntime("Prism", PRISM_CDN_URL, PRISM_CACHE, acceptPrismRuntime),
): () => Promise<Highlighter | undefined> {
  let pending: Promise<Highlighter | undefined> | undefined;

  return () => {
    pending ??= load()
      .then(evaluatePrism)
      .catch((error: Error) => {
        warn(`code is rendered without colour: ${error.message}`);

        return undefined;
      });

    return pending;
  };
}

/**
 * measures every excerpt on a board, writing the ranges the renderer reads.
 *
 * the field is assigned on every excerpt rather than only on the ones that
 * measured, so a data file that wrote `tokens` itself never survives to the
 * page: what the renderer draws is what the builder measured, or nothing.
 * @param data the parsed board, mutated in place
 * @param prism the highlighter, absent when it could not be loaded
 */
export function colourCodeBlocks(
  data: PageData,
  prism: Highlighter | undefined,
): void {
  for (const { excerpt } of codeExcerpts(data))
    excerpt.tokens = prism?.tokenize(excerpt.code, excerpt.language);
}
