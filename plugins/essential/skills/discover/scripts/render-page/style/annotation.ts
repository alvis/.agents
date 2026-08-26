/** author annotations: pins, ties, annotated code, chips, and disclosures. */
export const ANNOTATION_CSS = `
/* every tied element lights the same way, whatever family it belongs to, so a
   reader learns the highlight once. The transition is gated here rather than in
   the runtime, which only ever toggles a class */
.term,.tie{border-bottom:1px dashed var(--ui-border-strong); cursor:help}
.tie{border-bottom-style:dotted}
.term.is-active,.tie.is-active,.glossary dt.is-active{background:var(--ui-accent-soft); color:var(--ui-accent-ink); border-radius:.25rem; outline:2px solid transparent}
.term:focus-visible,.tie:focus-visible{outline:2px solid var(--ui-focus); outline-offset:2px}
@media (prefers-reduced-motion:no-preference){
.term,.tie,.pin,.pin-note,.code-line{transition:background-color .12s ease, color .12s ease}
}

/* the frame is what a pin's percentage is a percentage OF, so it wraps the
   picture alone; the cards are its sibling, and a pin can never land on one */
.pin-frame{position:relative; display:block}
.pin-layer{position:absolute; inset:0; pointer-events:none}
/* the number is the whole content of a pin, so it carries the contrast floor
   on its own at 12.8px. A fixed ink cannot: the accent is mid-lightness in one
   scheme and light in the other, so white clears 4.5:1 in neither. This pair
   flips with the scheme and is the same pair the card's own badge uses, which
   makes pin N and card N read as one object rather than two numbered things */
.pin{position:absolute; left:var(--pin-x); top:var(--pin-y); display:grid; place-items:center; width:1.75rem; height:1.75rem; margin:-.875rem 0 0 -.875rem; padding:0; border:2px solid var(--ui-accent-ink); border-radius:999px; background:var(--ui-accent-soft); color:var(--ui-accent-ink); font:700 .8rem/1 var(--font-mono); cursor:pointer; pointer-events:auto}
/* the visible dot stays small enough not to cover the thing it points at, while
   the touch target around it reaches the 44px a finger needs */
.pin::after{content:""; position:absolute; width:44px; height:44px}
.pin:focus-visible{outline:3px solid var(--ui-focus); outline-offset:2px}
/* the lit state inverts the same two tokens rather than reaching for a third,
   so the contrast it clears is exactly the contrast the resting state cleared */
.pin.is-active{background:var(--ui-accent-ink); color:var(--ui-accent-soft); transform:scale(1.15)}

.pin-notes{display:grid; gap:.6rem; margin:.9rem 0 0; padding:0; list-style:none}
@media (min-width:34rem){.pin-notes{grid-template-columns:repeat(2,minmax(0,1fr))}}
.pin-note{position:relative; padding:.6rem .7rem .6rem 2.4rem; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-raised); color:var(--ui-ink); font:.86rem/1.55 var(--font-body)}
/* the number is drawn from the data attribute so card N and pin N cannot drift
   apart the way two hand-written numbers would */
.pin-note::before{content:attr(data-pin); position:absolute; left:.6rem; top:.6rem; display:grid; place-items:center; width:1.4rem; height:1.4rem; border-radius:999px; background:var(--ui-accent-soft); color:var(--ui-accent-ink); font:700 .75rem/1 var(--font-mono)}
.pin-note.is-active{border-color:var(--ui-accent); background:var(--ui-accent-soft)}

/* a line is its own row, and its own box. Laid out inline-block it is neither:
   the excerpt's own white-space:pre forbids a break between two inline boxes,
   so every line of an excerpt lands side by side on one enormous row. As a
   block each line stacks, and fit-content under a full-width floor is what
   lets a marked line read as a band across the excerpt without stretching to
   the width of the widest line below it */
.code-line{display:block; width:fit-content; min-width:100%}
.code-line.is-marked{background:var(--ui-amber-soft)}
.code-line.is-active{background:var(--ui-accent-soft); box-shadow:inset 3px 0 var(--ui-accent)}
.code-line mark{background:none; color:inherit; font-weight:700}

.diff-comment{display:block; margin:.4rem 0 .5rem; padding:.55rem .7rem; border:1px solid var(--ui-border); border-left:3px solid var(--ui-amber); border-radius:var(--radius-control); background:var(--ui-surface); white-space:normal}
.diff-comment-head{display:flex; flex-wrap:wrap; gap:.4rem; align-items:center; margin-bottom:.3rem}
.diff-severity{padding:.1rem .4rem; border-radius:999px; background:var(--ui-amber-soft); color:var(--ui-amber-ink); font:700 .72rem/1.5 var(--font-mono); text-transform:uppercase}
.diff-severity[data-severity="critical"],.diff-severity[data-severity="high"]{background:var(--ui-critical-soft); color:var(--ui-critical-ink)}
.diff-where{color:var(--ui-faint); font:.72rem/1.5 var(--font-mono)}
.diff-comment-body{display:block; color:var(--ui-ink); font:.84rem/1.55 var(--font-body)}

.filter-chips{display:flex; flex-wrap:wrap; gap:.4rem; margin:0 0 .8rem}
.chip{display:inline-flex; gap:.35rem; align-items:center; padding:.3rem .7rem; border:1px solid var(--ui-border); border-radius:999px; background:var(--ui-surface); color:var(--ui-muted); font:.78rem/1.5 var(--font-body); cursor:pointer}
.chip:hover{border-color:var(--ui-border-strong); color:var(--ui-ink)}
.chip[aria-pressed="true"]{border-color:var(--ui-accent); background:var(--ui-accent-soft); color:var(--ui-accent-ink)}
.chip-count{font:700 .72rem/1 var(--font-mono)}
/* dimmed, never hidden: the set stays whole, so the counts on the chips keep
   meaning what they say and nothing the reader saw a moment ago disappears */
.is-dimmed{opacity:.34; filter:saturate(.4)}

.diagram-detail{margin:.8rem 0 0; padding:.7rem .8rem; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-surface)}
.diagram-detail-hint{margin:0; color:var(--ui-faint); font:italic .82rem/1.5 var(--font-body)}
.diagram-detail-card h4{margin:0 0 .3rem; font:700 .95rem/1.3 var(--font-display)}
.diagram-detail-card p{margin:0; color:var(--ui-ink); font:.86rem/1.6 var(--font-body)}
.dg-node.is-active .dg-box{stroke:var(--ui-accent); stroke-width:3}

.disclosure{margin:.8rem 0; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-surface)}
.disclosure>summary{padding:.6rem .8rem; color:var(--ui-ink); font:600 .9rem/1.5 var(--font-body); cursor:pointer}
.disclosure>summary:focus-visible{outline:2px solid var(--ui-focus); outline-offset:-2px; border-radius:var(--radius-card)}
.disclosure-body{padding:0 .8rem .8rem}
`;
