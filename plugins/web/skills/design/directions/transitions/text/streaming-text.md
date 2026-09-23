# Streaming text

Implement this when a complete response should resolve word by word while preserving normal wrapping. Do not imitate keystrokes or announce each token.

## Implement and adapt

1. Keep the complete response in one polite live node and the animated paragraph in one `aria-hidden` clone. Update the live node once before visual sequencing. For a real network stream, buffer content and announce meaningful complete updates instead of every token.
2. Preserve whitespace as text nodes between word wrappers so spaces and line breaks wrap naturally. Use a tested language-aware segmenter when the product requires linguistic word boundaries; a whitespace split is only a visual grouping rule.
3. Copy the Tailwind CSS 4.3 utility after [the shared motion tokens](assets/transitions/motion.css). Bound production wrapper count from `--stream-gap` and the acceptable total delay; the 240-character input cap bounds this demonstration but does not define a safe wrapper count for every language.
4. Before each stream, invalidate the old sequence, cancel its scheduled gap and start frame, rebuild the clone with `data-visible="false"`, and begin after the new nodes have painted. “Show complete response” cancels queued work before marking every wrapper visible.
5. When reduced motion becomes active, reveal the complete current response immediately; later responses render complete. On cleanup, cancel scheduled work, unsubscribe from preference changes, and leave complete text visible.

## Markup and Tailwind CSS

```html
<section class="grid max-w-xl gap-6 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-950 shadow-sm [--stream-gap:60ms] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
  <div class="grid gap-2">
    <span class="text-sm font-medium text-zinc-600 dark:text-zinc-400">Response preview</span>
    <p id="response-announcement" aria-live="polite" class="sr-only">A clear transition keeps the response readable while each new word settles into place.</p>
    <p id="response-visual" aria-hidden="true" class="min-h-24 whitespace-pre-wrap text-lg leading-8">A clear transition keeps the response readable while each new word settles into place.</p>
  </div>
  <label class="grid gap-2 text-sm font-medium" for="response-text">
    Response text
    <textarea id="response-text" maxlength="240" rows="3" class="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base leading-6 text-zinc-950 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus-visible:ring-offset-zinc-950">Motion can clarify what just changed without interrupting the reader or delaying the final answer.</textarea>
  </label>
  <div class="flex flex-wrap gap-3">
    <button type="button" aria-controls="response-announcement response-visual" class="min-h-11 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 active:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950">Stream response</button>
    <button type="button" aria-controls="response-visual" disabled class="min-h-11 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 dark:focus-visible:ring-offset-zinc-950">Show complete response</button>
  </div>
</section>
```

The runtime preserves whitespace outside wrappers and uses this state on each word.

```html
<span class="streaming-word" data-visible="false">Motion</span> <span class="streaming-word" data-visible="false">can</span>
```

```css
@utility streaming-word {
  display: inline;
  opacity: 0;
  filter: blur(1px);
  transition-property: opacity, filter;
  transition-duration: var(--motion-duration-slow);
  transition-timing-function: var(--ease-motion-enter);

  &[data-visible="true"] {
    opacity: 1;
    filter: blur(0);
  }

  @media (prefers-reduced-motion: reduce) {
    opacity: 1;
    filter: none;
    transition: none;
  }
}
```

## Runtime behavior

The application must create wrappers with text operations, retain whitespace as sibling text nodes, and keep one current sequence identity. Starting a response first cancels the prior start frame and gap, updates the hidden live node once with the complete response, rebuilds the ignored visual clone, and then reveals one wrapper per computed `--stream-gap`. Every scheduled reveal checks the current identity. The completion control is enabled only while hidden wrappers remain and must cancel the sequence before revealing all of them. Reduced motion, replacement, and teardown must settle the current response synchronously and prevent stale wrappers from changing later.

## Verify

Test spaces, newlines, non-Latin text, empty fallback, 320px wrapping, one live announcement, configured timing, completion during a sequence, rapid replay, reduced motion mid-stream, and cleanup/remount without stale reveals.
