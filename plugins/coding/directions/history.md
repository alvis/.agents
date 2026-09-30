# History workflow

Read this before creating, describing, splitting, reordering, squashing, rebasing, abandoning, or otherwise mutating local history.

`coding:commit` exclusively owns local history mutation. Other skills may inspect history but hand mutations to that owner. Honor the arrangement selected under `essential:directions/establish-work-stream.md#select-the-workspace`. Use `jj` in its selected, functionally initialized workspace; use Git for a selected Git worktree or Git checkout. Never approximate a missing command with a mixed Git and `jj` sequence.

At an actual `jj` operation, read the shared setup and safety sections of the [Jujutsu guide](jj.md), then only the recipe selected by its situation guide. Reuse those instructions within the task and repeat the state checks required by the selected operation.

When `HEAD` is not local main, or the work is in a `jj` workspace or linked Git worktree, use structured user input to ask whether to open a pull request or move the work onto local main; the Jujutsu guide owns that distinction.

Use `coding:finalize-commits` for isolated per-commit QA across unpushed history. Publication remains a separate operation owned by [publication](publication.md).
