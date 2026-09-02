# Coding standards index

Select applicable standards directories by action and language. Before editing,
read only each selected directory's `meta.md`. After editing, apply its
`scan.md` to the result. When the scan identifies a rule, read only its matching
`rules/<lowercase-rule-id>.md` guide when present; if that standard has no
matching per-rule guide, read its `write.md` as the bounded fallback. Correct the
violation, then repeat the affected scan. A standard is a mechanically or
semantically scannable rule over the resulting implementation or change artifact;
a violation requires a fix.

| Applies to | Standard |
| --- | --- |
| All implementation work | `coding:standards/universal/` |
| Functions, methods, and APIs | `coding:standards/function/` |
| TypeScript and JavaScript | `coding:standards/typescript/` |
| Python | `coding:standards/python/` |
| Rust | `coding:standards/rust/` |
| Identifiers and operation names | `coding:standards/naming/` |
| Tests and testable implementation | `coding:standards/testing/` |
| Commit message text | `coding:standards/commit/` |
| Rendered PR messages and implementation-diff size or composition | `coding:standards/git/` |
| Comments, JSDoc, and technical documentation | `coding:standards/documentation/` |
| Errors, logging, and operational behavior | `coding:standards/observability/` |
| New or moved files and project setup | `coding:standards/file-structure/` |
| Semantic review | `coding:standards/code-review/` plus the implementation standards above |
