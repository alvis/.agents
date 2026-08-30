import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { readSources } from "./source-file.ts";
import { formatCodeBlocks } from "./format.ts";
import { colourCodeBlocks, highlighterOnce } from "./prism.ts";
import { CODE_CSS } from "./style/code.ts";
import { OBSERVATION_CSS } from "./style/observation.ts";
import { codeExcerpts, usesBlock } from "./walk.ts";
import { usesMermaid } from "./block/mermaid.ts";
import { RenderError } from "./error.ts";
import { renderPage } from "./page.ts";
import { getMermaidRuntime } from "./vendor.ts";

import type { PageAssets } from "./bundle.ts";
import type { Highlighter } from "./prism.ts";
import type { PageData } from "./types.ts";

/**
 * reads a data file, renders it, and writes the resulting page.
 *
 * assets are taken rather than built, so rendering a set of boards bundles
 * the runtime once instead of once a board.
 * @param dataPath path to the JSON data file
 * @param outPath path the rendered HTML is written to
 * @param assets the stylesheet and scripts every page carries
 * @param highlight resolves the highlighter, at most once however often asked
 * @returns the rendered document
 */
export async function renderFile(
  dataPath: string,
  outPath: string,
  assets: PageAssets,
  highlight: () => Promise<Highlighter | undefined> = highlighterOnce(),
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
  // every read happens here, so `renderPage` stays a pure function of what
  // it is handed: files resolve against the data file's own directory, and
  // the Mermaid bundle is fetched only for a board that actually draws with it
  const files = await readSources(data, dirname(dataPath));
  // formatting rewrites the excerpts the renderer will read, so it runs before
  // rendering rather than inside it: an author's selections are matched against
  // the formatted text, and that text has to be settled first
  formatCodeBlocks(data);
  // colour is measured here and carried as ranges, so the page receives spans
  // and a palette rather than a parser, and a board holding no excerpt at all
  // gains neither
  const excerpts = codeExcerpts(data);
  if (excerpts.length) colourCodeBlocks(data, await highlight());
  const mermaid = usesMermaid(data)
    ? await getMermaidRuntime()
    : undefined;
  // a sheet per feature the board actually uses, appended in a fixed order.
  // The alternative is one stylesheet carrying every format, which would make
  // each of these boards heavier for the formats it does not draw
  const css = [
    assets.css,
    ...(excerpts.length ? [CODE_CSS] : []),
    ...(usesBlock(data, "observations") ? [OBSERVATION_CSS] : []),
  ].join("\n\n");
  const html = renderPage(data, { ...assets, css, files, mermaid });
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html, "utf8");
  return html;
}
