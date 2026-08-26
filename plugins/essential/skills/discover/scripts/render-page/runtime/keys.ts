import { isInDialog, isTyping } from "./selection.ts";

/** how far along the alphabet an option's key can be labelled. */
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** the question kinds whose options a key can choose. */
const KEYED = ["choice", "checklist", "scale"];

/**
 * reads the controls a key can reach in a question
 * @param field the question
 * @returns its options' controls, in the order they are drawn
 */
function optionsOf(field: HTMLElement): HTMLElement[] {
  if (!KEYED.includes(field.dataset.questionKind ?? "")) return [];

  return [...field.querySelectorAll<HTMLElement>("input")];
}

/**
 * reads which key chooses an option in a question.
 *
 * a scale's points already carry their ordinals as their visible labels, so the
 * key that picks one is the digit the reader can see. Labelling them a, b, c
 * as well would put two competing mnemonics on the same control.
 * @param field the question
 * @returns the keys that choose its options, in the order they are drawn
 */
function keysOf(field: HTMLElement): string[] {
  const count = optionsOf(field).length;
  const scale = field.dataset.questionKind === "scale";

  return [...Array(count).keys()].map((index) =>
    scale ? `${index + 1}` : (LETTERS[index] ?? ""),
  );
}

/**
 * draws the letter that chooses each option.
 *
 * the badge is added by the runtime rather than by the renderer because the
 * shortcut it advertises only exists while the runtime is running: a page
 * opened with scripting off would otherwise promise a key that does nothing.
 * @param field the question to label
 */
function labelOptions(field: HTMLElement): void {
  // a scale needs no badge: the digit that picks a point is the point's label
  if (field.dataset.questionKind === "scale") return;

  const keys = keysOf(field);
  for (const [index, control] of optionsOf(field).entries()) {
    const key = keys[index];
    if (!key) return;

    const badge = document.createElement("span");
    badge.className = "option-key";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = key;
    control.after(badge);
  }
}

/**
 * moves between questions with the arrow keys, and answers the current one
 * with a letter.
 *
 * "current" is wherever the reader last was — the question they arrowed to, or
 * the one holding focus. Without that anchor a letter key would have to guess
 * which question it meant, and a board with eight questions would answer the
 * wrong one seven times out of eight.
 * @param fields every question on the page, in document order
 */
export function installKeys(fields: HTMLElement[]): void {
  if (!fields.length) return;

  for (const field of fields) {
    // a fieldset takes no focus of its own, and the reader has to land
    // somewhere for the next letter key to have a subject
    field.tabIndex = -1;
    labelOptions(field);
  }

  let current = -1;

  /**
   * moves to a question and puts the reader in it
   * @param index which question to move to
   */
  const go = (index: number): void => {
    current = Math.max(0, Math.min(fields.length - 1, index));
    const field = fields[current];
    if (!field) return;

    field.focus();
    field.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  // the reader clicking or tabbing into a question is the same statement of
  // where they are as arrowing to it, and treating it otherwise would make the
  // letter keys answer whichever question they last arrowed past
  document.addEventListener("focusin", (event) => {
    const field = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(
      "[data-question]",
    );
    const index = field ? fields.indexOf(field) : -1;
    if (index >= 0) current = index;
  });

  document.addEventListener("keydown", (event) => {
    // a modified key belongs to the browser or the operating system, a reader
    // typing into a field is typing rather than driving, and a reader inside a
    // dialog is looking at the dialog rather than at the board behind it
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      isTyping(event.target) ||
      isInDialog(event.target)
    )
      return;

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      go(current + (event.key === "ArrowRight" ? 1 : -1));

      return;
    }

    const field = fields[current];
    if (!field) return;

    if (event.key === "a" || event.key === "A") {
      const approve = field.querySelector<HTMLElement>('[data-verdict="approve"]');
      if (approve) {
        event.preventDefault();
        // an assertion, not a toggle. The button under it is a toggle, but the
        // button is pressed while looking at it; this is reached blind, from
        // whichever card the arrows last landed on, and a second press that
        // withdrew the acceptance would leave the reply reporting a question
        // unanswered that the reader believes they accepted. Withdrawing is
        // still one press of the button itself
        if (approve.getAttribute("aria-pressed") !== "true") approve.click();

        return;
      }
    }

    const index = keysOf(field).indexOf(event.key.toLowerCase());
    const option = index < 0 ? undefined : optionsOf(field)[index];
    if (!option) return;

    event.preventDefault();
    // a click, not a checked assignment: it is what moves a radio and a
    // checkbox each in their own way and raises the events the page already
    // listens for, so nothing here has to know how an answer is recorded
    option.click();
  });
}
