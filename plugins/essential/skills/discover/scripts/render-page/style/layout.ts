/** the reading column, the masthead, and section structure. */
export const LAYOUT_CSS = `
/* SC-3 — the reading column is min(available, cap) and is centred, so it is
   monotonic non-decreasing in viewport width by construction. No element
   reserves fixed horizontal space beside it at any width. */
.page{width:min(100% - 2 * var(--pad), var(--cap)); margin-inline:auto; padding-block:3rem 4rem}
.prose{max-width:70ch}

.masthead{display:flex; flex-direction:column; gap:.9rem; margin-bottom:3.5rem}
.eyebrow{display:flex; gap:.7rem; align-items:center; margin:0; color:var(--ui-muted); font:650 .72rem/1.3 var(--font-mono); letter-spacing:.13em; text-transform:uppercase}
.eyebrow::before{content:""; width:2rem; height:1px; background:var(--ui-accent)}
h1{margin:0; max-width:20ch; font-family:var(--font-display); font-weight:500; font-size:clamp(2.1rem,4.2vw,3.2rem); line-height:1.04; letter-spacing:-.04em; text-wrap:balance}
.lede{margin:0; max-width:60ch; color:var(--ui-muted); font-size:1.05rem}

/* SC-3 — heading stacks directly above its body in normal flow. */
.section{display:flex; flex-direction:column; gap:1.1rem; margin-block:3.25rem}
.section-heading{display:flex; flex-direction:column; gap:.45rem}
.section-heading h2{margin:0; max-width:24ch; font-family:var(--font-display); font-weight:540; font-size:clamp(1.6rem,2.6vw,2.1rem); line-height:1.12; letter-spacing:-.025em}
.section-no{font:700 .72rem/1 var(--font-mono); letter-spacing:.14em; color:var(--ui-accent-ink)}
.section-body{display:flex; flex-direction:column; gap:1.4rem}
`.trim();
