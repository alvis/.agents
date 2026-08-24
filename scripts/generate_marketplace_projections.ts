#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
/** canonical Claude marketplace manifest consumed as projection input */
export const SOURCE = join(ROOT, ".claude-plugin", "marketplace.json");
/** Codex marketplace projection rendered from the Claude manifest */
export const CODEX_TARGET = join(ROOT, ".agents", "plugins", "marketplace.json");
/** Grok Build marketplace projection rendered from the Claude manifest */
export const GROK_TARGET = join(ROOT, ".grok-plugin", "marketplace.json");

/** plugin entry accepted from the Claude manifest */
interface SourcePlugin {
  /** stable marketplace identifier */
  name: string;
  /** repository path of the plugin directory */
  source: string;
  /** free-form category carried through to the Codex projection unchanged */
  category: unknown;
}
/** shape the projections read out of the Claude manifest */
interface SourceMarketplace {
  /** marketplace display name */
  name: string;
  /** owner metadata whose name overrides the display name when present */
  owner?: { name?: unknown };
  /** collection description carried to the Grok projection unchanged */
  metadata?: { description?: unknown };
  /** plugin entries projected for every downstream harness */
  plugins: SourcePlugin[];
}

/** one downstream harness projection: destination plus renderer */
interface Projection {
  /** harness-facing name used in error output */
  readonly label: string;
  /** absolute path the rendered manifest is written to */
  readonly target: string;
  /** renders the projection object from the parsed Claude manifest */
  readonly project: (source: SourceMarketplace) => Record<string, unknown>;
}

/** every downstream harness marketplace projected from one Claude catalog */
const PROJECTIONS: readonly Projection[] = [
  { label: "Codex", target: CODEX_TARGET, project: projectCodexMarketplace },
  {
    label: "Grok Build",
    target: GROK_TARGET,
    project: projectGrokMarketplace,
  },
];

function pluginEntries(source: SourceMarketplace): SourcePlugin[] {
  return source.plugins.filter(
    (plugin): plugin is SourcePlugin =>
      typeof plugin === "object" && plugin !== null,
  );
}
function ownerName(source: SourceMarketplace): string {
  return typeof source.owner?.name === "string"
    ? source.owner.name
    : source.name;
}

/**
 * maps the Claude marketplace onto the structural Codex projection.
 * @param source parsed Claude marketplace manifest
 * @returns plain object ready to serialize as the Codex manifest
 */
export function projectCodexMarketplace(
  source: SourceMarketplace,
): Record<string, unknown> {
  return {
    name: source.name,
    interface: { displayName: ownerName(source) },
    plugins: pluginEntries(source).map((plugin) => ({
      name: plugin.name,
      source: { source: "local", path: plugin.source },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: plugin.category,
    })),
  };
}

/**
 * maps the Claude marketplace onto the structural Grok Build projection.
 * Per-plugin descriptions stay owned by each plugin manifest, not this catalog.
 * @param source parsed Claude marketplace manifest
 * @returns plain object ready to serialize as the Grok manifest
 */
export function projectGrokMarketplace(
  source: SourceMarketplace,
): Record<string, unknown> {
  return {
    name: source.name,
    description:
      typeof source.metadata?.description === "string"
        ? source.metadata.description
        : "",
    owner: { name: ownerName(source) },
    plugins: pluginEntries(source).map((plugin) => ({
      name: plugin.name,
      source: { type: "local", path: plugin.source },
    })),
  };
}

/**
 * renders every marketplace projection from the Claude manifest.
 * @returns serialized projections paired with their destinations, each newline-terminated
 */
export function renderProjections(): readonly {
  label: string;
  target: string;
  text: string;
}[] {
  const source = JSON.parse(readFileSync(SOURCE, "utf8")) as SourceMarketplace;
  return PROJECTIONS.map(({ label, target, project }) => ({
    label,
    target,
    text: `${JSON.stringify(project(source), null, 2)}\n`,
  }));
}

/**
 * writes every marketplace projection, or verifies them when --check is passed.
 * @param args command line arguments, optionally containing --check
 * @returns exit code, 2 on unknown arguments or any stale projection, else 0
 */
export function main(args = Bun.argv.slice(2)): number {
  const unknown = args.filter((arg) => arg !== "--check");
  if (unknown.length > 0) {
    process.stderr.write(
      `generate_marketplace_projections.ts: error: unrecognized arguments: ${unknown.join(" ")}\n`,
    );
    return 2;
  }
  const rendered = renderProjections();
  if (args.includes("--check")) {
    const stale = rendered.filter(
      ({ target, text }) =>
        !existsSync(target) || readFileSync(target, "utf8") !== text,
    );
    for (const { label } of stale)
      process.stderr.write(
        `generate_marketplace_projections.ts: error: ${label} marketplace projection is stale; rerun this script\n`,
      );
    return stale.length > 0 ? 2 : 0;
  }
  for (const { target, text } of rendered) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text, "utf8");
  }
  return 0;
}

if (import.meta.main) process.exit(main());
