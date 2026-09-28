<!-- Default PR message template for `coding:pr create` and `coding:pr update` (`coding:commit --create-pr` delegates to `create`).

`coding:standards/git/` owns conformance findings. Validate rendered output with `bun run scripts/scan-pr-message.ts`; this file alone owns the bundled shape.

This is the **default** PR template used when the repo has no GitHub PR template of its own checked in (e.g. `.github/PULL_REQUEST_TEMPLATE.md`). When a repo template exists, that template takes precedence and is emitted verbatim instead of this one.

Body and scanner metadata: classify every PR with the archetype selected in [create-update.md](../directions/create-update.md#select-the-pr-archetype). Archetype drives conditional body evidence and scanner input only. Repository label discovery, selection, and attachment follow [create-update.md](../directions/create-update.md#discover-and-select-repository-labels). Attached labels are never rendered in the title or body.

Always required: Summary + Goal + Requirements + Context + Verification + Additional Notes. Goal states the outcome; Requirements lists observable behavior, never generic process gates. Yellow, red, and black zones also require Risk + Test Plan; red and black require Why This Size. Specification, Implementation, Breaking, Rollback, Feature Flag, Screenshots, Generated Files, Risk, Test Plan, Why This Size, Related and Boundary are conditional and carry the `[ Optional ]` suffix in this authoring template even when a zone, archetype, or diff makes one mandatory for that PR. Remove `[ Optional ]` from every heading in the final rendered PR message. Every section heading starts with an emoji.

The order is a single arc — why, what, what it costs, what to check, where it stops — with lookup material last. Authors fill placeholders in `{{double_braces}}`; the guidance comment above each one says what belongs there.

Placeholders (for non-LLM callers performing literal substitution):

  Name                       Required  Source / Description
  -------------------------  --------  ----------------------------------------
  summary_paragraph          yes       Plain-language purpose, ≤3 sentences. Derived from commit body lead paragraph.
  goal_body                  yes       Outcome this PR is intended to achieve and why it matters; no implementation detail.
  requirements_body          yes       Testable, observable behavior required from the result; no generic quality/process gates.
  context_body               yes       Why this change is needed; bug links; design background.
  specification_body         no        A canonical committed-doc path or external page such as Notion. Drop section if empty.
  implementation_body        no        What was implemented; trade-offs; design choices; evidence and results. Drop section if empty.
  breaking_changes_body      no        Breaking-change list + migration notes. Drop section if commit subject lacks `!` and no `BREAKING CHANGE:` trailer.
  risk_body                  by zone   Concrete failure modes and mitigations. Required for yellow/red/black.
  test_plan_body             by zone   Checks covering the named risks. Required for yellow/red/black.
  why_this_size_body         by zone   Concise, specific indivisibility rationale. Required for red/black.
  rollback_body              by type   Rollback steps or explicit forward-only mitigation. Required for migration.
  feature_flag_body          by type   Flag name, default, removal target, rollout plan, and cleanup change. Required for feature-flag.
  screenshots_body           by type   Before/after screenshots and relevant accessibility notes. Required for ui.
  generated_files_body       by diff   Generated paths and their source/generator. Required whenever any generated files exist.
  verification_body          yes       Checklist of the checks that must pass before sign-off, ticked as each is confirmed.
  boundary_body              no        Related work the instruction placed outside this change. Drop section if empty.
  additional_notes_body      no        Deviations from the spec or original request (what changed and why), known limitations, follow-ups. Keep the section and its review instruction when empty.
  related_issues_body        no        Plain issue and discussion references; no issue-closing directives. Drop section if empty.

Substitution rules:
- All placeholders are literal `{{name}}` tokens; no nesting, no expressions.
- An optional placeholder whose value is empty/whitespace MUST cause its entire section header (`## ...`) and body to be omitted from the rendered output, except Additional Notes, whose fixed review instruction is always retained.
- Every guidance comment is author-facing and MUST be stripped from the rendered body, including this block.
- Verification is required: standards checks are green before submission; reviewer and hosted-CI tasks may remain unticked until their gates run.
- Zone-required placeholders are never dropped or filled with generic stubs.
- Remove `[ Optional ]` from every included section heading in rendered output.
- Output MUST be byte-stable for the same input map (deterministic ordering, trailing newline, no trailing whitespace). -->

📌

<!-- purpose and main changes in plain language, ≤3 sentences -->
{{summary_paragraph}}

## 🎯 Goal

<!-- the outcome this PR intends to achieve and why it matters; describe the desired end state, not the implementation -->
{{goal_body}}

## ✅ Requirements

<!-- bullets describing observable behavior the result must provide; exclude generic gates such as passing tests, following standards, or keeping CI green -->
{{requirements_body}}

## 🧵 Context

<!-- why this change is needed: the problem and symptoms, related bug or ticket links, what problem it solves and why, and relevant design background -->
{{context_body}}

## 📘 Specification [ Optional ]

<!-- a canonical committed-doc path or external page such as Notion -->
{{specification_body}}

## 🛠️ Implementation [ Optional ]

<!-- features or behavior implemented and how the solution was achieved; trade-offs, architectural choices, and design patterns; verification results belong with their checks in Verification -->
{{implementation_body}}

## 💥 Breaking Changes [ Optional ]

<!-- what breaks, and the migration for it -->
{{breaking_changes_body}}

## ⏪ Rollback [ Optional ]

<!-- migration rollback steps; when irreversible, say so and document the forward-only mitigation; required for migration -->
{{rollback_body}}

## 🚩 Feature Flag [ Optional ]

<!-- flag name, default state, removal target, rollout plan, and cleanup change; team ownership belongs in CODEOWNERS or forge assignments; required for feature-flag -->
{{feature_flag_body}}

## 🖼️ Screenshots [ Optional ]

<!-- before/after screenshots and relevant accessibility notes; required for ui -->
{{screenshots_body}}

## 🏭 Generated Files [ Optional ]

<!-- every generated path plus its source or generator; required whenever any generated files exist; distinguish allowed package lockfiles from removed artifacts, since no other generated output may remain in the head -->
{{generated_files_body}}

## ⚠️ Risk [ Optional ]

<!-- concrete failure modes, impact, and mitigations; required for yellow/red/black -->
{{risk_body}}

## 🧭 Test Plan [ Optional ]

<!-- checks that exercise the named risks; required for yellow/red/black -->
{{test_plan_body}}

## 📐 Why This Size [ Optional ]

<!-- concise, specific reason this review surface is one indivisible change; required for red/black; generic justification does not satisfy it. Do not add file counts, zone metadata, or reviewer-time estimates. -->
{{why_this_size_body}}

## 🧪 Verification

<!-- Record change-specific checks and revision-bound evidence. Display abbreviated seven-character SHAs in Verification; keep full OIDs in the evidence and managed reviewer-task metadata. The published draft contains no reviewer tasks. After AI review and hosted CI pass, the ready transition runs `generate-reviewer-tasks.ts` to add one managed unchecked block for the exact head/base: `@reviewer reviews <short-head>` for each reviewer and `@author approves <short-head>` for the PR creator. Record any specification deviation as an unchecked task. -->
{{verification_body}}

## 🚫 Boundary [ Optional ]

<!-- bullets naming adjacent work the instruction placed outside this change and where it lives, plus anything a reader would reasonably expect here that was not requested; not the author's own judgment calls -->
{{boundary_body}}

## 📋 Additional Notes

Publish review findings and the verdict as a separate PR review or comment. Never append them to the main PR description.

<!-- deviations from the spec or original request (what changed and why), known limitations, follow-ups, anything else a maintainer needs -->
{{additional_notes_body}}

## 🔗 Related Issues [ Optional ]

<!-- plain references to related tickets, issues, RFCs, and discussions; resolving relationships are verified GitHub Development links, never closing directives in message text -->
{{related_issues_body}}
