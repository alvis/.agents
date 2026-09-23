<!-- Canonical inline-review template for `coding:pr review`.

Render one finding into one comment. The finding schema and priority/kind selection live in `directions/review-checklist.md`; voice and marker meaning live in `directions/review-tone.md`. This file alone owns the posted markup.

Placeholders:

  Name     Required  Source / Description
  -------  --------  ---------------------------------------------------------
  marker   yes       One rendered priority badge, process tag, or kind emoji.
  title    yes       One-line imperative for an ask; plain statement otherwise.
  body     yes       Specific evidence, consequence, and actionable correction.

Substitution rules:
- Substitute literal `{{name}}` tokens once, without nesting or expressions.
- `marker` contains no surrounding bold markup and no trailing colon.
- Emit exactly one marker. Never add `issue:`, `suggestion:`, `todo:`, or `nit:`.
- Keep the title and marker inside one bold span, followed by an em dash.
- Strip this guidance block and end the rendered comment with one newline.
- Output is byte-stable for the same placeholder map, with no trailing spaces.

Marker definitions (these exact values also render overall-review finding bullets):
- `P0`: `<sub><sub>![P0 Badge](https://img.shields.io/badge/P0-red?style=flat)</sub></sub>`
- `P1`: `<sub><sub>![P1 Badge](https://img.shields.io/badge/P1-orange?style=flat)</sub></sub>`
- `P2`: `<sub><sub>![P2 Badge](https://img.shields.io/badge/P2-yellow?style=flat)</sub></sub>`
- `P3`: `<sub><sub>![P3 Badge](https://img.shields.io/badge/P3-blue?style=flat)</sub></sub>`
- `P4`: `<sub><sub>![P4 Badge](https://img.shields.io/badge/P4-lightgrey?style=flat)</sub></sub>`
- `chore`: `<sub><sub>![WARNING Badge](https://img.shields.io/badge/WARNING-yellow?style=flat)</sub></sub>`
- `question`: `❓`
- `thought`: `💭`
- `note`: `📝`
- `praise`: `💯`
-->

**{{marker}} {{title}}** — {{body}}
