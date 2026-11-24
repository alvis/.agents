# Create

1. Resolve report, repository conventions, and existing metadata using `directions/github.md`; complete template discovery and selection through `directions/templates.md`.
2. Run `directions/lookup.md` before creation unless the user forbids searching. Reuse an established duplicate by returning its URL; do not silently update it. Related issues do not prevent creation. A failed required search blocks creation until resolved or the user explicitly waives search; a bounded successful search may proceed with its disclosed limits.
3. Compose and check the title and body through `directions/templates.md`. Preserve uncertainty; omit facts not supplied or established. Include related references without claiming closure.
4. Every created issue carries exactly one native type: Bug, Feature, or Task, classified under [Issue type](github.md#issue-type). Ask before writing when the facts do not distinguish them. Confirm the class matches an enabled discovered type before creation; when discovery is unresolved or no enabled type matches, stop before creating and report it. Only the user's explicit waiver permits an untyped issue; then apply an existing type-equivalent label only when repository conventions establish that mapping, never an invented one. Select existing labels and other metadata only when supported by report and repository conventions. When the report or lookup establishes a parent, sub-issue, or blocking dependency, in either direction, select it as a native relationship; merely related issues stay plain references.
5. Recheck promising duplicate candidates and concurrent creations with the remaining search budget immediately before submission. If the budget is exhausted, report the residual race risk; do not claim deduplication is atomic.
6. Write the exact body to `BODY_FILE` without shell interpolation, then run:

```bash
bun "${ISSUE_SKILL_DIR}/../../scripts/gh-issue-create.ts" --repo "$HOST/$REPOSITORY" --title "$TITLE" --body-file "$BODY_FILE"
```

7. Bind the returned URL and number. Read back the exact title, body, and the numeric `id` that relationships need through `directions/github.md`, then set and read back the type before applying selected labels, other metadata, and relationships. Report the selected template source and independent fallback reasons. If creation succeeds but metadata fails, report the existing issue and failed fields; never create a second issue to retry metadata.

If the creation response is lost, inspect recent issues for the exact title/body/author before retrying. An ambiguous outcome requires resolution, not a blind second POST. Remove temporary body files after verification.
