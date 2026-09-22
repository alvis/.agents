# Icon swap

```html
<section data-demo="icon-swap" class="grid min-h-40 place-items-center rounded-2xl bg-slate-100 p-8 text-slate-950 dark:bg-slate-900 dark:text-white">
  <button type="button" aria-pressed="false" aria-label="Start playback" class="group inline-grid size-12 place-items-center rounded-full bg-white shadow-sm outline-none ring-sky-500/50 hover:bg-slate-50 focus-visible:ring-4 dark:bg-slate-800 dark:hover:bg-slate-700">
    <svg aria-hidden="true" viewBox="0 0 24 24" class="[grid-area:1/1] size-5 fill-current opacity-100 blur-none transition-[opacity,filter,scale] duration-(--motion-duration-normal) ease-in-out group-aria-pressed:scale-25 group-aria-pressed:opacity-0 group-aria-pressed:blur-[2px] motion-reduce:transition-none motion-reduce:group-aria-pressed:scale-100 motion-reduce:group-aria-pressed:blur-none"><path d="M8 5v14l11-7z"/></svg>
    <svg aria-hidden="true" viewBox="0 0 24 24" class="[grid-area:1/1] size-5 scale-25 fill-current opacity-0 blur-[2px] transition-[opacity,filter,scale] duration-(--motion-duration-normal) ease-in-out group-aria-pressed:scale-100 group-aria-pressed:opacity-100 group-aria-pressed:blur-none motion-reduce:scale-100 motion-reduce:blur-none motion-reduce:transition-none"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>
  </button>
</section>
```

```js
function mount(root) {
  const controller = new AbortController();
  const button = root.querySelector("button");

  button.addEventListener("click", () => {
    const isPlaying = button.getAttribute("aria-pressed") === "true";
    button.setAttribute("aria-pressed", String(!isPlaying));
    button.setAttribute("aria-label", isPlaying ? "Start playback" : "Pause playback");
  }, { signal: controller.signal });

  return () => controller.abort();
}
```
