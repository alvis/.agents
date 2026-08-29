---
last_verified: <ISO-8601 date>
revalidate_on:
  - <named trigger>
---

# <Initiative name> manifest

A workspace anchor is a stable locator plus an immutable revision: it lets a
reader recover the exact participating workspace state. `last_verified` is
the date this manifest was checked; any named `revalidate_on` trigger requires
checking it again before relying on its dependencies.

## Participating streams

| Stream | Workspace anchor | Revision |
|---|---|---|
| `<work-id>` | <anchor locator> | <immutable revision> |

## Shared contracts

| Contract | Authoritative path | Revision |
|---|---|---|
| <Brief, voice, or naming contract> | <path> | <immutable revision> |

## Dependencies

| Upstream | Downstream | Contract | Last validated revision |
|---|---|---|---|
| `<work-id>` | `<work-id>` | <dependency> | <immutable revision> |

## Milestones

| Milestone | Gated streams | Status |
|---|---|---|
| <Milestone> | `<work-id>` | Pending |
