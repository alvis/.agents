# Project state direction

Project and stream state dashboards are renderer-owned reports. Reach this
direction from [state mode](../../state.md), supply one normalized `.mdc` graph
root or normalized `.json` document, and follow that mode's one-shot command.

Do not compose sections through the general presentation vocabulary and do not
run `state-board.ts` or `render-page.ts`. The shared state renderer derives
blockers, tasks, progress, reviews, submissions, completion, environment, and
traps from the validated domain model. It refuses malformed or incomplete
input rather than presenting guessed state.

The returned HTML is self-contained, accessible, read-only, and temporary.
Viewing it through a harness viewer is presentation only; annotations or user
decisions belong in the lifecycle writer, never back in the generated page.
