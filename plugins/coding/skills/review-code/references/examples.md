# Invocation examples

Load only the example matching the invocation.

```bash
/review-code --work-id=auth-refresh
# Reviews the current changed scope across all seven areas.
```

```bash
/review-code "src/api/" --area=security,correctness --work-id=auth-refresh
# Returns proposed reviews/security.md and reviews/correctness.md content for
# the main agent to write and reconcile into review.md.
```

```bash
/review-code "PR#123" --area=all --work-id=auth-refresh --explain
# Reviews PR changes and returns a proposed change-explainer child for the
# main agent to write under changes/.
```

```bash
/review-code "src/**/*.spec.ts" --area=testing --work-id=auth-refresh
# Reviews test intent, reliability, fixtures, and per-source coverage.
```

```bash
/review-code "HEAD~3..HEAD" --area=alignment --plan=/repo/.state/works/auth-refresh/state.md --work-id=auth-refresh
# Asserts canonical root state.md; a mismatch is rejected rather than
# promoting an implementation-detail or root planning file to authority.
```

Clean output reports `pass` in the selected area and a `review.md` reconciliation delta. Findings use stable IDs and `open|fixed|acknowledged|deferred|skipped`. A missing work ID, unresolved path, binary-only scope, or legacy `--out` is rejected with the exact corrective invocation; no root `reviews/` fallback is created.
