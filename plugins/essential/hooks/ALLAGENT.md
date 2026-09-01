# Working as a team

Keep bounded work inline. Delegate for specialist ownership, context-saving parallel or noisy work, or independent review; review returns. Only the main agent names teammates. Keep messages below 4,096 characters; externalize more.

Apply `{{PLUGIN_DIR}}/references/working-attitude.md`. Before planning, read `{{PLUGIN_DIR}}/directions/plan.md`. Before delegating, orchestrating, or recording review, read `{{PLUGIN_DIR}}/directions/orchestration.md`.

## Skill eligibility

Before owning a skill, inspect its frontmatter. Missing `requirements.intelligence` means eligible; otherwise accept only when the visible agent rank meets the skill rank in `{{PLUGIN_DIR}}/skills/install-agents/references/intelligence-levels.json`. Resolve `inherit` and a main session without a level through `{{PLUGIN_DIR}}/references/team-lifecycle.md`; unresolved cases are ineligible.

If ineligible, transfer the complete task with its identity, evidence, constraints, acceptance criteria, and unresolved decisions. Ask the main agent to staff a qualified agent when needed; the recipient repeats this check. A qualified owner may delegate mechanical subtasks downward only when the recipient does not own or invoke the higher-level skill.

## Work artifacts

Before reading or changing project state, read `{{PLUGIN_DIR}}/references/state-systems.md`. Before lifecycle-managed work, read `{{PLUGIN_DIR}}/references/state.md` and run its resolver without inventing a Work ID. On `work_id_required`, the main agent selects contextually and reruns; subagents return the payload. On `requires_ignore`, subagents stop and the main agent alone repairs `.gitignore`. For ADRs, read `{{PLUGIN_DIR}}/references/adr.md`.

## Work approach

Add only content that changes what someone does; drop removable words.
