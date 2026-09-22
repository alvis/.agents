# Banner stacking

## Implement and adapt

1. Import [motion.css](assets/transitions/motion.css) once after Tailwind CSS, or map its tokens to project motion tokens. Keep the banner transition limited to `transform`, `opacity`, and `filter`.
2. Preserve the list, live region, and template semantics. Give every dismiss control a notice-specific accessible name, keep “Show all” as the persistent keyboard path, and treat pointer expansion as an enhancement of the same state.
3. Keep the queue newest-first. Limit the visible queue to three because the collapsed geometry is tuned for three readable depth levels; if the product needs more, retune and verify the scale, opacity, blur, z-index, and stage height as one system.
4. Measure each rendered banner for the expanded layout. Recompute positions through one scheduled animation frame after resize, content changes, or queue changes; observe both the stack and every banner because wrapping can change their heights independently.
5. Make `positionBanners` own visual order, measured offsets, collapsed depth, `aria-hidden`, and `inert`. Only the newest banner is available while collapsed; expanded banners become available in DOM queue order.
6. Make removal cancellable. Remove the banner from the logical queue first, restore focus to the next dismiss control or Add button when necessary, then remove the exiting node after the computed slow duration plus the existing small completion buffer. Never depend on `transitionend`.
7. Handle reduced motion in CSS and JavaScript. CSS removes interpolation; the media-query listener immediately completes pending removals and reapplies final positions when the preference changes during entry or exit.
8. Retain the cleanup function and call it before unmount or remount. Cleanup must abort DOM listeners, remove the media-query listener, block and cancel scheduled layout, disconnect resize observation, clear removal timers, and settle pending nodes.

## Complete recipe

```html
<section data-demo="banner-stacking" class="mx-auto w-full max-w-3xl bg-slate-100 p-4 text-slate-950 sm:p-8">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="text-sm font-medium text-indigo-700">Notification queue</p>
      <h2 class="text-2xl font-semibold tracking-tight">Recent activity</h2>
    </div>
    <div class="flex flex-wrap gap-2">
      <button data-banner-add type="button" class="min-h-11 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white outline-none hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:scale-100">Add notification</button>
      <button data-stack-toggle type="button" aria-expanded="false" aria-controls="banner-stack-list" class="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold outline-none hover:border-indigo-400 hover:text-indigo-800 focus-visible:ring-2 focus-visible:ring-indigo-600">Show all</button>
    </div>
  </div>
  <div data-stack-stage class="relative mt-8 min-h-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <p class="max-w-md text-sm leading-6 text-slate-600">Add notices to test arrival, depth changes, overflow removal, keyboard expansion, and interruption.</p>
    <div id="banner-stack-list" data-stack role="list" aria-label="Recent notifications" data-expanded="false" class="relative mt-6 h-20">
      <article data-banner data-depth="0" role="listitem" class="absolute inset-x-0 top-0 flex min-h-20 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg transition-[transform,opacity,filter] duration-(--motion-duration-slow) ease-motion-enter motion-reduce:transition-none">
        <span aria-hidden="true" class="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">✓</span>
        <p data-banner-message class="min-w-0 flex-1 text-sm font-medium">Layout review is ready.</p>
        <button data-banner-dismiss type="button" aria-label="Dismiss Layout review is ready" class="grid size-11 shrink-0 place-items-center rounded-xl text-slate-600 outline-none hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-indigo-600"><span aria-hidden="true">×</span></button>
      </article>
    </div>
  </div>
  <p data-banner-live class="sr-only" aria-live="polite" aria-atomic="true"></p>
  <template data-banner-template>
    <article data-banner role="listitem" class="absolute inset-x-0 top-0 flex min-h-20 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg transition-[transform,opacity,filter] duration-(--motion-duration-slow) ease-motion-enter motion-reduce:transition-none">
      <span aria-hidden="true" class="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">✓</span>
      <p data-banner-message class="min-w-0 flex-1 text-sm font-medium"></p>
      <button data-banner-dismiss type="button" class="grid size-11 shrink-0 place-items-center rounded-xl text-slate-600 outline-none hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-indigo-600"><span aria-hidden="true">×</span></button>
    </article>
  </template>
</section>
```

```js
/**
 * mounts the notification stack
 * @param {HTMLElement} root demo section
 * @returns {() => void} cleanup function
 */
function mount(root) {
  const addButton = root.querySelector("[data-banner-add]");
  const toggleButton = root.querySelector("[data-stack-toggle]");
  const stage = root.querySelector("[data-stack-stage]");
  const stack = root.querySelector("[data-stack]");
  const template = root.querySelector("[data-banner-template]");
  const liveRegion = root.querySelector("[data-banner-live]");

  if (!addButton || !toggleButton || !stage || !stack || !(template instanceof HTMLTemplateElement) || !liveRegion) return () => {};

  const abortController = new AbortController();
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const removalTimers = new Map();
  const messages = [
    "Keyboard review passed.",
    "Responsive preview is ready.",
    "Motion preference check passed.",
    "Integrated review was assigned.",
  ];
  let banners = [...stack.querySelectorAll("[data-banner]")];
  let nextMessageIndex = 0;
  let isPinnedOpen = false;
  let isPointerInside = false;
  let layoutFrameId = 0;
  let isUnmounted = false;
  const resizeObserver = new ResizeObserver(schedulePositionBanners);

  function readDurationMs(propertyName, fallbackMs) {
    const value = getComputedStyle(root).getPropertyValue(propertyName).trim();
    const numericValue = Number.parseFloat(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) return fallbackMs;
    if (value.endsWith("ms")) return numericValue;
    if (value.endsWith("s")) return numericValue * 1000;
    return numericValue;
  }

  function updateExpansion() {
    const isExpanded = isPinnedOpen || isPointerInside;
    stack.setAttribute("data-expanded", String(isExpanded));
    toggleButton.setAttribute("aria-expanded", String(isExpanded));
    toggleButton.textContent = isExpanded ? "Collapse" : "Show all";
    positionBanners();
  }

  function schedulePositionBanners() {
    if (layoutFrameId !== 0 || isUnmounted) return;
    layoutFrameId = window.requestAnimationFrame(() => {
      layoutFrameId = 0;
      positionBanners();
    });
  }

  function positionBanners() {
    const isExpanded = stack.getAttribute("data-expanded") === "true";
    const bannerHeights = banners.map((banner) => banner.offsetHeight || 80);
    let spreadOffset = 0;
    banners.forEach((banner, depth) => {
      if (depth > 0) spreadOffset += bannerHeights[depth - 1] + 8;
      const offsetY = isExpanded ? spreadOffset : 12 * depth;
      const scale = isExpanded ? 1 : 1 - depth * 0.06;
      banner.setAttribute("data-depth", String(depth));
      banner.style.zIndex = String(10 - depth);
      banner.style.transform = `translateY(${offsetY}px) scale(${scale})`;
      banner.style.opacity = isExpanded ? "1" : String(1 - depth * 0.28);
      banner.style.filter = isExpanded ? "blur(0)" : `blur(${depth}px)`;
      const isAvailable = isExpanded || depth === 0;
      banner.setAttribute("aria-hidden", String(!isAvailable));
      banner.toggleAttribute("inert", !isAvailable);
    });
    const lastBannerHeight = bannerHeights.at(-1) || 80;
    const expandedHeight = spreadOffset + lastBannerHeight;
    const collapsedHeight = Math.max(80, ...bannerHeights.map((height, depth) => height + 12 * depth));
    stack.style.height = `${isExpanded ? expandedHeight : collapsedHeight}px`;
  }

  function finishRemoval(banner) {
    const timerId = removalTimers.get(banner);
    if (timerId !== undefined) window.clearTimeout(timerId);
    removalTimers.delete(banner);
    resizeObserver.unobserve(banner);
    banner.remove();
  }

  function removeBanner(banner) {
    if (!banners.includes(banner)) return;
    const shouldRestoreFocus = banner.contains(root.ownerDocument.activeElement);
    banners = banners.filter((candidate) => candidate !== banner);
    banner.setAttribute("inert", "");
    banner.setAttribute("aria-hidden", "true");
    banner.style.opacity = "0";
    banner.style.filter = "blur(2px)";
    banner.style.transform = "translateY(-36px) scale(0.94)";
    positionBanners();
    if (shouldRestoreFocus) {
      const nextDismissButton = banners[0]?.querySelector("[data-banner-dismiss]");
      (nextDismissButton || addButton).focus();
    }
    if (motionQuery.matches) {
      finishRemoval(banner);
      return;
    }
    const timerId = window.setTimeout(
      () => finishRemoval(banner),
      readDurationMs("--motion-duration-slow", 400) + 50,
    );
    removalTimers.set(banner, timerId);
  }

  function addBanner() {
    const fragment = template.content.cloneNode(true);
    const banner = fragment.querySelector("[data-banner]");
    const message = fragment.querySelector("[data-banner-message]");
    const dismissButton = fragment.querySelector("[data-banner-dismiss]");
    if (!banner || !message || !dismissButton) return;

    const notification = messages[nextMessageIndex % messages.length];
    nextMessageIndex += 1;
    message.textContent = notification;
    dismissButton.setAttribute("aria-label", `Dismiss ${notification}`);
    if (!motionQuery.matches) {
      banner.style.transform = "translateY(60px) scale(0.97)";
      banner.style.opacity = "0";
      banner.style.filter = "blur(2px)";
    }
    stack.prepend(fragment);
    resizeObserver.observe(banner);
    banners = [banner, ...banners];
    if (!motionQuery.matches) void banner.offsetWidth;
    positionBanners();
    banners.slice(3).forEach(removeBanner);
    liveRegion.textContent = notification;
  }

  function finishActiveMotion() {
    if (!motionQuery.matches) return;
    [...removalTimers.keys()].forEach(finishRemoval);
    positionBanners();
  }

  addButton.addEventListener("click", addBanner, { signal: abortController.signal });
  toggleButton.addEventListener("click", () => {
    isPinnedOpen = !isPinnedOpen;
    if (!isPinnedOpen && stack.contains(root.ownerDocument.activeElement)) toggleButton.focus();
    updateExpansion();
  }, { signal: abortController.signal });
  stack.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const dismissButton = event.target.closest("[data-banner-dismiss]");
    const banner = dismissButton?.closest("[data-banner]");
    if (banner) removeBanner(banner);
  }, { signal: abortController.signal });
  stage.addEventListener("pointerenter", () => {
    isPointerInside = true;
    updateExpansion();
  }, { signal: abortController.signal });
  stage.addEventListener("pointerleave", () => {
    isPointerInside = false;
    updateExpansion();
  }, { signal: abortController.signal });
  stack.addEventListener("focusin", () => {
    isPinnedOpen = true;
    updateExpansion();
  }, { signal: abortController.signal });
  motionQuery.addEventListener("change", finishActiveMotion);

  resizeObserver.observe(stack);
  banners.forEach((banner) => resizeObserver.observe(banner));
  positionBanners();

  return () => {
    abortController.abort();
    motionQuery.removeEventListener("change", finishActiveMotion);
    isUnmounted = true;
    if (layoutFrameId !== 0) window.cancelAnimationFrame(layoutFrameId);
    layoutFrameId = 0;
    resizeObserver.disconnect();
    [...removalTimers.keys()].forEach(finishRemoval);
  };
}
```

## Verify

| State | Acceptance check |
| --- | --- |
| Initial | One readable banner is exposed, older depths are empty, and the live region is quiet. |
| Add and overflow | Each addition is announced, enters at depth zero, and a fourth notice removes the oldest only after its cancellable exit. |
| Expand and collapse | Pointer entry, focus within, or “Show all” spreads measured banners; collapse makes only the newest available and moves focus to the toggle when needed. |
| Dismiss and replay | Dismissing any available banner restores focus safely, reflows the queue, and does not prevent later entries from animating. |
| Reduced motion | Enabling reduced motion during entry or exit removes interpolation, completes every pending removal, and settles final measured positions immediately. |
| Resize and content change | Wrapped or resized banners recompute spread offsets and stage height through one scheduled frame without stale geometry. |
| Cleanup | Cleanup removes listeners, cancels scheduled layout, disconnects observation, clears timers, settles pending removals, and prevents later interaction changes. |
