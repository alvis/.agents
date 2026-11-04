# SB-ORG-02: Story Helper and Fixture Placement

## Intent

A story file reads as a list of what each story proves. Interaction helpers — the clicks and typing — always live in a support module, so each `play` reads as named steps and assertions instead of defining its own interaction functions. Assertions, fixtures, and other single-file setup stay with their consumers; actual cross-file sharing justifies a support module instead of duplication.

## Fix

- Put interaction helpers, functions that drive the canvas through `userEvent`, in a story helper module, even when one story file uses them. A helper takes the `canvas` and `userEvent` it needs and never calls `expect`; every assertion stays in the story.
- In a component folder, name story helper modules `<Name>.stories.helpers.ts` using the owning component's exact name, such as `Tabs.stories.helpers.ts`. For helpers shared across component folders, name the module after its shared concern, such as `checkout.stories.helpers.ts`, in the consumers' nearest common parent. Helper basenames must not start with `.`.
- Keep fixtures and non-interaction helpers used by one `.stories.tsx` file inside that file, including reuse among multiple story exports. File length alone does not justify extracting them.
- Put fixtures used by multiple separate story files in `<nearest common parent>/.stories.fixtures.ts`, and non-interaction helpers they share in the component- or concern-prefixed story helper module in that same directory.
- Determine the nearest common parent from the story files consuming each helper or fixture; a single consumer's nearest common parent is its own directory.

```typescript
// Tabs/Tabs.stories.helpers.ts
import type { StoryContext } from '@storybook/react';

type Interaction = Pick<StoryContext, 'canvas' | 'userEvent'>;

export const openTab = async ({ canvas, userEvent }: Interaction, name: string): Promise<void> => {
  await userEvent.click(canvas.getByRole('tab', { name }));
};

// Tabs/Tabs.stories.tsx
import { openTab } from './Tabs.stories.helpers';

export const SwitchesPanel: Story = {
  play: async (context) => {
    await openTab(context, 'Billing');
    await expect(context.canvas.getByRole('tabpanel', { name: 'Billing' })).toBeVisible();
  },
};
```

See the [compliant directory and import example](../write.md#helpers-and-fixtures).

## Code Superpowers

- Flag an interaction helper function defined inside a `.stories.tsx` file.
- Flag `expect` inside story helper modules and helper filenames that start with `.` or omit the owning component name inside its folder.
- Trace each fixture and non-interaction helper to its consuming story files; multiple exports within one file count as one file consumer.
- For each support module, verify its filename and directory against the nearest common parent of its consumers.

## Common Mistakes

1. Moving assertions or whole `play` bodies into helpers, which leaves stories as names that no longer say what they prove.
2. Extracting single-file fixtures because a story file is long or has several story exports.
3. Using generic `helpers.ts` or `fixtures.ts`, dot-prefixed helper files, or `Tabs.helpers.ts` for story-only setup instead of `Tabs.stories.helpers.ts`.
4. Placing support modules above the nearest common parent or inside only one of several consumers' directories.

## Related

[SB-NAME-01](sb-name-01.md), [SB-PLAY-02](sb-play-02.md), [SB-PURE-01](sb-pure-01.md), [SB-PURE-02](sb-pure-02.md)
