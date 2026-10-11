# SB-ORG-02: Story Helper and Fixture Placement

## Intent

Keep story-only helpers and fixture data with their consumers. Inline setup preserves context; actual cross-file sharing justifies a support module instead of duplication.

## Fix

- Keep helpers and fixtures used by one `.stories.tsx` file inside that file, including reuse among multiple story exports. File length alone does not justify extraction.
- Put helpers used by multiple separate story files in `<nearest common parent>/.stories.helpers.ts`.
- Put fixtures used by multiple separate story files in `<nearest common parent>/.stories.fixtures.ts`.
- Determine the nearest common parent from the story files consuming each shared helper or fixture; files in one directory share support modules in that directory.

See the [compliant directory and import example](../write.md#helpers-and-fixtures).

## Code Superpowers

- Trace each story-only helper or fixture to its consuming story files; multiple exports within one file count as one file consumer.
- For each shared item, verify its support filename and directory against the nearest common parent of its consumers.
- Check duplicated inline setup across story files for shared helpers or fixtures that belong in support modules.

## Common Mistakes

1. Extracting single-file setup because a story file is long or has several story exports.
2. Using generic `helpers.ts`, `fixtures.ts`, or per-component support files for shared story-only setup.
3. Placing support modules above the nearest common parent or inside only one consumer's directory.

## Related

[SB-NAME-01](sb-name-01.md), [SB-PURE-01](sb-pure-01.md), [SB-PURE-02](sb-pure-02.md)
