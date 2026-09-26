# Governance workflow

Read this before creating, updating, or reviewing agents, skills, standards, or collaboration patterns.

## Actions

| Action | Instruction |
| --- | --- |
| Create or update an agent | `governance:create-agent` or `governance:update-agent`; select the authoring scan below, then read `governance:references/context-catalog.md` and the agent templates |
| Create or update a standard | `governance:create-standard` or `governance:update-standard`; select the authoring scan below, then read the standard templates |
| Create or update a skill | `governance:write-skill`; select the authoring scan below, then read the skill template |
| Verify a skill | `governance:write-skill`; run its verification workflow without rewriting a compliant skill |
| Add delegation to an authored artifact | Also select the delegation scan below |
| Work delegation | Before work delegation, read `governance:references/ROUTING.md` and the injected `essential:directions/delegate.md` contract |

## Standards

Select every row matching the artifact, read its scan before editing, and apply it under `essential:directions/standards.md`.

| Applies to | Scan |
| --- | --- |
| Authored agents, skills, standards, subagent assignments, and reports | [Authoring](../standards/authoring/scan.md) |
| Artifacts that dispatch subagents and delegated execution | [Delegation](../standards/delegation/scan.md) |

Governance owns these authoring standards; do not select standards from an undeclared plugin.
