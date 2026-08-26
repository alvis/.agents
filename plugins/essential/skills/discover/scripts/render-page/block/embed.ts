import { RenderError } from "../error.ts";
import { escapeHtml } from "../escape.ts";
import { slugOf } from "../id.ts";
import { optionalString, requireArray, requireObject, requireString } from "../validate.ts";

import { fileOf } from "./svg.ts";

import type { PageContext } from "../context.ts";
import type { Block, Viewport } from "../types.ts";

/**
 * what the frame is allowed to do.
 *
 * `allow-scripts` and nothing else. Withholding `allow-same-origin` is the
 * whole point: the packed document keeps a unique opaque origin, so its script
 * runs — a prototype behaves like itself — while `parent.document`, the page's
 * storage, and every answer the reader has typed stay unreachable.
 */
const SANDBOX = "allow-scripts";

/** the widest a declared viewport may be, past which it is a typo. */
const LIMIT = 8192;

/**
 * the device glyphs, chosen by declared width rather than by the author's name.
 *
 * a viewport may be called anything — "iPhone 15", "Studio Display", "narrow" —
 * so matching the name would either need a device list to maintain or would
 * draw a phone beside a 1440px viewport. The width is the number the author
 * actually gave, so an icon derived from it can never contradict the size it
 * sits on. The name is still carried, as text, for anyone reading the button.
 */
const DEVICE_ICONS: { under: number; icon: string }[] = [
  {
    under: 600,
    icon: `<rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M10.6 18.7h2.8" />`,
  },
  {
    under: 1024,
    icon: `<rect x="4" y="3.5" width="16" height="17" rx="2.2" /><path d="M10.6 17.6h2.8" />`,
  },
  {
    under: Number.POSITIVE_INFINITY,
    icon: `<rect x="2.5" y="4" width="19" height="13" rx="2" /><path d="M8 20.5h8M12 17.5v3" />`,
  },
];

/** draws the glyph for a viewport of this width. */
function deviceIcon(width: number): string {
  const { icon } = DEVICE_ICONS.find(({ under }) => width < under) ?? DEVICE_ICONS.at(-1)!;

  return `<svg class="embed-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icon}</svg>`;
}

/** the rotate control, drawn rather than lettered so it survives translation. */
const ROTATE_ICON =
  `<svg class="embed-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9.5A8 8 0 0 1 18.5 7M20 14.5A8 8 0 0 1 5.5 17" /><path d="M4 4.5v5h5M20 19.5v-5h-5" /></svg>`;

/** refuses a viewport dimension that is not a usable number of pixels. */
function requirePixels(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0)
    throw new RenderError(
      `${path}: required a whole number of pixels above zero, received ${JSON.stringify(value)}`,
    );
  if (value > LIMIT)
    throw new RenderError(
      `${path}: ${value} is wider than any screen this is read on (${LIMIT}), which is a typo rather than a viewport`,
    );

  return value;
}

/** draws one viewport button, the first of which starts pressed. */
function renderViewport(viewport: Viewport, path: string, first: boolean): string {
  requireObject<Viewport>(viewport, path);
  const name = requireString(viewport.name, `${path}.name`);
  const width = requirePixels(viewport.width, `${path}.width`);
  const height = requirePixels(viewport.height, `${path}.height`);

  // the name is drawn as an icon and kept as real text rather than an
  // `aria-label`: find-in-page reaches it, a translation engine translates it,
  // and a reader who turns images off still gets the word. `title` is a
  // tooltip only — the accessible name already comes from the text inside
  const label = `${escapeHtml(name)} — ${width} by ${height} pixels`;

  return [
    `<button type="button" class="embed-viewport" data-embed-viewport`,
    ` data-width="${width}" data-height="${height}"`,
    ` title="${label}" aria-pressed="${first}">`,
    deviceIcon(width),
    `<span class="sr-only">${label}</span>`,
    `</button>`,
  ].join("");
}

/** draws the chrome bar: dots, an optional URL, and the viewport controls. */
function renderBar(chrome: string | undefined, controls: string): string {
  if (!chrome && !controls) return "";

  return [
    `<div class="embed-bar">`,
    `<span class="embed-dots" aria-hidden="true"><i></i><i></i><i></i></span>`,
    chrome ? `<span class="embed-url">${escapeHtml(chrome)}</span>` : "",
    controls,
    `</div>`,
  ].join("");
}

/**
 * embeds a packed HTML document in a sandboxed frame.
 *
 * the author names a path and the CLI layer packs that file's own stylesheets,
 * scripts and pictures into one document, which arrives here as a string. It
 * goes into `srcdoc` rather than `src`, so the board carries the prototype
 * instead of pointing at it, and the frame is sandboxed without
 * `allow-same-origin`, so the prototype cannot read the page around it.
 *
 * the viewport buttons resize the frame from the host side only. The embedded
 * document is never asked to cooperate, report its size, or be reachable — it
 * could not answer even if it wanted to.
 * @param block the embed block as the author wrote it
 * @param path JSON path of the block, named verbatim by every refusal
 * @param page the files the CLI layer already read, keyed by `src`
 * @returns the figure's HTML
 */
export function renderEmbed(
  block: Extract<Block, { type: "embed" }>,
  path: string,
  page: PageContext,
): string {
  const title = optionalString(block.title, `${path}.title`);
  const src = requireString(block.src, `${path}.src`);
  const alt = requireString(block.alt, `${path}.alt`);
  const document = fileOf(page, src, `${path}.src`);
  if (block.chrome !== undefined && typeof block.chrome !== "string" && typeof block.chrome !== "boolean")
    throw new RenderError(
      `${path}.chrome: required a string to show in the URL bar, or true for chrome without one, received ${JSON.stringify(block.chrome)}`,
    );
  const chrome = typeof block.chrome === "string" ? block.chrome : undefined;

  const declared = block.viewports === undefined
    ? []
    : requireArray<Viewport>(block.viewports, `${path}.viewports`);
  const buttons = declared.map((viewport, index) =>
    renderViewport(viewport, `${path}.viewports[${index}]`, index === 0),
  );
  // the widths are one control and rotation is another: the three are mutually
  // exclusive and rotation applies to whichever is chosen, so drawing them as
  // one undivided row would say they are four of a kind
  const controls = buttons.length
    ? [
        `<div class="embed-controls">`,
        `<div class="embed-viewports" role="group" aria-label="Viewport">`,
        buttons.join(""),
        `</div>`,
        `<button type="button" class="embed-rotate" data-embed-rotate title="Rotate" aria-pressed="false">`,
        ROTATE_ICON,
        `<span class="sr-only">Rotate</span>`,
        `</button>`,
        `</div>`,
      ].join("")
    : "";

  const slug = slugOf(path, "em");
  const first = declared[0];
  // a frame with no declared viewport has no intrinsic size and nothing to
  // infer one from, so the stage takes the column's width at a stated ratio
  const sized = first
    ? ` style="--embed-width:${first.width}px;--embed-height:${first.height}px"`
    : "";

  return [
    `<figure class="embed-figure" id="${slug}" data-embed${first ? "" : " data-embed-fluid"}${sized}>`,
    title ? `<h3 class="diagram-title" id="${slug}-title">${escapeHtml(title)}</h3>` : "",
    `<div class="embed-chrome"${chrome || block.chrome === true ? "" : ` data-embed-bare`}>`,
    renderBar(chrome, controls),
    `<div class="embed-stage" data-embed-stage>`,
    `<iframe class="embed-frame" data-embed-frame title="${escapeHtml(alt)}"`,
    ` sandbox="${SANDBOX}" loading="lazy" srcdoc="${escapeHtml(document)}"></iframe>`,
    `</div>`,
    `</div>`,
    `<figcaption class="embed-alt sr-only">${escapeHtml(alt)}</figcaption>`,
    `</figure>`,
  ].join("");
}
