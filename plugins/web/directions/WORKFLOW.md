# Web workflow

Read this before UI/UX design, CSS, image-generation, Next.js diagnosis, Storybook audit, rendered-interface audit, or frontend implementation work.

## Actions

| Action | Instruction |
| --- | --- |
| Define a visual contract and orchestrate its implementation | `web:design` |
| Audit a rendered interface | `web:audit` |
| Create or maintain the root color-mode stylesheet | `web:css` |
| Generate or edit visual assets | `web:imagine` |
| Diagnose a Next.js runtime | `web:next` |
| Audit Storybook | `web:storybook` |
| Create or edit production frontend code | `frontend-implementer`, following `coding:directions/WORKFLOW.md` |
| Test, review, save, or publish frontend code | Read `coding:directions/WORKFLOW.md`, then use its action owner |
| Create or materially rewrite project artifacts | Follow the injected `essential:references/state.md` contract |

Before work delegation, read `web:references/ROUTING.md`.

## Standards

Select every row matching the artifact, read its scans before editing, and apply them under `essential:directions/standards.md`.

| Applies to | Scans |
| --- | --- |
| Visual and interaction design or audit | [Design](../standards/design/scan.md) |
| Light, dark, and system color modes | [CSS](../standards/css/scan.md), [Design](../standards/design/scan.md), and [Theming](../standards/theming/scan.md) |
| Brand and token theming | [Theming](../standards/theming/scan.md) plus [CSS](../standards/css/scan.md) and [Design](../standards/design/scan.md) |
| Color-mode or brand token names and scope identifiers | `coding:standards/naming/scan.md` |
| Frontend implementation | `coding:standards/universal/scan.md`, `coding:standards/function/scan.md`, `coding:standards/typescript/scan.md`, `coding:standards/naming/scan.md`, `coding:standards/testing/scan.md`, and `coding:standards/documentation/scan.md` |
| Files and project setup | `coding:standards/file-structure/scan.md` |
| Review | `coding:standards/code-review/scan.md` plus the Web scans above |
| Rendered PR messages and implementation-diff size or composition | `coding:standards/git/scan.md` |

Selecting a `coding:` scan requires the Coding plugin to be enabled.

Web does not declare another framework plugin as a dependency; do not load its standards or skills.
