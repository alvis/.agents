import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { HARNESS_ROOT_VARIABLES } from "../../../scripts/harness_contract.ts";
import {
  createTemporaryDirectory,
  removeTemporaryDirectory,
} from "../../../scripts/test-support.ts";

import type { SpawnSyncReturns } from "node:child_process";
import type { TestContext } from "vitest";

interface Receipt {
  generation: number;
  checkpoint: {
    generation: number;
    files: Record<string, string>;
    overview_row_sha256: string;
  };
}

interface CheckpointHarnessParams {
  root: string;
  installed?: string;
}

const plugin = resolve(import.meta.dirname, "..");
const event =
  "2026-09-12T00:00:00Z | status | FIX-VAL | pending → done | verified\n";

class CheckpointHarness {
  readonly #root: string;
  readonly #installed: string;
  readonly work: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly token: string;
  readonly session = "runtime/session";

  constructor({ root, installed = plugin }: CheckpointHarnessParams) {
    this.#root = root;
    this.#installed = installed;
    this.work = join(root, ".state/works/demo");
    mkdirSync(join(this.work, "state"), { recursive: true });
    mkdirSync(join(root, "tmp"));
    this.environment = { ...process.env, TMPDIR: join(root, "tmp") };
    for (const variable of HARNESS_ROOT_VARIABLES)
      delete this.environment[variable];
    this.environment.PLUGIN_ROOT = installed;
    expect(this.run("git", ["init", "--quiet"]).status).toBe(0);
    writeFileSync(join(root, ".gitignore"), ".state/\n");
    writeFileSync(join(this.work, "state/journal.md"), "# Journal\n");
    writeFileSync(
      join(this.work, "state.md"),
      "# State\n\nState revision: 1\n",
    );
    this.writeOverview("demo");
    const lease = this.run(join(installed, "scripts/state-lease"), [
      "acquire",
      "--work-dir",
      this.work,
      "--capability",
      "pm",
      "--session",
      "owner",
    ]);
    expect(lease.status, lease.stderr).toBe(0);
    this.token = (JSON.parse(lease.stdout) as { token: string }).token;
  }

  checkpoint(action: string, ...args: string[]): SpawnSyncReturns<string> {
    return this.run(join(this.#installed, "scripts/state-checkpoint.ts"), [
      action,
      "--work-dir",
      this.work,
      "--token",
      this.token,
      "--session",
      this.session,
      ...args,
    ]);
  }

  write(target: string, content: string, ...args: string[]): void {
    const result = this.run(
      join(this.#installed, "scripts/state-write"),
      [
        "--work-dir",
        this.work,
        "--token",
        this.token,
        "--target",
        target,
        ...args,
      ],
      content,
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
  }

  hook(
    eventName: "Stop" | "UserPromptSubmit",
    fields: Record<string, unknown> = {},
  ): SpawnSyncReturns<string> {
    const hooks = JSON.parse(
      readFileSync(join(this.#installed, "hooks/hooks.json"), "utf8"),
    ) as {
      hooks: Record<string, { hooks: { command: string }[] }[]>;
    };
    const command = hooks.hooks[eventName]
      .flatMap((entry) => entry.hooks)
      .find((entry) =>
        entry.command.includes(
          eventName === "Stop" ? "stop-first" : "state-turn",
        ),
      )!.command;
    return this.run(
      "/bin/sh",
      ["-c", command],
      JSON.stringify({
        hook_event_name: eventName,
        session_id: this.session,
        cwd: this.#root,
        ...fields,
      }),
    );
  }

  track(): void {
    const result = this.checkpoint("track");
    expect(result.status, result.stderr).toBe(0);
  }

  dirty(): number {
    const result = this.checkpoint(
      "dirty",
      "--reason",
      "verified material work",
    );
    expect(result.status, result.stderr).toBe(0);
    return (JSON.parse(result.stdout) as { generation: number }).generation;
  }

  readReceipt(): Receipt {
    const key = createHash("sha256").update(this.session).digest("hex");
    return JSON.parse(
      readFileSync(join(this.work, "state/checkpoints", `${key}.json`), "utf8"),
    ) as Receipt;
  }

  writeOverview(id: string, before = ""): void {
    writeFileSync(
      join(this.#root, ".state/overview.md"),
      `# Overview\n\n${before}\n## Streams\n\n| Work ID | Phase |\n| --- | --- |\n| ${id} | working |\n`,
    );
  }

  run(command: string, args: string[], input = ""): SpawnSyncReturns<string> {
    return spawnSync(command, args, {
      cwd: this.#root,
      env: this.environment,
      encoding: "utf8",
      input,
    });
  }
}

describe("cmd:state-checkpoint", () => {
  for (const flag of ["-h", "--help"]) {
    for (const action of ["", "stop"]) {
      it(`should handle ${flag} after '${action}' without stdin or state changes`, async (context) => {
        const root = realpathSync(
          await createTemporaryDirectory("checkpoint-help-"),
        );
        context.onTestFinished(() => removeTemporaryDirectory(root));
        const work = join(root, ".state/works/demo");
        mkdirSync(work, { recursive: true });
        writeFileSync(join(work, "lease.json"), "{}");
        writeFileSync(join(work, "state.md"), "original state\n");
        const before = snapshotHelpDirectory(root);
        const child = spawn(
          join(plugin, "scripts/state-checkpoint.ts"),
          [
            ...(action ? [action] : []),
            flag,
            "--work-dir",
            work,
          ],
          {
            cwd: root,
            env: { ...process.env, TMPDIR: root },
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
        expect(snapshotHelpDirectory(root)).toEqual(before);
      });
    }
  }

  for (const variable of HARNESS_ROOT_VARIABLES) {
    it(`should request one repair per turn under isolated ${variable} roots containing spaces`, async (context) => {
      const temporary = await createTemporaryDirectory("installed plugin-");
      context.onTestFinished(() => removeTemporaryDirectory(temporary));
      const installed = join(temporary, "with space", "essential");
      cpSync(plugin, installed, { recursive: true });
      const harness = await createHarness(context, installed);
      for (const name of HARNESS_ROOT_VARIABLES)
        delete harness.environment[name];
      harness.environment[variable] = installed;
      harness.track();
      expect(harness.hook("Stop")).toMatchObject({ status: 0, stdout: "" });
      harness.dirty();

      expect(
        harness.hook("Stop", { turn_id: "first", stop_hook_active: true }),
      ).toMatchObject({ status: 0, stdout: "" });
      const first = harness.hook("Stop", { turn_id: "first" });
      expect(first.status, first.stderr).toBe(0);
      expect(JSON.parse(first.stdout)).toMatchObject({ decision: "block" });
      harness.write("state.md", "# Repair in progress\n");
      expect(harness.hook("Stop", { turn_id: "first" })).toMatchObject({
        status: 0,
        stdout: "",
      });
      expect(
        JSON.parse(harness.hook("Stop", { turn_id: "second" }).stdout),
      ).toMatchObject({ decision: "block" });

      if (variable !== "CLAUDE_PLUGIN_ROOT") {
        harness.environment.CLAUDE_PLUGIN_ROOT = join(
          temporary,
          "unusable alias",
        );
        expect(
          JSON.parse(harness.hook("Stop", { turn_id: "native-wins" }).stdout),
        ).toMatchObject({ decision: "block" });
      }
    });
  }

  it("should use prompt nonces when Stop has no turn ID", async (context) => {
    const harness = await createHarness(context);
    harness.track();
    harness.dirty();
    expect(harness.hook("UserPromptSubmit")).toMatchObject({ status: 0 });

    expect(JSON.parse(harness.hook("Stop").stdout)).toMatchObject({
      decision: "block",
    });
    expect(harness.hook("Stop")).toMatchObject({ status: 0, stdout: "" });
    expect(harness.hook("UserPromptSubmit")).toMatchObject({ status: 0 });
    expect(JSON.parse(harness.hook("Stop").stdout)).toMatchObject({
      decision: "block",
    });
  });

  it("should preserve one repair per pending episode without any turn signal and isolate exact sessions", async (context) => {
    const harness = await createHarness(context);
    harness.track();
    harness.dirty();

    expect(
      harness.hook("Stop", { session_id: "runtime-session" }),
    ).toMatchObject({ status: 0, stdout: "" });
    expect(JSON.parse(harness.hook("Stop").stdout)).toMatchObject({
      decision: "block",
    });
    harness.write("state.md", "# Repair started\n");
    expect(harness.hook("Stop")).toMatchObject({ status: 0, stdout: "" });
    harness.write("state/journal.md", `# Journal\n${event}`);
    expect(harness.checkpoint("complete", "--generation", "3")).toMatchObject({
      status: 0,
    });
    expect(harness.hook("Stop")).toMatchObject({ status: 0, stdout: "" });
    harness.dirty();
    expect(JSON.parse(harness.hook("Stop").stdout)).toMatchObject({
      decision: "block",
    });
  });

  it("should require persisted journal, task table, and overview before acknowledgement", async (context) => {
    const harness = await createHarness(context);
    harness.track();
    const generation = harness.dirty();
    expect(
      harness.checkpoint("complete", "--generation", String(generation)).status,
    ).not.toBe(0);
    harness.write("state/journal.md", `# Journal\n${event}`);
    unlinkSync(join(harness.work, "state.md"));
    expect(harness.checkpoint("complete", "--generation", "2").status).not.toBe(
      0,
    );
    harness.write("state.md", "# Reconciled task table\n");
    harness.writeOverview("another-stream");

    expect(harness.checkpoint("complete", "--generation", "3").status).not.toBe(
      0,
    );
    expect(harness.readReceipt().checkpoint.generation).toBe(0);
    harness.writeOverview("demo");
    expect(harness.checkpoint("complete", "--generation", "3")).toMatchObject({
      status: 0,
    });
    expect(harness.readReceipt().checkpoint.files["state.md"]).toBe(
      createHash("sha256").update("# Reconciled task table\n").digest("hex"),
    );
  });

  it("should reject malformed and outdated generation acknowledgements without clearing pending work", async (context) => {
    const harness = await createHarness(context);
    harness.track();
    harness.dirty();
    harness.write("state/journal.md", `# Journal\n${event}`);

    for (const generation of ["-1", "1.5", "1"]) {
      expect(
        harness.checkpoint("complete", "--generation", generation).status,
      ).not.toBe(0);
    }
    expect(harness.readReceipt()).toMatchObject({
      generation: 2,
      checkpoint: { generation: 0 },
    });
    expect(JSON.parse(harness.hook("Stop").stdout)).toMatchObject({
      decision: "block",
    });
  });

  it("should reject a foreign lease token without altering the pending generation", async (context) => {
    const harness = await createHarness(context);
    harness.track();
    harness.dirty();

    const result = harness.run(join(plugin, "scripts/state-checkpoint.ts"), [
      "dirty",
      "--work-dir",
      harness.work,
      "--token",
      "foreign",
      "--session",
      harness.session,
      "--reason",
      "unauthorized",
    ]);

    expect(result.status).not.toBe(0);
    expect(harness.readReceipt()).toMatchObject({
      generation: 1,
      checkpoint: { generation: 0 },
    });
  });

  it("should ignore unregistered, unchanged, artifact, and failed writes while recording actual canonical changes", async (context) => {
    const harness = await createHarness(context);
    harness.write("state.md", "# Unregistered state\n");
    expect(harness.hook("Stop")).toMatchObject({ status: 0, stdout: "" });
    harness.track();
    harness.write("state.md", "# Unregistered state\n");
    harness.write("artifacts/result.txt", "raw evidence\n");
    const failed = harness.run(
      join(plugin, "scripts/state-write"),
      [
        "--work-dir",
        harness.work,
        "--token",
        "foreign",
        "--target",
        "state.md",
      ],
      "must not publish\n",
    );
    expect(failed.status).not.toBe(0);
    expect(harness.readReceipt().generation).toBe(0);
    expect(harness.hook("Stop")).toMatchObject({ status: 0, stdout: "" });

    harness.write("state.md", "# Actual change\n");

    expect(harness.readReceipt().generation).toBe(1);
    expect(JSON.parse(harness.hook("Stop").stdout)).toMatchObject({
      decision: "block",
    });
  });

  it("should acknowledge backticked Work IDs only from Streams despite an Awaiting you occurrence", async (context) => {
    const harness = await createHarness(context);
    harness.writeOverview(
      "`demo`",
      "## Awaiting you\n\n| Work ID | Question |\n| --- | --- |\n| demo | Approve? |\n",
    );
    harness.track();
    const generation = harness.dirty();
    harness.write("state/journal.md", `# Journal\n${event}`);

    const result = harness.checkpoint(
      "complete",
      "--generation",
      String(generation + 1),
    );

    expect(result.status, result.stderr).toBe(0);
    expect(harness.readReceipt().checkpoint.overview_row_sha256).toBe(
      createHash("sha256").update("| `demo` | working |").digest("hex"),
    );
    expect(harness.hook("Stop")).toMatchObject({ status: 0, stdout: "" });
  });

  it("should checkpoint appended current journal segments while the index is unchanged", async (context) => {
    const harness = await createHarness(context);
    const index = "# Journal\n\nCurrent: [001-journal.md](001-journal.md)\n";
    harness.write("state/journal.md", index);
    harness.write("state/001-journal.md", "# Events\n");
    harness.track();
    harness.write("state/001-journal.md", `# Events\n${event}`);

    const result = harness.checkpoint("complete", "--generation", "1");

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(harness.work, "state/journal.md"), "utf8")).toBe(
      index,
    );
    expect(harness.readReceipt().checkpoint.files["state/001-journal.md"]).toBe(
      createHash("sha256").update(`# Events\n${event}`).digest("hex"),
    );
  });

  it("should acknowledge a first journal write and subsequent rollover to a new segment", async (context) => {
    const harness = await createHarness(context);
    harness.track();
    harness.write("state/journal.md", `# Journal\n${event}`);
    expect(harness.checkpoint("complete", "--generation", "1")).toMatchObject({
      status: 0,
    });
    harness.dirty();
    harness.write("state/001-journal.md", `# Continued events\n${event}`);

    const result = harness.checkpoint("complete", "--generation", "3");

    expect(result.status, result.stderr).toBe(0);
    expect(harness.readReceipt().checkpoint.files["state/001-journal.md"]).toBe(
      createHash("sha256").update(`# Continued events\n${event}`).digest("hex"),
    );
    expect(harness.hook("Stop")).toMatchObject({ status: 0, stdout: "" });
  });

  it("should preserve a state-write caller's custom TTL across nested checkpoint writes", async (context) => {
    const harness = await createHarness(context);
    harness.track();
    // A minute differs from the default half hour; bound expiry by the actual call.
    const ttl = 60;
    const before = Math.floor(Date.now() / 1000);

    harness.write("state.md", "# Revised state\n", "--ttl", String(ttl));

    const after = Math.floor(Date.now() / 1000);
    const lease = JSON.parse(
      readFileSync(join(harness.work, "lease.json"), "utf8"),
    ) as { expires_at_epoch: number };
    expect(lease.expires_at_epoch).toBeGreaterThanOrEqual(before + ttl);
    expect(lease.expires_at_epoch).toBeLessThanOrEqual(after + ttl);
    expect(harness.readReceipt().generation).toBe(1);
  });
});

async function createHarness(
  context: TestContext,
  installed = plugin,
): Promise<CheckpointHarness> {
  const root = realpathSync(
    await createTemporaryDirectory("checkpoint with space-"),
  );
  context.onTestFinished(() => removeTemporaryDirectory(root));
  return new CheckpointHarness({ root, installed });
}

function snapshotHelpDirectory(root: string): unknown[] {
  return readdirSync(root, { recursive: true })
    .sort()
    .map((name) => {
      const path = join(root, name);
      const stat = lstatSync(path);
      return [
        name,
        stat.mode,
        stat.mtimeMs,
        stat.isFile() ? readFileSync(path) : null,
      ];
    });
}
