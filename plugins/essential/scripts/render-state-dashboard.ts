#!/usr/bin/env bun
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { decodeStateDashboard, StateValidationFailure } from "./state-codec.ts";
import { renderStateDashboardHtml } from "./state-dashboard-renderer.ts";

import type { ValidationError } from "./state-codec.ts";

export type RenderResult =
  | {
      status: "rendered";
      input: string;
      kind: "project" | "stream";
      output: string;
    }
  | { status: "invalid"; input: string; errors: ValidationError[] };

export async function renderStateDashboard(
  input: string,
): Promise<RenderResult> {
  const absoluteInput = resolve(input);
  let workspace: string | undefined;
  try {
    const document = await decodeStateDashboard(absoluteInput);
    workspace = await mkdtemp(join(tmpdir(), "essential-state-dashboard-"));
    const output = join(workspace, "state-dashboard.html");
    await writeFile(output, renderStateDashboardHtml(document), "utf8");
    return {
      status: "rendered",
      input: absoluteInput,
      kind: document.kind,
      output,
    };
  } catch (error) {
    if (workspace !== undefined)
      await rm(workspace, { force: true, recursive: true });
    const errors =
      error instanceof StateValidationFailure
        ? error.errors
        : [
            {
              code: "render.failure",
              message: (error as Error).message,
              document: absoluteInput,
            },
          ];
    return { status: "invalid", input: absoluteInput, errors };
  }
}

if (import.meta.main) {
  const input = process.argv[2];
  if (input === undefined || process.argv.length !== 3) {
    const result: RenderResult = {
      status: "invalid",
      input: input ?? "",
      errors: [
        {
          code: "cli.arguments",
          message: "usage: render-state-dashboard.ts <state.mdc|state.json>",
          document: input ?? "",
        },
      ],
    };
    console.log(JSON.stringify(result));
    process.exitCode = 2;
  } else {
    const result = await renderStateDashboard(input);
    console.log(JSON.stringify(result));
    if (result.status === "invalid") process.exitCode = 1;
  }
}
