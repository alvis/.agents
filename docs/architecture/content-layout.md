# Plugin content layout

Use this authority when adding, moving, or naming shipped plugin content. The root [source map](../../AGENTS.md#source-map) owns canonical artifact paths.

## Taxonomy

Every shipped file belongs to exactly one directory, chosen by what the file is rather than by what reads it. When a file has two clean purposes, split it; otherwise place it by its primary purpose.

| Directory | Holds |
| --- | --- |
| `templates/` | Layout and authoring instructions for a work product to be delivered |
| `directions/` | Workflow: how to perform a task step by step |
| `examples/` | A worked instance of a delivered work product |
| `scripts/` | Strictly mechanical executables |
| `assets/` | Static, non-generated files, including files copied to a destination |
| `standards/` | Four-part standard directories plus the `INDEX.md` that indexes them |
| `references/` | Plain description of something, and nothing else |

`references/` is residue, not a default. A reference that tells someone what to do, demonstrates a deliverable, or states a rule is misfiled.

## Placement

Placement follows use, not authorship. Content belongs under a skill when one skill uses it and the association is strong, such as `plugins/coding/skills/pr/templates/`. Promote it to plugin level when a second skill uses it or plausibly could, such as `plugins/essential/references/` or `plugins/coding/standards/`. A cross-skill link into another skill's private tree is evidence that the content was placed too deep.

Reclassify only when a file clearly belongs elsewhere. A genuine plain reference remains in `references/`.

## Naming

Prefer one-word names where the plugin or skill supplies the context: use `jj.md`, not `manage-jj.md`, unless a sibling requires the qualifier. Skill and standard directory names are kebab-case and match their declared `name`.

Uppercase names are reserved for conventionally named shipped entry points: `WORKFLOW.md`, `ROUTING.md`, `SKILL.md`, `ALLAGENT.md`, and the `INDEX.md` named by each plugin workflow or Essential's standards direction. An index sits at the root it indexes.

## Mechanical checks

`scripts/check_doc_paths.ts` enforces mechanical placement and link rules. No content directory may nest under `references/`. Documents under `templates/` and `examples/` are exempt from link resolution because their paths can be illustrative; the exemption follows the directory, never a filename.
