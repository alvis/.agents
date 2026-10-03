#!/usr/bin/env bun
/** a drop-in for `gh pr create` that also works where GraphQL is blocked; see gh/pr.ts */

import { run } from "./gh/pr.ts";

process.exit(await run("create", process.argv.slice(2)));
