#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
/** canonical Claude marketplace manifest consumed as projection input */
export const SOURCE = join(ROOT, ".claude-plugin", "marketplace.json");
/** Codex marketplace projection rendered from the Claude manifest */
export const TARGET = join(ROOT, ".agents", "plugins", "marketplace.json");

/** plugin entry accepted from the Claude manifest */
interface SourcePlugin {
  /** stable marketplace identifier */
  name: string;
  /** repository path of the plugin directory */
  source: string;
  /** free-form category carried through to the projection unchanged */
  category: unknown;
}
/** shape the projection reads out of the Claude manifest */
interface SourceMarketplace {
  /** marketplace display name */
  name: string;
  /** owner metadata whose name overrides the display name when present */
  owner?: { name?: unknown };
  /** plugin entries projected for Codex */
  plugins: SourcePlugin[];
}

/**
 * maps the Claude marketplace onto the structural Codex projection.
 * @param source parsed Claude marketplace manifest
 * @returns plain object ready to serialize as the Codex manifest
 */
export function projectMarketplace(
  source: SourceMarketplace,
): Record<string, unknown> {
  const ownerName =
    typeof source.owner?.name === "string" ? source.owner.name : source.name;
  return {
    name: source.name,
    interface: { displayName: ownerName },
    plugins: source.plugins
      .filter(
        (plugin): plugin is SourcePlugin =>
          typeof plugin === "object" && plugin !== null,
      )
      .map((plugin) => ({
        name: plugin.name,
        source: { source: "local", path: plugin.source },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: plugin.category,
      })),
  };
}

/**
 * renders the current marketplace projection from the Claude manifest.
 * @returns serialized projection text terminated by a newline
 */
export function renderProjection(): string {
  const source = JSON.parse(readFileSync(SOURCE, "utf8")) as SourceMarketplace;
  return `${JSON.stringify(projectMarketplace(source), null, 2)}\n`;
}

/**
 * writes the Codex projection, or verifies it when --check is passed.
 * @param args command line arguments, optionally containing --check
 * @returns exit code, 2 on unknown arguments or a stale projection, else 0
 */
export function main(args = Bun.argv.slice(2)): number {
  const unknown = args.filter((arg) => arg !== "--check");
  if (unknown.length > 0) {
    process.stderr.write(
      `generate_codex_marketplace.ts: error: unrecognized arguments: ${unknown.join(" ")}\n`,
    );
    return 2;
  }
  const rendered = renderProjection();
  if (args.includes("--check")) {
    if (!existsSync(TARGET) || readFileSync(TARGET, "utf8") !== rendered) {
      process.stderr.write(
        "generate_codex_marketplace.ts: error: Codex marketplace projection is stale; rerun this script\n",
      );
      return 2;
    }
    return 0;
  }
  mkdirSync(dirname(TARGET), { recursive: true });
  writeFileSync(TARGET, rendered, "utf8");
  return 0;
}

if (import.meta.main) process.exit(main());
