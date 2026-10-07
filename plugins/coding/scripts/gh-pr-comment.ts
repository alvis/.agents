#!/usr/bin/env bun
/** a drop-in for `gh pr comment` that posts plain comments only, also where GraphQL is blocked; see gh/pr.ts */

import { run } from "./gh/pr.ts";

process.exit(await run("comment", process.argv.slice(2)));
