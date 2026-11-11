# Sync comment

Keep one sync comment per task, rendered in the tracker's Markdown, and edit it as more deliveries merge rather than posting another. The first line is the marker that lets a later run find it. When read-back shows the tracker stripped the HTML comment, edit the comment so the plain marker `essential:sync {{task_ref}}` is its last line. Lead with the outcome a reader of the task cares about, keep each deviation to one line with its reason, and drop an empty block.

```markdown
<!-- essential:sync {{task_ref}} -->
{{outcome_sentence}}

Delivered in {{#deliveries}}[{{delivery_label}}]({{delivery_url}}) (merged {{merged_date}}){{/deliveries}}.

{{#deviations}}
**Deviations from the plan**

- {{deviation}} — {{reason}}
{{/deviations}}
{{#follow_ups}}
**Follow-ups**

- {{follow_up}}
{{/follow_ups}}
```

- `task_ref` is the tracker's own identifier, such as `ENG-412`, or the task URL when it has none.
- `outcome_sentence` states what now works, in the task's own terms, such as `Invoice retries now survive a gateway timeout.` For a cited task, say what the delivery changed for it. When editing an existing comment, rewrite it to cover every listed delivery, keeping what each earlier one made work. Add `It shipped as planned.` only when no listed delivery has a deviation.
- `deliveries` lists every merged PR that cites the task, including those an existing sync comment already lists from other work, as `#<n>` or `<owner>/<repo>#<n>`, joined with commas; `merged_date` is `YYYY-MM-DD`.
- A deviation is a difference between what the task or its plan asked for and what shipped: a changed behavior, a dropped requirement, or an added constraint. Source it from each merged PR's Additional Notes, the work's `changes/` departures, and `state/revisions.md`; never restate implementation detail that matched the plan.
- Follow-ups list deferred work with its tracker or issue reference when one exists.
