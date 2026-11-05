import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { main } from "./cli.ts";
import {
  fixture,
  removeDirectory,
  temporaryDirectory,
} from "../../test-support.ts";

import type { PageData } from "../types.ts";

/** the moment every case below is read at. */
const NOW = new Date("2026-08-29T12:00:00Z");

/** the tree each case builds its fixtures under. */
let root: string;

/** everything written to stderr while the command ran. */
let said: string[];

/** the console the suite would otherwise print to. */
let complain: typeof console.error;

beforeEach(async () => {
  root = await temporaryDirectory();
  said = [];
  complain = console.error;
  console.error = (...parts: unknown[]) => {
    said.push(parts.join(" "));
  };
});

afterEach(async () => {
  console.error = complain;
  await removeDirectory(root);
});

/**
 * writes one workstream's state file below the tree
 * @param at where to write it, relative to the tree
 * @param phase the lifecycle phase it reports
 * @returns nothing
 */
async function stream(at: string, phase: string): Promise<void> {
  await fixture(
    root,
    `${at}/state.md`,
    `# Work state\n\n- Phase: \`${phase}\`\n- Updated: \`2026-08-29T09:00:00Z\`\n`,
  );
}

describe("fn:main", () => {
  it("should write page data an ordinary render can read", async () => {
    await stream("state/works/alpha", "working");
    const out = join(root, "boards", "state.json");

    expect(await main([join(root, "state"), "-o", out], NOW)).toBe(0);

    const data = JSON.parse(await readFile(out, "utf8")) as PageData;
    expect(data.kind).toBe("project-state");
    expect(data.masthead.meta).toContainEqual({
      label: "Read at",
      value: "2026-08-29 12:00Z",
    });
  });

  it("should say what it read and what it set aside", async () => {
    await stream("state/works/alpha", "working");
    await fixture(root, "state/works/hollow/notes.md", "nothing\n");

    await main([join(root, "state"), "-o", join(root, "out.json")], NOW);

    expect(said).toStrictEqual([
      "state/cli.ts: read 1 live stream, set aside 1",
    ]);
  });

  it("should refuse a run with no output path, and print how to give one", async () => {
    expect(await main([join(root, "state")], NOW)).toBe(2);
    expect(said.join("\n")).toBe(
      "usage: bun scripts/render-page/state/cli.ts <.state> -o <board.json> [--kanban [--stream <work-id>] [--session <id>]]\n" +
        "state/cli.ts: error: missing the -o <board.json> flag",
    );
  });

  it("should refuse an output flag that swallowed the next flag", async () => {
    expect(await main([join(root, "state"), "-o"], NOW)).toBe(2);
    expect(said.join("\n")).toContain(
      'state/cli.ts: error: -o needs an output path, received ""',
    );
  });

  it("should refuse more than one tree, saying how many it was given", async () => {
    expect(await main(["one", "two", "-o", join(root, "out.json")], NOW)).toBe(2);
    expect(said.join("\n")).toContain(
      "state/cli.ts: error: expected exactly one .state directory, received 2",
    );
  });

  it("should refuse a directory that is not a state tree, naming what it wanted", async () => {
    expect(await main([root, "-o", join(root, "out.json")], NOW)).toBe(1);
    expect(said.join("\n")).toBe(
      `state/cli.ts: error: no workstreams to read: ${join(root, "works")} is not a directory, so this is not a .state tree`,
    );
  });
});

describe("fn:main --kanban", () => {
  /** a lease the session "me" holds on alpha, running past the read time. */
  const LEASE = JSON.stringify({
    owner_session: "me",
    expires_at_epoch: NOW.getTime() / 1000 + 600,
  });

  /**
   * runs the command and reads back the board it wrote
   * @param flags the flags after the tree
   * @param env the environment it runs with
   * @returns the exit code and the board's title
   */
  async function run(
    flags: string[],
    env: Record<string, string | undefined> = {},
  ): Promise<[number, string]> {
    const out = join(root, "status.json");
    const code = await main([join(root, "state"), ...flags, "-o", out], NOW, env);
    const data = code
      ? undefined
      : (JSON.parse(await readFile(out, "utf8")) as PageData);

    return [code, data?.title ?? ""];
  }

  it("should draw every stream when no lease names this session", async () => {
    await stream("state/works/alpha", "working");
    await fixture(root, "state/works/alpha/lease.json", LEASE);

    expect(await run(["--kanban", "--session", "someone-else"])).toEqual([
      0,
      "Status",
    ]);
  });

  it("should draw the stream whose lease names this session", async () => {
    await stream("state/works/alpha", "working");
    await stream("state/works/beta", "working");
    await fixture(root, "state/works/alpha/lease.json", LEASE);

    expect(await run(["--kanban", "--session", "me"])).toEqual([
      0,
      "Status: alpha",
    ]);
  });

  it("should look for the session in the environment when none is given", async () => {
    await stream("state/works/alpha", "working");
    await fixture(root, "state/works/alpha/lease.json", LEASE);

    expect(await run(["--kanban"], { CLAUDE_SESSION_ID: "me" })).toEqual([
      0,
      "Status: alpha",
    ]);
  });

  it("should refuse a named stream that is not live", async () => {
    await stream("state/works/alpha", "working");

    expect((await run(["--kanban", "--stream", "gamma"]))[0]).toBe(1);
  });

  it("should refuse a stream or session flag without the kanban flag", async () => {
    await stream("state/works/alpha", "working");

    expect((await run(["--stream", "alpha"]))[0]).toBe(2);
    expect((await run(["--session", "me"]))[0]).toBe(2);
  });

  it("should refuse a stream flag that swallowed the next flag", async () => {
    expect((await run(["--kanban", "--stream"]))[0]).toBe(2);
  });
});
