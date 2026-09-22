# Input clear dissolve

```html
<section data-demo="input-clear-dissolve" class="grid min-h-48 place-items-center rounded-2xl bg-slate-950 p-8 text-white">
  <div class="w-full max-w-md">
    <label for="dissolve-search" class="mb-2 block text-sm font-medium text-slate-300">Search projects</label>
    <div data-clear-field class="relative overflow-hidden rounded-xl border border-white/15 bg-white/10 shadow-inner focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-400/20">
      <input id="dissolve-search" type="search" value="Motion design systems" autocomplete="off" class="relative z-10 h-12 w-full appearance-none bg-transparent px-4 pr-12 text-base text-white outline-none [&::-webkit-search-cancel-button]:hidden"/>
      <span data-mirror aria-hidden="true" class="pointer-events-none absolute inset-0 z-20 flex items-center overflow-hidden whitespace-pre px-4 pr-12 text-base opacity-0"></span>
      <span data-placeholder aria-hidden="true" class="pointer-events-none absolute inset-0 z-0 flex items-center px-4 pr-12 text-base text-slate-400 opacity-0">Search projects</span>
      <span data-glow aria-hidden="true" class="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-7 opacity-0 mix-blend-screen"></span>
      <button type="button" data-clear-button aria-label="Clear search" class="absolute right-2 top-1/2 z-40 grid size-8 -translate-y-1/2 place-items-center rounded-full text-slate-300 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-sky-400 disabled:pointer-events-none disabled:opacity-0">
        <svg aria-hidden="true" viewBox="0 0 20 20" class="size-4 fill-none stroke-current" stroke-linecap="round" stroke-width="1.75"><path d="m6 6 8 8m0-8-8 8"/></svg>
      </button>
    </div>
  </div>
</section>
```

```js
function mount(root) {
  const controller = new AbortController();
  const field = root.querySelector("[data-clear-field]");
  const input = field.querySelector("input");
  const mirror = field.querySelector("[data-mirror]");
  const placeholder = field.querySelector("[data-placeholder]");
  const glow = field.querySelector("[data-glow]");
  const button = field.querySelector("[data-clear-button]");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const context = document.createElement("canvas").getContext("2d");
  let animationFrameId = 0;
  let isClearing = false;
  let isProgrammaticClear = false;

  function getDurationMs(name, fallbackMs) {
    const value = getComputedStyle(root).getPropertyValue(name).trim();
    const amount = Number.parseFloat(value);
    if (!Number.isFinite(amount) || amount < 0) return fallbackMs;
    if (value.endsWith("ms")) return amount;
    if (value.endsWith("s")) return amount * 1000;
    return fallbackMs;
  }

  function syncField() {
    const hasValue = input.value.length > 0;
    button.disabled = !hasValue || isClearing;
    placeholder.style.opacity = hasValue ? "0" : "1";
  }

  function buildGlowLayers(text) {
    if (!context) return "";
    const inputStyle = getComputedStyle(input);
    context.font = inputStyle.font;
    const width = field.clientWidth || 320;
    const left = Number.parseFloat(inputStyle.paddingLeft) || 16;
    let cursor = 0;
    const layers = [];
    text.split(/(\s+)/).forEach((segment) => {
      const segmentWidth = context.measureText(segment).width;
      if (segment.trim()) {
        const center = left + cursor + segmentWidth / 2;
        const radius = Math.max(10, segmentWidth * 0.65);
        layers.push(`radial-gradient(ellipse ${radius.toFixed(1)}px 10px at ${((center / width) * 100).toFixed(2)}% 100%, rgba(125,211,252,.75), rgba(125,211,252,.16) 55%, transparent 80%)`);
      }
      cursor += segmentWidth;
    });
    return layers.join(", ");
  }

  function finishClear() {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
    isClearing = false;
    mirror.textContent = "";
    mirror.style.cssText = "";
    placeholder.style.cssText = "";
    glow.style.cssText = "";
    input.style.removeProperty("color");
    syncField();
  }

  function clearInput() {
    if (isClearing || !input.value) return;
    isClearing = true;
    const clearedText = input.value;
    mirror.textContent = clearedText;
    mirror.style.opacity = "1";
    input.style.color = "transparent";
    input.value = "";
    isProgrammaticClear = true;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    isProgrammaticClear = false;
    input.focus({ preventScroll: true });
    glow.style.background = buildGlowLayers(clearedText);
    placeholder.style.opacity = "0";
    button.disabled = true;

    if (reducedMotion.matches) {
      finishClear();
      return;
    }

    const startedAt = performance.now();
    const durationMs = getDurationMs("--motion-duration-slow", 400);
    function drawFrame(now) {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const glowEnvelope = progress < 0.22 ? progress / 0.22 : 1 - ((progress - 0.22) / 0.78);
      mirror.style.transform = `translateY(${(eased * 14).toFixed(2)}px)`;
      mirror.style.opacity = String(1 - eased);
      mirror.style.filter = `blur(${(eased * 3).toFixed(2)}px)`;
      placeholder.style.transform = `translateY(${((-1 + eased) * 12).toFixed(2)}px)`;
      placeholder.style.opacity = String(eased);
      placeholder.style.filter = `blur(${((1 - eased) * 2).toFixed(2)}px)`;
      glow.style.opacity = String(Math.max(0, glowEnvelope) * 0.8);
      if (progress < 1) animationFrameId = requestAnimationFrame(drawFrame);
      else finishClear();
    }
    animationFrameId = requestAnimationFrame(drawFrame);
  }

  input.addEventListener("input", () => {
    if (isClearing && !isProgrammaticClear) finishClear();
    syncField();
  }, { signal: controller.signal });
  button.addEventListener("pointerdown", (event) => event.preventDefault(), { signal: controller.signal });
  button.addEventListener("click", clearInput, { signal: controller.signal });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches && isClearing) finishClear();
  }, { signal: controller.signal });
  syncField();

  return () => {
    controller.abort();
    finishClear();
  };
}
```
