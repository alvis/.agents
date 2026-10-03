#!/usr/bin/env bun
/** a drop-in for `gh pr diff` that also works where GraphQL is blocked; see gh/pr.ts */

import { run } from "./gh/pr.ts";

process.exit(await run("diff", process.argv.slice(2)));
