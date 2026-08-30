/**
 * the two glyphs the copy control swaps between, both carried in the markup.
 *
 * emitting both and letting CSS choose keeps the swap off the runtime's hands,
 * exactly as the scheme control does: the button shows a clipboard from the
 * first paint and a tick only while it is reporting a copy that happened.
 * `aria-hidden` is what stops a screen reader announcing two pictures where
 * the button already carries its name and its outcome as text.
 */
export const COPY_ICONS = [
  `<svg class="copy-icon" data-icon="copy" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="8.5" width="11.5" height="12.5" rx="2.2" /><path d="M15.5 8.5V5.2a2.2 2.2 0 0 0-2.2-2.2H5.7a2.2 2.2 0 0 0-2.2 2.2v7.6a2.2 2.2 0 0 0 2.2 2.2H9" /></svg>`,
  `<svg class="copy-icon" data-icon="done" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m4.6 12.4 4.9 5.2L19.4 6.4" /></svg>`,
].join("");
