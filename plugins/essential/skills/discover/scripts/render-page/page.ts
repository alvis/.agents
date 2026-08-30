import { usesMermaid } from "./block/mermaid.ts";
import { renderMetrics } from "./block/metric.ts";
import { COPY_ICONS } from "./copy.ts";
import { RenderError } from "./error.ts";
import { escapeHtml } from "./escape.ts";
import { questionsOf, renderReply, replyTemplate } from "./reply.ts";
import { SCHEME_ICONS } from "./scheme.ts";
import { renderSection } from "./section.ts";
import { renderSources } from "./source.ts";
import { renderTheme } from "./theme.ts";
import {
  requireArray,
  requireObject,
  requireOneOf,
  requireString,
} from "./validate.ts";
import { PAGE_KINDS } from "./vocabulary.ts";

import type { PageAssets } from "./assets.ts";
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
  requireObject<PageData["reply"]>(data.reply, "reply");
  // one page-wide set per kind: a duplicate id is refused wherever the second
  // one sits, and a section may still share an authored name with a question
  const page: PageContext = {
    ids: {
      finding: new Set<string>(),
      probe: new Set<string>(),
      question: new Set<string>(),
      section: new Set<string>(),
    },
    files: assets.files ?? {},
  };
  const sections = requireArray<Section>(data.sections, "sections")
    .map((section, index) => renderSection(section, index, page))
    .join("");
  const sources = renderSources(data.sources, "sources");
  const mermaid = mermaidScript(data, assets);
  const theme = renderTheme(data.theme, "theme");
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
<body data-page-id="${escapeHtml(requireString(data.id, "id"))}" data-kind="${escapeHtml(data.kind)}">
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
<button type="button" class="drawer-toggle" data-drawer-toggle aria-expanded="false" aria-controls="drawer-panel" aria-describedby="drawer-count">
<span class="drawer-action">${escapeHtml(action)}</span>
<span class="drawer-hint" data-drawer-hint>Expand</span>
</button>
<span class="drawer-count" id="drawer-count" data-unanswered-count aria-live="polite">${questionsOf(data.sections).length} unanswered</span>
<button type="button" class="reply-show" data-reply-open hidden>Show reply</button>
<button type="button" class="copy" data-copy><span class="sr-only">Copy reply</span>${COPY_ICONS}<span class="copy-state" data-copy-status role="status"></span></button>
<button type="button" class="scheme" data-scheme-toggle data-scheme="auto">${SCHEME_ICONS}<span class="sr-only">Colour scheme: <span data-scheme-state>Auto</span></span></button>
</div>
<div class="drawer-panel" id="drawer-panel" hidden>
<div class="drawer-grid">
<nav class="drawer-nav" aria-label="Sections"><h3>Sections</h3>${nav}</nav>
<div><h3>Decisions</h3><ul class="summaries" data-summaries></ul><button type="button" class="approve-rest" data-approve-rest hidden>Approve the unmarked questions</button></div>
<div class="drawer-notes"><h3>Notes <span class="note-count" data-note-count>0 notes</span></h3><ul class="note-list" data-notes></ul><button type="button" class="note-clear" data-note-clear hidden>Clear all notes</button></div>
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
<dialog class="reply-dialog" data-reply-dialog open aria-labelledby="reply-dialog-title">
<form method="dialog" class="reply-head">
<h3 id="reply-dialog-title">${escapeHtml(requireString(data.reply.heading, "reply.heading"))}</h3>
<button type="submit" class="reply-close" data-reply-close>Close</button>
</form>
<pre class="reply" data-reply data-template="${escapeHtml(replyTemplate(data))}">${escapeHtml(renderReply(data))}</pre>
</dialog>
${mermaid}<script>
${assets.runtime}
</script>
</body>
</html>
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
