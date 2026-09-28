import { describe, expect, it } from "vitest";

import { dispositionOf, formatAnswers, summarise } from "./disposition.ts";

import type { AnswerLine } from "./reply.ts";

/**
 * builds one answer line
 * @param over what this line carries beyond an untouched, unanswered decision
 * @returns the line
 */
function line(over: Partial<AnswerLine> = {}): AnswerLine {
  return {
    ref: "D1",
    label: "Rollout",
    value: "",
    response: "decision",
    recommended: [],
    touched: false,
    defaults: false,
    ...over,
  };
}

describe("fn:dispositionOf", () => {
  it("should read an untouched question as unanswered", () => {
    expect(dispositionOf(line())).toBe("unanswered");
  });

  it("should read an untouched question the page recommends as suggested", () => {
    expect(dispositionOf(line({ recommended: ["Approve"] }))).toBe("suggested");
  });

  it("should not read a restored answer as the reader's own", () => {
    // the controls carry a value, but nobody has agreed to it in this sitting
    expect(dispositionOf(line({ value: "Approve", recommended: ["Approve"] }))).toBe(
      "suggested",
    );
  });

  it("should read an untouched follow-up as confirmed where its default answers it", () => {
    // the default is an answer, so the strip and the unanswered count must not
    // disagree about whether anything is still open
    expect(
      dispositionOf(
        line({ response: "follow-up", recommended: ["I'm good with it"], defaults: true }),
      ),
    ).toBe("confirmed");
  });

  it("should read an answer matching the recommendation as confirmed", () => {
    expect(
      dispositionOf(line({ value: "Approve", recommended: ["Approve"], touched: true })),
    ).toBe("confirmed");
  });

  it("should read an answer against the recommendation as changed", () => {
    expect(
      dispositionOf(
        line({ value: "Change — hold it", recommended: ["Approve"], touched: true }),
      ),
    ).toBe("changed");
  });

  it("should read an answer the page recommended nothing about as answered", () => {
    expect(dispositionOf(line({ value: "Ada", touched: true }))).toBe("answered");
  });

  it("should read a touched but emptied answer as unresolved", () => {
    expect(dispositionOf(line({ value: "", touched: true }))).toBe("unanswered");
  });
});

describe("fn:formatAnswers", () => {
  it("should group decisions under the heading each answer earns", () => {
    const out = formatAnswers([
      line({ ref: "D1", label: "Keep", value: "Approve", recommended: ["Approve"], touched: true }),
      line({ ref: "D2", label: "Drop", value: "Change", recommended: ["Approve"], touched: true }),
      line({ ref: "N3", label: "Owner", value: "Ada", touched: true }),
      line({ ref: "D4", label: "Later", recommended: ["Approve"] }),
    ]);

    expect(out).toBe(
      [
        "## Decisions",
        "",
        "### Changed",
        "- **D2 · Drop:** Change _(recommended: Approve)_",
        "",
        "### Confirmed",
        "- **D1 · Keep:** Approve",
        "",
        "### Answered",
        "- **N3 · Owner:** Ada",
        "",
        "### Not yet marked",
        "- **D4 · Later:** recommended Approve; not yet confirmed",
      ].join("\n"),
    );
  });

  it("should put changes first, because they are what the reply is sent for", () => {
    const out = formatAnswers([
      line({ label: "Keep", value: "Approve", recommended: ["Approve"], touched: true }),
      line({ label: "Drop", value: "Change", recommended: ["Approve"], touched: true }),
    ]);

    expect(out.indexOf("### Changed")).toBeLessThan(out.indexOf("### Confirmed"));
  });

  it("should keep follow-ups out of the decisions section", () => {
    const out = formatAnswers([
      line({ label: "Keep", value: "Approve", recommended: ["Approve"], touched: true }),
      line({ ref: "F2", label: "Chase", value: "Yes", response: "follow-up", touched: true }),
    ]);

    expect(out).toContain("## Follow-ups\n\n### Requested\n- **F2 · Chase:** Yes");
    expect(out.split("## Follow-ups")[0]).not.toContain("Chase");
  });

  it("should file a follow-up left at its default as not requested", () => {
    // a newcomer who never presses anything, or presses "I'm good with it",
    // is asking for nothing; listing either under Requested would send the
    // coder off to explain what nobody asked about
    const good = ["I'm good with it"];
    const out = formatAnswers([
      line({ ref: "A1", label: "Ask", value: "Tell me more about it — why?", response: "follow-up", recommended: good, defaults: true, touched: true }),
      line({ ref: "A2", label: "Pressed", value: "I'm good with it", response: "follow-up", recommended: good, defaults: true, touched: true }),
      line({ ref: "A3", label: "Untouched", response: "follow-up", recommended: good, defaults: true }),
    ]);

    expect(out).toBe(
      [
        "## Follow-ups",
        "",
        "### Requested",
        "- **A1 · Ask:** Tell me more about it — why?",
        "",
        "### Not requested",
        "- **A2 · Pressed:** I'm good with it (default)",
        "- **A3 · Untouched:** I'm good with it (default)",
      ].join("\n"),
    );
  });

  it("should leave a follow-up that recommends nothing as it always read", () => {
    // every follow-up before labels existed was an observations block with no
    // recommendation; its reply must not move
    const out = formatAnswers([
      line({ ref: "O1", label: "Seen", value: "1, 3", response: "follow-up", touched: true }),
      line({ ref: "O2", label: "Unseen", response: "follow-up" }),
    ]);

    expect(out).toBe(
      [
        "## Follow-ups",
        "",
        "### Requested",
        "- **O1 · Seen:** 1, 3",
        "",
        "### Not yet requested",
        "- **O2 · Unseen:** unanswered",
      ].join("\n"),
    );
  });

  it("should keep a recommended follow-up without a default as it always read", () => {
    // a choice follow-up recommending an option is still a request when the
    // reader picks it; only a follow-up the page marked as its default may be
    // filed as asking for nothing
    const out = formatAnswers([
      line({ ref: "C1", label: "Dig", value: "Security", response: "follow-up", recommended: ["Security"], touched: true }),
      line({ ref: "C2", label: "Next", response: "follow-up", recommended: ["Security"] }),
    ]);

    expect(out).toBe(
      [
        "## Follow-ups",
        "",
        "### Requested",
        "- **C1 · Dig:** Security",
        "",
        "### Not yet requested",
        "- **C2 · Next:** recommended Security; not yet confirmed",
      ].join("\n"),
    );
  });

  it("should not promise a section the page asks nothing for", () => {
    const out = formatAnswers([line({ label: "Keep", value: "Approve", touched: true })]);

    expect(out).not.toContain("## Follow-ups");
  });

  it("should say plainly that nothing is marked rather than printing an empty section", () => {
    expect(formatAnswers([line({ response: "follow-up" })])).toContain(
      "### Not yet requested",
    );
  });

  it("should mark a page that asks nothing at all", () => {
    expect(formatAnswers([])).toBe("(no questions)");
  });
});

describe("fn:summarise", () => {
  it("should say plainly when nothing has been done", () => {
    expect(summarise([line(), line()], 0)).toBe(
      "Nothing on this board has been answered or noted yet.",
    );
  });

  it("should count each disposition", () => {
    const out = summarise(
      [
        line({ value: "Approve", recommended: ["Approve"], touched: true }),
        line({ value: "Change", recommended: ["Approve"], touched: true }),
        line(),
      ],
      0,
    );

    expect(out).toBe(
      "This reply carries 3 decisions — 1 confirmed, 1 changed, 1 still unmarked; and no notes.",
    );
  });

  it("should count the follow-ups separately from the decisions", () => {
    const out = summarise(
      [
        line({ value: "Approve", recommended: ["Approve"], touched: true }),
        line({ response: "follow-up", value: "Yes", touched: true }),
        line({ response: "follow-up" }),
      ],
      2,
    );

    expect(out).toContain("2 follow-ups, 1 requested");
    expect(out).toContain("1 decision — 1 confirmed");
  });

  it("should not count a follow-up left at its default as requested", () => {
    const good = ["I'm good with it"];
    const out = summarise(
      [
        line({ response: "follow-up", value: "Tell me more about it", recommended: good, defaults: true, touched: true }),
        line({ response: "follow-up", value: "I'm good with it", recommended: good, defaults: true, touched: true }),
        line({ response: "follow-up", recommended: good, defaults: true }),
      ],
      0,
    );

    expect(out).toBe("This reply carries 3 follow-ups, 1 requested; and no notes.");
  });

  it("should count a confirmed follow-up without a default as requested", () => {
    const out = summarise(
      [line({ response: "follow-up", value: "Security", recommended: ["Security"], touched: true })],
      0,
    );

    expect(out).toBe("This reply carries 1 follow-up, 1 requested; and no notes.");
  });

  it("should count the notes the reader left", () => {
    expect(summarise([], 1)).toBe("This reply carries 1 note.");
  });

  it("should report a changed ordering, which nothing else in the reply carries", () => {
    expect(summarise([], 0, 2)).toContain("2 orderings changed");
  });
});
