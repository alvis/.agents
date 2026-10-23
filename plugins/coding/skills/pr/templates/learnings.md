# Review learnings comment template

Fill this and post it as one PR issue comment after the PR merges, only when [landing.md](../directions/landing.md#after-merge) calls for one. Its reader is a future author mining past reviews, so each bullet must be useful to someone who never saw this PR. Substitute every `{{name}}` once and repeat each `{{#section}}…{{/section}}` block per item, dropping a block whose items are empty.

````markdown
<!-- coding:review-learnings pr={{pr_number}} merge={{merge_sha_short}} -->
### 📚 Review Learnings

{{one_line_context}}

{{#lessons}}
- **{{title}}** — {{lesson}} ([source]({{source_url}}))
{{#example}}
  ```{{language}}
  {{code}}
  ```
{{/example}}
{{/lessons}}
````

- `pr_number` and `merge_sha_short` form the marker that keeps this comment to one per PR; never remove it.
- `one_line_context` names, in one sentence, what the PR changed and where its reviews came from, such as one human review and two AI review passes.
- `title` is the lesson as an imperative of at most eight words, such as "Bind evidence to the revision".
- `lesson` states what to repeat or avoid on future work and why, in one or two sentences. Test each point first: it passes only when it would still guide an author changing a different feature or file. A point that only explains this PR's fix, such as a typo, a missed case in this feature, or a requirement unique to this work, fails and is dropped. Do not retell the finding or the fix, and merge points that teach the same thing into one bullet.
- `source_url` links the review, inline comment, or thread where the point was raised.
- Add `example` only when the lesson is about code: a few lines showing the pattern to follow, or a before and after pair, in the PR's language.
- Draw lessons from human comments and from AI review findings with their recorded dispositions. A finding declined with evidence can still teach, for example, what a reviewer misread and why.
- Keep the wording free of review-verdict language such as "approved" or "must change": the comment teaches; it does not judge the PR, and `gh-pr-comment.ts` refuses verdict wording.
