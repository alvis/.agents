# WTST-UNIT-02: Test Form Follows the Subject

## Intent

A visual component is tested where it renders, and non-visual logic is tested where it computes. Testing logic only through a rendered story or a journey hides its branches behind rendering; testing a component in a form its framework standard forbids splits one component's tests across two harnesses.

| Subject | Form |
|---|---|
| React component or container, React plugin enabled | Stories with `play()`; the React standards own the form (`SB-PLAY-01`, `SB-COVERAGE-01`) and forbid co-located component specs (`RC-NAMING-01`) |
| Visual component without a selected framework standard | `*.spec.ts(x)` unit test under `coding:standards/testing` |
| Hook, reducer, formatter, validator, or feature service | `*.spec.ts` unit test under `coding:standards/testing` |

Web does not declare React as a dependency; it never checks the React rules itself. A target that selects the React standards applies them there.

## Fix

- Extract logic tested only through a story into a hook or module and give it a `*.spec.ts`.
- Move a component spec into the form its selected framework standard prescribes.

## Code Superpowers

- Flag hooks, reducers, and feature modules whose only importing tests are `*.stories.tsx` or `*.spec.e2e.ts`.
- When the React standards are selected, defer `<Name>.spec.tsx` beside a component to `RC-NAMING-01`.

## Common Mistakes

1. Asserting a price formatter's rounding through a product-card story.
2. Covering a hook only by clicking through the story of the component that uses it.

## Related

`WTST-UNIT-01`, `TST-STRU-01`, `TST-CORE-03`.
