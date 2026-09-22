# Streaming text

Use this recipe when a complete response should resolve word by word without imitating keystrokes. Each word is wrapped once and sharpens into place while normal whitespace remains outside the wrappers, so the paragraph reflows naturally at every viewport width.

Import `assets/transitions/motion.css` after Tailwind CSS in a Tailwind 4.3 or newer stylesheet, then use the complete [code example](examples/transitions/text/streaming-text.md), including its recipe CSS. The 240-character cap keeps the demo bounded, while **Show complete response** lets a user end any long sequence immediately. The complete response updates one live semantic node before the visual sequence begins, preventing a separate announcement for every word.

## Checks

- Initial: the complete first paragraph is visible and available as one semantic response; mount wraps words without replaying them.
- Action: **Stream response** replaces the visual paragraph safely, then resolves one word every 60ms through opacity and a 1px blur.
- Final: all word wrappers remain visible while spaces and line breaks preserve natural responsive wrapping; **Show complete response** stops a long sequence and reveals the remainder.
- Replay and cleanup: a new stream cancels the earlier frame and timer before rebuilding; cleanup cancels the sequence and leaves the complete response visible.
- Reduced motion: enabling the live preference mid-stream reveals every remaining word immediately; later streams render complete text in one step.
- Accessibility: the word wrappers are one `aria-hidden` visual clone, the live paragraph announces the complete response once, and textarea content reaches the DOM through `textContent`.
