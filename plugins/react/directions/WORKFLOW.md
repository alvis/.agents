# React workflow

Read this before React, JSX, hooks, component, accessibility, project-structure, test, or Storybook work.

## Actions

| Action | Instruction |
| --- | --- |
| Select standards for React work | `react:react` |
| Mechanically enforce React standards | `react:lint` |
| Write, fix, test, review, document, save, or publish React code | Read `coding:directions/WORKFLOW.md`, then use its action owner with the React standards below |
| Create or materially rewrite project artifacts | Follow the injected `essential:references/state.md` contract |

## Standards

Select every row matching the artifact, read its scans before editing, and apply them under `essential:directions/standards.md`. React declares no other framework or design plugin as a dependency; do not select standards from one.

| Applies to | Scans |
| --- | --- |
| Components and props | [Components](../standards/components/scan.md), [Accessibility](../standards/accessibility/scan.md), [Storybook](../standards/storybook/scan.md), [Project structure](../standards/project-structure/scan.md), and `coding:standards/file-structure/scan.md` |
| Hooks | [Hooks](../standards/hooks/scan.md) |
| Screen-reader, keyboard, and contrast behavior | [Accessibility](../standards/accessibility/scan.md) plus `coding:standards/universal/scan.md` and `coding:standards/documentation/scan.md` |
| Placement and promotion | [Project structure](../standards/project-structure/scan.md) plus `coding:standards/file-structure/scan.md`; component placement also selects [Components](../standards/components/scan.md) |
| Stories | [Storybook](../standards/storybook/scan.md) plus [Components](../standards/components/scan.md) |
| All React implementation | `coding:standards/universal/scan.md`, `coding:standards/function/scan.md`, `coding:standards/typescript/scan.md`, `coding:standards/naming/scan.md`, `coding:standards/testing/scan.md`, and `coding:standards/documentation/scan.md` |
| Files and project setup | `coding:standards/file-structure/scan.md` |
| Review | `coding:standards/code-review/scan.md` plus the React scans above |
| Rendered PR messages and implementation-diff size or composition | `coding:standards/git/scan.md` |

Selecting a `coding:` scan requires the Coding plugin to be enabled.
