# Skeleton reveal

[Code example](examples/transitions/feedback/skeleton-reveal.md)

Use this pattern when loaded content replaces a shape-matched placeholder in the same grid area. The placeholder is decorative, the container exposes its busy state, and the real content becomes available only when revealed.

Import `assets/transitions/motion.css` once before using this recipe.

Two finite pulse cycles make loading visible without creating an unbounded animation; the one-second replay delay exists only to make that state observable in the demo. Check initial loading and automatic reveal, replay repeatedly to confirm stale timers cannot win, and verify the link is inert while loading. Enable reduced motion during loading and confirm the meaningful content appears immediately; cleanup must cancel the reveal timer and listeners.
