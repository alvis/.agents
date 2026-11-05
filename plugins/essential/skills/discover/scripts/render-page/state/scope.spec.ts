import { describe, expect, it } from "vitest";

import { scopeOf } from "./scope.ts";

import type { Lease, Tree } from "./read.ts";

/** the moment every case below is read at. */
const NOW = new Date("2026-08-29T12:00:00Z");

/**
 * builds a tree holding the named streams and leases
 * @param ids the live streams' ids
 * @param leases the leases held on them
 * @returns the tree
 */
function tree(ids: string[], leases: Lease[] = []): Tree {
  return {
    project: "sample",
    streams: ids.map((id) => ({
      id,
      claimed: "",
      phase: "working",
      phaseKey: "Phase",
      updated: "2026-08-29T09:00:00Z",
      owner: "",
      next: "",
      blockedOn: "",
      tasks: [],
      malformed: 0,
    })),
    excluded: [],
    leases,
    leaseProblems: [],
  };
}

describe("fn:scopeOf", () => {
  /** a lease this session holds on one stream, running past the read time. */
  const HELD: Lease = {
    stream: "beta",
    session: "me",
    expiresAtSeconds: NOW.getTime() / 1000 + 600,
  };
  const TWO = tree(["alpha", "beta"], [HELD]);

  it("should draw the stream named on the command line", () => {
    expect(scopeOf(TWO, { stream: "alpha", session: "me" }, NOW)).toMatchObject({
      stream: "alpha",
    });
  });

  it("should refuse a named stream that is not live, listing those that are", () => {
    const refused = scopeOf(TWO, { stream: "gamma" }, NOW);

    expect(typeof refused).toBe("string");
    expect(refused).toContain("alpha, beta");
  });

  it("should draw the one stream whose live lease names this session", () => {
    expect(scopeOf(TWO, { session: "me" }, NOW)).toMatchObject({
      stream: "beta",
    });
  });

  it("should draw every stream when this session's lease has lapsed", () => {
    const lapsed = tree(["beta"], [{ ...HELD, expiresAtSeconds: NOW.getTime() / 1000 - 1 }]);

    expect(scopeOf(lapsed, { session: "me" }, NOW)).toMatchObject({ stream: "" });
  });

  it("should draw every stream rather than pick one when this session holds two", () => {
    const both = tree(["alpha", "beta"], [HELD, { ...HELD, stream: "alpha" }]);

    expect(scopeOf(both, { session: "me" }, NOW)).toMatchObject({ stream: "" });
  });

  it("should draw every stream when another stream's lease could not be read", () => {
    const unread = { ...TWO, leaseProblems: [{ id: "alpha", reason: "unreadable" }] };

    expect(scopeOf(unread, { session: "me" }, NOW)).toMatchObject({ stream: "" });
  });

  it("should draw every stream when no session is given to look for", () => {
    expect(scopeOf(TWO, {}, NOW)).toMatchObject({ stream: "" });
  });
});
