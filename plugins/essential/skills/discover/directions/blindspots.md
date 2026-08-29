# Blindspot mode

Use this mode to look beyond the questions already present in the prompt.

1. Build four working buckets:
   - **Known knowns**: user-stated intent and verified repository or runtime evidence.
   - **Known unknowns**: questions already recognized.
   - **Latent preferences**: possible "unknown knowns" the user may recognize
     when shown alternatives; keep them as hypotheses until confirmed.
   - **Blindspot hypotheses**: possible unknown unknowns requiring evidence.
2. Inspect the smallest relevant code, runtime, or integration surface that can test the hypotheses:
   architecture and call paths, sibling implementations, history and decision
   records, tests and failure paths, integration boundaries, operational
   constraints, security/privacy/data migration, and user-visible states.
3. For each candidate, record why it might matter, evidence for or against it,
   which decision it could change, and the cheapest next probe.
4. Adversarially ask what an experienced maintainer, user, operator, security
   reviewer, and future implementer would notice. Do not invent requirements;
   unresolved possibilities remain hypotheses.
5. Rank by decision impact and reversibility. Recommend another mode only for
   the highest-impact unresolved items; do not broaden into an exhaustive audit.

Complete with the updated evidence ledger, the top blindspot hypotheses that
survived inspection, disproved hypotheses, and the next cheapest probe.

When the result has several interacting risks or an unfamiliar mechanism,
consider a **risk/context report** or **domain explainer** from
[presentation](presentation.md). Use HTML only when interaction or visual
structure improves comprehension; prose remains the default.
