/**
 * alternatives laid side by side, carried only by a board that draws one.
 *
 * the track a panel needs follows what it holds, so the block states a density
 * and the sheet owns the number: `references/features.md` section F is where
 * the four floors are defined, and this is the one place they are enforced.
 */
export const VARIANTS_CSS = `
.variants{display:flex; flex-direction:column; gap:.8rem; min-width:0}
.variants-title{margin:0; font-family:var(--font-display); font-weight:560; font-size:1.15rem; letter-spacing:-.015em}
/* the widest a track may need, by what it holds: tile for a number and a label,
   compact for a short label and a line, prose for a claim, wide for code, a
   table, a figure, or several paragraphs */
[data-grid-density="tile"]{--track:8rem}
[data-grid-density="compact"]{--track:14rem}
[data-grid-density="prose"]{--track:22rem}
[data-grid-density="wide"]{--track:30rem}
/* min() lets one track shrink below its floor in a column narrower than it, as
   .choices does; a bare minmax(30rem,1fr) overflows a 272px page */
.variants-grid{display:grid; gap:1rem; align-items:start; grid-template-columns:repeat(auto-fit,minmax(min(var(--track,22rem),100%),1fr))}
/* a grid item will not shrink below its content unless told it may, and a
   figure drawn at natural size would then push its neighbours out of the row
   instead of scrolling inside its own frame */
.variant{display:flex; flex-direction:column; gap:.8rem; min-width:0; padding:1rem 1.1rem; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-surface)}
/* the panel's gap spaces what it holds, so a held block brings no margin of its
   own: a paragraph's would double the gap, and the panel read as loose */
.variant > *{margin:0}
.variant-label{margin:0; font-family:var(--font-display); font-weight:620; font-size:1rem; letter-spacing:-.01em; color:var(--ui-ink)}
`;
