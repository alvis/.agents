# State context discovery

Use this bounded order during diagnosis; do not scan all Markdown by recency:

1. Apply the fix skill's State gate to the resolved work item.
2. Follow only links relevant to the diagnosed scope:
   - `review.md` and the named canonical area file for findings;
   - the active work's materialized `spec/` sources and their receipts;
   - relevant `design/` children and durable `docs/design/` or `docs/architecture/` paths;
   - linked decisions, evidence, validation output, or change children.
3. Treat source, test, and runtime evidence as authoritative over stale state; report contradictions to the main agent for `state.md` reconciliation.

Extract exact issue IDs/locations, expected behavior, contract constraints, blocked decisions, accepted assumptions/recheck triggers, and validation needed. Review findings identify the defect; state/specification establish intended behavior. Never auto-adopt root continuation, draft, plan, or design files.
