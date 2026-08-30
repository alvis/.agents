/**
 * the observation cards, carried only by a board that holds a set of them.
 *
 * appended per board rather than folded into the page stylesheet for the same
 * reason the code palette is: a board that never draws a card should gain no
 * bytes for the format, and the fifteen boards that came before this block
 * existed still render to the bytes they always did.
 *
 * every colour aliases a family the page already defines, so the dark scheme
 * needs no second block.
 */
export const OBSERVATION_CSS = `
/* one column, not a grid: a card is read down and compared against the one
   above it, and two columns of five-line cards make that a diagonal scan */
.observations{counter-reset:observation; display:grid; gap:.75rem; margin:0; padding:0; list-style:none}
/* the number is drawn from a counter rather than authored, so inserting a card
   renumbers the set instead of leaving the author to renumber it by hand */
.observation{counter-increment:observation; position:relative; padding:1.1rem 1.2rem 1.1rem 3.2rem; border:1px solid var(--ui-border-strong); border-radius:var(--radius-control); background:var(--ui-canvas)}
.observation::before{content:counter(observation); position:absolute; inset-block-start:1.15rem; inset-inline-start:1.1rem; min-width:1.5rem; color:var(--ui-faint); font:700 .9rem/1 var(--font-mono); text-align:end}
.observation-head{display:flex; gap:.75rem; align-items:flex-start}
.observation-title{flex:1 1 12rem; min-width:0; margin:0; font-family:var(--font-display); font-size:1rem; font-weight:560; letter-spacing:-.01em}
/* the source badge: a circle, so it reads as an avatar rather than as another
   tag competing with the citation code at the top of the card */
.observation-source{flex:0 0 auto; display:grid; place-items:center; width:1.75rem; height:1.75rem; border:1px solid var(--ui-border-strong); border-radius:50%; background:var(--ui-surface); color:var(--ui-muted); font:600 .72rem/1 var(--font-mono); letter-spacing:.02em}
.observation-file{margin:.35rem 0 0; color:var(--ui-faint); font:.78rem/1.4 var(--font-mono); overflow-wrap:anywhere}
/* the two labels are the same two questions of every card, so they are set as
   a column a reader can run down rather than as leads inside the prose */
.observation-detail{display:grid; gap:.15rem .9rem; margin:.75rem 0 0}
.observation-detail dt{color:var(--ui-faint); font:700 .72rem/1.5 var(--font-mono); letter-spacing:.1em; text-transform:uppercase}
.observation-detail dd{margin:0 0 .5rem; color:var(--ui-muted)}
.observation-detail dd:last-of-type{margin-bottom:0}
@media (min-width:34rem){
  .observation-detail{grid-template-columns:auto 1fr; align-items:baseline}
  .observation-detail dt{padding-top:.15rem}
  .observation-detail dd{margin-bottom:0}
}
/* dashed, because the rule separates the case from the question it leads to
   rather than dividing two cards; a solid line at this width reads as an edge */
.observation-tick{display:flex; gap:.6rem; align-items:center; margin-top:.9rem; padding-top:.8rem; border-top:1px dashed var(--ui-border-strong); color:var(--ui-muted); font-size:.9rem; cursor:pointer}
.observation:has(input:checked){border-color:var(--ui-accent); box-shadow:inset 3px 0 0 var(--ui-accent)}
.observation:has(input:checked) .observation-tick{color:var(--ui-accent-ink); font-weight:600}
`;
