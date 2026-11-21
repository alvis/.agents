# Review completion formats

A nested reviewer writes its assigned temporary report and returns only the path, verdict, counts, and a short summary. The following combined output belongs to the main agent.

Persist the review first, then render a compact summary. Detailed findings live under the active work root; the user may select an inline pattern summary or interactive discovery. Both interactive and non-interactive modes report:

```markdown
# Code review summary

- Work: `<work-id>`
- Overall: `<pass|pass_with_suggestions|requires_changes|fail>`
- Plan source: `state.md`
- Reviewed task IDs: `<full IDs>`
- Alignment: `<verdict/counts>` — `reviews/alignment.md`
- Correctness: `<verdict/counts>` — `reviews/correctness.md`
- Security: `<verdict/counts>` — `reviews/security.md`
- Quality: `<verdict/counts>` — `reviews/quality.md`
- Testing: `<verdict/counts>` — `reviews/testing.md`
- Docs: `<verdict/counts>` — `reviews/docs.md`
- Style: `<verdict/counts>` — `reviews/style.md`
- Outstanding priorities: `P0:<n> P1:<n> P2:<n> P3:<n>`
- Dispositions: `open:<n> fixed:<n> acknowledged:<n> deferred:<n> skipped:<n>`
- Closure: `closed:<n> outstanding:<n>`
- Summary target: `<state-root>/works/<work-id>/review.md` (`written` or
  `reconciliation_returned`)
- Pattern confirmation: `<confirmed/rejected/pending/stale counts>` — `review.md`
- Presentation: `<inline|discover HTML|pending choice|non-interactive|reconciliation returned>`
- GitHub handoff: `<eligible pattern IDs or none; unverified checks with reasons>`
- Generated files: `<explicit paths>`
```

Report every existing canonical area even when only selected areas were rerun; mark an area `not_run` only when no area file exists yet. CI/non-interactive mode additionally returns nonzero for any outstanding finding; it never prompts. Interactive mode follows [confirmation.md](directions/confirmation.md): after the presentation choice, show one concise explanation and confirmation question per unresolved pattern inline, or link the discover HTML and request its single generated reply. A clean review needs neither presentation choice nor confirmation. Never repeat a question for every location.
