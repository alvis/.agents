# Triage response

Use this canonical triage-comment layout and incorporate applicable repository-specific required content into it. Emit `📌` alone on the first line, a blank line, one concise outcome heading, another blank line, and only the sections needed for that disposition. Separate every heading, paragraph, subsection, and code permalink with blank lines. Render only the selected disposition and relevant related-work section; never publish empty slots or duplicate comments for classification, relationships, and analysis.

| Disposition | Heading | Required content |
| --- | --- | --- |
| Duplicate | 🔁 Duplicate of #N | Evidence of the same underlying issue; canonical reference; closing action only after comment verification |
| Feature/Task | 🏷️ Classified as Feature/Task | Intended behavior or maintenance evidence; bug triage ends |
| Missing information | ❓ Information Needed | Specific missing inputs and how they enable investigation |
| Supported cause | 🔎 Analysis | One explicit conclusion (reproduced cause, or likely cause from static inspection with reproduction not run); inspected revision; standalone verified code permalinks; next step; no fix claim |
| Inconclusive | 🔎 Analysis | Explicitly inconclusive conclusion; what was inspected and remains unknown; minimal reproduction request; waiting outcome |

Use `### 🔗 Related Work` for distinct related issues and explain the difference. Use `### 🧪 Evidence` and `### 🛠️ Next Step` when they carry additional evidence/action. Put each GitHub code permalink on its own line between blank lines, with its explanation in neighboring prose. A waiting skip produces no GitHub response; report the reason locally instead.
