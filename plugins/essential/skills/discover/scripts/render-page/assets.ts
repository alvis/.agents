import { DIAGRAM_CSS } from "./diagram/style.ts";
import { PAGE_CSS } from "./style.ts";

/**
 * everything a rendered page carries that `renderPage` did not compute.
 *
 * `renderPage` takes these as data rather than reaching for them, so it stays
 * a pure function of its arguments and every read — the one part of the build
 * that touches disk — stays in the layer that already does IO.
 *
 * The stylesheet and scripts are built once per run and shared by every board;
 * `files` is resolved per board, from the paths that board's own data names.
 */
export interface PageAssets {
  /** the complete stylesheet, ready to inline */
  css: string;
  /** the script that runs in the head, before the first paint */
  boot: string;
  /** the runtime carried at the end of the body */
  runtime: string;
  /**
   * the Mermaid bundle, carried only by a board that draws with it.
   *
   * absent is the normal case: it is 3.5 MB, and a board with no Mermaid
   * block has no use for it. A board that does draw with it and is handed
   * nothing here is refused rather than rendered blank.
   */
  mermaid?: string;
  /** file contents the CLI layer read, keyed by the `src` the author wrote */
  files?: Record<string, string>;
}

/**
 * bundles one runtime entry into a script the page can carry.
 *
 * the behaviours are authored as real modules under `runtime/`, so the suite
 * can import and execute them; this turns that tree into the single script the
 * page holds. `root` is what keeps the bundler's path comments relative, so the
 * same input renders the same bytes on any machine.
 * @param entry the module the bundle starts from
 * @returns the bundled script, ready to inline
 */
async function bundle(entry: string): Promise<string> {
  const built = await Bun.build({
    entrypoints: [new URL(`./runtime/${entry}`, import.meta.url).pathname],
    root: new URL("./runtime/", import.meta.url).pathname,
    target: "browser",
    format: "iife",
  });

  if (!built.success)
    throw new AggregateError(built.logs, `cannot bundle ${entry}`);

  return (await built.outputs[0].text()).trim();
}

/**
 * builds everything a page carries beyond its own content.
 *
 * bundling costs enough to be worth doing once per run rather than once per
 * page, which is why this is separate from rendering rather than folded into
 * it.
 * @returns the assets to hand to `renderPage`
 */
export async function buildAssets(): Promise<PageAssets> {
  const [boot, runtime] = await Promise.all([
    bundle("boot.ts"),
    bundle("main.ts"),
  ]);

  return { css: `${PAGE_CSS}${DIAGRAM_CSS}`, boot, runtime };
}
