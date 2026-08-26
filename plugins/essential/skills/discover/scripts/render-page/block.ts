import { renderCode } from "./block/code.ts";
import { renderEmbed } from "./block/embed.ts";
import { renderFaq, renderGlossary } from "./block/definition.ts";
import { renderFindings } from "./block/finding.ts";
import { renderImage } from "./block/image.ts";
import { renderFailureMap, renderList, renderTldr } from "./block/list.ts";
import { renderMermaid } from "./block/mermaid.ts";
import { renderOwners, renderReadiness } from "./block/meter.ts";
import { renderMetrics } from "./block/metric.ts";
import { renderRiskMatrix } from "./block/risk.ts";
import { renderScale } from "./block/scale.ts";
import { renderSteps } from "./block/step.ts";
import { renderSvg } from "./block/svg.ts";
import { renderTable } from "./block/table.ts";
import { renderProbe } from "./block/probe.ts";
import { renderTags } from "./block/tag.ts";
import { responseAttribute } from "./question.ts";
import { renderKanban, renderTimeline } from "./block/timeline.ts";
import { renderTradeoff, renderTradeoffs } from "./block/tradeoff.ts";
import { renderTree } from "./block/tree.ts";
import { CALLOUT_TONE_LABEL } from "./vocabulary.ts";
import { renderDiagram } from "./diagram.ts";
import { RenderError } from "./error.ts";
import { escapeHtml } from "./escape.ts";
import { renderInline } from "./inline.ts";
import { requireFreshId } from "./id.ts";
import {
  optionalString,
  requireFilledArray,
  requireObject,
  requireOneOf,
  requireString,
} from "./validate.ts";

import type { PageContext } from "./context.ts";
import type { Block, Choice, Option } from "./types.ts";

/**
 * draws one block, dispatching on its `type` and refusing an unknown one
 * @param block the block to draw
 * @param path JSON path of `block`, named verbatim by any refusal
 * @param page what the block is rendered into: claimed ids, and the files
 *   the CLI layer already read
 * @returns the block as HTML
 */
export function renderBlock(block: Block, path: string, page: PageContext): string {
  requireObject<Block>(block, path);
  requireString((block as { type?: unknown }).type, `${path}.type`);
  switch (block.type) {
    case "prose":
      return `<p class="prose">${renderInline(block.text, `${path}.text`)}</p>`;
    case "metrics":
      return renderMetrics(block.items, `${path}.items`);
    case "table":
      return renderTable(block, path);
    case "callout":
      return renderCallout(block, path);
    case "diagram":
      return renderDiagram(block, path);
    case "tree":
      return renderTree(block, path);
    case "mermaid":
      return renderMermaid(block, path);
    case "svg":
      return renderSvg(block, path, page);
    case "image":
      return renderImage(block, path, page);
    case "embed":
      return renderEmbed(block, path, page);
    case "steps":
      return renderSteps(block, path);
    case "list":
      return renderList(block, path);
    case "tldr":
      return renderTldr(block, path);
    case "code":
      return renderCode(block, path);
    case "faq":
      return renderFaq(block, path);
    case "glossary":
      return renderGlossary(block, path);
    case "readiness":
      return renderReadiness(block, path);
    case "owners":
      return renderOwners(block, path);
    case "risk-matrix":
      return renderRiskMatrix(block, path);
    case "failure-map":
      return renderFailureMap(block, path);
    case "timeline":
      return renderTimeline(block, path);
    case "tradeoffs":
      return renderTradeoffs(block, path);
    case "kanban":
      return renderKanban(block, path);
    case "findings":
      return renderFindings(block, path, page.ids);
    case "disclosure":
      return renderDisclosure(block, path, page);
    case "probe":
      return renderProbe(block, path, page.ids);
    case "choice": {
      const id = requireFreshId(block.id, path, "question", page.ids);
      const label = requireString(block.label, `${path}.label`);
      const recommendation = optionalString(
        block.recommendation,
        `${path}.recommendation`,
      );
      return `<fieldset class="question" data-question data-question-kind="choice"${responseAttribute(block, path)} data-question-id="${escapeHtml(id)}" data-question-label="${escapeHtml(label)}"><legend>${escapeHtml(label)}</legend><p class="ask">${escapeHtml(requireString(block.ask, `${path}.ask`))}</p><div class="choices">${requireFilledArray<Choice>(block.choices, `${path}.choices`)
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
      const id = requireFreshId(block.id, path, "question", page.ids);
      const label = requireString(block.label, `${path}.label`);
      return `<fieldset class="question" data-question data-question-kind="checklist"${responseAttribute(block, path)} data-question-id="${escapeHtml(id)}" data-question-label="${escapeHtml(label)}"><legend>${escapeHtml(label)}</legend><p class="ask">${escapeHtml(requireString(block.ask, `${path}.ask`))}</p><div class="choices">${requireFilledArray<Option>(block.options, `${path}.options`)
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
      const id = requireFreshId(block.id, path, "question", page.ids);
      const label = requireString(block.label, `${path}.label`);
      return `<fieldset class="question" data-question data-question-kind="scale"${responseAttribute(block, path)} data-question-id="${escapeHtml(id)}" data-question-label="${escapeHtml(label)}"><legend>${escapeHtml(label)}</legend><p class="ask">${escapeHtml(requireString(block.ask, `${path}.ask`))}</p>${renderScale(block, id, path)}</fieldset>`;
    }
    case "decision": {
      const id = requireFreshId(block.id, path, "question", page.ids);
      const label = requireString(block.label, `${path}.label`);
      const placeholder =
        optionalString(block.placeholder, `${path}.placeholder`) ?? "";
      // a fieldset, because the two buttons are one grouped control; the note
      // starts hidden so a page opened without JavaScript shows the ask alone
      return `<fieldset class="question" data-question data-question-kind="decision"${responseAttribute(block, path)} data-question-id="${escapeHtml(id)}" data-question-label="${escapeHtml(label)}"><legend>${escapeHtml(label)}</legend><p class="ask">${escapeHtml(requireString(block.ask, `${path}.ask`))}</p><div class="verdicts"><button type="button" class="verdict" data-verdict="approve" aria-pressed="false">Approve</button><button type="button" class="verdict" data-verdict="change" aria-pressed="false">Change</button></div><div class="verdict-note" data-verdict-note hidden><label class="q-label" for="q-${escapeHtml(id)}">What to change</label><textarea id="q-${escapeHtml(id)}" placeholder="${escapeHtml(placeholder)}"></textarea></div></fieldset>`;
    }
    case "note": {
      const id = requireFreshId(block.id, path, "question", page.ids);
      const label = requireString(block.label, `${path}.label`);
      const placeholder =
        optionalString(block.placeholder, `${path}.placeholder`) ?? "";
      return `<div class="question" data-question data-question-kind="note"${responseAttribute(block, path)} data-question-id="${escapeHtml(id)}" data-question-label="${escapeHtml(label)}"><label class="q-label" for="q-${escapeHtml(id)}">${escapeHtml(label)}</label><p class="ask">${escapeHtml(requireString(block.ask, `${path}.ask`))}</p><textarea id="q-${escapeHtml(id)}" placeholder="${escapeHtml(placeholder)}"></textarea></div>`;
    }
    default:
      throw new RenderError(
        `${path}.type: unknown block type ${JSON.stringify((block as { type: string }).type)}`,
      );
  }
}

/** the stances a callout may take. */
const TONES = Object.keys(
  CALLOUT_TONE_LABEL,
) as (keyof typeof CALLOUT_TONE_LABEL)[];

/**
 * draws an aside, stating its stance as a word beside the heading
 * @param block the callout block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @returns the callout as HTML
 */
function renderCallout(
  block: Extract<Block, { type: "callout" }>,
  path: string,
): string {
  const title = escapeHtml(requireString(block.title, `${path}.title`));
  const lead = optionalString(block.lead, `${path}.lead`);
  const tone =
    block.tone === undefined
      ? undefined
      : requireOneOf(block.tone, TONES, `${path}.tone`);
  // the tone is announced in words as well as drawn in colour. A callout
  // whose only difference from the one above it is a border hue says nothing
  // to a reader in greyscale, and nothing at all to a screen reader
  const badge = tone
    ? `<span class="callout-tone">${CALLOUT_TONE_LABEL[tone]}</span>`
    : "";
  return `<div class="callout"${tone ? ` data-tone="${tone}"` : ""}><h3>${badge}${title}</h3><p>${lead ? `<strong>${escapeHtml(lead)}</strong> ` : ""}${renderInline(block.text, `${path}.text`)}</p></div>`;
}

/**
 * draws content the reader opens for themselves.
 *
 * a native `<details>`, so it opens with no runtime at all, prints open on a
 * browser that expands them, and is already what a screen reader announces as
 * a disclosure. Its contents are whole blocks rather than text, because the
 * thing worth folding away is usually a table or an excerpt, not a sentence.
 * @param block the disclosure block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @param page what the block is rendered into
 * @returns the disclosure as HTML
 */
function renderDisclosure(
  block: Extract<Block, { type: "disclosure" }>,
  path: string,
  page: PageContext,
): string {
  const summary = requireString(block.summary, `${path}.summary`);
  const inner = requireFilledArray<Block>(block.blocks, `${path}.blocks`)
    .map((held, index) => renderBlock(held, `${path}.blocks[${index}]`, page))
    .join("");

  return `<details class="disclosure"${block.open ? " open" : ""}><summary>${escapeHtml(summary)}</summary><div class="disclosure-body">${inner}</div></details>`;
}
