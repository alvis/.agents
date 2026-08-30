import { openQuestion } from "./question.ts";
import { escapeHtml } from "../escape.ts";
import { RenderError } from "../error.ts";
import { slugOf } from "../id.ts";
import { renderInline } from "../inline.ts";
import {
  optionalString,
  requireFilledArray,
  requireObject,
  requireString,
} from "../validate.ts";

import type { PageContext } from "../context.ts";
import type { Block, QuizOption } from "../types.ts";

/**
 * draws one offered answer.
 *
 * `data-correct` is the only thing separating this from a choice's option, and
 * it is deliberately not `data-recommended`: the disposition machinery reads
 * that attribute, and a wrong quiz answer reported as a disagreement with the
 * board would put the answer the reader missed into the reply they send back.
 * @param option the offered answer
 * @param path JSON path of `option`, named verbatim by any refusal
 * @param name the question's id, which every option in it shares as its name
 * @returns whether this option is the correct one, and its markup
 */
function renderOption(
  option: QuizOption,
  path: string,
  name: string,
): [boolean, string] {
  requireObject<QuizOption>(option, path);
  const value = requireString(option.value, `${path}.value`);
  const because = optionalString(option.because, `${path}.because`);
  const correct = option.correct === true;
  // the rationale ships with the option and is revealed by the sheet once the
  // question is answered, so nothing has to be fetched, generated, or trusted
  // to run for a reader to find out why the answer they gave was the wrong one
  const note = because
    ? `<span class="quiz-because">${escapeHtml(because)}</span>`
    : "";

  // the question's own id, unprefixed, because that is what every other
  // question names its controls with. A name is what groups radios, and the
  // ids are already unique page-wide within the question group — prefixing one
  // kind and not the others put a quiz `x` and a choice `q-x` in one group,
  // where each answer silently erased the other and the reply lost a line
  return [
    correct,
    `<label class="quiz-option"><input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(value)}"${correct ? " data-correct" : ""} /><span class="quiz-value">${escapeHtml(value)}</span>${note}</label>`,
  ];
}

/**
 * draws a question with a right answer, asked of whoever is about to merge.
 *
 * it opens as a question and saves as a choice, so the answer reaches the
 * store, the chips and the reply through the paths every other question uses.
 * What the gate adds sits entirely in `data-correct` and `data-quiz-explains`,
 * neither of which the answer store reads.
 * @param block the quiz block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @param page what the block is rendered into: claimed ids and section names
 * @returns the question as HTML
 */
export function renderQuiz(
  block: Extract<Block, { type: "quiz" }>,
  path: string,
  page: PageContext,
): string {
  const { id, head } = openQuestion(block, path, page.ids, "fieldset");
  const explains = requireString(block.explains, `${path}.explains`);
  // a link-back that scrolls nowhere is worse than none: it tells a reader who
  // got the answer wrong that there is nothing further to read
  if (!page.sections.has(explains))
    throw new RenderError(
      `${path}.explains: no section on this page has id ${JSON.stringify(explains)}, so a wrong answer would link nowhere`,
    );
  const marked = requireFilledArray<QuizOption>(
    block.options,
    `${path}.options`,
  ).map((option, index) =>
    renderOption(option, `${path}.options[${index}]`, id),
  );
  // exactly one, both ways round. None makes the gate unpassable however
  // carefully the board is read; two makes it pass on an answer the change
  // does not have, which is the failure the quiz exists to prevent
  const right = marked.filter(([correct]) => correct).length;
  if (right !== 1)
    throw new RenderError(
      `${path}.options: a quiz needs exactly one option marked \`correct\`, and this one has ${right}`,
    );

  return `${head}<div class="quiz-options" data-quiz data-quiz-explains="${escapeHtml(explains)}">${marked.map(([, html]) => html).join("")}</div></fieldset>`;
}

/**
 * draws the merge verdict every quiz question on the page feeds.
 *
 * it ships unscored rather than unanswered, with both verdicts hidden and the
 * progress line saying why. Shipping the "not yet" verdict visible told a
 * reader with scripting off that the merge was blocked — and that reader can
 * answer every question, because the sheet reveals each rationale with no
 * script at all, so the page was stating a settled verdict nobody computed.
 * The line carries no count for the same reason: a static `0 of 4` is a number
 * that is wrong the moment anybody answers and cannot be corrected.
 * @param block the gate block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @param page what the block is rendered into, which knows what it asks
 * @returns the gate as HTML
 */
export function renderGate(
  block: Extract<Block, { type: "gate" }>,
  path: string,
  page: PageContext,
): string {
  requireObject<Block>(block, path);
  // a gate with nothing to score reported "0 of 0 answered so far" beside an
  // unhidden "not yet", which reads as a merge that was considered and refused
  if (!page.quizzed)
    throw new RenderError(
      `${path}: a gate scores the quiz questions on its page, and this page asks none`,
    );
  const id = slugOf(path, "gate");
  const title = requireString(block.title, `${path}.title`);

  return [
    `<div class="gate" id="${id}" data-gate data-gate-state="unscored">`,
    `<h4 class="gate-title" id="${id}-title">${escapeHtml(title)}</h4>`,
    `<p class="gate-progress" data-gate-progress role="status">Scoring needs JavaScript. With it off, check your own answers against the sections each one cites.</p>`,
    `<div class="gate-verdict" data-gate-pass hidden>${renderInline(block.pass, `${path}.pass`)}</div>`,
    `<div class="gate-verdict" data-gate-fail hidden>${renderInline(block.fail, `${path}.fail`)}</div>`,
    `<ul class="gate-misses" data-gate-misses aria-labelledby="${id}-title"></ul>`,
    `</div>`,
  ].join("");
}
