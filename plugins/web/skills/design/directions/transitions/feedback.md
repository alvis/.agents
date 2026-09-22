# Feedback transitions

Use feedback motion to clarify a state change after the user or system acts. Import `assets/transitions/motion.css` once, require Tailwind CSS 4.3 or later, then load only the selected recipe.

## Choose a recipe

| Need | Recipe | State contract |
| --- | --- | --- |
| Add or remove an unread count without moving its trigger | [Notification badge](examples/transitions/feedback/notification-badge.md) | A pressed trigger updates a visible count and live text together. |
| Confirm a completed action with a durable status | [Success check](examples/transitions/feedback/success-check.md) | Replay resets one keyframe run; status text remains authoritative. |
| Reinforce an invalid field without hiding recovery guidance | [Error state shake](examples/transitions/feedback/error-state-shake.md) | `aria-invalid`, persistent error text, and a replayable finite shake stay synchronized. |
| Replace a shape-matched placeholder with loaded content | [Skeleton reveal](examples/transitions/feedback/skeleton-reveal.md) | `aria-busy`, `inert`, and layer visibility change as one state. |
| Announce a transient, non-blocking result | [Toast](examples/transitions/feedback/toast.md) | Reopening replaces the dismissal timer; pointer and keyboard interaction pause it. |
| Narrate real stages of a long-running task | [Thinking states](examples/transitions/feedback/thinking-states.md) | Live text cycles at a restrained rate with pause and live reduced-motion handling. |
| Add a compact decorative loader beside status text | [Matrix loader](examples/transitions/feedback/matrix-loader.md) | One dot grid accepts four delay maps, a pause control, and a static reduced-motion state. |

## Setup differences

Notification badge and toast need only the shared motion asset and their HTML/JavaScript fences. Success check, error shake, thinking states, and matrix loader also need their recipe-local keyframes. Skeleton reveal uses Tailwind's pulse animation and shared transition tokens. Keep every `mount(root)` scoped to the provided section and retain its returned cleanup function for unmounting.

Choose finite feedback for completed actions and persistent motion only for work that is still active. Preserve the semantic result when animation is disabled: status text, validation guidance, loaded content, and busy state must never depend on transform, opacity, or a generated visual clone.

## Acceptance

- Compile the selected fences with Tailwind CSS 4.3 or later and verify every utility is statically discoverable.
- Exercise initial, action, interrupted, repeated, and final states; rapid replay must not leave stale timers, frames, or attributes.
- Toggle `prefers-reduced-motion` while motion is active and confirm the meaningful state settles immediately or remains available without movement.
- Verify status, alert, busy, invalid, live-region, focus, and inert semantics with animation both enabled and disabled.
- Confirm cleanup aborts listeners and cancels every owned timer or animation frame.
- For thinking states and matrix loader, verify the visible pause control stops persistent animation and automatic state changes before focus leaves the control.
