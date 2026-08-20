#!/usr/bin/env bun
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { spawnSync } from "node:child_process";

/** inline comment marker disabling path validation on its physical line */
export const IGNORE_MARKER = "doc-path-gate: ignore";
/** path prefixes naming generated or local-only trees never validated */
export const RUNTIME_ROOTS = [
  "docs/",
  ".state/",
  ".claude/",
  "state/",
  "reviews/",
  "archive/",
  "topics/",
  "rounds/",
  "changes/",
] as const;
/** template paths resolved against the target repository rather than this one */
export const TARGET_REPO_TEMPLATES = [
  ".github/PULL_REQUEST_TEMPLATE",
  ".github/pull_request_template",
  ".github/ISSUE_TEMPLATE",
] as const;
/** first segments marking illustrative example trees, skipped as fiction */
export const EXAMPLE_ROOTS = new Set([
  "app",
  "apps",
  "api",
  "auth",
  "components",
  "composites",
  "domain",
  "features",
  "fastify",
  "frontmatter",
  "foo",
  "myapp",
  "myproject",
  "packages",
  "previews",
  "prisma",
  "repositories",
  "services",
  "source",
  "spec",
  "src",
  "store",
  "styles",
  "UserProfile",
]);
/** directory names pruned from repository walks */
export const EXCLUDED_TREE_NAMES = new Set([".git", ".state", "__pycache__"]);
/** directories that must never nest inside a plugin references tree */
export const FORBIDDEN_REFERENCE_SEGMENTS = new Set([
  "examples",
  "scripts",
  "templates",
]);
/** top-level directories a backticked mention may legitimately reference */
export const REPOSITORY_PATH_ROOTS = new Set([
  ".github",
  "agents",
  "assets",
  "bin",
  "hooks",
  "plugins",
  "references",
  "rules",
  "scripts",
  "skills",
  "standards",
  "templates",
  "tests",
]);

/** one parsed Markdown link with its source positions */
export interface LinkCandidate {
  /** resolved destination text, null for reference-style links */
  target: string | null;
  /** offset of the opening bracket */
  start: number;
  /** offset just past the link */
  end: number;
  /** line offset of the destination relative to the link start */
  destinationLine: number;
  /** offset just past the closing label bracket */
  labelEnd: number;
  /** whether the link renders an image rather than anchor text */
  isImage: boolean;
}
/** one parsed `[label]: destination` definition */
export interface ReferenceDefinitionCandidate {
  /** normalized label matched against reference links */
  label: string;
  /** raw destination text following the colon */
  target: string;
  /** line offset of the destination relative to the definition line */
  destinationLine: number;
  /** offset of the definition's first character */
  start: number;
  /** offset just past the definition extent */
  end: number;
}
/** precomputed token index accelerating repeated bare destination parsing */
export interface BareDestinationIndex {
  /** for each offset, the end of the token containing it */
  tokenEnds: number[];
  /** for each offset, whether its token ends on an invalid control character */
  invalidEnds: boolean[];
  /** parenthesis nesting depth just past each offset */
  depths: number[];
  /** nearest following offset with a strictly lower depth, null when none */
  nextLower: Array<number | null>;
  /** offsets of every newline in the indexed text */
  newlines: number[];
}

function walk(root: string): string[] {
  const paths: string[] = [];
  for (const name of readdirSync(root)) {
    if (EXCLUDED_TREE_NAMES.has(name)) continue;
    const path = join(root, name);
    const status = statSync(path);
    if (status.isDirectory()) paths.push(...walk(path));
    else if (status.isFile()) paths.push(path);
  }
  return paths;
}

/**
 * lists candidate source files from git, or the whole tree when git fails.
 * @param root repository root to enumerate
 * @returns sorted absolute file paths
 */
export function repositorySourcePaths(root: string): string[] {
  const result = spawnSync("git", [
    "-C",
    root,
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  if (result.status === 0)
    return result.stdout
      .toString()
      .split("\0")
      .filter(Boolean)
      .map((name) => join(root, name))
      .filter((path) => existsSync(path) && statSync(path).isFile())
      .sort();
  return walk(root).sort();
}
/**
 * selects Markdown documents from candidate paths.
 * @param sourcePaths candidate paths in any order
 * @returns sorted Markdown file paths
 */
export function iterDocuments(sourcePaths: readonly string[]): string[] {
  return sourcePaths
    .filter((path) => extname(path).toLowerCase() === ".md")
    .sort();
}

/**
 * reports references trees containing a forbidden nested segment.
 * @param root repository root findings are reported against
 * @param sourcePaths candidate paths to inspect
 * @returns finding strings, one per forbidden nested directory
 */
export function forbiddenReferenceNesting(
  root: string,
  sourcePaths: readonly string[],
): string[] {
  const forbidden = new Set<string>();
  for (const path of sourcePaths) {
    const parts = relative(root, path).split(sep);
    const referenceIndex = parts.indexOf("references");
    if (referenceIndex < 0) continue;
    for (let index = referenceIndex + 1; index < parts.length; index += 1)
      if (FORBIDDEN_REFERENCE_SEGMENTS.has(parts[index]!)) {
        forbidden.add(parts.slice(0, index + 1).join(sep));
        break;
      }
  }
  return [...forbidden]
    .sort()
    .map((path) => `${path} → forbidden path segment nested under references`);
}

/**
 * resolves the owning plugin directory for a document, else the root.
 * @param root repository root
 * @param document path of the document being checked
 * @returns plugin directory for documents under plugins/, otherwise root
 */
export function pluginRoot(root: string, document: string): string {
  const parts = relative(root, document).split(sep);
  return parts[0] === "plugins" && parts.length > 2
    ? join(root, parts[0], parts[1]!)
    : root;
}

/**
 * decides whether the character at an offset is escaped by backslashes.
 * @param text containing text
 * @param index offset to inspect
 * @returns true when an odd number of backslashes precedes the offset
 */
export function isEscaped(text: string, index: number): boolean {
  let count = 0;
  for (
    let cursor = index - 1;
    cursor >= 0 && text[cursor] === "\\";
    cursor -= 1
  )
    count += 1;
  return count % 2 === 1;
}

/**
 * normalizes a link label for case- and whitespace-insensitive matching.
 * @param label raw label text
 * @returns collapsed, trimmed, lowercased label
 */
export function normalizeReferenceLabel(label: string): string {
  return label
    .replace(/[ \t\r\n]+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

/**
 * removes Markdown backslash escapes from a link destination.
 * @param target raw destination text
 * @returns destination with escapable punctuation unescaped
 */
export function normalizeDestination(target: string): string {
  return target.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, "$1");
}

/**
 * parses a bracketed link label at an offset.
 * @param text containing text
 * @param start offset of the opening bracket
 * @returns label text and offset past the closer, null when invalid
 */
export function referenceLabel(
  text: string,
  start: number,
): [string, number] | null {
  if (text[start] !== "[" || isEscaped(text, start)) return null;
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === "[" && !isEscaped(text, index)) return null;
    if (text[index] === "]" && !isEscaped(text, index))
      return [text.slice(start + 1, index), index + 1];
  }
  return null;
}

/**
 * pairs backtick runs into closed code span ranges up to an offset.
 * @param text containing text
 * @param end exclusive limit on span openings considered
 * @returns [start, end] ranges covering each closed code span
 */
export function closedCodeSpans(
  text: string,
  end: number,
): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (let index = 0; index < text.length;) {
    if (text[index] !== "`") {
      index += 1;
      continue;
    }
    let runEnd = index + 1;
    while (text[runEnd] === "`") runEnd += 1;
    runs.push([index, runEnd]);
    index = runEnd;
  }
  const nextMatching: Array<number | null> = Array(runs.length).fill(null);
  const nextByLength = new Map<number, number>();
  for (let runIndex = runs.length - 1; runIndex >= 0; runIndex -= 1) {
    const [runStart, runEnd] = runs[runIndex]!;
    const length = runEnd - runStart;
    nextMatching[runIndex] = nextByLength.get(length) ?? null;
    nextByLength.set(length, runIndex);
  }
  const spans: Array<[number, number]> = [];
  for (let runIndex = 0; runIndex < runs.length && runs[runIndex]![0] < end;) {
    const [runStart] = runs[runIndex]!;
    if (isEscaped(text, runStart) || nextMatching[runIndex] === null) {
      runIndex += 1;
      continue;
    }
    const closingIndex = nextMatching[runIndex]!;
    spans.push([runStart, runs[closingIndex]![1]]);
    runIndex = closingIndex + 1;
  }
  return spans;
}

/**
 * advances a scan cursor past any code span covering an offset.
 * @param index offset being scanned
 * @param spans closed code span ranges in source order
 * @param cursor position in the span list reached so far
 * @returns next offset and cursor, unchanged when no span covers the offset
 */
export function skipClosedCodeSpan(
  index: number,
  spans: ReadonlyArray<readonly [number, number]>,
  cursor: number,
): [number, number] {
  while (cursor < spans.length && spans[cursor]![1] <= index) cursor += 1;
  return cursor < spans.length && spans[cursor]![0] <= index
    ? [spans[cursor]![1], cursor]
    : [index, cursor];
}

/**
 * maps each bracket opener to the offset just past its matching closer.
 * @param text containing text
 * @param codeSpans closed code spans excluded from pairing
 * @returns opener offsets paired with past-closer offsets
 */
export function linkTextEndings(
  text: string,
  codeSpans: ReadonlyArray<readonly [number, number]>,
): Map<number, number> {
  const endings = new Map<number, number>();
  const openings: number[] = [];
  let cursor = 0;
  for (let index = 0; index < text.length; index += 1) {
    const skipped = skipClosedCodeSpan(index, codeSpans, cursor);
    cursor = skipped[1];
    if (skipped[0] !== index) {
      index = skipped[0] - 1;
      continue;
    }
    if (text[index] === "[" && !isEscaped(text, index)) openings.push(index);
    else if (text[index] === "]" && !isEscaped(text, index) && openings.length)
      endings.set(openings.pop()!, index + 1);
  }
  return endings;
}

/**
 * strips leading block quotes and list markers from a line.
 * @param line raw source line
 * @returns line reduced to its content prefix
 */
export function stripMarkdownContainers(line: string): string {
  let remaining = line;
  while (true) {
    const match = remaining.match(
      /^ {0,3}(?:>[ \t]?|(?:[-+*]|[0-9]{1,9}[.)])(?:[ \t]+|$))/,
    );
    if (!match) return remaining;
    remaining = remaining.slice(match[0].length);
  }
}

/**
 * recognizes a reference definition opener in a single line.
 * @param line source line
 * @returns normalized label and offset past the colon, null otherwise
 */
export function referenceDefinition(line: string): [string, number] | null {
  const stripped = stripMarkdownContainers(line);
  const indentation = stripped.length - stripped.trimStart().length;
  if (indentation > 3) return null;
  const parsed = referenceLabel(stripped, indentation);
  if (!parsed || stripped[parsed[1]] !== ":") return null;
  return [normalizeReferenceLabel(parsed[0]), parsed[1] + 1];
}

/**
 * consumes spaces, tabs, and at most one newline at an offset.
 * @param text containing text
 * @param index offset to skip from
 * @returns next offset and whether anything was skipped, null past one newline
 */
export function skipLinkWhitespace(
  text: string,
  index: number,
): [number, boolean] | null {
  const start = index;
  let lineEndings = 0;
  while (index < text.length && /[ \t\n]/.test(text[index]!)) {
    if (text[index] === "\n" && ++lineEndings > 1) return null;
    index += 1;
  }
  return [index, index > start];
}

/**
 * precomputes token boundaries and depths for fast destination parsing.
 * @param text text to index
 * @returns lookup structures valid across the whole text
 */
export function bareDestinationIndex(text: string): BareDestinationIndex {
  const tokenEnds = Array(text.length).fill(0);
  const invalidEnds = Array(text.length).fill(false);
  const depths = Array(text.length + 1).fill(0);
  const nextLower: Array<number | null> = Array(text.length + 1).fill(null);
  const newlines: number[] = [];
  for (let index = 0; index < text.length; index += 1)
    if (text[index] === "\n") newlines.push(index);
  let tokenStart = 0;
  while (tokenStart < text.length) {
    const firstCode = text.charCodeAt(tokenStart);
    if (
      /[ \t\n]/.test(text[tokenStart]!) ||
      firstCode < 32 ||
      firstCode === 127
    ) {
      tokenStart += 1;
      continue;
    }
    let tokenEnd = tokenStart;
    while (
      tokenEnd < text.length &&
      !/[ \t\n]/.test(text[tokenEnd]!) &&
      text.charCodeAt(tokenEnd) >= 32 &&
      text.charCodeAt(tokenEnd) !== 127
    ) {
      depths[tokenEnd + 1] = depths[tokenEnd];
      if (text[tokenEnd] === "(" && !isEscaped(text, tokenEnd))
        depths[tokenEnd + 1] += 1;
      else if (text[tokenEnd] === ")" && !isEscaped(text, tokenEnd))
        depths[tokenEnd + 1] -= 1;
      tokenEnd += 1;
    }
    const invalidEnd =
      tokenEnd < text.length &&
      !/[ \t\n]/.test(text[tokenEnd]!) &&
      (text.charCodeAt(tokenEnd) < 32 || text.charCodeAt(tokenEnd) === 127);
    const decreasing: number[] = [];
    for (let position = tokenEnd; position >= tokenStart; position -= 1) {
      while (
        decreasing.length &&
        depths[decreasing.at(-1)!]! >= depths[position]!
      )
        decreasing.pop();
      if (decreasing.length) nextLower[position] = decreasing.at(-1)!;
      decreasing.push(position);
    }
    for (let position = tokenStart; position < tokenEnd; position += 1) {
      tokenEnds[position] = tokenEnd;
      invalidEnds[position] = invalidEnd;
    }
    tokenStart = tokenEnd + 1;
  }
  return { tokenEnds, invalidEnds, depths, nextLower, newlines };
}

/**
 * parses a link destination in angle or bare form at an offset.
 * @param text containing text
 * @param index offset of the destination start
 * @param destinationIndex optional precomputed index for bare destinations
 * @returns destination text and offset past it, null when malformed
 */
export function parseDestination(
  text: string,
  index: number,
  destinationIndex?: BareDestinationIndex,
): [string, number] | null {
  if (index >= text.length) return null;
  const start = index;
  if (text[index] === "<") {
    index += 1;
    const contentStart = index;
    while (index < text.length) {
      if (text[index] === ">" && !isEscaped(text, index))
        return [text.slice(contentStart, index), index + 1];
      if (
        text[index] === "\n" ||
        (text[index] === "<" && !isEscaped(text, index))
      )
        return null;
      index += 1;
    }
    return null;
  }
  const code = text.charCodeAt(index);
  if (code < 32 || code === 127) return null;
  if (!destinationIndex) {
    let depth = 0;
    while (index < text.length) {
      const character = text[index]!;
      const characterCode = text.charCodeAt(index);
      if (/[ \t\n]/.test(character)) break;
      if (characterCode < 32 || characterCode === 127) return null;
      if (character === "(" && !isEscaped(text, index)) depth += 1;
      else if (character === ")" && !isEscaped(text, index)) {
        if (depth === 0) break;
        depth -= 1;
      }
      index += 1;
    }
    return index === start || depth ? null : [text.slice(start, index), index];
  }
  const tokenEnd = destinationIndex.tokenEnds[start]!;
  const lower = destinationIndex.nextLower[start];
  if (lower !== null && lower <= tokenEnd) index = lower - 1;
  else {
    if (destinationIndex.invalidEnds[start]) return null;
    index = tokenEnd;
  }
  return index === start ||
    destinationIndex.depths[index] !== destinationIndex.depths[start]
    ? null
    : [text.slice(start, index), index];
}

/**
 * parses a quoted or parenthesized link title at an offset.
 * @param text containing text
 * @param index offset of the title delimiter
 * @returns offset past the closing delimiter, null when unterminated
 */
export function parseTitle(text: string, index: number): number | null {
  const opening = text[index];
  const closing = opening === "(" ? ")" : opening;
  if (opening !== "(" && opening !== '"' && opening !== "'") return null;
  for (let cursor = index + 1; cursor < text.length; cursor += 1) {
    if (text[cursor] === closing && !isEscaped(text, cursor)) return cursor + 1;
    if (opening === "(" && text[cursor] === "(" && !isEscaped(text, cursor))
      return null;
    if (text[cursor] === "\n" && /^[ \t]*\n/.test(text.slice(cursor + 1)))
      return null;
  }
  return null;
}

/**
 * parses the destination, optional title, and end of an inline link body.
 * @param text containing text
 * @param index offset just past the opening parenthesis or label
 * @param closingParenthesis whether a closing parenthesis must terminate
 * @param destinationIndex precomputed index reused across calls
 * @returns target, destination line offset, and end offset, null when invalid
 */
export function parseLinkComponents(
  text: string,
  index: number,
  closingParenthesis: boolean,
  destinationIndex = bareDestinationIndex(text),
): [string, number, number] | null {
  const leading = skipLinkWhitespace(text, index);
  if (!leading) return null;
  index = leading[0];
  const destinationLine = destinationIndex.newlines.filter(
    (newline) => newline < index,
  ).length;
  const destination = parseDestination(text, index, destinationIndex);
  if (!destination) return null;
  const [target, destinationEnd] = destination;
  const trailing = skipLinkWhitespace(text, destinationEnd);
  if (!trailing) return null;
  const [nextIndex, hadWhitespace] = trailing;
  if (closingParenthesis && text[nextIndex] === ")")
    return [target, destinationLine, nextIndex + 1];
  if (!closingParenthesis && nextIndex === text.length)
    return [target, destinationLine, nextIndex];
  if (!hadWhitespace) return null;
  const titleEnd = parseTitle(text, nextIndex);
  if (titleEnd === null) return null;
  const afterTitle = skipLinkWhitespace(text, titleEnd);
  if (!afterTitle) return null;
  let end = afterTitle[0];
  if (closingParenthesis) {
    if (text[end] !== ")") return null;
    end += 1;
  } else if (end !== text.length) return null;
  return [target, destinationLine, end];
}

/**
 * parses the destination and extent of a reference definition.
 * @param text joined definition block
 * @param index offset just past the definition colon
 * @param definitionStart offset of the definition's own line start
 * @param destinationIndex optional precomputed index for bare destinations
 * @returns target, destination line offset, and end offset, null when invalid
 */
export function parseReferenceComponents(
  text: string,
  index: number,
  definitionStart: number,
  destinationIndex?: BareDestinationIndex,
): [string, number, number] | null {
  const leading = skipLinkWhitespace(text, index);
  if (!leading) return null;
  const destinationStart = leading[0];
  const destination = parseDestination(
    text,
    destinationStart,
    destinationIndex,
  );
  if (!destination) return null;
  const [target, destinationEnd] = destination;
  const destinationLine = text
    .slice(definitionStart, destinationStart)
    .includes("\n")
    ? 1
    : 0;
  let destinationLineEnd = text.indexOf("\n", destinationEnd);
  if (destinationLineEnd < 0) destinationLineEnd = text.length;
  const destinationOnly =
    text.slice(destinationEnd, destinationLineEnd).trim().length === 0;
  const trailing = skipLinkWhitespace(text, destinationEnd);
  if (
    trailing &&
    trailing[1] &&
    trailing[0] < text.length &&
    "\"'( ".includes(text[trailing[0]]!)
  ) {
    const titleEnd = parseTitle(text, trailing[0]);
    if (titleEnd !== null) {
      let titleLineEnd = text.indexOf("\n", titleEnd);
      if (titleLineEnd < 0) titleLineEnd = text.length;
      if (text.slice(titleEnd, titleLineEnd).trim().length === 0)
        return [target, destinationLine, titleLineEnd];
    }
  }
  return destinationOnly ? [target, destinationLine, destinationLineEnd] : null;
}

/**
 * collects every well-formed inline link candidate outside code spans.
 * @param text containing text
 * @param codeSpans closed code spans precomputed for the text
 * @param textEndings bracket pairings precomputed for the text
 * @returns candidates in source order
 */
export function inlineLinkCandidates(
  text: string,
  codeSpans = closedCodeSpans(text, text.length),
  textEndings = linkTextEndings(text, codeSpans),
): LinkCandidate[] {
  const destinationIndex = bareDestinationIndex(text);
  const candidates: LinkCandidate[] = [];
  let cursor = 0;
  for (let index = 0; index < text.length; index += 1) {
    const skipped = skipClosedCodeSpan(index, codeSpans, cursor);
    cursor = skipped[1];
    if (skipped[0] !== index) {
      index = skipped[0] - 1;
      continue;
    }
    if (text[index] !== "[" || isEscaped(text, index)) continue;
    const labelEnd = textEndings.get(index);
    if (labelEnd === undefined || text[labelEnd] !== "(") continue;
    const parsed = parseLinkComponents(
      text,
      labelEnd + 1,
      true,
      destinationIndex,
    );
    if (!parsed) continue;
    candidates.push({
      target: parsed[0],
      start: index,
      end: parsed[2],
      destinationLine: parsed[1],
      labelEnd,
      isImage:
        index > 0 && text[index - 1] === "!" && !isEscaped(text, index - 1),
    });
  }
  return candidates;
}

/**
 * collects reference-style links whose labels resolve to known definitions.
 * @param text containing text
 * @param labels normalized labels of known reference definitions
 * @param codeSpans closed code spans precomputed for the text
 * @param textEndings bracket pairings precomputed for the text
 * @returns candidates in source order
 */
export function referenceLinkCandidates(
  text: string,
  labels: ReadonlySet<string>,
  codeSpans = closedCodeSpans(text, text.length),
  textEndings = linkTextEndings(text, codeSpans),
): LinkCandidate[] {
  const candidates: LinkCandidate[] = [];
  let cursor = 0;
  for (let index = 0; index < text.length; index += 1) {
    const skipped = skipClosedCodeSpan(index, codeSpans, cursor);
    cursor = skipped[1];
    if (skipped[0] !== index) {
      index = skipped[0] - 1;
      continue;
    }
    const visibleEnd = textEndings.get(index);
    if (visibleEnd === undefined) continue;
    const visibleLabel = text.slice(index + 1, visibleEnd - 1);
    if (text[visibleEnd] === "(" || text[visibleEnd] === ":") continue;
    let end = visibleEnd;
    let label = visibleLabel;
    if (text[visibleEnd] === "[") {
      const explicit = referenceLabel(text, visibleEnd);
      if (!explicit) continue;
      label = explicit[0] || visibleLabel;
      end = explicit[1];
    }
    if (labels.has(normalizeReferenceLabel(label)))
      candidates.push({
        target: null,
        start: index,
        end,
        destinationLine: 0,
        labelEnd: visibleEnd,
        isImage:
          index > 0 && text[index - 1] === "!" && !isEscaped(text, index - 1),
      });
  }
  return candidates;
}

/**
 * marks links whose whole extent sits inside another link's destination.
 * @param candidates deduplicated candidates
 * @returns indexes of candidates contained by a destination
 */
export function destinationContainedCandidates(
  candidates: readonly LinkCandidate[],
): Set<number> {
  const intervals = candidates
    .map((candidate): [number, number] => [candidate.labelEnd, candidate.end])
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const ordered = candidates
    .map((candidate, index) => [index, candidate] as const)
    .sort(
      (left, right) => left[1].start - right[1].start || left[0] - right[0],
    );
  const contained = new Set<number>();
  let intervalIndex = 0;
  let furthestEnd = -1;
  for (const [candidateIndex, candidate] of ordered) {
    while (
      intervalIndex < intervals.length &&
      intervals[intervalIndex]![0] <= candidate.start
    ) {
      furthestEnd = Math.max(furthestEnd, intervals[intervalIndex]![1]);
      intervalIndex += 1;
    }
    if (candidate.start < furthestEnd) contained.add(candidateIndex);
  }
  return contained;
}

/**
 * marks non-image links that wrap a nested link in their label text.
 * @param candidates deduplicated candidates
 * @returns indexes of outer links superseded by their inner links
 */
export function containingNonImageLinks(
  candidates: readonly LinkCandidate[],
): Set<number> {
  const ordered = candidates
    .map((candidate, index) => [index, candidate] as const)
    .sort((left, right) => right[1].start - left[1].start);
  const containing = new Set<number>();
  let minimumNestedEnd: number | null = null;
  for (let groupStart = 0; groupStart < ordered.length;) {
    const start = ordered[groupStart]![1].start;
    let groupEnd = groupStart;
    while (groupEnd < ordered.length && ordered[groupEnd]![1].start === start)
      groupEnd += 1;
    for (const [index, candidate] of ordered.slice(groupStart, groupEnd))
      if (
        !candidate.isImage &&
        minimumNestedEnd !== null &&
        minimumNestedEnd <= candidate.labelEnd
      )
        containing.add(index);
    for (const [, candidate] of ordered.slice(groupStart, groupEnd))
      if (!candidate.isImage)
        minimumNestedEnd = Math.min(
          minimumNestedEnd ?? candidate.end,
          candidate.end,
        );
    groupStart = groupEnd;
  }
  return containing;
}

/**
 * merges inline and reference candidates, dropping shadowed duplicates.
 * @param text containing text
 * @param labels normalized labels of known reference definitions
 * @returns surviving candidates in source order
 */
export function selectedLinkCandidates(
  text: string,
  labels: ReadonlySet<string>,
): LinkCandidate[] {
  const codeSpans = closedCodeSpans(text, text.length);
  const endings = linkTextEndings(text, codeSpans);
  const candidates = [
    ...inlineLinkCandidates(text, codeSpans, endings),
    ...referenceLinkCandidates(text, labels, codeSpans, endings),
  ];
  const seen = new Set<string>();
  const unique = candidates.filter((candidate) => {
    const key = `${candidate.target ?? ""}\0${candidate.start}\0${candidate.end}\0${candidate.destinationLine}\0${candidate.labelEnd}\0${candidate.isImage}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const excluded = destinationContainedCandidates(unique);
  for (const index of containingNonImageLinks(unique)) excluded.add(index);
  return unique.filter((_, index) => !excluded.has(index));
}

/**
 * flattens selected candidates into target and position tuples.
 * @param text containing text
 * @param labels normalized labels of known reference definitions
 * @returns target, start, end, and destination line tuples
 */
export function inlineLinks(
  text: string,
  labels: ReadonlySet<string> = new Set(),
): Array<[string, number, number, number]> {
  return selectedLinkCandidates(text, labels)
    .filter(
      (candidate): candidate is LinkCandidate & { target: string } =>
        candidate.target !== null,
    )
    .map((candidate) => [
      candidate.target,
      candidate.start,
      candidate.end,
      candidate.destinationLine,
    ]);
}

/**
 * blanks covered characters while preserving length and newline positions.
 * @param text text to mask
 * @param spans [start, end] character ranges to replace with spaces
 * @returns masked copy with identical line structure
 */
export function maskSpans(
  text: string,
  spans: ReadonlyArray<readonly [number, number]>,
): string {
  const characters = [...text];
  for (const [start, end] of spans)
    for (let index = start; index < end; index += 1)
      if (characters[index] !== "\n") characters[index] = " ";
  return characters.join("");
}

/**
 * decides whether a backticked mention reads as a repository path claim.
 * @param target mention text without its backticks
 * @returns true when the mention should resolve against the repository
 */
export function isBacktickedPath(target: string): boolean {
  if (
    target.startsWith("./") ||
    target.startsWith("../") ||
    target.startsWith("{{PLUGIN_DIR}}/")
  )
    return true;
  if (REPOSITORY_PATH_ROOTS.has(target.split("/", 1)[0]!)) return true;
  if (target.startsWith(".")) return false;
  return /\.[A-Za-z][A-Za-z0-9]*\/*$/.test(target);
}

/**
 * collects source ranges of rendered links for masking.
 * @param text containing text
 * @param referenceLabels normalized labels of known reference definitions
 * @returns [start, end] ranges covering each selected link
 */
export function displaySpans(
  text: string,
  referenceLabels: ReadonlySet<string>,
): Array<[number, number]> {
  return selectedLinkCandidates(text, referenceLabels).map((candidate) => [
    candidate.start,
    candidate.end,
  ]);
}

/**
 * gathers path claims from links and backticked mentions with their lines.
 * @param text block text to scan
 * @param referenceLabels normalized labels of known reference definitions
 * @param carriedSpans extra ranges treated as inert display text
 * @returns mention and line-offset pairs, deduplicated
 */
export function mentions(
  text: string,
  referenceLabels: ReadonlySet<string> = new Set(),
  carriedSpans: ReadonlyArray<readonly [number, number]> = [],
): Array<[string, number]> {
  const found = new Map<string, [string, number]>();
  const links = inlineLinks(text, referenceLabels);
  for (const [target, , , line] of links) {
    const normalized = normalizeDestination(target);
    if (!/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(normalized)) {
      const mention = normalized.split("#", 1)[0]!;
      found.set(`${mention}\0${line}`, [mention, line]);
    }
  }
  const masked = maskSpans(text, [
    ...displaySpans(text, referenceLabels),
    ...carriedSpans,
  ]);
  for (const match of masked.matchAll(/`([A-Za-z0-9_./{}-]+)`/g)) {
    const target = match[1]!;
    if (isBacktickedPath(target)) {
      const line = masked.slice(0, match.index).split("\n").length - 1;
      found.set(`${target}\0${line}`, [target, line]);
    }
  }
  return [...found.values()].filter(([mention]) => mention.length > 0);
}

/**
 * decides whether a mention is exempt from resolution checks.
 * @param mention normalized mention text
 * @returns true for runtime trees, templates, prose, and absolute paths
 */
export function isSkipped(mention: string): boolean {
  if (
    /<[^>]*>|\{\{(?!PLUGIN_DIR\}\})[^}]*\}\}|(?<!\{)\{(?!\{)[^{}]*\}/.test(
      mention,
    )
  )
    return true;
  if (
    RUNTIME_ROOTS.some(
      (root) => mention.startsWith(root) || mention.includes(`/${root}`),
    )
  )
    return true;
  if (TARGET_REPO_TEMPLATES.some((root) => mention.startsWith(root)))
    return true;
  if (mention.endsWith("/") && (mention.match(/\//g)?.length ?? 0) === 1)
    return true;
  if (!mention.includes("/")) return true;
  return isAbsolute(mention);
}

/**
 * lists directories a document's relative mentions may resolve against.
 * @param root repository root
 * @param document path of the document being checked
 * @returns ancestor directories, the owning plugin root, and its standards
 */
export function resolutionBases(root: string, document: string): string[] {
  const bases: string[] = [];
  let directory = dirname(document);
  while (true) {
    bases.push(directory);
    if (directory === root) break;
    directory = dirname(directory);
  }
  const owner = pluginRoot(root, document);
  if (!bases.includes(owner)) bases.push(owner);
  const standards = join(owner, "standards");
  if (existsSync(standards) && !bases.includes(standards))
    bases.push(standards);
  return bases;
}

/**
 * joins a logical block starting at a line until a terminator appears.
 * @param lines document lines
 * @param start index of the first line of the block
 * @returns container-stripped lines belonging to one logical block
 */
export function continuationLines(
  lines: readonly string[],
  start: number,
): string[] {
  const source: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (
      !line.trim() ||
      line.includes(IGNORE_MARKER) ||
      line.trimStart().startsWith("```")
    )
      break;
    source.push(stripMarkdownContainers(line));
  }
  return source;
}

/**
 * parses reference definitions out of one logical block.
 * @param sourceLines container-stripped block lines
 * @returns definitions with source offsets into the joined block
 */
export function blockReferenceDefinitions(
  sourceLines: readonly string[],
): ReferenceDefinitionCandidate[] {
  const source = sourceLines.join("\n");
  const definitions: ReferenceDefinitionCandidate[] = [];
  let lineStart = 0;
  for (const [relativeLine, line] of sourceLines.entries()) {
    const definition = referenceDefinition(line);
    if (definition) {
      const [label, destinationStart] = definition;
      const parsed = parseReferenceComponents(
        source,
        lineStart + destinationStart,
        lineStart,
      );
      if (parsed) {
        const [target, destinationLine, end] = parsed;
        const labelStart = line.length - line.trimStart().length;
        definitions.push({
          label,
          target,
          destinationLine: relativeLine + destinationLine,
          start: lineStart + labelStart,
          end,
        });
      }
    }
    lineStart += line.length + 1;
  }
  return definitions;
}

/**
 * scans one logical block for path claims including definition targets.
 * @param sourceLines container-stripped block lines
 * @param labels normalized labels of known reference definitions
 * @param definitions parsed definitions from the same block
 * @returns mention and line-offset pairs
 */
export function blockMentions(
  sourceLines: readonly string[],
  labels: ReadonlySet<string>,
  definitions: readonly ReferenceDefinitionCandidate[],
): Array<[string, number]> {
  const source = sourceLines.join("\n");
  const spans = definitions.map((definition): [number, number] => [
    definition.start,
    definition.end,
  ]);
  const definitionMentions: Array<[string, number]> = [];
  for (const definition of definitions) {
    const normalized = normalizeDestination(definition.target);
    if (!/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(normalized))
      definitionMentions.push([
        normalized.split("#", 1)[0]!,
        definition.destinationLine,
      ]);
  }
  return [...mentions(source, labels, spans), ...definitionMentions];
}

/**
 * splits document lines into logical content blocks outside fences.
 * @param lines document lines
 * @returns block start indexes paired with container-stripped lines
 */
export function contentBlocks(
  lines: readonly string[],
): Array<[number, string[]]> {
  const blocks: Array<[number, string[]]> = [];
  let inFence = false;
  for (let index = 0; index < lines.length;) {
    const line = lines[index]!;
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      index += 1;
      continue;
    }
    if (inFence || !line.trim() || line.includes(IGNORE_MARKER)) {
      index += 1;
      continue;
    }
    const source = continuationLines(lines, index);
    blocks.push([index, source]);
    index += source.length;
  }
  return blocks;
}

/**
 * decides whether a mention resolves, is illustrative, or is unresolved.
 * @param bases directories eligible for relative resolution
 * @param mention normalized mention text
 * @param owner owning plugin directory used for placeholder substitution
 * @returns classification of the mention against the repository
 */
export function classify(
  bases: readonly string[],
  mention: string,
  owner: string,
): "resolved" | "illustrative" | "unresolved" {
  if (mention.includes("{{PLUGIN_DIR}}"))
    return existsSync(mention.replaceAll("{{PLUGIN_DIR}}", owner))
      ? "resolved"
      : "unresolved";
  if (mention.startsWith("./") || mention.startsWith("../")) {
    if (existsSync(resolve(bases[0]!, mention))) return "resolved";
    const first = mention
      .split("/")
      .find((part) => part !== "." && part !== "..");
    return first && EXAMPLE_ROOTS.has(first) ? "illustrative" : "unresolved";
  }
  if (bases.some((base) => existsSync(join(base, mention)))) return "resolved";
  return EXAMPLE_ROOTS.has(mention.split("/", 1)[0]!)
    ? "illustrative"
    : "unresolved";
}

/**
 * validates every document's path claims and forbidden reference nesting.
 * @param root repository root to check
 * @returns human-readable findings in document and line order
 */
export function check(root: string): string[] {
  const sourcePaths = repositorySourcePaths(root);
  const findings = forbiddenReferenceNesting(root, sourcePaths);
  for (const document of iterDocuments(sourcePaths)) {
    if (/\.(?:template|example)\./.test(basename(document))) continue;
    const bases = resolutionBases(root, document);
    const owner = pluginRoot(root, document);
    const lines = readFileSync(document, "utf8").split(/\r?\n/);
    const blocks = contentBlocks(lines).map(
      ([lineIndex, sourceLines]) =>
        [
          lineIndex,
          sourceLines,
          blockReferenceDefinitions(sourceLines),
        ] as const,
    );
    const labels = new Set(
      blocks.flatMap(([, , definitions]) =>
        definitions.map((definition) => definition.label),
      ),
    );
    for (const [lineIndex, sourceLines, definitions] of blocks) {
      const unique = new Map(
        blockMentions(sourceLines, labels, definitions).map((item) => [
          `${item[0]}\0${item[1]}`,
          item,
        ]),
      );
      for (const [mention, offset] of [...unique.values()].sort())
        if (
          !isSkipped(mention) &&
          classify(bases, mention, owner) === "unresolved"
        )
          findings.push(
            `${relative(root, document)}:${lineIndex + offset + 1} → ${mention}`,
          );
    }
  }
  return findings;
}

/**
 * runs the checker over a repository and reports findings.
 * @param args command line arguments, optionally one root path
 * @returns exit code, 2 on usage errors, 1 when findings exist, else 0
 */
export function main(args = Bun.argv.slice(2)): number {
  if (args.length > 1) {
    process.stderr.write("usage: check_doc_paths.ts [root]\n");
    return 2;
  }
  const root = resolve(args[0] ?? join(import.meta.dirname, ".."));
  const findings = check(root);
  for (const finding of findings) process.stdout.write(`${finding}\n`);
  if (findings.length)
    process.stderr.write(`\n${findings.length} unresolved path mention(s)\n`);
  return findings.length ? 1 : 0;
}
if (import.meta.main) process.exit(main());
