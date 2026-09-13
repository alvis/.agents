# File and Directory Structure Standards: Violation Scan

Any single violation blocks submission by default. Protocol: `essential:directions/standards.md`.

## Quick Scan

- DO NOT use non-kebab-case source filenames except PascalCase React component files and tooling-prescribed names [`FST-NAME-01`]
- DO NOT name a module after its primary exported function when a stable domain basename identifies the concern, unless a framework or tool requires a symbol-matched filename [`FST-NAME-02`]
- DO NOT repeat type context already supplied by a typed parent directory or use a generic single word when a specific domain name is available [`FST-NAME-03`]
- DO NOT put unrelated exports in one module [`FST-MODL-01`]
- DO NOT put implementation logic in an index or violate the barrel-to-barrel and barrel-to-leaf export boundary [`FST-MODL-02`]
- DO NOT split an over-limit file before relocating misplaced concerns, merge a colliding domain concern into `<domain>.ts` when the result would exceed `max-lines`, or scatter remaining sub-domains into sibling files instead of `<domain>/<sub-domain>.ts` with `<domain>.ts` as the entry [`FST-MODL-03`]
- DO NOT commit environment configuration without the required documented example file or violate the defined override order [`FST-ENVR-01`]

## Rule Matrix

| Rule ID | Violation | Bad Examples |
|---|---|---|
| `FST-NAME-01` | Wrong file casing | `UserService.ts`; `user_service.ts`; `userservice.ts` |
| `FST-NAME-02` | Export-derived basename | `compute-similarity.ts` exporting only `computeSimilarity()` |
| `FST-NAME-03` | Generic or path-redundant name | `services/user-service.ts`; `utils.ts`; `helpers.ts` |
| `FST-MODL-01` | Unrelated exports share a module | User validation and currency formatting in one file |
| `FST-MODL-02` | Invalid index/barrel boundary | Logic in `index.ts`; `export * from './user-service'` |
| `FST-MODL-03` | Unrelocated or arbitrary long-file split | Split before relocating misplaced concerns; `similarity-vector.ts` beside `similarity.ts` when merging would exceed `max-lines`; `anthropic.schema.ts` | <!-- doc-path-gate: ignore -->
| `FST-ENVR-01` | Environment contract incomplete | `.env.production` without `.env.production.example`; undocumented variables |
