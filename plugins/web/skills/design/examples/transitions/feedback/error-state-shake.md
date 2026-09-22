# Error state shake

```html
<section data-demo="error-state-shake" class="flex min-h-72 items-center justify-center rounded-3xl border border-neutral-200 bg-white p-6 text-neutral-950">
  <form data-form novalidate class="w-full max-w-sm space-y-5">
    <div class="space-y-2">
      <label for="feedback-email" class="block text-sm font-medium">Email address</label>
      <div data-field data-invalid="false" data-shaking="false" class="rounded-xl border border-neutral-300 bg-white shadow-sm transition-[border-color,box-shadow] duration-(--motion-duration-fast) ease-motion-enter focus-within:border-neutral-950 focus-within:ring-2 focus-within:ring-neutral-950/10 data-[invalid=true]:border-red-600 data-[invalid=true]:ring-2 data-[invalid=true]:ring-red-600/10 data-[shaking=true]:[animation:feedback-error-shake_var(--motion-duration-normal)_var(--ease-motion-enter)_both] motion-reduce:animate-none motion-reduce:transform-none">
        <input id="feedback-email" data-input required type="email" autocomplete="email" aria-invalid="false" aria-describedby="feedback-email-error feedback-email-status" placeholder="you@example.com" class="min-h-12 w-full rounded-xl bg-transparent px-4 text-base outline-none placeholder:text-neutral-400" />
      </div>
      <p id="feedback-email-error" data-error role="alert" aria-hidden="true" data-visible="false" class="h-auto text-sm text-red-700 transition-opacity duration-(--motion-duration-fast) data-[visible=false]:invisible data-[visible=false]:h-0 data-[visible=false]:opacity-0 motion-reduce:transition-none">Enter a complete email address, such as you@example.com.</p>
      <p id="feedback-email-status" data-status role="status" aria-live="polite" class="text-sm text-neutral-600">Enter the address that should receive notifications.</p>
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

```js
function mount(root) {
  const controller = new AbortController();
  const form = root.querySelector("[data-form]");
  const field = root.querySelector("[data-field]");
  const input = root.querySelector("[data-input]");
  const error = root.querySelector("[data-error]");
  const status = root.querySelector("[data-status]");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let shakeTimer = 0;

  const readShakeDuration = () => {
    const value = getComputedStyle(root).getPropertyValue("--motion-duration-normal").trim();
    const amount = Number.parseFloat(value);
    if (!Number.isFinite(amount)) return 250;
    if (value.endsWith("ms")) return amount;
    if (value.endsWith("s")) return amount * 1000;
    return 250;
  };

  const stopShake = () => {
    clearTimeout(shakeTimer);
    field.dataset.shaking = "false";
  };

  const clearError = () => {
    stopShake();
    field.dataset.invalid = "false";
    input.setAttribute("aria-invalid", "false");
    error.dataset.visible = "false";
    error.setAttribute("aria-hidden", "true");
  };

  const showError = () => {
    clearTimeout(shakeTimer);
    field.dataset.invalid = "true";
    input.setAttribute("aria-invalid", "true");
    error.dataset.visible = "true";
    error.setAttribute("aria-hidden", "false");
    status.textContent = "";
    field.dataset.shaking = "false";
    if (motion.matches) return;
    void field.offsetWidth;
    field.dataset.shaking = "true";
    shakeTimer = setTimeout(stopShake, readShakeDuration());
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!input.validity.valid) {
      showError();
      input.focus();
      return;
    }
    clearError();
    status.textContent = "Email address is ready to use.";
  }, { signal: controller.signal });

  input.addEventListener("input", () => {
    if (!input.validity.valid) {
      status.textContent = "";
      return;
    }
    clearError();
    status.textContent = "Email address is ready to use.";
  }, { signal: controller.signal });

  motion.addEventListener("change", () => {
    if (motion.matches) stopShake();
  }, { signal: controller.signal });

  return () => {
    stopShake();
    controller.abort();
  };
}
```
