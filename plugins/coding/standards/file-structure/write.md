# File and Directory Structure Standards: Compliant Patterns

## Key Principles

- Use kebab-case except for PascalCase React component files.
- Name modules after their bounded domain or concern, independently of the main export function.
- Keep exported function identifiers verb-first; filename choice and function naming are separate decisions.
- Let typed directories carry type context; prefer one specific domain word.
- Keep only related exports together.
- Keep index files free of implementation logic and preserve barrel boundaries.
- Relocate misplaced concerns before splitting a long file.
- Document every environment variable and option in the matching example file.

## Core Rules Summary

### Naming (FST-NAME)

- **FST-NAME-01**: Use kebab-case for ordinary files, PascalCase for React components, and source-matching `.spec` names for tests.
- **FST-NAME-02**: Name a module for its primary bounded domain or concern, not for its primary exported function; preserve framework- or tooling-required filename conventions.
- **FST-NAME-03**: Prefer one specific domain word and omit a type suffix already expressed by a typed directory; retain a qualifier only when one word is ambiguous or a framework or tool requires it.

### Modules (FST-MODL)

- **FST-MODL-01**: Keep multiple exports together only when they share one domain concern.
- **FST-MODL-02**: Keep logic out of index files; use wildcard subpath aliases between barrels and explicit named exports from leaves, per `TYP-MODL-04`.
- **FST-MODL-03**: Relocate misplaced concerns before splitting. If a desired `<domain>.ts` already exists and merging a coherent concern would exceed the project's `max-lines`, or the entry remains over that limit, keep `<domain>.ts` as a thin public entry and place short-named sub-domains under `<domain>/`.

### Environment (FST-ENVR)

- **FST-ENVR-01**: Use supported `.env` suffixes, provide a documented matching example for applications that consume variables, and preserve the override order.

## Patterns

### Naming by Context and Export

```text
services/user.ts          # typed directory supplies "service"
lib/user-service.ts       # suffix required without typed directory
similarity.ts             # domain entry, even when it exports computeSimilarity()
similarity/vector.ts      # colliding sub-domain; similarity.ts remains the entry
user-validator.ts         # class UserValidator
services/user.spec.ts     # test matches its source
UserProfile.tsx           # React component
database.config.ts        # tooling suffix retained
types.ts                  # co-located module types
types/user.ts             # multiple type modules
```

Keep more than one word when a single word is ambiguous (`api-client.ts`) or when tooling or a framework requires it. Do not turn a function identifier into the filename (`computeSimilarity` belongs in `similarity.ts`, not `compute-similarity.ts`). If `<domain>.ts` already exists and merging the coherent concern would exceed `max-lines`, place the concern in `<domain>/<sub-domain>.ts` and keep `<domain>.ts` as the public entry. Avoid interface prefixes and implementation suffixes such as `IUserService.ts` and `UserServiceImpl.ts`.

### Barrel Boundaries

```typescript
// barrel to barrel: subpath alias
export * from "#auth";

// barrel to leaf: explicit code exports, then types
export { UserService } from "./user-service";
export type { User } from "./types";
```

Do not define classes, functions, or business logic in `index.ts`. Do not wildcard-export a leaf or duplicate another barrel's surface with explicit picks.

### Domain Collisions and Long-File Decomposition

When a desired domain file collides with an existing file, or a file exceeds the configured `max-lines`:

1. Move logic that belongs to an existing or proper new module to its real home, especially reused logic or a distinct standalone concern.
2. If the existing `<domain>.ts` can absorb the coherent concern without exceeding the limit, merge it there; otherwise keep `<domain>.ts` as the thin public entry/orchestrator and put the sub-domain under `<domain>/`.
3. Give nested helpers short contextual names because the folder already supplies the domain.

```text
similarity.ts                  # thin entry and stable public surface
similarity/vector.ts           # vector sub-domain
similarity/phrase.ts           # phrase sub-domain
```

Never create sibling fragments such as `similarity-vector.ts`, derive a basename from the exported function (`compute-similarity.ts`), or repeat the domain in `similarity/similarity-vector.ts`. <!-- doc-path-gate: ignore -->

### Environment Files

Supported forms are `.env`, `.env.<environment>`, `.env.<platform>`, and `.env.<platform>.<environment>`, including local variants. A consuming application provides `.env.<suffix>.example` with an explanation and allowed options for every line. Local override files are never committed.

Load later entries over earlier ones:

1. `.env`
2. `.env.local`
3. `.env.<platform>`
4. `.env.<platform>.local`

Examples include `.env.development`, `.env.production`, `.env.test`, and `.env.supabase.local`.

## Anti-Patterns

- Names that repeat the directory, such as `repositories/user-repository.ts`.
- Names derived mechanically from the main export, such as `compute-similarity.ts` for `computeSimilarity()`.
- Collision workarounds that widen a sibling filename, such as `similarity-vector.ts`, when the nested entry pattern is required.
- Vague catch-alls such as `utils.ts` or `helpers.ts`.
- Deep nesting when a flatter structure keeps ownership clear; treat three to four levels as the navigation warning point, not a license to obscure domain boundaries.
- Unrelated exports grouped only to reduce file count.
- Helper fragments scattered beside the public entry.

## Quick Decision Tree

1. Is it a React component? Use PascalCase; otherwise use kebab-case (`FST-NAME-01`).
2. What bounded domain or concern does the module own? Name the file for that domain, independent of its main export (`computeSimilarity` → `similarity.ts`) (`FST-NAME-02`).
3. Does the parent directory already name the type? Drop that suffix unless one word is ambiguous or a framework or tool requires a qualifier (`FST-NAME-03`).
4. After relocating unrelated concerns, can this coherent concern be merged into `<domain>.ts` without exceeding `max-lines`? If so, create or merge into that file; if an existing `<domain>.ts` makes a separate file impossible and the merge would exceed the limit, or the relocated entry remains over the limit, keep `<domain>.ts` as the entry and nest `<domain>/<sub-domain>.ts` (`FST-MODL-03`).
5. Are exports unrelated? Split them into their real domain homes (`FST-MODL-01`).
6. Is this an index or barrel? Apply the barrel boundary and keep logic out (`FST-MODL-02`).
7. Is the file over `max-lines` after relocation? Use the thin-entry plus helper-directory pattern (`FST-MODL-03`).
8. Does the application consume environment variables? Add and document the matching example, then preserve override order (`FST-ENVR-01`).
