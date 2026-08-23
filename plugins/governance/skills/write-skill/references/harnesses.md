# Claude Code, Codex, and Grok Build compatibility

Load this reference only when a Claude Code, Codex, or Grok Build difference
affects a skill's execution, required tools, or validation.

## Behavior-affecting differences

- Explicit skill selection does not test implicit discovery. Use
  natural-language intent for agent activation guidance and trigger checks.
- Claude Code path substitutions and frontmatter extensions have no portable
  meaning. Do not put them in the shared `SKILL.md`.
- Resolve every supporting file from the skill root according to
  `references/authoring.md`.
- Do not translate a Claude-only control or runtime command into another
  harness's equivalent by analogy. Use only behavior documented by the target
  harness.
- Grok Build honors `allowed-tools`; we forbid it repo-wide for portability,
  so a shared skill never carries it under any harness.
- Grok Build ignores `SessionStart` and `SubagentStart` stdout, so no skill may
  depend on hook-injected context under it.

## Validation

After the portable checks in `references/authoring.md`, run the root
`SKILL.md` verification command when the target includes Claude Code. This
repository defines no general Codex or Grok Build validator or runtime
evaluator for skills, so do not invent one. When an isolated check for another
harness is unavailable, report the unverified behavior instead of substituting
a Claude result.

## Sources

- [Agent Skills specification](https://agentskills.io/specification)
- [Claude Code skills](https://code.claude.com/docs/en/slash-commands)
- [OpenAI skill building](https://developers.openai.com/plugins/build/skills)
- [xAI skills, plugins, and marketplaces](https://docs.x.ai/build/features/skills-plugins-marketplaces)
