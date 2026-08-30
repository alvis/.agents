/**
 * one icon per scheme, all three carried in the markup.
 *
 * emitting all three and letting CSS choose keeps the swap off the runtime's
 * hands: the control shows the right glyph from the first paint, and a reader
 * whose scripts never arrive still sees a coherent button rather than a blank
 * one. `aria-hidden` on each is what stops a screen reader announcing three
 * icons where the button already carries its state as text.
 */
export const SCHEME_ICONS = [
  // the system's own choice, shown as a disc lit down one side
  `<svg class="scheme-icon" data-icon="auto" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16Z" class="scheme-fill" /></svg>`,
  `<svg class="scheme-icon" data-icon="light" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.2v2.4M12 19.4v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.2 12h2.4M19.4 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" /></svg>`,
  `<svg class="scheme-icon" data-icon="dark" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.2 14.8A8.6 8.6 0 0 1 9.2 3.8a8.6 8.6 0 1 0 11 11Z" /></svg>`,
].join("");
