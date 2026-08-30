#!/usr/bin/env bun

import { main } from "./render-page/state/cli.ts";

if (import.meta.main) process.exit(await main());
