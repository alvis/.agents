# Grok startup context

<IMPORTANT>
Grok Build only. Before starting a task, responding, or asking a question, load the enabled plugins' instructions with the command below. The `@` reference in user `AGENTS.md` points to this file; it does not imply automatic import expansion.
</IMPORTANT>

1. Resolve [../scripts/context.ts](../scripts/context.ts) relative to the exact absolute path of this `GROK.md` that you just read. Keep that path unchanged: do not rebase it against the working directory or switch to an Essential root reported by plugin discovery.
2. Use `main` for the session talking to the user; use `subagent` for a spawned session carrying a delegated assignment. Run the loader in the session's working directory. Bun must be available, as required by `essential:install`:

   ```bash
   bun run "<absolute path to this plugin>/scripts/context.ts" --audience main --prompt '<current task or delegated assignment>' --receipt '<receipt returned by the previous call>'
   ```

   Replace `main` with `subagent` in a spawned session. Omit `--receipt` only on the first call or when the prior receipt is unavailable. Shell-quote the prompt and receipt as literal arguments. Do not reproduce discovery or the file loop manually.
3. Read the returned JSON's complete `context` before continuing and retain its `receipt` unchanged for the next call. Invoke this loader for every new task and before entering a newly discovered domain; include the relevant plugin operation or tool path in the prompt when its lexical policy needs an explicit signal. Empty output means the retained receipt remains current. The loader discovers enabled plugins with `grok inspect --json`, reads universal context plus applicable domains, and resolves each payload against its own root. Each enabled plugin's `hooks/context.json` owns its request, tool, and role patterns. Missing optional payloads are skipped; discovery, root, and read failures fail without partial output.
4. An operation-first domain denial returns a JSON reason containing `context`, `receipt`, and `retry`. Read its context before retrying, retain its receipt, and add `--delivered-receipt '<denial receipt>'` to the next loader call alongside the retained `--receipt`. Repeat that flag for multiple denials. The loader validates each acknowledgment against its current directory, audience, enabled root, policy, and payload bytes, merges only those delivered files, and returns a refreshed global receipt. Retain that global receipt alone after synchronization; discard the consumed denial receipts. A synchronization call may return an empty context with an updated receipt; subsequent unchanged calls emit nothing.
5. If the command fails, report the error; do not claim startup instructions loaded. If output is truncated, read the full output from the tool's reported log before continuing. Follow conditional workflow reads at their stated decision points, including Essential's question guidance before a user question.

After a fresh start or lost context, pass `--reset`; retain the receipt across resume or compact when its context remains available. Missing or malformed receipts safely re-emit applicable context. The transparent receipt binds the working directory, audience, enabled roots, policies, and delivered bytes; its checksum detects accidental edits, not adversarial forgery. Never reuse another session's receipt. Re-run `essential:install` after moving or updating Essential. Passive hooks do not acknowledge context delivery.
