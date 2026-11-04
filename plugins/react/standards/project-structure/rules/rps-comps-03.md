# RPS-COMPS-03: One Folder per Shared Component, Imported Through Its `index.ts`

## Intent

Each component under `src/components/<bucket>/` lives in its own PascalCase folder: `<Name>/<Name>.tsx`, its stories, its story helpers, and an `index.ts` that is the component's public entry. A growing component then splits into sibling files without moving anything or changing a caller. The package imports map points `#components/*` at folder entries, so `#components/composites/Tabs` resolves to `composites/Tabs/index.ts`. [Helper modules use a dedicated subpath](rps-comps-04.md); other component parts stay behind the entry.

Components are the exception to the thin `<domain>.ts` entry of `FST-MODL-03` (`coding:standards/file-structure/write.md`): a component folder's entry is `index.ts`, because the `#components/*` mapping resolves only folder entries. For `TYP-IMPT-04` and `TYP-IMPT-05`, each `#components/<bucket>/<Name>` entry is its own subpath module: imports between component folders use the alias, and imports inside one folder are relative.

## Fix

1. Move `src/components/<bucket>/<Name>.tsx` to `src/components/<bucket>/<Name>/<Name>.tsx`, with its `.stories.tsx` files beside it.
2. Add `<Name>/index.ts` with explicit exports of its public components and their `<Name>Props` types, and no logic (`TYP-MODL-04`, `RC-STRUCT-05`).
3. Map component entries in `package.json` with `"#components/*": "./src/components/*/index.ts"`, alongside the higher-priority [helper mapping](rps-comps-04.md).
4. Import a shared component from outside its folder as `#components/<bucket>/<Name>`; inside the folder, import siblings relatively (`TYP-IMPT-05`).
5. Keep a component's parts as files inside its folder (`composites/Tabs/variants/PillTabs.tsx`) and export only the public ones from `index.ts`.

```plaintext
src/components/composites/Tabs/
  index.ts
  Tabs.tsx
  Tabs.stories.tsx
  Tabs.stories.helpers.ts
  variants/PillTabs.tsx
```

```typescript
// src/components/composites/Tabs/index.ts
export { Tabs } from './Tabs';
export { PillTabs } from './variants/PillTabs';

export type { TabsProps } from './Tabs';
export type { PillTabsProps } from './variants/PillTabs';

// any consumer outside the folder
import { PillTabs, Tabs } from '#components/composites/Tabs';
```

```json
{
  "imports": {
    "#components/*.helpers": "./src/components/*.helpers.ts",
    "#components/*": "./src/components/*/index.ts"
  }
}
```

## Code Superpowers

- Flag any `.tsx` file directly under `src/components/<bucket>/`.
- Flag a component folder without `index.ts`, or an `index.ts` holding logic or wildcard-exporting a leaf.
- Flag a component import that reaches past a folder entry (`#components/composites/Tabs/Tabs`) and a `package.json` whose imports do not map `#components/*` to `./src/components/*/index.ts`.

## Common Mistakes

1. Creating `composites/Tabs/Tabs.tsx` without `index.ts`, which forces callers to write `#components/composites/Tabs/Tabs`.
2. Mapping components through a catch-all `"#*": "./src/*/index.ts"`, which forces every other `src/` folder into the folder-with-index shape even where a module is one `<domain>.ts` file.
3. Importing `#components/composites/Tabs` from a file inside `Tabs/`.
4. Exporting a private part from `index.ts` only so a test can reach it; stories test the component through its public props.

## Edge Cases

- Helper imports are the explicit entry-boundary exception under [RPS-COMPS-04](rps-comps-04.md).
- Feature and route-local components sit outside this rule; their placement follows `RPS-FEAT-02` and `RPS-ROUTE-01`.
- A workspace UI package follows its own package exports (`RPS-WS-01`).

## Related

- `RPS-COMPS-02` — allowed buckets under `src/components/`
- `RPS-PROMO-01` — when a component enters `src/components/`
- `standard:components` — component shape rules
- `standard:storybook` — story file and helper placement
