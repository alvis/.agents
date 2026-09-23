# Overall review body template

Fill this and submit it as the review `body`, in the voice from [review-tone.md](../directions/review-tone.md). Always populate Goal and Requirements, Tests, Standards, Reuse and Minimality, and Verdict. Drop any other section that would be empty rather than writing "None" under a heading. Detail lives in the inline comments; this is the map, and it should be actionable in under a minute. Render inline comments through [inline-review.md](inline-review.md).

```markdown
📌

{{verdict_glyph}} Reviewed `{{head_sha_short}}` — {{files_changed}} files, +{{additions}}/-{{deletions}}, {{zone}} zone.

{{one_paragraph_read}}

{{#must_change}}
### 🚨 Must Change

{{#must_change_alert}}
> [!CAUTION]
> {{text}}

{{/must_change_alert}}
{{#must_change_findings}}
- {{marker}} **{{location}}** — {{title}}: {{body}} Evidence: {{evidence}}
{{/must_change_findings}}

{{/must_change}}
{{#worth_considering}}
### 💡 Worth Considering

{{#worth_considering_alert}}
> [!TIP]
> {{text}}

{{/worth_considering_alert}}
{{#worth_considering_findings}}
- {{marker}} **{{location}}** — {{title}}: {{body}} Evidence: {{evidence}}
{{/worth_considering_findings}}

{{/worth_considering}}
{{#previous_reports}}
### 🔄 Previous Reports

{{#previous_report_entries}}
- [{{label}}]({{url}}) — {{verdict}}: {{evidence}}
{{/previous_report_entries}}

{{/previous_reports}}
### 🎯 Goal and Requirements

{{goal_spec_verdict}}

{{intent_behavior_verdict}}

### 🧪 Tests

{{test_verdict}}

### 📏 Standards

{{standards_verdict}}

### ♻️ Reuse and Minimality

{{reuse_verdict}}

{{minimality_verdict}}

{{#unanchored}}
### 📍 Not Anchored to a Line

> [!IMPORTANT]
> {{unanchored_alert}}

{{#unanchored_findings}}
- {{marker}} **{{location}}** — {{title}}: {{body}} Evidence: {{evidence}}
{{/unanchored_findings}}

{{/unanchored}}
{{#not_reviewed}}
### 👀 Not Reviewed

> [!IMPORTANT]
{{#excluded_paths}}
> - `{{path}}` — {{reason}}
{{/excluded_paths}}

{{/not_reviewed}}
### 🧾 Verdict

> [!{{verdict_alert}}]
> {{verdict_sentence}}
```

Notes for the sections where the guidance is not self-evident:

- **Opening marker** — render `📌` on its own line, then a blank line and the review facts prefixed by the verdict glyph — `✅` approve, `❌` request changes, or `⚠️` capped at comment — resolved from the substantive verdict in [review.md](../directions/review.md), exactly as `{{verdict_alert}}` is. Preserve one space between `{{zone}}` and `zone`.
- **Section headings** — every `###` heading starts with its template emoji; use Title Case exactly as shown, preserving conjunctions and prepositions such as “and” and “to”; never emit an unprefixed review section.
- **Opening paragraph** — lead with the judgement, not a summary of the diff the author already knows: "This gets the retry logic right and the shape is good; two things need to change before it merges." Name the zone when it is not green, and lead with it when it is black.
- **Markers** — every bullet opens with the same marker its inline comment carries, per [review-tone.md](../directions/review-tone.md): a P0–P4 badge when the finding claims a consequence, a tag when it demands a process step, an emoji when it demands nothing. The body and the inline comment must not disagree about a finding's level.
- **Alerts** — at most one per section, and only where it changes what the author does next; [review-tone.md](../directions/review-tone.md) owns which alert means what. `> [!CAUTION]` opens *Must Change* under a substantive `REQUEST_CHANGES` that was not capped — a self-review downgrade does not clear it, because the blockers are still there, but a cap does, because a review that cannot stand behind its own evidence cannot declare merge blocked on it. `> [!TIP]` opens *Worth Considering* only under a substantive `APPROVE`, and carries the single highest-value optional improvement. An alert whose section is dropped is dropped with it.
- **Goal and Requirements** — state whether the change matches its stated goal and spec and whether the implementation actually delivers each behavioral requirement. Say *skipped — goal/spec unknown* only for external goal/spec alignment. Render a deviation from the specification that Additional Notes fails to capture as an unanchored chore; an outstanding chore drives the verdict to request changes exactly as any other does.
- **Tests** — answer whether these tests would fail if the implementation broke. "Coverage is fine" is not a verdict.
- **Standards** — name each applicable standard checked and its result; list violations with the exact rule, affected location, evidence, and correction. Cover file structure, testing, documentation, universal code, function/API, and every applicable language-specific standard.
- **Reuse and Minimality** — report missed reuse, unnecessary work, and unexplained differences from comparable work. For each violation, name the affected location, existing reusable resource or comparison, evidence, and actionable correction; link its inline finding when present. Report standards violations under Standards rather than duplicating them here. If none were found, say so briefly. Encourage abstraction; abstraction alone or a single caller is not a minimality violation.
- **Relocations** — a change that belongs elsewhere goes in whichever section its priority earns, with the destination path in the bullet: "Move the null guard into `src/orders/order.service.ts:88` — every other caller needs it too." When the right home is a lower PR in the stack, say that instead and name `coding:commit --reorder`.
- **Not Anchored to a Line** — findings about deleted files, missing files, architecture, or anything GitHub cannot attach to a diff line. Unanchorable is not unimportant; never drop these. The finding's `subject` names the affected path; use `This PR` only when that field is null, because a blank or `null` label reads as a rendering fault rather than deliberate scope.
- **Not Reviewed** — excluded paths and any concern that could not run. The author is entitled to know the boundary of what was actually looked at.
- **Previous Reports** — include this section only when an issue reported before the immediately preceding review has a latest verdict that changed since that review. Add one bullet per changed issue, link its original report, and summarize the latest verdict and the evidence that changed it. Omit unchanged `still_applies`, `fixed`, and `does_not_apply` verdicts; this is a review-to-review delta, not issue history.

*Verdict* is the one section that is never dropped, and it carries its own heading so the closing alert is never read as part of the exclusion list above it. Close it with the verdict in one sentence.

`{{verdict_alert}}` is not a free choice. Resolve it from the **substantive verdict** and never from the submitted event, so a review that cannot be trusted never closes as if it needed no action. First matching row wins:

| Substantive verdict, and what happened to it | `{{verdict_alert}}` |
|---|---|
| Capped at `COMMENT` because the review is incomplete or untrustworthy | `WARNING` — name which part could not be trusted |
| `REQUEST_CHANGES`, submitted as-is or downgraded on your own PR | `CAUTION` — name what clears the blockers; where the event was downgraded, say that GitHub weakened the event and not the finding |
| `APPROVE`, submitted as-is or downgraded on your own PR | `NOTE` — say so plainly and name anything to watch after merge |

A cap and a downgrade are different. A cap says the review could not be trusted, so it outranks the findings reached with it. A downgrade says only that GitHub refused the event, which changes nothing about what the review found, so the substantive presentation remains intact.
