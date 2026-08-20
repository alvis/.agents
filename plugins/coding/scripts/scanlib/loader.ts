import { readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { Rule } from "./rule.ts";

interface RuleModule {
  readonly RULE?: Rule;
  readonly RULES?: readonly Rule[];
}

/**
 * Loads every public rule module in a scanner directory, sorted by rule order
 * then id.
 *
 * A module that throws at import time is skipped with a stderr warning so one
 * broken scanner cannot take down a whole lint run.
 *
 * @param directory - scanner directory to read; defaults to this package's own
 *   scanners
 * @returns the loaded rules sorted by order then id
 */
export async function loadRules(
  directory = join(import.meta.dirname, "../scanners"),
): Promise<Rule[]> {
  const rules: Rule[] = [];
  const modules = readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !entry.name.startsWith("_") &&
        entry.name !== "index.ts",
    )
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of modules) {
    try {
      const module = (await import(
        `${pathToFileURL(resolve(directory, entry.name)).href}?scanner=${Date.now()}-${entry.name}`
      )) as RuleModule;
      if (module.RULES !== undefined) rules.push(...module.RULES);
      else if (module.RULE !== undefined) rules.push(module.RULE);
    } catch (error) {
      process.stderr.write(
        `warn: failed to load rule module ${basename(entry.name, ".ts")}: ${(error as Error).message}\n`,
      );
    }
  }
  return rules.sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id),
  );
}
