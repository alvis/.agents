import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  AgentTemplateError,
  loadAgentSources,
  preferredNameCandidates,
  stitchAgentDefinition,
  stitchCodexAgentDefinition,
  stitchGrokAgentDefinition,
  validateAgentContract,
} from "./stitch_agent.ts";

const here = import.meta.dirname;
const repositoryRoot = resolve(here, "../../../../..");
const script = resolve(here, "stitch_agent.ts");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "stitch-agent-"));
  roots.push(root);
  return root;
}

function memory(name: string): string {
  return `\n## Memory\n\nI retain durable repository knowledge in \`.claude/agent-memory/${name}/MEMORY.md\`. I follow \`essential:templates/memory.md\`. Current facts carry evidence and a last-verified date. Sources override memory; I archive old claims before 150 lines or 20KB. I move detail to \`topics/<stable-area>/<specific-subject>.md\`.\n`;
}

function stateSystemAccess(document: string): Record<string, string> {
  const marker = /<project-state-system-access\s+([^>]+)\s*\/>/.exec(document);
  if (marker === null) throw new Error("missing state-system access marker");
  const attributes = marker[1]!.replaceAll('\\"', '"');
  return Object.fromEntries(
    [...attributes.matchAll(/([a-z-]+)="([^"]+)"/g)].map((match) => [
      match[1]!,
      match[2]!,
    ]),
  );
}

function jsonNativeSettings(document: string): Record<string, unknown> {
  const frontmatter = JSON.parse(document.split("---\n", 3)[1]!) as Record<
    string,
    unknown
  >;
  return Object.fromEntries(
    ["model", "effort"]
      .filter((field) => field in frontmatter)
      .map((field) => [field, frontmatter[field]]),
  );
}

function codexNativeSettings(document: string): Record<string, string> {
  return Object.fromEntries(
    [...document.matchAll(/^(model|model_reasoning_effort) = "([^"]+)"$/gm)].map(
      (match) => [match[1]!, match[2]!],
    ),
  );
}

function writeTemplate(
  pluginRoot: string,
  name = "test-agent",
  options: {
    readonly metadata?: Record<string, unknown>;
    readonly claude?: Record<string, unknown>;
    readonly codex?: Record<string, unknown>;
    readonly grok?: Record<string, unknown>;
    readonly body?: string;
  } = {},
): string {
  const sourcePluginRoot =
    basename(dirname(pluginRoot)) === "plugins"
      ? pluginRoot
      : resolve(pluginRoot, "plugins/coding");
  const essentialRoot = resolve(sourcePluginRoot, "../essential");
  mkdirSync(resolve(essentialRoot, "references"), { recursive: true });
  writeFileSync(
    resolve(essentialRoot, "references/state-systems.md"),
    "state systems",
  );
  const template = resolve(sourcePluginRoot, "agents", name);
  mkdirSync(resolve(template, "frontmatter"), { recursive: true });
  writeFileSync(
    resolve(template, "frontmatter/meta.json"),
    JSON.stringify({
      name,
      description:
        "A test role. Preferably named Ava, Kit, or June when the main agent spawns this role.",
      requirements: { model: "capable", effort: "deliberate" },
      ...options.metadata,
    }),
  );
  writeFileSync(
    resolve(template, "frontmatter/claude.json"),
    JSON.stringify({ memory: "project", ...options.claude }),
  );
  writeFileSync(
    resolve(template, "frontmatter/codex.json"),
    JSON.stringify(options.codex ?? {}),
  );
  writeFileSync(
    resolve(template, "frontmatter/grok.json"),
    JSON.stringify(options.grok ?? {}),
  );
  const body = options.body ?? "# Test agent\n";
  writeFileSync(
    resolve(template, "base.md"),
    body.includes("## Memory") ? body : `${body}${memory(name)}`,
  );
  return template;
}

function run(...args: readonly string[]) {
  const result = spawnSync("bun", ["run", script, ...args], {
    encoding: "utf8",
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe("agent stitching", () => {
  it("projects one split template deterministically for every harness", () => {
    const root = temporaryRoot();
    const template = writeTemplate(root, "test-agent", {
      metadata: { requirements: { model: "expert", effort: "instinctive" } },
      claude: { color: "blue", permissionMode: "default" },
      codex: { sandbox_mode: "workspace-write" },
      grok: { color: "green" },
      body: "\n# Test agent\n\nInstructions.\n",
    });

    const claude = stitchAgentDefinition(template);
    const projected = JSON.parse(claude.split("---\n", 3)[1]!) as Record<
      string,
      unknown
    >;
    expect(projected).toMatchObject({
      name: "test-agent",
      color: "blue",
      memory: "project",
    });
    expect(jsonNativeSettings(claude)).toEqual({});
    const access = {
      read: "all-agents",
      write: "main-agent",
      protected: "README.md,docs/**,.state/**,external-specification",
    };
    expect(stateSystemAccess(claude)).toEqual(access);
    expect(stitchAgentDefinition(template)).toBe(claude);

    const codex = stitchCodexAgentDefinition(template);
    expect(codex).toContain('name = "test-agent"\n');
    expect(codex).toContain('nickname_candidates = ["Ava", "Kit", "June"]');
    expect(codex).toContain('sandbox_mode = "workspace-write"');
    expect(codexNativeSettings(codex)).toEqual({});
    expect(stateSystemAccess(codex)).toEqual(access);
    expect(stitchCodexAgentDefinition(template)).toBe(codex);

    const grok = stitchGrokAgentDefinition(template);
    const grokProjected = JSON.parse(grok.split("---\n", 3)[1]!) as Record<
      string,
      unknown
    >;
    expect(grokProjected).toMatchObject({
      name: "test-agent",
      color: "green",
    });
    expect(jsonNativeSettings(grok)).toEqual({});
    expect(stateSystemAccess(grok)).toEqual(access);
    expect(stitchGrokAgentDefinition(template)).toBe(grok);
  });

  it.each([
    ["routine", "instinctive"],
    ["capable", "deliberate"],
    ["expert", "exhaustive"],
    ["capable", "instinctive"],
    ["routine", "exhaustive"],
  ])(
    "should accept independent %s and %s minimums without pinning native settings",
    (model, effort) => {
      const root = temporaryRoot();
      const template = writeTemplate(root, "test-agent", {
        metadata: { requirements: { model, effort } },
      });

      expect(loadAgentSources(template).metadata.requirements).toEqual({ model, effort });
      expect(jsonNativeSettings(stitchAgentDefinition(template))).toEqual({});
      expect(codexNativeSettings(stitchCodexAgentDefinition(template))).toEqual({});
      expect(jsonNativeSettings(stitchGrokAgentDefinition(template))).toEqual({});
    },
  );

  it.each([
    ["a memory path", "\nSee also `.claude/agent-memory/test-agent/EXTRA.md`."],
    ["a worktree", "\nFirst. A worktree survives this sentence."],
  ])("hard-fails when a Grok body retains %s", (_label, extra) => {
    const root = temporaryRoot();
    const template = writeTemplate(root, "test-agent", {
      body: `# Test agent${extra}\n`,
    });
    expect(() => stitchGrokAgentDefinition(template)).toThrow(
      /retains Claude-only behavior/,
    );
  });

  it("preserves plugin namespaces while removing Claude-only delegation", () => {
    const root = temporaryRoot();
    const template = writeTemplate(root, "test-agent", {
      body: `# Test agent\n\nUse \`coding:write-code\`.\n\n## Delegation Modes\n\n- **Direct persistent delegation** — keep this.\n- **Dynamic Workflow delegation** — remove this.\n${memory("test-agent")}\n## End\n\nDone.\n`,
    });

    const codex = stitchCodexAgentDefinition(template);
    expect(codex).toContain("coding:write-code");
    expect(codex).toContain("Direct persistent delegation");
    expect(codex).not.toContain("Dynamic Workflow");
    expect(codex).toContain("## End");
  });

  it("requires three distinct preferred names", () => {
    expect(
      preferredNameCandidates(
        "Role. Preferably named Ava, Kit, or June when the main agent spawns this role.",
      ),
    ).toEqual(["Ava", "Kit", "June"]);
    expect(() =>
      preferredNameCandidates(
        "Role. Preferably named Ava, Ava, or June when the main agent spawns this role.",
      ),
    ).toThrow(AgentTemplateError);
  });

  it.each([
    ["missing memory", "# Test agent\n", "exactly one ## Memory"],
    [
      "fixed routing",
      `# Test agent\n\nI always spawn helpers.\n${memory("test-agent")}`,
      "fixed routing language",
    ],
    [
      "shared policy",
      `# Test agent\n\nUse the current \`Agent\` roster.\n${memory("test-agent")}`,
      "shared delegation policy",
    ],
  ])("rejects %s contract violations", (_label, body, message) => {
    const root = temporaryRoot();
    const template = writeTemplate(root, "test-agent", { body });
    const sources = loadAgentSources(template);
    expect(() => validateAgentContract(sources, body)).toThrow(message);
  });

  it.each([
    [{ name: "Wrong" }, "invalid agent name"],
    [{ name: "other-agent" }, "does not match directory"],
    [{ requirements: { model: "unknown", effort: "deliberate" } }, "requirements.model"],
    [{ requirements: { model: "capable", effort: "unknown" } }, "requirements.effort"],
    [{ requirements: { model: "capable" } }, "requirements.effort"],
    [{ requirements: { effort: "deliberate" } }, "requirements.model"],
    [{ requirements: null }, "requirements"],
    [{ requirements: ["capable", "deliberate"] }, "requirements"],
    [{ intelligence: "high" }, "intelligence"],
    [{ intelligenceLevel: "high" }, "intelligenceLevel"],
    [{ modelTier: "capable" }, "modelTier"],
    [{ reasoningLevel: "deliberate" }, "reasoningLevel"],
    [{ requirements: { model: "capable", effort: "deliberate", intelligence: "high" } }, "intelligence"],
    [{ requirements: { modelTier: "capable", effort: "deliberate" } }, "modelTier"],
    [{ requirements: { model: "capable", reasoningLevel: "deliberate" } }, "reasoningLevel"],
    [{ model: "gpt-6-sol" }, "model"],
    [{ effort: "high" }, "effort"],
  ])("rejects invalid metadata %#", (metadata, message) => {
    const root = temporaryRoot();
    const template = writeTemplate(root, "test-agent", { metadata });
    expect(() => stitchAgentDefinition(template)).toThrow(message);
  });

  it.each([
    ["claude", { model: "gpt-6-sol" }, "model"],
    ["claude", { effort: "high" }, "effort"],
    ["codex", { model: "gpt-6-sol" }, "model"],
    ["codex", { model_reasoning_effort: "high" }, "model_reasoning_effort"],
    ["grok", { model: "gpt-6-sol" }, "model"],
    ["grok", { effort: "high" }, "effort"],
  ] as const)("should reject fixed %s overlay field %s", (harness, overlay, field) => {
    const root = temporaryRoot();
    const template = writeTemplate(root, "test-agent", { [harness]: overlay });
    expect(() => loadAgentSources(template)).toThrow(`derived field '${field}'`);
  });

  it("should reject non-scalar Codex overlay values", () => {
    const root = temporaryRoot();
    const codex = writeTemplate(root, "codex-agent", {
      codex: { nested: { forged: true } },
    });
    expect(() => loadAgentSources(codex)).toThrow("TOML scalar fields");
  });

  it("rejects split-source symlinks that escape the template", () => {
    const root = temporaryRoot();
    const template = writeTemplate(root);
    const external = resolve(root, "external.json");
    writeFileSync(external, "{}");
    rmSync(resolve(template, "frontmatter/codex.json"));
    symlinkSync(external, resolve(template, "frontmatter/codex.json"));
    expect(() => loadAgentSources(template)).toThrow("escapes agent directory");
  });

  it("resolves Essential aliases against an explicit durable reference root", () => {
    const root = temporaryRoot();
    const essential = resolve(root, "plugins/essential");
    const direction = resolve(essential, "directions/lead.md");
    mkdirSync(dirname(direction), { recursive: true });
    writeFileSync(direction, "direction");
    mkdirSync(resolve(essential, "references"), { recursive: true });
    writeFileSync(
      resolve(essential, "references/state-systems.md"),
      "state systems",
    );
    const template = writeTemplate(resolve(root, "plugins/coding"), "lead", {
      body: `# Lead\n\nApply @essential:directions/lead.md.\n${memory("lead")}`,
    });
    const reference = resolve(root, "installed/.essential");
    expect(
      stitchAgentDefinition(template, {
        essentialRoot: essential,
        referenceRoot: reference,
      }),
    ).toContain(
      `@${resolve(reference, "directions/lead.md")}`,
    );
  });

  it("stitches every distributed template for every harness", () => {
    for (const plugin of readdirSync(resolve(repositoryRoot, "plugins"))) {
      const agents = resolve(repositoryRoot, "plugins", plugin, "agents");
      try {
        for (const agent of readdirSync(agents)) {
          const template = resolve(agents, agent);
          expect(stitchAgentDefinition(template).length).toBeGreaterThan(100);
          expect(stitchCodexAgentDefinition(template).length).toBeGreaterThan(
            100,
          );
          expect(stitchGrokAgentDefinition(template).length).toBeGreaterThan(
            100,
          );
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  });
});

describe("stitcher command-line handling", () => {
  it("preserves help, required-argument, and invalid-choice behavior", () => {
    const shown = run("--help");
    expect(shown).toMatchObject({ exitCode: 0, stderr: "" });
    expect(shown.stdout).toContain("usage: stitch_agent.ts");
    expect(shown.stdout).toContain("--harness {claude,codex,grok}");

    const missing = run();
    expect(missing.exitCode).toBe(2);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toContain(
      "the following arguments are required: template",
    );

    const invalid = run("--harness", "other", "template");
    expect(invalid.exitCode).toBe(2);
    expect(invalid.stderr).toContain(
      "invalid choice: 'other' (choose from 'claude', 'codex', 'grok')",
    );
  });

  it("writes output only when validation succeeds", () => {
    const root = temporaryRoot();
    const template = writeTemplate(root);
    const output = resolve(root, "agent.md");
    const result = run(template, "--output", output);
    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(readFileSync(output, "utf8")).toContain('"name": "test-agent"');
  });
});
