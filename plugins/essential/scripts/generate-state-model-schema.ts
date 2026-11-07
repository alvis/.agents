#!/usr/bin/env bun

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { renderStateModelSchema } from "./state-model-v1.schema.ts";

const schemaPath = fileURLToPath(
  new URL("./state-model-v1.schema.json", import.meta.url),
);

async function main(): Promise<void> {
  const rendered = renderStateModelSchema();
  if (process.argv.includes("--check")) {
    const existing = await readFile(schemaPath, "utf8");
    if (existing !== rendered) {
      process.stderr.write("state-model-v1.schema.json is stale\n");
      process.exitCode = 1;
    }
    return;
  }
  await writeFile(schemaPath, rendered, "utf8");
}

if (import.meta.main) await main();
