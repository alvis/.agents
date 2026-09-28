import { describe, expect, it } from "vitest";

import { renderBlock } from "../block.ts";
import { RenderError } from "../error.ts";

import { emptyContext } from "../context.ts";

import type { Block } from "../types.ts";

/**
 * renders one block at a fixed path, with a fresh id ledger each time
 * @param block the block to render
 * @returns the rendered HTML
 */
function html(block: unknown): string {
  return renderBlock(block as Block, "b", emptyContext());
}

/** the smallest decision a board can ask. */
const DECISION = { type: "decision", id: "d", ref: "D1", label: "L", ask: "A?" };

/** the words a newcomer board puts on a decision it only offers to explain. */
const EXPLAIN = {
  approve: "I'm good with it",
  change: "Tell me more about it",
  note: "What would you like to know? (optional)",
};

describe("fn:renderBlock decision", () => {
  it("should render an unlabelled decision exactly as before labels existed", () => {
    // every board already in circulation asks decisions without labels; one
    // byte of drift here is a changed page nobody asked for
    expect(html({ ...DECISION, placeholder: "p" })).toBe(
      '<fieldset class="question" id="qs-d" tabindex="-1" data-question data-question-kind="decision" data-question-id="d" data-question-ref="D1" data-question-label="L"><legend><span class="q-ref">D1</span>L</legend><p class="ask">A?</p><div class="verdicts"><button type="button" class="verdict" data-verdict="approve" aria-pressed="false">Approve</button><button type="button" class="verdict" data-verdict="change" aria-pressed="false">Change</button></div><div class="verdict-note" data-verdict-note hidden><label class="q-label" for="q-d">What to change</label><textarea id="q-d" placeholder="p"></textarea></div></fieldset>',
    );
  });

  it("should draw each label on its button and name it for the runtime", () => {
    const drawn = html({ ...DECISION, labels: EXPLAIN });

    expect(drawn).toContain(
      '<button type="button" class="verdict" data-verdict="approve" aria-pressed="false" data-verdict-label="I&#39;m good with it">I&#39;m good with it</button>',
    );
    expect(drawn).toContain(
      'data-verdict="change" aria-pressed="false" data-verdict-label="Tell me more about it">Tell me more about it</button>',
    );
    expect(drawn).toContain(
      '<label class="q-label" for="q-d">What would you like to know? (optional)</label>',
    );
  });

  it("should fall back per label, so one renamed button leaves the other as it was", () => {
    const drawn = html({ ...DECISION, labels: { change: "Ask" } });

    expect(drawn).toContain('data-verdict="approve" aria-pressed="false">Approve</button>');
    expect(drawn).toContain('data-verdict-label="Ask">Ask</button>');
    expect(drawn).toContain(">What to change</label>");
  });

  it("should escape a label, which is author text drawn into markup", () => {
    const drawn = html({ ...DECISION, labels: { approve: '<b>"ok"</b>' } });

    expect(drawn).toContain(
      'data-verdict-label="&lt;b&gt;&quot;ok&quot;&lt;/b&gt;">&lt;b&gt;&quot;ok&quot;&lt;/b&gt;</button>',
    );
    expect(drawn).not.toContain("<b>");
  });

  it("should refuse labels that are not an object", () => {
    expect(() => html({ ...DECISION, labels: "Yes" })).toThrow(
      new RenderError('b.labels: required object, received "Yes"'),
    );
  });

  it("should refuse a label that is not a non-empty string", () => {
    expect(() => html({ ...DECISION, labels: { approve: "" } })).toThrow(
      new RenderError('b.labels.approve: required non-empty string, received ""'),
    );
  });

  it("should refuse two buttons that say the same thing", () => {
    // the reply reads the verdict back from the words, so a change would be
    // filed as the approval it reads as
    expect(() => html({ ...DECISION, labels: { approve: "Change" } })).toThrow(
      new RenderError('b.labels: approve and change must differ, both read "Change"'),
    );
  });

  it("should mark the approve button as the default only on a follow-up that declares one", () => {
    // a follow-up left alone means the reader needs nothing more only when the
    // board says so; the words on its buttons must not decide what a press means
    const declared = html({ ...DECISION, response: "follow-up", default: "approve", labels: EXPLAIN });
    const plain = html({ ...DECISION, response: "follow-up", default: "approve" });
    const relabelled = html({ ...DECISION, response: "follow-up", labels: EXPLAIN });

    expect(declared).toContain(
      'data-verdict-label="I&#39;m good with it" data-default>I&#39;m good with it<span class="badge">Default</span></button>',
    );
    expect(declared.match(/Default/g)).toHaveLength(1);
    expect(declared.match(/data-default/g)).toHaveLength(1);
    expect(plain).toContain('data-default>Approve<span class="badge">Default</span></button>');
    expect(relabelled).not.toMatch(/Default|data-default/);
  });

  it("should refuse a default on a decision, which leaving alone cannot settle", () => {
    expect(() => html({ ...DECISION, default: "approve" })).toThrow(
      new RenderError('b.default: only a "follow-up" may declare a default, this asks a "decision"'),
    );
  });

  it("should refuse a default other than approve", () => {
    expect(() => html({ ...DECISION, response: "follow-up", default: "change" })).toThrow(
      new RenderError('b.default: required one of "approve", received "change"'),
    );
  });
});
