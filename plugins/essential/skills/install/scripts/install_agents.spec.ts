import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  codexCachePluginRoot,
  discoverAgentTemplates,
  installAgents,
  installedPluginRoots,
} from "./install_agents.ts";
import { AgentTemplateError } from "./stitch_agent.ts";

import type { SpawnSyncReturns } from "node:child_process";

const here = import.meta.dirname;
const script = resolve(here, "install_agents.ts");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "install-"));
  roots.push(root);
  return root;
}

function memory(name: string): string {
  return `\n## Memory\n\nI retain durable facts in \`.claude/agent-memory/${name}/MEMORY.md\` following \`essential:templates/memory.md\`. Claims carry evidence and a last-verified date. I archive stale claims before 150 lines or 20KB, with detail in \`topics/<stable-area>/<specific-subject>.md\`.\n`;
}

function writeTemplate(plugin: string, name: string, alias = false): string {
  const template = resolve(plugin, "agents", name);
  mkdirSync(resolve(template, "frontmatter"), { recursive: true });
  writeFileSync(
    resolve(template, "frontmatter/meta.json"),
    JSON.stringify({
      name,
      description: `Test role. Preferably named Ava, Kit, or June when the main agent spawns this role.`,
      intelligence: "inherit",
    }),
  );
  writeFileSync(
    resolve(template, "frontmatter/claude.json"),
    JSON.stringify({ memory: "project" }),
  );
  writeFileSync(resolve(template, "frontmatter/codex.json"), "{}");
  writeFileSync(resolve(template, "frontmatter/grok.json"), "{}");
  writeFileSync(
    resolve(template, "base.md"),
    `# ${name}\n${alias ? "\nApply @essential:directions/lead.md.\n" : ""}${memory(name)}`,
  );
  return template;
}

function sourceCheckout(): {
  readonly root: string;
  readonly essential: string;
} {
  const root = temporaryRoot();
  const essential = resolve(root, "plugins/essential");
  const direction = resolve(essential, "directions/lead.md");
  mkdirSync(dirname(direction), { recursive: true });
  writeFileSync(direction, "Lead direction.\n");
  writeFileSync(resolve(essential, "directions/GROK.md"), "Bootstrap fixture.\n");
  mkdirSync(resolve(essential, "references"), { recursive: true });
  writeFileSync(resolve(essential, "references/state-systems.md"), "State systems.\n");
  writeTemplate(essential, "first-agent", true);
  writeTemplate(resolve(root, "plugins/coding"), "second-agent");
  return { root, essential };
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

function grokDiscoveryStub(directory: string): string {
  const bin = resolve(directory, "bin");
  mkdirSync(bin, { recursive: true });
  const stub = resolve(bin, "grok");
  writeFileSync(stub, `#!/bin/sh
case "$*" in
  'inspect --json') cat "$GROK_INSPECT_FIXTURE" ;;
  'plugin list --json')
    if [ "\${GROK_LIST_EXIT:-0}" -ne 0 ]; then exit "$GROK_LIST_EXIT"; fi
    if [ -n "\${GROK_LIST_LAUNCHER:-}" ]; then exec "$GROK_LIST_LAUNCHER"; fi
    cat "$GROK_LIST_FIXTURE" ;;
  *) exit 64 ;;
esac
`);
  chmodSync(stub, 0o755);
  return bin;
}

function installFromGrokInventory(root: string, essential: string): SpawnSyncReturns<string> {
  const bin = grokDiscoveryStub(root);
  return spawnSync("bun", [script, "--plugin-root", essential, "--destination", resolve(root, "agents"), "--harness", "grok"], {
    encoding: "utf8",
    env: {
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      HOME: resolve(root, "home"),
      GROK_HOME: resolve(root, "home/grok"),
      GROK_INSPECT_FIXTURE: resolve(root, "inspect.json"),
      GROK_LIST_FIXTURE: resolve(root, "list.json"),
    },
  });
}

describe("agent discovery and installation", () => {
  it("discovers all source-checkout siblings in stable order", () => {
    const { essential } = sourceCheckout();
    expect(
      discoverAgentTemplates(essential).map(({ owner, name }) => [owner, name]),
    ).toEqual([
      ["coding", "second-agent"],
      ["essential", "first-agent"],
    ]);
  });

  it.each([
    ["claude", ".md"],
    ["codex", ".toml"],
    ["grok", ".md"],
  ] as const)("installs source templates for %s", (harness, suffix) => {
    const { essential } = sourceCheckout();
    const destination = resolve(temporaryRoot(), "agents");
    const output: string[] = [];
    expect(
      installAgents(essential, destination, {
        harness,
        grokHome: resolve(destination, "../grok"),
        pluginRecords: [
          { id: "essential@fixture", enabled: true, installPath: essential },
          { id: "coding@fixture", enabled: true, installPath: resolve(essential, "../coding") },
        ],
        stdout: (text) => output.push(text),
      }),
    ).toBe(2);
    expect(readdirSync(destination).sort()).toEqual([
      ".essential",
      `first-agent${suffix}`,
      `second-agent${suffix}`,
    ]);
    expect(
      readFileSync(resolve(destination, `first-agent${suffix}`), "utf8"),
    ).toContain(
      `@${realpathSync(resolve(destination, ".essential/directions/lead.md"))}`,
    );
    expect(
      readFileSync(resolve(destination, `second-agent${suffix}`), "utf8"),
    ).toContain(`@${realpathSync(resolve(destination, ".essential/references/state-systems.md"))}`);
    expect(
      readFileSync(resolve(destination, ".essential/references/state-systems.md"), "utf8"),
    ).toBe("State systems.\n");
    expect(output.at(-1)).toContain("done — installed 2 agent(s)");
  });

  it("fails duplicate names before writing the destination", () => {
    const { root, essential } = sourceCheckout();
    writeTemplate(resolve(root, "plugins/react"), "first-agent");
    const destination = resolve(temporaryRoot(), "agents");
    expect(() => installAgents(essential, destination)).toThrow(
      "duplicate agent name 'first-agent'",
    );
    expect(existsSync(destination)).toBe(false);
  });

  it("rejects an escaping symlink before installing valid templates", () => {
    const { essential } = sourceCheckout();
    const external = writeTemplate(temporaryRoot(), "external-agent");
    symlinkSync(external, resolve(essential, "agents/linked-agent"), "dir");
    const destination = resolve(temporaryRoot(), "agents");

    expect(() => installAgents(essential, destination)).toThrow(
      "template symlink or path escapes plugin root",
    );
    expect(existsSync(destination)).toBe(false);
  });

  it("should preserve an unowned destination symlink and its target", () => {
    const { essential } = sourceCheckout();
    const root = temporaryRoot();
    const destination = resolve(root, "agents");
    mkdirSync(destination, { recursive: true });
    const external = resolve(root, "external.md");
    writeFileSync(external, "do not overwrite\n");
    symlinkSync(external, resolve(destination, "first-agent.md"));

    expect(() => installAgents(essential, destination)).toThrow(/conflict|symlink|symbolic link/i);

    expect(readFileSync(external, "utf8")).toBe("do not overwrite\n");
    expect(
      readFileSync(resolve(destination, "first-agent.md"), "utf8"),
    ).toBe("do not overwrite\n");
  });

  it("keeps only enabled latest records from trusted marketplaces", () => {
    const root = temporaryRoot();
    const essential = resolve(root, "installed/essential");
    const codingOld = resolve(root, "installed/coding-old");
    const codingNew = resolve(root, "installed/coding-new");
    const react = resolve(root, "installed/react");
    for (const path of [essential, codingOld, codingNew, react])
      mkdirSync(path, { recursive: true });
    const roots = installedPluginRoots(
      essential,
      [
        {
          id: "essential@main",
          enabled: true,
          installPath: essential,
          lastUpdated: "2026-01-01",
        },
        {
          id: "coding@main",
          enabled: true,
          installPath: codingOld,
          lastUpdated: "2026-01-01",
        },
        {
          id: "coding@main",
          enabled: true,
          installPath: codingNew,
          lastUpdated: "2026-02-01",
        },
        {
          id: "react@trusted",
          enabled: true,
          installPath: react,
          lastUpdated: "2026-01-01",
        },
        {
          id: "disabled@main",
          enabled: false,
          installPath: root,
        },
      ],
      "claude",
      ["trusted"],
    );
    expect(roots).toEqual([
      ["coding", codingNew],
      ["essential", essential],
      ["react", react],
    ]);
  });

  it("rejects untrusted marketplace names and ambiguous Essential identity", () => {
    const root = temporaryRoot();
    const essential = resolve(root, "essential");
    mkdirSync(essential);
    const record = {
      id: "essential@main",
      enabled: true,
      installPath: essential,
    };
    expect(() =>
      installedPluginRoots(essential, [record], "claude", ["../escape"]),
    ).toThrow("invalid included marketplace name");
    expect(() =>
      installedPluginRoots(essential, [record, record], "claude"),
    ).toThrow("multiple essential plugin records");
  });

  it("resolves versioned Codex cache coordinates", () => {
    const cache = resolve(temporaryRoot(), "cache");
    const essential = resolve(cache, "main/essential/1.0.0");
    const coding = resolve(cache, "main/coding/2.0.0+build");
    mkdirSync(essential, { recursive: true });
    mkdirSync(coding, { recursive: true });
    const records = [
      {
        id: "essential@main",
        enabled: true,
        version: "1.0.0",
      },
      { id: "coding@main", enabled: true, version: "2.0.0+build" },
    ];
    expect(codexCachePluginRoot(essential, records[1]!)).toBe(coding);
    expect(installedPluginRoots(essential, records, "codex")).toEqual([
      ["coding", coding],
      ["essential", essential],
    ]);
  });

  it("rejects Codex cache traversal and missing roots", () => {
    const cache = resolve(temporaryRoot(), "cache");
    const essential = resolve(cache, "main/essential/1.0.0");
    mkdirSync(essential, { recursive: true });
    expect(() =>
      codexCachePluginRoot(essential, {
        id: "coding@../escape",
        version: "1.0.0",
      }),
    ).toThrow(AgentTemplateError);
    expect(() =>
      codexCachePluginRoot(essential, {
        id: "coding@main",
        version: "missing",
      }),
    ).toThrow("cache root is absent");
  });

  it("should install only effectively enabled trusted Grok plugins from inspect paths", () => {
    const root = temporaryRoot();
    const essential = resolve(root, "installed/essential");
    const coding = resolve(root, "resolved/coding");
    const disabled = resolve(root, "installed/disabled");
    const untrusted = resolve(root, "installed/untrusted");
    const staleCoding = resolve(root, "installed/coding");
    writeTemplate(essential, "first-agent", true);
    writeTemplate(coding, "resolved-agent");
    writeTemplate(staleCoding, "stale-agent");
    writeTemplate(disabled, "disabled-agent");
    writeTemplate(untrusted, "untrusted-agent");
    mkdirSync(resolve(essential, "directions"));
    mkdirSync(resolve(essential, "references"));
    writeFileSync(resolve(essential, "directions/lead.md"), "Lead fixture.\n");
    writeFileSync(resolve(essential, "directions/GROK.md"), "Bootstrap fixture.\n");
    writeFileSync(resolve(essential, "references/state-systems.md"), "State fixture.\n");
    writeFileSync(resolve(root, "inspect.json"), JSON.stringify({ plugins: [
      { name: "essential", path: essential, enabled: true, scope: "user" },
      { name: "coding", path: coding, enabled: true, scope: "project" },
      { name: "disabled", path: disabled, enabled: false, scope: "user" },
      { name: "untrusted", path: untrusted, enabled: true, scope: "user" },
    ] }));
    writeFileSync(resolve(root, "list.json"), JSON.stringify([
      { name: "essential", path: essential, status: "enabled", marketplace: "main" },
      { name: "coding", path: staleCoding, source: coding, status: "disabled", marketplace: "main" },
      { name: "disabled", path: disabled, status: "enabled", marketplace: "main" },
      { name: "untrusted", path: untrusted, status: "enabled", marketplace: "other" },
    ]));

    const result = installFromGrokInventory(root, essential);

    expect(result.status, result.stderr).toBe(0);
    expect(readdirSync(resolve(root, "agents")).sort()).toEqual([
      ".essential", "first-agent.md", "resolved-agent.md",
    ]);
  });

  it.each([
    ["nonzero exit", "exit"],
    ["malformed JSON", "malformed"],
    ["launch error", "launch"],
  ] as const)("should abort a Grok refresh when plugin list discovery has a %s", (_label, failure) => {
    const root = temporaryRoot();
    const essential = resolve(root, "installed/essential");
    const coding = resolve(root, "resolved/coding");
    writeTemplate(essential, "essential-agent");
    writeTemplate(coding, "coding-agent");
    mkdirSync(resolve(essential, "references"), { recursive: true });
    writeFileSync(resolve(essential, "references/state-systems.md"), "State systems.\n");
    mkdirSync(resolve(essential, "directions"), { recursive: true });
    writeFileSync(resolve(essential, "directions/GROK.md"), "Bootstrap fixture.\n");
    const destination = resolve(root, "agents");
    const inspect = resolve(root, "inspect.json");
    const list = resolve(root, "list.json");
    const bin = grokDiscoveryStub(root);
    const environment = {
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      HOME: resolve(root, "home"),
      GROK_HOME: resolve(root, "home/grok"),
      GROK_INSPECT_FIXTURE: inspect,
      GROK_LIST_FIXTURE: list,
      GROK_LIST_EXIT: "0",
      GROK_LIST_LAUNCHER: "",
    };
    writeFileSync(inspect, JSON.stringify({ plugins: [
      { name: "essential", path: essential, enabled: true, scope: "user" },
      { name: "coding", path: coding, enabled: true, scope: "user" },
    ] }));
    writeFileSync(list, JSON.stringify([
      { name: "essential", path: essential, status: "enabled", marketplace: "fixture" },
      { name: "coding", path: coding, status: "enabled", marketplace: "fixture" },
    ]));

    const first = spawnSync("bun", [script, "--plugin-root", essential, "--destination", destination, "--harness", "grok"], {
      encoding: "utf8",
      env: environment,
    });
    expect(first.status, first.stderr).toBe(0);
    const receiptPath = resolve(destination, ".essential/installation.json");
    const receiptBefore = readFileSync(receiptPath, "utf8");
    const codingAgent = resolve(destination, "coding-agent.md");
    expect(existsSync(codingAgent)).toBe(true);

    if (failure === "malformed") writeFileSync(list, "[not json");
    else if (failure === "launch") environment.GROK_LIST_LAUNCHER = resolve(root, "missing-list-command");
    else environment.GROK_LIST_EXIT = "42";
    const refreshed = spawnSync("bun", [script, "--plugin-root", essential, "--destination", destination, "--harness", "grok"], {
      encoding: "utf8",
      env: environment,
    });

    expect(existsSync(codingAgent)).toBe(true);
    expect(readFileSync(receiptPath, "utf8")).toBe(receiptBefore);
    expect(refreshed.status).not.toBe(0);
    expect(`${refreshed.stdout}${refreshed.stderr}`).toMatch(/plugin list|discovery|JSON|failed|cannot/i);
  });

  it.each(["[]", "[not json"])("should reject malformed Grok inspect input %s before writing agents", (payload) => {
    const root = temporaryRoot();
    const essential = resolve(root, "installed/essential");
    mkdirSync(essential, { recursive: true });
    writeFileSync(resolve(root, "inspect.json"), payload);
    writeFileSync(resolve(root, "list.json"), "[]");

    const result = installFromGrokInventory(root, essential);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/inspect|JSON/);
    expect(existsSync(resolve(root, "agents"))).toBe(false);
  });

  it("should surface Grok inspect failure before writing agents", () => {
    const root = temporaryRoot();
    const essential = resolve(root, "installed/essential");
    mkdirSync(essential, { recursive: true });
    writeFileSync(resolve(root, "list.json"), "[]");

    const result = installFromGrokInventory(root, essential);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/inspect/);
    expect(existsSync(resolve(root, "agents"))).toBe(false);
  });

});

describe("installer command-line handling", () => {
  it("preserves help and parser errors", () => {
    const shown = run("--help");
    expect(shown).toMatchObject({ exitCode: 0, stderr: "" });
    expect(shown.stdout).toContain("usage: install_agents.ts");
    expect(shown.stdout).toContain("--harness {claude,codex,grok}");
    expect(shown.stdout).toContain("--include-marketplace");

    const missing = run("--destination");
    expect(missing.exitCode).toBe(2);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toContain(
      "argument --destination: expected one argument",
    );

    const unknown = run("--unknown");
    expect(unknown.exitCode).toBe(2);
    expect(unknown.stderr).toContain("unrecognized arguments: --unknown");

    const invalid = run("--harness=other");
    expect(invalid.exitCode).toBe(2);
    expect(invalid.stderr).toContain(
      "invalid choice: 'other' (choose from 'claude', 'codex', 'grok')",
    );
  });

  it("defaults the Grok destination under GROK_HOME", () => {
    const { essential } = sourceCheckout();
    const home = temporaryRoot();
    const bin = grokDiscoveryStub(home);
    const plugins = [
      { name: "essential", path: essential, enabled: true, scope: "user", marketplace: "fixture" },
      { name: "coding", path: resolve(essential, "../coding"), enabled: true, scope: "user", marketplace: "fixture" },
    ];
    writeFileSync(resolve(home, "inspect.json"), JSON.stringify({ plugins }));
    writeFileSync(resolve(home, "list.json"), JSON.stringify(plugins));
    const result = spawnSync(
      "bun",
      ["run", script, "--plugin-root", essential, "--harness", "grok"],
      { encoding: "utf8", env: {
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
        HOME: resolve(home, "home"),
        GROK_HOME: home,
        GROK_INSPECT_FIXTURE: resolve(home, "inspect.json"),
        GROK_LIST_FIXTURE: resolve(home, "list.json"),
      } },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(readdirSync(resolve(home, "agents")).sort()).toEqual([
      ".essential",
      "first-agent.md",
      "second-agent.md",
    ]);
  });

  it("installs through Bun with explicit paths", () => {
    const { essential } = sourceCheckout();
    const destination = resolve(temporaryRoot(), "agents");
    const result = run(
      "--plugin-root",
      essential,
      "--destination",
      destination,
      "--harness",
      "codex",
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("done — installed 2 agent(s)");
    expect(existsSync(resolve(destination, "first-agent.toml"))).toBe(true);
  });
});
