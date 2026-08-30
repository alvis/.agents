/**
 * the plan-against-code comparison, carried only by a board that draws one.
 *
 * appended per board rather than folded into the page stylesheet for the same
 * reason the observation cards are: a board that never departed from its plan
 * should gain no bytes for the format that reports departures.
 *
 * every colour aliases a family the page already defines, so the dark scheme
 * needs no second block.
 */
export const DEVIATION_CSS = `
.deviation-heading{margin:0 0 .8rem; font:700 .72rem/1.2 var(--font-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--ui-faint)}
/* numbered, because the count is part of what the block reports: one departure
   and nine departures are different changes to be asked to merge */
.deviations{counter-reset:deviation; display:grid; gap:.85rem; margin:0; padding:0; list-style:none}
.deviation{counter-increment:deviation; position:relative; padding:1.1rem 1.2rem 1.1rem 3.2rem; border:1px solid var(--ui-border-strong); border-left:3px solid var(--ui-amber); border-radius:var(--radius-card); background:var(--ui-canvas)}
.deviation::before{content:counter(deviation); position:absolute; inset-block-start:1.15rem; inset-inline-start:1.1rem; min-width:1.5rem; color:var(--ui-amber-ink); font:700 .9rem/1 var(--font-mono); text-align:end}
.deviation-title{margin:0 0 .8rem; font-family:var(--font-display); font-size:1rem; font-weight:560; letter-spacing:-.01em}
/* one column below the fold-out width: two 12rem columns of prose set side by
   side on a phone are two columns of one word each */
.deviation-pair{display:grid; gap:.7rem}
@media (min-width:44rem){
  .deviation-pair{grid-template-columns:1fr 1fr; gap:1rem}
}
.deviation-side{padding:.7rem .8rem; border:1px solid var(--ui-border); border-radius:var(--radius-control); background:var(--ui-surface)}
.deviation-side[data-side="found"]{border-color:var(--ui-amber); background:var(--ui-amber-soft)}
.deviation-label{margin:0 0 .35rem; font:700 .72rem/1.5 var(--font-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--ui-faint)}
.deviation-side[data-side="found"] .deviation-label{color:var(--ui-amber-ink)}
.deviation-body{color:var(--ui-muted); font-size:.92rem}
/* a list rather than a third column: the choice answers a different question
   from the two above it, and a third column would invite a comparison */
.deviation-outcome{display:grid; gap:.15rem .9rem; margin:.85rem 0 0; padding-top:.8rem; border-top:1px dashed var(--ui-border-strong)}
.deviation-outcome dt{color:var(--ui-faint); font:700 .72rem/1.5 var(--font-mono); letter-spacing:.1em; text-transform:uppercase}
.deviation-outcome dd{margin:0 0 .5rem; color:var(--ui-ink)}
.deviation-outcome dd:last-of-type{margin-bottom:0}
@media (min-width:34rem){
  .deviation-outcome{grid-template-columns:auto 1fr; align-items:baseline}
  .deviation-outcome dt{padding-top:.15rem}
  .deviation-outcome dd{margin-bottom:0}
}
`;
