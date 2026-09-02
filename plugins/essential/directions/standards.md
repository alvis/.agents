# Selecting and applying standards

A standard is a mechanically or semantically scannable rule over the resulting
implementation or change artifact; a violation requires a fix. This file is the
one home of that protocol — every skill, agent, and workflow that applies a
standard links here rather than restating it.

## Select

Read the `INDEX.md` at each standards root your work touches and take every row
whose *Applies to* matches the artifact you are about to produce or review:

| Standards root | Indexes |
| --- | --- |
| `coding:standards/INDEX.md` | Implementation, tests, commits, pull requests, documentation, files |
| `react:standards/INDEX.md` | Components, hooks, project structure, stories, accessibility |
| `web:standards/INDEX.md` | Visual design, color modes, brand theming |
| `governance:standards/INDEX.md` | Authored agents, skills, standards, and delegated execution |

Those rows together are the whole selection. A `meta.md` dependency list
explains a standard you already selected; it never adds one. Where a rule
reaches into a standard the index cannot select, `scan.md` names that rule
inline (`(→ RC-PROPS-01)`). Never select a root your plugin does not declare as
a dependency, and never cite a standard that is not indexed.

Selection costs one index read per root. Do not read a standard's `meta.md` to
decide whether it applies.

## Apply

A **writer** edits first, then applies each selected standard's `scan.md` to the
result. A **read-only reviewer** applies the same `scan.md` at review or
verification start, against the revision its owning writer produced.

`scan.md` carries each rule's trigger and the detail that confirms a candidate
against it. When a trigger fires, read that rule's guide at `rules/<rule-id>.md`
when the standard ships one — the id is lowercased there, except under
`coding:standards/commit/` and `coding:standards/git/`, which keep it uppercase.
When the standard ships no matching guide, read its `write.md` as the bounded
fallback.

A writer corrects the violation and reruns the affected scan. A read-only
reviewer reports the finding without editing and reruns the scan only on a new
revision the owning writer produced.

## Read `meta.md` on demand

Each standard's `meta.md` holds its exception policy, its stricter-than-default
requirements, and why each dependency applies. Read it when you need to claim an
exception or justify a deviation — never as a precondition for editing.
