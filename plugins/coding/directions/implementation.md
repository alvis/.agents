# Implementation workflow

Read this for implementation, setup, completion, refactoring, modernization, and source-backed documentation after the Coding workflow selects the action owner.

## Choose the workspace

- For a small change, work in place unless the user names another location.
- For substantial work worth a stacked pull request, follow `essential:directions/establish-work-stream.md`. Reuse a suitable open stream before creating an ID; `essential:references/naming.md` owns work-ID, state-path, and branch shapes.

## Establish the change

Before editing, understand the affected project once through `get_project_overview`, `ide__getDiagnostics`, or its build or type-check command.

Before writing code, apply the lean-work ladder, minimum-change rules, and non-negotiable exceptions in `essential:references/working-attitude.md`.

- Prefer native tools and existing commands for bounded edits and checks. Add a script only when computation, repetition, or error prevention justifies it.
- Prefer a prepared project script to invoking its tool directly. Use a direct tool command only when no project script serves the operation.
- Apply [command output](output.md) before running broad search, listing, diff, log, JSON, transcript, or other repository-scaled commands.
- Run `lsp_get_diagnostics` or `ide__getDiagnostics` before and after source changes; a just-completed `get_project_overview` satisfies the initial diagnostic.
- Before using an external library, consult Context7 for the supported signature and search real GitHub usage.
- Explore runtime behavior through a test case, not an ad hoc `node -e` or `npx ts-node -e` probe. Tests are repeatable living documentation.

After editing, follow [validation](validation.md). If the user did not explicitly request a commit, ask whether to save the work through `coding:commit`; otherwise route the requested history or publication work through the Coding workflow.
