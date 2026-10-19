# Web Testing Standards

_Which level tests what on a website: pages and route entries are never unit-tested, components and logic carry the unit tests, and the whole site is proven by end-to-end journeys._

## Dependent Standards

Relationships below explain the selection owned by [WORKFLOW.md](../../directions/WORKFLOW.md).

- Testing Standards (`plugin:coding:standard:testing`) - owns test mechanics, file suffixes (`TST-STRU-01`), the e2e no-mocking rule, and the coverage bar with its route-composition exclusion (`TST-COVR-01`); this standard decides which level each web artifact is tested at
- Design Standards (standard:design) - its state inventory (`DES-STAT-01`) names the states a journey and its components must reach
- React Project Structure (`plugin:react:standard:project-structure`) - when the React plugin is enabled, `RPS-ROUTE-02` is the React form of the page-as-composition rule
- React Storybook and Components (`plugin:react:standard:storybook`, `plugin:react:standard:components`) - when the React plugin is enabled, they own the React component-test form: stories with `play()` (`SB-PLAY-01`, `SB-COVERAGE-01`) instead of co-located specs (`RC-NAMING-01`)

Web does not declare React as a dependency, so this standard never claims a React check; it names the React owner only for a target that already selects it.

## What's Stricter Here

This standard enforces requirements beyond typical frontend testing practice:

| Standard Practice | Our Stricter Requirement |
|---|---|
| Render whole pages in a unit runner to test them | **Never unit-test a page or route entry; its behavior lives in, and is tested at, the component, container, hook, or feature that owns it** |
| Logic in a page is tested in place | **Logic found in a page moves into a covered unit; the page stays logic-free composition** |
| An e2e suite covers some flows | **Every primary user journey has at least one `*.spec.e2e.ts` journey test against the real rendered site before a PR is ready** |
| E2e may stand in for missing component tests | **Component, container, hook, and feature behavior is unit-tested at its own level; a journey never substitutes** |
| A draft carries partial tests | **An unapproved `direction-review` web draft carries no tests, only a rendered walkthrough of every primary journey; tests are finalization obligations** |

## Exception Policy

Allowed exceptions only when:

- False positive
- No viable workaround exists now

Required exception note fields:

- `rule_id`
- `reason` (`false_positive` or `no_workaround`)
- `evidence`
- `temporary_mitigation`
- `follow_up_action`

If exception note is missing, submission is rejected.

## Rule Groups

- `WTST-PAGE-*`: Pages and UI route entries — never unit-tested, kept logic-free.
- `WTST-UNIT-*`: Unit-test level — components, containers, hooks, and feature logic, each in the test form its subject requires.
- `WTST-E2E-*`: Whole-site end-to-end — primary journey coverage against the real rendered site.
- `WTST-STAG-*`: Staged delivery — draft walkthrough evidence and the finalization test obligations.
