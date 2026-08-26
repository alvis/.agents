/** reader annotations: the section control, the note lists, and the editor. */
export const NOTE_CSS = `
/* the section heading becomes a row so the note control can sit at its end
   without being inside the heading text, where it would join the h2 accessible
   name and be read as part of the title */
.section-heading{display:flex; flex-wrap:wrap; gap:.4rem .8rem; align-items:baseline}
.section-heading h2{flex:1 1 auto}
.note-add{display:inline-flex; gap:.3rem; align-items:center; align-self:center; padding:.3rem .5rem; border:1px solid var(--ui-border); border-radius:999px; background:var(--ui-surface); color:var(--ui-muted); cursor:pointer}
.note-add:hover{border-color:var(--ui-border-strong); color:var(--ui-ink)}
.note-icon{width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round}
/* the tally is empty until a section holds a note, and an empty inline-flex box
   would still draw its padding as a stray dot beside the icon */
.note-tally{font:700 .72rem/1 var(--font-mono)}
.note-tally:empty{display:none}

.note-list{display:grid; gap:.5rem; margin:.9rem 0 0; padding:0; list-style:none}
.note-list:empty{display:none}
.note-row{display:grid; gap:.3rem; padding:.6rem .7rem; border:1px solid var(--ui-border); border-left:3px solid var(--ui-accent); border-radius:var(--radius-card); background:var(--ui-raised)}
.note-where{color:var(--ui-accent-ink); font:700 .72rem/1.4 var(--font-mono); text-decoration:none}
.note-where:hover{text-decoration:underline}
/* the quote is what the note points at, so it is set apart from the note itself
   rather than reading as more of the reader's own words */
.note-quote-text{color:var(--ui-muted); font:italic .82rem/1.5 var(--font-body); quotes:'"' '"'}
.note-text{margin:0; color:var(--ui-ink); font:.86rem/1.55 var(--font-body); white-space:pre-wrap}
.note-text.is-empty{color:var(--ui-muted); font-style:italic}
.note-row-actions{display:flex; gap:.4rem}
.note-edit,.note-remove-row{padding:.2rem .5rem; border:1px solid var(--ui-border); border-radius:var(--radius-control); background:var(--ui-surface); color:var(--ui-muted); font:650 .72rem/1.4 var(--font-body); cursor:pointer}
.note-edit:hover,.note-remove-row:hover{border-color:var(--ui-border-strong); color:var(--ui-ink)}

.drawer-notes{display:grid; gap:.5rem; align-content:start}
.note-count{padding:.1rem .5rem; border:1px solid var(--ui-border); border-radius:999px; color:var(--ui-muted); font:700 .72rem/1.5 var(--font-mono)}
.note-clear{justify-self:start; padding:.3rem .6rem; border:1px solid var(--ui-critical); border-radius:var(--radius-control); background:var(--ui-critical-soft); color:var(--ui-critical-ink); font:650 .74rem/1.4 var(--font-body); cursor:pointer}

/* the pill follows the selection in document coordinates, so it is positioned
   absolutely against the page rather than fixed to the viewport */
.selection-pill{position:absolute; z-index:70; padding:.32rem .6rem; border:1px solid var(--ui-accent); border-radius:999px; background:var(--ui-accent-soft); color:var(--ui-accent-ink); font:700 .74rem/1.4 var(--font-body); box-shadow:0 6px 18px var(--ui-shadow); cursor:pointer}

.note-dialog{width:min(34rem,calc(100vw - 2rem)); padding:0; border:1px solid var(--ui-border-strong); border-radius:var(--radius-card); background:var(--ui-surface); color:var(--ui-ink)}
.note-dialog::backdrop{background:rgba(20,20,19,.44)}
.note-form{display:grid; gap:.6rem; padding:1rem}
.note-form h3{margin:0; font:700 1rem/1.3 var(--font-display)}
.note-dialog-quote{color:var(--ui-muted); font:italic .84rem/1.55 var(--font-body)}
.note-dialog-quote[hidden]{display:none}
.note-label{color:var(--ui-muted); font:700 .72rem/1.4 var(--font-mono); letter-spacing:.08em; text-transform:uppercase}
.note-input{width:100%; padding:.55rem .65rem; border:1px solid var(--ui-border-strong); border-radius:var(--radius-control); background:var(--ui-canvas); color:var(--ui-ink); font:.9rem/1.55 var(--font-body); resize:vertical}
.note-dialog-actions{display:flex; flex-wrap:wrap; gap:.5rem; align-items:center}
/* the spacer is what pushes cancel and save away from remove, so the
   destructive control is never adjacent to the one the reader wants */
.note-dialog-spacer{flex:1 1 auto}
.note-drop{padding:.35rem .7rem; border:1px solid var(--ui-critical); border-radius:var(--radius-control); background:var(--ui-critical-soft); color:var(--ui-critical-ink); font:650 .78rem/1.4 var(--font-body); cursor:pointer}
.note-drop[hidden]{display:none}
.note-cancel{padding:.35rem .7rem; border:1px solid var(--ui-border); border-radius:var(--radius-control); background:var(--ui-surface); color:var(--ui-ink); font:650 .78rem/1.4 var(--font-body); cursor:pointer}
.note-save{padding:.35rem .8rem; border:1px solid var(--ui-accent); border-radius:var(--radius-control); background:var(--ui-accent); color:var(--ui-accent-ink); font:700 .78rem/1.4 var(--font-body); cursor:pointer}
`;
