# Checkbox check

```html
<section data-demo="checkbox-check" class="grid min-h-40 place-items-center rounded-2xl bg-slate-100 p-8 text-slate-950 dark:bg-slate-900 dark:text-white">
  <label class="group flex cursor-pointer items-center gap-3 rounded-lg p-2 outline-none">
    <input type="checkbox" class="sr-only"/>
    <span aria-hidden="true" class="grid size-6 place-items-center rounded-md border border-slate-400 bg-white transition-[background-color,border-color,box-shadow] duration-(--motion-duration-fast) ease-motion-enter group-has-checked:border-sky-600 group-has-checked:bg-sky-600 group-has-[:focus-visible]:ring-4 group-has-[:focus-visible]:ring-sky-500/40 motion-reduce:transition-none dark:bg-slate-800">
      <svg viewBox="0 0 16 16" class="size-4 overflow-visible fill-none stroke-white" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
        <path d="M2.5 8.5 6.25 12 13.5 3.5" pathLength="1" class="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] duration-(--motion-duration-normal) ease-motion-enter group-has-checked:[stroke-dashoffset:0] motion-reduce:transition-none"/>
      </svg>
    </span>
    <span class="font-medium">Include archived projects</span>
  </label>
</section>
```
