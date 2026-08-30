/** the bottom drawer and the summaries it lists. */
export const DRAWER_CSS = `
/* SC-4 — bottom drawer at every width; collapsed it is a status bar. */
.drawer{position:fixed; z-index:60; inset:auto 0 0; border-top:1px solid var(--ui-border-strong); background:var(--ui-surface); box-shadow:0 -8px 26px rgba(45,41,32,.14); padding-bottom:env(safe-area-inset-bottom)}
/* the bar wraps from the start; the live count is a sibling of the control so
   the button's accessible name never changes under the reader.
   WCAG 2.2 SC 2.5.8 — the bar carries no block padding and the control
   stretches, so the control *is* the 48px bar rather than a text-height band
   floating inside it. Putting the vertical padding back on this rule shrinks
   the target to its content height; it belongs on .drawer-toggle. */
.drawer-bar{display:flex; flex-wrap:wrap; gap:.4rem 1rem; align-items:center; min-height:var(--bar); padding-inline:var(--pad); cursor:pointer}
.drawer-toggle{
  display:flex; flex-wrap:wrap; gap:.5rem 1rem; align-items:center; flex:1 1 auto;
  align-self:stretch; min-height:var(--bar); padding:.5rem 0;
  border:0; background:none; color:inherit; font:inherit; text-align:left; cursor:pointer;
}
.drawer-action{font:700 .72rem/1.2 var(--font-mono); letter-spacing:.11em; text-transform:uppercase}
.drawer-count{display:inline-flex; gap:.4rem; align-items:center; margin-block:.5rem; padding:.15rem .6rem; border:1px solid var(--ui-accent); border-radius:9999px; background:var(--ui-accent-soft); color:var(--ui-accent-ink); font:700 .72rem/1.5 var(--font-mono)}
.drawer-count[data-settled="true"]{border-color:var(--ui-positive); background:var(--ui-positive-soft); color:var(--ui-positive-ink)}
/* the scheme control is the one thing in the bar that is not about
   answering, so it stays neutral and never borrows the accent. It is an icon
   because its three states are a glyph each and a word would say less; the
   state is still carried as .sr-only text, so the button's accessible name
   reads "Colour scheme: Dark" rather than announcing a picture.
   WCAG 2.2 SC 2.5.8 — the 2.2rem box is what carries it past 24px. */
.scheme{display:inline-grid; flex:none; place-items:center; width:2.2rem; height:2.2rem; margin-block:.5rem; padding:0; border:1px solid var(--ui-border-strong); border-radius:9999px; background:var(--ui-raised); color:var(--ui-muted); cursor:pointer}
.scheme:hover{color:var(--ui-ink); border-color:var(--ui-ink)}
.scheme-icon{width:1.05rem; height:1.05rem; fill:none; stroke:currentColor; stroke-width:1.6; stroke-linecap:round}
.scheme-fill{fill:currentColor; stroke:none}
/* exactly one icon is shown, chosen by the state the button carries, so the
   glyph is right before the runtime has run a line. */
.scheme .scheme-icon{display:none}
.scheme[data-scheme="auto"] [data-icon="auto"],
.scheme[data-scheme="light"] [data-icon="light"],
.scheme[data-scheme="dark"] [data-icon="dark"]{display:block}
.drawer-hint{margin-left:auto; color:var(--ui-muted); font:600 .72rem/1.2 var(--font-mono); letter-spacing:.08em; text-transform:uppercase}
.drawer-panel{max-height:min(62vh,32rem); overflow-y:auto; border-top:1px solid var(--ui-border); padding:1.2rem var(--pad) 1.6rem}
.drawer-panel[hidden]{display:none}
.drawer-grid{display:grid; gap:1.4rem; grid-template-columns:repeat(auto-fit,minmax(min(17rem,100%),1fr)); width:min(100% , var(--cap)); margin-inline:auto}
.drawer-grid h3{margin:0 0 .55rem; font:700 .72rem/1.2 var(--font-mono); letter-spacing:.11em; text-transform:uppercase; color:var(--ui-faint)}
.drawer-nav{display:grid; gap:.15rem}
.drawer-nav a{padding:.3rem .5rem; border-radius:.55rem; color:var(--ui-muted); text-decoration:none; font-size:.85rem}
.drawer-nav a[aria-current="location"]{background:var(--ui-accent-soft); color:var(--ui-accent-ink); font-weight:700}
.summaries{margin:0; padding:0; list-style:none; display:grid; gap:.4rem; font-size:.85rem}
/* the offer to fill the gaps, drawn quieter than the answers it would fill:
   it is a shortcut through the list above, not a fifth thing to read */
.approve-rest{margin-top:.7rem; padding:.4rem .75rem; border:1px solid var(--ui-border-strong); border-radius:var(--radius-control); background:var(--ui-canvas); color:var(--ui-muted); font:650 .78rem/1.4 var(--font-body); cursor:pointer}
.approve-rest:hover{border-color:var(--ui-accent); color:var(--ui-accent-ink)}
.approve-rest[hidden]{display:none}
/* SC-6 — label, glyph, edge, then colour: four channels, colour last. */
.summaries li{display:flex; gap:.5rem; align-items:baseline; padding:.35rem .6rem; border-left:3px dotted var(--ui-border-strong); background:var(--ui-canvas); border-radius:.4rem}
.summaries li[data-answered="true"]{border-left-style:solid; border-left-color:var(--ui-positive)}
.summaries li::before{content:"○ unanswered"; flex:none; font:700 .72rem/1.6 var(--font-mono); text-transform:uppercase; color:var(--ui-faint)}
.summaries li[data-answered="true"]::before{content:"● answered"; color:var(--ui-positive-ink)}
.summaries .value{color:var(--ui-muted)}
/* the control that summons the reply. Shipped hidden and revealed by the
   runtime, because without scripting there is no modal to open and the reply
   is already a panel further down the page. */
.reply-show{flex:none; margin-block:.5rem; padding:.42rem .85rem; border:1px solid var(--ui-border-strong); border-radius:9999px; background:var(--ui-raised); color:var(--ui-muted); font:700 .74rem/1.4 var(--font-mono); letter-spacing:.07em; text-transform:uppercase; cursor:pointer}
.reply-show:hover{color:var(--ui-ink); border-color:var(--ui-ink)}
.reply-show[hidden]{display:none}
/* a glyph rather than a word, so the reply can be copied without opening it
   and without the bar spending a fifth of its width saying so. flex:none for
   the same reason .scheme has it: the bar wraps, and a shrinking target can
   slip under 24px. */
.copy{display:inline-flex; flex:none; gap:.4rem; align-items:center; min-height:2.2rem; margin-block:.5rem; padding:0 .55rem; border:1px solid var(--ui-border-strong); border-radius:9999px; background:var(--ui-raised); color:var(--ui-muted); font:700 .74rem/1.4 var(--font-mono); letter-spacing:.07em; text-transform:uppercase; cursor:pointer}
.copy:hover{color:var(--ui-ink); border-color:var(--ui-ink)}
.copy[data-copy-state="copied"]{color:var(--ui-positive-ink); border-color:var(--ui-positive)}
.copy-icon{width:1.05rem; height:1.05rem; fill:none; stroke:currentColor; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round}
/* one glyph at a time, chosen by what the button last reported */
.copy .copy-icon{display:none}
.copy:not([data-copy-state="copied"]) [data-icon="copy"],
.copy[data-copy-state="copied"] [data-icon="done"]{display:block}
/* the outcome is spoken as well as drawn: the tick alone cannot say
   "press the keys yourself", which is what the fallback has to say */
.copy-state{font:700 .72rem/1.4 var(--font-mono)}
.copy-state:empty{display:none}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms !important; transition-duration:.01ms !important; scroll-behavior:auto !important}}
`.trim();
