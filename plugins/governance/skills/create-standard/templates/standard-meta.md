# [Standard Title]

_[Brief description of what this standard covers and its purpose]_

<!-- INSTRUCTION: Replace all [placeholder] values with actual content -->
<!-- INSTRUCTION: This file is read for rationale and exceptions. Keep it concise — no code examples, violation lists, or patterns -->
<!-- INSTRUCTION: Mandatory inputs, runtime/tool requirements, and detection criteria must be reachable through scan.md -->

## Dependent Standards

<!-- INSTRUCTION: Explain related standards; applicability belongs only in the owning standards INDEX.md -->
<!-- INSTRUCTION: Use the plugin reference format:
     - Same plugin: standard:name (e.g., standard:typescript)
     - Cross-plugin: `plugin:<plugin>:standard:<standard>` (e.g., `plugin:coding:standard:typescript`)
-->

Relationships below explain the selection owned by [INDEX.md](../INDEX.md).

- [Related Standard 1] (standard:[name]) - [how it relates to this standard]
- [Related Standard 2] (standard:[name]) - [how it relates to this standard]

## What's Stricter Here

<!-- INSTRUCTION: Document requirements that exceed typical industry standards -->
<!-- INSTRUCTION: Use the comparison table format below -->

This standard enforces requirements beyond typical [industry/framework] practices:

| Standard Practice                     | Our Stricter Requirement                        |
|---------------------------------------|-------------------------------------------------|
| [Common industry approach]            | **[Your stricter requirement]**                 |
| [Another common approach]             | **[Your stricter requirement]**                 |

## Exception Policy

<!-- INSTRUCTION: Keep this section as-is unless your standard needs custom exception reasons -->
<!-- INSTRUCTION: The two allowed reasons (false_positive, no_workaround) cover most cases -->

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

<!-- INSTRUCTION: Define rule group prefixes using the format: PREFIX-GROUP-* -->
<!-- INSTRUCTION: Use a short uppercase prefix (3 letters) derived from the standard name -->
<!-- INSTRUCTION: Group rules by logical category (e.g., core, coverage, structure) -->

- `[PFX]-[GRP1]-*`: [Description of what this rule group covers].
- `[PFX]-[GRP2]-*`: [Description of what this rule group covers].
- `[PFX]-[GRP3]-*`: [Description of what this rule group covers].
