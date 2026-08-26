import { describe, expect, it } from "vitest";

import {
  countUnanswered,
  decisionAnswer,
  fillReply,
  fillTemplate,
  formatNotes,
} from "./reply.ts";

import type { AnswerLine } from "./reply.ts";

describe("fn:fillTemplate", () => {
  it("should replace every marker the template carries", () => {
    expect(fillTemplate("a {{answers}} b {{answers}}", { answers: "X" })).toBe("a X b X");
  });

  it("should fill each named marker from its own block", () => {
    expect(
      fillTemplate("{{caveats}}\n{{answers}}\n{{provenance}}", {
        answers: "A",
        caveats: "C",
        provenance: "P",
      }),
    ).toBe("C\nA\nP");
  });

  it("should leave a marker no block names untouched", () => {
    // a template naming a marker the runtime does not fill is an authoring
    // mistake worth seeing in the reply, not one worth blanking silently
    expect(fillTemplate("{{answers}} {{unknown}}", { answers: "A" })).toBe(
      "A {{unknown}}",
    );
  });

  it("should leave a template with no marker alone", () => {
    expect(fillTemplate("nothing to fill", { answers: "X" })).toBe("nothing to fill");
  });

  it("should insert an answer containing $& verbatim", () => {
    // the trap: a string replacement expands $& to the matched text, so a
    // reader who typed it would find "{{answers}}" pasted into their own reply
    expect(fillTemplate("say: {{answers}}", { answers: "cost $& more" })).toBe(
      "say: cost $& more",
    );
  });

  it("should insert an answer containing $` and $' verbatim", () => {
    expect(fillTemplate("a{{answers}}b", { answers: "$`|$'|$$" })).toBe("a$`|$'|$$b");
  });
});

/**
 * builds one answer line
 * @param label the question's label
 * @param value the answer it carries
 * @returns the line
 */
function line(label: string, value: string): AnswerLine {
  return { label, value, response: "decision", recommended: [], touched: true };
}

describe("fn:decisionAnswer", () => {
  it("should read an unmarked decision as unanswered", () => {
    expect(decisionAnswer("", "")).toBe("");
    expect(decisionAnswer("", "a note typed before unmarking")).toBe("");
  });

  it("should read approve as Approve, whatever the note holds", () => {
    expect(decisionAnswer("approve", "")).toBe("Approve");
    expect(decisionAnswer("approve", "stale note")).toBe("Approve");
  });

  it("should carry a change note into the answer", () => {
    expect(decisionAnswer("change", "hold the flag open")).toBe(
      "Change — hold the flag open",
    );
  });

  it("should count a bare change, because the note is prompted not required", () => {
    expect(decisionAnswer("change", "")).toBe("Change");
    expect(decisionAnswer("change", "   \n  ")).toBe("Change");
  });
});

describe("fn:countUnanswered", () => {
  it("should count only the empty answers", () => {
    expect(countUnanswered([line("a", "x"), line("b", ""), line("c", "")])).toBe(2);
  });

  it("should count nothing on a page with no questions", () => {
    expect(countUnanswered([])).toBe(0);
  });
});

describe("fn:formatNotes", () => {
  it("should say plainly that there are no notes rather than printing nothing", () => {
    // an empty block reads as a rendering fault in a reply someone else acts on
    expect(formatNotes([])).toBe("(no notes)");
  });

  it("should carry the passage with the note it is about", () => {
    expect(
      formatNotes([{ sectionLabel: "Scope", quote: "the second option", note: "why this?" }]),
    ).toBe("- Scope: why this?\n  > the second option");
  });

  it("should print a whole-section note without a quote line", () => {
    expect(formatNotes([{ sectionLabel: "Scope", quote: null, note: "unclear" }])).toBe(
      "- Scope: unclear",
    );
  });

  it("should mark a highlight that carries no note", () => {
    expect(formatNotes([{ sectionLabel: "Scope", quote: "this bit", note: "  " }])).toBe(
      "- Scope: (highlighted, no note)\n  > this bit",
    );
  });

  it("should keep every note rather than collapsing two on one section", () => {
    const out = formatNotes([
      { sectionLabel: "Scope", quote: "a", note: "one" },
      { sectionLabel: "Scope", quote: "b", note: "two" },
    ]);

    expect(out.split("\n")).toHaveLength(4);
  });
});

describe("fn:fillTemplate notes", () => {
  it("should not expand a note containing a replacement pattern", () => {
    // the whole reason every replacement is a function rather than a string
    const filled = fillTemplate("{{notes}}", {
      notes: formatNotes([{ sectionLabel: "S", quote: null, note: "costs $& more" }]),
    });

    expect(filled).toBe("- S: costs $& more");
  });
});

describe("fn:fillReply", () => {
  const note = { sectionLabel: "Viable set", quote: "a passage", note: "say it plainly" };
  const parts = { summary: "one decision", answers: "- **A:** yes", notes: [note] };

  it("should put the notes where the author placed the marker", () => {
    const filled = fillReply("head\n\n{{notes}}\n\n{{answers}}", parts);

    expect(filled.indexOf("say it plainly")).toBeLessThan(filled.indexOf("- **A:**"));
    expect(filled).not.toContain("## Notes");
  });

  it("should append notes the author left nowhere to put", () => {
    // the summary already tells the recipient how many notes the reply
    // carries, so a template with no marker would announce notes it dropped
    const filled = fillReply("head\n\n{{summary}}\n\n{{answers}}", parts);

    expect(filled).toContain("## Notes");
    expect(filled).toContain("say it plainly");
    expect(filled).toContain("> a passage");
  });

  it("should append nothing when the reader wrote no notes", () => {
    const filled = fillReply("head\n\n{{answers}}", { ...parts, notes: [] });

    expect(filled).not.toContain("## Notes");
    expect(filled).toBe("head\n\n- **A:** yes");
  });

  it("should still fill a marker the reader has no notes for", () => {
    const filled = fillReply("head\n\n{{notes}}", { ...parts, notes: [] });

    expect(filled).toBe("head\n\n(no notes)");
  });
});
