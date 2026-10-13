# Component reuse

Run this after the direction is selected and before the first component or hook is implemented. It maps every selected area and state to the components and source paths that own them.

## Detect first

Collect the evidence before asking anything:

- Dependencies in the package manifest, such as `@radix-ui/*`, `@mui/*`, `@chakra-ui/*`, `@mantine/*`, `@headlessui/*`, `@ark-ui/*`, and `@base-ui/*`.
- A `components.json` at the project root, which signals shadcn/ui.
- Workspace UI packages such as `packages/ui*/package.json` and `packages/components/package.json`.
- The existing pattern in the component directories: local source copies, thin wrappers, or direct library imports.
- The styling strategy: Tailwind utilities with `@theme`, CSS Modules, plain CSS with `@layer components`, or CSS-in-JS. The project uses one.

When one library, architecture, and styling strategy dominates, adopt them and record them in the design child's component table. Ask through `essential:directions/questions.md` only about what the evidence leaves unresolved. Name the detected default in the question; if nothing was detected, there is no default.

## Per component

- **Restyling an existing component** is never a new component. Use a scoped token override or slot and headless composition (WT-OVERRIDE-01 and WT-OVERRIDE-02), with no forks and no branded props.
- **A genuinely new shared component** is promoted to the shared package only when a second real consumer exists today, never on a guess. With a second consumer, patch the shared package. Without one, keep it local and note the promotion follow-up in the design child.
- **A single-consumer component** stays next to its consumer and is recorded with source `local`.
- When the target uses React and the React plugin is available, apply its project-structure standard for placement. Web declares no framework plugin, so never load one that isn't present.
