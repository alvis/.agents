# Thinking states

[Code example](examples/transitions/feedback/thinking-states.md)

Use this pattern when a long-running process can name a few meaningful stages. A changing label is useful only when each label reflects real work; use a single static loading message when the system has no stage information.

Import `assets/transitions/motion.css` once before using this recipe.

The two-second hold keeps the narration informative without turning live-region updates into chatter. Let all three states cycle, pause and resume during both a hold and a swap, and enable reduced motion mid-swap; the current text must settle, remain readable, and stop changing. Cleanup must cancel both timers, the frame, and listeners.
