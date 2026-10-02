# Create

1. Resolve report, repository conventions, relevant templates, and existing metadata using `directions/github.md`.
2. Run `directions/lookup.md` before creation unless the user forbids searching. Reuse an established duplicate by returning its URL; do not silently update it. Related issues do not prevent creation. A failed required search blocks creation until resolved or the user explicitly waives search; a bounded successful search may proceed with its disclosed limits.
3. Compose a concrete title and body through `templates/body.md` or the applicable repository template. Preserve uncertainty; omit facts not supplied or established. Include related references without claiming closure.
4. Select existing metadata only when supported by report and repository conventions. Missing native types do not justify inventing labels; an existing type-equivalent label is usable only when repository conventions establish that mapping.
5. Recheck promising duplicate candidates and concurrent creations with the remaining search budget immediately before submission. If the budget is exhausted, report the residual race risk; do not claim deduplication is atomic.
6. Write the exact body to `BODY_FILE` without shell interpolation, then run:

```bash
bun "${ISSUE_SKILL_DIR}/../../scripts/gh-issue.ts" create --repo "$HOST/$REPOSITORY" --title "$TITLE" --body-file "$BODY_FILE"
```

7. Bind the returned URL and number. Read it back, then apply selected metadata through `directions/github.md`. If creation succeeds but metadata fails, report the existing issue and failed fields; never create a second issue to retry metadata.

If the creation response is lost, inspect recent issues for the exact title/body/author before retrying. An ambiguous outcome requires resolution, not a blind second POST. Remove temporary body files after verification.
