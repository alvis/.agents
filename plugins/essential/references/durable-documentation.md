# Durable documentation

Read this before creating or materially rewriting versioned project
documentation. [state-systems.md](state-systems.md) owns system selection and
access; this reference owns the version-controlled tree, content, and
migration rules.

```text
<repository>/
├── README.md                             # durable project entrypoint
└── docs/
    ├── README.md                         # durable-documentation authority map
    ├── architecture/
    │   ├── README.md
    │   ├── <architecture-concern>.md
    │   ├── <architecture-concern>/*.md
    │   └── decisions/
    │       ├── <nnnn>-<decision>.md
    │       └── superseded/<nnnn>-<decision>.md
    ├── design/
    │   ├── README.md
    │   ├── system.md
    │   ├── system/*.md
    │   ├── <design>.md
    │   └── <design>/*.md
    └── <domain>/
        ├── README.md
        └── <item>/...
```

## Entrypoints and semantic documents

- `docs/README.md` is the small entrypoint to architecture, design, and plugin-owned durable domains.
- A durable directory uses `README.md` only for its reader entrypoint.
  Operational indexes such as `.state/overview.md` and semantic documents such
  as `system.md`, `manifest.md`, and `assets.md` keep their descriptive names.
- `docs/architecture` owns structural rules, boundaries, topology, protocols,
  and flows. A choice with alternatives and consequences is an architectural
  decision record under `decisions`, never a second architecture truth. Follow
  [the ADR contract](adr.md) for current-only indexing and superseded archives.
- `docs/design` owns durable system-wide and feature design.

## Plugin-owned domains

Durable user-facing domain documents live under `docs/<domain>/<slug>`. The
domain has a `README.md` for scope, lifecycle, and item navigation. Every item
has a `README.md` that maps readers to the plugin-owned semantic authority,
such as `manifest.md` or `assets.md`, without duplicating it. Add
`provenance.json` when that semantic document is derived.

Essential owns the shared entrypoint templates under `templates/docs`. Specification owns its work-local specification and provenance templates. Each domain plugin owns its semantic templates. The minting workflow reads the owning template at the write decision; a copied shape in a consumer is not authoritative.

## Terminology and migration

Write for a competent junior engineer new to the repository. Define
project-specific or uncommon terms at first meaningful use and state the
actionable implication: what the reader must understand, decide, or do
differently. Add a glossary only when a term repeats across documents and a
local definition would create duplication.

New documents use the canonical paths. When a legacy durable directory
entrypoint is materially touched, rename it to `README.md` atomically with
inbound links, provenance outputs and hashes, generated fixtures, and tests.
Never leave both names as competing authorities. Task implementation state
becomes durable only when stable knowledge is promoted with provenance and
supersession links during completion.
