# Web Theming: Violation Scan

Any single violation blocks approval by default.
Protocol: `essential:directions/standards.md`.

## Quick Scan

### CSS Variable Contract

- DO NOT use `var(--token)` without an active semantic/UI fallback and a literal default — every styled declaration resolves through `var(--component, var(--active-semantic-or-ui, literal))`; mode-sensitive colors use `--ui-*`, whose light/dark branches alias raw `--theme-*` tokens [`WT-CONTRACT-01`]
- DO NOT place per-component tokens (`--button-primary-bg`, `--button-md-height`) inside `@theme { … }` — `@theme` is for utility-class generators (`--color-brand`, `--radius-card`) only [`WT-CONTRACT-02`]

### Variant & Token Naming

- DO NOT name variants by visual or brand identity (`blue`, `rounded`, `wide`, `example`, `client="…"`, `brand="…"`) — variants are semantic intent (`primary | secondary | ghost | danger`) [`WT-VARIANT-01`]
- DO NOT hide the semantic variant contract in nested theme config or type variants as free-form `string` — expose a top-level semantic union [`WT-VARIANT-01`].
- DO NOT name CSS variables by position (`--ink-0`, `--bg-1`) or by visual leaf (`--c-violet`, `--line-soft`, `--glass-bg`) — tokens express role (`--color-ink-heading`, `--color-accent`, `--color-surface-glass`) [`WT-VARIANT-01`]
- DO NOT include color words anywhere in token names (`--color-accent-violet`, `--bg-blue`) — strip the color word; the role is `accent` (`--color-accent`). For multiple accents, differentiate by role (`--color-accent-primary`, `--color-link`, `--color-callout`), not by color [`WT-VARIANT-01`]
- DO NOT mint size-tier custom tokens (`--radius-md`, `--shadow-sm`, `--text-body-lg`) — use Tailwind utilities (`rounded-md`, `shadow-sm`, `text-lg`) for default sizes, or mint role-named tokens (`--radius-card`, `--shadow-elevated`, `--text-body`) when the value carries a role [`WT-VARIANT-01`]
- DO NOT bake literal colors or pixel values into variant CSS classes — variant classes resolve their visuals through CSS variables [`WT-VARIANT-02`]

### Tailwind v4.3 Integration

- DO NOT define semantic tokens outside the library's `@theme { … }` block, and do NOT place component CSS outside `@layer components` [`WT-TAILWIND-01`]
- DO NOT import client `theme.css` before the library stylesheet, or app CSS before client `theme.css` — order is library → client theme → app [`WT-TAILWIND-02`]

### Override Strategy

- DO NOT place client brand identity or app-specific feature imports in a shared theming package — keep client overrides in the client app [`WT-OVERRIDE-01`].

- DO NOT fork a shared component or add `client="…"` / `isMarketingHero` props to re-skin — override via scoped CSS variables (`.checkout-flow { --button-primary-bg: … }`) or a thin wrapper [`WT-OVERRIDE-01`]
- DO NOT mutate the shared component when a client needs structural or behavioral change — expose a slot, headless primitive, or client-owned wrapper [`WT-OVERRIDE-02`]

## Framework boundary

React prop-shape, native-element inheritance, and workspace-promotion checks
are unavailable from Web alone. When React components or their package placement
are in scope, return a blocking `unavailable` verdict and request verification
from an eligible React owner. Approval remains blocked until that owner returns
the applicable checks against the reviewed revision. Do not load an undeclared
plugin or claim those checks passed.

## Rule Matrix

| Rule ID            | Violation                                                                                              | Bad Examples                                                                                                  |
|--------------------|--------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| `WT-CONTRACT-01`   | Styled declaration without component → active semantic/UI → literal fallback, or mode color bypasses `--ui-*` | `background: var(--button-primary-bg);`; `background: var(--theme-dark-bg)` |
| `WT-CONTRACT-02`   | Component-level token placed inside `@theme`, or semantic token placed outside `@theme`                | `@theme { --button-primary-bg: #111827; }`; `--color-brand` declared in a plain `:root { … }` block           |
| `WT-VARIANT-01`    | Variant union uses visual/brand labels, component accepts `brand`/`client` prop, OR CSS token name uses position, color word, visual descriptor, or size tier | `variant?: 'blue' \| 'rounded' \| 'example'`; `<Button brand="example" />`; `--ink-0`, `--bg-1`, `--c-violet`, `--color-accent-violet`, `--line-soft`, `--glass-bg`, `--radius-md`, `--shadow-sm`, `--text-body-lg` |
| `WT-VARIANT-02`    | Variant class bakes in literal colors / pixel values instead of CSS variables                          | `.ui-button--primary { background: #ff6600; }`                                                                |
| `WT-TAILWIND-01`   | Semantic tokens declared outside `@theme`, or component CSS placed outside `@layer components`         | `:root { --color-brand: …; }` (should be `@theme`); `.ui-button { … }` outside `@layer components`           |
| `WT-TAILWIND-02`   | Wrong CSS import order in client app                                                                   | `import './theme.css'; import '@company/ui/styles.css';` (library must come first)                            |
| `WT-OVERRIDE-01`   | Forked component, branded prop, or one-off boolean flag for re-skinning                                | `<Button client="example" />`; `<Button isMarketingHeroButton />`; `MarketingButton.tsx` forking `Button.tsx`    |
| `WT-OVERRIDE-02`   | Mutated shared component to inject DOM or behavior a client needed                                     | Edited `Button.tsx` to add a chevron icon for one client instead of exposing a slot or wrapper                |
