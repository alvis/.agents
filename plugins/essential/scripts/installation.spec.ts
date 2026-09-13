import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { installManagedFiles, uninstallAgents } from "./installation.ts";

vi.mock("node:fs", async (importOriginal) => {
  const filesystem = await importOriginal<typeof import("node:fs")>();
  return {
    ...filesystem,
    renameSync: vi.fn(filesystem.renameSync),
    rmSync: vi.fn(filesystem.rmSync),
  } satisfies Partial<typeof import("node:fs")>;
});

interface Sandbox {
  readonly root: string;
  readonly essential: string;
  readonly home: string;
  readonly destination: string;
  readonly grokHome: string;
}

interface CommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const essentialRoot = resolve(import.meta.dirname, "..");

describe("Essential installation ownership", () => {
  it.each(["claude", "codex", "grok"] as const)("should record %s installation and remove unchanged owned files idempotently", (harness) => {
    const sandbox = createSandbox();
    try {
      const installed = runInstaller(sandbox, "install", harness);
      expect(installed.status, installed.stderr).toBe(0);
      expect(existsSync(join(sandbox.destination, ".essential/installation.json"))).toBe(true);

      const removed = runInstaller(sandbox, "uninstall", harness);

      expect(removed.status, removed.stderr).toBe(0);
      expect(existsSync(join(sandbox.destination, `first-agent${harness === "codex" ? ".toml" : ".md"}`))).toBe(false);
      expect(existsSync(join(sandbox.destination, ".essential/installation.json"))).toBe(false);
      expect(existsSync(join(sandbox.destination, ".essential/directions/lead.md"))).toBe(false);
      expect(runInstaller(sandbox, "uninstall", harness).status).toBe(0);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it("should attach once, refresh a relocated Grok bootstrap, and preserve surrounding user text", () => {
    const sandbox = createSandbox();
    const userText = "# Personal instructions\n\nKeep my formatting.";
    const laterText = "\n\nAdditional user instruction.\n";
    const attachment = join(sandbox.grokHome, "AGENTS.md");
    mkdirSync(sandbox.grokHome, { recursive: true });
    writeFileSync(attachment, userText);
    try {
      expect(runInstaller(sandbox, "install", "grok").status).toBe(0);
      const firstInstall = readFileSync(attachment, "utf8");
      expect(firstInstall).toContain(`@${realpathSync(join(sandbox.essential, "directions/GROK.md"))}`);
      expect(firstInstall.startsWith(userText)).toBe(true);
      expect(runInstaller(sandbox, "install", "grok").status).toBe(0);
      expect(readFileSync(attachment, "utf8")).toBe(firstInstall);

      const relocated = join(sandbox.root, "moved cache/plugins/essential");
      cpSync(sandbox.essential, relocated, { recursive: true });
      writeFileSync(attachment, `${firstInstall}${laterText}`);
      const refreshed = runInstaller({ ...sandbox, essential: relocated }, "install", "grok");

      expect(refreshed.status, refreshed.stderr).toBe(0);
      const updated = readFileSync(attachment, "utf8");
      expect(updated).toContain(`@${realpathSync(join(relocated, "directions/GROK.md"))}`);
      expect(updated).not.toContain(`@${realpathSync(join(sandbox.essential, "directions/GROK.md"))}`);
      expect(runInstaller(sandbox, "uninstall", "grok").status).toBe(0);
      expect(readFileSync(attachment, "utf8")).toBe(`${userText}${laterText}`);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it.each(["claude", "codex"] as const)("should leave all Grok configuration untouched for %s", (harness) => {
    const sandbox = createSandbox();
    mkdirSync(sandbox.grokHome, { recursive: true });
    const attachment = join(sandbox.grokHome, "AGENTS.md");
    writeFileSync(attachment, "Grok-only personal context\n");
    try {
      expect(runInstaller(sandbox, "install", harness).status).toBe(0);
      expect(runInstaller(sandbox, "uninstall", harness).status).toBe(0);

      expect(readFileSync(attachment, "utf8")).toBe("Grok-only personal context\n");
      expect(readdirSync(sandbox.grokHome)).toEqual(["AGENTS.md"]);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it("should preserve edited agents and the support files they use", () => {
    const sandbox = createSandbox();
    try {
      writeTemplate(sandbox.essential, "second-agent");
      expect(runInstaller(sandbox, "install", "codex").status).toBe(0);
      const editedAgent = join(sandbox.destination, "first-agent.toml");
      const editedBytes = `${readFileSync(editedAgent, "utf8")}\n# personal edit\n`;
      writeFileSync(editedAgent, editedBytes);

      const result = runInstaller(sandbox, "uninstall", "codex");

      expect(`${result.stdout}${result.stderr}`).toContain(editedAgent);
      expect(readFileSync(editedAgent, "utf8")).toBe(editedBytes);
      expect(existsSync(join(sandbox.destination, "second-agent.toml"))).toBe(false);
      expect(readFileSync(join(sandbox.destination, ".essential/directions/lead.md"), "utf8")).toBe("Lead fixture.\n");
      expect(readFileSync(join(sandbox.destination, ".essential/references/state-systems.md"), "utf8")).toBe("State fixture.\n");
      expect(existsSync(join(sandbox.destination, ".essential/installation.json"))).toBe(true);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it("should leave unowned files and an attachment alone when its ownership receipt is missing", () => {
    const sandbox = createSandbox();
    try {
      expect(runInstaller(sandbox, "install", "grok").status).toBe(0);
      const attachment = join(sandbox.grokHome, "AGENTS.md");
      const attachmentBytes = readFileSync(attachment, "utf8");
      const agent = join(sandbox.destination, "first-agent.md");
      const agentBytes = readFileSync(agent, "utf8");
      rmSync(join(sandbox.destination, ".essential/installation.json"));

      const result = runInstaller(sandbox, "uninstall", "grok");

      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(attachment, "utf8")).toBe(attachmentBytes);
      expect(readFileSync(agent, "utf8")).toBe(agentBytes);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it("should adopt byte-identical generated files and remove them on uninstall", () => {
    const sandbox = createSandbox();
    try {
      expect(runInstaller(sandbox, "install", "claude").status).toBe(0);
      const agent = join(sandbox.destination, "first-agent.md");
      const generated = readFileSync(agent, "utf8");
      rmSync(join(sandbox.destination, ".essential/installation.json"));

      expect(runInstaller(sandbox, "install", "claude").status).toBe(0);
      expect(readFileSync(agent, "utf8")).toBe(generated);
      expect(runInstaller(sandbox, "uninstall", "claude").status).toBe(0);
      expect(existsSync(agent)).toBe(false);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it("should preserve an unowned conflicting agent and symlink target", () => {
    const sandbox = createSandbox();
    mkdirSync(sandbox.destination, { recursive: true });
    const external = join(sandbox.home, "personal-agent.md");
    writeFileSync(external, "Personal agent\n");
    symlinkSync(external, join(sandbox.destination, "first-agent.md"));
    try {
      const result = runInstaller(sandbox, "install", "claude");

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("first-agent.md");
      expect(readFileSync(external, "utf8")).toBe("Personal agent\n");
      expect(readFileSync(join(sandbox.destination, "first-agent.md"), "utf8")).toBe("Personal agent\n");
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it("should roll back changed files and ownership when a later publication rename fails", () => {
    const sandbox = createSandbox();
    try {
      installManagedFiles(sandbox.destination, [
        { path: "first-agent.md", content: "agent before\n", kind: "agent" },
        { path: ".essential/support.md", content: "support before\n", kind: "support" },
      ], { harness: "claude", stdout: () => {} });
      const receipt = join(sandbox.destination, ".essential/installation.json");
      const originalReceipt = readFileSync(receipt, "utf8");
      const performRename = vi.mocked(renameSync).getMockImplementation();
      if (performRename === undefined) throw new Error("missing filesystem rename implementation");
      vi.mocked(renameSync)
        .mockImplementationOnce(performRename)
        .mockImplementationOnce(() => { throw new Error("publication rename failed"); });

      expect(() => installManagedFiles(sandbox.destination, [
        { path: "first-agent.md", content: "agent after\n", kind: "agent" },
        { path: ".essential/support.md", content: "support after\n", kind: "support" },
      ], { harness: "claude", stdout: () => {} })).toThrow("publication rename failed");

      expect(readFileSync(join(sandbox.destination, "first-agent.md"), "utf8")).toBe("agent before\n");
      expect(readFileSync(join(sandbox.destination, ".essential/support.md"), "utf8")).toBe("support before\n");
      expect(readFileSync(receipt, "utf8")).toBe(originalReceipt);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it("should reject a selected edited agent without changing any other installed file", () => {
    const sandbox = createSandbox();
    try {
      expect(runInstaller(sandbox, "install", "codex").status).toBe(0);
      const agent = join(sandbox.destination, "first-agent.toml");
      const support = join(sandbox.destination, ".essential/directions/lead.md");
      const receipt = join(sandbox.destination, ".essential/installation.json");
      const originalReceipt = readFileSync(receipt, "utf8");
      writeFileSync(agent, "User-owned edited agent\n");
      writeFileSync(join(sandbox.essential, "directions/lead.md"), "Changed upstream support\n");

      const result = runInstaller(sandbox, "install", "codex");

      expect(result.status).not.toBe(0);
      expect(readFileSync(agent, "utf8")).toBe("User-owned edited agent\n");
      expect(readFileSync(support, "utf8")).toBe("Lead fixture.\n");
      expect(readFileSync(receipt, "utf8")).toBe(originalReceipt);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it("should preserve an edited Grok attachment while removing unchanged agents", () => {
    const sandbox = createSandbox();
    try {
      expect(runInstaller(sandbox, "install", "grok").status).toBe(0);
      const attachment = join(sandbox.grokHome, "AGENTS.md");
      const modified = readFileSync(attachment, "utf8").replace("<!-- essential:install:start -->\n", "<!-- essential:install:start -->\nUser-edited block.\n");
      writeFileSync(attachment, modified);

      const result = runInstaller(sandbox, "uninstall", "grok");

      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain(attachment);
      expect(readFileSync(attachment, "utf8")).toBe(modified);
      expect(existsSync(join(sandbox.destination, "first-agent.md"))).toBe(false);
      expect(existsSync(join(sandbox.destination, ".essential/installation.json"))).toBe(true);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it("should reject a second destination taking over another installation's Grok attachment", () => {
    const sandbox = createSandbox();
    try {
      expect(runInstaller(sandbox, "install", "grok").status).toBe(0);
      const attachment = join(sandbox.grokHome, "AGENTS.md");
      const original = readFileSync(attachment, "utf8");
      const secondDestination = join(sandbox.home, "other agents");

      const result = runInstaller({ ...sandbox, destination: secondDestination }, "install", "grok");

      expect(result.status).not.toBe(0);
      expect(readFileSync(attachment, "utf8")).toBe(original);
      expect(existsSync(secondDestination)).toBe(false);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it("should resolve destination aliases without allowing managed child symlinks", () => {
    const sandbox = createSandbox();
    try {
      mkdirSync(sandbox.destination, { recursive: true });
      const alias = join(sandbox.home, "agent alias");
      symlinkSync(sandbox.destination, alias, "dir");
      expect(runInstaller({ ...sandbox, destination: alias }, "install", "codex").status).toBe(0);
      const receiptPath = join(sandbox.destination, ".essential/installation.json");
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as { destination: string };
      expect(receipt.destination).toBe(realpathSync(sandbox.destination));
      const agent = join(sandbox.destination, "first-agent.toml");
      const external = join(sandbox.home, "outside.toml");
      writeFileSync(external, readFileSync(agent));
      rmSync(agent);
      symlinkSync(external, agent);

      const result = runInstaller({ ...sandbox, destination: alias }, "uninstall", "codex");

      expect(result.status).not.toBe(0);
      expect(existsSync(external)).toBe(true);
      expect(existsSync(receiptPath)).toBe(true);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it("should refuse a tampered ownership path without removing external content", () => {
    const sandbox = createSandbox();
    try {
      expect(runInstaller(sandbox, "install", "claude").status).toBe(0);
      const receiptPath = join(sandbox.destination, ".essential/installation.json");
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as { files: Array<{ path: string }> };
      const external = join(sandbox.home, "outside.md");
      writeFileSync(external, "Personal content\n");
      receipt.files[0]!.path = "../outside.md";
      writeFileSync(receiptPath, JSON.stringify(receipt));

      const result = runInstaller(sandbox, "uninstall", "claude");

      expect(result.status).not.toBe(0);
      expect(readFileSync(external, "utf8")).toBe("Personal content\n");
      expect(existsSync(join(sandbox.destination, "first-agent.md"))).toBe(true);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it("should restore removed files and the receipt after uninstall publication fails", () => {
    const sandbox = createSandbox();
    try {
      const files = [
        { path: "first-agent.md", content: "agent before\n", kind: "agent" },
        { path: ".essential/support.md", content: "support before\n", kind: "support" },
      ] as const;
      installManagedFiles(sandbox.destination, files, { harness: "claude", stdout: () => {} });
      const receipt = join(sandbox.destination, ".essential/installation.json");
      const originalReceipt = readFileSync(receipt, "utf8");
      const performRemoval = vi.mocked(rmSync).getMockImplementation();
      if (performRemoval === undefined) throw new Error("missing filesystem removal implementation");
      vi.mocked(rmSync)
        .mockImplementationOnce(performRemoval)
        .mockImplementationOnce(() => { throw new Error("removal failed"); });

      expect(() => uninstallAgents(sandbox.destination, { harness: "claude", stdout: () => {} })).toThrow("removal failed");

      expect(readFileSync(join(sandbox.destination, "first-agent.md"), "utf8")).toBe("agent before\n");
      expect(readFileSync(join(sandbox.destination, ".essential/support.md"), "utf8")).toBe("support before\n");
      expect(readFileSync(receipt, "utf8")).toBe(originalReceipt);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it.each(["claude", "codex", "grok"] as const)("should use only %s's home when a destination is omitted", (harness) => {
    const sandbox = createSandbox();
    const selectedHome = harness === "claude" ? join(sandbox.home, ".claude") : harness === "codex" ? join(sandbox.home, "custom codex") : sandbox.grokHome;
    const destination = join(selectedHome, "agents");
    try {
      const result = runInstaller(sandbox, "install", harness, { useDefaultDestination: true });

      expect(result.status, result.stderr).toBe(0);
      expect(existsSync(join(destination, ".essential/installation.json"))).toBe(true);
      expect(existsSync(sandbox.destination)).toBe(false);
      expect(runInstaller(sandbox, "uninstall", harness, { useDefaultDestination: true }).status).toBe(0);
      expect(existsSync(join(destination, ".essential/installation.json"))).toBe(false);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it.each(["codex", "grok"] as const)("should fall back to the user home for an empty %s home override", (harness) => {
    const sandbox = createSandbox();
    const selectedHome = join(sandbox.home, `.${harness}`);
    const receipt = join(selectedHome, "agents/.essential/installation.json");
    const configuration = join(selectedHome, "AGENTS.md");
    const workingContext = join(sandbox.root, "AGENTS.md");
    const workingAgents = join(sandbox.root, "agents");
    mkdirSync(selectedHome, { recursive: true });
    mkdirSync(workingAgents);
    writeFileSync(configuration, "Personal harness configuration\n");
    writeFileSync(workingContext, "Working-directory instructions\n");
    writeFileSync(join(workingAgents, "personal.md"), "Personal working-directory agent\n");
    try {
      const result = runInstaller(sandbox, "install", harness, { useDefaultDestination: true, homeOverride: "" });

      expect(result.status, result.stderr).toBe(0);
      expect(existsSync(receipt)).toBe(true);
      expect(readFileSync(workingContext, "utf8")).toBe("Working-directory instructions\n");
      expect(readdirSync(workingAgents)).toEqual(["personal.md"]);
      if (harness === "grok") {
        expect(readFileSync(configuration, "utf8")).toContain(`@${realpathSync(join(sandbox.essential, "directions/GROK.md"))}`);
      }

      expect(runInstaller(sandbox, "uninstall", harness, { useDefaultDestination: true, homeOverride: "" }).status).toBe(0);
      expect(existsSync(receipt)).toBe(false);
      expect(readFileSync(configuration, "utf8")).toBe("Personal harness configuration\n");
      expect(readFileSync(workingContext, "utf8")).toBe("Working-directory instructions\n");
      expect(readFileSync(join(workingAgents, "personal.md"), "utf8")).toBe("Personal working-directory agent\n");
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });

  it("should install and uninstall Grok startup context when no enabled plugin has agents", () => {
    const sandbox = createSandbox();
    try {
      rmSync(join(sandbox.essential, "agents"), { recursive: true });
      rmSync(join(sandbox.essential, "references/state-systems.md"));

      const result = runInstaller(sandbox, "install", "grok");

      expect(result.status, result.stderr).toBe(0);
      const receipt = JSON.parse(readFileSync(join(sandbox.destination, ".essential/installation.json"), "utf8")) as { files: unknown[] };
      expect(receipt.files).toEqual([]);
      expect(readFileSync(join(sandbox.grokHome, "AGENTS.md"), "utf8")).toContain(`@${realpathSync(join(sandbox.essential, "directions/GROK.md"))}`);
      expect(runInstaller(sandbox, "uninstall", "grok").status).toBe(0);
      expect(existsSync(join(sandbox.grokHome, "AGENTS.md"))).toBe(false);
      expect(existsSync(join(sandbox.destination, ".essential/installation.json"))).toBe(false);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });
});

function runInstaller(sandbox: Sandbox, action: "install" | "uninstall", harness: "claude" | "codex" | "grok", options: { readonly useDefaultDestination?: boolean; readonly homeOverride?: string } = {}): CommandResult {
  const script = join(essentialRoot, "skills", action, "scripts", `${action}.sh`);
  const args = [script, "--harness", harness];
  if (!options.useDefaultDestination) args.push("--destination", sandbox.destination);
  if (action === "install") args.push("--plugin-root", sandbox.essential);
  writeFileSync(join(sandbox.root, "inspect.json"), JSON.stringify({ plugins: [{ name: "essential", path: sandbox.essential, enabled: true, scope: "user" }] }));
  writeFileSync(join(sandbox.root, "list.json"), JSON.stringify([{ name: "essential", path: sandbox.essential, marketplace: "fixture" }]));
  const result = spawnSync("bash", args, {
    cwd: sandbox.root,
    encoding: "utf8",
    env: {
      PATH: `${join(sandbox.root, "bin")}${delimiter}${process.env.PATH ?? ""}`,
      HOME: sandbox.home,
      CODEX_HOME: options.homeOverride ?? join(sandbox.home, "custom codex"),
      GROK_HOME: options.homeOverride ?? sandbox.grokHome,
      GROK_INSPECT_FIXTURE: join(sandbox.root, "inspect.json"),
      GROK_LIST_FIXTURE: join(sandbox.root, "list.json"),
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function createSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "essential install "));
  const essential = join(root, "plugins/essential");
  const home = join(root, "user home");
  const destination = join(home, "custom agents");
  const grokHome = join(home, "custom grok");
  for (const [path, contents] of [
    ["directions/lead.md", "Lead fixture.\n"],
    ["directions/GROK.md", "Bootstrap fixture.\n"],
    ["references/state-systems.md", "State fixture.\n"],
  ]) {
    const target = join(essential, path!);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents!);
  }
  writeTemplate(essential, "first-agent");
  mkdirSync(join(root, "bin"));
  const grok = join(root, "bin/grok");
  writeFileSync(grok, '#!/bin/sh\ncase "$*" in\n  "inspect --json") cat "$GROK_INSPECT_FIXTURE" ;;\n  "plugin list --json") cat "$GROK_LIST_FIXTURE" ;;\n  *) exit 64 ;;\nesac\n');
  chmodSync(grok, 0o755);
  mkdirSync(home, { recursive: true });
  return { root, essential, home, destination, grokHome };
}

function writeTemplate(pluginRoot: string, name: string): void {
  const template = join(pluginRoot, "agents", name);
  mkdirSync(join(template, "frontmatter"), { recursive: true });
  writeFileSync(join(template, "frontmatter/meta.json"), JSON.stringify({
    name,
    description: "Test role. Preferably named Ava, Kit, or June when the main agent spawns this role.",
    intelligence: "inherit",
  }));
  writeFileSync(join(template, "frontmatter/claude.json"), '{"memory":"project"}');
  writeFileSync(join(template, "frontmatter/codex.json"), "{}");
  writeFileSync(join(template, "frontmatter/grok.json"), "{}");
  writeFileSync(join(template, "base.md"), `# ${name}\n\nApply @essential:directions/lead.md.\n\n## Memory\n\nI retain durable facts in \`.claude/agent-memory/${name}/MEMORY.md\` following \`essential:templates/memory.md\`. Claims carry evidence and a last-verified date. I archive stale claims before 150 lines or 20KB, with detail in \`topics/<stable-area>/<specific-subject>.md\`.\n`);
}
