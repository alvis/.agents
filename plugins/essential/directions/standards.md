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
explains relationships; it never adds a standard. Select only the owning
plugin and its declared dependencies. A cross-standard requirement belongs in
the applicable INDEX row, or as a specific trigger in an already-selected
scan with a canonical link to its rule guide. A link does not authorize
loading an undeclared plugin; such a dependency must be resolved by the
owning plugin before the standard can claim that check.

Selection costs one index read per root. Do not read a standard's `meta.md` to
decide whether it applies.

## Apply

A **writer** reads each selected `scan.md` before editing for required inputs,
runtime/tool prerequisites, and irreversible-action checks, then applies its
full checklist to the result. A **read-only reviewer** applies the same scan
at review or verification start, against the writer's exact revision.

`scan.md` carries each rule's trigger and the detail that confirms a candidate
against it. When a trigger fires, follow its rule-guide link, or resolve the
ID in that standard's `rules/` directory using the actual filename case;
existing standards use both uppercase and lowercase filenames. Read the guide
to confirm the candidate before reporting or fixing it. When no matching guide
exists, read that standard's `write.md` as the bounded fallback. Read compliant
patterns there earlier when needed to implement the rule.

A writer corrects the violation and reruns the affected scan. A read-only
reviewer reports the finding without editing and reruns the scan only on a new
revision the owning writer produced.

## Read `meta.md` on demand

Each standard's `meta.md` explains its scope, stricter-than-default policy,
relationships, and exceptions. Read it to claim an exception or justify a
deviation. Mandatory prerequisites and detection criteria must remain
reachable through `scan.md`; metadata cannot be their only home.
