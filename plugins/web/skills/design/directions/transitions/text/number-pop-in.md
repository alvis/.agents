# Number pop-in

Use this recipe for a price, balance, score, or other short value whose change deserves a compact entrance. Each glyph enters independently; choose [spinning counter](directions/transitions/text/spinning-counter.md) when the digits must visibly roll through intermediate values.

Import `assets/transitions/motion.css` after Tailwind CSS in a Tailwind 4.3 or newer stylesheet, then use the complete [code example](examples/transitions/text/number-pop-in.md), including its recipe CSS. The 12-character input cap keeps the final stagger at or below 440ms and the full entrance below one second. The JavaScript rebuilds only the visual clone; the `output` remains the single semantic value announced to assistive technology.

## Checks

- Initial: `$1,249.30` is visible and available as one semantic value; no entrance runs during mount.
- Action: entering a value and choosing **Show value** rebuilds one visual glyph per character and staggers their entrance.
- Final: every glyph rests sharp at its baseline and the live `output` announces the complete value once.
- Replay and cleanup: rapid clicks replace the previous glyphs without timers; cleanup removes both listeners and restores plain visual text.
- Reduced motion: changing the live preference during a replay removes the animation immediately and preserves the final value.
- Accessibility: the visual glyph group is hidden from assistive technology, the named button has a 44px target and visible focus, and typed content reaches the DOM through `textContent`.
