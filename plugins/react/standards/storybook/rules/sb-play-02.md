# SB-PLAY-02: One Behavior per Interaction Story

## Intent

Each story with a `play` function proves one named behavior. A failing story then names what broke, each `play` stays readable, and a long story file shrinks by reuse instead of by scattering. Stories that exist only to test stay in the component's story file but leave the sidebar and the Docs page, so the catalogue people browse shows real states only.

## Fix

- Split a `play` whose `step()` blocks check unrelated behaviors into separate stories, each named for the behavior it proves (`FocusRing`, `PicksOption`)
- Reuse setup instead of copying it: call another story's `play` first, or call an interaction helper ([SB-ORG-02](sb-org-02.md))
- Tag a story that adds no new visual state and exists only to test with `tags: ['!dev', '!autodocs']`; it still runs as a test

```typescript
// ✅ GOOD: one behavior each; setup reused; test-only edge case hidden
export const Filled: Story = {
  play: async (context) => {
    await fillCard(context);
    await expect(context.canvas.getByRole('button', { name: 'Pay' })).toBeEnabled();
  },
};

export const Submitted: Story = {
  play: async (context) => {
    await Filled.play?.(context);
    await context.userEvent.click(context.canvas.getByRole('button', { name: 'Pay' }));
    await expect(context.args.onSubmit).toHaveBeenCalled();
  },
};

export const SubmitsOnce: Story = {
  tags: ['!dev', '!autodocs'],
  play: async (context) => {
    await fillCard(context);
    await context.userEvent.dblClick(context.canvas.getByRole('button', { name: 'Pay' }));
    await expect(context.args.onSubmit).toHaveBeenCalledOnce();
  },
};

// ❌ BAD: one story checks geometry, focus, selection, and ARIA state
export const Default: Story = {
  play: async ({ step }) => {
    await step('Keeps medium geometry', async () => { /* ... */ });
    await step('Shows the focus ring', async () => { /* ... */ });
    await step('Selects an option', async () => { /* ... */ });
    await step('Leaves aria-invalid unset', async () => { /* ... */ });
  },
};
```

## Code Superpowers

- Flag a `play` whose `step()` titles describe unrelated behaviors; steps of one user flow (fill, then submit, then confirm) are one behavior
- Flag interaction sequences copied between stories in one file
- Flag a test-only story that appears in the sidebar or the Docs page

## Common Mistakes

1. Hiding a story that documents a real visual state; only test-only stories take `!dev`
2. Tagging only `!dev`, which leaves the story on the Docs page

## Related

[SB-PLAY-01](sb-play-01.md), [SB-ORG-02](sb-org-02.md), SB-COVERAGE-01
