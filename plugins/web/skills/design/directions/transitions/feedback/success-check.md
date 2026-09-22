# Success check

[Code example](examples/transitions/feedback/success-check.md)

Use this pattern after a completed action that deserves a clear, persistent confirmation. The text carries the status; the check is decorative reinforcement.

Import `assets/transitions/motion.css` once before using this recipe.

Check the visible success state, replay it repeatedly, and confirm each replay starts from the hidden baseline without stacking frames. Turn reduced motion on during a replay and confirm the check and status settle immediately; after cleanup, replay must stop responding.
