import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { planOpencodeGrant, planStateGrant } from "./state-grant.ts";
import { commitFiles } from "./transaction.ts";

import type { HarnessName } from "../installation.ts";

let home = "";
let configHome = "";
let statesRoot = "";
beforeEach(() => {
  home = realpathSync(mkdtempSync(join(tmpdir(), "state-grant-")));
  vi.stubEnv("HOME", home);
  configHome = join(home, "config");
  statesRoot = join(home, ".agents", "states");
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true });
});

function seed(name: string, text: string): void {
  mkdirSync(configHome, { recursive: true });
  writeFileSync(join(configHome, name), text);
}
function read(name: string): string {
  return readFileSync(join(configHome, name), "utf8");
}
function grant(harness: HarnessName | "opencode"): { planned: number; manual?: string } {
  const plan =
    harness === "opencode"
      ? planOpencodeGrant(configHome)
      : planStateGrant(harness, { configHome, statesRoot });
  commitFiles(plan.changes);
  return { planned: plan.changes.length, manual: plan.manual };
}

describe("fn:planStateGrant claude", () => {
  it("should add the sandbox entry and the Edit rule without enabling a sandbox", () => {
    grant("claude");
    expect(JSON.parse(read("settings.json"))).toEqual({
      sandbox: { filesystem: { allowWrite: ["~/.agents/states"] } },
      permissions: { allow: ["Edit(~/.agents/states/**)"] },
    });
  });

  it("should keep the user's settings, sandbox switch, and rules", () => {
    seed(
      "settings.json",
      `${JSON.stringify({ theme: "dark", sandbox: { enabled: false, filesystem: { allowWrite: ["~/x"] } }, permissions: { allow: ["Bash(ls)"] } }, null, 2)}\n`,
    );
    grant("claude");
    expect(JSON.parse(read("settings.json"))).toEqual({
      theme: "dark",
      sandbox: { enabled: false, filesystem: { allowWrite: ["~/x", "~/.agents/states"] } },
      permissions: { allow: ["Bash(ls)", "Edit(~/.agents/states/**)"] },
    });
  });

  it("should keep the file's indent", () => {
    seed("settings.json", `${JSON.stringify({ theme: "dark" }, null, 4)}\n`);
    grant("claude");
    expect(read("settings.json")).toMatch(/^ {4}"theme": "dark",$/m);
  });

  it("should plan nothing once both entries are present", () => {
    grant("claude");
    expect(grant("claude").planned).toBe(0);
  });

  it("should leave settings it cannot parse and name the entries to add by hand", () => {
    seed("settings.json", '{ // comment\n "theme": "dark" }\n');
    expect(grant("claude").manual).toContain("Edit(~/.agents/states/**)");
    expect(read("settings.json")).toContain("// comment");
  });
});

describe("fn:planStateGrant codex", () => {
  it("should create writable_roots with an absolute path and no sandbox mode", () => {
    grant("codex");
    expect(read("config.toml")).toBe(`[sandbox_workspace_write]\nwritable_roots = [${JSON.stringify(statesRoot)}]\n`);
  });

  it("should append to an existing roots array and keep the rest of the file", () => {
    seed("config.toml", `model = "x" # mine\n\n[sandbox_workspace_write]\nnetwork_access = true\nwritable_roots = ["/a"]\n\n[other]\nk = 1\n`);
    grant("codex");
    expect(read("config.toml")).toBe(
      `model = "x" # mine\n\n[sandbox_workspace_write]\nnetwork_access = true\nwritable_roots = ["/a", ${JSON.stringify(statesRoot)}]\n\n[other]\nk = 1\n`,
    );
  });

  it("should plan nothing once the root is present", () => {
    grant("codex");
    expect(grant("codex").planned).toBe(0);
  });

  it.each([
    ["a permissions profile", `default_permissions = "dev"\n\n[permissions.dev.filesystem]\n"/mine" = "write"\n`],
    ["a multi-line roots array", `[sandbox_workspace_write]\nwritable_roots = [\n  "/a",\n]\n`],
  ])("should leave %s alone and ask for the entry by hand", (_name, text) => {
    seed("config.toml", text);
    expect(grant("codex")).toEqual({ planned: 0, manual: expect.stringContaining(statesRoot) });
    expect(read("config.toml")).toBe(text);
  });
});

describe("fn:planStateGrant grok", () => {
  it.each([
    ["no profile is selected", ""],
    ["the off profile is selected", `[sandbox]\nprofile = "off"\n`],
  ])("should change nothing when %s", (_name, text) => {
    seed("config.toml", text);
    expect(grant("grok")).toEqual({ planned: 0, manual: undefined });
  });

  it("should add the root to the user's selected profile", () => {
    seed("config.toml", `[sandbox]\nprofile = "mine"\n`);
    seed("sandbox.toml", `[profiles.mine]\nextends = "workspace"\nread_write = ["/a"]\n`);
    grant("grok");
    expect(read("sandbox.toml")).toBe(`[profiles.mine]\nextends = "workspace"\nread_write = ["/a", ${JSON.stringify(statesRoot)}]\n`);
    expect(read("config.toml")).toBe(`[sandbox]\nprofile = "mine"\n`);
  });

  it("should ask for the entry by hand when a built-in profile is selected", () => {
    seed("config.toml", `[sandbox]\nprofile = "workspace"\n`);
    expect(grant("grok").manual).toContain("read_write");
  });
});

describe("fn:planOpencodeGrant", () => {
  it("should add the external_directory entry and keep the user's", () => {
    seed("opencode.json", `${JSON.stringify({ permission: { external_directory: { "/mine/**": "allow" } } })}\n`);
    grant("opencode");
    expect(JSON.parse(read("opencode.json")).permission.external_directory).toEqual({
      "/mine/**": "allow",
      "~/.agents/states/**": "allow",
    });
  });

  it("should plan nothing under a blanket allow", () => {
    seed("opencode.json", `${JSON.stringify({ permission: "allow" })}\n`);
    expect(grant("opencode").planned).toBe(0);
  });
});
