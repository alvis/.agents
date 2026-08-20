import type { Rule, ScanParams } from "../scanlib/rule.ts";

interface LineRuleOptions extends Omit<Rule, "scan"> {
  readonly pattern: RegExp;
  readonly code?: (line: string) => string;
  readonly accept?: (params: {
    readonly path: string;
    readonly line: string;
    readonly lineno: number;
  }) => boolean;
}

/**
 * Builds a rule that reports every line matching a pattern, after optional
 * code normalization and acceptance filtering.
 *
 * @param options - rule metadata plus the pattern, code transform, and
 *   accept predicate
 * @returns the assembled rule
 */
export function lineRule(options: LineRuleOptions): Rule {
  const {
    pattern,
    code = (line) => line,
    accept = () => true,
    ...rule
  } = options;
  return {
    ...rule,
    scan: ({ path, lines, matches }: ScanParams): void => {
      for (const [index, line] of lines.entries()) {
        pattern.lastIndex = 0;
        if (
          pattern.test(code(line)) &&
          accept({ path, line, lineno: index + 1 })
        ) {
          matches.push({ path, lineno: index + 1, line });
        }
      }
    },
  };
}

/** Strips trailing `//` comments so patterns judge code only. */
export const withoutLineComment = (line: string): string =>
  line.replace(/\/\/.*$/, "");
