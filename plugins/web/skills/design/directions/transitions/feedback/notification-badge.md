# Notification badge

## Implement

1. Reserve the badge inside a relatively positioned trigger so adding or removing the count never changes the trigger's size or position.
2. Keep the visual badge decorative with `aria-hidden="true"`. Update the visible count, `data-visible`, trigger `aria-label`, and polite status text from one authoritative unread count so they cannot diverge.
3. Import the [shared motion asset](assets/transitions/motion.css) once. Keep the Tailwind `data-*` variants and `motion-reduce` utilities so the badge changes immediately without travel, scale, or blur while the same unread state remains visible and announced.
4. Preserve the trigger's real action, keyboard behavior, focus styling, and stable accessible name. Unread count is application data; do not model it as a pressed state.

## Runtime requirements

The embedded HTML demonstrates the visible state and Tailwind selectors; it does not subscribe to unread data by itself. The owning runtime must derive count and visibility from the real unread value, commit the badge text and semantic attributes in one update, and replace an in-progress transition when newer unread data arrives. The trigger continues to perform its ordinary Inbox action. On teardown or data-source replacement, unsubscribe and cancel transition bookkeeping so stale unread updates cannot reach the view.

## Verify

Apply rapid unread-count changes, including zero and a multi-digit count, and confirm the badge never shifts the trigger, the label and live text describe the same state, and reduced motion preserves every outcome without movement. After teardown or data-source replacement, stale unread events must not update the view.

## State markup and Tailwind styling

```html
<section class="flex min-h-64 flex-col items-center justify-center gap-8 rounded-3xl border border-neutral-200 bg-white p-8 text-neutral-950">
  <a href="#inbox" aria-label="Inbox, 3 unread messages" class="relative grid size-12 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-sm transition-[background-color,border-color,color,box-shadow] duration-(--motion-duration-fast) ease-motion-enter hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950 active:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-6">
      <path stroke-linecap="round" stroke-linejoin="round" d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </svg>
    <span data-visible="true" aria-hidden="true" class="pointer-events-none absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-xs font-semibold leading-none text-white shadow-sm transition-[opacity,translate,scale,filter] duration-(--motion-duration-normal) ease-motion-spring data-[visible=false]:translate-x-[-0.5rem] data-[visible=false]:translate-y-2 data-[visible=false]:scale-0 data-[visible=false]:opacity-0 data-[visible=false]:blur-[2px] data-[visible=false]:motion-reduce:translate-none data-[visible=false]:motion-reduce:scale-100 motion-reduce:transition-none">
      3
    </span>
  </a>
  <p role="status" aria-live="polite" aria-atomic="true" class="text-sm text-neutral-600">3 unread messages</p>
</section>
```
