#!/usr/bin/env bun
/** a drop-in for `gh pr close` that also works where GraphQL is blocked; see gh/pr.ts */

import { run } from "./gh/pr.ts";

process.exit(await run("close", process.argv.slice(2)));
