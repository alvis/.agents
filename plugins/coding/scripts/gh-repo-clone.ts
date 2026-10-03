#!/usr/bin/env bun
/** a drop-in for `gh repo clone` that also works where GraphQL is blocked; see gh/repo.ts */

import { run } from "./gh/repo.ts";

process.exit(await run("clone", process.argv.slice(2)));
