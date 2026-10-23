# Direction review comment template

Fill this and post it as one PR issue comment on the `direction-review` draft for each gate record, mirroring that record under [staged delivery](../../../directions/staged-delivery.md#approve-the-direction). Its reader is the direction approver, so lead with the outcome and keep each point to one line. Substitute every `{{name}}` once and repeat each `{{#section}}…{{/section}}` block per item, dropping a block whose items are empty. Post it with `bun "${CODING_PR_SKILL_DIR}/../../scripts/gh-pr-comment.ts" "$PR_NUMBER" --repo "$HOST/$REPOSITORY" --body-file <body>`.

````markdown
<!-- coding:direction-review head={{head_sha_short}} round={{round}} -->
### 🧭 Direction Review · round {{round}} on `{{head_sha_short}}`

**{{outcome}}.** {{one_line_reason}}

{{#findings}}
- {{finding}}
{{/findings}}
{{#minor}}

Smaller points: {{minor_points}}.
{{/minor}}

Recount: {{units}} units (declared {{declared_units}}), risk {{risk_class}}, zone {{zone}}.

{{next_step}}
````

- `head_sha_short` and `round` match the gate record's file name, `direction-<head_sha_short>-<round>.json`, and form the marker that keeps one comment per round.
- `outcome` states the gate record's verdict in these words, because `gh-pr-comment.ts` refuses verdict wording such as "approved":

  | Verdict | `outcome` |
  | --- | --- |
  | approve | Direction holds; peel the draft as built |
  | approve-with-major-rework | Direction holds; rebuild the draft from it |
  | revise | Revise the draft |
  | reject | Direction rejected; back to planning |

  When the reviewer lacks the zone's authority, as an AI reviewer of a yellow, red, or black draft does, write `No blocking issue found` instead of either outcome where the direction holds; the record is advisory, and a rebuild finding goes under `findings`.
- `one_line_reason` says in one sentence why the direction holds or fails.
- `findings` lists each blocking finding as the failure a reader would hit, not as its fix. `minor_points` joins the non-blocking points into one sentence.
- `units`, `declared_units`, `risk_class`, and `zone` come from the reviewer's recount; a zone that rose names the new approver in `next_step`.
- `next_step` says who acts next and on what: the author's next round, the peel into layers, or the approver the zone table names. Mention an approver as `@login` only when a person must act, and ask for their review or comment, since a checked box decides nothing.
