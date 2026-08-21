import { execFile } from "node:child_process";
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

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTemporaryDirectory,
  removeTemporaryDirectory,
} from "./test-support.ts";

const scriptPath = resolve(import.meta.dirname, "install_opencode.ts");

interface Sandbox {
  readonly home: string;
  readonly project: string;
  readonly root: string;
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
        "essential",
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

  async function loadAdapter() {
    return import(pathToFileURL(adapterPath).href) as {
      AlvisMarketplace: (input: {
        client: unknown;
        directory: string;
        worktree?: string;
      }) => Promise<Record<string, unknown>>;
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
      "experimental.chat.system.transform",
      "tool.execute.before",
    ]) {
      expect(typeof hooks[name]).toBe("function");
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
