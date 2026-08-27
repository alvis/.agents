# Specification metadata

Use separate schemas for Notion transport and work-local specification evidence. Never copy transport-only metadata into contract prose without purpose.

## Notion transport metadata

Paths are returned by notion-sync and never derived. Preserve all existing
properties; the keys below are the minimum identity/provenance surface:

```yaml
---
title: Capability contract
last_edited_time: 2026-07-20T10:30:00.000Z
ref: 01234567-89ab-cdef-0123-456789abcdef
parent: 01234567-89ab-cdef-0123-456789abcdef # only for an unsynced child
---
```

- `ref` is the stable Notion identity and never derives a local filename.
- `parent` is present only when needed to create an unsynced page.
- `last_edited_time` is remote revision metadata returned and updated only by
  Notion transport. The selected body author preserves it byte-for-byte and never
  replaces it with a local clock. An unsynced locally authored page omits this
  key until transport supplies it.
- Local edit timestamps belong in ignored work evidence or the sync receipt,
  never in Notion transport frontmatter.
- Preserve Notion properties and relationship annotations verbatim.
- The transport body remains opaque state and is edited only through the exact
  explicitly selected body-author capability.

## Work-local specification evidence

<work-local-specification-provenance source-kinds="local,inline" external="forbidden" external-evidence=".state/**" />

`spec/README.md` is the readable work-local contract for a reachable repository source or approved inline source. External sources use the separate synchronization receipt schema. Preserve the source contract's semantic frontmatter and body; do not inject source, timestamp, receipt, or hash fields into contract Markdown. Put work-local derivation metadata in `spec/provenance.json`:

```json
{
  "schema": "specification-provenance-v1",
  "source_kind": "local",
  "source_locators": ["repo:requirements/capability.md"],
  "source_revision": "<git-blob-oid-or-empty>",
  "materialization_revision": "<git-blob-oid-or-empty>",
  "approved_content_ref": "<source path or work-local locator to the exact approved specification content>",
  "logical_units": [
    {"id": "contract:root", "source_path": "requirements/capability.md", "output_path": "spec/README.md"}
  ],
  "outputs": [
    {"path": "spec/README.md", "exact_sha256": "sha256:<64-lowercase-hex>"}
  ],
  "template": {"locator": "plugin:specification/spec-code/assets/capability-readme.template.md", "plugin_version": "<exact-installed-version>", "exact_sha256": "sha256:<64-lowercase-hex>"},
  "derived_at": "2026-07-20T10:33:00Z",
  "receipt_anchor": "github-pr:owner/repository#123"
}
```

- `source_kind` is exactly `local` or `inline`. An external authority uses only its canonical URL in tracked files; its revision and content evidence stay under `.state/works/<work-id>/artifacts/spec-sync/`.
- `source_locators` contains only durable, portable identifiers. Use `repo:<repository-relative-path>` for a reachable local source and `inline-approved:sha256:<exact-byte-hash>` for an inline-approved candidate. Never publish an absolute local path, an ignored work path, an external-store locator, or a conversation/prompt locator. If an explicit local source is not itself durable, use `local-approved:sha256:<exact-byte-hash>` and retain the approved bytes in the active work's `spec/`.
- Authority has one deterministic interpretation. A reachable `repo:` locator remains the live authority and `spec/` is a checked work-local copy; planning and implementation compare both content directly before use. For `local-approved:` and `inline-approved:` locators, the content-equivalent work-local copy is the active-work authority while the locator remains historical origin evidence. Never treat an unreachable origin and its copy as independently editable truths.
- `source_revision` and `materialization_revision` are lightweight change signals (a Git blob oid or empty). Authority is the specification content itself: approval, plan, and review bind to it and are confirmed by direct comparison, not by any recorded hash.
- `approved_content_ref` identifies the exact approved specification content for direct comparison. For a reachable `repo:` source it is that source path; for `local-approved:` and `inline-approved:` origins it is `spec/README.md`. It must resolve while the active work is open.
- Local provenance may record a reachable Git object. Inline provenance omits source revision. Neither source records external-store identity, revision, or synchronization evidence.
- `logical_units` preserves source logical ids in the work-local output, so a renamed path cannot silently remap semantic units.
- When an intended consumer surface produces `reference.md`, include its source-to-output logical-unit mapping and exact output hash. Remove those conditional entries when no reference file exists; never leave a fictional output in the receipt.
- The receipt is JSON because this is a strict machine-readable sidecar: standard parsers preserve arrays and objects without Markdown ambiguity or a YAML dependency. Keep lineage separate from semantic contract prose so changing evidence never rewrites the approved contract.
- The bundled fallback template uses the stable `plugin:specification/spec-code/assets/capability-readme.template.md` locator, exact installed plugin version, and exact asset SHA-256. This singular `template` object identifies the primary README template. `reference.md` is prescribed by the same workflow/plugin version and is independently hashed as an output; v1 does not add a second template object. Never record the origin machine's plugin cache/install path. Explicit/project templates use a durable `repo:` or selected remote locator instead.
- `outputs` lists contract Markdown files only and **must exclude `provenance.json` itself**. Compute the provenance file's own exact SHA-256 only after its final write; store that self-hash in ignored work evidence and the run report. Never insert the self-hash into the file it hashes.
- `receipt_anchor` points to the durable owning task, pull request, or repository record that records completion. It remains resolvable after ignored local work is retired. Only ignored work evidence may contain temporary absolute source or receipt paths.
- Filenames follow `naming.md` in the essential plugin's `references/` directory, never a transport-mirror filename.
- The main agent's final output manifest includes all derived `.md` files and
  `provenance.json` in `generated_files`; versioned `docs/**` remains excluded
  from the final size check, which selects only eligible Markdown inside
  `.state/`.
