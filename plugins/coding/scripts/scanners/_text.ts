import type { Match } from "../scanlib/rule.ts";

/**
 * Reports every regex hit in a block of text as a match record, resolving
 * each hit's offset back to a file line.
 *
 * @param path - path of the scanned file
 * @param lines - file lines, used for the reported line text
 * @param matches - accumulator receiving the match records
 * @param pattern - pattern whose hits become matches
 * @param text - text to search; defaults to all lines joined
 */
export function pushTextMatches(
  path: string,
  lines: readonly string[],
  matches: Match[],
  pattern: RegExp,
  text = lines.join("\n"),
): void {
  for (const hit of text.matchAll(pattern)) {
    const offset = hit.index ?? 0;
    const lineno = text.slice(0, offset).split("\n").length;
    matches.push({ path, lineno, line: lines[lineno - 1] ?? "" });
  }
}
