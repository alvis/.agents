# Checkbox check

## Implement and adapt

1. Keep the native checkbox inside its text label. Its `checked` state remains the only state owner, so form submission, reset, validation, accessible naming, label clicks, and Space activation work without scripting.
2. Place the custom box and check SVG after the visually hidden input. Drive border, fill, focus-ring, and stroke styles from the input's peer state; keep the visual box and SVG `aria-hidden` so they do not duplicate the control.
3. Normalize the check path with `pathLength="1"`, set dash array and offset to `1`, and transition the offset to `0` after checked state changes. The shorter box-color duration establishes the state before the longer stroke draw. Adapt the path freely while preserving the normalized length contract.
4. Preserve native keyboard focus on the input and render focus through the surrounding visual box. Do not add click or key handlers, positive tabindex, or ARIA checked state; those would split ownership from the native control.
5. Keep explicit transition-property lists and every reduced-motion class. A live preference change removes interpolation while the checked fill and complete path still reflect the current native state. This recipe has no runtime state, scheduled work, or cleanup.

## Verify

Toggle by clicking the label and by focusing the checkbox and pressing Space; uncheck during the stroke draw and confirm it reverses from the current offset. Submit and reset a containing form, inspect the accessibility tree for one named checkbox, change reduced motion during the draw, and confirm checked state remains visible without animation.

```html
<section class="grid min-h-40 place-items-center rounded-2xl bg-slate-100 p-8 text-slate-950 dark:bg-slate-900 dark:text-white">
  <label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg p-2">
    <input type="checkbox" class="peer sr-only"/>
    <span aria-hidden="true" class="grid size-6 place-items-center rounded-md border border-slate-400 bg-white transition-[background-color,border-color,box-shadow] duration-(--motion-duration-fast) ease-motion-enter peer-checked:border-sky-600 peer-checked:bg-sky-600 peer-focus-visible:ring-4 peer-focus-visible:ring-sky-500/40 peer-checked:[&>svg>path]:[stroke-dashoffset:0] motion-reduce:transition-none dark:bg-slate-800">
      <svg viewBox="0 0 16 16" class="size-4 overflow-visible fill-none stroke-white" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
        <path d="M2.5 8.5 6.25 12 13.5 3.5" pathLength="1" class="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] duration-(--motion-duration-normal) ease-motion-enter motion-reduce:transition-none"/>
      </svg>
    </span>
    <span class="font-medium">Include archived projects</span>
  </label>
</section>
```
