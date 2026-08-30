/** the styled spans a rich-text value can carry. */
export const INLINE_CSS = `
code.mono{padding:.1em .35em; border:1px solid var(--ui-border); border-radius:.35rem; background:var(--ui-surface)}
mark{padding:.05em .2em; border-radius:.25rem; background:var(--ui-amber-soft); color:var(--ui-amber-ink)}
.dim{color:var(--ui-faint)}
/* a cell's second line, so a figure and its qualifier share one cell without
   the qualifier competing with it */
.sub{display:block; color:var(--ui-faint); font-size:.85em}
/* SC-6 — the rule under a term is the channel that survives greyscale; the
   definition is carried here and given a real disclosure in a later stage */
.term{border-bottom:1px dotted var(--ui-border-strong)}
.source-ref{padding:.05em .4em; border:1px dashed var(--ui-border-strong); border-radius:.35rem; color:var(--ui-muted); font-family:var(--font-mono); font-size:.86em}
/* the id is authored into the page rather than drawn by the stylesheet, so
   a reader searching for it finds it */
.source-id{font-weight:700}
/* SC-6 — the level is a word in the markup, not a colour and not generated
   content: it survives greyscale, reaches the accessibility tree, and answers
   find-in-page */
.provenance{padding:.05em .5em; border:1px solid var(--ui-border-strong); border-radius:9999px; font-family:var(--font-mono); font-size:.86em}
.provenance-level{font-weight:700; letter-spacing:.06em; text-transform:uppercase}
.provenance[data-provenance="measured"]{border-color:var(--ui-positive); background:var(--ui-positive-soft); color:var(--ui-positive-ink)}
.provenance[data-provenance="estimated"]{border-color:var(--ui-amber); background:var(--ui-amber-soft); color:var(--ui-amber-ink)}
.provenance[data-provenance="assumed"]{border-color:var(--ui-border-strong); background:var(--ui-surface); color:var(--ui-muted)}
.provenance[data-provenance="invented"]{border-color:var(--ui-critical); background:var(--ui-critical-soft); color:var(--ui-critical-ink)}
`.trim();
