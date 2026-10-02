# <decision title>

<!-- Create .state/works/<work-id>/decisions/<decision-slug>.md. Fill the required metadata and section prompts; remove author comments and unused optional fields or sections before recording the decision. Existing records require no backfill. Follow ../../../directions/decisions.md for acceptance, supersession, and completion. -->

- Status: `<proposed|accepted|rejected|superseded>`
- Headline: <one-line choice>
- Owner: <decision owner>
- Created: <ISO-8601 timestamp>
- Source: <approval, question, or provenance reference>

<!-- Optional causal fields: name each target by ID or path and exact revision or hash; omit empty fields. supersedes names the replaced decision; affects names tasks, documents, or streams whose direction this decision sets; invalidates names completed outputs, evidence, or approvals made stale; preserves names prior outputs or approvals explicitly remaining current. effective_from is an ISO-8601 date when acceptance and effect differ. superseded-by names the successor when this record is replaced. -->

- supersedes: <decision ID and revision>
- affects: <task, document, or stream IDs and revisions>
- invalidates: <output, evidence, or approval IDs and revisions or hashes>
- preserves: <output or approval IDs and revisions or hashes>
- effective_from: <ISO-8601 date>
- superseded-by: <successor decision link>

## ✅ Decision

TODO: State the chosen or proposed approach and its scope in plain English. Record acceptance only when explicitly approved; explain the disposition when rejected or superseded.

## 🧭 Rationale

TODO: Explain the problem, constraints, and evidence that support this choice. Distinguish observed facts from accepted assumptions and unresolved questions.

## 🔀 Alternatives considered

TODO: Name the viable alternatives and explain why each was not selected.

## 🤝 Accepted Trade Offs

<!-- Optional: omit this section when no tradeoffs were explicitly accepted. List every explicitly accepted cost, limitation, risk, or compromise as a bullet explaining what it buys. Keep unresolved risks in Impact and rejected alternatives in Alternatives considered; do not infer acceptance from their presence. -->

- TODO: Describe an explicitly accepted tradeoff and what it buys.

## 🧪 Evidence

TODO: Link supporting evidence and any approval with the exact revisions or hashes verified. Name relevant failure modes, the falsification signal, and rollback path or why rollback is unnecessary.

## ⚖️ Impact

TODO: Explain operational implications, dependencies, and unresolved risks without repeating accepted tradeoffs. Name an owner and deadline for deferred decisions, and the tasks they block.
