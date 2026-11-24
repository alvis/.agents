# Local retrieval

Read this before a workflow searches the current repository's own documents, code or work state for evidence. It owns how to ask the shared qmd index, how to open what it returns, how to cover what the index cannot see, and the `rg` route used when qmd is unavailable. qmd stays optional: every step below has an `rg` route, and no workflow fails or loses information without qmd.

## Prepare the index

Derive `ESSENTIAL_ROOT` as [state.md](state.md#resolve-the-workspace-first) shows, then run once per task from inside the target repository:

```bash
"$ESSENTIAL_ROOT/scripts/qmd-index" ensure
```

It always exits 0 and prints JSON. Read four fields:

- `status`: `ready` or `unavailable`. On `unavailable`, read `reason`, take the [`rg` route](#search-with-rg-when-qmd-is-unavailable), and say why.
- `mode`: `hybrid` once any of this repository's vectors exist, even while `embedding.pending` documents are still being embedded in the background, which their vector hits miss until done; `lexical` before the first vectors. In `lexical` mode use `qmd search` instead of `qmd query`.
- `collections`: the present collection names and their roots. Use only these names.
- `sha`: the default-branch commit that the docs and code collections show.

`ensure` never fetches or pulls. It updates only this repository's own collections and the cached export, and reports `unavailable` when one of its own collections carries an `update:` or `processor:` command. Never run `qmd collection`, `qmd context`, `qmd update` or `qmd embed` yourself, never edit qmd's `index.yml`, and never start `qmd mcp`: `qmd-index` owns the index, and other repositories share it.

## Choose collections

Every collection is named `<prefix>-<suffix>`, where `<prefix>` is the `prefix` field from `ensure`. Search every collection `ensure` lists unless the calling workflow names a subset, passing each with its own `-c`. Always pass at least one `-c`, because the index also holds other repositories' collections.

| Suffix | Holds | Kind of truth ([truth.md](truth.md)) |
| --- | --- | --- |
| `docs` | `README.md` and `docs/**/*.md` at the default-branch tip | Contract and decision: authoritative for current design |
| `code` | Source, tests and shell scripts (`ts`, `tsx`, `js`, `py`, `go`, `rs`, `sh`, `bash`, and extension-less files in `scripts/` folders) at the default-branch tip | Artifact: open the file for exact behaviour |
| `streams` | Live work-stream records under the state root's `works/` | Execution state: authoritative only for its own stream |
| `history` | Journals and archived streams | Decision history: what was decided, not what is current |
| `memory` | `overview.md`, `environment.md`, `traps.md`, backlogs | Memory: dated hints to re-verify before relying on them |
| `notion` | The Notion mirror, when the state root has one | Contract as last synced: check the sync receipt's date |

Skill and agent Markdown inside plugins is not in `docs`. Find it with `rg` over the checkout.

## Ask qmd

Write the query yourself as typed lines. A `lex:` line carries exact tokens such as identifiers, file names, error text or a quoted phrase; prefix a word with `-` to exclude it. A `vec:` line states the question in plain words. Use one to three of each:

```bash
qmd --index index query $'lex: "state-lease" heartbeat\nvec: how a work stream lease is renewed or taken over after it expires' \
  -c "$PREFIX-docs" -c "$PREFIX-code" -c "$PREFIX-history" --no-rerank -n 10
```

- `--index index` pins qmd to the shared global index. Without it, qmd prefers any `.qmd/index.yml` found above the working directory.
- `--no-rerank` is the default: it returns in about 0.7 s, and in measurement it kept the same top hit. Drop it when the single top hit decides the answer, at about 2 s per query.
- `-n 10` returns enough candidates to open the few that matter. Raise it for a survey.
- Never send an untyped, single-line query. It loads a query-expansion model and is slower without being better than lines you write.
- In `lexical` mode, or for a pure keyword lookup, run `qmd --index index search '<keywords>' -c "$PREFIX-<suffix>"`. It takes about 0.1 s and needs no models.

Each hit is a `qmd://<collection>/<path>:<line>` address with a score. Under `--no-rerank` the score reflects rank, not relevance, so judge a hit only by opening it. `No results found.`, or hits that prove irrelevant once opened, mean the index has nothing on that wording: rephrase once, then take the `rg` route for the same terms before you conclude that nothing exists.

## Open before citing

Never cite a hit from its snippet. Open it first:

```bash
qmd --index index get "qmd://$PREFIX-code/plugins/essential/scripts/state-lease.ts:120:40"
```

The `:<from>:<count>` suffix selects lines. The output's folder context restates the collection's kind of truth.

How to cite depends on the collection:
- **docs and code:** these show the default branch at `sha`. Cite the repository-relative path, which is the address with `qmd://<prefix>-<suffix>/` removed, plus the line.
- **streams, history, memory and notion:** these are live state-root files. Cite their absolute path under `state_root`.

## Search the workspace's own changes

The index never shows the checkout's branch or unsaved edits. Before giving a final answer, list the files the current workspace changed relative to the indexed commit, then run `rg` with the same terms over those files:

```bash
jj diff --name-only --from "$SHA" --to @ | while read -r f; do [ -e "$f" ] && echo "$f"; done   # jj workspace, deleted files dropped
git diff --name-only --diff-filter=d "$SHA"                             # Git checkout, including uncommitted edits
git ls-files --others --exclude-standard    # Git: new untracked files
```

When a changed file contradicts an indexed hit, the changed file is the truth for this workspace. Report both and say which one wins.

## Search with `rg` when qmd is unavailable

When `ensure` reports `unavailable` or `qmd` is not installed, search with `rg` over the same scopes:
- the checkout's `README.md` and `docs/` for docs;
- the checkout for code;
- `state_root` for the state collections.

Use the `lex:` terms you would have sent to qmd. The workspace-changes step is already covered, because `rg` reads the checkout directly.

## Report which search ran

State the route in the output's retrieval line, for example:
- `qmd hybrid at <sha>, collections docs+code+history; rg over 4 changed files`
- `rg only (qmd unavailable: <reason>)`

A reader uses this line to judge what a negative result is worth.
