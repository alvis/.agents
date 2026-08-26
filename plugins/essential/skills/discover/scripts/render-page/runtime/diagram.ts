import { tokenHex } from "./colour.ts";

/** what Mermaid exposes on the page, narrowed to the two calls used here. */
interface Mermaid {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, source: string) => Promise<{ svg: string }>;
}

/**
 * Mermaid's theme variables, each named by the page token it follows.
 *
 * the mapping is written out rather than derived, because Mermaid's names are
 * its own and a clever loop over them would only hide which page token decides
 * what. Anything not listed here Mermaid derives itself from `background` and
 * `primaryColor`.
 */
export const THEME: Record<string, string> = {
  background: "--ui-canvas",
  primaryColor: "--ui-accent-soft",
  primaryTextColor: "--ui-ink",
  primaryBorderColor: "--ui-accent",
  secondaryColor: "--ui-raised",
  secondaryTextColor: "--ui-ink",
  secondaryBorderColor: "--ui-border-strong",
  tertiaryColor: "--ui-surface",
  tertiaryTextColor: "--ui-ink",
  tertiaryBorderColor: "--ui-border",
  lineColor: "--ui-border-strong",
  textColor: "--ui-ink",
  mainBkg: "--ui-raised",
  nodeBorder: "--ui-border-strong",
  nodeTextColor: "--ui-ink",
  clusterBkg: "--ui-surface",
  clusterBorder: "--ui-border",
  titleColor: "--ui-ink",
  edgeLabelBackground: "--ui-canvas",
};

/**
 * reads every theme variable off the document in its current scheme
 * @param root the element the tokens hang off
 * @returns Mermaid's theme variables, resolved to hex
 */
function themeVariables(root: Element): Record<string, string> {
  return Object.fromEntries(
    Object.entries(THEME).map(([name, token]) => [name, tokenHex(root, token)]),
  );
}

/**
 * draws one figure, replacing whatever it held.
 * @param mermaid the library
 * @param figure the figure to draw into
 * @param index the figure's position, which makes its render id unique
 */
async function draw(mermaid: Mermaid, figure: HTMLElement, index: number): Promise<void> {
  const canvas = figure.querySelector<HTMLElement>("[data-mermaid-canvas]");
  const text = figure.querySelector<HTMLElement>("[data-mermaid-text]");
  const alt = figure.querySelector<HTMLElement>("[data-mermaid-alt]");
  const details = figure.querySelector<HTMLDetailsElement>("[data-mermaid-source]");
  if (!canvas || !text) return;
  try {
    const { svg } = await mermaid.render(`mermaid-${index}`, text.textContent ?? "");
    canvas.innerHTML = svg;
    figure.dataset.mermaidState = "drawn";
    alt?.classList.add("sr-only");
    if (details) details.open = false;
  } catch (error) {
    // a diagram that fails silently is worse than no diagram: the page looks
    // complete and is missing a claim. So the failure is shown, the written
    // alternative stops being screen-reader-only, and the source is opened —
    // between them a reader can still get everything the graph was to say
    canvas.innerHTML = `<p class="mermaid-error">This diagram could not be drawn: ${
      (error as Error).message
    }</p>`;
    figure.dataset.mermaidState = "failed";
    alt?.classList.remove("sr-only");
    if (details) details.open = true;
  }
}

/**
 * wires every Mermaid figure on the page, and keeps them in step with the theme.
 *
 * renders run one at a time. Mermaid keeps the diagram being laid out in module
 * state, so two overlapping calls resolve against whichever finished last and
 * the pages that show it are the ones with several graphs — exactly the pages
 * where it is hardest to notice.
 * @param root the element the tokens hang off
 * @returns a promise resolving once the first pass has drawn
 */
export function installMermaid(root: Element = document.documentElement): Promise<void> {
  const figures = [...document.querySelectorAll<HTMLElement>("[data-mermaid]")];
  const mermaid = (globalThis as { mermaid?: Mermaid }).mermaid;
  // a board with no graphs never carries the bundle, so its absence is the
  // normal case and not a fault worth reporting
  if (!figures.length || !mermaid) return Promise.resolve();

  let queue = Promise.resolve();
  const paint = (): Promise<void> => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: themeVariables(root),
      fontFamily: getComputedStyle(root).getPropertyValue("--font-body").trim() || "inherit",
    });
    for (const [index, figure] of figures.entries())
      queue = queue.then(() => draw(mermaid, figure, index));

    return queue;
  };

  // a scheme change moves every token, and the graphs are drawn with those
  // token values baked into their SVG — so they are redrawn, not restyled.
  // Both triggers are needed: the attribute catches a reader picking a scheme,
  // and the media query catches the system flipping under `auto`, which
  // changes the same colours with nothing on the page having been touched
  new MutationObserver(() => void paint()).observe(root, {
    attributeFilter: ["data-theme"],
  });
  globalThis
    .matchMedia?.("(prefers-color-scheme: dark)")
    .addEventListener("change", () => void paint());

  return paint();
}
