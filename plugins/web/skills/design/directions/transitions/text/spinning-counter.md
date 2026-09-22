# Spinning counter

Use this recipe when a score, total, or milestone should roll through digits before landing. Every numeric column is an independent clipped reel; choose [number pop-in](directions/transitions/text/number-pop-in.md) for a quieter update that enters only the final glyphs.

Import `assets/transitions/motion.css` after Tailwind CSS in a Tailwind 4.3 or newer stylesheet, then use the complete [code example](examples/transitions/text/spinning-counter.md), including its recipe CSS. The six-digit input cap bounds the visual clone at 240 reel cells and the final column delay at 200ms; format currencies or decimals outside this ceremonial pattern.

## Checks

- Initial: `128` is visible as plain tabular text and exposed as one semantic value; mount does not spin it.
- Action: **Spin counter** creates one clipped four-cycle reel per digit, staggers columns by 40ms and lands on the sanitized target.
- Final: the reels collapse back to plain text and the live `output` announces the complete number once.
- Replay and cleanup: rapid spins cancel queued frames and the settle timer before building the latest reels; cleanup cancels the same work and restores static text.
- Reduced motion: enabling the live preference during a spin immediately replaces every reel with its intended final digit.
- Accessibility: all intermediate digits sit inside one `aria-hidden` visual clone, the named button has a 44px target and visible focus, and only digits accepted by the bounded input reach the counter.
