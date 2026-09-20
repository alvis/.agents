import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { projectPluginRoot } from "./plugin-root-projection.ts";

const repository = resolve(import.meta.dirname, "..");
const resolver = join(repository, "scripts/plugin-root");
const harnessVariables = [
  "PLUGIN_ROOT",
  "GROK_PLUGIN_ROOT",
  "CLAUDE_PLUGIN_ROOT",
] as const;

function cleanEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const variable of harnessVariables) delete environment[variable];
  delete environment.CLAUDE_CONFIG_DIR;
  return environment;
}

function createPlugin(root: string, name: string, harness: string): string {
  mkdirSync(join(root, `.${harness}-plugin`), { recursive: true });
  writeFileSync(
    join(root, `.${harness}-plugin/plugin.json`),
    `${JSON.stringify({ name })}\n`,
  );
  return root;
}

function runResolver(
  name: string,
  environment: NodeJS.ProcessEnv,
): ReturnType<typeof spawnSync> {
  return spawnSync("/bin/bash", [resolver, name], {
    encoding: "utf8",
    env: { ...cleanEnvironment(), ...environment },
  });
}

describe("installed plugin root resolution", () => {
  it("should resolve a Claude plugin through the installed registry", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-root-claude-"));
    try {
      const coding = createPlugin(
        join(root, "elsewhere/coding"),
        "coding",
        "claude",
      );
      const essential = createPlugin(
        join(root, "another/essential"),
        "essential",
        "claude",
      );
      const configuration = join(root, "configuration");
      mkdirSync(join(configuration, "plugins"), { recursive: true });
      writeFileSync(
        join(configuration, "plugins/installed_plugins.json"),
        `${JSON.stringify({ plugins: { "coding@alvis": [{ installPath: coding }], "essential@alvis": [{ installPath: essential }] } })}\n`,
      );

      expect(
        runResolver("essential", {
          CLAUDE_CONFIG_DIR: configuration,
          CLAUDE_PLUGIN_ROOT: coding,
        }),
      ).toMatchObject({
        status: 0,
        stdout: `${realpathSync(essential)}\n`,
        stderr: "",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("should resolve Codex cache roots without assuming a sibling plugin path", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-root-codex-"));
    try {
      const coding = createPlugin(
        join(root, "cache/alvis/coding/2.0.0"),
        "coding",
        "codex",
      );
      const essential = createPlugin(
        join(root, "cache/alvis/essential/1.0.0"),
        "essential",
        "codex",
      );

      expect(runResolver("essential", { PLUGIN_ROOT: coding })).toMatchObject({
        status: 0,
        stdout: `${realpathSync(essential)}\n`,
        stderr: "",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("should resolve Grok source installations from the marketplace plugin set", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-root-grok-"));
    try {
      const coding = createPlugin(
        join(root, "plugins/coding"),
        "coding",
        "grok",
      );
      const essential = createPlugin(
        join(root, "plugins/essential"),
        "essential",
        "grok",
      );

      expect(
        runResolver("essential", { GROK_PLUGIN_ROOT: coding }),
      ).toMatchObject({
        status: 0,
        stdout: `${realpathSync(essential)}\n`,
        stderr: "",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("should prefer native Codex and Grok roots over Claude compatibility aliases", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-root-precedence-"));
    try {
      const codex = createPlugin(
        join(root, "cache/alvis/coding/1.0.0"),
        "coding",
        "codex",
      );
      const codexEssential = createPlugin(
        join(root, "cache/alvis/essential/1.0.0"),
        "essential",
        "codex",
      );
      const grok = createPlugin(join(root, "plugins/coding"), "coding", "grok");
      const grokEssential = createPlugin(
        join(root, "plugins/essential"),
        "essential",
        "grok",
      );

      expect(
        runResolver("essential", {
          PLUGIN_ROOT: codex,
          GROK_PLUGIN_ROOT: grok,
          CLAUDE_PLUGIN_ROOT: join(root, "wrong"),
        }).stdout,
      ).toBe(`${realpathSync(codexEssential)}\n`);
      expect(
        runResolver("essential", {
          GROK_PLUGIN_ROOT: grok,
          CLAUDE_PLUGIN_ROOT: join(root, "wrong"),
        }).stdout,
      ).toBe(`${realpathSync(grokEssential)}\n`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["missing root", "essential", {}],
    ["invalid name", "../essential", { PLUGIN_ROOT: "/missing" }],
    ["missing plugin", "essential", { PLUGIN_ROOT: "/missing" }],
  ])("should fail silently for %s", (_case, name, environment) => {
    expect(runResolver(name, environment)).toMatchObject({
      status: 1,
      stdout: "",
      stderr: "",
    });
  });
});

describe("plugin-local resolver projection", () => {
  it("should project one executable copy into every marketplace plugin", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-root-projection-"));
    try {
      mkdirSync(join(root, ".claude-plugin"), { recursive: true });
      mkdirSync(join(root, "scripts"));
      cpSync(resolver, join(root, "scripts/plugin-root"));
      writeFileSync(
        join(root, ".claude-plugin/marketplace.json"),
        `${JSON.stringify({
          plugins: [
            { name: "essential", source: "./plugins/essential" },
            { name: "coding", source: "./plugins/coding" },
          ],
        })}\n`,
      );

      const paths = projectPluginRoot(root);

      expect(paths.map((path) => path.slice(root.length + 1))).toEqual([
        "plugins/essential/scripts/plugin-root",
        "plugins/coding/scripts/plugin-root",
      ]);
      for (const path of paths) {
        expect(readFileSync(path, "utf8")).toBe(readFileSync(resolver, "utf8"));
        expect(statSync(path).mode & 0o111).not.toBe(0);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
