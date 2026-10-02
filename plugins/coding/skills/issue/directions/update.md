# Update

1. Read the specified issue and discussion using `directions/github.md`; resolve requested content and metadata changes against current evidence.
2. Change the title only when requested or supported by the intended update; retain its reporter-authored facts and scope. Apply `directions/templates.md` to only the fields authorized to change. For a body change, preserve the reporter's observations and human edits; distinguish report, verified findings, and pending questions. Incorporate new facts into their owning sections rather than appending contradictory updates.
3. If a faithful update cannot preserve a material disputed statement, leave that statement unchanged and report the conflict. Do not replace the complete body with a generic summary.
4. Reread immediately before writing and merge only intended changes. For a title-only update, leave the body untouched:

```bash
bun "${ISSUE_SKILL_DIR}/../../scripts/gh-issue.ts" edit "$NUMBER" --repo "$HOST/$REPOSITORY" --title "$TITLE"
```

For a body update, write the exact complete revised body to `BODY_FILE`, then:

```bash
bun "${ISSUE_SKILL_DIR}/../../scripts/gh-issue.ts" edit "$NUMBER" --repo "$HOST/$REPOSITORY" --body-file "$BODY_FILE"
```

Add `--title "$TITLE"` to the body command only when both fields change.

5. Apply separately selected metadata through `directions/github.md`; reread and compare the exact title, body, and each changed metadata field with intended values. Verify untouched content remains unchanged; report concurrent changes instead of undoing them. A no-op produces no write. Do not add a comment repeating the body update.

Triage owns analysis comments and does not call this action to rewrite the original report. Remove temporary body files after verification.
