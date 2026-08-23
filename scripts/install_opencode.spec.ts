import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { main, parseArgs } from "./install_opencode.ts";
import {
  createTemporaryDirectory,
  removeTemporaryDirectory,
  writeFixture,
} from "./test-support.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const scriptPath = resolve(import.meta.dirname, "install_opencode.ts");
const programName = "install_opencode.ts";
const usage = `usage: ${programName} [-h] --scope {user,project} (--plugin NAME | --all)\n${" ".repeat(programName.length + 8)}[--project-root PROJECT_ROOT] [--dry-run]`;
const help = `${usage}\n\nProject this marketplace into an OpenCode V1 config directory.\n\noptions:\n  -h, --help            show this help message and exit\n  --scope {user,project}\n  --plugin NAME\n  --all\n  --project-root PROJECT_ROOT\n  --dry-run\n`;
const spawnTimeout = 20_000;

const execFileAsync = promisify(execFile);

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

interface Sandbox {
  readonly config: string;
  readonly home: string;
  readonly project: string;
  readonly root: string;
  readonly state: string;
}

async function createSandbox(): Promise<Sandbox> {
  const root = await createTemporaryDirectory("opencode-install-");
  const home = join(root, "home");
  const project = join(root, "project");
  const state = join(root, "state");
  mkdirSync(join(home, ".config"), { recursive: true });
  mkdirSync(project);
  mkdirSync(state);
  return { config: join(home, ".config"), home, project, root, state };
}

interface RunResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * Spawns the installer under Bun with every home/state location redirected
 * into the sandbox. runBun from test-support cannot be used because Vitest
 * workers execute under node, where process.execPath is the node binary.
 */
async function runInstaller(
  args_: readonly string[],
  sandbox: Sandbox,
  options: { readonly cwd?: string; readonly scriptPath?: string } = {},
): Promise<RunResult> {
  const bunBinary =
    basename(process.execPath) === "bun" ? process.execPath : "bun";
  try {
    const { stderr, stdout } = await execFileAsync(
      bunBinary,
      [options.scriptPath ?? scriptPath, ...args_],
      {
        cwd: options.cwd ?? sandbox.root,
        env: {
          ...process.env,
          HOME: sandbox.home,
          XDG_CONFIG_HOME: sandbox.config,
          XDG_STATE_HOME: sandbox.state,
        },
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    return { exitCode: 0, stderr, stdout };
  } catch (error) {
    const failure = error as {
      code?: number | string;
      stderr?: string;
      stdout?: string;
    };
    return {
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      stderr: failure.stderr ?? "",
      stdout: failure.stdout ?? "",
    };
  }
}

/** The resolved `.opencode` target the installer records for a sandbox project. */
function targetOf(sandbox: Sandbox): string {
  return `${realpathSync(sandbox.project)}/.opencode`;
}

/** The target-keyed installer state directory for a sandbox. */
function stateKeyDirectory(sandbox: Sandbox): string {
  return join(
    realpathSync(sandbox.state),
    "alvis-opencode-v1",
    sha256(targetOf(sandbox)),
  );
}

/** First essential skill directory that projects, keeping assertions data-driven. */
function firstEssentialSkill(): string {
  const skillsRoot = join(repositoryRoot, "plugins", "essential", "skills");
  const entries = readdirSync(skillsRoot, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  );
  for (const entry of entries) {
    if (entry.isDirectory() && existsSync(join(skillsRoot, entry.name, "SKILL.md"))) {
      return entry.name;
    }
  }
  throw new Error("essential ships no projecting skill");
}

async function installEssential(sandbox: Sandbox): Promise<RunResult> {
  return runInstaller(
    ["--scope", "project", "--project-root", sandbox.project, "--plugin", "essential"],
    sandbox,
  );
}

describe("argument parsing", () => {
  it("should reject a missing scope before other required arguments", () => {
    expect(parseArgs([])).toEqual({
      kind: "error",
      message: "the following arguments are required: --scope",
    });
  });

  it("should defer unrecognized arguments behind required ones", () => {
    expect(parseArgs(["stray"])).toEqual({
      kind: "error",
      message: "the following arguments are required: --scope",
    });
  });

  it("should require one of the mutually exclusive selection flags", () => {
    expect(parseArgs(["--scope", "project"])).toEqual({
      kind: "error",
      message: "one of the arguments --plugin --all is required",
    });
  });

  it("should reject combining --plugin and --all in either order", () => {
    expect(parseArgs(["--scope", "project", "--plugin", "essential", "--all"])).toEqual({
      kind: "error",
      message: "argument --all: not allowed with argument --plugin",
    });
    expect(parseArgs(["--scope", "project", "--all", "--plugin", "essential"])).toEqual({
      kind: "error",
      message: "argument --plugin: not allowed with argument --all",
    });
  });

  it("should reject an out-of-catalog scope choice", () => {
    expect(parseArgs(["--scope", "bad", "--all"])).toEqual({
      kind: "error",
      message: "argument --scope: invalid choice: 'bad' (choose from user, project)",
    });
  });

  it("should require a value after value-taking flags", () => {
    expect(parseArgs(["--scope", "project", "--plugin"])).toEqual({
      kind: "error",
      message: "argument --plugin: expected one argument",
    });
  });

  it("should parse a full project invocation preserving repeats", () => {
    expect(
      parseArgs([
        "--scope",
        "project",
        "--plugin",
        "essential",
        "--plugin",
        "essential",
        "--project-root",
        "/tmp/target",
        "--dry-run",
      ]),
    ).toEqual({
      kind: "arguments",
      value: {
        dryRun: true,
        installAll: false,
        plugins: ["essential", "essential"],
        projectRoot: "/tmp/target",
        scope: "project",
      },
    });
  });

  it("should accept equals-form flags and report help requests", () => {
    expect(parseArgs(["--scope=user", "--all"])).toEqual({
      kind: "arguments",
      value: {
        dryRun: false,
        installAll: true,
        plugins: [],
        projectRoot: undefined,
        scope: "user",
      },
    });
    expect(parseArgs(["--help"]).kind).toBe("help");
    expect(main(["--help"])).toBe(0);
  });
});

describe("command surface", () => {
  it("should print argparse-shaped help on stdout and exit zero", async () => {
    const sandbox = await createSandbox();
    try {
      const result = await runInstaller(["--help"], sandbox);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(help);
      expect(result.stderr).toBe("");
    } finally {
      await removeTemporaryDirectory(sandbox.root);
    }
  });

  it("should print usage plus the error line on stderr and exit two", async () => {
    const sandbox = await createSandbox();
    try {
      const result = await runInstaller([], sandbox);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toBe(
        `${usage}\n${programName}: error: the following arguments are required: --scope\n`,
      );
    } finally {
      await removeTemporaryDirectory(sandbox.root);
    }
  });
});

describe("project-scope installation", () => {
  it("should install essential into a project with receipt, manifest, and renames", async () => {
    const sandbox = await createSandbox();
    try {
      const result = await installEssential(sandbox);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      const summary = JSON.parse(result.stdout) as Record<string, unknown>;
      const target = targetOf(sandbox);
      expect(summary.status).toBe("installed");
      expect(summary.target).toBe(target);
      expect(summary.selected_plugins).toEqual(["essential"]);
      expect(summary.resolved_plugins).toEqual(["essential"]);

      const manifestPath = join(target, "alvis", "manifest.json");
      const manifestBytes = readFileSync(manifestPath);
      const manifest = JSON.parse(manifestBytes.toString("utf8")) as Record<string, unknown>;
      expect(manifest.schema_version).toBe(1);
      expect(manifest.manager).toBe("alvis-opencode-v1");
      expect(manifest.scope).toBe("project");
      expect(manifest.selected_plugins).toEqual(["essential"]);
      expect(manifest.resolved_plugins).toEqual(["essential"]);
      expect(manifest.plugins).toEqual([
        { bundle_path: "alvis/plugins/essential", name: "essential" },
      ]);
      const source = manifest.source as Record<string, unknown>;
      expect(source.marketplace_sha256).toBe(
        sha256(readFileSync(join(repositoryRoot, ".claude-plugin", "marketplace.json"))),
      );

      const managedPaths = manifest.managed_paths as readonly string[];
      expect(summary.managed_file_count).toBe(managedPaths.length);
      for (const fixed of [
        "alvis/contract.json",
        "alvis/manifest.json",
        "plugins/alvis-marketplace.js",
      ]) {
        expect(managedPaths).toContain(fixed);
      }
      const digests = manifest.file_digests as Record<string, string>;
      expect(Object.keys(digests).length + 1).toBe(managedPaths.length);
      expect(digests["plugins/alvis-marketplace.js"]).toBe(
        sha256(readFileSync(join(target, "plugins", "alvis-marketplace.js"))),
      );
      expect(readFileSync(join(target, "alvis", "contract.json"))).toEqual(
        readFileSync(join(repositoryRoot, "scripts", "opencode_contract.json")),
      );

      const projectedSkill = `essential-${firstEssentialSkill()}`;
      const projectedSkillMd = join(target, "skills", projectedSkill, "SKILL.md");
      expect(existsSync(projectedSkillMd)).toBe(true);
      const frontmatter = readFileSync(projectedSkillMd, "utf8");
      expect(frontmatter.split("\n")).toContain(`name: ${projectedSkill}`);
      const commandPath = join(target, "commands", `${projectedSkill}.md`);
      expect(existsSync(commandPath)).toBe(true);
      expect(readFileSync(commandPath, "utf8")).toContain(
        `Load the \`${projectedSkill}\` skill`,
      );
      expect(
        existsSync(join(target, "alvis", "plugins", "essential", "skills", firstEssentialSkill(), "SKILL.md")),
      ).toBe(true);

      const receipt = readJson(join(stateKeyDirectory(sandbox), "ownership.json"));
      expect(receipt.manager).toBe("alvis-opencode-v1");
      expect(receipt.schema_version).toBe(1);
      expect(receipt.target).toBe(target);
      expect(receipt.manifest_sha256).toBe(sha256(manifestBytes));
      expect(existsSync(join(stateKeyDirectory(sandbox), "transaction.json"))).toBe(false);
      expect(existsSync(join(stateKeyDirectory(sandbox), "backup"))).toBe(false);

      const rerun = await installEssential(sandbox);
      expect(rerun.exitCode).toBe(0);
      expect(JSON.parse(rerun.stdout).status).toBe("installed");
    } finally {
      await removeTemporaryDirectory(sandbox.root);
    }
  }, spawnTimeout);

  it("should refuse unknown plugin names with exit one", async () => {
    const sandbox = await createSandbox();
    try {
      const result = await runInstaller(
        ["--scope", "project", "--project-root", sandbox.project, "--plugin", "does-not-exist"],
        sandbox,
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe(`${programName}: error: unknown plugin does-not-exist\n`);
    } finally {
      await removeTemporaryDirectory(sandbox.root);
    }
  }, spawnTimeout);

  it("should refuse desired paths occupied by unmanaged content", async () => {
    const sandbox = await createSandbox();
    try {
      await writeFixture(sandbox.project, ".opencode/alvis/contract.json", "intruder\n");
      const result = await installEssential(sandbox);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("error: unmanaged path collision:");
      expect(existsSync(join(targetOf(sandbox), "alvis", "manifest.json"))).toBe(false);
    } finally {
      await removeTemporaryDirectory(sandbox.root);
    }
  }, spawnTimeout);

  it("should refuse forged or missing ownership receipts on rerun", async () => {
    const sandbox = await createSandbox();
    try {
      expect((await installEssential(sandbox)).exitCode).toBe(0);
      const receiptPath = join(stateKeyDirectory(sandbox), "ownership.json");
      const forged = readJson(receiptPath);
      forged.manifest_sha256 = "0".repeat(64);
      writeFileSync(receiptPath, `${JSON.stringify(forged, null, 2)}\n`);

      const forgedRun = await installEssential(sandbox);
      expect(forgedRun.exitCode).toBe(1);
      expect(forgedRun.stderr).toContain("managed manifest ownership does not match");

      rmSync(receiptPath);
      const missingRun = await installEssential(sandbox);
      expect(missingRun.exitCode).toBe(1);
      expect(missingRun.stderr).toContain(
        "managed manifest has no authenticated ownership record",
      );
    } finally {
      await removeTemporaryDirectory(sandbox.root);
    }
  }, spawnTimeout);

  it("should roll back an interrupted transaction then complete the next install", async () => {
    const sandbox = await createSandbox();
    try {
      const projectedSkill = `essential-${firstEssentialSkill()}`;
      const commandRelative = `commands/${projectedSkill}.md`;
      const partialContent = "partial install artifact\n";
      await writeFixture(sandbox.project, `.opencode/${commandRelative}`, partialContent);
      const stateDirectory = stateKeyDirectory(sandbox);
      mkdirSync(stateDirectory, { recursive: true });
      writeFileSync(
        join(stateDirectory, "transaction.json"),
        `${JSON.stringify(
          {
            desired_file_digests: { [commandRelative]: sha256(partialContent) },
            desired_paths: [commandRelative],
            manager: "alvis-opencode-v1",
            previous_file_digests: {},
            previous_ownership: null,
            previous_paths: [],
            schema_version: 1,
            status: "prepared",
            target: targetOf(sandbox),
          },
          null,
          2,
        )}\n`,
      );

      const recovery = await installEssential(sandbox);
      expect(recovery.exitCode).toBe(0);
      expect(existsSync(join(stateDirectory, "transaction.json"))).toBe(false);
      const commandText = readFileSync(join(targetOf(sandbox), commandRelative), "utf8");
      expect(commandText).not.toBe(partialContent);
      expect(commandText).toContain(`Load the \`${projectedSkill}\` skill`);
      expect(existsSync(join(targetOf(sandbox), "alvis", "manifest.json"))).toBe(true);
    } finally {
      await removeTemporaryDirectory(sandbox.root);
    }
  }, spawnTimeout);

  it("should refuse rollback when a recovery file no longer matches its digest", async () => {
    const sandbox = await createSandbox();
    try {
      const projectedSkill = `essential-${firstEssentialSkill()}`;
      const commandRelative = `commands/${projectedSkill}.md`;
      await writeFixture(sandbox.project, `.opencode/${commandRelative}`, "tampered\n");
      const stateDirectory = stateKeyDirectory(sandbox);
      mkdirSync(stateDirectory, { recursive: true });
      writeFileSync(
        join(stateDirectory, "transaction.json"),
        `${JSON.stringify({
          desired_file_digests: { [commandRelative]: sha256("recorded\n") },
          desired_paths: [commandRelative],
          manager: "alvis-opencode-v1",
          previous_file_digests: {},
          previous_ownership: null,
          previous_paths: [],
          schema_version: 1,
          status: "prepared",
          target: targetOf(sandbox),
        })}\n`,
      );

      const result = await installEssential(sandbox);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("transaction recovery path was modified");
      expect(existsSync(join(stateDirectory, "transaction.json"))).toBe(true);
    } finally {
      await removeTemporaryDirectory(sandbox.root);
    }
  }, spawnTimeout);
});

describe("dry-run", () => {
  it("should validate without touching the target or installer state", async () => {
    const sandbox = await createSandbox();
    try {
      const result = await runInstaller(
        ["--scope", "project", "--project-root", sandbox.project, "--plugin", "essential", "--dry-run"],
        sandbox,
      );
      expect(result.exitCode).toBe(0);
      const summary = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(summary.status).toBe("dry-run");
      expect(summary.target).toBe(targetOf(sandbox));
      expect(existsSync(join(sandbox.project, ".opencode"))).toBe(false);
      expect(readdirSync(sandbox.state)).toEqual([]);
    } finally {
      await removeTemporaryDirectory(sandbox.root);
    }
  }, spawnTimeout);

  it("should refuse to dry-run across an interrupted transaction", async () => {
    const sandbox = await createSandbox();
    try {
      const stateDirectory = stateKeyDirectory(sandbox);
      mkdirSync(stateDirectory, { recursive: true });
      writeFileSync(join(stateDirectory, "transaction.json"), "{}\n");
      const result = await runInstaller(
        ["--scope", "project", "--project-root", sandbox.project, "--plugin", "essential", "--dry-run"],
        sandbox,
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        "an interrupted transaction requires a non-dry-run recovery",
      );
    } finally {
      await removeTemporaryDirectory(sandbox.root);
    }
  }, spawnTimeout);
});

describe("target resolution", () => {
  it("should install user scope beneath XDG_CONFIG_HOME and reject stray roots", async () => {
    const sandbox = await createSandbox();
    try {
      const installed = await runInstaller(["--scope", "user", "--plugin", "essential"], sandbox);
      expect(installed.exitCode).toBe(0);
      expect(JSON.parse(installed.stdout).target).toBe(
        `${realpathSync(sandbox.config)}/opencode`,
      );
      expect(existsSync(join(realpathSync(sandbox.config), "opencode", "alvis", "manifest.json"))).toBe(true);

      const rejected = await runInstaller(
        ["--scope", "user", "--project-root", sandbox.project, "--plugin", "essential"],
        sandbox,
      );
      expect(rejected.exitCode).toBe(1);
      expect(rejected.stderr).toBe(
        `${programName}: error: --project-root is valid only with --scope project\n`,
      );
    } finally {
      await removeTemporaryDirectory(sandbox.root);
    }
  }, spawnTimeout);

  it("should require a git worktree when project scope lacks --project-root", async () => {
    const sandbox = await createSandbox();
    try {
      const result = await runInstaller(["--scope", "project", "--plugin", "essential"], sandbox);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe(
        `${programName}: error: project scope requires a Git worktree or --project-root\n`,
      );
    } finally {
      await removeTemporaryDirectory(sandbox.root);
    }
  }, spawnTimeout);
});

describe("runtime path rewriting", () => {
  const skillProse = [
    "---",
    "name: probe",
    "description: Probe skill for runtime path rewriting coverage.",
    "---",
    "",
    "Run $X_SKILL_DIR/../../scripts/tool.py first.",
    "",
    "Single-level anchor $X_SKILL_DIR/../write stays put.",
    "",
    "Entrypoint anchor `../..`.",
    "",
  ].join("\n");

  let sandbox!: Sandbox;
  let scriptPathInFixture!: string;
  beforeAll(async () => {
    sandbox = await createSandbox();
    // A copied one-plugin marketplace lets the fixtures live inside the
    // installer's ROOT, which the real plugins tree cannot host.
    const repository = join(sandbox.root, "repository");
    await writeFixture(
      join(repository, ".claude-plugin"),
      "marketplace.json",
      `${JSON.stringify({ plugins: [{ name: "fixture", source: "./plugins/fixture" }] })}\n`,
    );
    await writeFixture(
      join(repository, "plugins/fixture/.claude-plugin"),
      "plugin.json",
      `${JSON.stringify({ name: "fixture", dependencies: [] })}\n`,
    );
    await writeFixture(join(repository, "plugins/fixture/scripts"), "tool.py", "#!/bin/sh\n");
    await writeFixture(
      join(repository, "plugins/fixture/skills/probe"),
      "SKILL.md",
      skillProse,
    );
    await writeFixture(
      join(repository, "plugins/fixture/skills/probe"),
      "notes.md",
      "Anchor `../..` and $X_SKILL_DIR/../../scripts/tool.py outside the entrypoint.\n",
    );
    await writeFixture(
      join(repository, "plugins/fixture/skills/probe"),
      "data.json",
      // helper escapes the skill to the plugin's scripts directory; missing
      // resolves to plugins/fixture/fixture/... which never exists, so the
      // rewriter must pass it through untouched.
      `${JSON.stringify({
        helper: "../../scripts/tool.py",
        missing: "../../fixture/scripts/tool.py",
      })}\n`,
    );
    mkdirSync(join(repository, "scripts"), { recursive: true });
    for (const name of ["install_opencode.ts", "opencode_contract.json", "opencode_adapter.js"]) {
      copyFileSync(resolve(import.meta.dirname, name), join(repository, "scripts", name));
    }
    scriptPathInFixture = join(repository, "scripts", "install_opencode.ts");
  });

  afterAll(async () => {
    if (sandbox) await removeTemporaryDirectory(sandbox.root);
  });

  it("installs the fixture plugin once", async () => {
    const installed = await runInstaller(
      ["--scope", "user", "--plugin", "fixture"],
      sandbox,
      { scriptPath: scriptPathInFixture },
    );
    expect(installed.exitCode).toBe(0);
    expect(JSON.parse(installed.stdout).status).toBe("installed");
  }, spawnTimeout);

  it("retargets two-level skill-directory paths into the bundle without gluing tokens", () => {
    const projected = readFileSync(
      join(realpathSync(sandbox.config), "opencode/skills/fixture-probe/SKILL.md"),
      "utf8",
    );
    expect(projected).toContain("$X_SKILL_DIR/../../alvis/plugins/fixture/scripts/tool.py");
    expect(projected).toContain("/plugins/fixture/scripts/");
    expect(projected).not.toContain("fixture../");
  });

  it("leaves single-level references untouched", () => {
    const projected = readFileSync(
      join(realpathSync(sandbox.config), "opencode/skills/fixture-probe/SKILL.md"),
      "utf8",
    );
    expect(projected).toContain("Single-level anchor $X_SKILL_DIR/../write stays put.");
  });

  it("rewrites the entrypoint backtick anchor only in SKILL.md", () => {
    const entrypoint = readFileSync(
      join(realpathSync(sandbox.config), "opencode/skills/fixture-probe/SKILL.md"),
      "utf8",
    );
    expect(entrypoint).toContain("Entrypoint anchor `../../alvis/plugins/fixture`.");
    const sibling = readFileSync(
      join(realpathSync(sandbox.config), "opencode/skills/fixture-probe/notes.md"),
      "utf8",
    );
    expect(sibling).toContain("Anchor `../..` ");
    expect(sibling).toContain(
      "$X_SKILL_DIR/../../alvis/plugins/fixture/scripts/tool.py outside the entrypoint.",
    );
  });

  it("rewrites JSON resource paths that leave the skill", () => {
    const projected = readFileSync(
      join(realpathSync(sandbox.config), "opencode/skills/fixture-probe/data.json"),
      "utf8",
    );
    expect(JSON.parse(projected)).toEqual({
      helper: "../../alvis/plugins/fixture/scripts/tool.py",
      missing: "../../fixture/scripts/tool.py",
    });
  });
});
