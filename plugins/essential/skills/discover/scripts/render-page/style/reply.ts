/** the reply: a panel in the document, a modal once the runtime has run. */
export const REPLY_CSS = `
/* the element ships open, so a page whose scripts never arrive still shows the
   reply as an ordinary panel at the foot of the document. Its own position is
   reset for that state, because a non-modal dialog is absolutely positioned by
   the user agent and would otherwise float over whatever it landed on. */
.reply-dialog{position:static; width:min(100% - 2 * var(--pad), var(--cap)); margin:3rem auto 0; padding:1rem 1.1rem 1.2rem; border:1px solid var(--ui-border-strong); border-radius:var(--radius-card); background:var(--ui-surface); color:var(--ui-ink)}
/* :modal is what separates the two lives of this element. A user agent that
   does not know the selector drops these rules and keeps the panel, which is
   the state that needs no scripting to be useful. */
.reply-dialog:modal{position:fixed; width:min(52rem,calc(100vw - 2rem)); max-height:min(82vh,44rem); margin:auto; overflow:auto}
.reply-dialog::backdrop{background:rgba(20,20,19,.44)}
.reply-head{display:flex; flex-wrap:wrap; gap:.5rem 1rem; align-items:baseline}
.reply-head h3{flex:1 1 auto; margin:0; font:700 .72rem/1.2 var(--font-mono); letter-spacing:.11em; text-transform:uppercase; color:var(--ui-faint)}
/* nothing closes a panel that is simply part of the page, and a control that
   does nothing is worse than no control */
.reply-dialog:not(:modal) .reply-close{display:none}
.reply-close{padding:.3rem .7rem; border:1px solid var(--ui-border); border-radius:var(--radius-control); background:var(--ui-surface); color:var(--ui-muted); font:650 .78rem/1.4 var(--font-body); cursor:pointer}
.reply-close:hover{border-color:var(--ui-ink); color:var(--ui-ink)}
.reply{margin:.55rem 0 0; padding:.85rem 1rem; max-height:14rem; overflow:auto; border:1px solid var(--ui-border); border-radius:var(--radius-control); background:var(--ui-canvas); font:.8rem/1.55 var(--font-mono); white-space:pre-wrap}
/* the modal exists to be read at length, so the reply takes the room it was
   opened for rather than keeping the drawer-sized clamp */
.reply-dialog:modal .reply{max-height:none}
`.trim();
