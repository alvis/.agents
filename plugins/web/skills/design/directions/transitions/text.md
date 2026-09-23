# Text and value transitions

Apply this domain when text changes over time. Start with the [shared transition workflow](directions/transition.md): prove Tailwind CSS 4.3 or newer compatibility, capture initial and final states, and merge the [shared motion tokens](assets/transitions/motion.css) once after Tailwind's import.

## Select one recipe

Choose the smallest mechanism that explains the state change, then open only its task guide.

| Required behavior | Task guide | Preserve |
| --- | --- | --- |
| Introduce a short price, balance, or score | [Number pop-in](directions/transitions/text/number-pop-in.md) | One semantic value plus an `aria-hidden` glyph clone |
| Replace a compact label in place | [Text states swap](directions/transitions/text/text-states-swap.md) | Latest-state cancellation across exit and entrance |
| Show an indeterminate status continuously | [Shimmer text](directions/transitions/text/shimmer-text.md) | Readable base text, pause control, and solid reduced-motion state |
| Stage a heading and supporting copy | [Texts reveal](directions/transitions/text/texts-reveal.md) | Semantic lines, bounded stagger, and native `hidden` dismissal |
| Celebrate a short ASCII integer | [Spinning counter](directions/transitions/text/spinning-counter.md) | Measured reel geometry, bounded cells, and one announced result |
| Preview a continuing log or process | [Reasoning stream](directions/transitions/text/reasoning-stream.md) | Fixed line geometry, one visual clone, pause, restart, and static fallback |
| Resolve a complete response word by word | [Streaming text](directions/transitions/text/streaming-text.md) | Whitespace-preserving wrappers and one complete live announcement |

Prefer the quieter recipe when several fit: use number pop-in instead of spinning reels for routine values, text states swap instead of a staged reveal for frequent labels, and streaming text only when prose accumulates rather than replacing one state.

## Adapt the selected recipe

1. Keep application state as the source of truth. Bind the recipe to the real save, response, or validated-value event. The HTML is a state template; it does not provide the runtime behavior described by the guide.
2. Preserve one semantic representation of the animated content, including real heading and paragraph lines or a separate status where specified. Put only duplicated glyphs, words, reels, and transcript copies in an `aria-hidden` visual layer. Announce a completed value or meaningful status once through `output`, `role="status"`, or a deliberate `aria-live` node; never make every animated fragment live.
3. Insert untrusted or user-entered strings as text. Treat visible characters as grapheme clusters when animation targets arbitrary Unicode; use a standards-based segmenter or the consumer's grapheme utility instead of splitting combined marks or emoji. Recipes restricted to ASCII digits state that boundary explicitly.
4. Keep Tailwind classes literal and copy each `@utility` block into CSS processed by Tailwind CSS 4.3 or newer after the shared tokens. Map compatible project tokens and render the markup before measuring live geometry.
5. Preserve the recipe's timing model. Prefer `animationend` or `transitionend` for settlement; when a sequence needs scheduled gaps, derive them from the same CSS custom properties and calculate the last stagger from the actual item count. Retain each stated cap because it bounds DOM size or total delay.
6. Make every interruption latest-state safe. Record the intended final value, invalidate older completion work, and cancel scheduled frames, timeouts, and event subscriptions before replacement or unmount. Cleanup must leave complete, usable content rather than an intermediate visual state.
7. Implement reduced motion as a live state: commit the pending label or value, reveal the complete response, or stop a persistent preview at its useful static position. CSS supplies the visual fallback; stateful recipes also require the application to react when the preference changes during motion.

## Test the integrated transition

Exercise the initial state, trigger, settled state, rapid replay or replacement, and cleanup/remount path. Toggle reduced motion while the transition is active and confirm the current intended final state appears without stale work. Verify keyboard controls and focus, one screen-reader announcement per meaningful update, Unicode and whitespace handling, 320px wrapping without horizontal scroll, light and dark readability, the recipe's item or character bound, measured timing, and an empty console. Inspect the rendered consumer; source review alone does not prove the transition works.
