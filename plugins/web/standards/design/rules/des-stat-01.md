# DES-STAT-01: UI State Coverage

## Intent

Every surface handles the states its behaviour can actually reach: loading (stable placeholder or progress), empty (explanation + next step), error (what happened + why + what to do, input preserved), success (confirmed outcome + next action), permission (why blocked + how to request access), and any interrupted, returning-user, stale, or domain state its journeys produce. A state the surface cannot reach is not required: a static divider needs no loading or permission UI, while an asynchronous action always needs feedback and failure handling.

## Fix

- **Inventory first**: list the states each data source, action, and access rule can produce; mark unreachable states N/A with the reason
- **Loading**: placeholders matching content layout; prevent double-submit; show progress when the wait is noticeable
- **Empty**: explain what "empty" means in context + provide an actionable next step (create, import, change filters); distinguish no records from no filter matches
- **Error**: state problem + cause (if safe) + solution; preserve user input; allow retry
- **Success**: confirm what actually happened + provide the next action (view, undo, share); a toast alone does not prove the outcome
- **Permission**: explain why access is denied + how to request it

## Code Superpowers

- Search for loading/skeleton/spinner components — flag asynchronous regions without them
- Check error message patterns — flag generic messages ("Something went wrong")
- Look for empty state handling in list/table components
- Verify form submissions preserve input on error
- **Hover feedback**: for every interactive element, capture computed styles (color, background, borders, outline, box-shadow, text-decoration, transform, opacity, filter, font-weight, letter-spacing, cursor) before and after dispatching a real `hover`; flag **medium** when none of those properties change. Escape with the unhover step (`hover body`) between samples to avoid sticky state.

## Common Mistakes

1. Missing loading state (blank screen while fetching data)
2. Generic error messages without guidance ("Something went wrong")
3. No empty state (blank area with no explanation or next step)
4. Success actions that don't provide a clear next step
5. Inventing loading or permission UI for content that is static or public

## Edge Cases

- Real-time data streams may not have traditional loading states — use connection status instead
- Permission states do not apply to public-facing pages without access rules

## Related

DES-STAT-02, DES-COPY-02, DES-HIER-01
