# Reasoning stream

Use this recipe for a compact, continuously moving preview of process activity, logs, or generated steps. It advances by two lines and wraps through one visual clone, preserving the rhythm of a reel rather than scrolling one pixel at a time.

Import `assets/transitions/motion.css` after Tailwind CSS in a Tailwind 4.3 or newer stylesheet, then use the complete [code example](examples/transitions/text/reasoning-stream.md), including its recipe CSS. The 840ms hold gives each two-line step time to be read before the 250ms state transition. Keep both pause and restart controls because the motion persists until its parent task ends.

## Checks

- Initial: one transcript copy is visible in the masked viewport; mount adds exactly one matching clone below it and waits 840ms.
- Action: every step moves up by two 24px lines over the normal 250ms motion duration; the clone fills the viewport while the offset wraps.
- Final: **Pause activity** holds the current offset, **Resume activity** continues it and **Restart activity** returns to the first line.
- Replay and cleanup: restart clears both pending timers before resetting; cleanup clears them, removes the clone and restores the first line.
- Reduced motion: enabling the live preference stops both timers, resets to the meaningful first state and disables motion controls; disabling it resumes unless the user paused.
- Accessibility: the viewport and visual clone are hidden from assistive technology, the complete transcript exists once as semantic text, and the controls expose names, pressed state, focus and 44px targets.
