import { renderScale } from "./scale.ts";
import { renderTags } from "./tag.ts";
import { renderTradeoff } from "./tradeoff.ts";
import { escapeHtml } from "../escape.ts";
import { requireFreshId, requireFreshRef } from "../id.ts";
import { responseAttribute } from "../question.ts";
import {
  optionalString,
  requireFilledArray,
  requireObject,
  requireString,
} from "../validate.ts";
import { ANSWER_KIND } from "../vocabulary.ts";

import type { PageIds } from "../id.ts";
import type { Choice, Option } from "../types.ts";
import type { Question } from "../vocabulary.ts";

/**
 * the kinds drawn here.
 *
 * `observations` and `quiz` open through `openQuestion` and then draw their
 * own bodies, because neither is a control this dispatcher would recognise:
 * one is a set of cards and the other carries an answer key.
 */
type Drawn = Exclude<Question, { type: "observations" | "quiz" }>;

/** a question's identity and the markup down to the end of its ask. */
interface Shell {
  /** the question's id, already claimed against its peers */
  id: string;
  /** the opening tag, the title, and the ask */
  head: string;
}

/**
 * draws the shell every question shares.
 *
 * the fieldset, the title, the ask, and the attributes the runtime reads an
 * answer back through are identical across the kinds; only the control below
 * them differs. Drawing the shell once is what keeps a new shell attribute —
 * the citation code was the last one — from having to be added in five places
 * and landing in four. It is exported for the same reason: a kind drawn in its
 * own module still opens here rather than reimplementing the attributes the
 * store, the chips and the reply all read.
 * @param block the question block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @param ids every name already claimed on this page
 * @param tag the element the kind uses: a fieldset, or a div for a bare note
 * @returns the question's id and its opening markup
 */
export function openQuestion(
  block: Question,
  path: string,
  ids: PageIds,
  tag: "fieldset" | "div",
): Shell {
  const id = requireFreshId(block.id, path, "question", ids);
  const ref = requireFreshRef(block.ref, path, ids);
  const label = requireString(block.label, `${path}.label`);
  const ask = requireString(block.ask, `${path}.ask`);
  // the code sits inside the title rather than beside it, so it belongs to the
  // group's accessible name. A reader who cannot see the chip can still cite
  // the question by the same two characters everyone else uses
  const title = `<span class="q-ref">${escapeHtml(ref)}</span>${escapeHtml(label)}`;

  return {
    id,
    head:
      // `tabindex` makes the card the target of the drawer's decision row: a
      // fragment lands on an element the browser can focus, so the jump moves
      // the reading position and the keyboard together. `-1` keeps it out of
      // the tab order, where a card is not a control anyone tabs to
      `<${tag} class="question" id="qs-${escapeHtml(id)}" tabindex="-1"` +
      // the contract the answer saves under, not the block's own type: an
      // observations block is read and restored as the set of ticks it is
      ` data-question data-question-kind="${ANSWER_KIND[block.type]}"` +
      `${responseAttribute(block, path)} data-question-id="${escapeHtml(id)}"` +
      ` data-question-ref="${escapeHtml(ref)}" data-question-label="${escapeHtml(label)}">` +
      (tag === "fieldset"
        ? `<legend>${title}</legend>`
        : `<label class="q-label" for="q-${escapeHtml(id)}">${title}</label>`) +
      `<p class="ask">${escapeHtml(ask)}</p>`,
  };
}

/**
 * draws one question, dispatching on the kind of answer it asks for.
 *
 * all five share `openQuestion`'s shell, so what is written here is the
 * control alone: putting the control beside the shell is what makes the
 * difference between the kinds readable.
 * @param block the question block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @param ids every name already claimed on this page
 * @returns the question as HTML
 */
export function renderQuestion(
  block: Drawn,
  path: string,
  ids: PageIds,
): string {
  switch (block.type) {
    case "choice": {
      const { id, head } = openQuestion(block, path, ids, "fieldset");
      const recommendation = optionalString(
        block.recommendation,
        `${path}.recommendation`,
      );

      return `${head}<div class="choices">${requireFilledArray<Choice>(block.choices, `${path}.choices`)
        .map((choice, index) => {
          const at = `${path}.choices[${index}]`;
          requireObject<Choice>(choice, at);
          const value = requireString(choice.value, `${at}.value`);
          const summary = optionalString(choice.summary, `${at}.summary`);
          // the label wraps the radio, so without the split below every word
          // on the card — summary, pros, cons, tags — becomes the radio's
          // accessible name, and one option announced as 38 words against
          // roughly 10 before. The detail moves to aria-describedby rather
          // than being dropped: aria-label alone would shorten the name by
          // hiding the trade-offs from a screen reader entirely, which trades
          // a verbosity bug for information loss. Both attributes or neither.
          // `id` already passed SAFE_ID and the index is unique per question,
          // so these stay valid URL fragments without a second check
          const detailId = `q-${escapeHtml(id)}-opt-${index}`;
          const badges = renderTags(choice.tags, `${detailId}-tags`, at);
          const tradeoffs = `${renderTradeoff(choice.pros, "pros", "Pros", `${at}.pros`)}${renderTradeoff(choice.cons, "cons", "Cons", `${at}.cons`)}`;
          // a label's content model is phrasing content, so the trade-offs
          // are spans made list-like in CSS. A <ul> here would still parse as
          // a child of the label — <label> is not in the parser's special
          // set, so nothing reparents it — but it is invalid HTML, and the
          // spans buy conformance at no cost to the whole-card click target
          const detail = `${summary ? `<small>${escapeHtml(summary)}</small>` : ""}${tradeoffs ? `<span class="tradeoffs">${tradeoffs}</span>` : ""}`;
          // an option carrying no detail and no tags already announces as its
          // title alone, so it needs neither attribute
          const describedBy = [detail ? detailId : "", badges ? `${detailId}-tags` : ""]
            .filter(Boolean)
            .join(" ");
          // the runtime reads this to tell a confirmed recommendation from an
          // override; the badge says the same thing to the reader, but a badge
          // is a word in a span and the reply needs a value it can compare
          const suggested = (choice.tags ?? []).includes("Recommended")
            ? " data-recommended"
            : "";

          return `<label class="choice"><input type="radio" name="${escapeHtml(id)}" value="${escapeHtml(value)}"${suggested}${describedBy ? ` aria-label="${escapeHtml(value)}" aria-describedby="${describedBy}"` : ""} /><span class="choice-body"><strong>${escapeHtml(value)}</strong>${detail ? `<span class="choice-detail" id="${detailId}">${detail}</span>` : ""}</span>${badges}</label>`;
        })
        .join("")}</div>${recommendation ? `<p class="recommendation"><span class="recommendation-label">Recommendation</span> ${escapeHtml(recommendation)}</p>` : ""}</fieldset>`;
    }
    case "checklist": {
      const { id, head } = openQuestion(block, path, ids, "fieldset");

      return `${head}<div class="choices">${requireFilledArray<Option>(block.options, `${path}.options`)
        .map((option, index) => {
          const at = `${path}.options[${index}]`;
          requireObject<Option>(option, at);
          const value = requireString(option.value, `${at}.value`);
          const summary = optionalString(option.summary, `${at}.summary`);

          return `<label class="choice"><input type="checkbox" name="${escapeHtml(id)}" value="${escapeHtml(value)}" /><span><strong>${escapeHtml(value)}</strong>${summary ? `<small>${escapeHtml(summary)}</small>` : ""}</span></label>`;
        })
        .join("")}</div></fieldset>`;
    }
    case "scale": {
      const { id, head } = openQuestion(block, path, ids, "fieldset");

      return `${head}${renderScale(block, id, path)}</fieldset>`;
    }
    case "decision": {
      const { id, head } = openQuestion(block, path, ids, "fieldset");
      const placeholder =
        optionalString(block.placeholder, `${path}.placeholder`) ?? "";

      // a fieldset, because the two buttons are one grouped control; the note
      // starts hidden so a page opened without JavaScript shows the ask alone
      return `${head}<div class="verdicts"><button type="button" class="verdict" data-verdict="approve" aria-pressed="false">Approve</button><button type="button" class="verdict" data-verdict="change" aria-pressed="false">Change</button></div><div class="verdict-note" data-verdict-note hidden><label class="q-label" for="q-${escapeHtml(id)}">What to change</label><textarea id="q-${escapeHtml(id)}" placeholder="${escapeHtml(placeholder)}"></textarea></div></fieldset>`;
    }
    case "note": {
      const { id, head } = openQuestion(block, path, ids, "div");
      const placeholder =
        optionalString(block.placeholder, `${path}.placeholder`) ?? "";

      return `${head}<textarea id="q-${escapeHtml(id)}" placeholder="${escapeHtml(placeholder)}"></textarea></div>`;
    }
  }
}
