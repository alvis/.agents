# SB-NAME-01: File Naming Convention

## Intent

Use consistent TypeScript naming for all story files so they're discoverable, type-checked, and follow a single project convention.

## Fix

- Name story files `<ComponentName>.stories.tsx` in PascalCase, matching the component
- Use the `.stories` suffix with dot notation (not dash, not embedded in the basename)
- Use `.tsx` (TypeScript), never `.js`
- Reserve `.demo.stories.tsx` for complex multi-component scenarios
- Distinguish story entries from helper and fixture modules governed by [SB-ORG-02](sb-org-02.md); support modules are not subject to the PascalCase `.stories.tsx` entry-file pattern

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

## Code Superpowers

- Audit story entry filenames against the canonical pattern; classify helper and fixture modules separately under [SB-ORG-02](sb-org-02.md)
- Scope ESLint / file-name lint rules for PascalCase + `.stories.tsx` to story entries

## Common Mistakes

1. Lowercase filename (`button.stories.tsx`) breaking PascalCase convention
2. Using `.js` instead of `.tsx`, losing type safety on `Meta` / `StoryObj`
3. Dropping `.stories` suffix, hiding the file from Storybook globs

## Related

SB-ORG-01, SB-STRUCT-01
