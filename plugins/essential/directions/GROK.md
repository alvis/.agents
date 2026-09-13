# Grok startup context

<IMPORTANT>
Grok Build only. Before starting a task, responding, or asking a question, load the enabled plugins' instructions with the command below. The `@` reference in user `AGENTS.md` points to this file; it does not imply automatic import expansion.
</IMPORTANT>

1. Resolve [../scripts/context.ts](../scripts/context.ts) relative to the exact absolute path of this `GROK.md` that you just read. Keep that path unchanged: do not rebase it against the working directory or switch to an Essential root reported by plugin discovery.
2. Use `main` for the session talking to the user; use `subagent` for a spawned session carrying a delegated assignment. Run the loader in the session's working directory. Bun must be available, as required by `essential:install`:

   ```bash
   bun run "<absolute path to this plugin>/scripts/context.ts" --audience main
   ```

   Replace `main` with `subagent` in a spawned session. Do not reproduce the loader's discovery or file loop manually.
3. Read and follow the complete output before continuing. The loader runs `grok inspect --json`, reads every enabled plugin's `ALLAGENT.md` plus `MAINAGENT.md` or `SUBAGENT.md` for the selected audience, and resolves `{{PLUGIN_DIR}}` against each reported root. Missing optional payloads are skipped; discovery, root, and read failures fail the command without partial context.
4. If the command fails, report the error; do not claim startup instructions loaded. If output is truncated, read the full output from the tool's reported log before continuing. Follow conditional workflow reads at their stated decision points, including Essential's question guidance before a user question.

Repeat after a fresh start, lost context, or an enabled-plugin change. Re-run `essential:install` after moving or updating Essential to refresh the attachment. Passive `SessionStart` and `SubagentStart` output does not load this context.
