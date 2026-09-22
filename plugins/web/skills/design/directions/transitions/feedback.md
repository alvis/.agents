# Feedback transitions

Implement feedback motion as a semantic state change, then use animation only to clarify what changed.

## Choose one recipe

1. Identify the authoritative state, its trigger, its terminal or persistent behavior, and the text assistive technology must receive.
2. Choose the smallest recipe below. Load only that task guide, then adapt its ordered steps and embedded code to the existing component.
3. Import the [shared motion asset](assets/transitions/motion.css) once. Merge only the selected recipe's local CSS, and retain its `mount(root)` cleanup when translating it to a framework.

| State change | Task guide | Preserve |
| --- | --- | --- |
| Add or remove an unread count over a stable trigger | [Notification badge](directions/transitions/feedback/notification-badge.md) | Visible count, trigger label, pressed state, and live text update together. |
| Confirm a completed action with a durable result | [Success check](directions/transitions/feedback/success-check.md) | Status text stays authoritative while one finite graphic replays. |
| Reinforce an invalid field and its recovery guidance | [Error state shake](directions/transitions/feedback/error-state-shake.md) | Invalid semantics and the message persist after displacement stops. |
| Replace a shape-matched placeholder with loaded content | [Skeleton reveal](directions/transitions/feedback/skeleton-reveal.md) | Busy, inert, hidden, and visible states change atomically. |
| Announce a transient non-blocking result | [Toast](directions/transitions/feedback/toast.md) | Reopening replaces dismissal; pointer and focus pause remaining time. |
| Report real stages of a long-running task | [Thinking states](directions/transitions/feedback/thinking-states.md) | Live updates remain restrained and automatic motion has a pause control. |
| Show compact decorative progress beside status text | [Matrix loader](directions/transitions/feedback/matrix-loader.md) | Status carries meaning; variants reuse one dot grid and expose pause. |

## Adapt the state contract

1. Preserve existing semantic elements and framework state ownership. Treat example `data-*` attributes as a portable view of real state, not a second source of truth.
2. Keep every status, alert, busy, invalid, hidden, inert, and focus update in the same transaction as its visible state. Decorative graphics stay hidden from assistive technology.
3. Replace or cancel every owned timer and animation frame before replay. Retain cleanup and call it before unmount, replacement, remount, or hot reload.
4. Implement the recipe's reduced-motion state in every CSS and JavaScript path it uses. A live preference change must settle to meaningful content or a controlled static state immediately.
5. Keep completed feedback finite. Persistent motion is allowed only while work remains active and must provide the recipe's visible pause control.

## Test the adaptation

Compile the selected fences with the consumer's proven Tailwind CSS 4.3 or later. Exercise initial, action, interrupted, repeated, and final states; rapid replay must not leave stale timers, frames, attributes, or focus. Toggle `prefers-reduced-motion` while active, verify live-region output and keyboard interaction, then run cleanup and confirm all owned asynchronous work and listeners stop. A semantic synchronization, live preference, pause, or cleanup failure means the adaptation is incomplete.
