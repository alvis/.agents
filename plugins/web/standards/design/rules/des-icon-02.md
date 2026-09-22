# DES-ICON-02: Purposeful Animation

## Intent

Motion must support comprehension, feedback, spatial continuity, or deliberate brand expression. Expressive motion stays brief, subordinate, and non-blocking; motion never carries meaning by itself. Unaffected content remains stable, and every CSS and JavaScript animation path respects the user's reduced-motion preference.

## Fix

- Name the purpose before adding motion: state feedback, hierarchy, spatial continuity, direct manipulation, or deliberate brand expression
- Start with fade (simplest) → small translate+fade (spatial change) → tiny scale+fade (overlays); treat this as a restrained default vocabulary, not an exhaustive allowlist
- Animate the element whose state or spatial relationship changes, including controls, feedback, content swaps, reordering, panels, overlays, and contained size changes; keep unaffected content stable and preserve focus and reading order
- Use the same motion pattern for the same component and meaning
- Treat 150–300ms for micro-interactions and 300–500ms for page or large spatial transitions as house starting ranges; tune for distance, size, complexity, and urgency, document material exceptions, and never delay state availability or input
- Make entrances optional and purpose-driven; do not animate an element merely because it appeared
- Allow restrained overshoot only when it clarifies direct manipulation or physical response; avoid repeated or high-amplitude bounce and elastic effects
- Provide a live `prefers-reduced-motion` branch for every CSS and JavaScript path: remove large translation, scale, parallax, repeated motion, and overshoot; use an instant state or quiet dissolve while preserving the final state and feedback
- Give users pause, stop, or hide controls for persistent automatic motion
- Prefer explicit `transform` and `opacity` transitions; profile filters, especially blur, and use `will-change` only after evidence of need
- Allow layout or size animation only when the change itself communicates state, the affected region is contained, and measurement shows acceptable layout and paint cost; reserve space, use snapshots, or use skeleton placeholders to prevent unexpected jumps

## Code Superpowers

- Search for `animation`, `transition`, `@keyframes`, Web Animations API calls, animation-frame loops, and motion-library timelines; verify each has a named purpose and every JavaScript path has cleanup
- Check CSS media queries and JavaScript `matchMedia('(prefers-reduced-motion: reduce)')` handling, including preference changes while the page is open
- Flag `transition: all`, motion as the sole state indicator, focus or reading-order changes, and automatic repeating motion without controls
- Inspect unexpected layout shifts, then profile any intended filter, layout, or size animation on representative hardware

## Common Mistakes

1. Repeating, high-amplitude, or attention-seeking motion that competes with the task
2. Motion whose meaning disappears when animation is removed
3. Unexpected layout shifts or unmeasured layout, size, blur, and filter animation
4. Reduced-motion handling that covers CSS but leaves JavaScript timelines or rendering loops active
5. Motion that moves focus, changes reading order, or delays the usable final state
6. Inconsistent motion patterns for the same component or meaning

## Edge Cases

- Loading indicators are functional; keep them bounded, expose progress text when needed, and provide a calm reduced-motion state
- Marketing and brand motion may be more expressive than task UI when it remains subordinate, non-blocking, and reducible
- Direct-manipulation physics may use restrained overshoot; remove it from the reduced-motion branch

## Related

DES-ICON-01, DES-STAT-01, DES-BRND-01
