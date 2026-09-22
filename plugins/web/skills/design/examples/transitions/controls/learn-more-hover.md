# Learn more hover

Use this for an inline destination whose trailing chevron can acknowledge hover or keyboard focus. The chevron shifts in the reading direction while its arms spread around a shared apex; the link meaning never depends on motion.

```html
<section data-demo="learn-more-hover" class="grid min-h-40 place-items-center rounded-2xl bg-slate-950 p-8 text-white">
  <a href="#learn-more-destination" class="group inline-flex items-center gap-2 rounded-md text-lg font-semibold outline-none ring-sky-400/50 focus-visible:ring-4">
    Learn more
    <svg aria-hidden="true" viewBox="0 0 16 16" class="size-5 overflow-visible transition-[translate] duration-(--motion-duration-normal) ease-motion-enter group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5 motion-reduce:translate-none motion-reduce:transition-none rtl:group-hover:-translate-x-0.5 rtl:group-focus-visible:-translate-x-0.5">
      <path d="M6 4L10 8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5" class="[transform-box:view-box] origin-[10px_8px] transition-[rotate] duration-(--motion-duration-normal) ease-motion-enter group-hover:rotate-[8deg] group-focus-visible:rotate-[8deg] motion-reduce:rotate-0 motion-reduce:transition-none"/>
      <path d="M10 8L6 12" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5" class="[transform-box:view-box] origin-[10px_8px] transition-[rotate] duration-(--motion-duration-normal) ease-motion-enter group-hover:-rotate-[8deg] group-focus-visible:-rotate-[8deg] motion-reduce:rotate-0 motion-reduce:transition-none"/>
    </svg>
  </a>
</section>
```

Check the resting chevron, then hover the link and focus it with the keyboard. The whole icon should shift toward the destination while the two arms open evenly and return together. Verify the horizontal shift reverses in an RTL container. Reduced motion must leave a stable chevron while the focus ring and link remain usable.
