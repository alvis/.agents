#!/usr/bin/env bun
/** a drop-in for `gh pr close` whose `--force` marks a deliberate close of a pull request with changes, also where GraphQL is blocked; see gh/pr.ts */

import { run } from "./gh/pr.ts";

process.exit(await run("close", process.argv.slice(2)));
