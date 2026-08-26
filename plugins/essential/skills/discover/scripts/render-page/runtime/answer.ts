import { decisionAnswer } from "./reply.ts";

import type { SavedAnswer } from "./store.ts";

/**
 * reads the control state a question field currently holds.
 *
 * one branch per `data-question-kind` the renderer emits. A kind whose answer
 * is a set or an ordinal cannot borrow the scalar branches, so each states its
 * own reading; `note` stays the fallthrough.
 * @param field the question's `[data-question]` element
 * @returns the state, in the shape the store keeps
 */
export function readField(field: HTMLElement): SavedAnswer {
  const kind = field.dataset.questionKind;

  if (kind === "checklist")
    return {
      kind,
      values: [...field.querySelectorAll<HTMLInputElement>("input:checked")].map(
        (input) => input.value,
      ),
    };

  if (kind === "decision") {
    const pressed = field.querySelector<HTMLElement>(
      '[data-verdict][aria-pressed="true"]',
    );

    return {
      kind,
      verdict: pressed?.dataset.verdict ?? "",
      note: field.querySelector<HTMLTextAreaElement>("textarea")?.value ?? "",
    };
  }

  if (kind === "choice")
    return {
      kind,
      value: field.querySelector<HTMLInputElement>("input:checked")?.value ?? "",
    };

  if (kind === "scale") {
    const point = field.querySelector<HTMLInputElement>("input:checked");

    return { kind, value: point?.dataset.answer ?? "" };
  }

  return {
    kind: "note",
    value: field.querySelector<HTMLTextAreaElement>("textarea")?.value ?? "",
  };
}

/**
 * renders a saved state as the sentence the reply prints
 * @param saved the control state a question holds
 * @returns the answer as text, empty when the question is unanswered
 */
export function answerText(saved: SavedAnswer): string {
  if (saved.kind === "checklist") return saved.values.join(", ");
  if (saved.kind === "decision") return decisionAnswer(saved.verdict, saved.note);

  return saved.value.trim();
}

/**
 * writes a saved state back into a question's controls.
 *
 * restoring must not look like answering, so this only moves controls; the
 * caller is what decides whether the move counts as the reader's own.
 * @param field the question's `[data-question]` element
 * @param saved the state to restore, from a kind that matches the field
 */
export function writeField(field: HTMLElement, saved: SavedAnswer): void {
  if (saved.kind !== field.dataset.questionKind) return;

  if (saved.kind === "checklist") {
    const wanted = new Set(saved.values);
    for (const input of field.querySelectorAll<HTMLInputElement>("input"))
      input.checked = wanted.has(input.value);

    return;
  }

  if (saved.kind === "decision") {
    for (const button of field.querySelectorAll<HTMLElement>("[data-verdict]"))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.verdict === saved.verdict),
      );

    const note = field.querySelector<HTMLTextAreaElement>("textarea");
    if (note) note.value = saved.note;

    const reveal = field.querySelector<HTMLElement>("[data-verdict-note]");
    if (reveal) reveal.hidden = saved.verdict !== "change";

    return;
  }

  if (saved.kind === "note") {
    const note = field.querySelector<HTMLTextAreaElement>("textarea");
    if (note) note.value = saved.value;

    return;
  }

  // choice reads the input's value, scale its `data-answer` ordinal
  for (const input of field.querySelectorAll<HTMLInputElement>("input"))
    input.checked =
      (saved.kind === "scale" ? input.dataset.answer : input.value) ===
        saved.value && Boolean(saved.value);
}

/**
 * reads which answers the page recommends for a question.
 *
 * a decision recommends approval by construction — the page put a proposal in
 * front of the reader and asked them to approve it — so nothing is marked on
 * its buttons; every other kind carries the mark on the option itself.
 * @param field the question's `[data-question]` element
 * @returns the recommended answers, empty where the page recommends none
 */
export function recommendedOf(field: HTMLElement): string[] {
  if (field.dataset.questionKind === "decision") return ["Approve"];

  return [
    ...field.querySelectorAll<HTMLInputElement>("input[data-recommended]"),
  ].map((input) => input.value);
}
