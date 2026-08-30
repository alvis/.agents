#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { DIAGRAM_CSS, renderDiagram } from "./page-diagram.ts";

import type { DiagramBlock } from "./page-diagram.ts";

/** a labelled statistic rendered into the masthead or a metric strip. */
export interface Metric {
  /** short uppercase caption naming what the value measures */
  label: string;
  /** the measured value, already formatted for display */
  value: string;
}

/** one selectable answer of a `choice` block. */
export interface Choice {
  /** the answer text, used both as the visible label and the recorded value */
  value: string;
  /** one sentence on when this answer is the right one */
  summary?: string;
  /** marks the answer the page recommends, drawing a "Recommended" badge */
  recommended?: boolean;
}

/** a verdict-carrying table cell. */
export interface Cell {
  /** the cell's visible text */
  text: string;
  /**
   * judgement carried alongside the text, drawn as a leading glyph
   * (`+`, `~`, `!`) as well as a colour so it survives greyscale
   */
  verdict?: "good" | "mixed" | "bad";
}

/** the content units a section body can hold in the walking skeleton. */
export type Block =
  /** a paragraph, capped to a comfortable reading measure */
  | { type: "prose"; text: string }
  /** a responsive strip of labelled figures */
  | { type: "metrics"; items: Metric[] }
  /** a comparison table; rows must be as long as `columns` */
  | { type: "table"; columns: string[]; rows: Cell[][] }
  /** an aside set off from the surrounding prose */
  | { type: "callout"; title: string; text: string }
  /** a layered node-and-edge graph, drawn as inline SVG at natural size */
  | DiagramBlock
  /** a single-answer question; `id` names its radio group and must be unique */
  | { type: "choice"; id: string; label: string; ask: string; choices: Choice[] }
  /** a free-text question; `id` becomes the textarea's document id */
  | {
      type: "note";
      id: string;
      label: string;
      ask: string;
      placeholder?: string;
    };

/** one numbered section of the page. */
export interface Section {
  /** unique anchor the drawer's section navigation links to */
  id: string;
  /** short name shown in that navigation */
  label: string;
  /** optional kicker rendered beside the section number */
  eyebrow?: string;
  /** the section heading, rendered directly above the body */
  title: string;
  /** the section's content, in reading order */
  blocks: Block[];
}

/** the whole presentation, as authored in the data file. */
export interface PageData {
  /** presentation kind; every kind shares one chrome and differs by content */
  kind:
    | "ranked-options"
    | "guided-interview"
    | "risk-context-report"
    | "architecture-board";
  /** stable identifier for the page, emitted as `data-page-id` */
  id: string;
  /** the action label the collapsed drawer carries */
  action: string;
  /** the document title */
  title: string;
  /** the opening block above the first section */
  masthead: {
    /** kicker above the headline */
    eyebrow: string;
    /** the page's one-line claim */
    headline: string;
    /** the paragraph that qualifies the headline */
    lede: string;
    /** optional figures shared by every option below */
    meta?: Metric[];
  };
  /** the page's sections, numbered in the order given */
  sections: Section[];
  /** the single copyable reply the drawer hosts */
  reply: {
    /** heading shown above the reply */
    heading: string;
    /**
     * reply body. Every occurrence of the literal `{{answers}}` is replaced at
     * runtime by one `- <label>: <answer>` line per question.
     */
    template: string;
  };
}

/** the stylesheet inlined into every generated page. */
export const PAGE_CSS = `
*,*::before,*::after{box-sizing:border-box}
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
}
@media (prefers-color-scheme:dark){:root{
  --ui-canvas:oklch(.16 .012 62); --ui-surface:oklch(.2 .014 62); --ui-raised:oklch(.235 .016 62);
  --ui-ink:oklch(.92 .012 80); --ui-muted:oklch(.75 .018 75); --ui-faint:oklch(.66 .018 75);
  --ui-border:oklch(.33 .018 66); --ui-border-strong:oklch(.5 .03 62);
  --ui-accent:oklch(.75 .14 48); --ui-accent-soft:oklch(.29 .055 43); --ui-accent-ink:oklch(.9 .055 58);
  --ui-positive:oklch(.74 .1 146); --ui-positive-soft:oklch(.27 .045 145); --ui-positive-ink:oklch(.9 .05 145);
  --ui-amber:oklch(.82 .11 74); --ui-amber-soft:oklch(.31 .055 70); --ui-amber-ink:oklch(.92 .05 82);
  --ui-critical:oklch(.7 .15 30); --ui-critical-soft:oklch(.31 .07 30); --ui-critical-ink:oklch(.9 .06 34);
  --ui-focus:oklch(.79 .14 52); --ui-shadow:0 5px 18px oklch(.03 .01 62/.32);
}}
html{scroll-behavior:smooth; scroll-padding-top:1.5rem}
body{
  margin:0; background:var(--ui-canvas); color:var(--ui-ink);
  font:1rem/1.6 var(--font-body); -webkit-font-smoothing:antialiased;
  padding-bottom:calc(var(--bar) + 1.5rem + env(safe-area-inset-bottom));
}
:focus-visible{outline:3px solid var(--ui-focus); outline-offset:2px; border-radius:6px}
.mono{font-family:var(--font-mono); font-size:.86em}

/* SC-3 — the reading column is min(available, cap) and is centred, so it is
   monotonic non-decreasing in viewport width by construction. No element
   reserves fixed horizontal space beside it at any width. */
.page{width:min(100% - 2 * var(--pad), var(--cap)); margin-inline:auto; padding-block:3rem 4rem}
.prose{max-width:70ch}

.masthead{display:flex; flex-direction:column; gap:.9rem; margin-bottom:3.5rem}
.eyebrow{display:flex; gap:.7rem; align-items:center; margin:0; color:var(--ui-muted); font:650 .72rem/1.3 var(--font-mono); letter-spacing:.13em; text-transform:uppercase}
.eyebrow::before{content:""; width:2rem; height:1px; background:var(--ui-accent)}
h1{margin:0; max-width:20ch; font-family:var(--font-display); font-weight:500; font-size:clamp(2.1rem,4.2vw,3.2rem); line-height:1.04; letter-spacing:-.04em; text-wrap:balance}
.lede{margin:0; max-width:60ch; color:var(--ui-muted); font-size:1.05rem}

/* SC-3 — heading stacks directly above its body in normal flow. */
.section{display:flex; flex-direction:column; gap:1.1rem; margin-block:3.25rem}
.section-heading{display:flex; flex-direction:column; gap:.45rem}
.section-heading h2{margin:0; max-width:24ch; font-family:var(--font-display); font-weight:540; font-size:clamp(1.6rem,2.6vw,2.1rem); line-height:1.12; letter-spacing:-.025em}
.section-no{font:700 .72rem/1 var(--font-mono); letter-spacing:.14em; color:var(--ui-accent-ink)}
.section-body{display:flex; flex-direction:column; gap:1.4rem}

/* wide escape: recovered width goes to grids and tables, never to prose */
.metrics{display:grid; gap:.6rem; grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))}
.metric{padding:.9rem 1rem; border:1px solid var(--ui-border); border-radius:var(--radius-control); background:var(--ui-raised)}
.metric dt{margin:0; font:650 .72rem/1.2 var(--font-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--ui-faint)}
.metric dd{margin:.35rem 0 0; font-size:1.35rem; font-weight:600; letter-spacing:-.01em}

.table-wrap{overflow-x:auto; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-raised)}
table{width:100%; border-collapse:collapse; font-size:.95rem}
th,td{padding:.8rem 1rem; text-align:left; border-bottom:1px solid var(--ui-border); vertical-align:top}
th{font:700 .74rem/1.2 var(--font-mono); letter-spacing:.09em; text-transform:uppercase; color:var(--ui-faint)}
tbody tr:last-child td{border-bottom:0}
/* the glyph is decorative ::before content, so it reaches no screen reader;
   VERDICT_LABEL emits the same judgement as real text beside it */
.sr-only{position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0 0 0 0); clip-path:inset(50%); white-space:nowrap; border:0}
td[data-verdict]::before{margin-right:.45rem; font-family:var(--font-mono); font-weight:700}
td[data-verdict="good"]{color:var(--ui-positive-ink)} td[data-verdict="good"]::before{content:"+"}
td[data-verdict="mixed"]{color:var(--ui-amber-ink)} td[data-verdict="mixed"]::before{content:"~"}
td[data-verdict="bad"]{color:var(--ui-critical-ink)} td[data-verdict="bad"]::before{content:"!"}

.callout{max-width:70ch; padding:1.1rem 1.3rem; border:1px solid var(--ui-border); border-left:4px solid var(--ui-accent); border-radius:var(--radius-control); background:var(--ui-accent-soft)}
.callout h3{margin:0 0 .4rem; font-size:1rem; letter-spacing:-.01em}
.callout p{margin:0; color:var(--ui-muted)}

.question{margin:0; padding:1.4rem 1.5rem; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-raised); box-shadow:var(--ui-shadow)}
.question legend,.question .q-label{padding:0; font-family:var(--font-display); font-size:1.2rem; font-weight:560; letter-spacing:-.015em}
.question .ask{margin:.5rem 0 1rem; max-width:70ch; color:var(--ui-muted)}
.choices{display:grid; gap:.6rem; grid-template-columns:repeat(auto-fit,minmax(17rem,1fr))}
.choice{display:flex; gap:.7rem; align-items:flex-start; padding:.85rem 1rem; border:1px solid var(--ui-border-strong); border-radius:var(--radius-control); background:var(--ui-canvas); cursor:pointer}
.choice:has(input:checked){border-color:var(--ui-accent); box-shadow:inset 3px 0 0 var(--ui-accent)}
.choice strong{display:block}
.choice small{color:var(--ui-muted)}
.badge{margin-left:auto; padding:.22rem .6rem; border:1px solid var(--ui-accent); border-radius:9999px; font:700 .72rem/1.4 var(--font-mono); letter-spacing:.06em; text-transform:uppercase; color:var(--ui-accent-ink)}
textarea{width:100%; min-height:6rem; padding:.7rem .85rem; border:1px solid var(--ui-border-strong); border-radius:var(--radius-control); background:var(--ui-canvas); color:inherit; font:1rem/1.5 var(--font-body); resize:vertical}

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
.drawer-hint{margin-left:auto; color:var(--ui-muted); font:600 .72rem/1.2 var(--font-mono); letter-spacing:.08em; text-transform:uppercase}
.drawer-panel{max-height:min(62vh,32rem); overflow-y:auto; border-top:1px solid var(--ui-border); padding:1.2rem var(--pad) 1.6rem}
.drawer-panel[hidden]{display:none}
.drawer-grid{display:grid; gap:1.4rem; grid-template-columns:repeat(auto-fit,minmax(17rem,1fr)); width:min(100% , var(--cap)); margin-inline:auto}
.drawer-grid h3{margin:0 0 .55rem; font:700 .72rem/1.2 var(--font-mono); letter-spacing:.11em; text-transform:uppercase; color:var(--ui-faint)}
.drawer-nav{display:grid; gap:.15rem}
.drawer-nav a{padding:.3rem .5rem; border-radius:.55rem; color:var(--ui-muted); text-decoration:none; font-size:.85rem}
.drawer-nav a[aria-current="location"]{background:var(--ui-accent-soft); color:var(--ui-accent-ink); font-weight:700}
.summaries{margin:0; padding:0; list-style:none; display:grid; gap:.4rem; font-size:.85rem}
/* SC-6 — label, glyph, edge, then colour: four channels, colour last. */
.summaries li{display:flex; gap:.5rem; align-items:baseline; padding:.35rem .6rem; border-left:3px dotted var(--ui-border-strong); background:var(--ui-canvas); border-radius:.4rem}
.summaries li[data-answered="true"]{border-left-style:solid; border-left-color:var(--ui-positive)}
.summaries li::before{content:"○ unanswered"; flex:none; font:700 .72rem/1.6 var(--font-mono); text-transform:uppercase; color:var(--ui-faint)}
.summaries li[data-answered="true"]::before{content:"● answered"; color:var(--ui-positive-ink)}
.summaries .value{color:var(--ui-muted)}
.reply-head{display:flex; gap:.6rem; align-items:center; justify-content:space-between}
.copy{padding:.35rem .85rem; border:1px solid var(--ui-border-strong); border-radius:9999px; background:var(--ui-raised); color:inherit; font:700 .74rem/1.4 var(--font-mono); letter-spacing:.07em; text-transform:uppercase; cursor:pointer}
.reply{margin:.55rem 0 0; padding:.85rem 1rem; max-height:14rem; overflow:auto; border:1px solid var(--ui-border); border-radius:var(--radius-control); background:var(--ui-canvas); font:.8rem/1.55 var(--font-mono); white-space:pre-wrap}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms !important; transition-duration:.01ms !important; scroll-behavior:auto !important}}
`.trim();

/** the runtime inlined into every generated page. */
export const PAGE_JS = `
(function(){
  var drawer=document.querySelector("[data-drawer]");
  var toggle=drawer.querySelector("[data-drawer-toggle]");
  var panel=document.getElementById(toggle.getAttribute("aria-controls"));
  var count=drawer.querySelector("[data-unanswered-count]");
  var hint=drawer.querySelector("[data-drawer-hint]");
  var summaries=drawer.querySelector("[data-summaries]");
  var reply=drawer.querySelector("[data-reply]");
  var opener=null;

  function setExpanded(next){
    toggle.setAttribute("aria-expanded",String(next));
    panel.hidden=!next;
    hint.textContent=next?"Collapse":"Expand";
    if(next){opener=document.activeElement; panel.querySelector("a,button,[tabindex]").focus();}
    else if(opener){opener.focus(); opener=null;}
  }
  toggle.addEventListener("click",function(){setExpanded(toggle.getAttribute("aria-expanded")!=="true");});
  // the whole collapsed bar is the pointer target, not just the button inside
  // it. Purely additive: the button stays the semantic control, so keyboard and
  // screen-reader paths are untouched and the bar gets no role or tabindex.
  // Bound to the bar alone, never the panel, or reading the expanded drawer
  // would collapse it; and a click that merely ends a text selection is not a
  // press, so it must not toggle either.
  drawer.querySelector("[data-drawer-bar]").addEventListener("click",function(event){
    if(event.target.closest("button,a,input,textarea,select"))return;
    var selection=window.getSelection();
    if(selection&&!selection.isCollapsed)return;
    setExpanded(toggle.getAttribute("aria-expanded")!=="true");
    toggle.focus();
  });
  document.addEventListener("keydown",function(event){
    if(event.key==="Escape"&&toggle.getAttribute("aria-expanded")==="true"){setExpanded(false); toggle.focus();}
  });

  function answerOf(field){
    if(field.dataset.questionKind==="choice"){
      var picked=field.querySelector("input:checked");
      return picked?picked.value:"";
    }
    return field.querySelector("textarea").value.trim();
  }
  function refresh(){
    var fields=Array.prototype.slice.call(document.querySelectorAll("[data-question]"));
    var unanswered=0;
    summaries.innerHTML="";
    var lines=[];
    fields.forEach(function(field){
      var value=answerOf(field);
      if(!value)unanswered=unanswered+1;
      var item=document.createElement("li");
      item.dataset.answered=String(Boolean(value));
      var label=document.createElement("span");
      label.textContent=field.dataset.questionLabel;
      var shown=document.createElement("span");
      shown.className="value";
      shown.textContent=value||"—";
      item.appendChild(label); item.appendChild(shown);
      summaries.appendChild(item);
      lines.push("- "+field.dataset.questionLabel+": "+(value||"(unanswered)"));
    });
    var label=unanswered+" unanswered";
    // rewriting an identical live region re-announces it on every keystroke
    if(count.textContent!==label)count.textContent=label;
    count.dataset.settled=String(unanswered===0);
    var answers=lines.join("\\n");
    // the function form suppresses $& and $\` expansion in typed answers
    reply.textContent=reply.dataset.template.replaceAll("{{answers}}",function(){return answers;});
  }
  document.addEventListener("input",refresh);
  document.addEventListener("change",refresh);

  var links=Array.prototype.slice.call(drawer.querySelectorAll(".drawer-nav a"));
  var observer=new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(!entry.isIntersecting)return;
      links.forEach(function(link){
        if(link.getAttribute("href")==="#"+entry.target.id)link.setAttribute("aria-current","location");
        else link.removeAttribute("aria-current");
      });
    });
  },{rootMargin:"-20% 0px -70% 0px"});
  document.querySelectorAll("[data-section]").forEach(function(section){observer.observe(section);});

  drawer.querySelector("[data-copy]").addEventListener("click",function(){
    var button=this;
    function restore(){setTimeout(function(){button.textContent="Copy reply";},2400);}
    function report(text){button.textContent=text; button.dataset.copyState=text==="Copied"?"copied":"manual"; restore();}
    // the reply is the page's single sink, so it must stay recoverable when the
    // async clipboard is absent entirely — file:// has no navigator.clipboard,
    // and reading .writeText off undefined throws before any rejection handler
    function selectReply(){
      var range=document.createRange();
      range.selectNodeContents(reply);
      var selection=window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      reply.focus();
      var copied=false;
      try{copied=document.execCommand("copy");}catch(error){copied=false;}
      report(copied?"Copied":"Press \u2318C to copy");
    }
    if(!navigator.clipboard||typeof navigator.clipboard.writeText!=="function"){selectReply(); return;}
    navigator.clipboard.writeText(reply.textContent).then(function(){
      report("Copied");
    },selectReply);
  });

  setExpanded(false);
  refresh();
})();
`.trim();

/**
 * the judgement each verdict carries, as text. The table draws a glyph and a
 * colour too, but only this reaches assistive technology.
 */
/** every presentation kind the renderer accepts. */
const PAGE_KINDS = [
  "ranked-options",
  "guided-interview",
  "risk-context-report",
  "architecture-board",
] as const;

const VERDICT_LABEL: Record<string, string> = {
  good: "clean",
  mixed: "acceptable",
  bad: "costly",
};

/** raised when input data or CLI arguments cannot produce a page. */
export class RenderError extends Error {}

/**
 * escapes text for interpolation into HTML element content or an attribute
 * @param value raw author-supplied text
 * @returns the same text with every HTML-significant character escaped
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * collects every question block, in reading order
 * @param sections the page's sections
 * @returns the `choice` and `note` blocks, none of which is answered in a
 *   freshly rendered page
 */
function questionsOf(
  sections: Section[],
): Extract<Block, { type: "choice" | "note" }>[] {
  return sections.flatMap((section) =>
    section.blocks.filter(
      (block): block is Extract<Block, { type: "choice" | "note" }> =>
        block.type === "choice" || block.type === "note",
    ),
  );
}

/**
 * fills the reply template with the unanswered state a fresh page opens in
 * @param data the parsed presentation data
 * @returns the reply body the runtime would produce before any answer, so the
 *   drawer reads correctly on first paint and without JavaScript
 */
function renderReply(data: PageData): string {
  const lines = questionsOf(data.sections).map(
    (block) => `- ${block.label}: (unanswered)`,
  );
  return data.reply.template.replaceAll("{{answers}}", () => lines.join("\n"));
}

/**
 * reads a required non-empty string, refusing anything else by JSON path
 * @param value the author-supplied value
 * @param path JSON path of the value, named verbatim by the refusal
 * @returns the value as a string
 */
export function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value)
    throw new RenderError(
      `${path}: required non-empty string, received ${JSON.stringify(value)}`,
    );
  return value;
}

function renderMetrics(items: Metric[], path: string): string {
  return `<dl class="metrics">${items
    .map(
      (item, index) =>
        `<div class="metric"><dt>${escapeHtml(requireString(item.label, `${path}[${index}].label`))}</dt><dd>${escapeHtml(requireString(item.value, `${path}[${index}].value`))}</dd></div>`,
    )
    .join("")}</dl>`;
}

function renderBlock(block: Block, path: string): string {
  switch (block.type) {
    case "prose":
      return `<p class="prose">${escapeHtml(requireString(block.text, `${path}.text`))}</p>`;
    case "metrics":
      return renderMetrics(block.items, `${path}.items`);
    case "table":
      return `<div class="table-wrap"><table><thead><tr>${block.columns
        .map((column) => `<th scope="col">${escapeHtml(column)}</th>`)
        .join("")}</tr></thead><tbody>${block.rows
        .map(
          (row) =>
            `<tr>${row
              .map(
                (cell) =>
                  `<td${cell.verdict ? ` data-verdict="${escapeHtml(cell.verdict)}"` : ""}>${
                    cell.verdict && VERDICT_LABEL[cell.verdict]
                      ? `<span class="sr-only">${VERDICT_LABEL[cell.verdict]}: </span>`
                      : ""
                  }${escapeHtml(cell.text)}</td>`,
              )
              .join("")}</tr>`,
        )
        .join("")}</tbody></table></div>`;
    case "callout":
      return `<div class="callout"><h3>${escapeHtml(block.title)}</h3><p>${escapeHtml(block.text)}</p></div>`;
    case "diagram":
      return renderDiagram(block, path);
    case "choice":
      return `<fieldset class="question" data-question data-question-kind="choice" data-question-id="${escapeHtml(block.id)}" data-question-label="${escapeHtml(block.label)}"><legend>${escapeHtml(block.label)}</legend><p class="ask">${escapeHtml(block.ask)}</p><div class="choices">${block.choices
        .map(
          (choice, index) =>
            `<label class="choice"><input type="radio" name="${escapeHtml(block.id)}" value="${escapeHtml(requireString(choice.value, `${path}.choices[${index}].value`))}" /><span><strong>${escapeHtml(choice.value)}</strong>${choice.summary ? `<small>${escapeHtml(choice.summary)}</small>` : ""}</span>${choice.recommended ? '<span class="badge">Recommended</span>' : ""}</label>`,
        )
        .join("")}</div></fieldset>`;
    case "note":
      return `<div class="question" data-question data-question-kind="note" data-question-id="${escapeHtml(block.id)}" data-question-label="${escapeHtml(block.label)}"><label class="q-label" for="${escapeHtml(block.id)}">${escapeHtml(block.label)}</label><p class="ask">${escapeHtml(block.ask)}</p><textarea id="${escapeHtml(block.id)}" placeholder="${escapeHtml(block.placeholder ?? "")}"></textarea></div>`;
    default:
      throw new RenderError(
        `${path}.type: unknown block type ${JSON.stringify((block as { type: string }).type)}`,
      );
  }
}

function renderSection(section: Section, index: number): string {
  const number = String(index + 1).padStart(2, "0");
  const id = requireString(section.id, `sections[${index}].id`);
  return `<section class="section" id="${escapeHtml(id)}" data-section data-section-label="${escapeHtml(requireString(section.label, `sections[${index}].label`))}"><div class="section-heading"><p class="section-no">${number}${section.eyebrow ? ` · ${escapeHtml(section.eyebrow)}` : ""}</p><h2>${escapeHtml(requireString(section.title, `sections[${index}].title`))}</h2></div><div class="section-body">${section.blocks
    .map((block, position) =>
      renderBlock(block, `sections[${index}].blocks[${position}]`),
    )
    .join("")}</div></section>`;
}

/**
 * renders a page data object into one self-contained HTML document.
 * @param data the parsed presentation data
 * @returns a complete document that loads no external resource
 */
export function renderPage(data: PageData): string {
  if (!PAGE_KINDS.some((kind) => kind === data.kind))
    throw new RenderError(
      `kind: required one of ${PAGE_KINDS.map((kind) => JSON.stringify(kind)).join(", ")}, received ${JSON.stringify(data.kind)}`,
    );
  const title = requireString(data.title, "title");
  const action = requireString(data.action, "action");
  const sections = data.sections
    .map((section, index) => renderSection(section, index))
    .join("");
  const nav = data.sections
    .map(
      (section) =>
        `<a href="#${escapeHtml(section.id)}">${escapeHtml(section.label)}</a>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<link rel="icon" href="data:," />
<title>${escapeHtml(title)}</title>
<style>
${PAGE_CSS}${DIAGRAM_CSS}
</style>
</head>
<body data-page-id="${escapeHtml(requireString(data.id, "id"))}" data-kind="${escapeHtml(data.kind)}">
<main class="page">
<header class="masthead">
<p class="eyebrow">${escapeHtml(requireString(data.masthead.eyebrow, "masthead.eyebrow"))}</p>
<h1>${escapeHtml(requireString(data.masthead.headline, "masthead.headline"))}</h1>
<p class="lede">${escapeHtml(requireString(data.masthead.lede, "masthead.lede"))}</p>
${data.masthead.meta?.length ? renderMetrics(data.masthead.meta, "masthead.meta") : ""}
</header>
${sections}
</main>
<div class="drawer" data-drawer>
<div class="drawer-bar" data-drawer-bar>
<button type="button" class="drawer-toggle" data-drawer-toggle aria-expanded="false" aria-controls="drawer-panel" aria-describedby="drawer-count">
<span class="drawer-action">${escapeHtml(action)}</span>
<span class="drawer-hint" data-drawer-hint>Expand</span>
</button>
<span class="drawer-count" id="drawer-count" data-unanswered-count aria-live="polite">${questionsOf(data.sections).length} unanswered</span>
</div>
<div class="drawer-panel" id="drawer-panel" hidden>
<div class="drawer-grid">
<nav class="drawer-nav" aria-label="Sections"><h3>Sections</h3>${nav}</nav>
<div><h3>Decisions</h3><ul class="summaries" data-summaries></ul></div>
<div>
<div class="reply-head"><h3>${escapeHtml(requireString(data.reply.heading, "reply.heading"))}</h3><button type="button" class="copy" data-copy>Copy reply</button></div>
<pre class="reply" data-reply data-template="${escapeHtml(requireString(data.reply.template, "reply.template"))}">${escapeHtml(renderReply(data))}</pre>
</div>
</div>
</div>
</div>
<script>
${PAGE_JS}
</script>
</body>
</html>
`;
}

/**
 * reads a data file, renders it, and writes the resulting page.
 * @param dataPath path to the JSON data file
 * @param outPath path the rendered HTML is written to
 * @returns the rendered document
 */
export async function renderFile(
  dataPath: string,
  outPath: string,
): Promise<string> {
  const source = await readFile(dataPath, "utf8").catch(() => {
    throw new RenderError(`cannot read data file: ${dataPath}`);
  });
  let data: PageData;
  try {
    data = JSON.parse(source) as PageData;
  } catch (error) {
    throw new RenderError(
      `${dataPath} is not valid JSON: ${(error as Error).message}`,
    );
  }
  const html = renderPage(data);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html, "utf8");
  return html;
}

/**
 * runs the command line interface.
 * @param argv arguments after the script name
 * @returns the process exit code
 */
export async function main(argv = Bun.argv.slice(2)): Promise<number> {
  const usage = "usage: bun scripts/render-page.ts <data.json> -o <out.html>";
  const output = argv.indexOf("-o");
  const target = output === -1 ? "" : (argv[output + 1] ?? "");
  const positional =
    output === -1
      ? argv
      : argv.filter((_, index) => index !== output && index !== output + 1);
  const complaint =
    output === -1
      ? "missing the -o <out.html> flag"
      : !target || target.startsWith("-")
        ? `-o needs an output path, received ${JSON.stringify(target)}`
        : positional.length !== 1
          ? `expected exactly one data file, received ${positional.length}`
          : "";
  if (complaint) {
    console.error(`${usage}\nrender-page.ts: error: ${complaint}`);
    return 2;
  }
  try {
    await renderFile(resolve(positional[0]), resolve(target));
    return 0;
  } catch (error) {
    console.error(`render-page.ts: error: ${(error as Error).message}`);
    return 1;
  }
}

if (import.meta.main) process.exit(await main());
