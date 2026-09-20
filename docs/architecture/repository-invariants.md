# Repository invariants

The root [repository contract](../../AGENTS.md#repository-contract) owns the universal one-authority, executable-test, and explained-threshold rules. This document owns their cross-cutting consequences.

## Knowledge model

This repository has no runtime feature flags. Coding's reusable feature-flag standards and PR tooling apply only to target projects that implement flags; do not add marketplace switches to satisfy those standards.

Before changing how a skill records, reads, or retires anything, read [`truth.md`](../../plugins/essential/references/truth.md). It defines how knowledge ages and prevents locally convenient changes from turning derived views into authorities.

## Harness independence

Claude Code, Codex, Grok Build, and OpenCode V1 have independent installation and capability contracts. Instruction loading or operation in one harness must not depend on another harness's files, agents, CLI, or setup. Check an optional capability only when the operation needs it; a missing specialist must not suppress unrelated instructions. Preserve OpenCode's adapter boundary and disclose unsupported behavior in [`COMPATIBILITY.md`](../../COMPATIBILITY.md).

Claude Code, Codex, and Grok Build are one native target, not a primary plus ports. A native hook command, script, projection, installed path, configuration format, or tool name works under all three or is not shipped. Resolve each harness-specific value through one ordered chain, keep the chain in one place, and terminate unrecognized harnesses nonzero. Prove every harness in isolation; tests that inherit another harness's variables prove the wrong path.

A capability unique to one harness must say which harness and why. Claude-only output styles and statusline are current examples. Compatibility consumers generate from native sources, disclose every gap, and reject source shapes an adapter cannot preserve rather than dropping behavior silently. Detailed root resolution and payload behavior live in [Harness projections](harness-projections.md).

## Truth and evidence

Keep committed artifacts distinct from derived views. Marketplace projections and the compatibility matrix are committed and maintained manually. Overviews and installed plugin caches are rebuildable views. `.state/` is operational working memory, not byte-reconstructible; it becomes disposable only after durable facts are promoted and closure is recorded. Do not add a cache, index, or generated summary that something else then depends on.

`done` records terminal history, not current validity. A workflow deciding what to recompute reads validity and never reopens a completed row to express staleness.

Bind every result to the exact revision and inputs it verified. A bare "passed" is not evidence and becomes invalid when a checked input changes.

## Historical continuity

Supersede accepted decisions and shipped contracts; never rewrite their historical bodies. Move superseded ADRs to `decisions/superseded/<domain>/`, add the standard forward header, and leave the successor standing alone. Other records follow their owning contract.
