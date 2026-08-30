# Asset manifest

Version this manifest as text; keep media bytes outside Git. A filesystem
path is not identity: every asset and render is named by a stable ID and an
immutable content reference, so reproducing a render is an operation rather
than archaeology. Use `essential:references/anchors.md` for anchor kinds
and `essential:references/approvals.md` for approval binding.

A SHA-256 content hash identifies exact bytes; a changed hash is a new revision
that must be reviewed again. Provenance records which exact inputs produced a
derived asset. A LUT is a colour lookup table used by a render, and
`capability_id` identifies the approving agent or role so the approval remains
traceable.

```yaml
assets:
  - id: <stable-kebab-id>
    kind: footage|audio|image|font|lut|template|subtitle|other
    uri: <asset-store locator>
    sha256: <content hash>
    provenance:
      - <input-id>@<revision|hash>
    rights:
      owner: <holder>
      consent_ref: <ref|null>
      license_ref: <ref|null>
      expires: <date|null>

renders:
  - id: <deliverable-id>-v<n>
    timeline: <project/timeline id> @ <timeline revision>
    inputs_manifest_sha256: <hash of the assets section it was built from>
    settings: <render preset id + fonts/luts/plugins by id>
    output_sha256: <hash>
    approvals:
      - reviewer: <capability_id|user>
        scope: <approved scope, including timecode range when partial>
        at: <ISO-8601>
        ref: <review or journal reference>
    delivered_to: <destination|null>
```

An approval binds to exactly one render ID and revision; it never carries to
the next render. When a decision invalidates a render, mark it
`validity: stale (<decision-id>)` in place. The entry is history and remains.
