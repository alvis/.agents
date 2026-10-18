# DOC-CONT-07: Keep Numbers Essential and Stable

## Intent

Mention a number in documentation, JSDoc, or comments only when its exact value is essential to understanding the behavior, constraint, or rationale and is expected to remain stable. This applies to digits and spelled-out numbers. Current package, provider, helper, or test counts duplicate repository inventory and become stale as the implementation evolves.

## Detection

For each numerical claim in explanatory prose, ask whether removing the exact value loses necessary meaning and whether ordinary implementation changes would require updating it. A claim fails if the number is unnecessary or expected to change, even when its current value is correct. Do not treat writing the number as a word as a fix.

## Fix

Describe the relevant collection or responsibility without its incidental count:

| Surface | Avoid | Prefer |
| --- | --- | --- |
| README | It installs all seven production data packages | It installs all production data packages |
| JSDoc | `/** installs all seven production data packages */` | `/** installs all production data packages */` |
| Comment | `// all 7 providers must be available before provisioning` | `// all configured providers must be available before provisioning` |

Keep the responsibility or rationale when removing a number. If a reader needs a value that is expected to change, reference its authoritative configuration, constant, or generated inventory instead of copying it into prose.

## Essential Stable Values

Keep exact values that explain a stable specification or protocol requirement, such as the digest width in `// require 256 bits because the wire format specifies SHA-256`. Such a value carries meaning that would be lost if replaced with an unspecified quantity. An incidental count does not become essential merely because it has not changed recently.

List numbering and executable numeric literals in code examples are not numerical claims in explanatory prose. Review prose surrounding those examples under this rule.

## Related

DOC-CONT-01, DOC-CONT-02, DOC-LIFE-04
