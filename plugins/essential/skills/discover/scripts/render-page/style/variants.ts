/**
 * the narrowest a panel of prose may be drawn, as a CSS length.
 *
 * the lower bound of the 45–75ch measure a line of prose reads well in, taken
 * in the body face at the body size: `ch` resolves against the grid's own
 * font, so it is the reader's installed face being measured, not an estimate
 * of one. The 2.4rem is what a panel spends outside its text: 1.1rem of
 * padding a side plus the 1px borders, rounded up.
 */
export const PROSE_TRACK = "calc(45ch + 2.4rem)";

/**
 * the widest track at which two panels still sit side by side on a desktop.
 *
 * the boards are judged on a 1280px viewport, where the reading column is the
 * viewport less a `--pad` either side, not the cap: the cap only governs a
 * viewport wider than itself, so deriving from it put two panels in a row only
 * on a screen larger than the one a laptop has. A classic 1rem scrollbar takes
 * its width from the viewport, and the grid's 1rem gap sits between the two, so
 * both come off before the remainder is halved. That is 37.5rem, about 63
 * columns of the excerpt face once the panel and the excerpt have taken their
 * padding.
 */
export const DESKTOP_PANEL = "calc((80rem - 2 * var(--pad) - 1rem - 1rem) / 2)";

/**
 * the narrowest a panel holding code or a figure may be drawn, as a CSS length.
 *
 * a panel wider than a desktop half could never be one of two, so the
 * comparison would stack on every screen and stop being a comparison; code
 * wider than the panel holds scrolls inside its own frame, which is where a
 * figure drawn at natural size goes too. It is never narrower than the prose
 * track, because a panel that holds a figure cannot be tighter than one that
 * holds only words.
 */
export const WIDE_TRACK = `max(${PROSE_TRACK}, ${DESKTOP_PANEL})`;

/**
 * alternatives laid side by side, carried only by a board that draws one.
 *
 * the block states a density from what its panels hold, `wide` or `prose`,
 * and the sheet owns the width: this is the one place either is written.
 * Prose is the default, so a grid that names no density is a comparison of
 * claims, which is what the prose track is for.
 */
export const VARIANTS_CSS = `
.variants{display:flex; flex-direction:column; gap:.8rem; min-width:0}
.variants-title{margin:0; font-family:var(--font-display); font-weight:560; font-size:1.15rem; letter-spacing:-.015em}
/* min() lets one track shrink below its floor in a column narrower than it, as
   .choices does; a bare minmax(30rem,1fr) overflows a 272px page */
/* stretch, so panels compared side by side are as tall as one another: unequal
   heights read as unequal weight. A figure inside one still scrolls in its own
   frame, because the panel holds it and the frame is what overflows */
.variants-grid{--track:${PROSE_TRACK}; display:grid; gap:1rem; align-items:stretch; grid-template-columns:repeat(auto-fit,minmax(min(var(--track),100%),1fr))}
.variants-grid[data-grid-density="wide"]{--track:${WIDE_TRACK}}
/* a grid item will not shrink below its content unless told it may, and a
   figure drawn at natural size would then push its neighbours out of the row
   instead of scrolling inside its own frame */
.variant{display:flex; flex-direction:column; gap:.8rem; min-width:0; padding:1rem 1.1rem; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-surface)}
/* the panel's gap spaces what it holds, so a held block brings no margin of its
   own: a paragraph's would double the gap, and the panel read as loose */
.variant > *{margin:0}
.variant-label{margin:0; font-family:var(--font-display); font-weight:620; font-size:1rem; letter-spacing:-.01em; color:var(--ui-ink)}
`;
