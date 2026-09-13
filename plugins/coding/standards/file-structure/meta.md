# File and Directory Structure Standards

_Requirements for discoverable domain files, coherent exports, bounded modules, and predictable environment configuration._

## Dependent Standards

Relationships below explain the selection owned by [INDEX.md](../INDEX.md).

- Naming Standards (standard:naming) - Defines symbol and operation naming; this standard owns filename semantics.
- TypeScript Standards (standard:typescript) - Defines module and barrel export behavior, including `TYP-MODL-04`.

## What's Stricter Here

This standard enforces requirements beyond common project conventions:

| Standard Practice | Our Stricter Requirement |
|---|---|
| Descriptive multiword filenames | **Name modules for their bounded domain, not their main export, and prefer one specific domain word** |
| Domain collisions and large-file splitting | **Relocate misplaced concerns first, then use a thin `<domain>.ts` entry with a same-base helper directory when a merge would exceed `max-lines`** |
| Flexible barrel exports | **Barrel-to-barrel exports use subpath aliases; barrel-to-leaf exports are explicit** |
| Environment samples optional | **Every used environment suffix has a documented `.env.<suffix>.example`** |

## Exception Policy

Allowed exceptions only when:

- False positive
- No viable workaround exists now

Required exception note fields:

- `rule_id`
- `reason` (`false_positive` or `no_workaround`)
- `evidence`
- `temporary_mitigation`
- `follow_up_action`

If exception note is missing, submission is rejected.

## Rule Groups

- `FST-NAME-*`: File casing, domain-derived basenames, path context, and naming exceptions.
- `FST-MODL-*`: Module cohesion, barrel boundaries, collision-safe nesting, and long-file decomposition.
- `FST-ENVR-*`: Environment file naming, samples, and override order.
