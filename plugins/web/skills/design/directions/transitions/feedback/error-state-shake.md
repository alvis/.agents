# Error state shake

## Implement

1. Keep native field constraints and disable native validation UI only when the owning runtime supplies complete submission feedback. Connect the input to persistent guidance and add the error ID to `aria-describedby` only while invalid; use `aria-invalid` and the visible alert as the authoritative invalid state.
2. Put the finite shake on a field wrapper so the input, border, and focus ring move together. The message and red border must remain after the shake because displacement is only an attention cue.
3. Synchronize invalid attributes and visible text before replaying motion. Reset `data-shaking`, let the browser render that reset, then set it true and clear it after the computed shared duration; replace any pending reset before replaying.
4. Import the [shared motion asset](assets/transitions/motion.css) once and add the recipe keyframes beside it. If reduced motion becomes active during a shake, cancel the pending reset and displacement without clearing the error.
5. Focus the first invalid input after submission and clear the error only when validity passes.

## Runtime requirements

The embedded HTML shows the valid baseline and state selectors; native constraints alone do not synchronize its custom alert or shake. On invalid submission, the owning runtime must prevent submission, set the wrapper's `data-invalid="true"`, set `aria-invalid="true"`, add the error ID to `aria-describedby`, expose the alert, then replay `data-shaking` and focus the input. On recovery, it must cancel a pending shake, restore the valid attributes, hide the alert, and keep the guidance description. A live reduced-motion change or teardown must cancel the pending reset and remove displacement without clearing an active error; teardown must also remove every form, input, and preference listener.

## Verify

Submit empty and partial addresses repeatedly, then enter a valid address. The alert, `aria-invalid`, descriptions, border, focus, and status must agree after every step. Toggle reduced motion during a shake and confirm displacement stops while recovery guidance remains. After teardown, pending resets and stale validation events must not update the view.

## State markup and Tailwind styling

```html
<section class="flex min-h-72 items-center justify-center rounded-3xl border border-neutral-200 bg-white p-6 text-neutral-950">
  <form class="w-full max-w-sm space-y-5">
    <div class="space-y-2">
      <label for="feedback-email" class="block text-sm font-medium">Email address</label>
      <div data-invalid="false" data-shaking="false" class="rounded-xl border border-neutral-300 bg-white shadow-sm transition-[border-color,box-shadow] duration-(--motion-duration-fast) ease-motion-enter focus-within:border-neutral-950 focus-within:ring-2 focus-within:ring-neutral-950/10 data-[invalid=true]:border-red-600 data-[invalid=true]:ring-2 data-[invalid=true]:ring-red-600/10 data-[shaking=true]:[animation:feedback-error-shake_var(--motion-duration-normal)_var(--ease-motion-enter)_both] motion-reduce:animate-none motion-reduce:transform-none">
        <input id="feedback-email" required type="email" autocomplete="email" aria-invalid="false" aria-describedby="feedback-email-status" placeholder="you@example.com" class="min-h-12 w-full rounded-xl bg-transparent px-4 text-base outline-none placeholder:text-neutral-400" />
      </div>
      <p id="feedback-email-error" role="alert" aria-hidden="true" class="h-auto text-sm text-red-700 transition-opacity duration-(--motion-duration-fast) aria-[hidden=true]:invisible aria-[hidden=true]:h-0 aria-[hidden=true]:opacity-0 motion-reduce:transition-none">Enter a complete email address, such as you@example.com.</p>
      <p id="feedback-email-status" role="status" aria-live="polite" aria-atomic="true" class="text-sm text-neutral-600">Enter the address that should receive notifications.</p>
    </div>
    <button type="submit" class="min-h-11 w-full rounded-xl bg-neutral-950 px-4 text-sm font-medium text-white transition-[background-color,scale] duration-(--motion-duration-fast) ease-motion-enter hover:bg-neutral-800 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 motion-reduce:transition-none motion-reduce:active:scale-100">Validate email</button>
  </form>
</section>
```

```css
@keyframes feedback-error-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(0.5rem); }
  50% { transform: translateX(-0.5rem); }
  75% { transform: translateX(0.25rem); }
}
```
