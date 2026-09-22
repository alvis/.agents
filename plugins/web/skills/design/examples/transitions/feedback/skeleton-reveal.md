# Skeleton reveal

```html
<section data-demo="skeleton-reveal" data-state="loading" aria-busy="true" class="group mx-auto flex min-h-72 max-w-lg flex-col justify-center gap-6 rounded-3xl border border-neutral-200 bg-white p-6 text-neutral-950">
  <div class="grid rounded-2xl border border-neutral-200 p-5 shadow-sm [&>*]:[grid-area:1/1]">
    <div data-skeleton aria-hidden="true" class="space-y-4 opacity-100 transition-[opacity,filter] duration-(--motion-duration-slow) ease-motion-enter group-data-[state=revealed]:pointer-events-none group-data-[state=revealed]:opacity-0 group-data-[state=revealed]:blur-[2px] motion-reduce:animate-none motion-reduce:transition-none">
      <div class="size-12 animate-pulse rounded-full bg-neutral-200 [animation-duration:var(--motion-duration-slow)] [animation-iteration-count:2] group-data-[state=revealed]:animate-none motion-reduce:animate-none"></div>
      <div class="space-y-2">
        <div class="h-4 w-2/3 animate-pulse rounded bg-neutral-200 [animation-duration:var(--motion-duration-slow)] [animation-iteration-count:2] group-data-[state=revealed]:animate-none motion-reduce:animate-none"></div>
        <div class="h-3 w-full animate-pulse rounded bg-neutral-100 [animation-duration:var(--motion-duration-slow)] [animation-iteration-count:2] group-data-[state=revealed]:animate-none motion-reduce:animate-none"></div>
        <div class="h-3 w-5/6 animate-pulse rounded bg-neutral-100 [animation-duration:var(--motion-duration-slow)] [animation-iteration-count:2] group-data-[state=revealed]:animate-none motion-reduce:animate-none"></div>
      </div>
    </div>
    <article data-content aria-hidden="true" inert class="pointer-events-none space-y-3 opacity-0 blur-[2px] transition-[opacity,filter] duration-(--motion-duration-slow) ease-motion-enter group-data-[state=revealed]:pointer-events-auto group-data-[state=revealed]:opacity-100 group-data-[state=revealed]:blur-none motion-reduce:transition-none">
      <div class="grid size-12 place-items-center rounded-full bg-violet-100 font-semibold text-violet-800">AL</div>
      <h2 class="text-lg font-semibold">Ada Lovelace</h2>
      <p class="text-sm leading-6 text-neutral-600">Analytical engine notes are ready for review.</p>
      <a href="#review-notes" class="inline-flex min-h-11 items-center rounded-full px-1 text-sm font-medium text-violet-700 underline decoration-violet-300 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">Review notes</a>
    </article>
  </div>
  <div class="flex flex-wrap gap-3">
    <button type="button" data-reveal class="min-h-11 rounded-full bg-neutral-950 px-5 text-sm font-medium text-white transition-colors duration-(--motion-duration-fast) hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">Reveal content</button>
    <button type="button" data-replay class="min-h-11 rounded-full border border-neutral-300 bg-white px-5 text-sm font-medium transition-colors duration-(--motion-duration-fast) hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">Replay loading</button>
  </div>
</section>
```

```js
function mount(root) {
  const controller = new AbortController();
  const revealButton = root.querySelector("[data-reveal]");
  const replayButton = root.querySelector("[data-replay]");
  const content = root.querySelector("[data-content]");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let revealTimer = 0;

  const reveal = () => {
    clearTimeout(revealTimer);
    root.dataset.state = "revealed";
    root.setAttribute("aria-busy", "false");
    content.removeAttribute("inert");
    content.setAttribute("aria-hidden", "false");
  };

  const replay = () => {
    clearTimeout(revealTimer);
    root.dataset.state = "loading";
    root.setAttribute("aria-busy", "true");
    content.setAttribute("inert", "");
    content.setAttribute("aria-hidden", "true");
    if (motion.matches) {
      reveal();
      return;
    }
    revealTimer = setTimeout(reveal, 1000);
  };

  revealButton.addEventListener("click", reveal, { signal: controller.signal });
  replayButton.addEventListener("click", replay, { signal: controller.signal });
  motion.addEventListener("change", () => {
    if (motion.matches) reveal();
  }, { signal: controller.signal });
  replay();

  return () => {
    reveal();
    controller.abort();
  };
}
```
