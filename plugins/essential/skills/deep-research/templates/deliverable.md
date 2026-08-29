# Research Deliverable Format

The final deliverable of `deep-research`. Every section below appears in the
deliverable; write "none" rather than omitting a section, so absence of
evidence is explicit. All counts come from `source-tracker.md`, never from
memory.

## Section order

1. **Summary statistics** — initial sources, discovered sources (and across how
   many levels), total analyzed, duplicates detected, claims verified with
   confirmed / refuted / unverified counts, key findings count, research gaps
   count, overall confidence (High/Medium/Low), discovery depth reached (1-3),
   and credibility distribution
   (Academic / Official / Industry / Community counts).
2. **Executive summary** — 3-5 sentences covering the key discoveries.
3. **Key findings** — one subsection per finding. Findings derive only from
   claims **confirmed** by adversarial verification (see
   [claim-verification.md](../directions/claim-verification.md)):
   - Title with a confidence rating (High/Medium/Low).
   - **Evidence**: sources and quotes, each with a credibility indicator.
   - **Convergence**: how many sources agree vs disagree.
   - **Verification**: the vote margin (`support-refute`, e.g. `3-0`) behind the
     underlying claim(s).
   - **Significance**: why the finding matters for the research topic.
4. **Thematic analysis** — emergent patterns synthesized across multiple
   findings, one subsection per theme.
5. **Debates and contradictions** — where sources disagree, each perspective
   presented with its context and source attribution.
6. **Discovery chains** — one per chain: the initial source, what it led to,
   and what the deeper level revealed (source → insight → new source).
7. **Refuted claims** — claims the adversarial panel killed (≥2 of 3 refute
   votes), listed for transparency: the claim, its source, and its vote margin.
   Write "none" if no claim was refuted.
8. **Unverified claims** — claims whose panels could not adjudicate (fewer than
   2 valid votes cast — an infrastructure failure, not a refutation): the claim,
   its source, and how many votes errored. Write "none" if all panels resolved.
9. **Research gaps** — what was not found or needs further investigation.
10. **References** — the complete source list with access information, grouped
    by discovery level; for level 2+ entries, name the source each was
    discovered from (e.g. "Source A ← discovered from Source 1").

## Confidence rating rule

Rate each finding by source credibility, convergence, and the adversarial vote
margin: High needs multiple independent credible sources agreeing and a
unanimous verification vote (e.g. `3-0`); Medium is a single credible source,
mixed agreement, or a split vote (`2-1`); Low is community-only sourcing or
unresolved contradiction. A refuted or unverified claim never supports a
finding, so it never contributes to a rating. The overall confidence in the
summary statistics is the weighted impression across key findings, not an
average — one Low-confidence load-bearing finding caps the overall rating at
Medium.
