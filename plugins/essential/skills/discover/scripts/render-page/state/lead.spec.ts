import { describe, expect, it } from "vitest";

import { leadRuns, leadText } from "./lead.ts";

describe("fn:leadText", () => {
  it("should keep a next action that is already one sentence", () => {
    // six of this tree's seven streams write exactly this shape, and a lead
    // that shortened them would be solving the seventh's problem everywhere
    const whole =
      "Poll PRs #55–#60 for author responses or new commits (task MON).";

    expect(leadText(whole)).toBe(whole);
  });

  it("should never stop inside a word", () => {
    // three of seven owner chips read "mark the stream compl", "dispatch was
    // un" and "record approvals on t" — a fixed count cutting prose wherever
    // the count happened to land, which a reader cannot tell from a sentence
    const cut = leadText(`${"situation ".repeat(30)}end.`);

    expect(cut.endsWith(" …")).toBe(true);
    expect(cut.replace(" …", "").endsWith("situation")).toBe(true);
  });

  it("should say when it stopped short of the whole", () => {
    const whole = "First sentence. Second sentence.";

    expect(leadText(whole)).toBe("First sentence. …");
    expect(leadText("Only one sentence.")).toBe("Only one sentence.");
  });

  it("should read markup as words in a field that holds no runs", () => {
    // `due` is a plain string, so there is nowhere for emphasis to go; what
    // matters is that the markers do not arrive as punctuation
    expect(leadText("**Delivered** and `reviewed`.")).toBe(
      "Delivered and reviewed.",
    );
  });
});

describe("fn:leadRuns", () => {
  it("should read a state file's markup as the vocabulary this format has", () => {
    // there is no markup pass-through anywhere in this format, so a paragraph
    // handed over verbatim reached the board as literal asterisks: the board
    // drew "**Batch 2 is delivered and independently reviewed.**" as written
    expect(leadRuns("**Batch 2 is delivered.** All sixteen asks work.")).toEqual(
      [
        { kind: "mark", text: "Batch 2 is delivered." },
        { kind: "dim", text: " …" },
      ],
    );
  });

  it("should keep a code span as code rather than as backticks", () => {
    expect(leadRuns("PR #78 is green; mark `completed` on merge evidence."))
      .toEqual([
        { kind: "text", text: "PR #78 is green; mark " },
        { kind: "code", text: "completed" },
        { kind: "text", text: " on merge evidence." },
      ]);
  });

  it("should hold a paragraph to the same size as a sentence", () => {
    // the rail's longest entry ran to 1,307 characters beside a median of 110,
    // which is a rail with one entry on it and six footnotes
    const runs = leadRuns(
      `Opening sentence. ${"and more prose ".repeat(200)}end.`,
    );
    const said = runs
      .map((run) => (typeof run === "string" ? run : run.text))
      .join("");

    expect(said.length).toBeLessThanOrEqual(170);
  });

  it("should add no ellipsis to a next action it drew whole", () => {
    expect(leadRuns("Done.")).toEqual([{ kind: "text", text: "Done." }]);
  });
});
