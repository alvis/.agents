# Learn more hover

## Implement and adapt

1. Keep a native text link with a real destination and visible focus style. Treat the chevron as decorative with `aria-hidden`; its motion reinforces direction but never supplies the link's name or meaning.
2. Translate the whole SVG by a small logical-direction distance on both group hover and group focus-visible. Rotate the two path arms around the same apex using view-box transform coordinates so they spread evenly instead of separating.
3. Preserve the explicit `translate` and `rotate` transition lists and adapt the distance, angle, and duration together. Add no JavaScript, hover flag, timer, replay state, or cleanup path; browser pseudo-states and native link semantics own the complete interaction.
4. Keep the RTL overrides so inline movement reverses while the shared chevron geometry remains coherent. Enter activates the link, Tab owns focus, and touch activation does not depend on a hover phase.
5. Keep every reduced-motion class. A live preference change must return translation and rotation to the stable chevron immediately while the focus ring, destination, and activation stay intact.

## Verify

Hover, Tab to the link, press Enter, and move focus away; both arm rotations must start and return together. Repeat in an RTL container and on a touch viewport. Change reduced motion while hovered and while focused, inspect the accessibility tree for one link with no exposed SVG, and confirm the layout does not shift.

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
