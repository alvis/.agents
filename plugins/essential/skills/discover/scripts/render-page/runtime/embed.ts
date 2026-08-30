/** one figure's controls, resolved once so the handlers stay small. */
interface Stage {
  /** the figure, which carries the current size as custom properties */
  figure: HTMLElement;
  /** the fixed-size box the frame is scaled inside */
  stage: HTMLElement;
  /** the frame itself */
  frame: HTMLElement;
  /** the viewport buttons, in the order the author declared them */
  buttons: HTMLElement[];
  /** the rotate button, when there are viewports to rotate */
  rotate: HTMLElement | null;
}

/** how a declared viewport lands in the column it is being read in. */
export interface Fit {
  /** what the frame is multiplied by, never above 1 */
  scale: number;
  /** the frame's offset from the stage's left edge, in CSS pixels */
  left: number;
  /** the height the stage takes, so the page below gains no gap */
  height: number;
}

/**
 * works out how a viewport fits the column it is read in.
 *
 * scaled rather than scrolled: a 1440px design in a 700px column is a picture
 * of a wide screen, and a reader comparing two viewports wants the whole
 * layout rather than the left half of it. Never scaled *up* — a phone frame
 * blown out to fill a desktop column would be a different claim about the
 * design than the author made.
 * @param width the viewport width in CSS pixels
 * @param height the viewport height in CSS pixels
 * @param available the stage's own width
 * @returns the scale, offset and stage height to apply
 */
export function fit(width: number, height: number, available: number): Fit {
  const scale = available > 0 && width > 0 ? Math.min(1, available / width) : 1;

  return {
    scale,
    // a phone-sized frame in a full-width column would otherwise sit against
    // the left edge with the rest of the stage empty beside it, which reads as
    // a broken layout rather than as a narrow screen
    left: Math.max(0, Math.round((available - width * scale) / 2)),
    height: Math.round(height * scale),
  };
}

/**
 * sizes one frame to its declared viewport, scaled into the column.
 * @param parts the figure's resolved controls
 * @param width the viewport width in CSS pixels
 * @param height the viewport height in CSS pixels
 */
function size(parts: Stage, width: number, height: number): void {
  const placed = fit(width, height, parts.stage.clientWidth);
  parts.frame.style.width = `${width}px`;
  parts.frame.style.height = `${height}px`;
  parts.frame.style.transform = placed.scale < 1 ? `scale(${placed.scale})` : "";
  parts.frame.style.left = `${placed.left}px`;
  parts.stage.style.height = `${placed.height}px`;
}

/** reads a button's declared viewport. */
function viewportOf(button: HTMLElement): { width: number; height: number } {
  return {
    width: Number(button.dataset.width ?? 0),
    height: Number(button.dataset.height ?? 0),
  };
}

/** wires one figure's buttons, rotation, and its response to the column resizing. */
function install(parts: Stage): void {
  let chosen = parts.buttons[0];
  let rotated = false;

  const apply = (): void => {
    const { width, height } = viewportOf(chosen);
    size(parts, rotated ? height : width, rotated ? width : height);
    for (const button of parts.buttons)
      button.setAttribute("aria-pressed", String(button === chosen));
    parts.rotate?.setAttribute("aria-pressed", String(rotated));
  };

  for (const button of parts.buttons)
    button.addEventListener("click", () => {
      chosen = button;
      apply();
    });

  parts.rotate?.addEventListener("click", () => {
    rotated = !rotated;
    apply();
  });

  // the scale depends on the column's width, which changes with the window,
  // with the drawer opening, and with a section expanding — so it is observed
  // rather than read once. Only a change in WIDTH re-applies: `apply` sets the
  // stage's own height, which the observer would otherwise report back as a
  // resize, and the page would spin between the two forever
  let measured = -1;
  const remeasure = (width: number): void => {
    if (width === measured) return;
    measured = width;
    apply();
  };
  new ResizeObserver((entries) => remeasure(Math.round(entries[0].contentRect.width))).observe(
    parts.stage,
  );
  // the window resizing is the coarse signal and the observer is the precise
  // one; both are wired, because the observer also catches the drawer opening
  // and a section expanding, which never raise a resize
  globalThis.addEventListener?.("resize", () => remeasure(Math.round(parts.stage.clientWidth)));
  apply();
}

/**
 * wires every embedded document's viewport controls.
 *
 * host-side only. Nothing here talks to the embedded document, and nothing
 * could: the frame is sandboxed without `allow-same-origin`, so it has an
 * opaque origin the page cannot reach into. Resizing a frame from outside is
 * what makes a viewport switcher work on a document that never agreed to one.
 * @param root the document to wire, defaulting to the live one
 */
export function installEmbeds(root: ParentNode = document): void {
  for (const figure of root.querySelectorAll<HTMLElement>("[data-embed]")) {
    const stage = figure.querySelector<HTMLElement>("[data-embed-stage]");
    const frame = figure.querySelector<HTMLElement>("[data-embed-frame]");
    const buttons = [...figure.querySelectorAll<HTMLElement>("[data-embed-viewport]")];
    if (!stage || !frame || !buttons.length) continue;
    install({
      figure,
      stage,
      frame,
      buttons,
      rotate: figure.querySelector<HTMLElement>("[data-embed-rotate]"),
    });
  }
}
