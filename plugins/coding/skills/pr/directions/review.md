# Review Pull Request

Review a remote GitHub pull request and publish the result where the author will act on it: one inline comment per finding, anchored to the exact file and line, plus one overall review carrying the verdict. This skill owns remote PR review, its publication, and the `GIT-PR-SIZE-*` standard handed over by `coding:pr create` and `coding:pr update`. Local pre-commit review belongs to `coding:review-code`; remediation to `coding:fix`.

## Boundaries

- Use for: reviewing an open GitHub PR by number, URL, or the path of a source tree holding its head; re-reviewing after a push; publishing line comments and a verdict to GitHub.
- Do not use for: reviewing uncommitted local work or writing work-local review artifacts (`coding:review-code`), fixing findings (`coding:fix`), mechanical standards enforcement (`coding:lint`), publishing PRs or driving CI (`coding:pr create` or `coding:pr update`), or merging (`coding:pr merge`).
- One reviewer per pass. Never fan out per area — a PR is sized so one reader can hold it whole, and split judgement produces split findings.

## Review directions

Apply `coding:directions/review-evidence.md` to supplied independent source evidence before analysis. Read uncovered or invalidated implementation and every applicable standard; verified coverage may be reused. Always check the current publication surface, discussion, authorization, and CI. A standard violation or predicted defect is an implementation finding and requires a fix. An unmet operation, such as a stale base or pending rebase, is a process chore rather than a code-priority claim.

Read [inline-review.md](../templates/inline-review.md) and [overall-review.md](../templates/overall-review.md) before preparing the assessment. Follow their presentation and authoring instructions when recording findings, review reasoning, limitations, trust caps, authorization evidence, and the substantive verdict in the structured assessment accepted by [review-publication.ts](../scripts/review-publication.ts). The executable renders those templates and enforces the publication contract. Use the size standard to choose reading order and reviewer slots, never to suppress a finding.

<IMPORTANT>
Without valid independent source evidence, the first pass is exhaustive discovery over the complete pinned review unit: identify every independently actionable issue it can reveal. Do not stage a known concern for a later pass; later passes follow the impact mission in `coding:directions/review-evidence.md`, verifying affected fixes, dispositions, and regressions. Reuse the original independent reviewer; start fresh broad analysis only for recorded risk or unbounded impact.
</IMPORTANT>

## Execution

The context-owning router resolves one review unit before it reaches *Locate or create the review tree*, then assigns the remaining review steps to the existing independent `code-quality-critic`, or a fresh critic without inherited implementation context when none is available. A single PR is one review unit. When a source tree carries a linear stack, the unit is the whole stack: record its bottom base and top head, provision exactly one clean `REVIEW_DIR` at the top head, and include a `PR_SURFACES` array with each PR's number, URL, head/base refs and OIDs, and per-PR merge-base map. Do not create one checkout per PR. The capsule contains the stack metadata, `REVIEW_DIR`, and the requested areas/dry-run state; the reviewer checks out only the top tip, establishes complete source coverage against the bottom base through verified evidence or holistic analysis, then attributes each finding to the earliest PR surface that owns it and publishes only to that PR. The reviewer must not rediscover or silently replace pinned inputs. The parent closes the one lease after success, failure, or cancellation. Review as an external party who knows only that capsule, repository, standards, and pinned review tree.

When the caller is the independent critic assigned by [review-loop.md](review-loop.md), its preprovisioned stack capsule, clean top-tip `REVIEW_DIR`, ledger path, assessment path, and approval path prove it is already the dedicated reviewer. It executes the remaining read-only review phase directly and does not dispatch another agent.

<IMPORTANT>
- Read-only against reviewed code. Confine filesystem mutation to the separately created `REVIEW_DISCUSSION`, `REVIEW_LEDGER`, structured assessment, and approval artifact. The independent reviewer issues approval evidence; the publication owner alone relays it through the canonical publisher.
- Do not delegate.
- Read and search the checkout as widely as the change requires; run only the read-only git, `gh`, and scanner commands named below. Treat the branch as untrusted code.
- CI status counts only when already known, from the metadata *Resolve the pull request* already fetches. Repair belongs to `coding:pr update`.
- Build the structured assessment and approval artifact by shell redirection from `jq` and the contract executable, never with a file-writing tool. Give the publication agent only the immutable approval artifact, not review notes from which it could compose another summary.
</IMPORTANT>

## Inputs

- **Required**: one PR number, PR URL, or source tree path. When omitted, resolve from the current tree. On ambiguity, ask.
- **Optional**: `--repo <owner/name>` to target another repository; `--area=<list>` to restrict the review to a subset of `alignment`, `correctness`, `security`, `quality`, `testing`, `docs`, `style` (default all); `--dry-run` to print the payload and post nothing. The `process` concern is not selectable and is never filtered out — a `chore` blocks merge whichever areas were asked for, and a flag that could drop one would report a blocked PR as clean.
- **Internal context**: the delivery owner may supply a companion source-review receipt and report paths under `coding:directions/review-evidence.md`. Verify bindings and record which analysis is reused rather than claiming it ran again.
- **Prerequisites**: authenticated `gh` with write access, and network access to reach the PR.

## Workflow

### Resolve the pull request

A bare number may name a stack rather than a PR. Bind its namespace through [resolve.md](resolve.md) first; a `stack` resolution reviews every PR the reported stack holds as one review unit, ordered bottom-up exactly as the source-tree path below does.

From a PR number or URL, resolve canonical coordinates and metadata through the bundled helper:

```bash
bash "${CODING_PR_SKILL_DIR}/scripts/resolve-pr.sh" \
  <pr-number-or-url> [--repo <owner/name>]
```

Retain its `host`, `number`, `owner`, `repo`, `url`, `headRefOid`, `baseRefName`, and `baseRefOid` as `HOST`, `PR_NUMBER`, `OWNER`, `REPO`, `PR_URL`, `HEAD_OID`, `BASE_REF`, and `BASE_OID`. Never put a URL into a REST path segment or GraphQL `Int!` variable; pass `--hostname "$HOST"` to every `gh api` call.

From a source tree path — or no argument at all, meaning the current tree — resolve which PRs that tree carries. A tree may hold a whole stack, so match every open PR head against its history rather than assuming one:

Resolve the tree's repository coordinates, then retain every paginated open-PR page without printing the full inventory. GitHub's REST page maximum is 100, so that value minimizes requests without limiting coverage:

```bash
OPEN_PRS_REPORT=$(mktemp "${TMPDIR:-/tmp}/pr-open-inventory-XXXXXX.json") || exit $?
trap 'rm -f -- "$OPEN_PRS_REPORT"' EXIT
gh api --hostname "$HOST" --paginate --slurp \
  "repos/$OWNER/$REPO/pulls?state=open&per_page=100" \
  >"$OPEN_PRS_REPORT" || exit $?
OPEN_PR_CANDIDATES=$(jq -c '[.[][] | {
  number, html_url, headRefName: .head.ref, headRefOid: .head.sha,
  baseRefName: .base.ref, baseRefOid: .base.sha
}]' "$OPEN_PRS_REPORT") || exit $?
git -C "$TREE" merge-base --is-ancestor "$HEAD_REF_OID" HEAD   # per candidate PR
```

Use scoped `jq` queries over `OPEN_PR_CANDIDATES` to identify candidates and report only the matched review unit. After resolving the candidates, remove the retained inventory and disarm its cleanup trap:

```bash
rm -f -- "$OPEN_PRS_REPORT"
trap - EXIT
```

The `EXIT` trap covers earlier failure or cancellation. Follow the [command-output contract](../../../directions/output.md); an API failure stops before `jq`, and an ordinary `merge-base --is-ancestor` false result is a non-match rather than a retrieval failure.

Order the matches bottom-up by their base chain — each PR's `baseRefName` is the previous PR's `headRefName` — and keep the chain as one review unit. The bottom PR supplies `STACK_BASE_REF`/`STACK_BASE_OID`; the top PR supplies `STACK_HEAD_REF`/`STACK_HEAD_OID`. Retain every matched PR's metadata in `PR_SURFACES` so findings can be attributed to the change that introduced them, but do not review each checkout independently. No match is a clean stop naming the tree and its HEAD; an unresolvable tangle asks. Resolve every matched URL through `resolve-pr.sh` before its review so all paths use the same coordinate and metadata contract.

Stop with evidence when a PR is closed, merged, or unreadable. For a single PR, record `HEAD_OID`, `BASE_REF`, and `BASE_OID`. For a stack, record the same fields for every `PR_SURFACES` entry plus the stack bottom/top pair; all downstream evidence binds to those exact objects.

### Select the change-tracking path

Prefer `jj` where it is available and genuinely initialized. Detect functionally — a `.jj` and a `.git` directory can both be present without being colocated:

```bash
command -v jj >/dev/null 2>&1 && jj root >/dev/null 2>&1 &&
  [ "$(git rev-parse HEAD)" = "$(jj log -r @- --no-graph -T 'commit_id')" ]
```

Anything else selects git. This skill never mutates the repository, so a git-only repository is fully supported and must not be colocated on its behalf.

### Locate or create the review tree

First create a secret-free handoff outside the review tree:

```bash
REVIEW_ARTIFACT_DIR=$(mktemp -d "${TMPDIR:-/tmp}/pr-review-${PR_NUMBER}-XXXXXX")
REVIEW_DISCUSSION="$REVIEW_ARTIFACT_DIR/discussion.jsonl"
REVIEW_LEDGER="$REVIEW_ARTIFACT_DIR/ledger.json"
REVIEW_ASSESSMENT="$REVIEW_ARTIFACT_DIR/assessment.json"
REVIEW_APPROVAL="$REVIEW_ARTIFACT_DIR/approval.json"
```

The reviewer may write only those four files via `jq` or contract-command redirection. Review-tree cleanup must exclude them; after consuming all four—or after reviewer failure or cancellation—the parent removes only the recorded directory:

```bash
rm -rf -- "$REVIEW_ARTIFACT_DIR"
```

For a local target repository, load [review-extraction.md](review-extraction.md) now and fetch and verify both pinned objects before inspecting reuse candidates. A clean tree already at the pinned review tip is then reusable without a new checkout. For a single PR the tip is `HEAD_OID`; for a stack it is `STACK_HEAD_OID`:

1. Search for a candidate at the review tip — the invoked tree first, then entries from `git worktree list --porcelain` and `jj workspace list`.
2. Accept one only when `git -C <tree> rev-parse HEAD` equals the review tip **and** `git -C <tree> status --porcelain` is empty. A dirty tree is not the PR head, and reviewing it would describe uncommitted work as if the author had pushed it.
3. With no candidate, the context-owning parent creates a disposable checkout and records that this run owns it:

   ```bash
   bash "${CODING_PR_SKILL_DIR}/scripts/temp-tree.sh" \
     <open-git-or-open-jj> <target-repository-root> "$REVIEW_TIP_OID"
   ```

For a fresh clone, the helper fetches the pinned head; immediately run the reference's base fetch and final two-object verification inside that clone. The same reference carries the cleanup contract. The parent retains its returned `lease` as `TREE_LEASE`, passes its `tree` as `REVIEW_DIR`, and sets `REVIEW_TREE_OWNED=true`. A stack never receives a second lease for a lower PR.

<IMPORTANT>
The parent closes only the exact helper-issued lease when `REVIEW_TREE_OWNED` is true, including after subagent cancellation. A reused tree belongs to the user and its removal would destroy real work.
</IMPORTANT>

### Read the existing discussion

The dedicated reviewer performs this phase after the parent has located or created and verified `REVIEW_DIR`; it receives the pinned capsule and does not repeat parent metadata discovery. Read issue comments, reviews, inline comments, and review-thread state before reviewing. Page every connection; a partial discussion cannot support a `fixed`, `does_not_apply`, or de-duplication decision. Materialize every successful page in `REVIEW_DISCUSSION`, including complete bodies and replies, before projecting bounded counts or identifiers. Capture each `gh` failure before `jq`; never let a projection conceal a failed page.

```bash
ISSUE_COMMENTS=$(gh api --hostname "$HOST" --paginate --slurp \
  "repos/$OWNER/$REPO/issues/$PR_NUMBER/comments?per_page=100") || exit $?
jq -c --arg host "$HOST" --arg owner "$OWNER" --arg repo "$REPO" \
  --argjson pr "$PR_NUMBER" \
  '.[][] | {host:$host, owner:$owner, repo:$repo, pr_number:$pr,
    kind:"issue_comment", value:.}' \
  <<<"$ISSUE_COMMENTS" >>"$REVIEW_DISCUSSION" || exit $?

REVIEWS=$(gh api --hostname "$HOST" --paginate --slurp \
  "repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews?per_page=100") || exit $?
jq -c --arg host "$HOST" --arg owner "$OWNER" --arg repo "$REPO" \
  --argjson pr "$PR_NUMBER" \
  '.[][] | {host:$host, owner:$owner, repo:$repo, pr_number:$pr,
    kind:"review", value:.}' \
  <<<"$REVIEWS" >>"$REVIEW_DISCUSSION" || exit $?

INLINE_COMMENTS=$(gh api --hostname "$HOST" --paginate --slurp \
  "repos/$OWNER/$REPO/pulls/$PR_NUMBER/comments?per_page=100") || exit $?
jq -c --arg host "$HOST" --arg owner "$OWNER" --arg repo "$REPO" \
  --argjson pr "$PR_NUMBER" \
  '.[][] | {host:$host, owner:$owner, repo:$repo, pr_number:$pr,
    kind:"inline_comment", value:.}' \
  <<<"$INLINE_COMMENTS" >>"$REVIEW_DISCUSSION" || exit $?

THREAD_PAGE=$(gh api graphql --hostname "$HOST" \
  -F owner="$OWNER" -F name="$REPO" -F number="$PR_NUMBER" -f query='
query($owner:String!,$name:String!,$number:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviewThreads(first:100,after:$cursor){
        pageInfo{hasNextPage endCursor}
        nodes{id isResolved comments(first:100){
          pageInfo{hasNextPage endCursor}
          nodes{databaseId body url path line commit{oid} author{login}}
        }}
      }
    }
  }
}') || exit $?
jq -ce --arg host "$HOST" --arg owner "$OWNER" --arg repo "$REPO" \
  --argjson pr "$PR_NUMBER" \
  '{host:$host, owner:$owner, repo:$repo, pr_number:$pr,
    kind:"review_thread_page", value:.}' \
  <<<"$THREAD_PAGE" >>"$REVIEW_DISCUSSION" || exit $?
```

Repeat the GraphQL request with the returned cursor until `reviewThreads.pageInfo.hasNextPage` is false, appending every page with the same `host`, `owner`, `repo`, and `pr_number` envelope. When a thread's nested `comments.pageInfo.hasNextPage` is true, query that thread node by `id` with its own comments cursor until exhausted and append those pages with that envelope too. Use identity-scoped queries over `REVIEW_DISCUSSION` to read every record and full body while emitting only counts, stable IDs, and the exact record currently under review. This is bounded presentation, not sampling: the persisted artifact is the authority for the complete discussion.

Re-evaluate every existing P0/P1/P2 or mandatory-chore thread, including resolved threads whose evidence commit differs from `HEAD_OID`. For each previously reported issue, derive its verdict in every prior review where it was evaluated. Compare the latest verdict with the immediately preceding review's verdict; retain only issues whose verdict changed. The comparison is review-to-review, not commit-to-commit, so several pushes between reviews do not create extra entries.

For every unresolved inline thread, inspect the pinned head for changes related to the concern. When the change addresses the concern, check the thread's complete reply history. If no reply records the published work, classify the exact confirmation body as a `discussion-reply` bound to that comment and issue its approval artifact under [review-publishing.md](review-publishing.md). Issue a separate thread-bound `discussion-reply` approval for resolution. The publication owner relays those artifacts through the canonical publisher; neither party may edit the approved body.

Never resolve a thread whose concern still applies. Thread resolution records an independent review verdict; it is not available to the agent that implemented or published the change.

### Build the reviewable surface

Compare against the merge base, so the review covers the selected surface rather than base-branch drift. For a stack, first build one holistic map from `STACK_BASE_OID` to `STACK_HEAD_OID`; then derive each PR's changed-line map from its recorded base/head pair while staying in that same top-tip tree. Use the holistic read for cross-layer correctness, and use the per-PR maps only to place comments on the PR that owns the finding:

| Path | Merge base | Changed files | Line map |
|---|---|---|---|
| jj | `jj log --no-graph -T 'commit_id' -r "heads(::$REVIEW_TIP_OID & ::$STACK_BASE_REF)"` | `jj diff --summary --from "$MERGE_BASE" --to "$REVIEW_TIP_OID"` | `jj diff --git --context=0 --from "$MERGE_BASE" --to "$REVIEW_TIP_OID"` |
| git | `git merge-base "$STACK_BASE_OID" "$REVIEW_TIP_OID"` | `git diff --name-status "$MERGE_BASE" "$REVIEW_TIP_OID"` | `git diff --unified=0 "$MERGE_BASE" "$REVIEW_TIP_OID"` |

Both paths emit unified diff, so one parser builds the holistic map and the per-PR attribution maps. A finding that belongs to no individual surface stays in that PR's overall review body rather than being copied to every PR.

<IMPORTANT>
The changed-line map is the anchoring contract. GitHub accepts an inline comment only on a line present in the diff, so record per file every added line (RIGHT side) and every removed line (LEFT). A finding that cannot anchor moves into the overall body — never dropped, never posted against a guessed line.
</IMPORTANT>

Classify each size zone with the canonical read-only helper, then derive `ZONE` from `SIZE_JSON`:

```bash
SIZE_JSON=$(bun run "${CODING_PR_SKILL_DIR}/scripts/classify-pr-size.ts" \
  --repo "$REVIEW_DIR" --base "$BASE_OID" --head "$HEAD_OID")
```

Use the classifier's all-path `files_changed` and generated-excluding authored `net_loc`. Generated, vendored, and binary paths remain in the file count. Do not infer the size zone from GitHub's collapsed diff presentation.

For a stack, classify each PR surface from its own head/base diff. The holistic bottom-base-to-top-head diff supplies review context, not one replacement size zone for every PR in the stack.

Use the classifier's returned zone. The table below explains that result for review; do not inspect or reproduce the classifier's internal threshold data.

Every zone requires Summary, `## 🎯 Goal`, `## ✅ Requirements`, `## 🧵 Context`, `## 🧪 Verification`, and `## 📋 Additional Notes`. Verify revision-bound green standards evidence in Verification and the separate-review instruction in Additional Notes. The zone adds:

| Zone | Additional PR-body evidence |
|---|---|
| green | None |
| yellow | `## ⚠️ Risk`, `## 🧭 Test Plan`, and the policy-required reviewer evidence |
| red | Yellow evidence plus `## 📐 Why This Size` and the policy-required reviewer evidence |
| black | Red evidence plus full review of the self-contained unit; exact-revision code-owner authorization is required only for `APPROVE` |

A black-zone review first judges whether the surface is genuinely one self-contained unit, then reviews it completely. Missing authorization does not suppress findings or stop a `REQUEST_CHANGES` verdict. It caps only a substantive `APPROVE` at `COMMENT`. Before approval, verify that the canonical body supplies specific Risk, Test plan, and Why this size evidence. Then judge only the live authorization helper receipt's `authorization_body` and `rationale`: its atomic subject, coupling, and split consequence must be specific. A generic or tautological indivisibility rationale blocks approval despite structural helper acceptance. An earlier fetched comment or body cannot authorize approval. Deleted, binary, generated, and vendored paths carry no reviewable lines; list them as not reviewed.

### Run the mechanical candidate scan

Reuse exact-input candidate evidence for retained source coverage. A discussion-only check does not rescan unchanged source. For missing or affected source coverage, group changed files by owning project before scanning. Resolve each project's configured compiler-test mechanism and discovery patterns, then invoke the scanner once per group with that absolute project root and every applicable compiler-test glob. Never combine files owned by different test roots in one invocation:

```bash
bun run "${CODING_PR_SKILL_DIR}/../../scripts/scanlib/core.ts" \
  <changed-files-owned-by-project> --category all --before 5 --after 10 \
  --test-root <project-root> [--test-pattern <compiler-test-glob> ...]
```

That path resolves the scanner from the installed PR skill directory up to the coding plugin root; pass every group's classification arguments to it. Surface a non-zero scanner failure rather than skipping silently. Candidates are advisory until confirmed against the rule they cite.

### Resolve the applicable standards

Take standard paths from the "Plugin Constitution > Standards" sections of the system prompt, or Glob `**/standards/**`. Always include `code-review/`, `universal/`, `file-structure/`, `testing/`, and `documentation/`; include `function/` for functions, methods, or APIs, and every language-specific standard matching changed files. Apply testing standards to changed behavior even when the PR adds no test file.

### Review

Apply the assigned impact mission to follow-ups and retain verified baseline coverage. The relevant diff is the subject of source analysis, not the limit of dependency reading. A discussion-only mission verifies dispositions and their evidence without repeating source discovery.

Apply `coding:standards/code-review/`'s evidence threshold before recording a blocker, requiring a test, or withholding approval. The checklist below distinguishes blocker proof from context for non-blocking feedback; every review preserves settled dispositions under the standard's settled-finding rule (`CRV-FDBK-02`).

- **Read whatever it takes.** Follow callers of a changed function, open the siblings a new file should resemble, read the module the change plugs into, the goal, and the spec. Understanding the change is the job; explore the checkout.
- **Judge only the diff.** Every finding is about something this PR changed. Read unchanged code to understand the change, not to grade it. Being about the diff and hanging off a line in it are different things: a deleted file and a chore the PR owes are squarely about the diff and anchor to nothing.
- **Ask whether the diff is the best solution**, not only whether it works: apply `essential:references/working-attitude.md` — need, reuse, standard library, native capability, installed dependency, then minimum addition. Search code, content, tests, helpers, and fixtures; reinventing an available equivalent is a finding.
- **Prove the stated intent.** Trace each stated Goal and behavioral Requirement through implementation, callers, edge/failure paths, and tests. Behavior that diverges from the contract is a finding.
- **Read the linked specification.** Grade alignment against the specification the PR links, and confirm every deviation from it is captured under Additional Notes; an uncaptured deviation is a merge-blocking chore. A linked specification that cannot be read is not `skipped_unknown` — it caps the event in step 2 below.
- **Apply the complete standards set.** Check file structure, testing, documentation, universal code, function/API, and every applicable language-specific standard resolved above.
- **Remove anything that earns no place.** Flag code, content, tests, helpers, or repetition whose deletion preserves required behavior and readability.
- **Say so when the change belongs somewhere else.** A guard repeated at each call site that belongs in the callee, validation in a controller that belongs in the domain, a symptom patched downstream of the function that produced the bad value — propose the better location and name the exact path. Never relocate it yourself.

For source coverage that is missing or invalidated, cover the concerns in consequence order — correctness and security, then alignment, testing, quality, docs, style — in one pass. Record the goal/spec, intended behavior, standards, reuse, and minimality verdicts, identifying carried-forward evidence and newly verified scope even when they produce no finding. [review-checklist.md](review-checklist.md) carries the per-concern checklist and depth ladder; [review-tone.md](review-tone.md) governs every finding's wording; the templates own presentation and [review-publication.ts](../scripts/review-publication.ts) owns the machine schema and template rendering.

`testing` answers one question above coverage: **would these tests fail if supported behavior regressed?** Confirm assertion, mock, or coverage defects against applicable testing requirements and the shared evidence threshold. Cite the supported behavior and missing protection when requesting a test; never require coverage for an unsupported hypothetical input.

### Anchor and de-duplicate

Keep a finding when its file and line appear in the changed-line map, setting `side` to `RIGHT` for added lines or `LEFT` for removed ones. A finding that anchors to no line moves to the overall body under the null-anchor rule in [review-checklist.md](review-checklist.md), which owns what `subject` carries in place of the anchor. Never invent a plausible line to keep a finding inline — an unanchorable merge blocker is the one this step most has to survive. Then skip whatever has already been said at the same path and line. Query the complete retained discussion into internal variables for the exact candidate anchor, then read one exact stable ID at a time; do not print the collection:

```bash
MATCHING_COMMENT_IDS=$(jq -sc --arg host "$HOST" --arg owner "$OWNER" \
  --arg repo "$REPO" --argjson pr "$PR_NUMBER" \
  --arg path "$FINDING_PATH" --argjson line "$FINDING_LINE" '
  [.[] | select(.host == $host and .owner == $owner and .repo == $repo and
    .pr_number == $pr and .kind == "inline_comment" and
    .value.path == $path and .value.line == $line) | .value.id]
' "$REVIEW_DISCUSSION") || exit $?
COMMENT_BODY=$(jq -rs --arg host "$HOST" --arg owner "$OWNER" \
  --arg repo "$REPO" --argjson pr "$PR_NUMBER" \
  --arg path "$FINDING_PATH" --argjson line "$FINDING_LINE" \
  --argjson id "$COMMENT_ID" '
  first(.[] | select(.host == $host and .owner == $owner and
    .repo == $repo and .pr_number == $pr and .kind == "inline_comment" and
    .value.path == $path and .value.line == $line and .value.id == $id)) |
  .value.body
' "$REVIEW_DISCUSSION") || exit $?
```

Iterate every ID in `MATCHING_COMMENT_IDS` internally and compare its complete `COMMENT_BODY` before deciding the finding is a duplicate. Emit only the decision for the current finding; the retained file remains the complete authority.

A re-review after a push adds only newly evidenced findings. Revalidate affected evidence and required checks at the current revision; a new SHA or reviewer alone does not reopen settled findings. Stop under `CRV-PRIO-02` once required checks pass and evidenced defects are resolved.

### Publish the review

Follow [review-publishing.md](review-publishing.md). The independent reviewer supplies every required semantic field and runs the contract's `approve` action; that action rejects missing static standards evidence, test-sensitivity reasoning, scoped execution evidence, limitations, inconsistent trust caps, findings, or a verdict inconsistent with those findings. A runtime-test waiver fills only `tests.execution`; it cannot remove any other assessment field.

The contract deterministically renders one native review from the templates with its pinned `commit_id` and bound inline findings. Inspect that rendered output against the templates before handing off approval. It preserves the substantive verdict in the body and receipt while deriving a GitHub `COMMENT` event for trust-capped or self-authored reviews. Black-zone approval authorization is live-checked again immediately before the write. The publication agent receives only the approval artifact and runs the exact canonical publisher command; it may not compose, summarize, relabel, or repair the approved content.

The publisher revalidates every receipt relationship and exact payload byte, re-reads the PR head, base ref, base OID, author, publisher identity, discussion target when applicable, and live black-zone authorization, then sends those same bytes in one GitHub call. Missing, malformed, altered, stale, or unreadable evidence stops before the write. A 422 is not repaired by editing the artifact: the independent reviewer must update the structured assessment and issue a new receipt. `--dry-run` performs the live reads and prints the exact payload without the final write.

## Verification

- The review recorded whether the implementation delivers the stated Goal and behavioral Requirements, whether every applicable standard was followed, whether existing helpers/content/tests were missed, and whether any code/content/tests can be removed unchanged.
- Confirm the head, base-ref, and base-OID comparisons ran for every surface before the payload was built; any moved value blocked publication and is stated plainly in the ledger — the published review describes only the pinned stack it read.
- A created review tree is gone and leaves no entry in `jj workspace list` or `git worktree list`; a reused tree is untouched, still clean, still at `HEAD_OID`.
- Every posted comment resolves to a line in the changed-line map and duplicates nothing already on the PR.
- Every existing P0/P1/P2 or mandatory-chore thread required above was re-evaluated against `HEAD_OID` and reported as `still_applies`, `fixed`, or `does_not_apply`; every fixed or inapplicable unresolved thread was resolved, with exactly one work-confirmation reply when its history previously had none.
- Every overall-review finding, including a null-anchor finding, has a stable key, priority, kind, review ID/URL, summary, evidence OID, and disposition; P0/P1/P2 and mandatory chores are explicitly re-evaluated on later heads.
- `BASE_REF` and `BASE_OID` still match the reviewed base before publication.
- The submitted `event` matches the verdict table, or the self-review downgrade is stated in the body.

## Completion

Write the detailed secret-free finding/thread ledger to a durable temporary file. Return its absolute path and a structured report below 1000 tokens with, per PR: review URL, reviewed head/base refs and OIDs, review tree and ownership, tracking path, zone, goal/spec and intended-behavior alignment, specification-deviation capture (`captured`, `missing`, or `skipped`), standards alignment, reuse, minimality, finding counts by priority and kind, substantive verdict, submitted event, trust cap or `none`, unanchored count, paths not reviewed, and blocker. An outstanding `chore` is a merge blocker and must never be summarized as zero findings. Preserve stack order. The ledger includes every existing P0/P1/P2 or mandatory-chore thread's disposition and every overall-review finding (anchored or unanchored), keyed to the evidence OID, so a publication caller acts only after independent confirmation. A later head must re-evaluate any high-priority finding whose evidence OID changed. A partial review is never reported as complete.
