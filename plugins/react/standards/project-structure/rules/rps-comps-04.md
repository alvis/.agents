# RPS-COMPS-04: Component Helper Names and Subpath Imports

## Intent

Component helpers stay in their owning component folder and remain directly importable without brittle relative traversal. Their dedicated subpath resolves helper files while the component subpath continues to resolve folder entries under [RPS-COMPS-03](rps-comps-03.md).

## Fix

- Name helper modules `.helpers.ts` or `.<domain>.helpers.ts` inside the component folder. The optional domain names the helper's concern, such as `.validation.helpers.ts`; it does not create a feature-domain bucket under `src/components/`.
- Keep both mappings in `package.json`:

```json
{
  "imports": {
    "#components/*.helpers": "./src/components/*.helpers.ts",
    "#components/*": "./src/components/*/index.ts"
  }
}
```

The more specific `#components/*.helpers` pattern takes priority over `#components/*` when both match, independently of JSON key order. Use a single `*` in these package subpath patterns; it also captures nested path segments.

```plaintext
src/components/composites/FileDropzone/
  index.ts
  FileDropzone.tsx
  FileDropzone.stories.tsx
  .helpers.ts
  .validation.helpers.ts
```

Import helpers from outside the component folder through the helper subpath, without the `.ts` extension:

```typescript
import { normalizeFiles } from '#components/composites/FileDropzone/.helpers';
import { validateFiles } from '#components/composites/FileDropzone/.validation.helpers';
```

Replace `../../../../src/components/composites/FileDropzone/.validation.helpers` with `#components/composites/FileDropzone/.validation.helpers`. The latter resolves directly to `./src/components/composites/FileDropzone/.validation.helpers.ts`, rather than appending `/index.ts`.

Inside `FileDropzone/`, keep sibling imports relative (`TYP-IMPT-05`):

```typescript
import { normalizeFiles } from './.helpers';
import { validateFiles } from './.validation.helpers';
```

## Code Superpowers

- Inspect helper modules in component folders, including dotfiles; flag names other than `.helpers.ts` or `.<domain>.helpers.ts`.
- Check that both package imports mappings above exist and that helper specifiers resolve to `.helpers.ts` files rather than folder entries.
- Flag relative helper imports from outside the owning component folder and self-imports through the helper alias inside it.

## Edge Cases

- Story-only helper placement still follows [SB-ORG-02](../../storybook/rules/sb-org-02.md); `.stories.helpers.ts` already follows the named helper convention. This rule does not change when story support files are extracted.
- The `#components/` mapping covers `src/components/`; feature, route-local, and workspace-package components keep their existing import roots.

## Related

- [RPS-COMPS-03](rps-comps-03.md) — component folders and public entries
- `coding:standards/typescript/rules/typ-impt-04.md` — cross-module aliases
- `coding:standards/typescript/rules/typ-impt-05.md` — relative imports within a module
