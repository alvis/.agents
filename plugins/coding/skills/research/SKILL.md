---
name: research
description: "Research a coding task before planning: retrieve related merged pull requests, architecture decision records, design and architecture documents, and the code and tests it touches, preferring the local qmd index and any semantic search (RAG) tool the session provides, and return an evidence brief. Use when planning code changes, or when essential:plan requests coding research."
requirements:
  model: capable
  effort: deliberate
---

# Research

Find what the repository already decided, built, and rejected that a coding plan must rest on, and return it as evidence rows `essential:plan` can feed straight into discovery. `essential:deep-research` owns outside fact-finding, `essential:discover` owns asking the user, and `essential:plan` owns turning the brief into a plan.

## Boundaries

- Use for: preliminary research for a feature, refactor, migration, or other code change; research for scope found during implementation that `essential:plan` re-enters.
- Do not use for: diagnosing a failure (`coding:fix`), reviewing a change (`coding:review-code`), library or framework documentation (the session's documentation tools or `essential:deep-research`), or writing the plan.
- Never edit source, documentation, or history. The brief is this skill's only write, and only the main agent saves it into the state root.

## Inputs

- **Required**: the task — what should change and why — and the repository.
- **Optional**: a scope slug (default: derived from the task); seed paths, symbols, PRs, issues, or ADRs the caller already knows.
- **Prerequisites**: Git or jj for history. Authenticated `gh` for pull requests and issues; without it, record pull requests as a gap and continue with commit history.

## Workflow

1. **Frame the queries.** List each distinct concept, symbol, and component the task names, plus the words this codebase uses for them (read the nearest README or module names to learn them). Each becomes one query. List the paths the task likely touches.
2. **Pick retrieval.** Start with the repository's local qmd index under `essential:references/local-retrieval.md`: run its `ensure`, then send each query as typed `lex:` and `vec:` lines to every collection it lists. Then inspect the session's tools for another semantic search tool — a codebase search, vector or embedding search, or knowledge-base MCP server that returns ranked passages — and probe each candidate with a symbol that exists in this repository; a tool that misses it does not index this repository and is skipped. Run every query through each source that passes, then fill gaps with keyword search: `rg` for code and documents, history commands for commits, and `gh` for pull requests and issues. The qmd index shows only the default branch, so also run `rg` over the files the current workspace changed, as the reference shows. When qmd is unavailable and no other tool passes, use keyword search alone. Name every route in the brief's Retrieval line in the reference's report form. Semantic results include stale and nearest-neighbor noise, so a hit becomes evidence only after steps 3–6 open its source, using `qmd get` for a qmd hit.
3. **Read the code.** Open the entry points, the sibling modules of the same kind, and their tests. Record how the touched area works today and the patterns a change should follow, each with `path:line`.
4. **Read the decisions.** Find the repository's architecture decision records from its documentation index (commonly `docs/architecture/decisions/`). Read every effective record that constrains the touched area, and archived records only when a relevant current record supersedes them, under `essential:directions/adr-review.md`. Read work-local decisions and completed-work journals for the same domain in the state root as `essential:references/state-systems.md` allows. Record each constraint and the option it rules out.
5. **Read the history.** Find merged pull requests that touched the paths or named the concepts:

   Resolve `<owner>/<repo>` from the remote URL: `git remote get-url origin`, or `jj git remote list` in a jj-only workspace.

   ```bash
   git log --date=short --format='%h %ad %s' -- <paths>        # jj-only workspace: jj log -r 'files("<path>")'
   gh api -X GET search/issues -f q='repo:<owner>/<repo> is:pr is:merged <terms>' -f sort=updated -f order=desc --jq '.items[] | {number,title,html_url,closed_at}'
   gh api repos/<owner>/<repo>/commits/<sha>/pulls --jq '.[] | {number,title,html_url}'   # the PR that merged a commit
   gh api repos/<owner>/<repo>/issues/<n> --jq '{title,body,merged_at: .pull_request.merged_at,html_url}'   # the PR, read through the issues API
   ```

   The REST forms work where GitHub's GraphQL API is blocked. Read the body of each relevant pull request for what it did, what it rejected and why, and its recorded deviations. Search closed issues the same way (`is:issue is:closed`); an issue closed as not planned often records a rejected approach. Most recent first; stop when further results stop adding new relevant changes.
6. **Read the documents.** Read the root `README.md`, `AGENTS.md` or `CLAUDE.md`, architecture and design documents for the touched area, and any specification the work's `goal.md` links. Record each convention or contract the change must keep.
7. **Write the brief** in the layout and rules of `essential:templates/research-brief.md`, with plugin `coding`. Record a material question no source answers as an `unknown` with its decision impact; never fill it with a guess. List similar past changes under Precedents.
8. **Return it.** With a resolved work and the main-agent lease, save the brief at the path the template names. As a subagent, write it to an OS temporary file and return `artifact: <absolute path>`. With no work stream, return the brief in the conversation.

When the touched area spans more files or pull requests than fit comfortably in context, dispatch one subagent per source kind — code, decisions, history — under `essential:directions/delegate.md`; each returns its rows, and this skill merges them into one brief.

## Verification

- Every `observed` row cites a source that was opened, not only retrieved.
- The Retrieval line names qmd's mode and indexed commit or why it was unavailable, each other semantic tool used, the `rg` pass over workspace changes, and any keyword-only fallback with its reason.
- Every effective decision record that constrains the touched area is cited; no archived record appears without its superseding record.
- Outside the saved brief, the repository's working copy is unchanged (`git status --short` or `jj status` shows nothing new from this run).
- The brief follows the template and fits its size limit.

## Completion

Report the brief path, the retrieval mode, coverage counts, the open and blocking unknowns, and `generated_files`.
