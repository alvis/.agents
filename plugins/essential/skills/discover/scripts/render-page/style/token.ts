/**
 * the dark half of the palette, without its selector.
 *
 * it is emitted twice — once behind `prefers-color-scheme` for readers who
 * never touch the control, and once behind `[data-theme="dark"]` for readers
 * who do. Holding it here is what keeps those two copies from drifting.
 */
const DARK_TOKENS = `
  --ui-canvas:oklch(.16 .012 62); --ui-surface:oklch(.2 .014 62); --ui-raised:oklch(.235 .016 62);
  --ui-ink:oklch(.92 .012 80); --ui-muted:oklch(.75 .018 75); --ui-faint:oklch(.66 .018 75);
  --ui-border:oklch(.33 .018 66); --ui-border-strong:oklch(.5 .03 62);
  --ui-accent:oklch(.75 .14 48); --ui-accent-soft:oklch(.29 .055 43); --ui-accent-ink:oklch(.9 .055 58);
  --ui-positive:oklch(.74 .1 146); --ui-positive-soft:oklch(.27 .045 145); --ui-positive-ink:oklch(.9 .05 145);
  --ui-amber:oklch(.82 .11 74); --ui-amber-soft:oklch(.31 .055 70); --ui-amber-ink:oklch(.92 .05 82);
  --ui-critical:oklch(.7 .15 30); --ui-critical-soft:oklch(.31 .07 30); --ui-critical-ink:oklch(.9 .06 34);
  --ui-focus:oklch(.79 .14 52); --ui-shadow:0 5px 18px oklch(.03 .01 62/.32);
`.trim();

/** the design tokens every rule reads, in both colour schemes. */
export const TOKEN_CSS = `
:root{
  --ui-canvas:#faf9f5; --ui-surface:#f0eee6; --ui-raised:#fff;
  --ui-ink:#141413; --ui-muted:#4e4d48; --ui-faint:#676660;
  --ui-border:#d1cfc5; --ui-border-strong:#aaa89f;
  --ui-accent:#d97757; --ui-accent-soft:#fbf1ec; --ui-accent-ink:#934326;
  --ui-positive:#55663f; --ui-positive-soft:#edf1e6; --ui-positive-ink:#3a4a26;
  --ui-amber:#a8640f; --ui-amber-soft:#f8ead0; --ui-amber-ink:#6d4110;
  --ui-critical:#b0402f; --ui-critical-soft:#f6e2dc; --ui-critical-ink:#7a2a1e;
  --ui-focus:#b85c3e; --ui-shadow:0 10px 26px rgba(45,41,32,.11);
  --radius-control:.85rem; --radius-card:1.25rem;
  --font-display:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
  --font-body:"Avenir Next",Avenir,"Segoe UI",sans-serif;
  --font-mono:"SFMono-Regular",Menlo,Consolas,monospace;
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
