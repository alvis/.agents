# Text and value transitions

Choose this domain when motion belongs to changing text or a numeric value rather than to its surrounding layout. Keep the semantic value stable and animate an `aria-hidden` visual clone when glyphs, words, reels, or duplicated transcripts would otherwise create fragmented announcements.

## Choose a recipe

| Need | Recipe | Mechanism |
| --- | --- | --- |
| Give a short updated value a compact entrance | [Number pop-in](examples/transitions/text/number-pop-in.md) | Rebuilt glyphs enter independently with a short stagger |
| Replace one compact label with another | [Text states swap](examples/transitions/text/text-states-swap.md) | Old text exits before the new state enters in the same footprint |
| Keep an indeterminate status visibly active | [Shimmer text](examples/transitions/text/shimmer-text.md) | A pausable gradient crosses one readable label continuously |
| Introduce a heading and supporting copy in sequence | [Texts reveal](examples/transitions/text/texts-reveal.md) | Semantic lines rise with a bounded stagger and dismiss as one fade |
| Celebrate an integer change | [Spinning counter](examples/transitions/text/spinning-counter.md) | Independent clipped digit reels roll through intermediate cells |
| Preview a continuing log or process | [Reasoning stream](examples/transitions/text/reasoning-stream.md) | A stepped transcript wraps through one visual clone with pause and restart |
| Resolve a complete response word by word | [Streaming text](examples/transitions/text/streaming-text.md) | Word wrappers sharpen in sequence while whitespace preserves wrapping |

Prefer number pop-in for ordinary balances and counters; reserve spinning counter for an infrequent milestone because its reels add more motion and DOM. Use text states swap for replacement, texts reveal for a small group entering together, and streaming text for cumulative prose. Shimmer text and reasoning stream run continuously, so their examples include explicit motion controls.

## Set up

Require Tailwind CSS 4.3 or newer; report an older consumer version instead of changing it silently. Import `assets/transitions/motion.css` after Tailwind CSS once, then copy only the selected recipe’s CSS-first block into a stylesheet Tailwind processes. The shared asset supplies the fast 150ms feedback duration, normal 250ms state duration, slow 400ms spatial duration, and enter, exit, and spring easing tokens.

Insert the recipe’s single `section`, then call its `mount(root)` with that section and retain the returned cleanup function. Mount after insertion so measurement-based reels and streams read real geometry. Call cleanup before removing or remounting the section; every recipe cancels its own timers, animation frames, media-query listeners, clones, and event listeners.

Keep every complete Tailwind class string in the consumer’s scanned source. JavaScript may assign the recipe’s static class strings and dynamic custom-property values, but it must not construct utility names from input. Replace application text with `textContent`, preserve the example’s single semantic live node, and keep visual clones hidden from assistive technology.

## Adapt safely

Tune frequency before amplitude. A frequently changing label should use the fast state swap; a one-off reveal may use the slow duration and a short 40ms line or column stagger. Cap the number of staged items or shorten the stagger when total delay would make the final item feel late. Do not add a layout transition to text whose wrapping or intrinsic size changes; let the text reflow and animate only opacity, filter, or a small transform.

Connect the examples to the application’s real state producer. Demo inputs and replay buttons show the behavior boundary; production code should call the same rendering function from a completed save, received stream chunk, or validated value update. Preserve the latest-state cancellation pattern when replacing the controls.

## Acceptance

- Initial, action, and final states remain understandable without animation, and reduced motion shows the intended final state immediately even when the preference changes mid-run.
- Rapid replay, reversal, or replacement cannot let a stale timeout overwrite the latest value; cleanup leaves no timer, animation frame, observer, media-query handler, or visual clone behind.
- A changing value or response is announced once as a complete unit. Digit, word, reel, and duplicate-transcript layers are `aria-hidden`, and continuous motion has a keyboard-accessible pause or stop control.
- Every interactive control has a visible focus indicator, a descriptive label, and at least a 44px target. Hidden content uses `hidden` when it should leave layout and the accessibility tree.
- Text insertion uses `textContent`; user-entered strings never become markup. Static Tailwind classes compile under Tailwind 4.3 or newer, and the selected example owns no dependency beyond the shared motion asset.
- Responsive wrapping works at 320px without horizontal scrolling, final text remains readable in light and dark themes, and motion does not shift surrounding layout.
