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
    label: "Rollout",
    value: "",
    response: "decision",
    recommended: [],
    touched: false,
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
      line({ label: "Keep", value: "Approve", recommended: ["Approve"], touched: true }),
      line({ label: "Drop", value: "Change", recommended: ["Approve"], touched: true }),
      line({ label: "Owner", value: "Ada", touched: true }),
      line({ label: "Later", recommended: ["Approve"] }),
    ]);

    expect(out).toBe(
      [
        "## Decisions",
        "",
        "### Changed",
        "- **Drop:** Change _(recommended: Approve)_",
        "",
        "### Confirmed",
        "- **Keep:** Approve",
        "",
        "### Answered",
        "- **Owner:** Ada",
        "",
        "### Not yet marked",
        "- **Later:** recommended Approve; not yet confirmed",
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
      line({ label: "Chase", value: "Yes", response: "follow-up", touched: true }),
    ]);

    expect(out).toContain("## Follow-ups\n\n### Requested\n- **Chase:** Yes");
    expect(out.split("## Follow-ups")[0]).not.toContain("Chase");
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

  it("should count the notes the reader left", () => {
    expect(summarise([], 1)).toBe("This reply carries 1 note.");
  });

  it("should report a changed ordering, which nothing else in the reply carries", () => {
    expect(summarise([], 0, 2)).toContain("2 orderings changed");
  });
});
