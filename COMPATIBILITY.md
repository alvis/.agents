# Harness compatibility

This manually maintained matrix covers the 53 skills and 22 agents currently shipped by this repository. Update it when source manifests or harness documentation change.

Claude Code, Codex, and Grok Build are native targets. OpenCode support targets stable V1 through `scripts/install_opencode.ts`; OpenCode V2 and `opencode2` are unsupported.

## Legend

- ✅ Native/full support
- 🟡 Adapter or compatibility-layer support with a caveat
- 🔌 External integration, credential, or tool required
- 🧪 Experimental harness API
- ❌ Unavailable

## Harness-wide features

| Feature | Claude Code | Codex | Grok Build | OpenCode V1 | Caveat / source |
| --- | --- | --- | --- | --- | --- |
| Plugin installation | ✅ Native | ✅ Native | ✅ Native | 🟡 Adapted | Grok Build installs from its own projected marketplace; OpenCode uses `scripts/install_opencode.ts`. |
| Marketplace catalog | ✅ Native | ✅ Native | 🟡 Adapted | ❌ Unavailable | OpenCode V1 documents local files and npm plugins, not this marketplace format. |
| Skills | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects `plugin:skill` to the collision-safe name `plugin-skill`. |
| Slash commands | ✅ Native | 🟡 Adapted | 🟡 Adapted | 🟡 Adapted | OpenCode generates `/<plugin>-<skill>` wrappers with `$ARGUMENTS`. |
| Skill resources and references | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode bundles complete plugin trees and retargets projected Markdown links. |
| Standards and scanners | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | Runtime prerequisites still apply to scripts invoked by a skill. |
| Bundled scripts | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode copies plugin executables and retargets projected skill-root paths to the bundle. |
| Session context payloads | ✅ Native | ✅ Native | 🟡 Adapted | 🧪 Experimental | OpenCode resolves receipt audiences through `experimental.chat.system.transform`; unresolved sessions receive only identifier mapping. |
| Skill-scoped hooks | ✅ Native | ✅ Native | ❌ Unavailable | 🟡 Adapted | Grok Build ignores skill-frontmatter hooks. OpenCode runs the command-filtered commit guards from resolved receipts because its plugin API exposes no skill-scope event. |
| Question guard | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | The adapter runs the receipt-bound Essential validator before OpenCode `question` execution and retains allow advice for the matching result. |
| Subagent dispatch guard | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode validates `task` prompts through the receipt alias; the host has no persistent teammate identity. |
| Plan-exit guard | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | Claude validates injected plan input or its explicit plan-file path. Codex/T3 validates the current final response at Stop, after rendering, independently of permission mode. Grok validates the session plan beside its transcript before `exit_plan_mode`. OpenCode validates the current session file before `plan_exit` when that tool is enabled; it has no general cancellable Stop event. Native payload and adapter tests cover these paths; live Claude/Grok inference verification requires working authentication. |
| Stop state reminder | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | Grok ignores the blocking Stop envelope. OpenCode exposes no cancellable Stop event, so the receipt is labelled advisory system context and creates no synthetic turn. |
| MCP servers | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | The adapter maps HTTP to remote and command definitions to local MCP servers. |
| Specialist agents | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode Markdown agents inherit the active provider and model. |
| Child subagent sessions | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode task sessions work; persistent teammate IDs and direct peer messaging do not. |
| Project agent memory | ✅ Native | 🟡 Adapted | 🟡 Adapted | 🟡 Adapted | OpenCode receives memory instructions but has no equivalent first-class Claude memory store. |
| Agent write fences | ✅ Native | 🟡 Adapted | 🟡 Adapted | 🟡 Adapted | Recognized critic fences allow only rooted memory and canonical review-state paths; shell and external-directory access are denied. |
| Browser automation | 🔌 Integration | 🔌 Integration | 🔌 Integration | 🔌 Integration | Requires a compatible browser tool or MCP server in every harness. |
| Notion synchronization | 🔌 Integration | 🔌 Integration | 🔌 Integration | 🔌 Integration | Requires the documented Notion transport profile and credentials. |
| Image generation | 🔌 Integration | 🔌 Integration | 🔌 Integration | 🔌 Integration | Requires a supported image provider or tool. |
| Claude output styles | ✅ Native | ❌ Unavailable | ❌ Unavailable | ❌ Unavailable | The repository intentionally scopes output-style installation to Claude Code. |
| Claude statusline | ✅ Native | ❌ Unavailable | ❌ Unavailable | ❌ Unavailable | The repository intentionally scopes statusline installation to Claude Code. |

## Skills

| Feature | Claude Code | Codex | Grok Build | OpenCode V1 | Caveat / source |
| --- | --- | --- | --- | --- | --- |
| `client:create-screen-design` skill | 🔌 Integration | 🔌 Integration | 🔌 Integration | 🔌 Integration | Requires the documented Notion transport and credentials. Source: [SKILL.md](plugins/client/skills/create-screen-design/SKILL.md). |
| `client:update-screen-design` skill | 🔌 Integration | 🔌 Integration | 🔌 Integration | 🔌 Integration | Requires the documented Notion transport and credentials. Source: [SKILL.md](plugins/client/skills/update-screen-design/SKILL.md). |
| `coding:cleanup` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `coding-cleanup`. Source: [SKILL.md](plugins/coding/skills/cleanup/SKILL.md). |
| `coding:commit` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `coding-commit`. Receipt-bound command filtering preserves backup advice and post-rewrite diagnostics, but OpenCode exposes no skill-scope event. Source: [SKILL.md](plugins/coding/skills/commit/SKILL.md). |
| `coding:complete-code` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `coding-complete-code`. Source: [SKILL.md](plugins/coding/skills/complete-code/SKILL.md). |
| `coding:complete-test` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `coding-complete-test`. Source: [SKILL.md](plugins/coding/skills/complete-test/SKILL.md). |
| `coding:document` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `coding-document`. Source: [SKILL.md](plugins/coding/skills/document/SKILL.md). |
| `coding:draft-code` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `coding-draft-code`. Source: [SKILL.md](plugins/coding/skills/draft-code/SKILL.md). |
| `coding:finalize-commits` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `coding-finalize-commits`. Source: [SKILL.md](plugins/coding/skills/finalize-commits/SKILL.md). |
| `coding:find-unused` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `coding-find-unused`. Source: [SKILL.md](plugins/coding/skills/find-unused/SKILL.md). |
| `coding:fix` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `coding-fix`. Source: [SKILL.md](plugins/coding/skills/fix/SKILL.md). |
| `coding:lint` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `coding-lint`. Source: [SKILL.md](plugins/coding/skills/lint/SKILL.md). |
| `coding:modernize` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `coding-modernize`. Source: [SKILL.md](plugins/coding/skills/modernize/SKILL.md). |
| `coding:pr` skill | 🔌 Integration | 🔌 Integration | 🔌 Integration | 🔌 Integration | Requires authenticated GitHub tooling. Source: [SKILL.md](plugins/coding/skills/pr/SKILL.md). |
| `coding:presetter` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `coding-presetter`. Source: [SKILL.md](plugins/coding/skills/presetter/SKILL.md). |
| `coding:refactor` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `coding-refactor`. Source: [SKILL.md](plugins/coding/skills/refactor/SKILL.md). |
| `coding:review-code` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `coding-review-code`. Source: [SKILL.md](plugins/coding/skills/review-code/SKILL.md). |
| `coding:setup-project` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `coding-setup-project`. Source: [SKILL.md](plugins/coding/skills/setup-project/SKILL.md). |
| `coding:sync-tool` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `coding-sync-tool`. Source: [SKILL.md](plugins/coding/skills/sync-tool/SKILL.md). |
| `coding:write-code` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `coding-write-code`. Source: [SKILL.md](plugins/coding/skills/write-code/SKILL.md). |
| `essential:autoresearch` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `essential-autoresearch`. Source: [SKILL.md](plugins/essential/skills/autoresearch/SKILL.md). |
| `essential:decide` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `essential-decide`. Source: [SKILL.md](plugins/essential/skills/decide/SKILL.md). |
| `essential:deep-research` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `essential-deep-research`. Source: [SKILL.md](plugins/essential/skills/deep-research/SKILL.md). |
| `essential:discover` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `essential-discover`. Source: [SKILL.md](plugins/essential/skills/discover/SKILL.md). |
| `essential:doctor` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `essential-doctor`. Source: [SKILL.md](plugins/essential/skills/doctor/SKILL.md). |
| `essential:handoff` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `essential-handoff`. Source: [SKILL.md](plugins/essential/skills/handoff/SKILL.md). |
| `essential:handover` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `essential-handover`. Source: [SKILL.md](plugins/essential/skills/handover/SKILL.md). |
| `essential:install-agents` skill | ✅ Native | ✅ Native | ✅ Native | ❌ Unavailable | The projector already installs OpenCode agents; this skill's installer supports Claude Code, Codex, and Grok Build. Source: [SKILL.md](plugins/essential/skills/install-agents/SKILL.md). |
| `essential:install-output-styles` skill | ✅ Native | ❌ Unavailable | ❌ Unavailable | ❌ Unavailable | Claude-only by contract. Source: [SKILL.md](plugins/essential/skills/install-output-styles/SKILL.md). |
| `essential:install-statusline` skill | ✅ Native | ❌ Unavailable | ❌ Unavailable | ❌ Unavailable | Claude-only by contract. Source: [SKILL.md](plugins/essential/skills/install-statusline/SKILL.md). |
| `essential:takeover` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `essential-takeover`. Source: [SKILL.md](plugins/essential/skills/takeover/SKILL.md). |
| `governance:create-agent` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `governance-create-agent`. Source: [SKILL.md](plugins/governance/skills/create-agent/SKILL.md). |
| `governance:create-standard` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `governance-create-standard`. Source: [SKILL.md](plugins/governance/skills/create-standard/SKILL.md). |
| `governance:update-agent` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `governance-update-agent`. Source: [SKILL.md](plugins/governance/skills/update-agent/SKILL.md). |
| `governance:update-standard` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `governance-update-standard`. Source: [SKILL.md](plugins/governance/skills/update-standard/SKILL.md). |
| `governance:write-skill` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `governance-write-skill`. Source: [SKILL.md](plugins/governance/skills/write-skill/SKILL.md). |
| `production:review-render` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `production-review-render`. Source: [SKILL.md](plugins/production/skills/review-render/SKILL.md). |
| `production:track-assets` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `production-track-assets`. Source: [SKILL.md](plugins/production/skills/track-assets/SKILL.md). |
| `react:lint` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `react-lint`. Source: [SKILL.md](plugins/react/skills/lint/SKILL.md). |
| `react:react` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `react-react`. Source: [SKILL.md](plugins/react/skills/react/SKILL.md). |
| `specification:implement-code` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `specification-implement-code`. Source: [SKILL.md](plugins/specification/skills/implement-code/SKILL.md). |
| `specification:mdc` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `specification-mdc`. Source: [SKILL.md](plugins/specification/skills/mdc/SKILL.md). |
| `specification:plan-code` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `specification-plan-code`. Source: [SKILL.md](plugins/specification/skills/plan-code/SKILL.md). |
| `specification:review-implementation` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `specification-review-implementation`. Source: [SKILL.md](plugins/specification/skills/review-implementation/SKILL.md). |
| `specification:spec-code` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `specification-spec-code`. Source: [SKILL.md](plugins/specification/skills/spec-code/SKILL.md). |
| `specification:sync-notion` skill | 🔌 Integration | 🔌 Integration | 🔌 Integration | 🔌 Integration | Requires the documented Notion transport and credentials. Source: [SKILL.md](plugins/specification/skills/sync-notion/SKILL.md). |
| `specification:sync-spec` skill | 🔌 Integration | 🔌 Integration | 🔌 Integration | 🔌 Integration | Requires the documented Notion transport and credentials. Source: [SKILL.md](plugins/specification/skills/sync-spec/SKILL.md). |
| `web:audit` skill | 🔌 Integration | 🔌 Integration | 🔌 Integration | 🔌 Integration | Requires a compatible browser integration. Source: [SKILL.md](plugins/web/skills/audit/SKILL.md). |
| `web:css` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `web-css`. Source: [SKILL.md](plugins/web/skills/css/SKILL.md). |
| `web:design` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `web-design`. Source: [SKILL.md](plugins/web/skills/design/SKILL.md). |
| `web:imagine` skill | 🔌 Integration | 🔌 Integration | 🔌 Integration | 🔌 Integration | Requires an image-generation provider or tool. Source: [SKILL.md](plugins/web/skills/imagine/SKILL.md). |
| `web:next` skill | 🔌 Integration | 🔌 Integration | 🔌 Integration | 🔌 Integration | Requires a compatible browser integration. Source: [SKILL.md](plugins/web/skills/next/SKILL.md). |
| `web:storybook` skill | 🔌 Integration | 🔌 Integration | 🔌 Integration | 🔌 Integration | Requires a compatible browser integration. Source: [SKILL.md](plugins/web/skills/storybook/SKILL.md). |

## Agents

| Feature | Claude Code | Codex | Grok Build | OpenCode V1 | Caveat / source |
| --- | --- | --- | --- | --- | --- |
| `adversarial-red-team` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `coding`. Source: [base.md](plugins/coding/agents/adversarial-red-team/base.md). |
| `ai-research-lead` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `coding`. Source: [base.md](plugins/coding/agents/ai-research-lead/base.md). |
| `code-quality-critic` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Its recognized write fence allows only rooted memory and canonical review-state paths; shell and external-directory access are denied. Owner: `coding`. Source: [base.md](plugins/coding/agents/code-quality-critic/base.md). |
| `data-architect` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `coding`. Source: [base.md](plugins/coding/agents/data-architect/base.md). |
| `devops` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `coding`. Source: [base.md](plugins/coding/agents/devops/base.md). |
| `generalist-engineer` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `coding`. Source: [base.md](plugins/coding/agents/generalist-engineer/base.md). |
| `ml-engineer` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `coding`. Source: [base.md](plugins/coding/agents/ml-engineer/base.md). |
| `principal-engineer` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `coding`. Source: [base.md](plugins/coding/agents/principal-engineer/base.md). |
| `project-initializer` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `coding`. Source: [base.md](plugins/coding/agents/project-initializer/base.md). |
| `security-champion` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `coding`. Source: [base.md](plugins/coding/agents/security-champion/base.md). |
| `tech-lead` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `coding`. Source: [base.md](plugins/coding/agents/tech-lead/base.md). |
| `test-runner` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `coding`. Source: [base.md](plugins/coding/agents/test-runner/base.md). |
| `testing-evangelist` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `coding`. Source: [base.md](plugins/coding/agents/testing-evangelist/base.md). |
| `harness-eval-engineer` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `governance`. Source: [base.md](plugins/governance/agents/harness-eval-engineer/base.md). |
| `workflow-optimizer` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `governance`. Source: [base.md](plugins/governance/agents/workflow-optimizer/base.md). |
| `specification-expert` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `specification`. Source: [base.md](plugins/specification/agents/specification-expert/base.md). |
| `aesthetic-evaluator` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Its recognized write fence allows only rooted memory and canonical review-state paths; shell and external-directory access are denied. Owner: `web`. Source: [base.md](plugins/web/agents/aesthetic-evaluator/base.md). |
| `design-lead` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `web`. Source: [base.md](plugins/web/agents/design-lead/base.md). |
| `desktop-implementer` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `web`. Source: [base.md](plugins/web/agents/desktop-implementer/base.md). |
| `frontend-designer` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `web`. Source: [base.md](plugins/web/agents/frontend-designer/base.md). |
| `frontend-implementer` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `web`. Source: [base.md](plugins/web/agents/frontend-implementer/base.md). |
| `mobile-implementer` agent | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode projects Markdown, inherits the active model, and lacks first-class project memory. Owner: `web`. Source: [base.md](plugins/web/agents/mobile-implementer/base.md). |

## Documentation sources

- OpenCode V1: [plugin API](https://dev.opencode.ai/docs/plugins/), [skills](https://opencode.ai/docs/skills/), [agents](https://opencode.ai/docs/agents/), [commands](https://opencode.ai/docs/commands/), [tools](https://opencode.ai/docs/tools/), [permissions](https://opencode.ai/docs/permissions/), [MCP servers](https://opencode.ai/docs/mcp-servers/), and [rules](https://opencode.ai/docs/rules/).
- Grok Build: [xAI skills, plugins, and marketplaces](https://docs.x.ai/build/features/skills-plugins-marketplaces).
