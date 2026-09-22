# Notification badge

```html
<section data-demo="notification-badge" class="flex min-h-64 flex-col items-center justify-center gap-8 rounded-3xl border border-neutral-200 bg-white p-8 text-neutral-950">
  <button type="button" data-trigger aria-label="Inbox, 3 unread messages" aria-pressed="true" class="relative grid size-12 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-sm transition-[background-color,border-color,color,box-shadow] duration-(--motion-duration-fast) ease-motion-enter hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950 active:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-6">
      <path stroke-linecap="round" stroke-linejoin="round" d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </svg>
    <span data-badge data-visible="true" aria-hidden="true" class="pointer-events-none absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-xs font-semibold leading-none text-white shadow-sm transition-[opacity,translate,scale,filter] duration-(--motion-duration-normal) ease-motion-spring data-[visible=false]:translate-x-[-0.5rem] data-[visible=false]:translate-y-2 data-[visible=false]:scale-0 data-[visible=false]:opacity-0 data-[visible=false]:blur-[2px] data-[visible=false]:motion-reduce:translate-none data-[visible=false]:motion-reduce:scale-100 motion-reduce:transition-none">
      3
    </span>
  </button>
  <p data-status role="status" aria-live="polite" class="text-sm text-neutral-600">3 unread messages</p>
</section>
```

```js
function mount(root) {
  const controller = new AbortController();
  const trigger = root.querySelector("[data-trigger]");
  const badge = root.querySelector("[data-badge]");
  const status = root.querySelector("[data-status]");
  let visible = true;

  const render = () => {
    badge.dataset.visible = String(visible);
    trigger.setAttribute("aria-pressed", String(visible));
    trigger.setAttribute("aria-label", visible ? "Inbox, 3 unread messages" : "Inbox, no unread messages");
    status.textContent = visible ? "3 unread messages" : "All caught up";
  };

  trigger.addEventListener("click", () => {
    visible = !visible;
    render();
  }, { signal: controller.signal });

  render();

  return () => controller.abort();
}
```
