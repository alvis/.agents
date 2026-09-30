import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  claudeTargets,
  discoverSkills,
  run,
  runClaudeValidation,
  validatePolicy,
} from "./quick_validate.ts";

import type { MockInstance } from "vitest";

class TestGlob {
  public constructor(private readonly pattern: string) {}

  public *scanSync(options: {
    cwd: string;
    absolute?: boolean;
    onlyFiles?: boolean;
    dot?: boolean;
  }): Generator<string> {
    const visit = function* (directory: string): Generator<string> {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) yield* visit(path);
        else yield path;
      }
    };
    for (const path of visit(options.cwd)) {
      const relativePath = path.slice(options.cwd.length + 1);
      if (
        this.pattern === "*/.claude-plugin/plugin.json" &&
        !/^[^/]+\/\.claude-plugin\/plugin\.json$/.test(relativePath)
      )
        continue;
      yield options.absolute ? path : relativePath;
    }
  }
}

let spawnSync: MockInstance;

beforeEach(() => {
  vi.spyOn(Bun, "Glob").mockImplementation(function (pattern: string) {
    return new TestGlob(pattern);
  } as Partial<typeof Bun.Glob> as typeof Bun.Glob);
  spawnSync = vi.spyOn(Bun, "spawnSync").mockImplementation(() => {
    throw new Error("Bun.spawnSync called with no configured result");
  });
});

let roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "quick-validate-"));
  roots.push(root);
  return root;
}

function write(path: string, text = ""): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
}

function skill(
  root: string,
  name: string,
  description: string,
  body: string,
  model = "capable",
  effort = "deliberate",
): string {
  return write(
    resolve(root, "skills", name, "SKILL.md"),
    `---\nname: ${name}\ndescription: "${description}"\nrequirements:\n  model: ${model}\n  effort: ${effort}\n---\n\n${body}\n`,
  );
}

function rawSkill(root: string, frontmatter: string): string {
  return write(
    resolve(root, "skills/shared/SKILL.md"),
    `---\n${frontmatter}\n---\n\n# Shared\n\n## Workflow\n\nDo the work.\n`,
  );
}

function errors(path: string, portable = false): unknown[] {
  return validatePolicy(path, { portable }).errors;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

describe("skill discovery and basic policy", () => {
  it("discovers skills from plugins directory", async () => {
    const root = await temporaryRoot();
    const first = skill(
      resolve(root, "plugins/one"),
      "first",
      "Use when creating a focused reusable capability for a known workflow.",
      "# First\n\n## Workflow\n\nDo the work.",
    );
    const second = skill(
      resolve(root, "plugins/two"),
      "second",
      "Use when maintaining a focused reusable capability for an existing workflow.",
      "# Second\n\n## Workflow\n\nDo the work.",
    );
    expect(discoverSkills(resolve(root, "plugins"))).toEqual([first, second]);
  });

  it("accepts minimal skill without ceremony", async () => {
    const root = await temporaryRoot();
    const path = skill(
      root,
      "minimal",
      "Use when a concise reusable workflow needs clear boundaries and verification.",
      "# Minimal\n\n## Boundaries\n\nStay scoped.\n\n## Inputs\n\nA target.\n\n## Workflow\n\nPerform it.\n\n## Verification\n\nCheck the result.\n\n## Completion\n\nReport it.",
    );
    const report = validatePolicy(path);
    expect(report.errors).toEqual([]);
    expect(
      report.warnings
        .map((issue) => issue.message)
        .join("\n")
        .toLowerCase(),
    ).not.toMatch(/diagram|subagent|coherence mandate/);
  });
});

const validRequirementForms = [
  "requirements:\n  model: capable\n  effort: deliberate",
  "requirements: {model: capable, effort: deliberate}",
  "requirements:\n  {model: capable, effort: deliberate}",
  "requirements:\n  {\n    model: capable,\n    effort: deliberate\n  }",
];

function policyMessages(path: string): string[] {
  return validatePolicy(path).errors.map((issue) => issue.message);
}

describe("portable skill minimums", () => {
  it.each(validRequirementForms)(
    "should accept both minimums in YAML mapping form %#",
    async (requirements) => {
      const root = await temporaryRoot();
      expect(
        policyMessages(
          rawSkill(root, 'name: shared\ndescription: "A shared workflow with portable minimums."\n' + requirements),
        ),
      ).toEqual([]);
    },
  );

  it("should accept whole-document flow frontmatter", async () => {
    const root = await temporaryRoot();
    expect(
      policyMessages(rawSkill(root, "{name: shared, requirements: {model: capable, effort: deliberate}}")),
    ).toEqual([]);
  });

  it.each([
    ["literal block scalar", "requirements: |\n  model: capable\n  effort: deliberate"],
    ["folded block scalar", "requirements: >\n  model: capable\n  effort: deliberate"],
    ["plain scalar", "requirements: not-a-mapping\n  model: capable\n  effort: deliberate"],
  ])("should reject %s requirements parent despite mapping-like content", async (_form, requirements) => {
    const root = await temporaryRoot();
    const path = rawSkill(root, "name: shared\n" + requirements);
    expect(policyMessages(path).join(" ")).toMatch(/requirements/);
  });

  it("should reject repeated requirements parents that split model and effort", async () => {
    const root = await temporaryRoot();
    const path = rawSkill(
      root,
      "name: shared\nrequirements:\n  model: capable\nrequirements:\n  effort: deliberate",
    );
    expect(policyMessages(path).join(" ")).toMatch(/requirements/);
  });

  it.each([
    ["requirements:\n  effort: deliberate", "requirements.model"],
    ["requirements:\n  model: capable", "requirements.effort"],
    ["requirements:\n  model: extreme\n  effort: deliberate", "requirements.model"],
    ["requirements:\n  model: capable\n  effort: automatic", "requirements.effort"],
    ["requirements:\n  model: [capable]\n  effort: deliberate", "requirements.model"],
    ["requirements:\n  model: capable\n  effort: {high: true}", "requirements.effort"],
    ["requirements: {model: capable, model: expert, effort: deliberate}", "requirements.model"],
    ["requirements: {model: capable, effort: deliberate, effort: exhaustive}", "requirements.effort"],
    ["requirements: {model: capable, effort: deliberate, intelligence: high}", "intelligence"],
    ["requirements:\n  intelligence: high", "intelligence"],
    ["requirements: {intelligenceLevel: high, effort: deliberate}", "model"],
    ["requirements: {modelTier: capable, effort: deliberate}", "model"],
    ["requirements: {model: capable, reasoningLevel: deliberate}", "effort"],
    ["requirements: {model: capable, effort: deliberate}\nmetadata: {intelligence: high}", "intelligence"],
    ["requirements: {model: capable, effort: deliberate}\nmetadata: {intelligenceLevel: high}", "intelligenceLevel"],
    ["requirements: {model: capable, effort: deliberate}\nmetadata: {modelTier: capable}", "modelTier"],
    ["requirements: {model: capable, effort: deliberate}\nmetadata: {reasoningLevel: deliberate}", "reasoningLevel"],
    ["requirements: {model: capable, effort: deliberate}\nintelligence: high", "intelligence"],
  ])("should reject malformed, missing, duplicated, or obsolete minimum %#", async (frontmatter, field) => {
    const root = await temporaryRoot();
    expect(
      policyMessages(rawSkill(root, "name: shared\n" + frontmatter)).join(" "),
    ).toContain(field);
  });

  it.each([
    ["metadata", "{name: shared, requirements: {model: capable, effort: deliberate}, metadata: &legacy {intelligence: high}}"],
    ["metadata", "{name: shared, requirements: {model: capable, effort: deliberate}, metadata: *legacy}"],
    ["requirements", "{name: shared, requirements: &required {model: capable, effort: deliberate}}"],
    ["requirements", "{name: shared, requirements: *required}"],
  ] as const)(
    "should reject %s node references in whole-document flow frontmatter",
    async (mapping, frontmatter) => {
      const root = await temporaryRoot();
      expect(policyMessages(rawSkill(root, frontmatter))).toEqual([
        "Shared skill " + mapping + " must not use YAML node properties or aliases; use a plain mapping.",
      ]);
    },
  );

  it.each([
    "metadata:\n  category: portable",
    "metadata: {category: portable}",
    "metadata:\n  {category: portable}",
  ])("should allow unrelated metadata form %#", async (metadata) => {
    const root = await temporaryRoot();
    expect(
      policyMessages(
        rawSkill(root, "name: shared\nrequirements: {model: capable, effort: deliberate}\n" + metadata),
      ),
    ).toEqual([]);
  });

  it.each(["metadata: &legacy {intelligence: high}", "metadata: *legacy"])(
    "should reject unsupported metadata node reference %#",
    async (metadata) => {
      const root = await temporaryRoot();
      expect(
        policyMessages(
          rawSkill(root, "name: shared\nrequirements: {model: capable, effort: deliberate}\n" + metadata),
        ),
      ).toEqual([
        "Shared skill metadata must not use YAML node properties or aliases; use a plain mapping.",
      ]);
    },
  );

  it.each([
    "requirements: &required {model: capable, effort: deliberate}",
    "requirements: *required",
  ])("should reject unsupported requirements node reference %#", async (requirements) => {
    const root = await temporaryRoot();
    expect(
      policyMessages(rawSkill(root, "name: shared\n" + requirements)),
    ).toEqual([
      "Shared skill requirements must not use YAML node properties or aliases; use a plain mapping.",
    ]);
  });
});

describe("adversarial YAML minimums", () => {
  it.each([
    ["metadata", "requirements: {model: capable, effort: deliberate}\nmetadata: {<<: *legacy}"],
    ["requirements", "requirements: {model: capable, effort: deliberate, <<: *required}"],
  ] as const)("should reject YAML merge keys in %s", async (mapping, frontmatter) => {
    const root = await temporaryRoot();
    expect(
      policyMessages(rawSkill(root, "name: shared\n" + frontmatter)),
    ).toEqual([
      "Shared skill " + mapping + " must not use YAML merge keys; use a plain mapping.",
    ]);
  });

  it.each([
    ["metadata", "requirements: {model: capable, effort: deliberate}\nmetadata: {key: &legacy intelligence, *legacy: high}"],
    ["requirements", "requirements: {model: capable, effort: deliberate, key: &legacy model, *legacy: expert}"],
  ] as const)("should reject non-scalar keys in %s", async (mapping, frontmatter) => {
    const root = await temporaryRoot();
    expect(
      policyMessages(rawSkill(root, "name: shared\n" + frontmatter)),
    ).toEqual([
      "Shared skill " + mapping + " must use direct scalar keys; aliases and complex keys are unsupported.",
    ]);
  });

  it.each(["'model'", '"model"', "'effort'", '"effort"'])(
    "should accept quoted minimum key %s",
    async (key) => {
      const root = await temporaryRoot();
      const frontmatter = key.includes("model")
        ? "requirements:\n  " + key + ": capable\n  effort: deliberate"
        : "requirements:\n  model: capable\n  " + key + ": deliberate";
      expect(policyMessages(rawSkill(root, "name: shared\n" + frontmatter))).toEqual([]);
    },
  );

  it.each(["'intelligence'", '"intelligence"'])(
    "should reject quoted legacy metadata key %s",
    async (key) => {
      const root = await temporaryRoot();
      const frontmatter = "name: shared\nrequirements: {model: capable, effort: deliberate}\nmetadata:\n  " + key + ": high";
      expect(policyMessages(rawSkill(root, frontmatter)).join(" ")).toContain("intelligence");
    },
  );
});

const modelKeys = [
  "model",
  "model ",
  "'model'",
  '"model"',
  '"mod\\u0065l"',
  "effort",
  "model_reasoning_effort",
  "model-reasoning-effort",
  "modelReasoningEffort",
  "modelTier",
  "reasoningLevel",
  "reasoning_effort",
  "reasoning-effort",
];
const allowedToolsMessage =
  "Shared skills must not declare allowed-tools: Codex does not support this field; shared skills inherit runtime capabilities.";

describe("cross-harness root fields", () => {
  it.each(modelKeys)("should reject native model selection field %s", async (key) => {
    const root = await temporaryRoot();
    const frontmatter =
      "name: shared\n" + key + ": provider-specific\nrequirements: {model: capable, effort: deliberate}";
    expect(policyMessages(rawSkill(root, frontmatter)).join(" ")).toMatch(/model|effort/);
  });
  it("should report allowed-tools failure by shared skill path", async () => {
    const root = await temporaryRoot();
    const path = rawSkill(
      root,
      'name: shared\ndescription: "Use when validating shared skill metadata across supported runtime harnesses."\nallowed-tools: Read, Write',
    );
    expect(Object.fromEntries([[path, errors(path)]])).toEqual({
      [path]: [{ message: allowedToolsMessage, line: 4 }],
    });
  });
  it.each(["allowed-tools :", "'allowed-tools':", '"allowed-tools":'])(
    "should reject allowed-tools YAML variant %s",
    async (key) => {
      const root = await temporaryRoot();
      expect(
        errors(
          rawSkill(
            root,
            'name: shared\ndescription: "Use when validating shared skill metadata across supported runtime harnesses."\n' + key + " Read",
          ),
        ),
      ).toEqual([{ message: allowedToolsMessage, line: 4 }]);
    },
  );
});

const semanticAllowedTools = [
  [
    'name: shared\ndescription: "Use when validating shared skill metadata across supported runtime harnesses."\n"allowed\\u002dtools": Read',
    4,
  ],
  [
    'name: shared\ndescription: "Use when validating shared skill metadata across supported runtime harnesses."\n"allowed\\x2dtools": Read',
    4,
  ],
  [
    'name: shared\ndescription: "Use when validating shared skill metadata across supported runtime harnesses."\n"allowed\\U0000002dtools": Read',
    4,
  ],
  [
    "{name: shared, description: cross-harness metadata, allowed-tools: Read}",
    2,
  ],
  ['{"allowed-tools":Read}', 2],
  ["{? allowed-tools}", 2],
  ["{allowed-tools}", 2],
  [
    '{name: shared,\n description: cross-harness metadata,\n "allowed\\u002dtools": Read}',
    4,
  ],
  [
    'name: shared\ndescription: "Use when validating shared skill metadata across supported runtime harnesses."\n? allowed-tools\n: Read',
    4,
  ],
] as const;
const complexRoot = [
  ["name: &forbidden allowed-tools\n? *forbidden\n: Read", 3],
  ["? |-\n  allowed-tools\n: Read", 2],
  ['? "allowed-\\\n  tools"\n: Read', 2],
  ["{name: &forbidden allowed-tools, ? *forbidden}", 2],
  ['{"allowed-\\\n  tools": Read}', 2],
] as const;
const unsupportedRoot = [
  ["!!map {allowed-tools: Read}", 2],
  ["&catalog {allowed-tools: Read}", 2],
  ["  name: shared\n  allowed-tools: Read", 2],
  ["defaults: &defaults {allowed-tools: Read}\n<<: *defaults", 3],
  [
    "defaults: &defaults {allowed-tools: Read}\n!!merge inherited: *defaults",
    3,
  ],
  [
    "defaults: &defaults {allowed-tools: Read}\n!<tag:yaml.org,2002:merge> inherited: *defaults",
    3,
  ],
  ["{defaults: &defaults {allowed-tools: Read}, <<: *defaults}", 2],
] as const;

describe("semantic and unsupported root mapping syntax", () => {
  it.each(semanticAllowedTools)(
    "rejects semantic allowed-tools mapping key %#",
    async (frontmatter, line) => {
      const root = await temporaryRoot();
      expect(errors(rawSkill(root, frontmatter))).toEqual([
        { message: allowedToolsMessage, line },
      ]);
    },
  );
  it.each(complexRoot)(
    "rejects unsupported complex root mapping key %#",
    async (frontmatter, line) => {
      const root = await temporaryRoot();
      expect(errors(rawSkill(root, frontmatter))).toEqual([
        {
          message:
            "Shared skill frontmatter uses an unsupported complex root mapping key; use a plain or quoted scalar key.",
          line,
        },
      ]);
    },
  );
  it.each(unsupportedRoot)(
    "rejects unsupported root mapping syntax %#",
    async (frontmatter, line) => {
      const root = await temporaryRoot();
      expect(errors(rawSkill(root, frontmatter))).toEqual([
        {
          message:
            "Shared skill frontmatter must use a plain, unwrapped root mapping without merge keys.",
          line,
        },
      ]);
    },
  );
  it.each([
    'name: shared\ndescription: "Use when validating nested skill metadata handling."\nmetadata:\n  allowed-tools: Read',
    'name: shared\ndescription: "Use when validating nested skill metadata handling."\nmetadata: {allowed-tools: Read}',
    "{name: shared, metadata: {allowed-tools: Read}}",
    "allowed-tools",
    "allowed-tools:not-a-mapping",
    "{allowed-tools:Read}",
  ])(
    "ignores allowed-tools outside root mapping keys %#",
    async (frontmatter) => {
      const root = await temporaryRoot();
      expect(errors(rawSkill(root, frontmatter))).toEqual([
        {
          message:
            "Shared skills must declare exactly one requirements.model.",
        },
      ]);
    },
  );
});

describe("body and Markdown references", () => {
  it("reports placeholders, long body, and missing local reference", async () => {
    const root = await temporaryRoot();
    const path = skill(
      root,
      "broken",
      "Use when checking a deliberately invalid repository policy fixture.",
      `# Broken\n\nSee [missing](references/missing.md).\n\n[TODO]\n${Array(501).fill("line").join("\n")}`,
    );
    const messages = errors(path)
      .map((item) => (item as { message: string }).message)
      .join("\n");
    expect(messages).toContain("Unresolved local reference");
    expect(messages).toContain("Placeholder");
    expect(messages).toContain("500 lines");
  });
  it("skips link examples and checks real files", async () => {
    const root = await temporaryRoot();
    write(resolve(root, "skills/links/references/present.md"), "present");
    const path = skill(
      root,
      "links",
      "Use when validating conservative local Markdown destination handling in skill policy checks.",
      "# Links\n\nExamples: [label](url), [label](…), and [section](#anchor).\n\nRead [present](references/present.md) and [missing](references/missing.md).",
    );
    expect(
      errors(path).map((item) => (item as { message: string }).message),
    ).toEqual(["Unresolved local reference: references/missing.md"]);
  });
  it("rejects existing reference outside portable skill root", async () => {
    const root = await temporaryRoot();
    write(resolve(root, "skills/shared.md"), "shared");
    const path = skill(
      root,
      "portable",
      "Use when validating that portable skills keep every required reference inside their root.",
      "# Portable\n\nRead [shared](../shared.md).",
    );
    expect(errors(path)).toEqual([]);
    expect(
      errors(path, true).map((x) => (x as { message: string }).message),
    ).toEqual(["Reference escapes skill root in SKILL.md: ../shared.md"]);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    expect(run(["--policy-only", "--portable", dirname(path)])).toBe(1);
  });
  it("rejects angle-wrapped reference outside portable skill root", async () => {
    const root = await temporaryRoot();
    write(resolve(root, "skills/shared file.md"), "shared");
    const path = skill(
      root,
      "portable-angle",
      "Use when validating portable skills that use angle-wrapped Markdown destinations containing spaces.",
      "# Portable\n\nRead [shared](<../shared file.md>).",
    );
    expect(
      errors(path, true).map((x) => (x as { message: string }).message),
    ).toEqual([
      "Reference escapes skill root in SKILL.md: <../shared file.md>",
    ]);
  });
  it("skips angle-wrapped URLs and placeholder destinations", async () => {
    const root = await temporaryRoot();
    const path = skill(
      root,
      "link-examples",
      "Use when validating external URLs and illustrative destinations in Markdown link examples.",
      "# Examples\n\nBrowse [docs](<https://example.com/skill guide>) and replace [example]([path/to/file.md]).",
    );
    expect(errors(path, true)).toEqual([]);
  });
  it("rejects absolute reference without suffix", async () => {
    const root = await temporaryRoot();
    const shared = write(resolve(root, "shared"), "shared");
    const path = skill(
      root,
      "portable",
      "Use when validating that absolute Markdown destinations cannot escape a portable skill root.",
      `# Portable\n\nRead [shared](${shared}).`,
    );
    expect(
      errors(path, true).map((x) => (x as { message: string }).message),
    ).toEqual([`Reference escapes skill root in SKILL.md: ${shared}`]);
  });
  it("checks links in supporting references", async () => {
    const root = await temporaryRoot();
    const path = skill(
      root,
      "portable",
      "Use when validating root-relative links throughout a portable skill's supporting references.",
      "# Portable\n\nRead [guide](references/guide.md).",
    );
    write(
      resolve(dirname(path), "references/guide.md"),
      "Read [missing](references/missing.md).",
    );
    expect(
      errors(path, true).map((x) => (x as { message: string }).message),
    ).toEqual([
      "Unresolved local reference in references/guide.md: references/missing.md",
    ]);
  });
  it("checks Markdown reference definitions", async () => {
    const root = await temporaryRoot();
    write(resolve(root, "skills/shared.md"), "shared");
    write(resolve(root, "skills/shared file.md"), "shared");
    const path = skill(
      root,
      "portable-definitions",
      "Use when validating portable handling of local, external, and illustrative Markdown reference definitions.",
      "# Portable\n\nRead the [guide][guide].\n\n[guide]: references/guide.md\n[shared]: ../shared.md\n[external]: https://example.com/shared.md\n[example]: [path/to/file.md]",
    );
    write(
      resolve(dirname(path), "references/guide.md"),
      "[shared]: <../shared file.md>\n[external]: https://example.com/shared.md\n[example]: [path/to/file.md]\n",
    );
    expect(
      errors(path, true).map((x) => (x as { message: string }).message),
    ).toEqual([
      "Reference escapes skill root in SKILL.md: ../shared.md",
      "Reference escapes skill root in references/guide.md: <../shared file.md>",
    ]);
  });
});

describe("Claude targets and subprocess behavior", () => {
  it("validates stitched agents from a temporary plugin projection", async () => {
    const root = await temporaryRoot();
    const plugin = resolve(root, "plugin");
    write(resolve(plugin, ".claude-plugin/plugin.json"), "{}");
    write(resolve(plugin, "agents/sample/base.md"), "# Source template\n");
    spawnSync
      .mockReturnValueOnce({
        exitCode: 0,
        stdout: Buffer.from("/essential\n"),
        stderr: Buffer.from(""),
      })
      .mockReturnValueOnce({
        exitCode: 0,
        stdout: Buffer.from("---\nname: sample\n---\n\n# Stitched agent\n"),
        stderr: Buffer.from(""),
      })
      .mockImplementationOnce((command: string[]) => {
        const staged = command.at(-1)!;
        expect(staged).not.toBe(plugin);
        expect(
          readFileSync(resolve(staged, "agents/sample.md"), "utf8"),
        ).toContain("# Stitched agent");
        expect(() =>
          readFileSync(resolve(staged, "agents/sample/base.md")),
        ).toThrow();
        expect(
          readFileSync(resolve(plugin, "agents/sample/base.md"), "utf8"),
        ).toBe("# Source template\n");
        return {
          exitCode: 0,
          stdout: Buffer.from("strict validation passed"),
          stderr: Buffer.from(""),
        };
      });
    const [status, results] = runClaudeValidation([plugin]);
    expect(status).toBe(0);
    expect(results).toEqual([
      { path: plugin, status: "pass", output: "strict validation passed" },
    ]);
    expect(spawnSync.mock.calls.at(-1)?.[0]).toContain("--strict");
  });

  it("projects marketplace plugins before strict validation", async () => {
    const root = await temporaryRoot();
    const plugin = resolve(root, "plugins/one");
    write(resolve(root, ".claude-plugin/marketplace.json"), "{}");
    write(resolve(plugin, ".claude-plugin/plugin.json"), "{}");
    write(resolve(plugin, "agents/sample/base.md"), "# Source template\n");
    spawnSync
      .mockReturnValueOnce({
        exitCode: 0,
        stdout: Buffer.from("/essential\n"),
        stderr: Buffer.from(""),
      })
      .mockReturnValueOnce({
        exitCode: 0,
        stdout: Buffer.from("---\nname: sample\n---\n"),
        stderr: Buffer.from(""),
      })
      .mockImplementationOnce((command: string[]) => {
        const staged = command.at(-1)!;
        expect(
          readFileSync(resolve(staged, "plugins/one/agents/sample.md"), "utf8"),
        ).toContain("name: sample");
        return {
          exitCode: 0,
          stdout: Buffer.from("ok"),
          stderr: Buffer.from(""),
        };
      });
    expect(runClaudeValidation([root])[0]).toBe(0);
  });

  it("fails when an agent cannot be stitched", async () => {
    const root = await temporaryRoot();
    const plugin = resolve(root, "plugin");
    write(resolve(plugin, ".claude-plugin/plugin.json"), "{}");
    write(resolve(plugin, "agents/sample/base.md"), "# Source template\n");
    spawnSync
      .mockReturnValueOnce({
        exitCode: 0,
        stdout: Buffer.from("/essential\n"),
        stderr: Buffer.from(""),
      })
      .mockReturnValueOnce({
        exitCode: 1,
        stdout: Buffer.from(""),
        stderr: Buffer.from("bad agent"),
      });
    const [status, results] = runClaudeValidation([plugin]);
    expect(status).toBe(1);
    expect(results[0]?.output).toContain("bad agent");
    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  it("uses marketplace root once", async () => {
    const root = await temporaryRoot();
    write(resolve(root, ".claude-plugin/marketplace.json"), "{}");
    for (const name of ["one", "two"])
      write(resolve(root, `plugins/${name}/.claude-plugin/plugin.json`), "{}");
    expect(claudeTargets(root)).toEqual([root]);
  });
  it("CLI runs official validator once for marketplace", async () => {
    const root = await temporaryRoot();
    write(resolve(root, ".claude-plugin/marketplace.json"), "{}");
    for (const name of ["one", "two"]) {
      write(resolve(root, `plugins/${name}/.claude-plugin/plugin.json`), "{}");
      skill(
        resolve(root, `plugins/${name}`),
        name,
        "Use when testing official validation execution for every discovered plugin target.",
        `# ${name}\n\n## Workflow\n\nValidate it.`,
      );
    }
    spawnSync.mockReturnValue({
      exitCode: 0,
      stdout: Buffer.from("marketplace ok"),
      stderr: Buffer.from(""),
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    expect(run([root])).toBe(0);
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(spawnSync.mock.calls[0]?.[0]).toEqual([
      "claude",
      "plugin",
      "validate",
      "--strict",
      root,
    ]);
  });
  it("CLI validates containing plugin for skill directory", async () => {
    const root = await temporaryRoot();
    const plugin = resolve(root, "plugin");
    write(resolve(plugin, ".claude-plugin/plugin.json"), "{}");
    const path = skill(
      plugin,
      "portable",
      "Use when testing containing-plugin resolution from a documented skill-directory target.",
      "# Portable\n\n## Workflow\n\nValidate it.",
    );
    spawnSync.mockReturnValue({
      exitCode: 0,
      stdout: Buffer.from("plugin ok"),
      stderr: Buffer.from(""),
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    expect(run([dirname(path)])).toBe(0);
    expect(spawnSync.mock.calls[0]?.[0]).toEqual([
      "claude",
      "plugin",
      "validate",
      "--strict",
      plugin,
    ]);
  });
  it("should structure thrown launch errors and continue", () => {
    spawnSync
      .mockImplementationOnce(() => {
        throw new Error("ENOENT: claude not found");
      })
      .mockReturnValueOnce({
        exitCode: 0,
        stdout: Buffer.from("ok"),
        stderr: Buffer.from(""),
      });
    const [status, results] = runClaudeValidation([
      "/plugin/one",
      "/plugin/two",
    ]);
    expect(status).toBe(1);
    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(results[0]).toEqual({
      path: "/plugin/one",
      status: "fail",
      output: "Unable to launch Claude validator: ENOENT: claude not found",
    });
    expect(results[1]).toMatchObject({ status: "pass" });
  });
  it("structures timed-out Claude and continues", () => {
    spawnSync
      .mockReturnValueOnce({
        exitCode: null,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
      })
      .mockReturnValueOnce({
        exitCode: 0,
        stdout: Buffer.from("ok"),
        stderr: Buffer.from(""),
      });
    const [status, results] = runClaudeValidation([
      "/plugin/one",
      "/plugin/two",
    ]);
    expect(status).toBe(1);
    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(results[0]?.output).toContain("timed out");
    expect(results[1]).toMatchObject({ status: "pass" });
  });
});
