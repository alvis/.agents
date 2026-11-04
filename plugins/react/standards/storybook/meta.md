# Storybook Standards

_Standards for Storybook stories, organization, and documentation patterns_


## Core Principles

### File Naming Convention

Use consistent TypeScript naming for all story files.

```plaintext
✅ GOOD: descriptive TypeScript story files
Button.stories.tsx
UserCard.stories.tsx
PaymentFlow.demo.stories.tsx    # Complex scenarios

❌ BAD: inconsistent naming
button.stories.js               # Should be PascalCase + TS
Button-stories.tsx              # Should use dot notation
ButtonStories.tsx               # Missing .stories suffix
```

### Path-Based Organization

Story titles must reflect component file structure for clear navigation.

```typescript
// ✅ GOOD: path reflects file location
// File: src/components/primitives/Button/Button.stories.tsx
import type { Meta } from '@storybook/react';

const meta = {
  title: 'Components/Primitives/Button',
  component: Button,
  tags: ['autodocs'],
} satisfies Meta<typeof Button>;

export default meta;

// ❌ BAD: flat structure loses context
export default {
  title: 'Button',  // missing path context
  component: Button,
};
```

### Complete Story Coverage

Include all component states and variants for comprehensive documentation.

```typescript
// ✅ GOOD: covers all important states
export const Primary: Story = { args: { variant: 'primary' } };
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Disabled: Story = { args: { disabled: true } };
export const Loading: Story = { args: { loading: true } };
export const WithLongText: Story = { args: { children: 'Very long button text...' } };

// ❌ BAD: only basic state
export const Default: Story = {};
```

### Typed, Interactive, Controllable Stories

Declare `const meta = { ... } satisfies Meta<typeof Component>`, export it as default, and derive `StoryObj<typeof meta>`. Interactive stories take `canvas` and `userEvent` from the `play` context, import `expect` from `storybook/test`, await every user interaction, assert the observable result, and prove one behavior each. Give each configurable prop a documented `argTypes` control; set function and complex-object controls to `false`.

## Rule Groups

- `SB-NAME-*`: File naming — PascalCase with `.stories.tsx`, optional `.demo.stories.tsx` for complex scenarios.
- `SB-ORG-*`: Organization — path-based titles, directory alignment, interaction helpers in component- or concern-prefixed story helper modules, and fixture placement.
- `SB-COVERAGE-*`: Story coverage — all variants and states (default, disabled, loading, error, edge cases).
- `SB-STRUCT-*`: Story structure — `Meta` / `StoryObj` typing, `tags: ['autodocs']`, demo stories for multi-component scenarios.
- `SB-PLAY-*`: Interactive stories — `play` functions use the `play` context and `storybook/test`, await interactions, assert observable behavior, prove one behavior each, and hide test-only stories.
- `SB-CONTROLS-*`: Controls and argTypes — comprehensive `argTypes` with descriptions, disabled controls for functions.
- `SB-PURE-*`: Pure stories — no inline component definitions, no real API calls; use existing components and mock data.
