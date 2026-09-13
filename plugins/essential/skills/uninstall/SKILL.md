---
name: uninstall
description: "Remove agents and startup configuration owned by Essential's installer while preserving edited and unrelated user files. Use when removing this marketplace's installed agent team, detaching its Grok startup guidance, or undoing an Essential installation in the active harness."
requirements:
  intelligence: medium
---

# Uninstall

Remove files recorded by `essential:install`. Bash and Bun must be available. This does not disable or remove marketplace plugins; use the harness's plugin manager for that separate operation.

## Select the installation

Use the active runtime's harness name: `claude`, `codex`, or `grok`. Determine it from the session rather than installed directories or inherited plugin-root variables. In OpenCode, report that its V1 projector owns the installation; do not remove adapter-managed agents with this skill.

Resolve `scripts/uninstall.sh` from this loaded skill's directory and run:

```bash
bash "<loaded skill directory>/scripts/uninstall.sh" --harness grok
```

Replace `grok` with `claude` or `codex` for those runtimes. Pass `--destination <absolute-agent-directory>` when uninstalling a custom agent destination. Defaults match installation: `~/.claude/agents`, `${CODEX_HOME:-$HOME/.codex}/agents`, or `${GROK_HOME:-$HOME/.grok}/agents`.

## Preserve ownership boundaries

<IMPORTANT>
The `.essential/` ownership record at the selected destination is the removal authority. Without it, remove nothing; never infer ownership from familiar agent names or regenerate a record to authorize deletion.

Only Grok uninstall removes its recorded, unchanged bootstrap attachment from the user `AGENTS.md`. Other harnesses never read or write Grok configuration. Preserve all surrounding user text and any modified attachment.
</IMPORTANT>

The uninstaller removes recorded files whose content still matches the installed hash, forgets already missing files, and preserves edited files. It retains shared support files while preserved agents need them and keeps unresolved ownership entries for a later retry. Repeated uninstall is harmless.

If uninstall reports modified files, conflicting ownership, or recovery failures, report the paths and remaining work. Do not delete or overwrite them manually. A partial removal is not a complete uninstall.

## Verify and report

Inspect the command's removal and preservation report. Check that removed paths are absent and reported preserved paths remain. For Grok, confirm only the owned attachment was removed; existing user rules must survive.

Report the selected harness and destination, removed files, preserved files, and whether uninstall completed. Explain that a fresh session is needed to unload agent definitions already held in memory. Keep the plugin available until this skill finishes; plugin removal is a separate user-selected action.
