import { escapeHtml } from "../escape.ts";
import { slugOf } from "../id.ts";
import { optionalString, requireString } from "../validate.ts";

import type { Block, PageData } from "../types.ts";

/**
 * draws a Mermaid graph as its own source, for the runtime to replace.
 *
 * nothing is rendered here. the graph is drawn in the browser, because
 * Mermaid needs layout measurement this build has no DOM for — so what the
 * page carries is the source, the text alternative, and a place to put the
 * result. That ordering is also what makes failure survivable: a page whose
 * runtime never arrives, or whose graph is malformed, still holds everything
 * needed to read the diagram as text.
 * @param block the mermaid block as the author wrote it
 * @param path JSON path of the block, named verbatim by every refusal
 * @returns the figure's HTML, carrying its own source
 */
export function renderMermaid(
  block: Extract<Block, { type: "mermaid" }>,
  path: string,
): string {
  const title = optionalString(block.title, `${path}.title`);
  const source = requireString(block.source, `${path}.source`);
  const alt = requireString(block.alt, `${path}.alt`);
  const slug = slugOf(path, "mm");
  const label = title
    ? ` aria-labelledby="${slug}-title"`
    : ` aria-label="${escapeHtml(alt)}"`;
  return [
    `<figure class="mermaid-figure" data-mermaid id="${slug}"${label}>`,
    title
      ? `<h3 class="diagram-title" id="${slug}-title">${escapeHtml(title)}</h3>`
      : "",
    // the alternative is read, not seen, until the graph fails to draw; then
    // the runtime unhides it, because at that point it is all there is
    `<p class="mermaid-alt sr-only" data-mermaid-alt>${escapeHtml(alt)}</p>`,
    `<div class="mermaid-canvas" data-mermaid-canvas role="img" aria-label="${escapeHtml(alt)}"></div>`,
    `<details class="mermaid-source" data-mermaid-source>`,
    `<summary>Diagram source</summary>`,
    `<pre data-mermaid-text>${escapeHtml(source)}</pre>`,
    `</details>`,
    `</figure>`,
  ].join("");
}

/**
 * says whether a board draws with Mermaid.
 *
 * asked of the data rather than of the rendered HTML, because the answer
 * decides whether 3.5 MB of runtime is fetched at all — and that decision has
 * to be made before rendering, not discovered after it.
 * @param data the board's data, as read from disk
 * @returns true when any section holds a mermaid block
 */
export function usesMermaid(data: PageData): boolean {
  return (
    Array.isArray(data?.sections) &&
    data.sections.some(
      (section) =>
        Array.isArray(section?.blocks) &&
        section.blocks.some((block) => block?.type === "mermaid"),
    )
  );
}
