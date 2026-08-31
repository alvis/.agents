# State mode

Use this mode when the user wants a dashboard of one Essential project or work
stream from its typed state.

## Input contract

Accept exactly one absolute or repository-relative path ending in `.mdc` or
`.json`:

```text
/discover state <absolute-or-repository-relative-state.mdc|state.json>
```

An MDC path is a project or stream graph root. A JSON path is a normalized
`StateDashboardDocumentV1`, not an MDC parser AST. Reject directories,
Markdown, other extensions, missing paths, and extra positional arguments.
Resolve a repository-relative path against the target repository without
rewriting its contents.

## One-shot render

Resolve the plugin-namespaced locator
`essential:scripts/render-state-dashboard.ts` to its absolute path through the
loaded Essential plugin, then run exactly one transformation command with that
resolved path:

```bash
bun "<resolved-absolute-path>" <input>
```

Do not pass the namespace token itself to Bun, depend on hook substitution, add
a state-board pass, create an intermediate JSON file, or invoke a second
renderer.
The process loads, parses, validates, normalizes, and renders the input, then
prints one JSON result:

```ts
type RenderResult =
  | { status: "rendered"; input: string; kind: "project" | "stream"; output: string }
  | { status: "invalid"; input: string; errors: ValidationError[] };
```

Parse stdout as this result. On `rendered`, report the absolute temporary HTML
path and its `project` or `stream` kind. Present that file with the harness's
available local-file viewer; viewing is presentation, not another conversion
step. On `invalid`, report the structured errors and do not render or invent a
partial board. A nonzero process exit or nonconforming stdout is a renderer
failure, not an invalid state result.

The dashboard is a read-only report. Do not author board sections, infer
missing fields, mutate the graph, or persist the temporary HTML as state.

## Completion

Report the input, result status, document kind and output path when rendered,
or every validation error when invalid. State explicitly that no state file was
changed.
