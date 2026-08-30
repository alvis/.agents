/**
 * the dark half of the palette, without its selector.
 *
 * it is emitted twice — once behind `prefers-color-scheme` for readers who
 * never touch the control, and once behind `[data-theme="dark"]` for readers
 * who do. Holding it here is what keeps those two copies from drifting.
 */
const DARK_TOKENS = `
  --ui-canvas:oklch(.165 .014 268); --ui-surface:oklch(.215 .016 268); --ui-raised:oklch(.255 .018 268);
  --ui-ink:oklch(.955 .006 268); --ui-muted:oklch(.78 .012 268); --ui-faint:oklch(.67 .014 268);
  --ui-border:oklch(.315 .018 268); --ui-border-strong:oklch(.46 .024 268);
  --ui-accent:oklch(.72 .17 275); --ui-accent-soft:oklch(.285 .085 275); --ui-accent-ink:oklch(.87 .11 278);
  --ui-positive:oklch(.78 .16 160); --ui-positive-soft:oklch(.285 .07 162); --ui-positive-ink:oklch(.89 .14 160);
  --ui-amber:oklch(.82 .15 78); --ui-amber-soft:oklch(.3 .07 74); --ui-amber-ink:oklch(.92 .11 84);
  --ui-critical:oklch(.7 .19 22); --ui-critical-soft:oklch(.3 .09 22); --ui-critical-ink:oklch(.85 .13 20);
  --ui-focus:oklch(.75 .17 275); --ui-shadow:0 1px 2px oklch(.06 .02 268/.6), 0 14px 38px oklch(.06 .02 268/.45);
  --tag-architectural:oklch(.78 .12 205); --tag-architectural-soft:oklch(.28 .06 205); --tag-architectural-ink:oklch(.87 .1 205);
  --tag-ideal:oklch(.72 .18 305); --tag-ideal-soft:oklch(.29 .08 305); --tag-ideal-ink:oklch(.87 .12 305);
  --tag-pragmatic:oklch(.74 .17 345); --tag-pragmatic-soft:oklch(.3 .08 345); --tag-pragmatic-ink:oklch(.87 .12 345);
`.trim();

/**
 * the design tokens every rule reads, in both colour schemes.
 *
 * this is the default theme and only the default: a board rendered for a
 * product is expected to arrive with that product's own tokens, and every rule
 * in every other style module reads these names rather than a colour, so
 * replacing this block is the whole of retheming a board.
 *
 * the palette is neutral-cool rather than warm, and the display face is a
 * grotesk rather than a serif, because the boards are engineering documents:
 * one saturated hue carries every interactive affordance, the greys stay out
 * of its way, and the semantic families — positive, amber, critical — are the
 * only other colours a reader ever has to decode.
 */
export const TOKEN_CSS = `
:root{
  --ui-canvas:#fafbfd; --ui-surface:#f1f3f8; --ui-raised:#fff;
  --ui-ink:#171a24; --ui-muted:#565b66; --ui-faint:#7b808b;
  --ui-border:#e0e3e8; --ui-border-strong:#b9bec7;
  --ui-accent:#4d5fe4; --ui-accent-soft:#edf3ff; --ui-accent-ink:#3845bf;
  --ui-positive:#00a062; --ui-positive-soft:#e4faec; --ui-positive-ink:#007343;
  --ui-amber:#d78c00; --ui-amber-soft:#fff1d6; --ui-amber-ink:#9c5a00;
  --ui-critical:#dd2c3e; --ui-critical-soft:#ffebe9; --ui-critical-ink:#b3102a;
  --ui-focus:#5a70f5; --ui-shadow:0 1px 2px rgba(23,26,36,.05), 0 12px 32px rgba(23,26,36,.07);
  /* one triple per tag in questions.md's closed vocabulary, in that reference's
     order. Three alias a family the page already owns and follow it into dark
     without a second definition; cyan, violet and rose belong to the tags, and
     are what the dark block restates. None of the three sits near the accent's
     indigo, which is the hue every control on the page already wears: a tag
     that borrowed it would read as an affordance rather than as a label.
     Recommended takes the positive family deliberately — agreeing with the
     page is one colour, and a recommended option and a confirmed answer are
     the same act seen before and after. token.spec.ts measures what a reader
     can actually tell apart and holds it to a threshold. */
  --tag-architectural:#008f9f; --tag-architectural-soft:#ddfafd; --tag-architectural-ink:#006875;
  --tag-ideal:#8e47cd; --tag-ideal-soft:#f8efff; --tag-ideal-ink:#6f29a7;
  --tag-recommended:var(--ui-positive); --tag-recommended-soft:var(--ui-positive-soft); --tag-recommended-ink:var(--ui-positive-ink);
  --tag-pragmatic:#ca449a; --tag-pragmatic-soft:#ffecf8; --tag-pragmatic-ink:#9d1f74;
  --tag-hotfix:var(--ui-critical); --tag-hotfix-soft:var(--ui-critical-soft); --tag-hotfix-ink:var(--ui-critical-ink);
  --tag-workaround:var(--ui-amber); --tag-workaround-soft:var(--ui-amber-soft); --tag-workaround-ink:var(--ui-amber-ink);
  --radius-control:.5rem; --radius-card:.875rem;
  /* system faces only, because a board fetches nothing: the display and body
     stacks resolve to the platform grotesk a reader already has installed, and
     the layout's tight tracking is set for one */
  --font-display:"SF Pro Display",Inter,-apple-system,"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;
  --font-body:"SF Pro Text",Inter,-apple-system,"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;
  --font-mono:ui-monospace,"SF Mono","JetBrains Mono","Cascadia Code",Menlo,Consolas,monospace;
  --pad:1.5rem; --cap:78rem; --bar:48px;
  color-scheme:light dark;
}
/* the reader's own choice outranks the system's, so the system rule steps
   aside for it rather than being overridden after the fact */
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
${DARK_TOKENS}
}}
:root[data-theme="dark"]{
${DARK_TOKENS}
}
/* form controls and scrollbars follow the chosen scheme, not the system's */
:root[data-theme="light"]{color-scheme:light}
:root[data-theme="dark"]{color-scheme:dark}
html{scroll-behavior:smooth; scroll-padding-top:1.5rem}
body{
  margin:0; background:var(--ui-canvas); color:var(--ui-ink);
  font:1rem/1.6 var(--font-body); -webkit-font-smoothing:antialiased;
  padding-bottom:calc(var(--bar) + 1.5rem + env(safe-area-inset-bottom));
}
:focus-visible{outline:3px solid var(--ui-focus); outline-offset:2px; border-radius:6px}
.mono{font-family:var(--font-mono); font-size:.86em}
`.trim();
