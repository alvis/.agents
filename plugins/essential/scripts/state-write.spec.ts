import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, onTestFinished } from "vitest";

import type { SpawnSyncReturns } from "node:child_process";

interface GlobalWriteHarness {
  root: string;
  state: string;
  work: string;
  token: string;
}

const here = import.meta.dirname;
const leaseScript = resolve(here, "state-lease");
const stateWrite = resolve(here, "state-write");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

class StateWriteHarness {
  readonly root: string;
  readonly workDirectory: string;
  readonly leasePath: string;
  constructor() {
    this.root = mkdtempSync(resolve(tmpdir(), "state-write-"));
    roots.push(this.root);
    this.workDirectory = resolve(this.root, "works/demo");
    this.leasePath = resolve(this.workDirectory, "lease.json");
    mkdirSync(resolve(this.workDirectory, "state"), { recursive: true });
  }
  acquire(...args: readonly string[]): string {
    const completed = spawnSync(
      "/bin/bash",
      [
        leaseScript,
        "acquire",
        "--work-dir",
        this.workDirectory,
        "--capability",
        "pm",
        "--session",
        "s1",
        ...args,
      ],
      { encoding: "utf8" },
    );
    expect(completed.status, completed.stderr).toBe(0);
    return String((JSON.parse(completed.stdout) as { token: string }).token);
  }
  write(
    token: string,
    target: string,
    content = "content\n",
    env: NodeJS.ProcessEnv = process.env,
  ) {
    const completed = spawnSync(
      "/bin/bash",
      [
        stateWrite,
        "--work-dir",
        this.workDirectory,
        "--token",
        token,
        "--target",
        target,
      ],
      { encoding: "utf8", input: content, env },
    );
    return {
      exitCode: completed.status ?? 1,
      payload: (completed.stdout
        ? JSON.parse(completed.stdout)
        : {}) as Record<string, unknown>,
      stderr: completed.stderr,
    };
  }
  // Puts fake commands first on PATH; each maps a name to its bash body.
  withFakeCommands(commands: Record<string, string>): NodeJS.ProcessEnv {
    const bin = resolve(this.root, "bin");
    mkdirSync(bin, { recursive: true });
    for (const [name, body] of Object.entries(commands))
      writeFileSync(resolve(bin, name), `#!/bin/bash\n${body}`, {
        mode: 0o755,
      });
    return { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` };
  }
  expire(): void {
    const record = JSON.parse(readFileSync(this.leasePath, "utf8")) as Record<
      string,
      unknown
    >;
    record.expires_at_epoch = 0;
    writeFileSync(this.leasePath, JSON.stringify(record));
  }
}

describe("lease-guarded state writing", () => {
  it.each(["-h", "--help"])(
    "should emit %s only on stderr without stdin or state changes",
    async (flag) => {
      const harness = new StateWriteHarness();
      const token = harness.acquire();
      writeFileSync(
        resolve(harness.workDirectory, "state.md"),
        "original state\n",
      );
      const statePath = resolve(harness.workDirectory, "state.md");
      const before = {
        entries: readdirSync(harness.root, { recursive: true }).sort(),
        lease: readFileSync(harness.leasePath),
        state: readFileSync(statePath),
      };
      const child = spawn(
        "/bin/bash",
        [
          stateWrite,
          "--work-dir",
          harness.workDirectory,
          "--token",
          token,
          "--target",
          "state.md",
          flag,
        ],
        {
          cwd: harness.root,
          env: { ...process.env, TMPDIR: harness.root },
          stdio: "pipe",
          timeout: 2000,
          killSignal: "SIGKILL",
        },
      );
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.once("exit", () => child.stdin.destroy());
      const result = await new Promise((resolveResult, reject) => {
        child.once("error", reject);
        child.once("close", (status, signal) => {
          resolveResult({ status, signal });
        });
      });

      expect(result).toEqual({ status: 0, signal: null });
      expect(Buffer.concat(stdout).length).toBe(0);
      expect(Buffer.concat(stderr).length).toBeGreaterThan(0);
      expect({
        entries: readdirSync(harness.root, { recursive: true }).sort(),
        lease: readFileSync(harness.leasePath),
        state: readFileSync(statePath),
      }).toEqual(before);
    },
  );

  it("atomically writes content and heartbeats the lease", () => {
    const harness = new StateWriteHarness();
    const token = harness.acquire();
    const before = JSON.parse(readFileSync(harness.leasePath, "utf8")) as {
      acquired_at: string;
      expires_at_epoch: number;
    };
    const result = harness.write(token, "state.md", "fresh state\n");
    expect(result).toMatchObject({
      exitCode: 0,
      payload: { status: "written" },
    });
    expect(
      readFileSync(resolve(harness.workDirectory, "state.md"), "utf8"),
    ).toBe("fresh state\n");
    const after = JSON.parse(readFileSync(harness.leasePath, "utf8")) as {
      acquired_at: string;
      expires_at_epoch: number;
    };
    expect(after.expires_at_epoch).toBeGreaterThanOrEqual(
      before.expires_at_epoch,
    );
    expect(after.acquired_at).toBe(before.acquired_at);
  });

  it("creates a nested target", () => {
    const harness = new StateWriteHarness();
    const token = harness.acquire();
    expect(harness.write(token, "state/journal.md", "line\n").exitCode).toBe(0);
    expect(
      readFileSync(resolve(harness.workDirectory, "state/journal.md"), "utf8"),
    ).toBe("line\n");
  });

  describe("on a filesystem that refuses rename over an existing file", () => {
    // mimics macOS's WebDAV client: renaming to a new name works, over an existing file fails
    const refusingMv =
      'for target; do :; done\nif [ -e "$target" ]; then echo "mv: Invalid argument" >&2; exit 1; fi\nexec /bin/mv "$@"\n';
    const hiddenEntries = (directory: string) =>
      readdirSync(directory).filter((name) => name.startsWith("."));

    it("should fall back to copying and still heartbeat the lease", () => {
      const harness = new StateWriteHarness();
      const token = harness.acquire();
      const lease = JSON.parse(readFileSync(harness.leasePath, "utf8")) as {
        heartbeat_epoch: number;
      };
      writeFileSync(
        harness.leasePath,
        JSON.stringify({ ...lease, heartbeat_epoch: 0 }),
      );
      writeFileSync(resolve(harness.workDirectory, "state.md"), "old state\n");
      const env = harness.withFakeCommands({ mv: refusingMv });

      const result = harness.write(token, "state.md", "new state\n", env);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.payload).toMatchObject({ status: "written" });
      expect(
        readFileSync(resolve(harness.workDirectory, "state.md"), "utf8"),
      ).toBe("new state\n");
      const after = JSON.parse(readFileSync(harness.leasePath, "utf8")) as {
        heartbeat_epoch: number;
      };
      expect(after.heartbeat_epoch).toBeGreaterThan(0);
      expect(hiddenEntries(harness.workDirectory)).toEqual([]);
    });

    it("should restore the previous content when the fallback copy fails partway", () => {
      const harness = new StateWriteHarness();
      const token = harness.acquire();
      writeFileSync(resolve(harness.workDirectory, "state.md"), "old state\n");
      const env = harness.withFakeCommands({
        mv: refusingMv,
        // tears the target when copying the staged state-write content, as a dropped connection would
        cp: 'source="${@: -2:1}" target="${@: -1}"\ncase "$(basename "$source")" in .state-write.*) printf "torn" >"$target"; exit 1 ;; esac\nexec /bin/cp "$@"\n',
      });

      const result = harness.write(token, "state.md", "new state\n", env);

      expect(result.exitCode).not.toBe(0);
      expect(
        readFileSync(resolve(harness.workDirectory, "state.md"), "utf8"),
      ).toBe("old state\n");
      expect(hiddenEntries(harness.workDirectory)).toEqual([]);
    });
  });

  it("refuses free, expired, and foreign leases", () => {
    const free = new StateWriteHarness();
    expect(free.write("anything", "state.md")).toMatchObject({
      exitCode: 4,
      payload: { status: "lease_free" },
    });
    expect(existsSync(resolve(free.workDirectory, "state.md"))).toBe(false);

    const expired = new StateWriteHarness();
    const token = expired.acquire();
    expired.expire();
    expect(expired.write(token, "state.md")).toMatchObject({
      exitCode: 4,
      payload: { status: "lease_expired" },
    });

    const foreign = new StateWriteHarness();
    foreign.acquire();
    expect(foreign.write("deadbeef", "state.md")).toMatchObject({
      exitCode: 5,
      payload: { status: "lease_foreign" },
    });
  });

  it.each(["../escape.md", "/etc/escape.md", "state/../../up.md"])(
    "refuses unsafe target %s",
    (target) => {
      const harness = new StateWriteHarness();
      const token = harness.acquire();
      expect(harness.write(token, target)).toMatchObject({
        exitCode: 2,
        payload: { status: "invalid" },
      });
    },
  );

  it("refuses a symlink target without touching its referent", () => {
    const harness = new StateWriteHarness();
    const token = harness.acquire();
    const victim = resolve(harness.root, "victim.md");
    writeFileSync(victim, "original");
    symlinkSync(victim, resolve(harness.workDirectory, "state.md"));
    expect(harness.write(token, "state.md")).toMatchObject({
      exitCode: 2,
      payload: { status: "invalid" },
    });
    expect(readFileSync(victim, "utf8")).toBe("original");
  });

  it("leaves no temporary files on success or refusal", () => {
    const harness = new StateWriteHarness();
    const token = harness.acquire();
    harness.write(token, "state.md");
    harness.write("wrong", "state.md");
    expect(
      readdirSync(harness.workDirectory).filter((name) =>
        name.startsWith(".state-write."),
      ),
    ).toEqual([]);
  });
});

describe("cmd:state-write global targets", () => {
  it.each([
    "overview.md",
    "journals.md",
    "journals/essential/2026-09-30-demo.md",
    "backlogs.md",
    "backlogs/backlog-12-doctor-fix-text.md",
  ])("should write allowlisted %s under the canonical state root", (target) => {
    const harness = globalHarness();
    const result = writeGlobal(harness, target);
    expect(result.status, result.stdout || result.stderr).toBe(0);
    expect(readFileSync(resolve(harness.state, target), "utf8")).toBe(
      "global content\n",
    );
    expect(existsSync(resolve(harness.work, target))).toBe(false);
  });

  it.each([
    "../escape.md",
    "/tmp/escape.md",
    "journals/../overview.md",
    "journals/web/2026-09-30-foreign.md",
    "journals/web/2026-02-30-demo.md",
    "journals/Web/2026-09-30-demo.md",
    "works/foreign/state.md",
    "environment.md",
    "journals/web/nested/2026-09-30-demo.md",
    "backlogs/backlog-0-zero.md",
    "backlogs/backlog-07-padded.md",
    "backlogs/backlog-3.md",
    "backlogs/backlog-3-Upper.md",
    "backlogs/nested/backlog-3-demo.md",
    "backlogs/../overview.md",
  ])("should refuse unsafe or unowned global target %s", (target) => {
    const harness = globalHarness();
    const before = readdirSync(harness.state, { recursive: true }).sort();
    expect(writeGlobal(harness, target).status).not.toBe(0);
    expect(readdirSync(harness.state, { recursive: true }).sort()).toEqual(
      before,
    );
  });

  it("should refuse a backlog number already held by another item", () => {
    const harness = globalHarness();
    expect(writeGlobal(harness, "backlogs/backlog-4-first.md").status).toBe(0);
    expect(writeGlobal(harness, "backlogs/backlog-4-first.md").status).toBe(0);
    expect(writeGlobal(harness, "backlogs/backlog-4-second.md").status).not.toBe(0);
    expect(writeGlobal(harness, "backlogs/backlog-40-other.md").status).toBe(0);
    expect(existsSync(resolve(harness.state, "backlogs/backlog-4-second.md"))).toBe(false);
  });

  it("should refuse simultaneous work and state target arguments", () => {
    const harness = globalHarness();
    expect(
      writeGlobal(harness, "overview.md", "--target", "state.md").status,
    ).not.toBe(0);
    expect(existsSync(resolve(harness.state, "overview.md"))).toBe(false);
    expect(existsSync(resolve(harness.work, "state.md"))).toBe(false);
  });

  it.each(["missing", "expired", "foreign"])(
    "should preserve global content with a %s lease",
    (kind) => {
      const harness = globalHarness();
      const path = resolve(harness.work, "lease.json");
      if (kind === "missing") rmSync(path);
      if (kind === "expired")
        writeFileSync(
          path,
          JSON.stringify({
            ...JSON.parse(readFileSync(path, "utf8")),
            expires_at_epoch: 0,
          }),
        );
      writeFileSync(resolve(harness.state, "overview.md"), "original\n");
      expect(
        writeGlobal(
          harness,
          "overview.md",
          ...(kind === "foreign" ? ["--token", "wrong"] : []),
        ).status,
      ).not.toBe(0);
      expect(readFileSync(resolve(harness.state, "overview.md"), "utf8")).toBe(
        "original\n",
      );
    },
  );

  it.each(["target", "parent", "directory"])(
    "should refuse a symlink or nonregular global %s",
    (kind) => {
      const harness = globalHarness();
      const victim = resolve(harness.root, "victim");
      mkdirSync(victim);
      writeFileSync(resolve(victim, "overview.md"), "untouched\n");
      if (kind === "target")
        symlinkSync(
          resolve(victim, "overview.md"),
          resolve(harness.state, "overview.md"),
        );
      if (kind === "parent")
        symlinkSync(victim, resolve(harness.state, "journals"));
      if (kind === "directory")
        mkdirSync(resolve(harness.state, "overview.md"));
      expect(
        writeGlobal(
          harness,
          kind === "parent" ? "journals/web/2026-09-30-demo.md" : "overview.md",
        ).status,
      ).not.toBe(0);
      expect(readdirSync(victim)).toEqual(["overview.md"]);
      expect(readFileSync(resolve(victim, "overview.md"), "utf8")).toBe(
        "untouched\n",
      );
    },
  );

  it("should refuse a work directory outside a works folder", () => {
    const harness = new StateWriteHarness();
    const stray = resolve(harness.root, "stray/demo");
    mkdirSync(stray, { recursive: true });
    const acquired = spawnSync(
      "/bin/bash",
      [leaseScript, "acquire", "--work-dir", stray, "--capability", "pm", "--session", "stray"],
      { encoding: "utf8" },
    );
    expect(acquired.status, acquired.stderr).toBe(0);
    const result = spawnSync(
      "/bin/bash",
      [
        stateWrite,
        "--work-dir",
        stray,
        "--token",
        (JSON.parse(acquired.stdout) as { token: string }).token,
        "--state-target",
        "overview.md",
      ],
      { encoding: "utf8", input: "bad\n" },
    );
    expect(result.status).not.toBe(0);
    expect(existsSync(resolve(harness.root, "stray/overview.md"))).toBe(false);
  });
});

function globalHarness(): GlobalWriteHarness {
  const root = mkdtempSync(resolve(tmpdir(), "state-global-write-"));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const state = resolve(root, "states/github.com/test/repo");
  const work = resolve(state, "works/demo");
  mkdirSync(work, { recursive: true });
  const acquired = spawnSync(
    "/bin/bash",
    [
      leaseScript,
      "acquire",
      "--work-dir",
      work,
      "--capability",
      "pm",
      "--session",
      "global-test",
    ],
    { encoding: "utf8" },
  );
  expect(acquired.status, acquired.stderr).toBe(0);
  return {
    root,
    state,
    work,
    token: (JSON.parse(acquired.stdout) as { token: string }).token,
  };
}

function writeGlobal(
  harness: GlobalWriteHarness,
  target: string,
  ...args: string[]
): SpawnSyncReturns<string> {
  return spawnSync(
    "/bin/bash",
    [
      stateWrite,
      "--work-dir",
      harness.work,
      "--token",
      harness.token,
      "--state-target",
      target,
      ...args,
    ],
    { encoding: "utf8", input: "global content\n" },
  );
}
