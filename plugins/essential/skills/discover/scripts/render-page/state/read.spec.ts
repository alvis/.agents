import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readTree } from "./read.ts";
import {
  fixture,
  removeDirectory,
  temporaryDirectory,
} from "../../test-support.ts";

/** the moment every case below is read at. */
const NOW = new Date("2026-08-29T12:00:00Z");

/** the tree each case builds its fixtures under. */
let root: string;

/**
 * writes one workstream's state file
 * @param at where to write it, relative to the tree
 * @param phase the lifecycle phase it reports
 * @param updated when it says it was last written
 * @returns nothing
 */
async function stream(
  at: string,
  phase: string,
  updated = "2026-08-29T09:00:00Z",
): Promise<void> {
  await fixture(
    root,
    `${at}/state.md`,
    `# Work state\n\n- Phase: \`${phase}\`\n- Updated: \`${updated}\`\n`,
  );
}

beforeEach(async () => {
  root = await temporaryDirectory();
});

afterEach(async () => {
  await removeDirectory(root);
});

describe("fn:readTree", () => {
  it("should read every live workstream, in a fixed order", async () => {
    await stream("works/zulu", "working");
    await stream("works/alpha", "reviewing");

    const tree = await readTree(root, NOW);

    // sorted rather than left to the filesystem, because a board built twice
    // from one tree has to be the same board
    expect(tree.streams.map(({ id }) => id)).toStrictEqual(["alpha", "zulu"]);
    expect(tree.excluded).toStrictEqual([]);
  });

  it("should never look in the archive, whatever it holds", async () => {
    await stream("works/live", "working");
    await stream("archive/retired", "working");
    await stream("archive/works/retired-too", "working");

    const tree = await readTree(root, NOW);

    // exclusion by location alone: there is no name matched and no flag read,
    // so there is no rule here that could be written wrongly
    expect(tree.streams.map(({ id }) => id)).toStrictEqual(["live"]);
    expect(tree.excluded).toStrictEqual([]);
  });

  it("should keep a finished stream that was touched inside the window", async () => {
    await stream("works/just-done", "completed", "2026-08-27T12:00:00Z");

    const tree = await readTree(root, NOW);

    expect(tree.streams.map(({ id }) => id)).toStrictEqual(["just-done"]);
  });

  it("should set aside a finished stream nobody has touched for three days", async () => {
    await stream("works/long-done", "completed", "2026-07-24T16:10:00Z");

    const tree = await readTree(root, NOW);

    expect(tree.streams).toStrictEqual([]);
    expect(tree.excluded).toStrictEqual([
      {
        id: "long-done",
        reason:
          "completed and last updated 2026-07-24T16:10:00Z, past the 3-day window",
      },
    ]);
  });

  it("should keep an unfinished stream however old it is", async () => {
    await stream("works/stalled", "working", "2026-01-01T00:00:00Z");

    const tree = await readTree(root, NOW);

    expect(tree.streams.map(({ id }) => id)).toStrictEqual(["stalled"]);
  });

  it("should keep a finished stream whose timestamp it cannot read", async () => {
    // a board that hides a stream because it could not read one line of it
    // hides exactly the stream somebody needs to go and fix
    await stream("works/undated", "completed", "last tuesday");

    const tree = await readTree(root, NOW);

    expect(tree.streams.map(({ id }) => id)).toStrictEqual(["undated"]);
  });

  it("should not follow a state.md linked into the archive", async () => {
    // the board states its own exclusion as a fact — that it never looks in the
    // directory archived streams are in — and following a link would make that
    // untrue while filing the archived work under a live directory's name
    await stream("works/live", "working");
    await stream("archive/works/retired", "working");
    await mkdir(join(root, "works", "borrowed"), { recursive: true });
    await symlink(
      join(root, "archive", "works", "retired", "state.md"),
      join(root, "works", "borrowed", "state.md"),
    );

    const tree = await readTree(root, NOW);

    expect(tree.streams.map(({ id }) => id)).toStrictEqual(["live"]);
    expect(tree.excluded).toStrictEqual([
      {
        id: "borrowed",
        reason:
          "holds a state.md that is a link rather than a file, and a link can point anywhere, including into the archive",
      },
    ]);
  });

  it("should read a zone-less timestamp the same way wherever it is run", async () => {
    // `Date.parse` reads a date on its own as UTC but a date and time with no
    // zone on the end as host-local, so this one tree used to draw a different
    // board either side of a dateline
    await stream("works/inside", "completed", "2026-08-26T12:30:00");
    await stream("works/outside", "completed", "2026-08-26T11:30:00");
    const was = process.env.TZ;
    const seen: string[][] = [];
    try {
      for (const zone of ["Pacific/Kiritimati", "Pacific/Midway", "UTC"]) {
        process.env.TZ = zone;
        seen.push((await readTree(root, NOW)).streams.map(({ id }) => id));
      }
    } finally {
      if (was === undefined) delete process.env.TZ;
      else process.env.TZ = was;
    }

    expect(seen).toStrictEqual([["inside"], ["inside"], ["inside"]]);
  });

  it("should say which directory held no state file", async () => {
    await stream("works/real", "working");
    await fixture(root, "works/hollow/notes.md", "not a state file\n");

    const tree = await readTree(root, NOW);

    expect(tree.streams.map(({ id }) => id)).toStrictEqual(["real"]);
    expect(tree.excluded).toStrictEqual([
      { id: "hollow", reason: "holds no state.md to read" },
    ]);
  });

  it("should ignore a loose file sitting beside the workstreams", async () => {
    await stream("works/real", "working");
    await fixture(root, "works/README.md", "# not a workstream\n");

    const tree = await readTree(root, NOW);

    expect(tree.streams.map(({ id }) => id)).toStrictEqual(["real"]);
    expect(tree.excluded).toStrictEqual([]);
  });

  it("should refuse a directory that is not a state tree, naming what it looked for", async () => {
    await expect(readTree(root, NOW)).rejects.toThrow(
      `no workstreams to read: ${join(root, "works")} is not a directory, so this is not a .state tree`,
    );
  });
});
