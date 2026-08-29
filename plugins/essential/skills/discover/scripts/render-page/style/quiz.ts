/**
 * the merge quiz and the verdict it feeds, carried only by a board that asks.
 *
 * the rationale under each answer is revealed by the sheet rather than by the
 * runtime, so a reader with scripting off who answers a question still finds
 * out why the answer holds; only the verdict itself needs script, and it says
 * so in the markup it ships with.
 *
 * every colour aliases a family the page already defines, so the dark scheme
 * needs no second block.
 */
export const QUIZ_CSS = `
.quiz-options{display:grid; gap:.5rem; margin-top:.9rem}
.quiz-option{display:grid; grid-template-columns:auto 1fr; gap:.2rem .7rem; padding:.7rem .85rem; border:1px solid var(--ui-border-strong); border-radius:var(--radius-control); background:var(--ui-canvas); cursor:pointer}
.quiz-option input{grid-row:1; margin:.2rem 0 0}
.quiz-value{grid-row:1}
/* the rationale is hidden until this question is answered, so reading it is
   never a way of finding the answer without giving one */
.quiz-because{grid-column:2; display:none; color:var(--ui-muted); font-size:.86rem}
.quiz-options:has(input:checked) .quiz-option:has(input:checked) .quiz-because{display:block}
.quiz-option:has(input:checked){border-color:var(--ui-accent); box-shadow:inset 3px 0 0 var(--ui-accent)}
.quiz-option:has(input:checked) .quiz-value{font-weight:600}

.gate{margin-top:1rem; padding:1.1rem 1.2rem; border:1px solid var(--ui-border-strong); border-radius:var(--radius-card); background:var(--ui-surface)}
.gate-title{margin:0; font-family:var(--font-display); font-size:1.05rem; font-weight:560; letter-spacing:-.01em}
.gate-progress{margin:.4rem 0 .8rem; font:700 .74rem/1.6 var(--font-mono); letter-spacing:.06em; color:var(--ui-faint); font-variant-numeric:tabular-nums}
.gate-verdict{color:var(--ui-muted)}
/* the state is a border and a word, never a colour alone: the two verdicts say
   opposite things and a reader in greyscale has to be able to tell which */
.gate[data-gate-state="cleared"]{border-color:var(--ui-positive); background:var(--ui-positive-soft)}
.gate[data-gate-state="cleared"] .gate-progress{color:var(--ui-positive-ink)}
.gate[data-gate-state="blocked"]{border-color:var(--ui-critical); background:var(--ui-critical-soft)}
.gate[data-gate-state="blocked"] .gate-progress{color:var(--ui-critical-ink)}
.gate-misses{display:grid; gap:.4rem; margin:.8rem 0 0; padding:0; list-style:none}
.gate-misses:empty{display:none}
.gate-miss{padding:.5rem .7rem; border:1px solid var(--ui-critical); border-radius:var(--radius-control); background:var(--ui-canvas); font-size:.9rem}
.gate-miss a{color:var(--ui-accent-ink)}
`;
