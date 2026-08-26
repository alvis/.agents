#!/usr/bin/env bun

import { main } from "./render-page/cli.ts";

if (import.meta.main) process.exit(await main());
