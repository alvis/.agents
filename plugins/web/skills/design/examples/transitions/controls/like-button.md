# Like button

```html
<section data-demo="like-button" class="grid min-h-48 place-items-center rounded-2xl bg-slate-100 p-8 text-slate-950 dark:bg-slate-900 dark:text-white">
  <button type="button" aria-pressed="false" aria-label="Like this item" class="group relative inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 font-semibold shadow-sm outline-none hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-rose-400/40 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700" data-like>
    <span class="relative grid size-6 place-items-center group-aria-pressed:animate-control-like-pop motion-reduce:group-aria-pressed:animate-none">
      <svg aria-hidden="true" viewBox="0 0 24 24" class="size-6 overflow-visible fill-transparent stroke-current transition-[fill,color] duration-(--motion-duration-fast) ease-motion-enter group-aria-pressed:fill-rose-500 group-aria-pressed:text-rose-500 motion-reduce:transition-none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>
      <span aria-hidden="true" class="pointer-events-none absolute left-1/2 top-1/2 size-0 text-rose-500" data-particles>
        <i class="control-like-particle [.is-bursting_&]:[animation-play-state:running] motion-reduce:animate-none"></i><i class="control-like-particle [.is-bursting_&]:[animation-play-state:running] motion-reduce:animate-none"></i><i class="control-like-particle [.is-bursting_&]:[animation-play-state:running] motion-reduce:animate-none"></i><i class="control-like-particle [.is-bursting_&]:[animation-play-state:running] motion-reduce:animate-none"></i><i class="control-like-particle [.is-bursting_&]:[animation-play-state:running] motion-reduce:animate-none"></i><i class="control-like-particle [.is-bursting_&]:[animation-play-state:running] motion-reduce:animate-none"></i><i class="control-like-particle [.is-bursting_&]:[animation-play-state:running] motion-reduce:animate-none"></i><i class="control-like-particle [.is-bursting_&]:[animation-play-state:running] motion-reduce:animate-none"></i>
      </span>
    </span>
    <span data-label>Like</span>
  </button>
</section>
```

```css
@theme static {
  --animate-control-like-pop: control-like-pop var(--motion-duration-slow) var(--ease-motion-spring);
}

@keyframes control-like-pop {
  0% { transform: scale(1); }
  35% { transform: scale(0.78); }
  70% { transform: scale(1.16); }
  100% { transform: scale(1); }
}

@keyframes control-like-particle {
  0% { opacity: 0; transform: translate(0, 0) scale(0.35); }
  22% { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--particle-x), var(--particle-y)) scale(0.65); }
}

@utility control-like-particle {
  position: absolute;
  width: var(--particle-size, 3px);
  height: var(--particle-size, 3px);
  margin: calc(var(--particle-size, 3px) / -2);
  border-radius: 9999px;
  background: currentColor;
  animation: control-like-particle var(--particle-duration, 600ms) ease-out var(--particle-delay, 0ms) both;
  animation-play-state: paused;
}
```

```js
function mount(root) {
  const controller = new AbortController();
  const button = root.querySelector("[data-like]");
  const label = root.querySelector("[data-label]");
  const particleField = root.querySelector("[data-particles]");
  const particles = [...particleField.querySelectorAll("i")];
  let burstTimerId = 0;
  let burstDurationMs = 0;

  particles.forEach((particle, index) => {
    const angle = (Math.PI * 2 * index) / particles.length - Math.PI / 2;
    const distance = 18 + (index % 3) * 4;
    const delayMs = index * 12;
    const durationMs = 520 + index * 16;
    particle.style.setProperty("--particle-x", `${(Math.cos(angle) * distance).toFixed(2)}px`);
    particle.style.setProperty("--particle-y", `${(Math.sin(angle) * distance).toFixed(2)}px`);
    particle.style.setProperty("--particle-delay", `${delayMs}ms`);
    particle.style.setProperty("--particle-duration", `${durationMs}ms`);
    particle.style.setProperty("--particle-size", `${2.5 + (index % 2)}px`);
    burstDurationMs = Math.max(burstDurationMs, delayMs + durationMs);
  });

  button.addEventListener("click", () => {
    const isLiked = button.getAttribute("aria-pressed") === "true";
    button.setAttribute("aria-pressed", String(!isLiked));
    button.setAttribute("aria-label", isLiked ? "Like this item" : "Unlike this item");
    label.textContent = isLiked ? "Like" : "Liked";
    clearTimeout(burstTimerId);
    particleField.classList.remove("is-bursting");
    if (!isLiked) {
      void particleField.offsetWidth;
      particleField.classList.add("is-bursting");
      burstTimerId = setTimeout(() => particleField.classList.remove("is-bursting"), burstDurationMs);
    }
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    clearTimeout(burstTimerId);
    particleField.classList.remove("is-bursting");
  };
}
```
