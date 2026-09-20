import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { resolveDomainContext } from "./domain-context.ts";
import { readGrokPlugins } from "./grok.ts";

const usage = "usage: context.ts --audience {main,subagent} [--prompt TEXT] [--receipt JSON] [--delivered-receipt JSON ...] [--reset]";

/**
 * loads Grok context for an explicitly selected session audience
 * @param argv command arguments
 * @returns zero on success, two on invalid arguments or unavailable context
 */
export function main(argv = process.argv.slice(2)): number {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    process.stdout.write(`${usage}\n`);
    return 0;
  }
  try {
    const { values } = parseArgs({ args: argv, options: {
      audience: { type: "string" }, prompt: { type: "string" },
      receipt: { type: "string" }, reset: { type: "boolean" },
      "delivered-receipt": { type: "string", multiple: true },
      "verify-output": { type: "string" },
    }});
    if (values.audience !== "main" && values.audience !== "subagent") throw new Error(usage);
    const plugins = readGrokPlugins();
    const result = resolveDomainContext({
      plugins, audience: values.audience, cwd: process.cwd(),
      evidence: { prompt: values.prompt }, receipt: values.receipt, reset: values.reset,
      deliveredReceipts: values["delivered-receipt"],
    });
    if (values["verify-output"] !== undefined) {
      const ownRoot = realpathSync(resolve(import.meta.dirname, ".."));
      const supplied = JSON.parse(values["verify-output"]);
      if (!plugins.some((plugin) => plugin.enabled && plugin.name === "essential" && realpathSync(plugin.path) === ownRoot)
        || supplied.context !== result.context || supplied.receipt !== result.receipt) throw new Error("context delivery evidence mismatch");
      return 0;
    }
    if (result.context || result.receipt !== values.receipt) {
      process.stdout.write(JSON.stringify({ context: result.context, receipt: result.receipt }) + "\n");
    }
    return 0;
  } catch (error) {
    process.stderr.write(
      `Grok context unavailable: ${(error as Error).message}\n`,
    );
    return 2;
  }
}

if (import.meta.main) process.exit(main());
