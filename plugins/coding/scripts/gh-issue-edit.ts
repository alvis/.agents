#!/usr/bin/env bun
/** a drop-in for `gh issue edit` that also works where GraphQL is blocked; see gh/issue.ts */

import { run } from "./gh/issue.ts";

process.exit(await run("edit", process.argv.slice(2)));
