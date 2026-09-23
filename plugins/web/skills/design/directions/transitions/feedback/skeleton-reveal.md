# Skeleton reveal

## Implement

1. Place the shape-matched skeleton and real content in the same grid area so the reveal does not change layout. Keep the skeleton decorative and make real content `inert`, `aria-hidden="true"`, and pointer-inaccessible while loading.
2. Treat `data-state`, `aria-busy`, `inert`, and `aria-hidden` as one transaction. A reveal must cancel an obsolete delay before exposing content; a replay must restore every loading attribute before starting another load.
3. Import the [shared motion asset](assets/transitions/motion.css) once. Keep the skeleton pulse finite and retain the reduced-motion utilities that remove pulse and crossfade while preserving final content.
4. Production must reveal from authoritative completion state, never from a cosmetic delay. A motion preference may remove animation, but it must not complete the underlying load.

## Runtime requirements

The embedded HTML shows the loading state and its Tailwind selectors; its controls do not reveal or replay content by themselves. When data becomes ready, the owning runtime must atomically set `data-state="revealed"` and `aria-busy="false"`, remove `inert`, and set content `aria-hidden="false"`. A replay must invalidate the previous load result before atomically restoring the loading attributes, and an older completion must never expose content for a newer request. A live reduced-motion change stops pulse and crossfade through CSS while busy and interaction semantics remain tied to real readiness. Teardown must cancel pending work, remove bindings and subscriptions, and leave existing content usable when it is safe to display; otherwise remove the entire loading region.

## Verify

Exercise initial loading, manual reveal, repeated replay, interrupted requests, and the final state. The link must be unavailable while loading and usable after reveal. Toggle reduced motion mid-load and confirm motion stops while busy, inert, and hidden state persists until real data is ready. After teardown or request replacement, obsolete completions must not expose content.

## State markup and Tailwind styling

```html
<section data-state="loading" aria-busy="true" class="group mx-auto flex min-h-72 max-w-lg flex-col justify-center gap-6 rounded-3xl border border-neutral-200 bg-white p-6 text-neutral-950">
  <div class="grid rounded-2xl border border-neutral-200 p-5 shadow-sm [&>*]:[grid-area:1/1]">
    <div aria-hidden="true" class="space-y-4 opacity-100 transition-[opacity,filter] duration-(--motion-duration-slow) ease-motion-enter group-data-[state=revealed]:pointer-events-none group-data-[state=revealed]:opacity-0 group-data-[state=revealed]:blur-[2px] motion-reduce:animate-none motion-reduce:transition-none">
      <div class="size-12 animate-pulse rounded-full bg-neutral-200 [animation-duration:var(--motion-duration-slow)] [animation-iteration-count:2] group-data-[state=revealed]:animate-none motion-reduce:animate-none"></div>
      <div class="space-y-2">
        <div class="h-4 w-2/3 animate-pulse rounded bg-neutral-200 [animation-duration:var(--motion-duration-slow)] [animation-iteration-count:2] group-data-[state=revealed]:animate-none motion-reduce:animate-none"></div>
        <div class="h-3 w-full animate-pulse rounded bg-neutral-100 [animation-duration:var(--motion-duration-slow)] [animation-iteration-count:2] group-data-[state=revealed]:animate-none motion-reduce:animate-none"></div>
        <div class="h-3 w-5/6 animate-pulse rounded bg-neutral-100 [animation-duration:var(--motion-duration-slow)] [animation-iteration-count:2] group-data-[state=revealed]:animate-none motion-reduce:animate-none"></div>
      </div>
    </div>
    <article aria-hidden="true" inert class="pointer-events-none space-y-3 opacity-0 blur-[2px] transition-[opacity,filter] duration-(--motion-duration-slow) ease-motion-enter group-data-[state=revealed]:pointer-events-auto group-data-[state=revealed]:opacity-100 group-data-[state=revealed]:blur-none motion-reduce:transition-none">
      <div class="grid size-12 place-items-center rounded-full bg-violet-100 font-semibold text-violet-800">AL</div>
      <h2 class="text-lg font-semibold">Ada Lovelace</h2>
      <p class="text-sm leading-6 text-neutral-600">Analytical engine notes are ready for review.</p>
      <a href="#review-notes" class="inline-flex min-h-11 items-center rounded-full px-1 text-sm font-medium text-violet-700 underline decoration-violet-300 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">Review notes</a>
    </article>
  </div>
  <div class="flex flex-wrap gap-3">
    <button type="button" class="min-h-11 rounded-full bg-neutral-950 px-5 text-sm font-medium text-white transition-colors duration-(--motion-duration-fast) hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">Reveal content</button>
    <button type="button" class="min-h-11 rounded-full border border-neutral-300 bg-white px-5 text-sm font-medium transition-colors duration-(--motion-duration-fast) hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">Replay loading</button>
  </div>
</section>
```
