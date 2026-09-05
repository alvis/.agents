# Sync mode execution

## Remote preflight and lease

Accept exact counterpart/output root/database id, immutable base receipt,
expected remote revision/hash, and caller-confirmed final hash when supplied.
Every remote operation requires `NOTION_TOKEN`, the injected Essential contract,
and an explicit destination/team-owned `--transport-profile=<absolute-file>`;
this plugin does not install or claim a bundled `notion-sync` distribution.
Every mutation also requires one exact destination-local shared transport root,
supplied explicitly or resolved from a validated destination-local receipt. A
staging/evidence directory, origin-machine path, or unverified suggestion cannot
select the transport root or lease scope.

Read the injected absolute `state.md` before project artifact writes; if it is
unavailable, stop writes and report the missing contract. Resolve paths only
from explicit arguments, active state, or immutable receipts. Require write
targets to be ignored and untracked in their owning VCS workspace; otherwise
return `requires_ignore` with its exact ignore file. Refuse unmanaged roots.

Before any content, query, or mutation command, require and validate the
explicit absolute transport profile against
[../references/transport-profile.md](../references/transport-profile.md).
Reject every missing, unsafe, incomplete, secret-bearing, ambiguous, relative,
PATH-only, symlinked, mismatched, or unproven profile as
`transport_unverified`, with no content command or write. Run
`scripts/validate-transport-profile.ts` from the skill root and require its
`profile_structure_verified` report. Use only its canonical executable; inert
version/help probes must match the configured version, help fingerprint, exact
command/flag vectors, output contracts, executable hash, and checksum-bound
conformance receipt. Conformance must positively prove recursive pull, search,
create, push, conditional update, and conditional create independently, or
declare either conditional capability unavailable. Never search `PATH`,
substitute/install/upgrade a binary, or treat help text as runtime proof.
Read `NOTION_TOKEN` only from the invocation environment and never record it.

Resolve one explicit `--body-author=<plugin:skill>` matching
`^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$` before classification. Record
`selection_source: explicit_argument|delegated_caller` and pass the identical
value through the operation chain; never infer it from transport, extension,
marketplace, or repository. Require it for creation, outbound authored changes,
and applied two-way resolution; byte-preserving reads/pulls may omit it. Every
semantic body creation or change must match the caller/receipt selector and use
only the approved staged body and exact path. Missing or changed selection
returns `status: refused`, `next_action: select_body_author`; reserve
`transport_unverified` for transport trust failures.

Immediately before every executable invocation, reinspect the canonical path as
a non-symlink regular file and recompute its SHA-256 against the same profile
bytes. Pre-mutation drift returns `transport_unverified`; drift after a possible
mutation stops all commands and returns `partial` with the last verified
fingerprint and recovery evidence.

Resolve each pair as `{local_path, notion_ref, base_evidence, state}`: prefer
frontmatter `ref:`, then explicit ref, then validated search. Load
[database-resolution.md](database-resolution.md) only for database/search
ambiguity. Reject ambiguous identity, paths outside the declared root, and any
root inferred from titles, ids, workspace labels, evidence paths, conventions,
or another machine's receipt.

Before creating or using the transport root and `.sync-locks/`, establish the
deepest existing ancestor's exact VCS checkout; reject symlinks, unsafe parents,
ambiguous ownership, escape, missing ignore coverage, or tracked probe/lock
paths. Create missing components only by atomic no-clobber operations after all
gates pass, then recheck each component's real-directory type, containment,
ignore, and untracked state. Report components this run created on failure and
never remove a concurrently owned component.

Normalize existing pages to transport's canonical lowercase UUID and new pages
to `create:<canonical-parent-ref>:<declared-root-relative-local-path>`. Acquire
exactly `<transport-root>/.sync-locks/<sha256(normalized-ref)>.lease/` by atomic
no-clobber creation, then durably record ref, owner, process/session identity,
unguessable token, `created_at`, and `heartbeat_at`. Heartbeat and release only
after a fresh token match; release only after final evidence is durable. Leave
failed metadata publication contended. Any existing lease returns
`concurrent_sync`. Stale recovery requires proof the owner ended, a fresh
read-only pull, an explicit recovery decision, and a final old-token match
before archive/replace. Never delete or reuse a lease speculatively. This lease
coordinates only clients sharing the root; it never replaces conditional
remote mutation protection.

## Mode branches

Choose exactly one branch per declared pair. Use only the selected transport
profile's conformance-validated capability vectors and output contracts; never
invent commands or flags. Recursive operations invoke the validated
`recursive_pull` vector once, and every returned relative path is preserved.

Treat each selected pair as one decision unit. Before the first remote or
canonical-local mutation, freeze and validate every proposal and preflight the
exact conditional capability required by every selected pair. One unresolved,
skipped, failed, identity-shifted, hash-shifted, or unsupported pair refuses the
whole selected mutation set while preserving each observed classification.
After any possible mutation, stop later pairs on failed integrity and preserve
recovery evidence.

## `local-to-notion`

1. Pull the current remote page into unique staging with the validated
   recursive-pull vector/output contract and record stable identity,
   revision/hash, and recursive coverage. For `CREATE_NEW`, use the validated
   search output to prove no acceptable ref exists and validate explicit
   `parent:` instead; a failed or ambiguous search is not absence.
2. Compute and present a structured local-versus-fresh-remote diff. Freeze the
   reviewed local hash; a changed local file invalidates the review. Do not
   push merely because the direction says local-to-Notion.
3. Require the caller's exact-hash approval gate. For an existing page,
   immediately re-fetch/re-diff remote state and abort/restart if its identity,
   revision, or hash differs from Step 1. Use only the independently proven
   `conditional_update` vector.

   For `CREATE_NEW`, repeat the validated absence/parent checks. Use only an
   independently proven `conditional_create` vector with the stable creation
   key; conditional-update support is irrelevant.

   If the verified profile declares the operation's conditional capability
   `unavailable`, return `status: refused`, preserve the already observed B/L/R
   `classification`, set `next_action: provide_conditional_transport`, and
   perform no remote or canonical-local mutation. An invalid or mismatched
   profile instead remains `transport_unverified`. Approval or another read
   cannot substitute for the missing atomic precondition.
   For a selected set, complete this capability preflight for every pair before
   invoking any mutation; one unavailable requirement refuses the whole set
   without hiding the per-pair classifications.
4. Invoke the frozen `conditional_update` vector exactly once for a fully
   approved existing pair (or one separately conformance-proven atomic
   recursive conditional update for its frozen selected set). Invoke the
   frozen `conditional_create` vector exactly once for `CREATE_NEW`, using the
   staged candidate rather than the canonical authored file. Never invoke an
   unguarded core push/create vector separately. Require the conformance-bound
   output contract and read the new canonical `ref` only from validated create
   output; never predict it or assume push performs creation.
5. Independently pull to verification staging and require exact expected
   identity/body/relationships. Only then may the caller advance canonical
   transport/base receipts.

## `notion-to-local`

1. Pull once into a unique sibling staging directory with the selected
   profile's validated `recursive_pull` vector and output contract.
2. Verify the requested root by `ref:`, returned relationships, completeness,
   path containment, metadata, and content manifests. Specification transport
   must remain `.mdc`.
3. If the caller requested staging-only, return R and its manifest without
   changing the declared local root. Otherwise require the caller's base/local
   decision to permit replacement, retain rollback bytes, atomically promote
   the complete staged set, verify it, and restore rollback on failure.

## `two-way-merge`

1. Accept only a fully resolved staged proposal from
   `two-way-merge.md`, including B/L/R evidence, the approved synthesis content
   bound to its `final_proposal` revision, and stage-specific approval/review for
   that exact content, confirmed by direct comparison — not a removed digest.
2. If any conflict is skipped, unresolved, failed, or changed after approval,
   return `partial` and do not edit canonical local/mirror bytes or push. Never
   insert a TODO as a merge substitute.
3. Apply an approved `.mdc` proposal only through the exact capability bound as
   `body_author`, in a staged transport copy. Require the selector to match the
   caller and receipt, pass only the approved body and exact path, then re-verify
   it against the approved synthesis by direct content comparison.
4. Re-fetch/re-diff the remote revision immediately before push. Abort/restart
   on change and require proven conditional-update support. Merge never creates
   a page, so conditional-create evidence is not a substitute here. If
   conditional update is unavailable, return the fail-closed refusal described
   above without applying the staged proposal to canonical local state.
5. Push once, verification-pull, and require exact merged identity/body before
   canonical promotion or a new receipt.

For every branch, retry is allowed only when evidence proves the failed attempt
made no remote mutation. A possible, unknown, or partial remote write stops
`partial` with exact recovery evidence and requires a fresh reconciliation;
never retry from ambiguous remote state. Never label a multi-page operation
atomic unless the pinned transport actually proves that guarantee.

## Verification

- The destination/team transport profile's canonical executable path, exact version, executable SHA-256, help fingerprint, and required command/flag vectors/output contracts were conformance-bound before any remote operation; failures returned `transport_unverified` without a content command or write.
- Every executable invocation has an immediately preceding matching path/type/ SHA fingerprint; drift after possible mutation stopped `partial` rather than executing another version of the transport.
- Each outbound decision used fresh remote bytes and recorded the compared and immediately rechecked revisions/hashes.
- Existing-page updates used independently proven conditional-update protection. Creation used the validated create command plus independently proven conditional-create protection. An unavailable required capability refused before any remote or canonical-local mutation.
- Every successful pair has exact identity/content verification. A skipped or unresolved pair changed neither canonical local bytes nor remote content.
- Every semantic body creation/change used the one explicitly selected `body_author`; nested callers and receipts matched it exactly. Missing or changed policy refused with `select_body_author`, separately from transport verification.
- No worker made an interactive choice, no `Keep Both` synthesis bypassed approval, and no skipped conflict became a TODO or push.
- Paths came from explicit input or transport output, and write roots were ignored/untracked.
- Any missing transport/lock directories were created only after exact VCS ownership, safe-parent, containment, ignore, and untracked gates; each no-clobber component was revalidated and reported.
- Each mutating pair used the deterministic shared-transport lease, all heartbeat/release operations matched its token, and a contended lease caused no canonical or remote write.

## Completion

<report>

```yaml
status: success|partial|failure|refused|requires_ignore|concurrent_sync|transport_unverified
classification: initial|created|updated|pulled|unchanged|metadata_only|local_only|remote_only|structural_change|converged|concurrent|baseline_required|materialization_conflict|invalid_evidence|resolved|skipped|mixed|not_applicable
next_action: none|revalidate|establish_baseline|resolve_conflict|specification_reconciliation|recover_partial|verify_owner|provide_conditional_transport|select_body_author
mode: validate-metadata|local-to-notion|notion-to-local|two-way-merge
body_author: {capability_id: '<plugin>:<skill>|null', selection_source: explicit_argument|delegated_caller|null, verification: matched|not_required|refused}
ignore_file: '<absolute owning-workspace path or null>'
transport:
  profile: '<destination/team logical profile>'
  profile_schema: notion-sync-transport-profile/v1
  profile_file: '<validated destination-local absolute path>'
  profile_file_sha256: ''
  installation_source: ''
  package: ''
  executable: '<canonical absolute path>'
  expected_version: ''
  actual_version: ''
  expected_version_stdout_sha256: ''
  actual_version_stdout_sha256: ''
  expected_sha256: ''
  actual_sha256: ''
  expected_help_sha256: ''
  actual_help_sha256: ''
  conformance_evidence_sha256: ''
  capabilities: {recursive_pull: '', search: '', create: '', push: '', conditional_update: '', conditional_create: ''}
  verification: verified|transport_unverified
  invocation_fingerprints: [{phase: '', profile_file_sha256: '', executable_sha256: '', verified_at: ''}]
pairs:
  - local_path: ''
    notion_ref: ''
    classification: initial|created|updated|pulled|unchanged|metadata_only|local_only|remote_only|structural_change|converged|concurrent|baseline_required|materialization_conflict|invalid_evidence|resolved|skipped|not_applicable
    next_action: none|revalidate|establish_baseline|resolve_conflict|specification_reconciliation|recover_partial|provide_conditional_transport|select_body_author
    lease:
      path: '<transport-root>/.sync-locks/<sha256>.lease/'
      normalized_ref: ''
      owner: ''
      session: ''
      token_fingerprint: ''
      created_at: ''
      heartbeat_at: ''
      outcome: acquired|released|contended|recovered|not_required
    action: created|updated|pulled|merged|unchanged|skipped
    hashes: {base: '', local_final: '', remote_compared: '', remote_pre_push: ''}
    conflicts: {found: 0, resolved: 0, skipped: 0}
    gate: {final_hash_approved: false, required_capability: conditional_update|conditional_create|null, conditional_update: false, conditional_create: false}
    post_sync_diff: clean|unexpected|not_run
    metadata_verified: true|false
generated_files: []
created_directories: []
commands: []
unresolved: []
```

For one pair, top-level classification/next action equal that pair. For several pairs, use the shared value only when all agree; otherwise use `classification: mixed`, retain every pair's classification/next action, and choose the strongest safe top-level next action. A partial/failing pair still controls operational status and cannot be hidden by successful pairs. For a missing conditional capability, retain the relationship classification already derived from B/L/R; never replace it with the intended write action (`created` or `updated`) because no write occurred.

</report>
