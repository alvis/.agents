#!/usr/bin/env bun
/** source-derived harness compatibility matrix generator */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const TARGET = join(ROOT, "COMPATIBILITY.md");
const CONTRACT_PATH = join(ROOT, "scripts", "opencode_contract.json");
const REVIEWED_DATE = "2026-08-25";
const FULL = "✅ Native";
const ADAPTED = "🟡 Adapted";
const EXTERNAL = "🔌 Integration";
const EXPERIMENTAL = "🧪 Experimental";
const UNAVAILABLE = "❌ Unavailable";
const INTEGRATION_CAVEAT_BY_SKILL: Readonly<Record<string, string>> = {
  "client:create-screen-design":
    "Requires the documented Notion transport and credentials.",
  "client:update-screen-design":
    "Requires the documented Notion transport and credentials.",
  "coding:pr": "Requires authenticated GitHub tooling.",
  "specification:sync-notion":
    "Requires the documented Notion transport and credentials.",
  "specification:sync-spec":
    "Requires the documented Notion transport and credentials.",
  "web:audit": "Requires a compatible browser integration.",
  "web:imagine": "Requires an image-generation provider or tool.",
  "web:next": "Requires a compatible browser integration.",
  "web:storybook": "Requires a compatible browser integration.",
};
const OPENCODE_UNAVAILABLE_SKILLS: Readonly<Record<string, string>> = {
  "essential:install-agents":
    "The projector already installs OpenCode agents; this skill's installer supports Claude Code, Codex, and Grok Build.",
};

interface Feature {
  /** rendered row label */
  readonly name: string;
  readonly claude: string;
  readonly codex: string;
  readonly grok: string;
  readonly opencode: string;
  readonly caveat: string;
}

function feature(
  name: string,
  claude: string,
  codex: string,
  grok: string,
  opencode: string,
  caveat: string,
): Feature {
  return { name, claude, codex, grok, opencode, caveat };
}

const CROSS_CUTTING_FEATURES: readonly Feature[] = [
  feature(
    "Plugin installation",
    FULL,
    FULL,
    FULL,
    ADAPTED,
    "Grok Build installs from its own projected marketplace; OpenCode uses `scripts/install_opencode.ts`.",
  ),
  feature(
    "Marketplace catalog",
    FULL,
    FULL,
    ADAPTED,
    UNAVAILABLE,
    "OpenCode V1 documents local files and npm plugins, not this marketplace format.",
  ),
  feature(
    "Skills",
    FULL,
    FULL,
    ADAPTED,
    ADAPTED,
    "OpenCode projects `plugin:skill` to the collision-safe name `plugin-skill`.",
  ),
  feature(
    "Slash commands",
    FULL,
    ADAPTED,
    ADAPTED,
    ADAPTED,
    "OpenCode generates `/<plugin>-<skill>` wrappers with `$ARGUMENTS`.",
  ),
  feature(
    "Skill resources and references",
    FULL,
    FULL,
    ADAPTED,
    ADAPTED,
    "OpenCode bundles complete plugin trees and retargets projected Markdown links.",
  ),
  feature(
    "Standards and scanners",
    FULL,
    FULL,
    ADAPTED,
    ADAPTED,
    "Runtime prerequisites still apply to scripts invoked by a skill.",
  ),
  feature(
    "Bundled scripts",
    FULL,
    FULL,
    ADAPTED,
    ADAPTED,
    "OpenCode copies plugin executables and retargets projected skill-root paths to the bundle.",
  ),
  feature(
    "Session context payloads",
    FULL,
    FULL,
    ADAPTED,
    EXPERIMENTAL,
    "OpenCode resolves receipt audiences through `experimental.chat.system.transform`; unresolved sessions receive only identifier mapping.",
  ),
  feature(
    "Skill-scoped hooks",
    FULL,
    FULL,
    UNAVAILABLE,
    ADAPTED,
    "Grok Build ignores skill-frontmatter hooks. OpenCode runs the command-filtered commit guards from resolved receipts because its plugin API exposes no skill-scope event.",
  ),
  feature(
    "Question guard",
    FULL,
    FULL,
    ADAPTED,
    ADAPTED,
    "The adapter runs the receipt-bound Essential validator before OpenCode `question` execution and retains allow advice for the matching result.",
  ),
  feature(
    "Subagent dispatch guard",
    FULL,
    FULL,
    ADAPTED,
    ADAPTED,
    "OpenCode validates `task` prompts through the receipt alias; the host has no persistent teammate identity.",
  ),
  feature(
    "Plan-exit guard",
    FULL,
    FULL,
    ADAPTED,
    UNAVAILABLE,
    "The adapter registers every receipt alias, but OpenCode 1.18.x exposes no native plan-transition tool event.",
  ),
  feature(
    "Stop state reminder",
    FULL,
    FULL,
    ADAPTED,
    ADAPTED,
    "Grok ignores the blocking Stop envelope. OpenCode exposes no cancellable Stop event, so the receipt is labelled advisory system context and creates no synthetic turn.",
  ),
  feature(
    "MCP servers",
    FULL,
    FULL,
    ADAPTED,
    ADAPTED,
    "The adapter maps HTTP to remote and command definitions to local MCP servers.",
  ),
  feature(
    "Specialist agents",
    FULL,
    FULL,
    ADAPTED,
    ADAPTED,
    "OpenCode Markdown agents inherit the active provider and model.",
  ),
  feature(
    "Child subagent sessions",
    FULL,
    FULL,
    ADAPTED,
    ADAPTED,
    "OpenCode task sessions work; persistent teammate IDs and direct peer messaging do not.",
  ),
  feature(
    "Project agent memory",
    FULL,
    ADAPTED,
    ADAPTED,
    ADAPTED,
    "OpenCode receives memory instructions but has no equivalent first-class Claude memory store.",
  ),
  feature(
    "Agent write fences",
    FULL,
    ADAPTED,
    ADAPTED,
    ADAPTED,
    "Recognized critic fences allow only rooted memory and canonical review-state paths; shell and external-directory access are denied.",
  ),
  feature(
    "Browser automation",
    EXTERNAL,
    EXTERNAL,
    EXTERNAL,
    EXTERNAL,
    "Requires a compatible browser tool or MCP server in every harness.",
  ),
  feature(
    "Notion synchronization",
    EXTERNAL,
    EXTERNAL,
    EXTERNAL,
    EXTERNAL,
    "Requires the documented Notion transport profile and credentials.",
  ),
  feature(
    "Image generation",
    EXTERNAL,
    EXTERNAL,
    EXTERNAL,
    EXTERNAL,
    "Requires a supported image provider or tool.",
  ),
  feature(
    "Claude output styles",
    FULL,
    UNAVAILABLE,
    UNAVAILABLE,
    UNAVAILABLE,
    "The repository intentionally scopes output-style installation to Claude Code.",
  ),
  feature(
    "Claude statusline",
    FULL,
    UNAVAILABLE,
    UNAVAILABLE,
    UNAVAILABLE,
    "The repository intentionally scopes statusline installation to Claude Code.",
  ),
];

function projectionContract(): Record<string, unknown> {
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, "utf8")) as unknown;
  if (
    contract === null ||
    typeof contract !== "object" ||
    Array.isArray(contract) ||
    (contract as Record<string, unknown>).skill_separator !== "-"
  ) {
    throw new Error(`invalid OpenCode projection contract: ${CONTRACT_PATH}`);
  }
  return contract as Record<string, unknown>;
}

function objectField(
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = source[key];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid ${key} in ${CONTRACT_PATH}`);
  }
  return value as Record<string, unknown>;
}

function validateCompatibilityHookAuthority(): void {
  const hooks = objectField(projectionContract(), "opencode_hooks");
  const scripts = objectField(hooks, "scripts");
  const skillScripts = objectField(hooks, "skill_scripts");
  const expectedModes: Readonly<Record<string, string>> = {
    "scripts/session-start": "context",
    "scripts/stop-first": "advisory",
    "scripts/subagent-start": "context",
    "scripts/validate-dispatch": "before",
    "scripts/validate-plan": "before",
    "scripts/validate-question": "before",
    "skill_scripts/coding/skills/commit/scripts/post-rewrite-hook.sh": "after",
    "skill_scripts/coding/skills/commit/scripts/pre-commit-hook.sh": "before",
  };
  for (const [path, expectedMode] of Object.entries(expectedModes)) {
    const separator = path.indexOf("/");
    const section = path.slice(0, separator);
    const key = path.slice(separator + 1);
    const policies = section === "scripts" ? scripts : skillScripts;
    const policy = objectField(policies, key);
    if (policy.enforcement_mode !== expectedMode) {
      throw new Error(`compatibility hook mode differs for ${path}`);
    }
  }
}

function projectedSkillName(pluginName: string, skillName: string): string {
  const separator = projectionContract().skill_separator;
  if (typeof separator !== "string") {
    throw new TypeError(`invalid skill separator: ${CONTRACT_PATH}`);
  }
  return [pluginName, skillName].join(separator);
}

function frontmatterValue(path: string, key: string): string {
  const text = readFileSync(path, "utf8");
  const match = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(.+)$`, "m").exec(text);
  if (!match) throw new Error(`missing ${key} in ${path}`);
  const rawValue = match[1]!.trim();
  const value =
    rawValue.length >= 2 &&
    rawValue[0] === rawValue[rawValue.length - 1] &&
    (rawValue[0] === "'" || rawValue[0] === '"')
      ? rawValue.slice(1, -1)
      : rawValue;
  return value.split(/\s+/).filter(Boolean).join(" ");
}

function sourceLink(path: string): string {
  const relativePath = relative(ROOT, path).split("\\").join("/");
  return `[${relativePath}](${relativePath})`;
}

function pluginOf(path: string): string {
  return relative(join(ROOT, "plugins"), path).split("\\").join("/").split("/")[0]!;
}

function skillFeature(path: string): Feature {
  const pluginName = pluginOf(path);
  const skillName = frontmatterValue(path, "name");
  const identity = `\`${pluginName}:${skillName}\` skill`;
  const sourceIdentity = `${pluginName}:${skillName}`;

  if (skillName === "install-output-styles" || skillName === "install-statusline") {
    return feature(
      identity,
      FULL,
      UNAVAILABLE,
      UNAVAILABLE,
      UNAVAILABLE,
      `Claude-only by contract. Source: ${sourceLink(path)}.`,
    );
  }

  const unavailableCaveat = OPENCODE_UNAVAILABLE_SKILLS[sourceIdentity];
  if (unavailableCaveat !== undefined) {
    return feature(
      identity,
      FULL,
      FULL,
      FULL,
      UNAVAILABLE,
      `${unavailableCaveat} Source: ${sourceLink(path)}.`,
    );
  }

  const integrationCaveat = INTEGRATION_CAVEAT_BY_SKILL[sourceIdentity];
  if (integrationCaveat !== undefined) {
    return feature(
      identity,
      EXTERNAL,
      EXTERNAL,
      EXTERNAL,
      EXTERNAL,
      `${integrationCaveat} Source: ${sourceLink(path)}.`,
    );
  }
  const opencodeCaveat =
    sourceIdentity === "coding:commit"
      ? " Receipt-bound command filtering preserves backup advice and post-rewrite diagnostics, but OpenCode exposes no skill-scope event."
      : "";
  return feature(
    identity,
    FULL,
    FULL,
    ADAPTED,
    ADAPTED,
    `OpenCode name: \`${projectedSkillName(pluginName, skillName)}\`.${opencodeCaveat} Source: ${sourceLink(path)}.`,
  );
}

function agentFeature(path: string): Feature {
  const pluginName = pluginOf(path);
  const segments = relative(join(ROOT, "plugins"), path).split(/[/\\]/);
  const agentName = segments[segments.length - 2]!;
  const caveat = `OpenCode projects Markdown, inherits the active model, and lacks first-class project memory.${
    agentName === "aesthetic-evaluator" || agentName === "code-quality-critic"
      ? " Its recognized write fence allows only rooted memory and canonical review-state paths; shell and external-directory access are denied."
      : ""
  }`;
  return feature(
    `\`${agentName}\` agent`,
    FULL,
    FULL,
    ADAPTED,
    ADAPTED,
    `${caveat} Owner: \`${pluginName}\`. Source: ${sourceLink(path)}.`,
  );
}

function renderTable(features: readonly Feature[]): string {
  const lines = [
    "| Feature | Claude Code | Codex | Grok Build | OpenCode V1 | Caveat / source |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const item of features) {
    lines.push(
      `| ${item.name} | ${item.claude} | ${item.codex} | ${item.grok} | ${item.opencode} | ${item.caveat} |`,
    );
  }
  return lines.join("\n");
}

function collectMarkedFiles(subdirectory: "skills" | "agents", marker: string): readonly string[] {
  const pluginsRoot = join(ROOT, "plugins");
  const found: string[] = [];
  for (const plugin of readdirSync(pluginsRoot, { withFileTypes: true })) {
    if (!plugin.isDirectory()) continue;
    const groupRoot = join(pluginsRoot, plugin.name, subdirectory);
    if (!existsSync(groupRoot)) continue;
    for (const entry of readdirSync(groupRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const markedPath = join(groupRoot, entry.name, marker);
      if (statSync(markedPath, { throwIfNoEntry: false })?.isFile()) {
        found.push(markedPath);
      }
    }
  }
  // Path objects sort by their string form, so sort the joined paths.
  return found.sort();
}

export function render(): string {
  validateCompatibilityHookAuthority();
  const skillFeatures = collectMarkedFiles("skills", "SKILL.md").map(skillFeature);
  const agentFeatures = collectMarkedFiles("agents", "base.md").map(agentFeature);
  return `# Harness compatibility

This matrix covers the ${skillFeatures.length} skills and ${agentFeatures.length} agents currently shipped by this repository. It is generated by \`scripts/generate_harness_compatibility.ts\`; edit the generator or source artifacts, then regenerate this file.

Claude Code, Codex, and Grok Build are native targets. OpenCode support targets stable V1 through \`scripts/install_opencode.ts\`; OpenCode V2 and \`opencode2\` are unsupported.

Reviewed against current harness documentation on ${REVIEWED_DATE}.

## Legend

- ✅ Native/full support
- 🟡 Adapter or compatibility-layer support with a caveat
- 🔌 External integration, credential, or tool required
- 🧪 Experimental harness API
- ❌ Unavailable

## Harness-wide features

${renderTable(CROSS_CUTTING_FEATURES)}

## Skills

${renderTable(skillFeatures)}

## Agents

${renderTable(agentFeatures)}

## Documentation sources

- OpenCode V1: [plugin API](https://dev.opencode.ai/docs/plugins/), [skills](https://opencode.ai/docs/skills/), [agents](https://opencode.ai/docs/agents/), [commands](https://opencode.ai/docs/commands/), [tools](https://opencode.ai/docs/tools/), [permissions](https://opencode.ai/docs/permissions/), [MCP servers](https://opencode.ai/docs/mcp-servers/), and [rules](https://opencode.ai/docs/rules/).
- Grok Build: [xAI skills, plugins, and marketplaces](https://docs.x.ai/build/features/skills-plugins-marketplaces).
`;
}

export interface GeneratorArguments {
  /** verify the committed matrix instead of rewriting it */
  readonly check: boolean;
}
export type ParsedArguments =
  | { readonly kind: "arguments"; readonly value: GeneratorArguments }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "help" };

const program = "generate_harness_compatibility.ts";
const usage = `usage: ${program} [-h] [--check]`;
const help = `${usage}

Generate the source-derived harness compatibility matrix.

options:
  -h, --help  show this help message and exit
  --check     Fail when the committed compatibility matrix is stale.
`;

/**
 * parses the generator command line with argparse-compatible errors
 *
 * @param argv - command-line tokens without the program name
 * @returns parsed arguments, a help request, or an error message
 */
export function parseArgs(argv: readonly string[]): ParsedArguments {
  const check = argv.includes("--check");
  const unrecognized: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "-h" || argument === "--help") return { kind: "help" };
    else if (argument === "--check") continue;
    else unrecognized.push(argument);
  }
  if (unrecognized.length > 0) {
    return {
      kind: "error",
      message: `unrecognized arguments: ${unrecognized.join(" ")}`,
    };
  }
  return { kind: "arguments", value: { check } };
}

/**
 * verifies one compatibility matrix file against freshly rendered output
 *
 * @param targetPath - matrix file to compare with the rendered document
 * @returns undefined when the file is current, otherwise the staleness message
 */
export function checkMatrix(targetPath: string): string | undefined {
  const info = statSync(targetPath, { throwIfNoEntry: false });
  const staleness = `COMPATIBILITY.md is stale; rerun scripts/${program}`;
  if (!info?.isFile()) return staleness;
  if (readFileSync(targetPath, "utf8") !== render()) return staleness;
  return undefined;
}

/**
 * writes or verifies the generated matrix
 *
 * @param argv - command-line arguments; defaults to `process.argv.slice(2)`
 * @returns the process exit code
 */
export function main(argv: readonly string[] = process.argv.slice(2)): number {
  const parsed = parseArgs(argv);
  if (parsed.kind === "help") {
    process.stdout.write(help);
    return 0;
  }
  if (parsed.kind === "error") {
    process.stderr.write(`${usage}\n${program}: error: ${parsed.message}\n`);
    return 2;
  }
  if (parsed.value.check) {
    const staleness = checkMatrix(TARGET);
    if (staleness !== undefined) {
      process.stderr.write(`${staleness}\n`);
      return 1;
    }
    return 0;
  }
  writeFileSync(TARGET, render(), "utf8");
  return 0;
}

if (import.meta.main) process.exit(main());
