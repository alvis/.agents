import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createTemporaryDirectory,
  removeTemporaryDirectory,
} from "./test-support.ts";

const scriptPath = resolve(import.meta.dirname, "install_opencode.ts");
// permits Git and shell subprocess contention during the full parallel suite
const hookTimeoutMs = 60_000;

interface Sandbox {
  readonly home: string;
  readonly project: string;
  readonly root: string;
}

interface ToolInput {
  readonly callID: string;
  readonly sessionID: string;
  readonly tool: string;
}

interface ToolOutput {
  args: Record<string, unknown>;
}

interface ToolResult {
  metadata: Record<string, unknown>;
  output: string;
  title: string;
}

interface AdapterHooks {
  readonly "chat.message": (input: { readonly sessionID: string }, output: { message: { id: string }; parts: Array<{ id: string; sessionID: string; messageID: string; type: string; text: string; synthetic?: boolean }> }) => Promise<void>;
  readonly config: (config: Record<string, unknown>) => Promise<void>;
  readonly dispose: () => Promise<void>;
  readonly event: (input: { readonly event: Record<string, unknown> }) => Promise<void>;
  readonly "experimental.chat.system.transform": (
    input: { readonly sessionID?: string },
    output: { readonly system: string[] },
  ) => Promise<void>;
  readonly "tool.execute.after": (
    input: ToolInput & { readonly args: Record<string, unknown> },
    output: ToolResult,
  ) => Promise<void>;
  readonly "tool.execute.before": (
    input: ToolInput,
    output: ToolOutput,
  ) => Promise<void>;
}

async function createSandbox(): Promise<Sandbox> {
  const root = await createTemporaryDirectory("opencode-adapter-");
  const home = join(root, "home");
  const project = join(root, "project");
  mkdirSync(join(home, ".config"), { recursive: true });
  mkdirSync(project);
  return { home, project, root };
}

/**
 * Spawns the installer under Bun with every home location redirected into
 * the sandbox, mirroring install_opencode.spec.ts: Vitest workers execute
 * under node, where process.execPath is not bun.
 */
async function runInstaller(args_: readonly string[], sandbox: Sandbox) {
  const bunBinary =
    basename(process.execPath) === "bun" ? process.execPath : "bun";
  const execFileAsync = promisify(execFile);
  return execFileAsync(bunBinary, [scriptPath, ...args_], {
    cwd: sandbox.root,
    env: {
      ...process.env,
      HOME: sandbox.home,
      XDG_CONFIG_HOME: join(sandbox.home, ".config"),
    },
    maxBuffer: 64 * 1024 * 1024,
  });
}

describe("opencode adapter manifest validation", () => {
  let sandbox: Sandbox;
  let adapterPath: string;

  beforeAll(async () => {
    sandbox = await createSandbox();
    await runInstaller(
      [
        "--scope",
        "project",
        "--plugin",
        "coding",
        "--project-root",
        sandbox.project,
      ],
      sandbox,
    );
    const projection = join(realpathSync(sandbox.project), ".opencode");
    adapterPath = join(projection, "plugins", "alvis-marketplace.js");
    expect(existsSync(adapterPath)).toBe(true);
  });

  afterAll(async () => {
    if (sandbox) await removeTemporaryDirectory(sandbox.root);
  });

  async function loadAdapter(): Promise<{
    AlvisMarketplace: (input: {
      client: unknown;
      directory: string;
      worktree?: string;
    }) => Promise<AdapterHooks>;
  }> {
    return import(pathToFileURL(adapterPath).href) as {
      AlvisMarketplace: (input: {
        client: unknown;
        directory: string;
        worktree?: string;
      }) => Promise<AdapterHooks>;
    };
  }

  it("validates a real projection and exposes the OpenCode hooks", async () => {
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({
      client: {},
      directory: sandbox.project,
    });
    for (const name of [
      "config",
      "dispose",
      "event",
      "experimental.chat.system.transform",
      "tool.execute.after",
      "tool.execute.before",
    ] as const) {
      expect(typeof hooks[name]).toBe("function");
    }
  });

  it("should preserve native root variables while enforcing OpenCode question denials", async () => {
    vi.stubEnv("CLAUDE_PLUGIN_ROOT", "/stale-claude-root");
    vi.stubEnv("GROK_PLUGIN_ROOT", "/stale-grok-root");
    vi.stubEnv("PLUGIN_ROOT", "/stale-codex-root");
    const environmentBefore = { ...process.env };
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({ client: {}, directory: sandbox.project });

    await expect(
      hooks["tool.execute.before"](
        { callID: "question-deny", sessionID: "session", tool: "question" },
        {
          args: {
            questions: [
              {
                header: "Choice",
                options: [{ description: "No decision tag.", label: "One" }],
                question: "Choose?",
              },
            ],
          },
        },
      ),
    ).rejects.toThrow(/carries no tag/);
    expect({ ...process.env }).toEqual(environmentBefore);
  });

  it("should reject malformed OpenCode question input before execution", async () => {
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({ client: {}, directory: sandbox.project });
    await expect(hooks["tool.execute.before"](
      { callID: "malformed-question", sessionID: "session", tool: "question" },
      { args: { questions: [] } },
    )).rejects.toThrow(/question/i);
  });

  it("should retain allow advice until the matching result and clear it on idle", async () => {
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({ client: {}, directory: sandbox.project });
    const args = {
      questions: [
        {
          header: "Choice",
          options: [
            { description: "[Recommended] Preferred option.", label: "One" },
          ],
          question: "Choose?",
        },
      ],
    };
    await hooks["tool.execute.before"](
      { callID: "question-allow", sessionID: "session", tool: "question" },
      { args },
    );
    const metadata = { retained: true };
    const result = { metadata, output: "original output", title: "Question" };

    await hooks["tool.execute.after"](
      {
        args,
        callID: "question-allow",
        sessionID: "session",
        tool: "question",
      },
      result,
    );

    expect(result.output).toContain("original output");
    expect(result.output).toContain("directions/questions.md");
    expect(result.metadata).toBe(metadata);

    await hooks["tool.execute.before"](
      { callID: "cleared", sessionID: "session", tool: "question" },
      { args },
    );
    await hooks.event({
      event: { properties: { sessionID: "session" }, type: "session.idle" },
    });
    const cleared = { metadata: {}, output: "unchanged", title: "Question" };
    await hooks["tool.execute.after"](
      { args, callID: "cleared", sessionID: "session", tool: "question" },
      cleared,
    );
    expect(cleared.output).toBe("unchanged");
  });

  it("should enforce every available plan alias", async () => {
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({ client: {}, directory: sandbox.project });

    await expect(
      hooks["tool.execute.before"](
        { callID: "plan", sessionID: "session", tool: "exit_plan_mode" },
        { args: { plan: "# Goal\n\nMissing the other required headings.\n" } },
      ),
    ).rejects.toThrow(/missing headings: Requirements, Boundary, Direction, Context/);
  });

  it("should reject the current disk-backed OpenCode plan before exit", async () => {
    const planDirectory = join(sandbox.project, ".opencode", "plans");
    mkdirSync(planDirectory, { recursive: true });
    writeFileSync(join(planDirectory, "123-current.md"), "# Goal\nIncomplete.\n");
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({
      client: {
        project: { current: async () => ({ data: { vcs: "git" } }) },
        session: { get: async () => ({ data: { slug: "current", time: { created: 123 } } }) },
      },
      directory: sandbox.project,
      worktree: sandbox.project,
    });

    await expect(hooks["tool.execute.before"](
      { callID: "native-plan-invalid", sessionID: "session", tool: "plan_exit" },
      { args: {} },
    )).rejects.toThrow(/missing headings/);
  });

  it("should validate the current plan without replacing native arguments", async () => {
    const planDirectory = join(sandbox.project, ".opencode", "plans");
    mkdirSync(planDirectory, { recursive: true });
    writeFileSync(join(planDirectory, "124-complete.md"),
      "# Goal\nShip.\n## Requirements\nVerify.\n## Boundary\nHooks.\n## Direction\nTest.\n## Context\nCurrent.\n");
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({
      client: {
        project: { current: async () => ({ data: { vcs: "git" } }) },
        session: { get: async () => ({ data: { slug: "complete", time: { created: 124 } } }) },
      },
      directory: sandbox.project,
      worktree: sandbox.project,
    });
    const output = { args: {} };

    await expect(hooks["tool.execute.before"](
      { callID: "native-plan-valid", sessionID: "session", tool: "plan_exit" },
      output,
    )).resolves.toBeUndefined();
    expect(output.args).toEqual({});
  });

  it("should reject a missing current plan instead of reading another session", async () => {
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({
      client: {
        project: { current: async () => ({ data: { vcs: "git" } }) },
        session: { get: async () => ({ data: { slug: "missing", time: { created: 125 } } }) },
      },
      directory: sandbox.project,
      worktree: sandbox.project,
    });

    await expect(hooks["tool.execute.before"](
      { callID: "native-plan-missing", sessionID: "session", tool: "plan_exit" },
      { args: {} },
    )).rejects.toThrow(/plan.*(?:unavailable|read|missing)/i);
  });

  it("should reject traversal in session plan metadata", async () => {
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({
      client: {
        project: { current: async () => ({ data: { vcs: "git" } }) },
        session: { get: async () => ({ data: { slug: "../../outside", time: { created: 126 } } }) },
      },
      directory: sandbox.project,
      worktree: sandbox.project,
    });

    await expect(hooks["tool.execute.before"](
      { callID: "native-plan-traversal", sessionID: "session", tool: "plan_exit" },
      { args: {} },
    )).rejects.toThrow(/(?:invalid|unsafe).*plan|plan.*(?:metadata|invalid|unsafe)/i);
  });

  it("should validate non-VCS plans from OpenCode's XDG data directory", async () => {
    const dataHome = join(sandbox.root, "data");
    vi.stubEnv("XDG_DATA_HOME", dataHome);
    const planDirectory = join(dataHome, "opencode", "plans");
    mkdirSync(planDirectory, { recursive: true });
    writeFileSync(join(planDirectory, "127-global.md"), "# Goal\nIncomplete.\n");
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({
      client: {
        project: { current: async () => ({ data: {} }) },
        session: { get: async () => ({ data: { slug: "global", time: { created: 127 } } }) },
      },
      directory: sandbox.project,
      worktree: sandbox.project,
    });

    await expect(hooks["tool.execute.before"](
      { callID: "native-plan-global", sessionID: "session", tool: "plan_exit" },
      { args: {} },
    )).rejects.toThrow(/missing headings/);
  });

  it("should report session lookup failure before native plan exit", async () => {
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({
      client: {
        project: { current: async () => ({ data: { vcs: "git" } }) },
        session: { get: async () => { throw new Error("service unavailable"); } },
      },
      directory: sandbox.project,
      worktree: sandbox.project,
    });

    await expect(hooks["tool.execute.before"](
      { callID: "native-plan-lookup", sessionID: "session", tool: "plan_exit" },
      { args: {} },
    )).rejects.toThrow(/Plan validation is unavailable/);
  });

  it("should inject approval instructions into an explicit OpenCode prompt", async () => {
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({ client: {}, directory: sandbox.project });
    const output = { message: { id: "msg_approved" }, parts: [{ id: "prt_original", sessionID: "approved-prompt", messageID: "msg_approved", type: "text", text: "Implement the plan." }] };
    await hooks["chat.message"]({ sessionID: "approved-prompt" }, output);
    expect(output.parts).toEqual([
      { id: "prt_original", sessionID: "approved-prompt", messageID: "msg_approved", type: "text", text: "Implement the plan." },
      { id: expect.stringMatching(/^prt_[0-9a-f]{12}[A-Za-z0-9]{14}$/), sessionID: "approved-prompt", messageID: "msg_approved", type: "text", text: expect.stringContaining("directions/approve-plan.md"), synthetic: true },
    ]);
  });

  it("should deliver approval instructions after a successful native plan exit", async () => {
    const directory = join(sandbox.project, ".opencode", "plans");
    mkdirSync(directory, { recursive: true });
    const approvedPlan = "# Goal\nShip.\n## Requirements\nVerify.\n## Boundary\nHooks.\n## Direction\nTest.\n## Context\nCurrent.\n";
    writeFileSync(join(directory, "128-approved.md"), approvedPlan);
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({
      client: {
        project: { current: async () => ({ data: { vcs: "git" } }) },
        session: { get: async () => ({ data: { slug: "approved", time: { created: 128 } } }) },
      },
      directory: sandbox.project,
      worktree: sandbox.project,
    });
    const input = { callID: "approve-native", sessionID: "approved-native", tool: "plan_exit" };
    await hooks["tool.execute.before"](input, { args: {} });
    const result = { metadata: {}, output: "User approved switching to build agent. Wait for further instructions.", title: "Switching to build agent" };
    await hooks["tool.execute.after"]({ ...input, args: {} }, result);
    expect(result.output.startsWith("User approved switching to build agent. Wait for further instructions.")).toBe(true);
    expect(result.output).toContain("save-approved-plan");
    expect(result.output).toContain("opencode-v1:PostToolUse");
    expect(result.output).toContain(join(realpathSync(sandbox.project), ".opencode", "plans", "128-approved.md"));
    expect(result.output).toContain(createHash("sha256").update(approvedPlan).digest("hex"));
  });

  it("should reject approval when the plan changes after native preflight", async () => {
    const directory = join(sandbox.project, ".opencode", "plans");
    mkdirSync(directory, { recursive: true });
    const path = join(directory, "130-changed.md");
    writeFileSync(path, "# Goal\nShip.\n## Requirements\nVerify.\n## Boundary\nHooks.\n## Direction\nTest.\n## Context\nCurrent.\n");
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({
      client: {
        project: { current: async () => ({ data: { vcs: "git" } }) },
        session: { get: async () => ({ data: { slug: "changed", time: { created: 130 } } }) },
      },
      directory: sandbox.project,
      worktree: sandbox.project,
    });
    const input = { callID: "changed-native", sessionID: "changed-native", tool: "plan_exit" };
    await hooks["tool.execute.before"](input, { args: {} });
    writeFileSync(path, "Changed after preflight.");
    const result = { metadata: {}, output: "User approved switching to build agent. Wait for further instructions.", title: "Switching to build agent" };
    await expect(hooks["tool.execute.after"]({ ...input, args: {} }, result)).rejects.toThrow(/changed|revalidate|stale/i);
    expect(result.output).not.toContain("save-approved-plan");
  });

  it("should not fabricate approval context without native preflight", async () => {
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({ client: {}, directory: sandbox.project });
    const result = { metadata: {}, output: "User approved switching to build agent. Wait for further instructions.", title: "Switching to build agent" };
    await hooks["tool.execute.after"]({ callID: "no-preflight", sessionID: "missing", tool: "plan_exit", args: {} }, result);
    expect(result.output).not.toContain("save-approved-plan");
  });

  it("should not deliver approval context after a rejected native exit", async () => {
    const directory = join(sandbox.project, ".opencode", "plans");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "129-rejected.md"), "# Goal\nShip.\n## Requirements\nVerify.\n## Boundary\nHooks.\n## Direction\nTest.\n## Context\nCurrent.\n");
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({
      client: {
        project: { current: async () => ({ data: { vcs: "git" } }) },
        session: { get: async () => ({ data: { slug: "rejected", time: { created: 129 } } }) },
      },
      directory: sandbox.project,
      worktree: sandbox.project,
    });
    const input = { callID: "reject-native", sessionID: "rejected-native", tool: "plan_exit" };
    await hooks["tool.execute.before"](input, { args: {} });
    const result = { metadata: {}, output: "User rejected switching to build agent.", title: "Staying in plan mode" };
    await hooks["tool.execute.after"]({ ...input, args: {} }, result);
    expect(result.output).not.toContain("save-approved-plan");
  });

  it("should enforce the OpenCode task alias with the native dispatch validator", async () => {
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({ client: {}, directory: sandbox.project });

    await expect(
      hooks["tool.execute.before"](
        { callID: "task", sessionID: "session", tool: "task" },
        { args: { name: "InvalidName", prompt: "task" } },
      ),
    ).rejects.toThrow(/must be lowercase kebab/);
  });

  it("should project root, child, and unresolved context by receipt audience", async () => {
    const { AlvisMarketplace } = await loadAdapter();
    const log = async (): Promise<Record<string, never>> => ({});
    const rootHooks = await AlvisMarketplace({
      client: {
        app: { log },
        session: { get: async () => ({ data: { id: "root" } }) },
      },
      directory: sandbox.project,
    });
    const rootOutput: { system: string[] } = { system: [] };
    await rootHooks["experimental.chat.system.transform"](
      { sessionID: "root" },
      rootOutput,
    );
    const rootContext = rootOutput.system.join("\n");
    expect(rootContext).toContain("OpenCode host limitation: Stop hook is advisory");
    expect(rootContext).toContain("tech-lead");

    const childHooks = await AlvisMarketplace({
      client: {
        app: { log },
        session: {
          get: async () => ({ data: { id: "child", parentID: "root" } }),
        },
      },
      directory: sandbox.project,
    });
    const childOutput: { system: string[] } = { system: [] };
    await childHooks["experimental.chat.system.transform"](
      { sessionID: "child" },
      childOutput,
    );
    expect(childOutput.system.join("\n")).toContain("task subagent");

    const unresolvedHooks = await AlvisMarketplace({
      client: {
        app: { log },
        session: { get: async () => ({ error: "missing" }) },
      },
      directory: sandbox.project,
    });
    const unresolvedOutput: { system: string[] } = { system: [] };
    await unresolvedHooks["experimental.chat.system.transform"](
      { sessionID: "missing" },
      unresolvedOutput,
    );
    const unresolvedContext = unresolvedOutput.system.join("\n");
    expect(unresolvedContext).toContain("Alvis OpenCode V1 projection");
    expect(unresolvedContext).not.toContain("Stop hook is advisory");
  });

  it("should deliver main context when the projection has no lead agent", async () => {
    const projection = join(realpathSync(sandbox.project), ".opencode");
    const manifestPath = join(projection, "alvis/manifest.json");
    const contextResource = "alvis/plugins/essential/hooks/MAINAGENT.md";
    const contextPath = join(projection, contextResource);
    const originalManifest = readFileSync(manifestPath, "utf8");
    const originalContext = readFileSync(contextPath, "utf8");
    const manifest = JSON.parse(originalManifest) as {
      file_digests: Record<string, string>;
    };
    const marker = "context-without-a-lead-agent\n";
    delete manifest.file_digests["agents/tech-lead.md"];
    manifest.file_digests[contextResource] = createHash("sha256").update(marker).digest("hex");
    try {
      writeFileSync(contextPath, marker);
      writeFileSync(manifestPath, JSON.stringify(manifest));
      const { AlvisMarketplace } = await loadAdapter();
      const hooks = await AlvisMarketplace({
        client: { session: { get: async () => ({ data: { id: "root-no-lead" } }) } },
        directory: sandbox.project,
      });
      const output: { system: string[] } = { system: [] };

      await hooks["experimental.chat.system.transform"]({ sessionID: "root-no-lead" }, output);

      expect(output.system.join("\n")).toContain(marker.trim());
    } finally {
      writeFileSync(contextPath, originalContext);
      writeFileSync(manifestPath, originalManifest);
    }
  });

  it("should retain commit backup advice and post-rewrite diagnostics after a repository rewrite", async () => {
    // keep backup traversal independent of the installed adapter bundle
    const repository = join(sandbox.root, "rewrite-repository");
    mkdirSync(repository);
    writeFileSync(join(repository, ".gitignore"), ".opencode/\n");
    writeFileSync(join(repository, "tracked.txt"), "tracked\n");
    execFileSync("git", ["init", "--quiet"], { cwd: repository });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: repository,
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: repository,
    });
    execFileSync("git", ["add", ".gitignore", "tracked.txt"], {
      cwd: repository,
    });
    execFileSync("git", ["commit", "--quiet", "-m", "test: initial"], {
      cwd: repository,
    });
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({ client: {}, directory: repository });
    const args = { command: "git rebase --onto main base branch" };
    await hooks["tool.execute.before"](
      { callID: "rewrite", sessionID: "session", tool: "bash" },
      { args },
    );
    const metadata = { exit: 0, retained: true };
    const result = { metadata, output: "command output", title: "Shell" };

    await hooks["tool.execute.after"](
      { args, callID: "rewrite", sessionID: "session", tool: "bash" },
      result,
    );

    expect(result.output).toContain("Auto-backup:");
    expect(result.output).toContain("Integrity Check");
    expect(result.metadata).toBe(metadata);
  }, hookTimeoutMs);

  it("should reject approval delivery after the projected shell context is tampered", async () => {
    const { AlvisMarketplace } = await loadAdapter();
    const directory = join(sandbox.project, ".opencode", "plans");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "131-tamper.md"), "# Goal\nShip.\n## Requirements\nVerify.\n## Boundary\nHooks.\n## Direction\nTest.\n## Context\nCurrent.\n");
    const hooks = await AlvisMarketplace({
      client: {
        project: { current: async () => ({ data: { vcs: "git" } }) },
        session: { get: async () => ({ data: { slug: "tamper", time: { created: 131 } } }) },
      },
      directory: sandbox.project,
      worktree: sandbox.project,
    });
    const input = { callID: "tampered-after", sessionID: "tampered-after", tool: "plan_exit" };
    await hooks["tool.execute.before"](input, { args: {} });
    const contextPath = join(realpathSync(sandbox.project), ".opencode", "alvis", "plugins", "essential", "hooks", "scripts", "context.sh");
    const original = readFileSync(contextPath, "utf8");
    try {
      writeFileSync(contextPath, `${original}\n# tampered test input\n`);
      const output = { message: { id: "msg_approved" }, parts: [{ id: "prt_original", sessionID: "approved-prompt", messageID: "msg_approved", type: "text", text: "Implement the plan." }] };
      await expect(hooks["chat.message"]({ sessionID: "tampered-context" }, output)).rejects.toThrow(/modified|digest|mismatch/i);
      const result = { metadata: {}, output: "User approved switching to build agent. Wait for further instructions.", title: "Switching to build agent" };
      await expect(hooks["tool.execute.after"]({ ...input, args: {} }, result)).rejects.toThrow(/modified|digest|mismatch/i);
    } finally {
      writeFileSync(contextPath, original);
    }
  });

  it("rejects a managed runtime file whose bytes drifted", async () => {
    const contractPath = join(
      realpathSync(sandbox.project),
      ".opencode",
      "alvis",
      "contract.json",
    );
    writeFileSync(contractPath, `${readFileSync(contractPath, "utf8")} \n`);
    const { AlvisMarketplace } = await loadAdapter();
    await expect(
      AlvisMarketplace({ client: {}, directory: sandbox.project }),
    ).rejects.toThrow(/managed runtime file was modified alvis\/contract\.json/);
  });

  it("rejects a manifest that stops managing a runtime file", async () => {
    const manifestPath = join(
      realpathSync(sandbox.project),
      ".opencode",
      "alvis",
      "manifest.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      file_digests: Record<string, string>;
    };
    delete manifest.file_digests["alvis/contract.json"];
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
    const { AlvisMarketplace } = await loadAdapter();
    await expect(
      AlvisMarketplace({ client: {}, directory: sandbox.project }),
    ).rejects.toThrow(/unmanaged runtime file alvis\/contract\.json/);
  });
});
