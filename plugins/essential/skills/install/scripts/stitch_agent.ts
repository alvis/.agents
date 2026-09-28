import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";

type JsonObject = Record<string, unknown>;
type ModelTier = "routine" | "capable" | "expert";
type Effort = "instinctive" | "deliberate" | "exhaustive";
/** records portable minimums for one agent role */
export interface AgentRequirements {
  readonly model: ModelTier;
  readonly effort: Effort;
}

/** Frontmatter and body split sources of one agent template directory. */
export interface AgentSources {
  readonly metadata: JsonObject;
  readonly claude: JsonObject;
  readonly codex: JsonObject;
  readonly grok: JsonObject;
}

const scriptDirectory = import.meta.dirname;

const agentName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const modelTiers = new Set<ModelTier>(["routine", "capable", "expert"]);
const efforts = new Set<Effort>(["instinctive", "deliberate", "exhaustive"]);
const preferredNames =
  /(?:^| )Preferably named ([A-Z][a-z]{1,15}), ([A-Z][a-z]{1,15}), or ([A-Z][a-z]{1,15}) when the main agent spawns this role\.$/;
const fixedRoutingLanguage =
  /\b(?:only|always)\s+(?:spawn|delegate|route)\b|\bAgent` tool for one purpose\b|\bI am the only agent who forms\b/i;
const sharedPolicyLanguage = [
  "current `Agent` roster",
  "When I need a Dynamic Workflow",
  "For changed code, I inspect",
  "REVIEWED: source=",
  "I hold the `Agent` tool",
  "I hold `Agent`",
  "spawn target",
  "spawned by",
] as const;
const descriptionLimit = 1_024;
const validPermissionModes = new Set([
  "default",
  "acceptEdits",
  "auto",
  "dontAsk",
  "bypassPermissions",
  "plan",
  "manual",
]);
const memoryContractMarkers = [
  "durable",
  "evidence",
  "last-verified",
  "archive",
  "150 lines",
  "20kb",
  "essential:templates/memory.md",
  "topics/<stable-area>/<specific-subject>.md",
] as const;
/** Reference alias agent bodies use to bind the lead direction. */
export const leadAgentDirectionAlias =
  "@essential:directions/lead.md";
/** Plugin-relative path the alias resolves against an Essential root. */
export const leadAgentDirectionPath = "directions/lead.md";
/** Reference alias injected into every stitched agent's state-system contract. */
export const stateSystemsReferenceAlias =
  "@essential:references/state-systems.md";
/** Plugin-relative path of the injected state-system authority. */
export const stateSystemsReferencePath = "references/state-systems.md";
const metadataFields = new Set(["name", "description", "requirements"]);
const requirementFields = new Set(["model", "effort"]);
const obsoleteSelectionFields = [
  "intelligence",
  "intelligenceLevel",
  "modelTier",
  "reasoningLevel",
  "model",
  "effort",
  "model_reasoning_effort",
] as const;
const claudeDerivedFields = new Set([
  "name",
  "description",
  "requirements",
  ...obsoleteSelectionFields,
]);
const codexDerivedFields = new Set([
  "name",
  "description",
  "nickname_candidates",
  "requirements",
  ...obsoleteSelectionFields,
  "developer_instructions",
]);
const grokDerivedFields = new Set([
  "name",
  "description",
  "requirements",
  ...obsoleteSelectionFields,
]);

/** Error thrown when an agent template violates the split-source contract. */
export class AgentTemplateError extends Error {}

function markdownSection(body: string, heading: string): RegExpMatchArray[] {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `^## ${escaped}\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`,
    "gm",
  );
  return [...body.matchAll(pattern)];
}

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function sameKeys(value: JsonObject, expected: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.size && keys.every((key) => expected.has(key))
  );
}
function inside(root: string, target: string): boolean {
  const path = relative(root, target);
  return (
    path === "" ||
    (path !== ".." && !path.startsWith(`..${sep}`) && !path.startsWith(sep))
  );
}
function quote(value: unknown): string {
  if (typeof value === "string") return `'${value}'`;
  if (value === null) return "None";
  if (value === undefined) return "None";
  return String(value);
}
function readJsonObject(path: string): JsonObject {
  try {
    const document: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!object(document))
      throw new AgentTemplateError(
        `agent source must be a JSON object: ${path}`,
      );
    return document;
  } catch (error) {
    if (error instanceof AgentTemplateError) throw error;
    throw new AgentTemplateError(
      `invalid JSON in ${path}: ${(error as Error).message}`,
    );
  }
}

/**
 * extracts the three distinct preferred short names from a role description.
 * @param description metadata description ending in the preferred-names sentence
 * @returns the three capitalized nickname candidates in order
 */
export function preferredNameCandidates(
  description: unknown,
): [string, string, string] {
  const match =
    typeof description === "string"
      ? preferredNames.exec(description)
      : undefined;
  const names = match?.slice(1) as [string, string, string] | undefined;
  if (names === undefined || new Set(names).size !== 3)
    throw new AgentTemplateError(
      "description must end with exactly three distinct preferred short names",
    );
  return names;
}

/**
 * reads and validates the split frontmatter sources of one agent template.
 * @param templateDirectory directory holding base.md and frontmatter/
 * @returns validated metadata and per-harness overlay objects
 */
export function loadAgentSources(
  templateDirectory: string,
): AgentSources {
  const frontmatter = resolve(templateDirectory, "frontmatter");
  const paths = Object.fromEntries(
    ["meta.json", "claude.json", "codex.json", "grok.json"].map((name) => [
      name,
      resolve(frontmatter, name),
    ]),
  ) as Record<string, string>;
  const base = resolve(templateDirectory, "base.md");
  if (!existsSync(base) || !statSync(base).isFile())
    throw new AgentTemplateError(`missing base.md in ${templateDirectory}`);
  const present = Object.fromEntries(
    Object.entries(paths).map(([name, path]) => [
      name,
      existsSync(path) && statSync(path).isFile(),
    ]),
  );
  if (!Object.values(present).every(Boolean)) {
    const missing = Object.keys(present).find((name) => !present[name]);
    throw new AgentTemplateError(
      `missing frontmatter/${missing} in ${templateDirectory}`,
    );
  }
  const root = realpathSync(templateDirectory);
  for (const path of [
    ...Object.values(paths),
    base,
  ])
    if (!inside(root, realpathSync(path)))
      throw new AgentTemplateError(
        `template symlink or path escapes agent directory: ${path}`,
      );
  const sources = {
    metadata: readJsonObject(paths["meta.json"]!),
    claude: readJsonObject(paths["claude.json"]!),
    codex: readJsonObject(paths["codex.json"]!),
    grok: readJsonObject(paths["grok.json"]!),
  };
  const obsolete = Object.keys(sources.metadata).find((field) =>
    obsoleteSelectionFields.some((obsoleteField) => obsoleteField === field),
  );
  if (obsolete !== undefined)
    throw new AgentTemplateError(
      `obsolete frontmatter/meta.json field ${quote(obsolete)}`,
    );
  if (!sameKeys(sources.metadata, metadataFields))
    throw new AgentTemplateError(
      "frontmatter/meta.json must contain exactly name, description, and requirements",
    );
  readAgentRequirements(sources.metadata);
  for (const [harness, overlay, reserved] of [
    ["claude", sources.claude, claudeDerivedFields],
    ["codex", sources.codex, codexDerivedFields],
    ["grok", sources.grok, grokDerivedFields],
  ] as const) {
    const collision = Object.keys(overlay).find((field) => reserved.has(field));
    if (collision !== undefined)
      throw new AgentTemplateError(
        `frontmatter/${harness}.json must not define derived field ${quote(collision)}`,
      );
  }
  const invalidCodex = Object.entries(sources.codex).find(
    ([field, value]) =>
      !/^[A-Za-z0-9_-]+$/.test(field) ||
      !["string", "boolean", "number"].includes(typeof value),
  )?.[0];
  if (invalidCodex !== undefined)
    throw new AgentTemplateError(
      `frontmatter/codex.json values must be TOML scalar fields: ${quote(invalidCodex)}`,
    );
  const name = sources.metadata.name;
  if (typeof name !== "string" || !agentName.test(name))
    throw new AgentTemplateError(
      `invalid agent name in ${paths["meta.json"]}: ${quote(name)}`,
    );
  if (name !== basename(templateDirectory))
    throw new AgentTemplateError(
      `metadata name ${quote(name)} does not match directory ${quote(basename(templateDirectory))}`,
    );
  preferredNameCandidates(sources.metadata.description);
  return sources;
}

/**
 * validates the independent portable minimums of an agent definition.
 * @param metadata shared frontmatter metadata
 * @returns validated model and effort minimums
 */
export function readAgentRequirements(metadata: JsonObject): AgentRequirements {
  const requirements = metadata.requirements;
  if (!object(requirements))
    throw new AgentTemplateError(
      "frontmatter/meta.json requirements must be an object with model and effort",
    );
  const unsupported = Object.keys(requirements).find(
    (key) => !requirementFields.has(key),
  );
  if (unsupported !== undefined)
    throw new AgentTemplateError(`unsupported requirements.${unsupported}`);
  if (!("model" in requirements))
    throw new AgentTemplateError("missing requirements.model");
  if (!("effort" in requirements))
    throw new AgentTemplateError("missing requirements.effort");
  const model = requirements.model;
  if (typeof model !== "string" || !modelTiers.has(model as ModelTier))
    throw new AgentTemplateError(
      `invalid requirements.model ${quote(model)}: expected routine, capable, or expert`,
    );
  const effort = requirements.effort;
  if (typeof effort !== "string" || !efforts.has(effort as Effort))
    throw new AgentTemplateError(
      `invalid requirements.effort ${quote(effort)}: expected instinctive, deliberate, or exhaustive`,
    );
  return { model: model as ModelTier, effort: effort as Effort };
}

/**
 * validates one agent's metadata and body against the shared agent contract.
 * @param sources validated split frontmatter of the template
 * @param body base.md contents before minimum injection
 */
export function validateAgentContract(
  sources: AgentSources,
  body: string,
): void {
  const description = sources.metadata.description;
  if (typeof description === "string" && description.length > descriptionLimit)
    throw new AgentTemplateError(
      `description exceeds ${descriptionLimit} characters: ${description.length}`,
    );
  const permission = sources.claude.permissionMode;
  if (permission !== undefined && !validPermissionModes.has(String(permission)))
    throw new AgentTemplateError(
      `invalid permissionMode ${quote(permission)}: expected one of ${[...validPermissionModes].join(", ")}`,
    );
  readAgentRequirements(sources.metadata);
  if ("tools" in sources.claude || "tools" in sources.codex)
    throw new AgentTemplateError(
      "agent definitions must omit tools to inherit runtime capabilities",
    );
  const routing = [
    body,
    sources.metadata.description,
    sources.claude.initialPrompt,
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  if (fixedRoutingLanguage.test(routing))
    throw new AgentTemplateError(
      "fixed routing language conflicts with runtime discovery",
    );
  const duplicated = sharedPolicyLanguage.find((phrase) =>
    body.includes(phrase),
  );
  if (duplicated !== undefined)
    throw new AgentTemplateError(
      `agent body repeats shared delegation policy: ${duplicated}`,
    );
  if (sources.claude.memory !== "project")
    throw new AgentTemplateError("agent memory must be project-scoped");
  const sections = markdownSection(body, "Memory");
  if (sections.length !== 1)
    throw new AgentTemplateError(
      "agent body must contain exactly one ## Memory section",
    );
  const memory = sections[0]?.[1] ?? "";
  const expected = `.claude/agent-memory/${String(sources.metadata.name)}/MEMORY.md`;
  if (!memory.includes(expected))
    throw new AgentTemplateError(
      `Memory section must name exact path ${expected}`,
    );
  const normalized = memory.toLowerCase();
  const missing = memoryContractMarkers.find(
    (marker) => !normalized.includes(marker),
  );
  if (missing !== undefined)
    throw new AgentTemplateError(
      `Memory section is missing maintenance marker: ${missing}`,
    );
}

function deriveEssentialRoot(templateDirectory: string): string | undefined {
  const referencePaths = [leadAgentDirectionPath, stateSystemsReferencePath];
  const hasReference = (root: string): boolean =>
    referencePaths.some((path) => existsSync(resolve(root, path)));
  let current = realpathSync(templateDirectory);
  while (dirname(current) !== current) {
    if (basename(current) === "plugins") {
      const candidate = resolve(current, "essential");
      if (hasReference(candidate)) return candidate;
    }
    current = dirname(current);
  }
  const pluginRoot = resolve(realpathSync(templateDirectory), "../..");
  const cached = resolve(pluginRoot, "../../essential", basename(pluginRoot));
  if (hasReference(cached)) return cached;
  return undefined;
}

function resolveEssentialReferences(
  body: string,
  templateDirectory: string,
  essentialRoot?: string,
  referenceRoot?: string,
): string {
  const aliases = [
    [leadAgentDirectionAlias, leadAgentDirectionPath],
    [stateSystemsReferenceAlias, stateSystemsReferencePath],
  ] as const;
  const used = aliases.filter(([alias]) => body.includes(alias));
  if (used.length === 0) return body;
  const root = essentialRoot
    ? realpathSync(essentialRoot)
    : deriveEssentialRoot(templateDirectory);
  if (root === undefined)
    throw new AgentTemplateError(
      "agent template uses @essential references; pass --essential-root or place the template in an unambiguous source checkout",
    );
  for (const [, path] of used) {
    const source = resolve(root, path);
    if (!existsSync(source))
      throw new AgentTemplateError(`missing Essential reference: ${source}`);
  }
  return used.reduce(
    (resolvedBody, [alias, path]) =>
      resolvedBody.replaceAll(alias, `@${resolve(referenceRoot ?? root, path)}`),
    body,
  );
}

/**
 * formats portable role minimums for native and adapted agent bodies.
 * @param requirements validated independent minimums
 * @returns one harness-neutral statement
 */
function minimumRequirementsLine(requirements: AgentRequirements): string {
  const model =
    requirements.model[0]!.toUpperCase() + requirements.model.slice(1);
  const effort =
    requirements.effort[0]!.toUpperCase() + requirements.effort.slice(1);
  return `Minimum: ${model} Model Tier, ${effort} Effort.`;
}

/**
 * inserts portable minima immediately after an agent title.
 * @param body base agent body
 * @param requirements validated independent minimums
 * @returns agent body with a single minimum statement
 */
export function injectRequirementsLine(
  body: string,
  requirements: AgentRequirements,
): string {
  if (body.includes("Intelligence level:") || body.includes("Minimum:"))
    throw new AgentTemplateError(
      "base.md must not duplicate the derived minimum statement",
    );
  const newline = body.indexOf("\n");
  const title = newline < 0 ? body : body.slice(0, newline);
  if (!title.startsWith("# "))
    throw new AgentTemplateError(
      "base.md must start with an H1 title for minimum injection",
    );
  const statement = minimumRequirementsLine(requirements);
  const remainder = newline < 0 ? "" : body.slice(newline + 1);
  return `${title}\n\n${statement}\n${remainder}`;
}

/** Derive the cross-harness subagent access projection from its one authority. */
function injectStateSystemAccess(body: string): string {
  const source = resolve(
    scriptDirectory,
    "../../../references/state-systems.md",
  );
  const section = markdownSection(readFileSync(source, "utf8"), "Access boundary")[0];
  if (section === undefined)
    throw new AgentTemplateError(
      `state-system authority has no Access boundary section: ${source}`,
    );
  const projection = `## Project state-system access\n\nSource: @essential:references/state-systems.md\n\n${section[1]!.trim()}\n`;
  const memory = markdownSection(body, "Memory")[0];
  if (memory === undefined) return `${body.trimEnd()}\n\n${projection}`;
  const before = body.slice(0, memory.index).trimEnd();
  const after = body.slice(memory.index).replace(/^\n+/, "");
  return `${before}\n\n${projection}\n${after}`;
}

function template(
  templateDirectory: string,
  options: {
    readonly essentialRoot?: string;
    readonly referenceRoot?: string;
  },
): { sources: AgentSources; body: string } {
  const sources = loadAgentSources(templateDirectory);
  let body = readFileSync(
    resolve(templateDirectory, "base.md"),
    "utf8",
  ).replace(/^\n+/, "");
  validateAgentContract(sources, body);
  body = injectRequirementsLine(body, readAgentRequirements(sources.metadata));
  body = injectStateSystemAccess(body);
  return { sources, body };
}

/**
 * stitches one split template into the Claude Markdown agent file.
 * @param templateDirectory directory holding base.md and frontmatter/
 * @param options essentialRoot and referenceRoot resolve @essential aliases
 * @returns full Claude agent file including frontmatter
 */
export function stitchAgentDefinition(
  templateDirectory: string,
  options: {
    readonly essentialRoot?: string;
    readonly referenceRoot?: string;
  } = {},
): string {
  const { sources, body } = template(templateDirectory, options);
  const projected: JsonObject = {
    name: sources.metadata.name,
    description: sources.metadata.description,
  };
  if ("color" in sources.claude) projected.color = sources.claude.color;
  for (const [field, value] of Object.entries(sources.claude))
    if (field !== "color") projected[field] = value;
  const yaml = JSON.stringify(projected, undefined, 2);
  return `---\n${yaml}\n---\n\n${resolveEssentialReferences(body, templateDirectory, options.essentialRoot, options.referenceRoot)}`;
}

function removeMarkdownSection(body: string, heading: string): string {
  const match = markdownSection(body, heading)[0];
  if (match === null) return body;
  const before = body.slice(0, match.index).trimEnd();
  const after = body.slice(match.index + match[0].length).replace(/^\n+/, "");
  return before && after ? `${before}\n\n${after}` : before || after;
}
function harnessNeutralText(text: string): string {
  return text
    .replaceAll(
      "run it inside my isolated worktree",
      "run it within the active harness boundaries",
    )
    .replace(/,? and Workflow launches/g, "")
    .replace(/^[^\n.!?]*\bworktree\b[^\n.!?]*[.!?][ \t]*/gm, "");
}
function stripClaudeOnlyBehavior(body: string): string {
  let projected = removeMarkdownSection(body, "Memory");
  const delegation = markdownSection(projected, "Delegation Modes")[0] ?? null;
  if (delegation !== null && delegation[1]?.includes("Dynamic Workflow")) {
    const direct =
      /^- \*\*Direct persistent delegation\*\*.*?(?=^- \*\*Dynamic Workflow delegation\*\*)/gms.exec(
        delegation[1],
      );
    if (direct === null)
      throw new AgentTemplateError(
        "Delegation Modes must contain direct delegation before Dynamic Workflow",
      );
    projected = `${projected.slice(0, delegation.index)}## Delegation Modes\n\n${direct[0].trimEnd()}\n${projected.slice(delegation.index + delegation[0].length)}`;
  }
  projected = `${harnessNeutralText(projected).trimEnd()}\n`;
  const unsupported = [
    ".claude/agent-memory/",
    "Dynamic Workflow",
    "Workflow launches",
    "worktree",
  ].find((marker) => projected.includes(marker));
  if (unsupported !== undefined)
    throw new AgentTemplateError(
      `stitched agent retains Claude-only behavior: ${unsupported}`,
    );
  return projected;
}
function tomlValue(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => tomlValue(item)).join(", ")}]`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined)
    throw new AgentTemplateError("Codex overlay contains an unsupported value");
  return encoded;
}
/**
 * stitches one split template into the Codex TOML agent file.
 * @param templateDirectory directory holding base.md and frontmatter/
 * @param options essentialRoot and referenceRoot resolve @essential aliases
 * @returns full Codex agent file as scalar TOML fields
 */
export function stitchCodexAgentDefinition(
  templateDirectory: string,
  options: {
    readonly essentialRoot?: string;
    readonly referenceRoot?: string;
  } = {},
): string {
  const { sources, body } = template(templateDirectory, options);
  const fields: Array<readonly [string, unknown]> = [
    ["name", sources.metadata.name],
    [
      "description",
      harnessNeutralText(String(sources.metadata.description)),
    ],
    [
      "nickname_candidates",
      preferredNameCandidates(sources.metadata.description),
    ],
    ...Object.entries(sources.codex),
    [
      "developer_instructions",
      resolveEssentialReferences(
        stripClaudeOnlyBehavior(body),
        templateDirectory,
        options.essentialRoot,
        options.referenceRoot,
      ),
    ],
  ];
  return fields
    .map(([name, value]) => `${name} = ${tomlValue(value)}\n`)
    .join("");
}
/**
 * stitches one split template into the Grok Build Markdown agent file
 * @param templateDirectory directory holding base.md and frontmatter/
 * @param options essentialRoot and referenceRoot resolve @essential aliases
 * @returns full Grok agent file including frontmatter
 */
export function stitchGrokAgentDefinition(
  templateDirectory: string,
  options: {
    readonly essentialRoot?: string;
    readonly referenceRoot?: string;
  } = {},
): string {
  const { sources, body } = template(templateDirectory, options);
  const projected: JsonObject = {
    name: sources.metadata.name,
    description: harnessNeutralText(String(sources.metadata.description)),
    ...sources.grok,
  };
  const yaml = JSON.stringify(projected, undefined, 2);
  return `---\n${yaml}\n---\n\n${resolveEssentialReferences(stripClaudeOnlyBehavior(body), templateDirectory, options.essentialRoot, options.referenceRoot)}`;
}

const program = basename(import.meta.url);
const usage = `usage: ${program} [-h] [--output OUTPUT] [--harness {claude,codex,grok}]\n${" ".repeat(program.length + 7)}[--essential-root ESSENTIAL_ROOT]\n${" ".repeat(program.length + 7)}template`;
const help = `${usage}\n\nValidate and stitch a split agent template into a stitched agent file.\n\npositional arguments:\n  template\n\noptions:\n  -h, --help            show this help message and exit\n  --output OUTPUT\n  --harness {claude,codex,grok}\n  --essential-root ESSENTIAL_ROOT\n                        Essential plugin root used to resolve @essential\n                        references; inferred from normal source-checkout and\n                        installed-cache layouts\n`;
function cliError(message: string): never {
  process.stderr.write(`${usage}\n${program}: error: ${message}\n`);
  process.exit(2);
}
/**
 * parses stitcher flags and writes one stitched agent definition.
 * @param argv arguments following the script name
 * @returns process exit code: 0 success, 2 usage error
 */
export function main(argv = process.argv.slice(2)): number {
  let output: string | undefined;
  let harness = "claude";
  let essentialRoot: string | undefined;
  const templates: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    const value = (): string => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("-"))
        cliError(`argument ${argument}: expected one argument`);
      index += 1;
      return next;
    };
    if (argument === "-h" || argument === "--help") {
      process.stdout.write(help);
      return 0;
    }
    if (argument === "--output") output = value();
    else if (argument.startsWith("--output="))
      output = argument.slice("--output=".length);
    else if (argument === "--harness") harness = value();
    else if (argument.startsWith("--harness="))
      harness = argument.slice("--harness=".length);
    else if (argument === "--essential-root") essentialRoot = value();
    else if (argument.startsWith("--essential-root="))
      essentialRoot = argument.slice("--essential-root=".length);
    else if (argument.startsWith("-"))
      cliError(`unrecognized arguments: ${argument}`);
    else templates.push(argument);
  }
  if (templates.length === 0)
    cliError("the following arguments are required: template");
  if (templates.length > 1)
    cliError(`unrecognized arguments: ${templates.slice(1).join(" ")}`);
  if (!new Set(["claude", "codex", "grok"]).has(harness))
    cliError(
      `argument --harness: invalid choice: '${harness}' (choose from 'claude', 'codex', 'grok')`,
    );
  if (essentialRoot === undefined) {
    const candidate = resolve(scriptDirectory, "../../..");
    if (existsSync(resolve(candidate, leadAgentDirectionPath)))
      essentialRoot = candidate;
  }
  try {
    const stitched =
      harness === "claude"
        ? stitchAgentDefinition(templates[0]!, { essentialRoot })
        : harness === "codex"
          ? stitchCodexAgentDefinition(templates[0]!, { essentialRoot })
          : stitchGrokAgentDefinition(templates[0]!, { essentialRoot });
    if (output === undefined) process.stdout.write(stitched);
    else writeFileSync(output, stitched, "utf8");
    return 0;
  } catch (error) {
    if (error instanceof AgentTemplateError) cliError(error.message);
    throw error;
  }
}

if (import.meta.main) process.exit(main());
