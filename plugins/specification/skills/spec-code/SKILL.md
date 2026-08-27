---
name: spec-code
description: Design, update, or retrospectively document a technical specification from a user-selected local, inline, or Notion source through an active work stream. Keep approved specification content in the active work's spec/; keep Notion transport in sync-notion and implementation planning in plan-code.
requirements:
  intelligence: high
argument-hint: "<instruction> --capability=<slug> [--work-id=<id>] [--source=<path-or-ref>] [--source-direction=<direction>] [--transport-root=<dir>] [--transport-profile=<absolute-file>] [--body-author=<plugin:skill>] [--template=<path-or-ref>] [--local-mdc=<path>] [--parent=<ref>] [--type=api|web-app|mobile|library|fullstack]"
---

# Spec Code

Author a technical specification as one coherent contract. An explicit local
path or selected Notion identity can be an authoritative source. Inline prompt
text is requirements evidence, not by itself a durable final contract: it must first become an approved work-local candidate. When the selected source is Notion, its canonical external URL and revision remain authoritative; its verified readable copy and synchronization evidence live only under the active work's `.state/`.

## Boundaries

- Use for CREATE, UPDATE, and DOCUMENT modes. Do not implement code or own
  Notion transport/conflicts.
- Never create independent root specification/design/requirement artifacts. Temporary reasoning belongs in the active work's `design/`, `proposals/`, `changes/`, or `decisions/`; approved specification content belongs in the active work's `spec/` only.
- This marketplace owns the MDC body grammar through `specification:mdc`.
  Before creating or semantically changing an MDC body, require the explicit
  `--body-author=specification:mdc` selector and invoke that exact capability.
  For another Notion body dialect, require an explicit
  `--body-author=<plugin:skill>`, validate its canonical capability identity,
  and invoke that exact installed capability. Use
  `specification:sync-spec` only for a selected existing Notion specification's
  work-local materialization or verified completion; local and inline sources
  do not detour through it. For a Notion source, the work-local materialization
  is the authored copy; the selected mirror is transport state, not an editing
  surface. Retain its immutable base receipt, exact recorded bytes,
  and observed revision.
- Detect specification changes by comparing content directly (byte-for-byte, or
  via `git diff`), disregarding only the volatile Notion `last_edited_time` line
  for semantic equality. Approvals bind to the approved specification content;
  the observed revision is only a lightweight change signal.
- Preserve transport-owned paths. An existing path comes from transport; a new
  unsynced path must be explicitly supplied. Never infer one from title or id.
- `--skip-notion-sync` controls Notion transport only. It never suppresses the required local/inline approval and work-local materialization path.
- Only the main agent writes external specifications, `.state/**`, root
  `README.md`, or `docs/**`. Subagents return proposed content and evidence.
  <spec-code-protected-ownership owner="main-agent" delegated="return-proposals-and-refresh-requests" protected="README.md,docs/**,.state/**,external-specification" />
- PRs and tracked documents for a Notion-backed specification cite only its
  canonical external URL, never `.state`, a mirror, an absolute path, or
  `file://`.

## Inputs

- **Required**: instruction and lowercase `--capability=<slug>`.
- **Optional**: work id, authoritative source/location/direction, explicit
  transport root, absolute destination-local transport profile file, exact
  selected body-author capability for Notion body mutation, live template
  path/ref, explicit local transport path and parent for CREATE, project
  type, `--reference=<doc>`, `--discovery=<path>`, `--sync-template`, and
  `--skip-notion-sync`.
- **Prerequisites**: active local state. Notion credentials/tooling
  are required only when the selected direction uses Notion transport.

<IMPORTANT>
Coherence mandate: UPDATE and DOCUMENT edits must be integrated into their
owning sections. Never append an addendum, revisions trailer, parallel old/new
section, or copied transport history.
</IMPORTANT>

## Workflow

1. Before creating or materially rewriting a project artifact, read the
   absolute `state.md` path injected by Essential. If unavailable,
   stop artifact writes and report the missing contract. For a direct run, run
   Essential's workspace resolver with `--work-id` only for an explicit user
   override and accept its deterministic environment, Git-branch/jj-workspace,
   or sole-existing-work match. Ask only when it returns `work_id_required`,
   using its returned candidates; any new id follows that user-confirmed choice.
   A delegated run receives the explicit id/root. Read only the exact
   work/source pointers required for this specification.
2. Resolve source kind, location, and direction from the explicit request
   first, then active work state. A local source requires its exact explicit
   path; never infer or silently relocate it. Treat inline prompt text only as
   requirements evidence. Its eventual authoritative source is the approved work-local specification produced in Step 6, not the prompt or conversation transcript. For
   an existing Notion source that needs local materialization, a direct
   main-agent run invokes `Skill(sync-spec)` with the explicit transport root
   plus `--transport-profile=<absolute-file>` and preserves its returned `ref:`
   identities, paths, and receipt. A delegated run consumes a matching
   main-agent-supplied materialization result read-only; if it is absent,
   mismatched, or stale, return a bounded main-agent refresh request without
   writing partial state. Resolve the profile file from the explicit option
   or an active-state mapping containing its destination-local absolute path,
   logical name, and last verified exact-byte SHA-256. The child revalidates it;
   never infer a path from the profile name/root or reuse an origin path. Select
   CREATE when no authoritative
   specification exists, UPDATE when one exists, and DOCUMENT when current code
   must be described without inventing requirements. Load
   [references/document-mode.md](references/document-mode.md) only for DOCUMENT.
   When this run may create or semantically change a Notion body, resolve
   `--body-author` once from the explicit argument. Require the canonical
   `<plugin>:<skill>` form, record `selection_source: explicit_argument`, and
   pass the identical value to every nested `sync-spec`/`sync-notion` call. Do
   not infer it from the file extension, transport profile, repository, or
   installed plugins. Compare every candidate, source, and work-local specification by direct content comparison (disregarding only the volatile `last_edited_time` line for semantic equality).
3. Acquire and read the complete canonical template before drafting. Use an
   explicit `--template`, then a template recorded in active work/project
   configuration. A Notion-backed source must use the selected **live** Notion
   template through its configured transport; if it cannot be resolved, ask or
   refuse, and never substitute a bundled snapshot. Only for local or inline
   work with neither an explicit nor project template, use the immutable
   source-kind-neutral fallback
   [assets/capability-readme.template.md](assets/capability-readme.template.md).
   Record that fallback with portable locator
   `plugin:specification/spec-code/assets/capability-readme.template.md`, the
   exact installed Specification plugin version, and asset SHA-256; never
   publish its machine-local install path. Record the primary template's portable locator and exact SHA-256 so retries choose the same bytes. The singular v1 provenance `template` object remains that primary template identity; the Specification plugin version prescribes the optional
   reference template, whose derived file is hashed as an output. Preserve
   required section order and properties, and make
   `--sync-template` an explicit content-preserving migration against this
   snapshot. Then gather requirements, discovery
   evidence, architecture, API/data contracts,
   UI behavior, security/privacy posture, acceptance criteria, and unresolved
   decisions. Preserve evidence provenance. Route underexplored material
   unknowns to `essential:discover` and grounded alternatives to
   `essential:decide`; do not turn assumptions into requirements. For inline
   evidence, prepare the complete authored contract—not a summary or pointer
   to the conversation—for the deterministic work-local candidate
   `<work-root>/design/<capability>-specification-candidate.md`. A direct
   main-agent run writes it; a delegated run returns its exact proposed bytes,
   path, and index delta to the main agent. Compute the candidate's exact byte
   SHA-256 for its inline identity locator, and record its exact bytes for later
   direct comparison.
   Require explicit approval of the candidate content; any semantic edit to the
   candidate invalidates approval, while a metadata-only byte change still
   requires a fresh receipt.
4. Prepare the work-local design/proposal/decision content needed to explain
   the specification change. Use lowercase deterministic child names and the
   status schema in the Essential contract. Return all proposed children and
   index reconciliation to the main agent, which alone writes `.state/`.
5. Prepare source and work-local specification metadata according to
   [references/frontmatter.md](references/frontmatter.md). For an existing
   Notion pair, only a direct main-agent run modifies its exact
   transport-returned path through the capability bound as `body_author`. A
   delegated run returns the exact proposed body, evidence, and main-agent
   authoring/synchronization request, then stops before protected writes.
   For CREATE or DOCUMENT with no existing page and Notion sync requested,
   require explicit `--local-mdc`, `--parent`, and `--body-author`; in a direct
   main-agent run, first author that local file through the bound capability
   using the live template and parent metadata. A delegated run returns the
   proposed file bytes and operation request instead. Pass only the approved
   body and exact path; the authoring
   capability cannot choose identity, path, transport, or authority. Creation
   injects stable semantic `ref` identity and may remove creation-only `parent`,
   so pre-create content cannot be final specification approval. Obtain explicit
   **creation authorization** bound to the candidate content, parent, and exact
   diff scope. Only the main agent may then invoke
   `Skill(sync-notion)` in local-to-Notion mode with the exact transport root,
   `--transport-profile=<absolute-file>`, and the identical
   `--body-author=<plugin:skill>`. Verification-pull the new stable
   `ref:`, preserve pre-create bytes, and present every transport-created stable
   metadata/content difference. Record verified R and obtain final specification
   approval of its post-create content. The creation receipt
   stores both the pre- and post-create content references, authorized
   transition/diff, returned identity/revision,
   and exact verification evidence, including the body-author capability and
   `selection_source`. The main agent invokes `Skill(sync-spec)` materialization with that
   receipt, profile, and identical body-author value to atomically establish verified R as initial
   L/B. Never pretend pre/post-create content matches, exclude stable `ref` as
   volatile, or establish a base without post-create approval.
   Never ask transport to create a page before the local MDC exists. For an
   explicit local source, use a `repo:` identity when reachable
   and a `local-approved:sha256:` exact-byte identity locator otherwise; require
   approval of its content before derivation and retain the
   explicit path only in ignored work evidence when it is not portable. For
   inline evidence, use only the approved deterministic candidate from Step 3.
6. For every approved local or inline contract, regardless of `--skip-notion-sync`, the main agent writes the content-preserving materialization into the active work's `spec/` and writes `spec/provenance.json`. A delegated run returns complete proposed specification/provenance bytes and reconciliation deltas; it cannot claim materialization until the main agent writes and verifies them. The readable authority for `plan-code` and `implement-code` is `spec/README.md`. The receipt records source kind, portable source locator, source and materialization content references, the approved specification content, every contract output path/exact SHA-256, logical-unit mapping, template identity, and the content-equivalence check. Its embedded output set excludes `provenance.json` itself. Compute the completed provenance file's own exact SHA-256 after writing and store it only in ignored work evidence, an external durable anchor, and this run's report; never insert a self-hash into the file. Keep any non-portable candidate path/identity in active work and return it in this run's output. Compare the materialized copy against the source directly while retaining source logical-unit ids and lineage. Require its content to equal the approved specification content. If materialization changes semantic contract content, stop `ready_for_approval` and approve the new content before retrying. Record the work-local entry path, receipt path, and approved/materialized content references in active-work reconciliation so later skills never depend on the prompt transcript or ignored candidate alone. Do not claim a Notion round trip for this path.

   Authority is singular while the work is active. A reachable `repo:` local source remains authoritative and `spec/` is its checked work-local copy; later planning and implementation compare both content directly before use. For a non-reachable `local-approved:` or `inline-approved:` source, the approved work-local copy is the active-work authority while the original hash remains historical origin evidence. Never treat an unreachable origin and its copy as independently editable truths.

   The capability `README.md` is the approved normative contract and begins
   with reader orientation: what the capability is, when to use it, how it
   works, and overall usage direction. Do not add installation instructions.
   When the contract defines an intended consumer surface — including one
   intended for another package in the same repository — also derive
   `reference.md` from
   [assets/reference.template.md](assets/reference.template.md). Group entries
   logically and document each API's description, parameters, returns,
   throws or rejections, side effects, and a minimal example. Put `## Overview`
   first, followed immediately by `**Status:** 🚧 Pending` while the referenced
   surface is not fully implemented, or
   `**Status:** ✅ Implemented (<paths>, <paths>)` once every implementation path is
   verified. Do not publish private helpers, and do
   not add completeness, verification-owner, compatibility/versioning, or type
   signature sections. Use
   [assets/provenance.template.json](assets/provenance.template.json) for the
   machine-readable receipt shape. When `reference.md` exists, include its
   logical-unit mapping and exact hash in provenance; remove the template's
   conditional reference entries when it does not.

   For a selected Notion source, `--skip-notion-sync` leaves authored Notion content temporary and does not claim completion. Otherwise invoke `Skill(sync-spec)` only from the main-agent run with the same exact transport profile in `complete --stage=specification` mode only after the main agent has persisted the immutable materialization receipt and content-bound specification approval. If the current specification content differs from the approved content, return `ready_for_approval`; never publish it under an earlier approval. If this run cannot establish that precondition, return `ready_for_completion` with the exact reconciliation payload instead of claiming completion. A delegated run always returns that main-agent completion request rather than invoking transport. The completion flow uses the selected transport mirror, verification pull, refreshed work-local `spec/`, immutable receipt, and dependent revalidation results. It produces no version-controlled specification content. Claim completion only for operational `status: success` with `next_action: none`; propagate `remote_only` or `structural_change` plus `next_action: revalidate`, and never treat unchanged content alone as permission to ignore structural change.
7. For local or inline authority, verify the work-local spec reads as one contract and provenance matches the approved source. For Notion authority, verify `goal.md`'s accepted base matches the `spec/` receipt and the verification pull, and verify no version-controlled specification content was created.
8. Return explicit final paths generated or materially rewritten as `generated_files`, including main-agent-written work children and local/inline work-local specification files. Do not run file sizing; after all writers return, the main agent checks only eligible work Markdown inside the target `.state/`.

## Verification

- The authoritative contract follows the verified live template with no
  invented or duplicate sections.
- Every authored Notion body change used the one explicitly selected
  `body_author`; nested calls and receipts retained the exact capability and
  selection source, plus Notion identity/path.
- A completed Notion run has verified sync, verification pull, a refreshed `.state` materialization/receipt, no version-controlled specification output, and revalidation results. A skipped Notion sync remains explicitly temporary. A local/inline run always has an approved work-local specification plus provenance and never claims a remote round trip.
- Raw inline prompt text is never reported as the authoritative final contract; its approved candidate content and the work-local specification match through the content-equivalence check, compared directly.
- `generated_files` is complete and every state-system reconciliation is
  assigned to the main agent.
- The recorded specification approval is bound to the exact specification
  content that was completed; a later semantic edit requires approval
  again. The observed revision remains recorded with it in every receipt.

## Completion

Report mode, work id, capability, authoritative source/location/direction, template snapshot, Notion refs, selected body-author capability/selection source, validated transport profile path/exact-byte SHA when applicable, work artifacts, `ready_for_completion` or sync/verification result, work-local specification paths and provenance receipt, the exact `authoritative_spec_path`, the approved specification content reference, source/materialization content references, external `provenance_file_hash`, and work-local output SHA-256 values, revalidation impact, main-agent updates requested, and `generated_files`.
