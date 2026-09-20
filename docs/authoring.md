# Authoring plugin artifacts

Use this authority when creating or changing a skill, agent, standard, payload, or manifest. Placement and naming come from [Plugin content layout](architecture/content-layout.md); cross-cutting truth and supersession rules come from [Repository invariants](architecture/repository-invariants.md).

## Before authoring

<IMPORTANT>
Selecting and applying a standard has one home: `plugins/essential/directions/standards.md`. Follow it instead of restating its read order.
</IMPORTANT>

The canonical authoring sources are:

- `plugins/governance/standards/authoring/meta.md` for one coherent document, supersession instead of addenda, contract-preserving concision, and the Content Boundary Convention: `<IMPORTANT>` marks hard guardrails, `<report>` marks output contracts, and every tag closes. Headings are useful defaults, not a contract.
- `plugins/governance/references/context-catalog.md` for standards an agent may cite. Use canonical paths and never invent a standard.
- `plugins/governance/standards/delegation/meta.md` for batching, reports, and the message ceiling in skills that dispatch subagents.
- `plugins/governance/skills/{write-skill,create-agent,create-standard}/templates/` for seed artifacts. Remove every author-guide comment before shipping.

## Limits and validators

A named validator is the required check. Hook byte budgets have no test gate; measure them whenever a payload or unconditional instructional read chain changes.

| Limit | Validator or reason |
| --- | --- |
| `SKILL.md` body under 500 lines | `plugins/governance/skills/write-skill/scripts/quick_validate.ts` keeps skill entry points bounded |
| Skill `description` 25–60 words | Same validator warning keeps discovery precise |
| No placeholder text and no unresolved local links | Same validator prevents incomplete shipped instructions |
| Agent metadata `description` at most 1,024 characters | `plugins/essential/skills/install/scripts/stitch_agent.ts` preserves harness metadata limits |
| Agent metadata `name` matches `^[a-z0-9]+(?:-[a-z0-9]+)*$` and its directory | Same validator keeps portable identities |
| Agent metadata `intelligence` is listed in `plugins/essential/skills/install/references/intelligence-levels.json` | Harness model and effort fields derive from this portable level |
| Agent harness overlays omit `tools` | Agents inherit runtime capabilities |
| Codex overlay values are scalar TOML fields | Nicknames derive from metadata; stitched Codex and Grok bodies cannot promise Claude-only isolation |
| `memory` is `"project"`; body has exactly one `## Memory` section | Stitch validator preserves one portable memory contract |
| Each injected payload is at most 2,000 bytes | Author review keeps per-event static context bounded |
| Each plugin's unconditional instructional read chain is at most 40,960 bytes | Author review bounds context loaded before task selection |
| Eligible `.state/` work Markdown stays within `plugins/essential/references/output-manifest.md` | Author review; `plugins/essential/scripts/check-markdown-size` is an optional diagnostic |
| Subagent dispatch or direct message is at most 4,096 characters | `plugins/essential/directions/delegate.md` preserves transport headroom |
| A delegated batch is about 10 resources, reports stay under 1,000 tokens, and retries stay near two | `plugins/governance/standards/delegation/` bounds coordination overhead |

Agent metadata descriptions end with the exact sentence `Preferably named <A>, <B>, or <C> when the main agent spawns this role.`, using three distinct capitalized names.

## Naming

Agent names are role-only lowercase kebab-case, never personalized. The root repository contract requires a reason for every new threshold; unexplained magic numbers do not ship.
