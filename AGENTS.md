# AGENTS.md

Keep every line load-bearing. If deleting a word would not change what someone does, delete it — that governs this file and everything shipped from this tree.

## Repository contract

This repository is the source of one plugin marketplace for Claude Code, Codex, and Grok Build. OpenCode V1 consumes a generated compatibility projection; OpenCode V2 and `opencode2` are unsupported. This is a greenfield project: breaking changes are accepted, no legacy compatibility is required, and deprecated symbols must be removed.

<IMPORTANT>
Edit plugin sources here, never `~/.claude/plugins/`. That directory is a downstream cache; refresh it with `claude plugin update`.
</IMPORTANT>

Give every fact one authoritative file. A second mention links to that authority instead of copying it. Never test prose by phrase, sentence, or heading presence; test executable behavior or machine-checkable structure. Give every numeric threshold its reason.

Do not hard-wrap prose: every paragraph occupies one source line. Within a plugin, relative file references stay inside that plugin; name a cross-plugin file as `<plugin>:<path-within-plugin>` instead of escaping through `../` or spelling a repository-relative `plugins/<plugin>/...` path.

A plugin may load or execute scripts only inside itself or a declared dependency. Resolve a dependency with the invoking plugin's `scripts/plugin-root <plugin>` projection; never infer sibling or cache layouts in a hook. [`ADR-1`](docs/architecture/decisions/harness/adr-1-installed-plugin-resolution.md) owns the accepted resolver design and its single duplication exception.

## Route the task

Start with [project documentation](docs/README.md), then read the authority for the work:

- Before changing harness manifests, hooks, payload injection, installation, projections, or compatibility behavior, read [Harness projections](docs/architecture/harness-projections.md) and qualify feature status against [`COMPATIBILITY.md`](COMPATIBILITY.md).
- Before adding, moving, or naming plugin content, read [Plugin content layout](docs/architecture/content-layout.md).
- Before changing how the repository records truth, evidence, status, or history, read [Repository invariants](docs/architecture/repository-invariants.md).
- Before authoring an agent, skill, standard, payload, or manifest, read [Authoring plugin artifacts](docs/authoring.md) for the applicable limits and validators.
- Before validating, committing, or publishing, read [Validation and publication](docs/publication.md).

## Source map

| Artifact | Path |
| --- | --- |
| Claude marketplace manifest | `.claude-plugin/marketplace.json` |
| Codex marketplace projection | `.agents/plugins/marketplace.json` |
| Grok marketplace projection | `.grok-plugin/marketplace.json` |
| OpenCode V1 projector | `scripts/install_opencode.ts` + `scripts/opencode_adapter.js` + `scripts/opencode_contract.json` |
| Harness compatibility matrix | `COMPATIBILITY.md` |
| Plugin manifests | `plugins/<p>/.{claude,codex,grok}-plugin/plugin.json` |
| Skill | `plugins/<p>/skills/<name>/SKILL.md` plus its content directories |
| Agent | `plugins/<p>/agents/<name>/base.md` + `frontmatter/{meta,claude,codex,grok}.json` |
| Standard | `plugins/<p>/standards/<name>/{meta,scan,write}.md` + `rules/` |
| Standards index | `plugins/<p>/standards/INDEX.md` |
| Injected payload | `plugins/<p>/hooks/{ALLAGENT,MAINAGENT,SUBAGENT}.md` |
| Routing table | `plugins/<p>/references/ROUTING.md` |
| Workflow entry point | `plugins/<p>/directions/WORKFLOW.md` |
| Shared executables | `essential:scripts/` |

There are no source `commands/` directories. Agents ship from `agents/` as templates that `essential:install` projects into each native harness. Every plugin depends on `essential`; `web` and `react` also depend on `coding`.
