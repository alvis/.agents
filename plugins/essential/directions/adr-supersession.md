# Supersede an architecture decision record

Follow this when a later durable architecture decision record (ADR) changes an accepted choice, whether partially or completely. For wording-only clarification, use [authoring](adr-authoring.md#clarify-an-accepted-record).

1. Create the new effective record through [authoring](adr-authoring.md). Every successor must exist as an effective ADR with a later numeric identity; its domain may differ from the old record's.
2. Move the old file directly under `docs/architecture/decisions/superseded/<domain>/`, keeping its existing domain and filename. `superseded` is the reserved archive directory; no other depth or domain-first archive ordering is valid. Preserve the original heading and substantive decision body unchanged, not just its status metadata. Never clarify an archived body in place.
3. Prepend this header, filling every field and keeping the original body below it:

   ```markdown
   > **Status:** Superseded
   >
   > **Superseded by:** [ADR-<n> — <title>](../../<successor-domain>/adr-<n>-<slug>.md)
   >
   > **What changed:** <State whether the change is partial or complete and summarize the changed choice.>
   ```

   Include exactly one of each required field in the shown order. Every successor uses `../../<successor-domain>/adr-<n>-<slug>.md`, including successors in the same domain. When several ADRs replace the choice, list their distinct links on the same Superseded by line, separated by commas. Optionally include `> superseded-by: adr-<n>[, adr-<n>...]` at most once in this prepended header; its unique identities must match the linked successors exactly. The non-empty change summary must explicitly state whether the change is partial or complete.

4. Reconcile the [effective-record index](adr-authoring.md#maintain-the-index), removing the moved record and adding its successors.

Do not edit the old ADR into the new decision. The archive header is the only permitted addition to its historical body. Verify the result through [ADR review](adr-review.md).
