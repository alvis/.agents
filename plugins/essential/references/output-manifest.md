# Output manifest and the work-Markdown size rule

Read this when returning an artifact-writing skill's manifest, or when writing any Markdown into a work stream's `.state/`.

Every artifact-writing skill returns explicit final paths it generated or materially rewrote:

<report>

```yaml
generated_files:
  - /absolute/path/to/file.md
```

</report>

Writers finish all files and links before returning the manifest. No verification pass runs over the result: the size rule is an obligation each writer observes as it writes, because the writer already knows the byte size of the file it just produced.

Every `.md` file a writer creates inside the resolved target workspace's `.state/` stays at or under 16,384 bytes. `working.md` is excluded — it is scratch working memory, not a delivered artifact. Below that hard limit, 12,288 bytes is authoring guidance only: crossing it is a prompt to consider whether the file has grown two subjects, never on its own a reason to split. The rule does not apply outside `.state/`; the only separate limit is the 2,000-byte injection limit for Essential's `hooks/ALLAGENT.md`, `hooks/MAINAGENT.md`, and `hooks/SUBAGENT.md`.

A file that would exceed 16,384 bytes is split as it is written: the original path remains a concise overview linking its lowercase children, each child carrying one coherent subject. Split at the seam, not at the byte count.

No mechanical limit is not a licence to pad. This is the general length rule for every written artifact, and the one place it is defined: everywhere that rule does not reach — `docs/**`, READMEs, and any report or review artifact written outside `.state/` — match length to what the task needs, covering the substance and adding no filler sections, redundant summaries, or boilerplate. A document is the right length when removing a section would change what a reader does. Authoring standards may add their own limits on top; none of them restates this rule.

