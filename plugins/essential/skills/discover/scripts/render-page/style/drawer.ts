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
/* the scheme control and the expand hint sit at the far end of the bar. They
   are grouped and pushed there by their own auto margin rather than carried
   there by the chip strip's flex-grow, because a board that asks nothing draws
   no strip and no counters: on the hub the whole right-hand group collapsed
   back against the title. Alignment that depends on an element the page may
   not emit is not alignment. */
.drawer-controls{display:flex; flex-wrap:wrap; gap:.4rem 1rem; align-items:center; align-self:stretch; margin-inline-start:auto}
.drawer-toggle{
  display:flex; gap:.5rem; align-items:center; flex:none;
  align-self:stretch; min-height:var(--bar); padding:.5rem 0;
  border:0; background:none; color:inherit; font:inherit; text-align:left; cursor:pointer;
}
.drawer-action{font:700 .72rem/1.2 var(--font-mono); letter-spacing:.11em; text-transform:uppercase}
/* the question strip: one chip per question, its fill saying where that
   question stands. It reads left to right in the order the board asks, so a
   reader can see at a glance how much is still open without opening anything.
   The strip scrolls rather than wraps, because a bar that grows a second row
   pushes the page it summarises off the screen. An end fades so that a chip cut
   by the edge reads as "there is more" rather than as a clipped square — but
   only the end that is actually cutting one off, which the runtime reports as
   data-overflow. Faded unconditionally, the very first chip sat under a
   gradient from the moment the page loaded and read as half-drawn.
   The 2px padding is the ring on the current chip: box-shadow draws outside
   the border box, and a scroller clips it on all four sides. */
.chip-strip{display:flex; flex:1 1 auto; gap:.3rem; align-items:center; min-width:0; padding:2px; margin-inline-end:2.5rem; overflow-x:auto; scrollbar-width:none; scroll-behavior:smooth}
.chip-strip[data-overflow="start"]{-webkit-mask-image:linear-gradient(90deg,transparent,#000 1.4rem); mask-image:linear-gradient(90deg,transparent,#000 1.4rem)}
.chip-strip[data-overflow="end"]{-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 1.4rem),transparent); mask-image:linear-gradient(90deg,#000 calc(100% - 1.4rem),transparent)}
.chip-strip[data-overflow="both"]{-webkit-mask-image:linear-gradient(90deg,transparent,#000 1.4rem,#000 calc(100% - 1.4rem),transparent); mask-image:linear-gradient(90deg,transparent,#000 1.4rem,#000 calc(100% - 1.4rem),transparent)}
.chip-strip::-webkit-scrollbar{display:none}
.q-chip{display:inline-grid; flex:none; place-items:center; min-width:2rem; height:1.7rem; padding:0 .35rem; border:1px solid transparent; border-radius:.45rem; background:transparent; color:var(--ui-muted); font:700 .72rem/1 var(--font-mono); text-decoration:none}
/* one tone per status, and the same tone the card that produced it wears:
   green for going with the board's recommendation, which is what Approve and a
   checked recommended option are; amber for overriding it, which is Change and
   a checked option the board did not suggest; accent for settling a question
   that recommends nothing. The two nobody has settled carry no fill at all — a
   dashed edge says "empty" in a way a pale colour does not.
   Confirmed and answered used to be the other way round, so a reader who
   approved a decision saw a green button over an accent chip and an accent
   button under an amber one.
   The class is q-chip rather than chip: the annotation toolbar already owns
   .chip, and sharing it gave these a pill radius, a surface fill under the
   "transparent" statuses, and a pointer cursor on a link */
.q-chip[data-status="confirmed"]{border-color:var(--ui-positive); background:var(--ui-positive-soft); color:var(--ui-positive-ink)}
.q-chip[data-status="changed"]{border-color:var(--ui-amber); background:var(--ui-amber-soft); color:var(--ui-amber-ink)}
.q-chip[data-status="answered"]{border-color:var(--ui-accent); background:var(--ui-accent-soft); color:var(--ui-accent-ink)}
.q-chip[data-status="suggested"]{border-style:dashed; border-color:var(--ui-accent); color:var(--ui-accent-ink)}
.q-chip[data-status="unanswered"]{border-style:dashed; border-color:var(--ui-border-strong)}
/* the question the reader is looking at, which the runtime scrolls to the
   middle of the strip as they move down the page */
.q-chip[data-current="true"]{box-shadow:0 0 0 2px var(--ui-focus)}
.q-chip:focus-visible{outline:2px solid var(--ui-focus); outline-offset:2px}
/* fewer chips on a narrow bar, by giving the strip less room to draw them in:
   the scroller keeps every chip reachable, so nothing is lost by showing less */
@media (max-width:60rem){.chip-strip{margin-inline-end:1.2rem}}
@media (max-width:40rem){.chip-strip{max-width:9rem; margin-inline-end:.75rem}}
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
.drawer-hint{color:var(--ui-muted); font:600 .72rem/1.2 var(--font-mono); letter-spacing:.08em; text-transform:uppercase}
/* the panel opens by growing its one row from 0fr to 1fr, which is the only
   way to transition to a height nobody has measured. The hidden attribute
   cannot animate at all, and max-height animates to a guess, overshooting a
   short panel and clipping a tall one. The closed panel is inert, so it
   leaves the tab order and the accessibility tree the same moment it leaves
   the screen — which display:none did for free and a zero row does not. */
.drawer-panel{display:grid; grid-template-rows:0fr; transition:grid-template-rows .24s cubic-bezier(.2,.7,.3,1)}
.drawer[data-open="true"] .drawer-panel{grid-template-rows:1fr}
.drawer-sheet{display:grid; gap:1.1rem; min-height:0; max-height:min(62vh,32rem); overflow:hidden auto}
.drawer[data-open="true"] .drawer-sheet{border-top:1px solid var(--ui-border); padding:1.2rem var(--pad) 1.6rem}
/* three columns — sections, decisions, notes — declared rather than fitted.
   auto-fit laid out as many tracks as the panel had room for and collapsed
   the spares, so the count was whatever the viewport made it; a fourth child
   took the fourth track wherever one had been drawn. The board set is now a
   row of its own above, and the three that remain are three at every width
   they fit. Each track is floored at 0 rather than at its content, or a long
   question in the decisions column widens the grid past the panel */
.drawer-grid{display:grid; gap:1.4rem; grid-template-columns:repeat(3,minmax(0,1fr)); width:min(100% , var(--cap)); margin-inline:auto}
@media (max-width:60rem){.drawer-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:40rem){.drawer-grid{grid-template-columns:minmax(0,1fr)}}
.drawer-grid h3{margin:0 0 .55rem; font:700 .72rem/1.2 var(--font-mono); letter-spacing:.11em; text-transform:uppercase; color:var(--ui-faint)}
.drawer-nav{display:grid; gap:.15rem}
.drawer-nav a{padding:.3rem .5rem; border-radius:.55rem; color:var(--ui-muted); text-decoration:none; font-size:.85rem}
.drawer-nav a[aria-current="location"]{background:var(--ui-accent-soft); color:var(--ui-accent-ink); font-weight:700}
.summaries{margin:0; padding:0; list-style:none; display:grid; gap:.4rem; font-size:.85rem}
/* the run's other boards, drawn as a peer of the section list: leaving the
   board is the same kind of move as jumping within it, and a reader who has
   to find the hub first has to know the hub exists */
.board-set{display:flex; flex-wrap:wrap; gap:.35rem .9rem; align-items:baseline; width:min(100% , var(--cap)); margin-inline:auto; padding:.65rem .9rem; border:1px dashed var(--ui-border-strong); border-radius:var(--radius-control); background:var(--ui-canvas)}
.board-set h3{margin:0; flex:none; font:700 .72rem/1.2 var(--font-mono); letter-spacing:.11em; text-transform:uppercase; color:var(--ui-faint)}
.board-set ul{margin:0; padding:0; list-style:none; display:flex; flex-wrap:wrap; gap:.2rem .35rem}
.board-set a{display:block; padding:.2rem .5rem; border-radius:.55rem; color:var(--ui-muted); text-decoration:none; font-size:.85rem}
.board-set a:hover{color:var(--ui-ink)}
/* the same treatment the section list gives the section in view, because it
   answers the same question one level up: which of these am I looking at */
.board-set a[aria-current="page"]{background:var(--ui-accent-soft); color:var(--ui-accent-ink); font-weight:700}
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
/* the row is a link to the question it summarises. It carries no link colour
   and no underline at rest, because a list where every row is blue reads as a
   list of links rather than as a summary — the affordance arrives on hover
   and on focus, where it is asked for */
.summary-jump{display:flex; flex:1 1 auto; gap:.5rem; align-items:baseline; min-width:0; color:inherit; text-decoration:none}
.summary-jump:hover .summary-name{text-decoration:underline}
.summary-jump:focus-visible{outline:2px solid var(--ui-focus); outline-offset:2px; border-radius:.3rem}
.summary-ref{flex:none; padding:0 .3em; border-radius:.3rem; background:var(--ui-accent-soft); color:var(--ui-accent-ink); font:700 .72rem/1.6 var(--font-mono)}
.summary-name{min-width:0}
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
