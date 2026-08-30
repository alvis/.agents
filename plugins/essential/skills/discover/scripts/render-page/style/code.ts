/**
 * everything a source excerpt needs, carried only by a board that holds one.
 *
 * it is appended per board rather than folded into the page stylesheet because
 * a board with no code should gain nothing from a feature it does not use, and
 * this is the only half of syntax colour that reaches a reader at all: the
 * grammar runs in the builder and the page receives measured spans, so what
 * ships is a palette rather than a parser.
 *
 * every colour aliases a family the page already defines, so the dark scheme
 * needs no second block: `--ui-accent-ink` is dark on a light canvas and light
 * on a dark one, and a palette written out of those follows the reader's
 * choice without being restated.
 */
export const CODE_CSS = `
.code{--t-comment:var(--ui-faint); --t-punct:var(--ui-muted); --t-keyword:var(--tag-ideal);
  --t-string:var(--ui-positive); --t-number:var(--ui-amber-ink); --t-function:var(--tag-architectural);
  --t-name:var(--ui-accent-ink); --t-tag:var(--ui-accent)}
.code .t-comment,.code .t-prolog,.code .t-doctype,.code .t-cdata{color:var(--t-comment); font-style:italic}
.code .t-punctuation,.code .t-template-punctuation{color:var(--t-punct)}
.code .t-keyword,.code .t-control-flow,.code .t-atrule,.code .t-important,.code .t-directive{color:var(--t-keyword); font-weight:600}
.code .t-string,.code .t-char,.code .t-attr-value,.code .t-regex,.code .t-template-string,.code .t-url{color:var(--t-string)}
.code .t-number,.code .t-boolean,.code .t-constant,.code .t-symbol,.code .t-literal-property{color:var(--t-number)}
.code .t-function,.code .t-class-name,.code .t-known-class-name,.code .t-maybe-class-name,.code .t-builtin,.code .t-decorator{color:var(--t-function)}
.code .t-attr-name,.code .t-property,.code .t-parameter,.code .t-variable,.code .t-entity{color:var(--t-name)}
.code .t-tag,.code .t-selector,.code .t-operator,.code .t-arrow,.code .t-spread{color:var(--t-tag)}
.code .t-inserted{color:var(--ui-positive-ink); background:var(--ui-positive-soft)}
.code .t-deleted{color:var(--ui-critical-ink); background:var(--ui-critical-soft)}
.code .t-namespace{opacity:.7}

/* no radius on the run itself: a selection is drawn as one piece a line, and a
   rounded edge on every cut would notch the run wherever colour changed under
   it. The underline is what makes the run read as picked rather than merely
   shaded, which matters most where a marked line is already shaded */
.code-pick{background:var(--ui-accent-soft); box-shadow:inset 0 -2px 0 var(--ui-accent)}
.code-pick-mark{margin-left:.1em; padding:0 .3em; border-radius:.7em; background:var(--ui-accent);
  color:var(--ui-canvas); font:700 .72rem/1.4 var(--font-body); vertical-align:.45em}
.code-notes{margin:0; padding-left:1.6rem; display:grid; gap:.4rem; font-size:.9rem; color:var(--ui-muted)}
.code-notes li::marker{color:var(--ui-accent); font-weight:700}
.code-note-body{color:var(--ui-ink)}

.code-path{margin:0 0 -.2rem; display:flex; align-items:baseline; justify-content:space-between; gap:.75rem}
.code-path-file{font:.78rem/1.4 var(--font-mono); color:var(--ui-muted); overflow-wrap:anywhere}
.code-path-language{font:700 .72rem/1.4 var(--font-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--ui-faint)}
/* the panel already names its language, so the excerpt does not say it twice */
.code-path + .code[data-language]::before{display:none}

.code-pair{margin:0; display:grid; gap:.6rem}
.code-eyebrow{margin:0; font:700 .72rem/1.4 var(--font-mono); letter-spacing:.14em; text-transform:uppercase; color:var(--ui-faint)}
.code-pair-title{font:600 1rem/1.4 var(--font-body); color:var(--ui-ink)}
.code-panels{display:grid; gap:.75rem; align-items:start}
.code-panel{display:grid; gap:.35rem; min-width:0}
@media (min-width:60rem){.code-panels{grid-template-columns:repeat(2,minmax(0,1fr))}}
`.trim();
