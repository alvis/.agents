# Drift check comment template

Fill this and post it as one PR issue comment on the `direction-review` draft each time the [drift check](../../../directions/staged-delivery.md#check-for-drift) runs; the newest such comment is the drift record that [readiness](../directions/create-update.md#6-promote-verified-surfaces-and-add-human-tasks) reads. Its reader is whoever marks a layer ready, so lead with the result. Substitute every `{{name}}` once and repeat each `{{#section}}…{{/section}}` block per item, dropping a block whose items are empty. Post it with `bun "${CODING_PR_SKILL_DIR}/../../scripts/gh-pr-comment.ts" "$DRAFT_NUMBER" --repo "$HOST/$REPOSITORY" --body-file <body>`.

````markdown
<!-- coding:drift-check direction={{direction_sha}} head={{head_sha}} result={{result}} -->
### 🧭 Drift Check · `{{direction_sha_short}}` → `{{head_sha_short}}`

**{{outcome}}.** {{summary}}

{{#classes}}
- {{class}}: {{paths}}
{{/classes}}
{{#new_direction}}
- New direction: {{hunk}}
{{/new_direction}}

{{next_step}}
````

- `direction_sha` is the full commit the approving gate record binds, and `head_sha` the full current draft head; the marker keeps both whole so readiness compares exact commits, and the heading shows seven characters of each. The marker says `direction` because `gh-pr-comment.ts` refuses verdict wording such as "approved".
- `result` is `clean` when every changed path falls in an allowed class, otherwise `new-direction`. `outcome` reads `Only finalization changes` or `New direction found; back to direction review`, and `summary` says in one sentence what changed.
- `classes` names each allowed class that occurs (tests, hardening, reviewer-requested fixes, `TODO(draft):` removal) with its paths.
- `new_direction` lists every other hunk as the behavior it adds; any entry makes `result` `new-direction`.
- `next_step` says what happens next: the layers become eligible for readiness, or the delta returns to direction review under the approver the zone table names.
