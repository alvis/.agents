# Diagnosis and fix workflow

Read this when observed incorrect behavior, a failed check, or a concrete review finding needs diagnosis or repair.

Establish the failing behavior and its cause before editing. Route a reproducible defect, failed test, type error, lint failure, or broken CI to `coding:fix`; new behavior belongs to `coding:write-code`, green structural cleanup to `coding:refactor`, and test authoring or coverage work to `coding:complete-test`.

Use [implementation](implementation.md) for workspace, evidence, editing, diagnostics, prepared-script, and standards rules. After the repair, follow [validation](validation.md). A failed required gate returns to the repair; do not weaken or skip the obligation.
