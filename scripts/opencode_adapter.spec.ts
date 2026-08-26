import { execFile, execFileSync } from "node:child_process";
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

  it("should retain commit backup advice and post-rewrite diagnostics", async () => {
    writeFileSync(join(sandbox.project, ".gitignore"), ".opencode/\n");
    writeFileSync(join(sandbox.project, "tracked.txt"), "tracked\n");
    execFileSync("git", ["init", "--quiet"], { cwd: sandbox.project });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: sandbox.project,
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: sandbox.project,
    });
    execFileSync("git", ["add", ".gitignore", "tracked.txt"], {
      cwd: sandbox.project,
    });
    execFileSync("git", ["commit", "--quiet", "-m", "test: initial"], {
      cwd: sandbox.project,
    });
    const { AlvisMarketplace } = await loadAdapter();
    const hooks = await AlvisMarketplace({ client: {}, directory: sandbox.project });
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
