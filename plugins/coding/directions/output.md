# Command output

Read this before running a plugin-directed command whose output can grow with repository size, remote history, test volume, JSON payloads, or transcripts.

Scope before execution: select paths, revisions, projects, checks, fields, or remote resources explicitly. Page remote collections to exhaustion without printing each complete page. Prefer summaries, counts, status, and failure-only diagnostics on the conversational surface; RTK remains required where configured, but pass-through commands are not assumed bounded.

When a repository-controlled command can exceed one response, it emits a valid structured JSON summary whose envelope plus trailing newline is at most 4,096 UTF-8 bytes. The byte ceiling is the stricter implementation of the existing 4,096-character direct-message budget. The summary retains `schema`, `status`, `original_status`, `exit_code`, `original_exit_code`, `counts`, bounded `preview` fields for stdout/stderr head and tail, `truncated`, `full_output`, `preservation`, and `rerun` when preservation fails.

Persist a mode-`0600` `{argv,cwd,exit_code,stdout,stderr}` envelope before summarizing. `--report-file <absolute-path>` or `--report-file=<absolute-path>` before `--` lets a caller select a new file; never overwrite an existing path. Omission uses a secure operating-system temporary file. The original structured result remains the envelope's `stdout` string and can be recovered with `jq '.stdout | fromjson'`. If the caller path fails, fall back to that secure temporary file. If both writes fail, return bounded nonzero output with `no_report_retained:true`; retain the original analysis fields, change a successful process exit to 1, and give the exact `argv`/`cwd` rerun when it fits or direct the caller to repeat the original invocation with a new writable `--report-file`. Never dump the full report or stderr as a fallback.

For commands this repository does not control, capture complete output in a task-owned temporary artifact before projecting a concise result. State when projection omitted content and give the artifact path or exact scoped rerun needed to retrieve it. Never pipe the only diagnostic through `head`, `tail`, or an equivalent lossy filter without retaining the complete bytes first. A failure must keep its exit status and enough diagnostic context to act.

This contract governs plugin-authored commands and examples only. It makes no claim about global Codex or harness output behavior.
