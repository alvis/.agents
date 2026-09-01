# Governance workflow

Read this before creating, updating, or reviewing agents, skills, standards, or collaboration patterns.

## Actions

| Action | Instruction |
| --- | --- |
| Create or update an agent | `governance:create-agent` or `governance:update-agent`; select `governance:standards/authoring/` under the procedure below, then read `governance:references/context-catalog.md` and the agent templates |
| Create or update a standard | `governance:create-standard` or `governance:update-standard`; select `governance:standards/authoring/` under the procedure below, then read the standard templates |
| Create or update a skill | `governance:write-skill`; select `governance:standards/authoring/` under the procedure below, then read the skill template |
| Verify a skill | `governance:write-skill`; run its verification workflow without rewriting a compliant skill |
| Add delegation to an authored artifact | Also select `governance:standards/delegation/` under the procedure below |
| Work delegation | Before work delegation, read `governance:references/ROUTING.md` and the injected `essential:directions/orchestration.md` contract |

## Standards

For each selected standard directory, an artifact writer reads only its
`meta.md` before editing and applies its `scan.md` after editing. A read-only
reviewer reads the same `meta.md` before reviewing and applies the scan at
review start. When a scan identifies a violation, load only the matching
`rules/<lowercase-rule-id>.md`, or that standard's `write.md` as the bounded
fallback when no matching guide exists. The writer corrects the violation and
reruns the scan; the reviewer reports it without editing and reruns the scan
only after the owning writer provides a new revision.

Governance owns authoring invariants and templates, not standards governing its own work. A standard being authored is the target artifact, not an implicit standard governing unrelated governance work. Do not import standards from an undeclared plugin.
