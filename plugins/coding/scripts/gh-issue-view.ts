#!/usr/bin/env bun
/** a drop-in for `gh issue view` that also works where GraphQL is blocked; see gh/issue.ts */

import { run } from "./gh/issue.ts";

process.exit(await run("view", process.argv.slice(2)));
