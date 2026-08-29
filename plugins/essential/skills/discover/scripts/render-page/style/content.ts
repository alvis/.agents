/** the content blocks added in stage 2: lists, code, definitions, and rails. */
export const CONTENT_CSS = `
.list{margin:0; padding-left:1.3rem; display:grid; gap:.4rem; max-width:70ch; color:var(--ui-muted)}
.list li::marker{color:var(--ui-faint)}
.list strong{color:var(--ui-ink)}

/* the summary leads the page, so it is set apart by an edge rather than a fill:
   a filled panel at the top reads as a banner to skip past */
.tldr{margin:0; padding:1rem 1.2rem; border:1px solid var(--ui-border); border-left:5px solid var(--ui-accent); border-radius:var(--radius-card); background:var(--ui-raised)}
.tldr h3{margin:0 0 .6rem; font:700 .74rem/1.2 var(--font-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--ui-faint)}
.tldr ul{margin:0; padding-left:1.2rem; display:grid; gap:.45rem; max-width:70ch; color:var(--ui-muted)}
.tldr strong{color:var(--ui-ink)}

.code-figure{margin:0; display:grid; gap:.45rem}
.code{margin:0; padding:.95rem 1.1rem; overflow-x:auto; border:1px solid var(--ui-border); border-radius:var(--radius-control); background:var(--ui-surface); font:.86rem/1.6 var(--font-mono); color:var(--ui-ink); tab-size:2}
.code code{font:inherit}
.code[data-language]::before{content:attr(data-language); display:block; margin-bottom:.55rem; font:700 .72rem/1.2 var(--font-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--ui-faint)}
.code-figure figcaption{font-size:.84rem; color:var(--ui-muted)}

/* a question and its answer are one unit, so the pair is boxed rather than the
   list: a reader scanning for "does this cover X" needs the seam between pairs */
.faq,.glossary{margin:0; display:grid; gap:.7rem; max-width:76ch}
.faq dt,.glossary dt{margin:0; font-weight:600; color:var(--ui-ink)}
.faq dd,.glossary dd{margin:.3rem 0 0; color:var(--ui-muted)}
.faq>dt{padding-top:.7rem; border-top:1px solid var(--ui-border)}
.faq>dt:first-child{padding-top:0; border-top:0}
.glossary{grid-template-columns:minmax(8rem,auto) 1fr; gap:.55rem 1rem; align-items:baseline}
.glossary dt{font:700 .8rem/1.5 var(--font-mono); letter-spacing:.04em}
.glossary dd{margin:0}

.readiness{margin:0; padding:0; list-style:none; display:grid; gap:.5rem; max-width:46rem}
.meter-row{display:grid; grid-template-columns:minmax(6rem,10rem) 1fr auto; gap:.5rem .8rem; align-items:center}
.meter-label{font-size:.9rem; color:var(--ui-muted)}
.meter{height:.55rem; border-radius:9999px; background:var(--ui-surface); box-shadow:inset 0 0 0 1px var(--ui-border)}
.meter i{display:block; width:var(--fill); height:100%; border-radius:inherit; background:var(--ui-accent)}
/* tabular figures so a column of readings lines up digit under digit */
.meter-value{font:700 .8rem/1 var(--font-mono); font-variant-numeric:tabular-nums; color:var(--ui-ink)}
.meter-note{grid-column:2/-1; font-size:.82rem; color:var(--ui-faint)}

.owners{margin:0; padding:0; list-style:none; display:flex; flex-wrap:wrap; gap:.45rem}
.owner-chip{display:inline-flex; align-items:center; gap:.45rem; padding:.3rem .7rem .3rem .35rem; border:1px solid var(--ui-border); border-radius:9999px; background:var(--ui-raised); font-size:.85rem}
.owner-initials{display:grid; place-items:center; width:1.6rem; height:1.6rem; border-radius:50%; background:var(--ui-accent-soft); color:var(--ui-accent-ink); font:700 .72rem/1 var(--font-mono)}
.owner-meta{color:var(--ui-faint)}

/* the rating is the pill's own text, so these colours repeat a claim the row
   already makes in words — never the only place it is stated */
.severity-pill{display:inline-block; padding:.1rem .5rem; border:1px solid currentColor; border-radius:.4rem; font:700 .72rem/1.6 var(--font-mono); letter-spacing:.09em; text-transform:uppercase}
.severity-pill[data-severity="critical"]{color:var(--ui-critical-ink); background:var(--ui-critical-soft)}
.severity-pill[data-severity="high"]{color:var(--ui-amber-ink); background:var(--ui-amber-soft)}
.severity-pill[data-severity="medium"]{color:var(--ui-muted); background:var(--ui-surface)}
.severity-pill[data-severity="low"]{color:var(--ui-positive-ink); background:var(--ui-positive-soft)}
.risk-matrix caption{padding:.7rem 1rem; text-align:left; font-size:.82rem; color:var(--ui-faint)}

.failure-map{padding:1rem 1.15rem; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-raised)}
.failure-head{margin:0 0 .8rem; font-family:var(--font-display); font-size:1.05rem; font-weight:560; letter-spacing:-.015em}
.failure-stages{display:grid; gap:.9rem; grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))}
.failure-stage h4{margin:0 0 .4rem; font:700 .72rem/1.2 var(--font-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--ui-faint)}
.failure-stage ul{margin:0; padding-left:1.1rem; display:grid; gap:.3rem; font-size:.9rem; color:var(--ui-muted)}
.failure-stage[data-stage="prevent"]{border-top:3px solid var(--ui-positive); padding-top:.6rem}
.failure-stage[data-stage="detect"]{border-top:3px dashed var(--ui-amber); padding-top:.6rem}
.failure-stage[data-stage="contain"]{border-top:3px dotted var(--ui-critical); padding-top:.6rem}

.timeline{margin:0; padding:0 0 0 1.1rem; list-style:none; display:grid; gap:.7rem; border-left:2px solid var(--ui-border)}
.timeline li{position:relative; display:flex; flex-wrap:wrap; gap:.25rem .7rem; align-items:baseline}
/* the dot is decoration: every state is also spelled out in .moment-state */
.timeline li::before{content:""; position:absolute; left:-1.45rem; top:.45rem; width:.6rem; height:.6rem; border:2px solid var(--ui-border-strong); border-radius:50%; background:var(--ui-canvas)}
.timeline li[data-state="done"]::before{border-color:var(--ui-positive); background:var(--ui-positive)}
.timeline li[data-state="active"]::before{border-color:var(--ui-accent); background:var(--ui-accent-soft)}
.moment-when{flex:none; min-width:4.5rem; font:700 .76rem/1.6 var(--font-mono); letter-spacing:.05em; color:var(--ui-faint)}
/* the classification is a chip on the row rather than a second dot: the dot
   already carries progress, and one marker cannot honestly carry both. Only a
   classified rail takes the title rule, so a timeline written before this
   still lays out exactly as it did */
.moment-kind{flex:none; padding:.05rem .45rem; border:1px solid var(--ui-border); border-radius:.4rem; font:700 .72rem/1.6 var(--font-mono); letter-spacing:.09em; text-transform:uppercase; color:var(--ui-faint); background:var(--ui-raised)}
.timeline li[data-kind] .moment-title{flex:1 1 14rem; min-width:0}
.timeline li[data-kind="discovery"] .moment-kind{border-color:var(--ui-accent); color:var(--ui-accent-ink); background:var(--ui-accent-soft)}
.timeline li[data-kind="deviation"] .moment-kind{border-color:var(--ui-amber); color:var(--ui-amber-ink); background:var(--ui-amber-soft)}
.timeline li[data-kind="todo"] .moment-kind{border-color:var(--ui-critical); color:var(--ui-critical-ink); background:var(--ui-critical-soft)}
.moment-state{flex:none; font:700 .72rem/1.7 var(--font-mono); letter-spacing:.09em; text-transform:uppercase; color:var(--ui-faint)}
.moment-tags{display:inline-flex; flex-wrap:wrap; gap:.3rem}
.moment-tags span{padding:.05rem .45rem; border:1px solid var(--ui-border); border-radius:9999px; font-size:.72rem; color:var(--ui-muted)}

.kanban{margin:0; padding:0; list-style:none; display:grid; gap:.8rem; grid-template-columns:repeat(auto-fit,minmax(12rem,1fr)); align-items:start}
.kanban-lane{padding:.8rem .85rem; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-surface)}
.kanban-lane h4{margin:0 0 .55rem; display:flex; gap:.5rem; align-items:baseline; font:700 .72rem/1.2 var(--font-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--ui-faint)}
.kanban-count{margin-left:auto; font-variant-numeric:tabular-nums; color:var(--ui-muted)}
.kanban-cards{margin:0; padding:0; list-style:none; display:grid; gap:.45rem}
.kanban-card{padding:.5rem .65rem; border:1px solid var(--ui-border); border-radius:var(--radius-control); background:var(--ui-raised); font-size:.88rem}

/* the tone word carries the stance; these rules only repeat it in colour */
.callout-tone{margin-right:.5rem; padding:.1rem .45rem; border:1px solid currentColor; border-radius:.4rem; font:700 .72rem/1.6 var(--font-mono); letter-spacing:.09em; text-transform:uppercase; vertical-align:.08em}
.callout[data-tone="good"]{border-left-color:var(--ui-positive)}
.callout[data-tone="good"] .callout-tone{color:var(--ui-positive-ink); background:var(--ui-positive-soft)}
.callout[data-tone="bad"]{border-left-color:var(--ui-critical)}
.callout[data-tone="bad"] .callout-tone{color:var(--ui-critical-ink); background:var(--ui-critical-soft)}
.callout[data-tone="neutral"] .callout-tone{color:var(--ui-muted); background:var(--ui-surface)}

/* the board-level trade-offs block. .tradeoff-panel rather than .tradeoffs,
   which the choice block's inline pros/cons strip already owns */
.tradeoff-panel{margin:1.4rem 0; padding:1rem 1.1rem; border:1px solid var(--ui-border); border-radius:var(--radius-panel); background:var(--ui-surface)}
.tradeoff-panel h3{margin:0 0 .8rem; font-size:1rem}
.tradeoff-grid{display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))}
.tradeoff-column h4{margin:0 0 .4rem; font:700 .72rem/1.4 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--ui-muted)}
.tradeoff-column ul{margin:0; padding-left:1.1rem; display:flex; flex-direction:column; gap:.3rem}
.tradeoff-column li{font-size:.9rem}
/* the third column carries the block's honesty, so it is set apart rather
   than reading as one more balanced list */
.tradeoff-column[data-tradeoff="wins"] h4{color:var(--ui-positive-ink)}
.tradeoff-column[data-tradeoff="costs"] h4{color:var(--ui-amber-ink)}
.tradeoff-column[data-tradeoff="fails"]{padding-left:.8rem; border-left:2px solid var(--ui-critical)}
.tradeoff-column[data-tradeoff="fails"] h4{color:var(--ui-critical-ink)}
/* a finding's citation anchor: mono, so a reply quoting it back reads as the
   same token, and drawn before the severity it qualifies */
.finding-id{padding:.05em .4em; border:1px solid var(--ui-border-strong); border-radius:.35rem; font:700 .72rem/1.4 var(--font-mono); color:var(--ui-muted)}
/* a row's provenance rides the last cell, so the row stays as wide as one
   making no claim at all */
.row-provenance{margin-left:.4rem; white-space:nowrap}
.sources{margin:2.4rem 0 0; padding-top:1.2rem; border-top:1px solid var(--ui-border)}
.sources h2{margin:0 0 .7rem; font-size:1rem}
.source-list{margin:0; padding-left:1.3rem; display:flex; flex-direction:column; gap:.4rem}
.source{font-size:.88rem; color:var(--ui-muted)}
.source .source-id{margin-left:.4rem; font-family:var(--font-mono); font-weight:700}
.source-standing{margin-left:.5rem}
`.trim();
