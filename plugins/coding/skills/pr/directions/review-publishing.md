# Publishing review communication

Load this from the publication step of `coding:pr review` and for any PR review supplement, review status, or discussion reply. Read and follow [inline-review.md](../templates/inline-review.md) and [overall-review.md](../templates/overall-review.md) before preparing a review assessment. Those templates own presentation; [review-publication.ts](../scripts/review-publication.ts) consumes them and owns assessment fields, semantic-evidence bindings, receipts, live validation, and transport. Never bypass approval by hand-rendering a publication payload.

## Roles and artifacts

The independent reviewer writes a structured assessment and runs `approve`; the publication owner receives only the resulting approval artifact and runs `publish`. The publisher never receives loose notes as authority to summarize the review. Each records a distinct logical `agent_id` and its capability; both may use the same authenticated GitHub login. Both files are secret-free temporary artifacts and remain outside the reviewed tree.

Use exactly one discriminated message class:

- `review` carries the complete semantic assessment and its bound inline findings. It is the only class with a substantive verdict and publishes through GitHub's native review endpoint.
- `review-supplement` selects finding IDs from one attached, validated `review` receipt. It can publish derived evidence or unanchored findings as a PR issue comment but cannot introduce, restate, or replace a verdict.
- `status` selects one contract-defined status value. It has no free-form body.
- `discussion-reply` binds an independently classified exact body to a target issue or inline comment, or binds a thread-resolution operation to its thread ID. A reply body that contains an overall assessment or verdict is invalid regardless of its label.

The review assessment must substantively cover intent and behavior, goal and requirement alignment, every applicable static standard with evidence, test-sensitivity reasoning, executed test evidence or a scoped runtime-test waiver, reuse, minimality, limitations or an explicit complete-review state, findings, trust caps, and a substantive verdict. The independent reviewer—not heading detection or the publication agent—owns the quality of that reasoning. A runtime-test waiver replaces only execution evidence; all static, sensitivity, limitation, finding, and verdict fields remain mandatory.

## Approve

Set `REVIEW_PUBLICATION` to the absolute path of `scripts/review-publication.ts` only while preparing artifacts. Materialize the complete assessment shape declared by that executable, filling every field from the pinned review evidence. The templates map their presentation to these assessment inputs:

| Input under `assessment` | Evidence to supply |
| --- | --- |
| `statistics` | Nonnegative integer `files_changed`, `additions`, and `deletions` from the reviewed PR surface, not the whole stack. The zone remains in `review_context.zone`. |
| `summary` | The opening review judgment: state whether the change meets its goal and name any material finding. Do not use this field to narrate the changed workflow. |
| `previous_reports` | An array of changed dispositions selected by the review-to-review comparison in [review.md](review.md): each entry carries the original report's `label` and `url`, latest `verdict` (`still_applies`, `fixed`, or `does_not_apply`), and the `evidence` that changed it. Use `[]` when nothing qualifies. |
| `alerts` | `must_change`, `worth_considering`, and `unanchored` carry the corresponding template alert text, or `null` when omitted. Supply `must_change` only for uncapped `REQUEST_CHANGES` with anchored blockers, `worth_considering` only for substantive `PASS` with anchored optional findings, and `unanchored` whenever unanchored findings exist. |
| `verdict_sentence` | The template's closing sentence: what clears the blockers, what could not be trusted, or what to watch after a passing review. The renderer selects the glyph and alert. |

Set `review_context.human_signoff_required` from the PR's human review requirement without reading or checking human approvals. Set each `review_context.ci.expected_checks` entry to `{ "name": "...", "workflow": ".github/workflows/ci.yml" }` for a discovered workflow file, `link_prefix` for a provider whose check link is not a GitHub Actions run, or `app_id` for a required check discovered from branch protection or a ruleset before its first observation. A workflow check's Actions run link is resolved to its workflow file path and pinned head; its display name alone is insufficient. A configured `app_id: -1` explicitly permits any provider for that required context; a positive ID is matched against check runs for the pinned head. Use `*` only as a trailing stable matrix-job name prefix. Bind the discovered source so an unrelated passing check with the same name cannot satisfy it. Set `expected_sources_confirmed` to `true` only after workflow, branch protection, and ruleset discovery under [review.md](review.md#discover-ci-sources). Run `policy-hash` in that discovery step and copy its `required_policy_sha256` into `review_context.ci`; publication and later updates stop if the classic protection or effective branch rules change. An unapproved neutral result remains pending. A known failure takes precedence over pending CI only when the review finding is uncapped; a trust cap leaves that finding untrusted, while red CI still renders failure. The reviewer approves the pending, green, and red renderings together. Inspect all three `ci_variants` bodies; the receipt binds their exact bytes and preserves one review event and one inline-comment set.

Keep findings as raw title, body, and evidence; never pre-render badges or inline markup into them. The executable reads its adjacent installed templates, selects their applicable sections, and substitutes literal tokens. Missing or malformed templates block approval and publication. Then issue the receipt:

```bash
bun run "$REVIEW_PUBLICATION" approve \
  --assessment "$REVIEW_ASSESSMENT" >"$REVIEW_APPROVAL"
```

A supplement additionally passes `--parent-approval "$PARENT_REVIEW_APPROVAL"`. Approval performs structural validation and deterministic template rendering, then binds the contract version, template content digests, repository and PR, reviewer and publisher identities, head and base revisions, semantic-evidence digest, normalized assessment digest, exact rendered UTF-8 payload bytes and digest, inline anchors, substantive verdict, submitted event, trust caps, and any parent review receipt. It does not infer semantic adequacy from nonempty strings; running `approve` is the independent reviewer's explicit semantic approval of the assessment and rendered result. Inspect the decoded `payload_utf8_base64` against the templates before handing off the artifact.

Run `validate --approval "$REVIEW_APPROVAL"` to inspect an artifact without GitHub access. Validation regenerates the receipt and fails on missing, malformed, altered, or internally inconsistent content. Any assessment, template, body, anchor, event, identity, revision, parent, or receipt change requires the independent reviewer to issue a new artifact. Pre-template contract approvals are stale; prepare and approve a current assessment instead of relabeling an old receipt.

## Publish

The publication owner invokes the resolved script path literally; shell variables, aliases, compound commands, and extra flags are not the supported hook form:

```bash
bun run /absolute/path/to/plugins/coding/skills/pr/scripts/review-publication.ts publish --approval /absolute/path/to/review-approval.json
```

The publisher first regenerates the approved payload in memory, re-reads the PR head OID, base ref and OID, PR author, and authenticated publisher, validates the target comment or review thread for replies and thread operations, and reads live hosted CI. It sends the approved pending, green, or red bytes through one `gh api --input -` call. A failed review or CI gets `❌`; otherwise pending CI gets `⏳` and an explicit wait sentence, green CI with required human sign-off gets `⚠️` and `[!WARNING]`, and green CI without that requirement gets `✅`. The native review payload pins `commit_id`; inline findings are submitted with the overall review in that call. A passing review always submits `COMMENT`. A blocking `REQUEST_CHANGES` submits that event unless a trust cap or self-review requires `COMMENT`; the body and receipt retain the independent finding without event-downgrade prose. Capture the returned `review_id` and `ci_state` with the receipt and pinned revision for the active CI schedule.

When the active CI schedule reports terminal CI for a review posted while CI was pending, the publication owner invokes the guarded update route with that ID and the original receipt:

```bash
bun run /absolute/path/to/plugins/coding/skills/pr/scripts/review-publication.ts update --approval /absolute/path/to/review-approval.json --review-id 123
```

The update route rereads the PR, publisher, review ID, review author, review commit, and current body, polls CI again, then rereads the review body immediately before writing only the preapproved terminal `body` to GitHub's review update endpoint. It leaves the submitted event and inline comments intact. A pending result returns `ci_state: pending` without a write; a terminal write returns its revalidated `ci_state`, review ID, and GitHub response. The parent acts on that returned state under [the stack poll contract](create-update.md#poll-contract): confirmed red cancels the active schedule before create/update repair, all-green completes monitoring, and a still-pending sibling keeps monitoring after another PR turns green. A changed head/base, author, review body, or inaccessible CI stops the update and requires a new exact-revision review or a concrete access fix. The publication owner reuses the active CI schedule from [create-update.md](create-update.md) when one exists. For a standalone `coding:pr review` with no active schedule, the publication owner starts one with the same read-only poll contract, saved receipt, review ID, and pinned revision. Keep exactly one active schedule per reviewed stack; the [review artifact lifecycle](review.md#locate-or-create-the-review-tree) retains the approval receipt through any scheduled update. The independent reviewer does not schedule or update its own review.

`publish --dry-run` is available to the reviewer outside the guarded publication form: it performs live metadata reads and returns the exact outgoing payload without the final write. A publication failure or GitHub 422 never authorizes editing or retrying a receipt. Re-anchor or reclassify the finding in the structured assessment, have the independent reviewer approve the new exact payload, and publish that new artifact.

## Guarded routes and limits

The global PreToolUse gate denies supported raw review/comment writes through direct `gh pr review`, `gh pr comment`, `gh issue comment`, the coding `gh-issue-comment.ts` drop-in, protected `gh api` REST endpoints supplied as relative paths or full URLs, and protected GraphQL mutations, including body-file or stdin forms and global `-R`/`--repo`/`--hostname` options. It recognizes direct commands plus `rtk`, `rtk proxy`, `env`, `command`, and a single literal `bash`, `sh`, or `zsh -c` wrapper in the native Claude, Codex, Grok, and authenticated OpenCode V1 projections. Read-only `gh` operations remain available.

This is a finite shell boundary, not universal network interception. Arbitrary aliases or generated scripts, nested language runtimes, `curl`, SDK or MCP clients, unsupported wrappers, and OpenCode V2 are outside executable enforcement. The receipt provides exact-content and revision consistency, not cryptographic proof against a malicious process with the same filesystem and command authority. The publisher's final metadata read and GitHub's write are not atomic, so a remote revision change after that read remains a race; `commit_id` prevents silent inline relocation, but GitHub supplies no compare-and-publish primitive.

Agent instructions require the independent reviewer to own semantic approval and the publisher to relay only its receipt. Executable checks enforce receipt structure, exact bytes, supported shell routes, live bindings, event derivation, and transport; they cannot independently judge prose quality or authenticate a logical agent beyond the exposed GitHub identity and recorded capability.

## Re-review hygiene

The PR re-review ledger uses `still_applies`, `fixed`, and `does_not_apply`; local review-code finding statuses remain owned by that skill's report template. Reopen a settled finding only when new evidence invalidates its prior disposition. Do not repost an existing finding. For a changed disposition, record it in the next independently approved assessment or exact-body discussion reply, and let the contract render and publish it.
