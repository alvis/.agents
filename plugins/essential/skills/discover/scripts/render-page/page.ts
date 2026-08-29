import { usesMermaid } from "./block/mermaid.ts";
import { renderMetrics } from "./block/metric.ts";
import { COPY_ICONS } from "./copy.ts";
import { RenderError } from "./error.ts";
import { escapeHtml } from "./escape.ts";
import { freshIds } from "./id.ts";
import { questionsOf, renderReply, replyTemplate } from "./reply.ts";
import { SCHEME_ICONS } from "./scheme.ts";
import { renderSection } from "./section.ts";
import { renderBoardSet } from "./set.ts";
import { renderSources } from "./source.ts";
import { renderTheme } from "./theme.ts";
import { PAGE_KINDS } from "./types/page.ts";
import {
  requireArray,
  requireObject,
  requireOneOf,
  requireString,
} from "./validate.ts";

import type { PageAssets } from "./bundle.ts";
import type { PageContext } from "./context.ts";
import type { PageData, Section } from "./types.ts";

/**
 * renders a page data object into one self-contained HTML document.
 * @param data the parsed presentation data
 * @param assets the stylesheet and scripts the page carries
 * @returns a complete document that loads no external resource
 */
export function renderPage(data: PageData, assets: PageAssets): string {
  requireObject<PageData>(data, "page");
  requireOneOf(data.kind, PAGE_KINDS, "kind");
  const title = requireString(data.title, "title");
  const action = requireString(data.action, "action");
  requireObject<PageData["masthead"]>(data.masthead, "masthead");
  // one page-wide set per kind: a duplicate id is refused wherever the second
  // one sits, and a section may still share an authored name with a question
  const id = requireString(data.id, "id");
  const page: PageContext = {
    ids: freshIds(),
    files: assets.files ?? {},
    id,
    // read from the data rather than collected as the sections draw, so a
    // block linking forward to a section is checked against the whole page
    sections: new Set(
      (Array.isArray(data.sections) ? data.sections : []).map(
        (section) => (section as Section | null)?.id ?? "",
      ),
    ),
    set: assets.set,
  };
  const sections = requireArray<Section>(data.sections, "sections")
    .map((section, index) => renderSection(section, index, page))
    .join("");
  const sources = renderSources(data.sources, "sources");
  // a board that asks nothing carries no reply, and so no count to announce,
  // no reply to show, and nothing to copy. Drawing those controls anyway would
  // offer a reader an empty message to send back
  const asks = questionsOf(data.sections).length;
  if (asks) requireObject<PageData["reply"]>(data.reply, "reply");
  const mermaid = mermaidScript(data, assets);
  const theme = renderTheme(data.theme, "theme");
  // drawn last inside the sheet, below the three columns. The grid is what a
  // reader opens the drawer for; the run's other boards are where they go once
  // they are finished with this one, so they read as a footer rather than as
  // the first thing between the reader and the sections they came for
  const boardSet = renderBoardSet(assets.set, id);
  // the chip strip is painted by the runtime, because a chip's colour is the
  // answer behind it; the renderer ships the rail it paints into
  const chips = asks
    ? '<div class="chip-strip" data-chip-strip role="group" aria-label="Question status"></div>'
    : "";
  const counters = asks
    ? `<span class="drawer-count" id="drawer-count" data-unanswered-count aria-live="polite">${asks} unanswered</span>
<button type="button" class="reply-show" data-reply-open hidden>Show reply</button>
<button type="button" class="copy" data-copy><span class="sr-only">Copy reply</span>${COPY_ICONS}<span class="copy-state" data-copy-status role="status"></span></button>`
    : "";
  const reply = asks ? replyDialog(data) : "";
  const nav = data.sections
    .map(
      (section) =>
        `<a href="#s-${escapeHtml(section.id)}">${escapeHtml(section.label)}</a>`,
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
${assets.css}${theme && `\n${theme}`}
</style>
<script>
${assets.boot}
</script>
</head>
<body data-page-id="${escapeHtml(id)}" data-kind="${escapeHtml(data.kind)}">
<main class="page">
<header class="masthead">
<p class="eyebrow">${escapeHtml(requireString(data.masthead.eyebrow, "masthead.eyebrow"))}</p>
<h1>${escapeHtml(requireString(data.masthead.headline, "masthead.headline"))}</h1>
<p class="lede">${escapeHtml(requireString(data.masthead.lede, "masthead.lede"))}</p>
${data.masthead.meta === undefined ? "" : renderMetrics(data.masthead.meta, "masthead.meta")}
</header>
${sections}
${sources}
</main>
<div class="drawer" data-drawer>
<div class="drawer-bar" data-drawer-bar>
<span class="drawer-action">${escapeHtml(action)}</span>${chips}
<div class="drawer-controls">${counters}
<button type="button" class="scheme" data-scheme-toggle data-scheme="auto">${SCHEME_ICONS}<span class="sr-only">Colour scheme: <span data-scheme-state>Auto</span></span></button>
<button type="button" class="drawer-toggle" data-drawer-toggle aria-expanded="false" aria-controls="drawer-panel"${asks ? ' aria-describedby="drawer-count"' : ""}><span class="sr-only">${escapeHtml(action)}: </span><span class="drawer-hint" data-drawer-hint>Expand</span></button>
</div>
</div>
<div class="drawer-panel" id="drawer-panel" inert aria-hidden="true">
<div class="drawer-sheet">
<div class="drawer-grid">
<nav class="drawer-nav" aria-label="Sections"><h3>Sections</h3>${nav}</nav>
<div><h3>Decisions</h3><ul class="summaries" data-summaries></ul><button type="button" class="approve-rest" data-approve-rest hidden>Approve the unmarked questions</button></div>
<div class="drawer-notes"><h3>Notes <span class="note-count" data-note-count>0 notes</span></h3><ul class="note-list" data-notes></ul><button type="button" class="note-clear" data-note-clear hidden>Clear all notes</button></div>
</div>${boardSet}
</div>
</div>
</div>
<dialog class="note-dialog" data-note-dialog aria-labelledby="note-dialog-title">
<form method="dialog" class="note-form" data-note-form>
<h3 id="note-dialog-title" data-note-title>Note</h3>
<q class="note-dialog-quote" data-note-quote hidden></q>
<label class="note-label" for="note-dialog-text">Your note</label>
<textarea class="note-input" id="note-dialog-text" data-note-text rows="5"></textarea>
<div class="note-dialog-actions">
<button type="button" class="note-drop" data-note-remove hidden>Remove</button>
<span class="note-dialog-spacer"></span>
<button type="button" class="note-cancel" data-note-cancel>Cancel</button>
<button type="submit" class="note-save">Save</button>
</div>
</form>
</dialog>
${reply}${mermaid}<script>
${assets.runtime}
</script>
</body>
</html>
`;
}

/**
 * draws the dialog holding the reply, for a board that asks something.
 *
 * it is a dialog rather than a panel because the reply is the end of the
 * reader's work with the board, not another thing to read past on the way
 * through it.
 * @param data the parsed presentation data
 * @returns the dialog as HTML
 */
function replyDialog(data: PageData): string {
  const reply = requireObject<NonNullable<PageData["reply"]>>(
    data.reply,
    "reply",
  );

  return `<dialog class="reply-dialog" data-reply-dialog open aria-labelledby="reply-dialog-title">
<form method="dialog" class="reply-head">
<h3 id="reply-dialog-title">${escapeHtml(requireString(reply.heading, "reply.heading"))}</h3>
<button type="submit" class="reply-close" data-reply-close>Close</button>
</form>
<pre class="reply" data-reply data-template="${escapeHtml(replyTemplate(data))}">${escapeHtml(renderReply(data))}</pre>
</dialog>
`;
}

/**
 * gives the Mermaid runtime a board needs, as a script tag it can carry.
 *
 * it sits before the page runtime, because that runtime draws the graphs and
 * cannot draw them with a library that has not loaded yet.
 * @param data the board's data
 * @param assets everything the page carries that this did not compute
 * @returns the script tag, or an empty string for a board that draws no graphs
 */
function mermaidScript(data: PageData, assets: PageAssets): string {
  if (!usesMermaid(data)) return "";
  // rendering it blank would produce a board that looks whole and silently
  // omits a diagram; refusing names the one thing the caller has to fix
  if (!assets.mermaid)
    throw new RenderError(
      "this board draws with Mermaid but was given no Mermaid runtime; the CLI layer loads it when the data asks for it, so renderPage was called with assets built for a different board",
    );

  return `<script>\n${assets.mermaid}\n</script>\n`;
}
