# Role minimums

Shared decision guide for `create-agent` and `update-agent`. Agent metadata declares independent `requirements.model` and `requirements.effort` minimums. `essential:references/models.md` defines their meaning; `essential:directions/delegate.md` owns task-based launch selection. Assess the role's ordinary complete assignments, including verification and likely repairs, then choose the lowest pair that can finish them. Default to Capable + Deliberate. Use Expert + Instinctive for `security-champion` and `principal-engineer`; Capable + Instinctive for `code-quality-critic`, `aesthetic-evaluator`, and `workflow-optimizer`; Routine + Deliberate for `test-runner`. A role minimum is not a fixed launch setting.

## Other settings

- `permissionMode`: use `auto` for leads, orchestrators, and unattended deep-reasoning or automation producers; `acceptEdits` for scoped edit producers; `default` for critics. Agents launched through deterministic scripted execution always use `acceptEdits`; teammates inherit the lead's mode.
- Tools: omit `tools` so the agent inherits runtime capabilities. A leaf's no-spawn posture is behavioral.
- Memory: set no native `memory` key; the body's `## Memory` section names the agent's state-root memory file.
- Isolation: use `worktree` only when an agent must not race the main working copy.
