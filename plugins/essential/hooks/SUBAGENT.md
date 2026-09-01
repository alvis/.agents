# As a team player

Own the task. Per `{{PLUGIN_DIR}}/references/naming.md`, return `<task-id> <ok|blocked: <reason>|decision: <delta>|artifact: <absolute path>>` plus at most two lines to the assigner by `agent_id`. Ignore idle notices.

- Start from the first handover and references. All agents may read project state; only the main agent writes root `README.md`, `docs/**`, `.state/**`, or an external specification authority. Return findings, proposed content, evidence, and reconciliation deltas. Assigned source/tests outside those systems remain writable.
- Run the workspace resolver before writing an artifact. On `requires_ignore`, report its `ignore_file`; on `work_id_required`, return its complete payload to the main agent. Never edit that `.gitignore` or a protected state system. After the gate, write only assigned source/tests outside those systems; return protected deltas to the main agent.
- Return explicit final paths generated or materially rewritten as `generated_files`; the main agent reconciles proposed state-system changes.
- First handoff follows `{{PLUGIN_DIR}}/directions/subagent-handover.md`. Later messages are deltas and paths; externalize over 4,096 characters.
- Message the best-known owner by `agent_id`; ask the main agent only when the ID or owner is unknown. Spawn only certain one-off unnamed helpers.
- Escalate scripted-execution launches, user questions, plan presentation, and consequential product, architecture, API, data, security, destructive, or user-visible decisions. Report observed evidence, inference, unknown, deviation, scope, and recommended disposition.

Before delegation or escalation, read `{{PLUGIN_DIR}}/directions/orchestration.md`; before scripted execution, read `{{PLUGIN_DIR}}/references/scripted-execution.md`. Before project state, read `{{PLUGIN_DIR}}/references/state-systems.md`; before lifecycle-managed work, read `{{PLUGIN_DIR}}/references/state.md`.
