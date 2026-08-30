/**
 * grouped records that open for their own detail, carried only by a board that
 * keeps one.
 *
 * every colour aliases a family the page already defines, and the row's tone
 * is set once on the row rather than repeated on each part of it, so a new
 * tone is three custom properties instead of four rules.
 */
export const LEDGER_CSS = `
.ledger{display:grid; gap:.7rem; max-width:64rem}
/* a summary laid out in columns renders no native marker in any engine, so
   both disclosures here draw their own and neither is left without one */
.ledger summary{list-style:none}
.ledger summary::-webkit-details-marker{display:none}
.ledger-twist{display:inline-block; width:.75rem; color:var(--ui-faint); font-size:.72rem; line-height:1.6}
.ledger [open]>summary>.ledger-twist{transform:rotate(90deg)}

.ledger-group{border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-raised); box-shadow:var(--ui-shadow)}
.ledger-group>summary{display:flex; flex-wrap:wrap; gap:.35rem .7rem; align-items:center; padding:.65rem .85rem; border-radius:var(--radius-card); cursor:pointer}
.ledger-group>summary:hover{background:var(--ui-surface)}
.ledger-group>summary:focus-visible{outline:2px solid var(--ui-focus); outline-offset:-2px}
.ledger-group[open]>summary{border-bottom:1px solid var(--ui-border); border-radius:var(--radius-card) var(--radius-card) 0 0}
.ledger-group-name{min-width:0; font:650 .95rem/1.4 var(--font-display); letter-spacing:-.01em; overflow-wrap:anywhere}
.ledger-group-note{flex:1 1 14rem; min-width:0; color:var(--ui-muted); font-size:.84rem; overflow-wrap:anywhere}
.ledger-meter{width:5rem; flex:0 0 auto}
.ledger-count{font:700 .74rem/1 var(--font-mono); font-variant-numeric:tabular-nums; color:var(--ui-faint)}
.ledger-group-body{padding:.75rem .85rem .85rem}
/* the group's own facts are separated from its rows rather than run together
   with them: they describe the group, and read as a first row otherwise */
.ledger-group-body>.ledger-facts{margin-bottom:.75rem; padding-bottom:.75rem; border-bottom:1px dashed var(--ui-border)}

.ledger-facts{display:grid; gap:.3rem; margin:0}
/* the value track is floored at zero rather than left to its own content: a
   recorded path or shell command is one unbreakable word, and an auto minimum
   lets that one word widen the whole row past the card it sits in */
.ledger-fact{display:grid; grid-template-columns:minmax(5.5rem,9rem) minmax(0,1fr); gap:.1rem .8rem}
.ledger-fact dt{color:var(--ui-faint); font:700 .72rem/1.8 var(--font-mono); letter-spacing:.08em; text-transform:uppercase}
.ledger-fact dd{margin:0; color:var(--ui-ink); font:.86rem/1.6 var(--font-body); overflow-wrap:anywhere}

.ledger-entries{display:grid; gap:.35rem; margin:0; padding:0; list-style:none}
.ledger-entry{border:1px solid var(--ui-border); border-left:3px solid var(--row-edge); border-radius:var(--radius-control); background:var(--ui-canvas)}
.ledger-row>summary,.ledger-row.is-flat{display:grid; grid-template-columns:auto auto minmax(0,1fr) auto; gap:.15rem .65rem; align-items:baseline; padding:.45rem .6rem}
.ledger-row>summary{cursor:pointer}
.ledger-row>summary:hover{background:var(--ui-surface)}
.ledger-row>summary:focus-visible{outline:2px solid var(--ui-focus); outline-offset:-2px}
.ledger-code{font:700 .74rem/1.6 var(--font-mono); color:var(--ui-accent-ink)}
.ledger-what{font:.87rem/1.6 var(--font-body); color:var(--ui-ink); overflow-wrap:anywhere}
/* the state is the record's own word, in the row's own family: the edge says
   the same thing in colour, and a reader who cannot use colour still reads it */
.ledger-status{justify-self:end; padding:.05rem .5rem; border-radius:9999px; background:var(--row-wash); color:var(--row-ink); font:700 .72rem/1.7 var(--font-mono); letter-spacing:.06em; text-transform:uppercase; white-space:nowrap}
.ledger-detail{margin:0 .6rem; padding:.55rem 0 .65rem; border-top:1px dashed var(--ui-border)}
.ledger-empty{margin:0; color:var(--ui-faint); font:italic .86rem/1.6 var(--font-body)}

.ledger-entry[data-tone="neutral"]{--row-edge:var(--ui-border-strong); --row-wash:var(--ui-surface); --row-ink:var(--ui-muted)}
.ledger-entry[data-tone="busy"]{--row-edge:var(--ui-accent); --row-wash:var(--ui-accent-soft); --row-ink:var(--ui-accent-ink)}
.ledger-entry[data-tone="good"]{--row-edge:var(--ui-positive); --row-wash:var(--ui-positive-soft); --row-ink:var(--ui-positive-ink)}
.ledger-entry[data-tone="bad"]{--row-edge:var(--ui-critical); --row-wash:var(--ui-critical-soft); --row-ink:var(--ui-critical-ink)}
`;
