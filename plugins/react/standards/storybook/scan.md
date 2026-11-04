# Storybook: Violation Scan

Any single P0 violation blocks approval by default. Protocol: `essential:directions/standards.md`.

## Quick Scan

### File Naming

- DO NOT use lowercase, missing `.stories` suffix, or non-TS extensions for story files (`button.stories.js`, `ButtonStories.tsx`) [`SB-NAME-01`]

### Organization

- DO NOT use flat story titles (`title: 'Button'`) — titles must mirror the file path (`Components/Primitives/Button`) [`SB-ORG-01`]
- DO NOT define interaction helpers inside a `.stories.tsx` file or call `expect` inside a story helper module — interaction helpers live in a support module even with one consumer, and every assertion stays in its story [`SB-ORG-02`](rules/sb-org-02.md)
- DO NOT extract fixtures or non-interaction helpers used by only one story file, even when reused by its story exports or the file is long; keep them inline [`SB-ORG-02`](rules/sb-org-02.md)
- DO NOT use dot-prefixed story helper filenames, omit the owning component name in a component folder (`<Name>.stories.helpers.ts`), duplicate helpers or fixtures shared across story files, or place shared support outside those files' nearest common parent directory; name shared helpers after their concern and shared fixtures `.stories.fixtures.ts` [`SB-ORG-02`](rules/sb-org-02.md)

### Story Coverage

- DO NOT ship a single `Default` story when the component has multiple variants/states — cover primary, secondary, disabled, loading, and edge cases [`SB-COVERAGE-01`]

### Story Structure

- DO NOT export an inline or asserted meta object — declare `const meta = { ... } satisfies Meta<typeof Component>`, export it as default, derive `StoryObj<typeof meta>`, and include `tags: ['autodocs']` for component stories [`SB-STRUCT-01`]

### Interactive Stories

- DO NOT import test utilities from `@storybook/testing-library`, `@storybook/jest`, or `@storybook/test`, or wrap `canvasElement` with `within()` — take `canvas` and `userEvent` from the `play` context and import `expect` from `storybook/test` [`SB-PLAY-01`](rules/sb-play-01.md)
- DO NOT leave `userEvent` calls unawaited or omit an assertion of observable behavior from a `play` function [`SB-PLAY-01`](rules/sb-play-01.md)
- DO NOT check unrelated behaviors in one `play`, or copy an interaction sequence between stories — one named behavior per story; reuse another story's `play` or an interaction helper [`SB-PLAY-02`](rules/sb-play-02.md)
- DO NOT show a test-only story in the sidebar or the Docs page — tag it `tags: ['!dev', '!autodocs']` [`SB-PLAY-02`](rules/sb-play-02.md)

### Controls

- DO NOT omit `argTypes` for configurable props: give enum, boolean, number, and color props suitable controls; disable function and complex-object controls explicitly; document each prop and the component [`SB-CONTROLS-01`]

### Pure Stories

- DO NOT define components inline inside `render` — use existing components imported from the codebase [`SB-PURE-01`]
- DO NOT make real API calls (`fetch`, hooks calling APIs) inside stories — supply mock data via `args` [`SB-PURE-02`]

## Anti-Patterns

### Inline Component Definitions

```typescript
// ❌ BAD: defining components in stories
export const BadStory: Story = {
  render: () => {
    const InlineComponent = ({ text }) => <div>{text}</div>;
    return <InlineComponent text="Bad practice" />;
  },
};

// ✅ GOOD: use existing components
export const GoodStory: Story = {
  render: () => <ExistingComponent text="Good practice" />,
};
```

### Real API Calls in Stories

```typescript
// ❌ BAD: real API calls in stories
export const BadData: Story = {
  render: () => {
    const [data, setData] = useState(null);
    useEffect(() => {
      fetch('/api/data').then(setData); // Real API call
    }, []);
    return <Component data={data} />;
  },
};

// ✅ GOOD: mock data in stories
export const GoodData: Story = {
  args: {
    data: mockData, // Predefined mock data
  },
};
```

### Common Mistakes to Avoid

1. **Missing story variants**
   - Problem: Incomplete documentation of component capabilities
   - Solution: Include all states (default, disabled, loading, error)
   - Example: Create separate stories for each variant

2. **Poor story organization**
   - Problem: Stories scattered without logical grouping
   - Solution: Use path-based titles that mirror file structure

## Rule Matrix

| Rule ID | Violation | Bad Examples |
|---|---|---|
| [`SB-ORG-02`](rules/sb-org-02.md) | Interaction helper kept in a story file, asserting, or misnamed; fixture extracted without cross-file reuse, duplicated across files, or placed incorrectly | `const fillCard = async (...) => {...}` inside `PaymentForm.stories.tsx`; `expect(...)` in `PaymentForm.stories.helpers.ts`; `.stories.helpers.ts` as a helper filename; single-consumer `Button.fixtures.ts`; shared data in a distant `fixtures/` directory |
| `SB-STRUCT-01` | Meta is not declared with the canonical `satisfies` typing, or component stories omit autodocs/derived story typing | `export default { component: Button } as Meta<typeof Button>`; `type Story = StoryObj<typeof Button>` |
| [`SB-PLAY-01`](rules/sb-play-01.md) | Test utilities come from a retired package, interactions are not awaited, or the result is not asserted | `import { userEvent, within } from '@storybook/testing-library'`; `userEvent.click(button)`; a play function with no `expect(...)` |
| [`SB-PLAY-02`](rules/sb-play-02.md) | One story checks unrelated behaviors, copies another story's interactions, or a test-only story stays visible | A `Default` play with geometry, focus, selection, and ARIA steps; a test-only edge case without `!dev` and `!autodocs` |
| `SB-CONTROLS-01` | A configurable prop lacks a suitable documented control, or a function/complex value exposes an unusable control | Enum prop without `options`; `onClick` without `control: false` |

## Quick Reference

| Story Type | File Name | Title Pattern | Use Case |
|------------|-----------|---------------|----------|
| Component | `Button.stories.tsx` | `Components/UI/Button` | Basic component docs |
| Demo | `Flow.demo.stories.tsx` | `Demos/Feature/Flow` | Multi-component scenarios |
| Interactive | Any story file | N/A | User interaction testing |
| Test-only | Component's story file, `tags: ['!dev', '!autodocs']` | N/A | Edge cases with no new visual state |
| Controls | Any story file | N/A | Prop exploration |

| Control Type | Use Case | Example |
|--------------|----------|---------|
| `select` | Dropdown options | `options: ['sm', 'md', 'lg']` |
| `boolean` | Toggle switch | `control: 'boolean'` |
| `range` | Number slider | `{ min: 0, max: 100 }` |
| `color` | Color picker | `control: 'color'` |
| `false` | Disable control | Functions, complex objects |

## Quick Decision Tree

1. **What type of story is needed?**
   - If single component → Use `Component.stories.tsx`
   - If multi-component scenario → Use `Flow.demo.stories.tsx`
   - If interaction testing → Add `play` functions, one behavior per story
   - If a story file grows long → Follow [When a story file grows](write.md#when-a-story-file-grows)

2. **How complex is the component?**
   - If simple → Include all variants in one file
   - If complex → Consider separate demo stories
   - If many states → Use comprehensive argTypes

3. **Does it need context?**
   - If providers needed → Use decorators
   - If mock data → Supply through story args; determine fixture placement with [`SB-ORG-02`](rules/sb-org-02.md)
   - If interactions → Use play functions
