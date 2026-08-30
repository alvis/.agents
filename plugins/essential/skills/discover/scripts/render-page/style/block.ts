/** the content blocks: metrics, tables, steps, and findings. */
export const BLOCK_CSS = `
/* wide escape: recovered width goes to grids and tables, never to prose */
.metrics{display:grid; gap:.6rem; grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))}
.metric{padding:.9rem 1rem; border:1px solid var(--ui-border); border-radius:var(--radius-control); background:var(--ui-raised)}
.metric dt{margin:0; font:650 .72rem/1.2 var(--font-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--ui-faint)}
.metric dd{margin:.35rem 0 0; font-size:1.35rem; font-weight:600; letter-spacing:-.01em}

/* positioned so overflow-x can clip the absolutely-positioned .sr-only labels:
   a static ancestor is not their containing block, so they escape the scroller */
.table-wrap{position:relative; overflow-x:auto; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-raised)}
table{width:100%; border-collapse:collapse; font-size:.95rem}
th,td{padding:.8rem 1rem; text-align:left; border-bottom:1px solid var(--ui-border); vertical-align:top}
th{font:700 .74rem/1.2 var(--font-mono); letter-spacing:.09em; text-transform:uppercase; color:var(--ui-faint)}
tbody tr:last-child td{border-bottom:0}
/* the glyph is decorative ::before content, so it reaches no screen reader;
   VERDICT_LABEL emits the same judgement as real text beside it */
.sr-only{position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0 0 0 0); clip-path:inset(50%); white-space:nowrap; border:0}
td[data-verdict]::before{margin-right:.45rem; font-family:var(--font-mono); font-weight:700}
td[data-verdict="good"]{color:var(--ui-positive-ink)} td[data-verdict="good"]::before{content:"+"}
td[data-verdict="mixed"]{color:var(--ui-amber-ink)} td[data-verdict="mixed"]::before{content:"~"}
td[data-verdict="bad"]{color:var(--ui-critical-ink)} td[data-verdict="bad"]::before{content:"!"}

.callout{max-width:70ch; padding:1.1rem 1.3rem; border:1px solid var(--ui-border); border-left:4px solid var(--tone-edge,var(--ui-accent)); border-radius:var(--radius-control); background:var(--tone-wash,var(--ui-accent-soft))}
.callout h3{margin:0 0 .4rem; font-size:1rem; letter-spacing:-.01em}
.callout p{margin:0; color:var(--ui-muted)}

/* SC-6 — a step's progress reaches four channels, colour last: the state word
   as real text, a glyph before it, the marker's border style, then colour. */
.steps{margin:0; padding:0; list-style:none; counter-reset:step; display:grid; gap:.9rem; max-width:70ch}
.step{display:grid; grid-template-columns:2.4rem 1fr; gap:.9rem; align-items:start; counter-increment:step}
.step-marker{display:flex; align-items:center; justify-content:center; width:2.4rem; height:2.4rem; border:2px dashed var(--ui-border-strong); border-radius:50%; background:var(--ui-raised); font:700 .82rem/1 var(--font-mono); color:var(--ui-muted)}
.step-marker::before{content:counter(step,decimal-leading-zero)}
.step[data-step-state="done"] .step-marker{border-style:solid; border-color:var(--ui-positive); background:var(--ui-positive-soft); color:var(--ui-positive-ink)}
.step[data-step-state="current"] .step-marker{border-style:double; border-width:4px; border-color:var(--ui-accent); background:var(--ui-accent-soft); color:var(--ui-accent-ink)}
.step-head{margin:0; display:flex; flex-wrap:wrap; gap:.3rem .7rem; align-items:baseline}
.step-title{font-size:1.02rem; letter-spacing:-.01em}
.step-state{flex:none; font:700 .72rem/1.6 var(--font-mono); letter-spacing:.09em; text-transform:uppercase; color:var(--ui-faint)}
.step-state::before{margin-right:.3rem}
.step[data-step-state="done"] .step-state{color:var(--ui-positive-ink)}
.step[data-step-state="done"] .step-state::before{content:"\\2713"}
.step[data-step-state="current"] .step-state{color:var(--ui-accent-ink)}
.step[data-step-state="current"] .step-state::before{content:"\\25B8"}
.step[data-step-state="todo"] .step-state::before{content:"\\25CB"}
.step p{margin:.25rem 0 0; color:var(--ui-muted)}

/* SC-6 — severity reaches four channels, colour last: the severity word as
   visible text, a glyph, a distinct left-edge style, then colour. The edge
   style is what keeps all four apart under filter:grayscale(1), so it is
   load-bearing: do not collapse these four rules onto one border-style. */
.findings{margin:0; padding:0; list-style:none; display:grid; gap:.85rem}
.finding{padding:1rem 1.15rem; border:1px solid var(--ui-border); border-left:7px solid var(--ui-border-strong); border-radius:var(--radius-control); background:var(--ui-raised)}
.finding-head{margin:0; display:flex; flex-wrap:wrap; gap:.35rem .8rem; align-items:baseline}
.finding-severity{flex:none; padding:.1rem .5rem; border:1px solid currentColor; border-radius:.4rem; font:700 .72rem/1.6 var(--font-mono); letter-spacing:.1em; text-transform:uppercase}
.finding-severity::before{margin-right:.35rem}
.finding-title{margin:0; font-family:var(--font-display); font-size:1.08rem; font-weight:560; letter-spacing:-.015em}
.finding-text{margin:.5rem 0 0; max-width:70ch; color:var(--ui-muted)}
.finding-meta{margin:.7rem 0 0; display:grid; gap:.3rem}
.finding-meta div{display:flex; flex-wrap:wrap; gap:.15rem .5rem}
.finding-meta dt{margin:0; flex:none; font:700 .72rem/1.7 var(--font-mono); letter-spacing:.09em; text-transform:uppercase; color:var(--ui-faint)}
.finding-meta dd{margin:0; font-size:.88rem; color:var(--ui-muted)}
.finding[data-severity="critical"]{border-left-style:double; border-left-color:var(--ui-critical)}
.finding[data-severity="critical"] .finding-severity{color:var(--ui-critical-ink); background:var(--ui-critical-soft)}
.finding[data-severity="critical"] .finding-severity::before{content:"!!"}
.finding[data-severity="elevated"]{border-left-style:solid; border-left-color:var(--ui-amber)}
.finding[data-severity="elevated"] .finding-severity{color:var(--ui-amber-ink); background:var(--ui-amber-soft)}
.finding[data-severity="elevated"] .finding-severity::before{content:"!"}
.finding[data-severity="watch"]{border-left-style:dashed; border-left-color:var(--ui-accent)}
.finding[data-severity="watch"] .finding-severity{color:var(--ui-accent-ink); background:var(--ui-accent-soft)}
.finding[data-severity="watch"] .finding-severity::before{content:"~"}
.finding[data-severity="clear"]{border-left-style:dotted; border-left-color:var(--ui-positive)}
.finding[data-severity="clear"] .finding-severity{color:var(--ui-positive-ink); background:var(--ui-positive-soft)}
.finding[data-severity="clear"] .finding-severity::before{content:"+"}

/* the hub's whole content: one card per board, sized by the blurb rather than
   by a column count, so a run of three and a run of fifteen both read as a
   list of things rather than a grid with holes in it */
.board-index{display:grid; gap:.7rem; grid-template-columns:repeat(auto-fill,minmax(min(18rem,100%),1fr)); margin:0; padding:0; list-style:none}
/* the card is the anchor, so the whole box is the target and the hit area is
   the shape the reader sees. The list item keeps no styling of its own, or the
   border would sit a pixel outside whatever the pointer and the focus ring
   agree is the card — but it does have to hand its full height down, because
   the grid stretches the item and a shorter blurb would otherwise leave one
   card standing 21px short of the row it sits in */
.board-index li{display:grid}
.board-card{padding:.85rem .95rem; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-surface); color:var(--ui-ink); text-decoration:none}
.board-card:hover{border-color:var(--ui-border-strong); background:var(--ui-raised)}
.board-card:focus-visible{outline:2px solid var(--ui-focus); outline-offset:3px}
.board-card[aria-current="page"]{border-color:var(--ui-accent); background:var(--ui-accent-soft)}
.board-card-name{display:block; font:700 1rem/1.35 var(--font-display)}
.board-card:hover .board-card-name{text-decoration:underline}
/* the card the reader is already on links nowhere useful, so it says so in
   words rather than only in colour */
.board-card[aria-current="page"] .board-card-name::after{content:" — you are here"; color:var(--ui-accent-ink); font:600 .78rem/1.4 var(--font-body)}
.board-card-blurb{display:block; margin:.35rem 0 0; color:var(--ui-muted); font:.86rem/1.55 var(--font-body)}
`.trim();
