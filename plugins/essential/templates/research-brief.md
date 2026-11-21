# Research brief

Layout for the brief every `<plugin>:research` skill returns to `essential:plan`. The plan skill seeds `essential:discover`'s evidence ledger with these rows unchanged, so the columns and `Kind` values are that ledger's (`essential:skills/discover/SKILL.md` owns them).

With a work stream, save the brief at `artifacts/research/briefs/<plugin>/<scope-slug>.md` inside the active work directory; without one, return it in the conversation. Save one file per researched scope, so a re-entry for scope found mid-build never overwrites the original research. A subagent cannot write the state root; it writes the same content to an OS temporary file and returns `artifact: <absolute path>` for the main agent to save. Keep the file within the work-Markdown limit in `essential:references/output-manifest.md`; when the evidence does not fit, keep the rows with the highest decision impact and say what was dropped under Gaps.

```markdown
# Research brief: <plugin> — <scope>

- **Question**: <what the plan needs to know, one sentence>
- **Retrieval**: <each tool used, naming semantic search tools first; or `keyword fallback — no semantic search covers this repository`>
- **Coverage**: <count read per source kind, e.g. 9 merged PRs, 2 ADRs, 3 docs, 14 files>
- **Gaps**: <sources that could not be reached, and rows dropped for size; `None`>

| ID | Kind | Statement | Source or evidence | Decision impact | Reversibility | Disposition | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| coding-1 | observed | Retries reuse the backoff in queue/retry.ts | `src/queue/retry.ts:40`, #312 | Reuse; no new retry helper | easy | resolved | — |
| coding-2 | observed | ADR-4 forbids queues outside the worker service | `docs/architecture/decisions/infra/adr-4-worker-queues.md` | Rules out an in-process queue | hard | resolved | — |
| coding-3 | unknown | Must delivery order hold per tenant? | No source found | Changes the data model | hard | open | discover |

## Precedents

- <similar past change, at most 19 words> — <follow or depart, and why> — <PR, commit, or path link>
```

Rules for the rows:

- Prefix every ID with the plugin name so briefs from several plugins merge into one ledger without collisions.
- An `observed` row cites a source the researcher opened: `path:line`, PR or issue URL, ADR path, or document link. A retrieval hit that was not opened is not evidence.
- An `inference` row names the observed IDs it rests on. A plausible claim with no support is an `unknown`, never an `inference`.
- An `unknown` row states in Decision impact what changes depending on the answer, and is `open` with Owner `discover`, or `blocking` when no plan can proceed without it.
- Disposition, for every kind, is `resolved` when observed evidence answers the row, `blocking` when no plan can proceed without an answer, and `open` otherwise.
- List under Precedents only changes similar enough that the plan should follow or knowingly depart from them; `None — no similar work found` after searching.
