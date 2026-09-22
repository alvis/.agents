# Error state shake

[Code example](examples/transitions/feedback/error-state-shake.md)

Use this pattern to draw attention to a validation error after submission. Keep the message visible until the field is valid; the shake is a brief supplement, never the only error cue.

Import `assets/transitions/motion.css` once before using this recipe.

The four evenly spaced beats give two full-distance swings and a half-distance settling leg within the shared normal duration. Submit an empty or partial address several times, verify that the message persists while each shake replays cleanly, then type a valid address and confirm the error clears. Enable reduced motion during a shake and confirm the red border and message remain while displacement stops; cleanup must cancel the pending shake reset and every listener.
