/** how long the button reports the outcome before returning to its label. */
const REPORT_MS = 2400;

/**
 * puts text on the clipboard through a throwaway field.
 *
 * the control sits in the collapsed bar, so a reader can press it while the
 * drawer is shut and the reply is `display:none` — and a range over a hidden
 * element selects nothing, which would report a copy that never happened. A
 * field placed off-screen is selectable whatever the drawer is doing. The cost
 * is that the reader no longer sees the reply highlight; the button says what
 * happened instead.
 * @param text the text to copy
 * @returns the field, still selected, or null once the copy succeeded
 */
function copyThroughField(text: string): HTMLTextAreaElement | null {
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.style.cssText = "position:fixed; top:-100vh; left:0; opacity:0";
  document.body.append(field);
  field.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  if (!copied) return field;

  field.remove();

  return null;
}

/**
 * wires the copy button in the collapsed bar.
 *
 * the reply is the page's single sink, so it must stay recoverable when the
 * async clipboard is absent entirely: `file://` has no `navigator.clipboard`,
 * and reading `.writeText` off undefined throws before any rejection handler
 * could run, which is why the guard tests the property rather than catching.
 * @param button the `[data-copy]` control
 * @param reply the element holding the text to copy
 */
export function installCopy(button: HTMLElement, reply: HTMLElement): void {
  // the outcome goes into a span of its own rather than over the button's
  // text, because the button is a glyph and its name has to keep saying what
  // pressing it does while the tick says what pressing it did
  const status = button.querySelector<HTMLElement>("[data-copy-status]")!;
  let pending: HTMLTextAreaElement | null = null;

  const report = (text: string): void => {
    status.textContent = text;
    button.dataset.copyState = text === "Copied" ? "copied" : "manual";
    setTimeout(() => {
      status.textContent = "";
      delete button.dataset.copyState;
      // the field outlives the copy only so the named shortcut has something
      // to act on; it goes when the message it belongs to goes
      pending?.remove();
      pending = null;
    }, REPORT_MS);
  };

  // the fallback leaves a selection the shortcut can act on, so a reader whose
  // clipboard API is unavailable can still press the keys the message names
  const fallback = (): void => {
    pending = copyThroughField(reply.textContent ?? "");
    report(pending ? "Press ⌘C to copy" : "Copied");
  };

  button.addEventListener("click", () => {
    if (typeof navigator.clipboard?.writeText !== "function") {
      fallback();

      return;
    }

    navigator.clipboard
      .writeText(reply.textContent ?? "")
      .then(() => report("Copied"), fallback);
  });
}
