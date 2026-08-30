/** the question card and every affordance it may hold. */
export const QUESTION_CSS = `
/* a fieldset defaults to min-inline-size:min-content, which makes it refuse
   to shrink and leaves the min() below with nothing to resolve against.
   Without this the card overflowed a 272px page by 50px. */
.question{min-width:0; margin:0; padding:1.4rem 1.5rem; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-raised); box-shadow:var(--ui-shadow)}
.question legend,.question .q-label{padding:0; font-family:var(--font-display); font-size:1.2rem; font-weight:560; letter-spacing:-.015em}
.question .ask{margin:.5rem 0 1rem; max-width:70ch; color:var(--ui-muted)}
/* min() keeps the track from demanding 17rem in a column narrower than that;
   without it a 272px page overflows by 50px and the card breaks its container */
.choices{display:grid; gap:.6rem; grid-template-columns:repeat(auto-fit,minmax(min(17rem,100%),1fr))}
.choice{display:flex; flex-wrap:wrap; gap:.7rem; align-items:flex-start; padding:.85rem 1rem; border:1px solid var(--ui-border-strong); border-radius:var(--radius-control); background:var(--ui-canvas); cursor:pointer}
.choice:has(input:checked){border-color:var(--ui-accent); box-shadow:inset 3px 0 0 var(--ui-accent)}
/* the body must be allowed to shrink, or a long pro/con clause pushes the
   badge column off the card instead of wrapping inside it */
.choice-body{flex:1 1 12rem; min-width:0}
.choice strong{display:block}
/* the key that chooses this option, drawn by the runtime rather than the
   renderer because the shortcut it advertises only exists while the script
   runs. It is hidden where there is no keyboard to press it: a reader on a
   phone would otherwise be shown a key they have no way to use. */
.option-key{display:none; flex:0 0 auto; min-width:1.4rem; padding:.1rem .3rem; border:1px solid var(--ui-border-strong); border-radius:.35rem; background:var(--ui-raised); color:var(--ui-muted); font:700 .72rem/1.5 var(--font-mono); text-align:center; text-transform:uppercase}
@media (hover:hover) and (pointer:fine){.option-key{display:block}}
/* a plain block wrapper: it exists to give aria-describedby one target for
   the summary and trade-offs, and must not change how they already stack */
.choice-detail{display:block}
.choice small{display:block; margin-top:.2rem; color:var(--ui-muted)}
/* the tags are real words, so they survive greyscale on their own; the pill
   is decoration over that text, never the only thing carrying the meaning.
   Recommended is the one tag the eye should find first, so it alone is
   filled — and it is still the same readable word when the fill is gone. */
.badges{display:flex; flex-wrap:wrap; gap:.35rem; margin-left:auto; align-items:flex-start}
.badge{padding:.22rem .6rem; border:1px solid var(--ui-accent); border-radius:9999px; font:700 .72rem/1.4 var(--font-mono); letter-spacing:.06em; text-transform:uppercase; color:var(--ui-accent-ink)}
.badge[data-tag="Recommended"]{background:var(--ui-accent-soft)}
.badge[data-tag="Hotfix"],.badge[data-tag="Workaround"]{border-color:var(--ui-amber); color:var(--ui-amber-ink)}
/* a <label> only admits phrasing content, so these are spans made list-like
   here rather than a <ul> the parser would lift out of the label */
.tradeoffs{display:flex; flex-wrap:wrap; gap:.5rem 1.2rem; margin-top:.55rem}
.tradeoff{display:flex; flex-direction:column; gap:.15rem; min-width:min(11rem,100%); flex:1 1 11rem}
.tradeoff-label{font:700 .72rem/1.4 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--ui-muted)}
.tradeoff-item{display:block; padding-left:.9rem; text-indent:-.9rem; font-size:.85rem; color:var(--ui-muted)}
.tradeoff-item::before{content:"+ "; font-family:var(--font-mono); font-weight:700}
.tradeoff[data-tradeoff="cons"] .tradeoff-item::before{content:"- "}
/* questions.md asks a material decision to say which answer is recommended
   AND why; the badge is the which, this line is the why */
.recommendation{margin:1rem 0 0; max-width:70ch; padding:.7rem .9rem; border-left:3px solid var(--ui-accent); border-radius:0 var(--radius-control) var(--radius-control) 0; background:var(--ui-accent-soft); color:var(--ui-accent-ink)}
.recommendation-label{margin-right:.4rem; font:700 .72rem/1.4 var(--font-mono); letter-spacing:.06em; text-transform:uppercase}
/* the segmented row is ordinals only; the point's wording rides along as the
   radio's accessible name and the endpoints are spelled out beneath it. The
   input covers its whole segment, so the 44px target is the segment itself. */
.scale{display:flex; flex-wrap:wrap; gap:.4rem}
.scale-point{position:relative; flex:1 1 3.25rem; display:flex; align-items:center; justify-content:center; min-height:2.75rem; padding:.5rem .4rem; border:1px solid var(--ui-border-strong); border-radius:var(--radius-control); background:var(--ui-canvas); font:700 1rem/1 var(--font-mono); cursor:pointer}
.scale-point input{position:absolute; inset:0; margin:0; opacity:0; cursor:pointer}
.scale-point:has(input:checked){border-color:var(--ui-accent); background:var(--ui-accent-soft); color:var(--ui-accent-ink); box-shadow:inset 0 -4px 0 var(--ui-accent)}
.scale-point:has(input:focus-visible){outline:3px solid var(--ui-focus); outline-offset:2px}
.scale-anchors{display:flex; gap:1rem; justify-content:space-between; margin:.55rem 0 0; color:var(--ui-muted); font:600 .74rem/1.4 var(--font-mono); letter-spacing:.05em}
.scale-anchors span:last-child{text-align:right}
/* SC-6 — which verdict is pressed reaches three channels, colour last: the
   words Approve and Change are real text, the button's border goes dashed to
   solid and 1px to 3px, and the leading glyph changes from ○ to ✓/✎. The
   pressed padding drops by the 2px the border gains, so pressing one button
   never reflows the row. Do not collapse the pressed state onto the
   background colour alone — greyscale flattens it. */
.verdicts{display:flex; flex-wrap:wrap; gap:.6rem}
.verdict{display:inline-flex; gap:.45rem; align-items:center; min-height:2.75rem; padding:.6rem 1.1rem; border:1px dashed var(--ui-border-strong); border-radius:var(--radius-control); background:var(--ui-canvas); color:inherit; font:700 .82rem/1.2 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; cursor:pointer}
.verdict::before{content:"\\25CB"; font-family:var(--font-mono)}
.verdict[aria-pressed="true"]{border-style:solid; border-width:3px; padding:.45rem .95rem}
.verdict[aria-pressed="true"]::before{content:"\\2713"}
.verdict[data-verdict="approve"][aria-pressed="true"]{border-color:var(--ui-positive); background:var(--ui-positive-soft); color:var(--ui-positive-ink)}
.verdict[data-verdict="change"][aria-pressed="true"]{border-color:var(--ui-accent); background:var(--ui-accent-soft); color:var(--ui-accent-ink)}
.verdict[data-verdict="change"][aria-pressed="true"]::before{content:"\\270E"}
.verdict-note{margin:1rem 0 0}
.verdict-note[hidden]{display:none}
.verdict-note .q-label{display:block; margin-bottom:.45rem; font-size:1rem}
/* an ordering probe. The list is numbered by CSS rather than by an <ol>
   marker so the number stays put as items move past each other: a marker that
   travelled with its item would report the order the reader started from. */
.probe{margin:0; padding:1.4rem 1.5rem; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-raised); box-shadow:var(--ui-shadow)}
.probe-title{margin:0; font-family:var(--font-display); font-size:1.2rem; font-weight:560; letter-spacing:-.015em}
.probe-hint{margin:.5rem 0 1rem; max-width:70ch; color:var(--ui-muted); font-size:.9rem}
.probe-list{counter-reset:rank; margin:0; padding:0; list-style:none; display:grid; gap:.5rem}
.probe-item{counter-increment:rank; display:flex; gap:.7rem; align-items:center; min-height:2.75rem; padding:.6rem .9rem; border:1px solid var(--ui-border-strong); border-radius:var(--radius-control); background:var(--ui-canvas); cursor:grab}
.probe-item::before{content:counter(rank); flex:0 0 auto; min-width:1.4rem; color:var(--ui-faint); font:700 .82rem/1.4 var(--font-mono)}
.probe-item:focus-visible{outline:3px solid var(--ui-focus); outline-offset:2px}
/* the dragged item stays visible rather than being hidden: a reader watching
   a gap move has to guess what is in it */
.probe-item.is-dragging{opacity:.55; border-style:dashed; cursor:grabbing}
.probe-text{flex:1 1 auto; min-width:0}
.probe-moves{display:flex; gap:.3rem; flex:0 0 auto}
.probe-move{width:2.2rem; min-height:2.2rem; border:1px solid var(--ui-border-strong); border-radius:var(--radius-control); background:var(--ui-raised); color:var(--ui-muted); font:700 .9rem/1 var(--font-mono); cursor:pointer}
.probe-move:hover{border-color:var(--ui-accent); color:var(--ui-accent-ink)}
textarea{width:100%; min-height:6rem; padding:.7rem .85rem; border:1px solid var(--ui-border-strong); border-radius:var(--radius-control); background:var(--ui-canvas); color:inherit; font:1rem/1.5 var(--font-body); resize:vertical}
`.trim();
