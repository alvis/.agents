# SB-PLAY-01: Interactive Stories with Play Functions

## Intent

Use `play` functions to script user interactions — clicks, typing, form submission — so stories double as interaction tests and document component behavior under real user input.

## Fix

- Take `canvas` and `userEvent` from the `play` context; import `expect`, `fn`, and other test utilities from `storybook/test`
- Use semantic queries (`getByRole`, `getByLabelText`) so stories also validate accessibility
- Await every interaction so test runners observe each step
- Assert an observable result after the interaction

```typescript
// ✅ GOOD: interactive story with play function
import { expect } from 'storybook/test';

export const Interactive: Story = {
  play: async ({ canvas, userEvent }) => {
    const button = canvas.getByRole('button');
    await userEvent.click(button);
    await expect(button).toBeEnabled();
  },
};

// ✅ GOOD: form interaction story
export const FormInteraction: Story = {
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByLabelText('Email');
    await userEvent.type(input, 'test@example.com');
    await userEvent.click(canvas.getByRole('button', { name: 'Submit' }));
    await expect(input).toHaveValue('test@example.com');
  },
};
```

## Code Superpowers

- Audit components with multi-step flows for at least one `play` story
- Flag imports from `@storybook/testing-library`, `@storybook/jest`, or `@storybook/test`; Storybook 9 replaced them with `storybook/test` and the `play` context
- Lint for missing `await` inside `play` (race-condition smell)
- Ensure interaction stories use semantic queries, not test ids

## Common Mistakes

1. Using non-semantic queries (`getByTestId`) inside `play`
2. Forgetting `await` on `userEvent` calls
3. No assertions / observable side effects to verify the interaction worked
4. Wrapping `canvasElement` with `within()` when the context already supplies `canvas`

## Related

SB-COVERAGE-01, [SB-PLAY-02](sb-play-02.md)
