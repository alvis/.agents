import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultWritableRoots, defaultWriteGrantPaths, planOpencodeGrant, planWriteGrant } from "./write-grant.ts";
import type { WritableRoots } from "./write-grant.ts";
import { commitFiles } from "./transaction.ts";

import type { HarnessName } from "../installation.ts";

let home = "";
let configHome = "";
let states = "";
let roots: string[] = [];
let refused: string[] = [];
const tilde = ["~/.agents/states", "~/.cache/qmd", "~/.config/qmd"];
beforeEach(() => {
  home = realpathSync(mkdtempSync(join(tmpdir(), "write-grant-")));
  vi.stubEnv("HOME", home);
  configHome = join(home, "config");
  states = join(home, ".agents", "states");
  roots = [states, join(home, ".cache", "qmd"), join(home, ".config", "qmd")];
  refused = [];
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
// only the states root takes file-tool writes, as defaultWritableRoots marks it
function writable(): WritableRoots {
  return { roots: roots.map((path) => ({ path, fileTools: path === states })), refused };
}
function grant(harness: HarnessName | "opencode"): { planned: number; manual?: string } {
  const plan =
    harness === "opencode"
      ? planOpencodeGrant(configHome, writable())
      : planWriteGrant(harness, { configHome, writableRoots: writable() });
  commitFiles(plan.changes);
  return { planned: plan.changes.length, manual: plan.manual };
}
const quoted = (members: readonly string[]): string => members.map((member) => JSON.stringify(member)).join(", ");

describe("fn:defaultWritableRoots", () => {
  beforeEach(() => {
    vi.stubEnv("XDG_CACHE_HOME", "");
    vi.stubEnv("XDG_CONFIG_HOME", "");
    vi.stubEnv("QMD_CONFIG_DIR", "");
  });

  const paths = (): string[] => defaultWritableRoots().roots.map(({ path }) => path);

  it("should resolve the state root and qmd's cache and config under the home folder", () => {
    expect(defaultWritableRoots()).toEqual({ roots: writable().roots, refused: [] });
  });

  it("should open file tools to the state root only", () => {
    const opened = defaultWritableRoots().roots.filter(({ fileTools }) => fileTools);
    expect(opened.map(({ path }) => path)).toEqual([states]);
  });

  it("should follow the XDG cache and config homes", () => {
    vi.stubEnv("XDG_CACHE_HOME", "/xdg/cache");
    vi.stubEnv("XDG_CONFIG_HOME", "/xdg/config");
    expect(paths()).toEqual([states, "/xdg/cache/qmd", "/xdg/config/qmd"]);
  });

  it("should let QMD_CONFIG_DIR replace the config root", () => {
    vi.stubEnv("XDG_CONFIG_HOME", "/xdg/config");
    vi.stubEnv("QMD_CONFIG_DIR", "/qmd/config");
    expect(paths()).toEqual([states, roots[1], "/qmd/config"]);
  });

  it("should list a root once when two resolve to the same folder", () => {
    vi.stubEnv("QMD_CONFIG_DIR", join(home, ".cache", "qmd"));
    expect(paths()).toEqual([states, roots[1]]);
  });

  it.each([
    ["the home folder", () => home, "is the home folder"],
    ["the filesystem root", () => "/", "contains the home folder"],
    ["an ancestor of the home folder", () => dirname(home), "contains the home folder"],
    ["a relative folder", () => ".", "is relative"],
    ["an unexpanded tilde", () => "~", "is relative"],
  ])("should refuse QMD_CONFIG_DIR set to %s and still grant the others", (_name, value, why) => {
    vi.stubEnv("QMD_CONFIG_DIR", value());
    expect(defaultWritableRoots()).toEqual({
      roots: writable().roots.slice(0, 2),
      refused: [`QMD_CONFIG_DIR=${value()} makes ${value()} a root, which ${why}; not granted`],
    });
  });

  it("should refuse a relative XDG_CACHE_HOME and still grant the others", () => {
    vi.stubEnv("XDG_CACHE_HOME", "cache");
    expect(defaultWritableRoots()).toEqual({
      roots: [writable().roots[0], writable().roots[2]],
      refused: ["XDG_CACHE_HOME=cache makes cache/qmd a root, which is relative; not granted"],
    });
  });

  it("should fall back to the account's home folder when HOME is empty", () => {
    vi.stubEnv("HOME", "");
    expect(paths()[0]).toBe(join(homedir(), ".agents", "states"));
  });
});

describe("fn:defaultWriteGrantPaths", () => {
  it.each([
    ["claude", "CLAUDE_CONFIG_DIR", ".claude"],
    ["codex", "CODEX_HOME", ".codex"],
    ["grok", "GROK_HOME", ".grok"],
  ] as const)("should place the %s config under the home folder unless %s names one", (harness, variable, folder) => {
    vi.stubEnv(variable, "");
    expect(defaultWriteGrantPaths(harness)).toEqual({ configHome: join(home, folder), writableRoots: defaultWritableRoots() });
    vi.stubEnv(variable, configHome);
    expect(defaultWriteGrantPaths(harness).configHome).toBe(configHome);
  });
});

describe("fn:planWriteGrant refused roots", () => {
  it("should report a refused root by hand and still grant the others", () => {
    refused = ["QMD_CONFIG_DIR=/ makes / a root, which contains the home folder; not granted"];
    roots = roots.slice(0, 2);
    const { planned, manual } = grant("codex");
    expect(planned).toBe(1);
    expect(manual).toBe(refused[0]);
    expect(read("config.toml")).toBe(`[sandbox_workspace_write]\nwritable_roots = [${quoted(roots)}]\n`);
  });

  it("should report only the refusals, and ask nothing of the harness, when every root is refused", () => {
    refused = ["QMD_CONFIG_DIR=/ makes / a root, which contains the home folder; not granted"];
    roots = [];
    seed("config.toml", `[sandbox]\nprofile = "workspace"\n`);
    expect(grant("grok")).toEqual({ planned: 0, manual: refused[0] });
    expect(read("config.toml")).toBe(`[sandbox]\nprofile = "workspace"\n`);
  });

  it("should report a refused root alongside a placement it cannot make", () => {
    refused = ["XDG_CACHE_HOME=cache makes cache/qmd a root, which is relative; not granted"];
    seed("opencode.json", "{}\n");
    seed("opencode.jsonc", "{}\n");
    const { manual } = grant("opencode");
    expect(manual?.startsWith(`${refused[0]}; add permission`)).toBe(true);
  });
});

describe("fn:planWriteGrant claude", () => {
  it("should add a sandbox entry per root and an Edit rule for the state root only, without enabling a sandbox", () => {
    grant("claude");
    expect(JSON.parse(read("settings.json"))).toEqual({
      sandbox: { filesystem: { allowWrite: tilde } },
      permissions: { allow: ["Edit(~/.agents/states/**)"] },
    });
  });

  it("should keep the user's settings, sandbox switch, rules, and an entry already present", () => {
    seed(
      "settings.json",
      `${JSON.stringify({ theme: "dark", sandbox: { enabled: false, filesystem: { allowWrite: ["~/x", "~/.cache/qmd"] } }, permissions: { allow: ["Bash(ls)"] } }, null, 2)}\n`,
    );
    grant("claude");
    expect(JSON.parse(read("settings.json"))).toEqual({
      theme: "dark",
      sandbox: { enabled: false, filesystem: { allowWrite: ["~/x", "~/.cache/qmd", "~/.agents/states", "~/.config/qmd"] } },
      permissions: { allow: ["Bash(ls)", "Edit(~/.agents/states/**)"] },
    });
  });

  it("should spell a root outside the home folder with a double slash", () => {
    roots = ["/srv/qmd"];
    states = "/srv/qmd";
    grant("claude");
    expect(JSON.parse(read("settings.json"))).toEqual({
      sandbox: { filesystem: { allowWrite: ["//srv/qmd"] } },
      permissions: { allow: ["Edit(//srv/qmd/**)"] },
    });
  });

  it("should add a root listed twice only once", () => {
    roots = [roots[0]!, roots[0]!];
    grant("claude");
    expect(JSON.parse(read("settings.json")).sandbox.filesystem.allowWrite).toEqual([tilde[0]]);
  });

  it("should keep the file's indent", () => {
    seed("settings.json", `${JSON.stringify({ theme: "dark" }, null, 4)}\n`);
    grant("claude");
    expect(read("settings.json")).toMatch(/^ {4}"theme": "dark",$/m);
  });

  it("should plan nothing once every entry is present", () => {
    grant("claude");
    expect(grant("claude").planned).toBe(0);
  });

  it("should leave settings it cannot parse and name every entry to add by hand", () => {
    seed("settings.json", '{ // comment\n "theme": "dark" }\n');
    const { manual } = grant("claude");
    for (const root of tilde) expect(manual).toContain(JSON.stringify(root));
    expect(manual).toContain("Edit(~/.agents/states/**)");
    expect(manual).not.toContain("Edit(~/.cache/qmd/**)");
    expect(read("settings.json")).toContain("// comment");
  });

  it.each([
    ["a top-level array", "[]\n"],
    ["a permissions.allow that is not a list", `${JSON.stringify({ permissions: { allow: "Bash" } })}\n`],
  ])("should leave settings holding %s and ask for every entry by hand", (_name, text) => {
    seed("settings.json", text);
    expect(grant("claude")).toEqual({ planned: 0, manual: expect.stringContaining("sandbox.filesystem.allowWrite") });
    expect(read("settings.json")).toBe(text);
  });

  it("should fail rather than ask by hand when the settings cannot be read", () => {
    seed("settings.json", "{}\n");
    chmodSync(join(configHome, "settings.json"), 0o000);
    expect(() => grant("claude")).toThrow(expect.objectContaining({ code: "EACCES" }));
  });
});

describe("fn:planWriteGrant codex", () => {
  it("should create writable_roots with absolute paths and no sandbox mode", () => {
    grant("codex");
    expect(read("config.toml")).toBe(`[sandbox_workspace_write]\nwritable_roots = [${quoted(roots)}]\n`);
  });

  it("should append the missing roots to an existing array and keep the rest of the file", () => {
    seed(
      "config.toml",
      `model = "x" # mine\n\n[sandbox_workspace_write]\nnetwork_access = true\nwritable_roots = ["/a", ${JSON.stringify(roots[1])}]\n\n[other]\nk = 1\n`,
    );
    grant("codex");
    expect(read("config.toml")).toBe(
      `model = "x" # mine\n\n[sandbox_workspace_write]\nnetwork_access = true\nwritable_roots = ["/a", ${quoted([roots[1]!, roots[0]!, roots[2]!])}]\n\n[other]\nk = 1\n`,
    );
  });

  it("should plan nothing once every root is present", () => {
    grant("codex");
    expect(grant("codex").planned).toBe(0);
  });

  it.each([
    ["ends with a blank line", 'model = "x"\n\n', ""],
    ["ends with a newline", 'model = "x"\n', "\n"],
    ["has no final newline", 'model = "x"', "\n\n"],
  ])("should append the table after a file that %s, separated by one blank line", (_name, text, gap) => {
    seed("config.toml", text);
    grant("codex");
    expect(read("config.toml")).toBe(`${text}${gap}[sandbox_workspace_write]\nwritable_roots = [${quoted(roots)}]\n`);
  });

  it("should fill an empty roots array in place", () => {
    seed("config.toml", "[sandbox_workspace_write]\nwritable_roots = []\n");
    grant("codex");
    expect(read("config.toml")).toBe(`[sandbox_workspace_write]\nwritable_roots = [${quoted(roots)}]\n`);
  });


  it.each([
    ["a permissions profile", `default_permissions = "dev"\n\n[permissions.dev.filesystem]\n"/mine" = "write"\n`],
    ["a multi-line roots array", `[sandbox_workspace_write]\nwritable_roots = [\n  "/a",\n]\n`],
  ])("should leave %s alone and ask for every root by hand", (_name, text) => {
    seed("config.toml", text);
    expect(grant("codex")).toEqual({ planned: 0, manual: expect.stringContaining(quoted(roots)) });
    expect(read("config.toml")).toBe(text);
  });
});

describe("fn:planWriteGrant grok", () => {
  it.each([
    ["no profile is selected", ""],
    ["the off profile is selected", `[sandbox]\nprofile = "off"\n`],
  ])("should change nothing when %s", (_name, text) => {
    seed("config.toml", text);
    expect(grant("grok")).toEqual({ planned: 0, manual: undefined });
  });

  it("should add every root to the user's selected profile", () => {
    seed("config.toml", `[sandbox]\nprofile = "mine"\n`);
    seed("sandbox.toml", `[profiles.mine]\nextends = "workspace"\nread_write = ["/a"]\n`);
    grant("grok");
    expect(read("sandbox.toml")).toBe(`[profiles.mine]\nextends = "workspace"\nread_write = ["/a", ${quoted(roots)}]\n`);
    expect(read("config.toml")).toBe(`[sandbox]\nprofile = "mine"\n`);
  });

  it("should plan nothing once every root is in the selected profile", () => {
    seed("config.toml", `[sandbox]\nprofile = "mine"\n`);
    seed("sandbox.toml", `[profiles.mine]\nextends = "workspace"\n`);
    grant("grok");
    expect(grant("grok").planned).toBe(0);
  });

  it("should leave a config.toml it cannot parse and ask for a fix by hand", () => {
    seed("config.toml", "[sandbox\n");
    expect(grant("grok")).toEqual({ planned: 0, manual: expect.stringContaining(join(configHome, "config.toml")) });
    expect(read("config.toml")).toBe("[sandbox\n");
  });

  describe("with a profile name that needs quoting", () => {
    beforeEach(() => seed("config.toml", `[sandbox]\nprofile = "a.b"\n`));

    it("should add every root under the profile's quoted header", () => {
      seed("sandbox.toml", `[profiles."a.b"]\nread_write = ["/a"]\n`);
      grant("grok");
      expect(read("sandbox.toml")).toBe(`[profiles."a.b"]\nread_write = ["/a", ${quoted(roots)}]\n`);
    });

    it("should append the quoted header when only a sub-table defines the profile", () => {
      seed("sandbox.toml", `[profiles."a.b".net]\nallow = true\n`);
      grant("grok");
      expect(read("sandbox.toml")).toBe(`[profiles."a.b".net]\nallow = true\n\n[profiles."a.b"]\nread_write = [${quoted(roots)}]\n`);
    });

    it("should leave a header quoted another way alone and ask for every root by hand under the quoted key", () => {
      const text = `[profiles.'a.b']\nextends = "workspace"\n`;
      seed("sandbox.toml", text);
      expect(grant("grok")).toEqual({
        planned: 0,
        manual: `add ${quoted(roots)} to read_write under [profiles."a.b"] in ${join(configHome, "sandbox.toml")}`,
      });
      expect(read("sandbox.toml")).toBe(text);
    });
  });

  it("should ask by hand under the bare profile key when the roots cannot be placed", () => {
    seed("config.toml", `[sandbox]\nprofile = "mine"\n`);
    const text = `[profiles.mine]\nread_write = [\n  "/a",\n]\n`;
    seed("sandbox.toml", text);
    expect(grant("grok")).toEqual({
      planned: 0,
      manual: `add ${quoted(roots)} to read_write under [profiles.mine] in ${join(configHome, "sandbox.toml")}`,
    });
    expect(read("sandbox.toml")).toBe(text);
  });

  it("should ask for every root by hand when a built-in profile is selected", () => {
    seed("config.toml", `[sandbox]\nprofile = "workspace"\n`);
    const { manual } = grant("grok");
    expect(manual).toContain("read_write");
    expect(manual).toContain(quoted(roots));
  });
});

describe("fn:planOpencodeGrant", () => {
  it("should add an external_directory entry per root and keep the user's", () => {
    seed(
      "opencode.json",
      `${JSON.stringify({ permission: { external_directory: { "/mine/**": "allow", "~/.cache/qmd/**": "allow" } } })}\n`,
    );
    grant("opencode");
    expect(JSON.parse(read("opencode.json")).permission.external_directory).toEqual({
      "/mine/**": "allow",
      "~/.cache/qmd/**": "allow",
      "~/.agents/states/**": "allow",
      "~/.config/qmd/**": "allow",
    });
  });

  it("should spell a root outside the home folder as an absolute pattern", () => {
    roots = ["/srv/qmd"];
    grant("opencode");
    expect(JSON.parse(read("opencode.json")).permission.external_directory).toEqual({ "/srv/qmd/**": "allow" });
  });

  it("should plan nothing once every root is present", () => {
    grant("opencode");
    expect(grant("opencode").planned).toBe(0);
  });

  it("should plan nothing under a blanket allow", () => {
    seed("opencode.json", `${JSON.stringify({ permission: "allow" })}\n`);
    expect(grant("opencode").planned).toBe(0);
  });

  it("should plan nothing when every outside folder is already allowed", () => {
    seed("opencode.json", `${JSON.stringify({ permission: { external_directory: "allow" } })}\n`);
    expect(grant("opencode")).toEqual({ planned: 0, manual: undefined });
  });

  it("should leave a non-object permission and name every root to add by hand", () => {
    const text = `${JSON.stringify({ permission: "ask" })}\n`;
    seed("opencode.json", text);
    expect(grant("opencode")).toEqual({ planned: 0, manual: expect.stringContaining('permission.external_directory["~/.agents/states/**"]') });
    expect(read("opencode.json")).toBe(text);
  });

  it("should name every root to add by hand when both config files exist", () => {
    seed("opencode.json", "{}\n");
    seed("opencode.jsonc", "{}\n");
    const { manual } = grant("opencode");
    for (const root of tilde) expect(manual).toContain(`permission.external_directory["${root}/**"] = "allow"`);
  });
});
