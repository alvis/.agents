import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { readSources } from "./source-file.ts";
import { usesMermaid } from "./block/mermaid.ts";
import { RenderError } from "./error.ts";
import { renderPage } from "./page.ts";
import { getMermaidRuntime } from "./vendor.ts";

import type { PageAssets } from "./bundle.ts";
import type { PageData } from "./types.ts";

/**
 * reads a data file, renders it, and writes the resulting page.
 *
 * assets are taken rather than built, so rendering a set of boards bundles
 * the runtime once instead of once a board.
 * @param dataPath path to the JSON data file
 * @param outPath path the rendered HTML is written to
 * @param assets the stylesheet and scripts every page carries
 * @returns the rendered document
 */
export async function renderFile(
  dataPath: string,
  outPath: string,
  assets: PageAssets,
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
  const mermaid = usesMermaid(data)
    ? await getMermaidRuntime()
    : undefined;
  const html = renderPage(data, { ...assets, files, mermaid });
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html, "utf8");
  return html;
}
