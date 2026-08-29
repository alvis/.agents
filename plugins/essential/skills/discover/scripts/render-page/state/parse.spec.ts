import { describe, expect, it } from "vitest";

import { parseStream } from "./parse.ts";

/** the header the canonical task table opens with. */
const HEADER =
  "| ID | Mark | Status | Task | Depends on | Required | Acceptance | Owner | Evidence / next action |\n" +
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |";

/**
 * writes a state file out of the parts a case cares about
 * @param head the header block, without the leading heading
 * @param rows the task rows, already piped
 * @returns the file's text
 */
function stateFile(head: string, rows: string[] = []): string {
  return `# Work state\n\n${head}\n\n${HEADER}\n${rows.join("\n")}\n`;
}

/** one done task, in the canonical nine columns. */
const DONE =
  "| AAA01 | ✓ | done | Write the parser | — | yes | Tests pass | Ada | e: suite green |";

describe("fn:parseStream", () => {
  it("should read a header written with the Phase spelling", () => {
    const stream = parseStream(
      "alpha",
      stateFile(
        "- Work ID: `alpha`\n- Phase: `working`\n- Updated: `2026-08-29T10:45:00Z`\n- Next owner: `Ada`\n- Next action: finish the parser",
      ),
    );

    expect(stream).toMatchObject({
      id: "alpha",
      phase: "working",
      phaseKey: "Phase",
      updated: "2026-08-29T10:45:00Z",
      owner: "Ada",
      next: "finish the parser",
    });
  });

  it("should read a header written with the Lifecycle status spelling", () => {
    // the live tree spells it both ways, and a board that refuses to open
    // because one stream chose the other spelling is useless exactly when it
    // is needed
    const stream = parseStream(
      "beta",
      stateFile("- Work ID: `beta`\n- Lifecycle status: `reviewing`"),
    );

    expect(stream.phase).toBe("reviewing");
    expect(stream.phaseKey).toBe("Lifecycle status");
  });

  it("should take the first occurrence of a key the file repeats", () => {
    // two streams in the live tree repeat their closing headers further down
    // the file, and a reader taking the last one reports a stale owner for
    // exactly the streams that are hardest to read by hand
    const stream = parseStream(
      "gamma",
      stateFile(
        "- Work ID: `gamma`\n- Phase: `working`\n- Next owner: `Ada`\n- Next action: current\n\n## Closing\n\n- Next owner: `stale`\n- Next action: stale",
      ),
    );

    expect(stream.owner).toBe("Ada");
    expect(stream.next).toBe("current");
  });

  it("should say what it did not find rather than guessing at it", () => {
    const stream = parseStream("delta", "# Work state\n\nnothing here\n");

    expect(stream).toStrictEqual({
      id: "delta",
      phase: "",
      phaseKey: "",
      updated: "",
      owner: "",
      next: "",
      tasks: [],
      malformed: 0,
    });
  });

  it("should fall back to the directory name when the file names no work", () => {
    expect(parseStream("epsilon", stateFile("- Phase: `working`")).id).toBe(
      "epsilon",
    );
  });

  it("should read every task row and the alignment rule as none", () => {
    const stream = parseStream("zeta", stateFile("- Phase: `working`", [DONE]));

    expect(stream.tasks).toStrictEqual([
      {
        id: "AAA01",
        mark: "✓",
        status: "done",
        task: "Write the parser",
        owner: "Ada",
        unblock: "",
      },
    ]);
  });

  it("should lift the unblock clause out of the evidence column", () => {
    const stream = parseStream(
      "eta",
      stateFile("- Phase: `working`", [
        "| BBB01 | ! | blocked | Ship it | AAA01 | yes | Released | Bo | unblock: get the signing key |",
      ]),
    );

    expect(stream.tasks[0]).toMatchObject({
      mark: "!",
      status: "blocked",
      unblock: "get the signing key",
    });
  });

  it("should count a row of the wrong width rather than reading it shifted", () => {
    // a nine-column table read as eight puts every owner one column left, and
    // a board that reported the wrong owner would be worse than one that said
    // it could not read the row
    const stream = parseStream(
      "theta",
      stateFile("- Phase: `working`", [
        DONE,
        "| CCC01 | ✓ | done | Missing four columns |",
      ]),
    );

    expect(stream.tasks).toHaveLength(1);
    expect(stream.malformed).toBe(1);
  });

  it("should stop reading at the end of the table", () => {
    const stream = parseStream(
      "iota",
      `${stateFile("- Phase: `working`", [DONE])}\n## Notes\n\n- Phase: \`ignored\`\n`,
    );

    expect(stream.tasks).toHaveLength(1);
    expect(stream.malformed).toBe(0);
    expect(stream.phase).toBe("working");
  });

  it("should read a file that has a header and no table at all", () => {
    const stream = parseStream(
      "kappa",
      "# Work state\n\n- Work ID: `kappa`\n- Phase: `planning`\n",
    );

    expect(stream.tasks).toStrictEqual([]);
    expect(stream.phase).toBe("planning");
  });
});
