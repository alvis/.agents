# Visual Grounding Prompts

`ground.sh` selects one section below by state name and embeds the screenshot's absolute path so Claude Code reads the image. Each prompt MUST end with the standard output contract so `ground.sh` can parse the response deterministically.

Cited standards (model should reference mentally when judging):
- `the React plugin accessibility standard` (WCAG 2.1 AA, focus indication, contrast)
- `the Web plugin design standard` (visual hierarchy, spacing, state distinctness)

## default

You are auditing the default rendered state of a Storybook story. Inspect the supplied screenshot and look for issues that violate WCAG 2.1 AA accessibility or the project's visual design standard. Specifically check:

- Text contrast against background (≥ 4.5:1 for body, ≥ 3:1 for large text and UI components).
- Truncation, overflow, or clipped content.
- Misaligned grid, inconsistent spacing, broken layout.
- Missing or placeholder content where real content is expected.
- Obvious render glitches (font fallback flashes, broken icons, missing images).

Report every problem you see, including ones you are unsure about — rate impact in the severity tag and your certainty that the screenshot shows it in the confidence tag, so an uncertain finding is recorded rather than dropped or overstated. Judge only what this screenshot shows: behaviour, hover, and focus are audited from their own screenshots.

Output format: first line must be either "ISSUES: none" or "ISSUES: found". If found, list each issue on its own line as "- [severity: low|medium|high] [confidence: confirmed|possible] <description>". Severity is impact; confidence is whether this screenshot actually shows the problem. A `possible` finding never becomes a release blocker, so an uncertain observation costs nothing to report.

## hover

You are auditing the hover state of a Storybook story. The supplied screenshot was taken while the primary interactive element receives a hover event. Compare what you see to the conventions for hover feedback:

- A hover state should be visually distinguishable from the default state (color shift, elevation, underline, cursor cue).
- The change must not destroy contrast — hover text must still meet WCAG 2.1 AA contrast.
- Layout must not shift jarringly (jumping by more than a pixel or two) on hover.
- Decorative-only hover (e.g. tooltip appearing off-screen, ghost outlines) counts as low-severity.

If the hover state looks identical to a typical default rendering, report it as a finding (the user expects discoverable affordance).

Output format: first line must be either "ISSUES: none" or "ISSUES: found". If found, list each issue on its own line as "- [severity: low|medium|high] [confidence: confirmed|possible] <description>". Severity is impact; confidence is whether this screenshot actually shows the problem. A `possible` finding never becomes a release blocker, so an uncertain observation costs nothing to report.

## active

You are auditing the active / pressed state of a Storybook story. The screenshot was taken while a mousedown is held on the primary interactive element. Check for:

- A visually distinct pressed appearance (depressed shadow, darker fill, inset border, scale-down).
- Contrast preservation — pressed-state colors must still meet WCAG 2.1 AA.
- No content disappearing or layout collapse during press.
- Press feedback consistent with platform conventions (buttons appear "pushed", links may invert).

If the active state is indistinguishable from default or hover, report it as a medium-severity finding.

Output format: first line must be either "ISSUES: none" or "ISSUES: found". If found, list each issue on its own line as "- [severity: low|medium|high] [confidence: confirmed|possible] <description>". Severity is impact; confidence is whether this screenshot actually shows the problem. A `possible` finding never becomes a release blocker, so an uncertain observation costs nothing to report.

## focus-visible

You are auditing the keyboard focus-visible state of a Storybook story. The screenshot was taken after a synthetic Tab key + focus call on the primary interactive element. Verify there is a visible focus indicator — ring, outline, underline, or color change — clearly distinguishable from the default state. The indicator must:

- Be perceivable (≥ 3:1 contrast against the adjacent background — WCAG 2.4.11/2.4.13).
- Be at least 2 CSS pixels thick on at least one side, or equivalent.
- Not be removed by `outline: none` without a replacement (a common antipattern).
- Not rely solely on color (form factor or shape must change too where possible).

Report a missing or weak focus indicator as a high-severity finding. Report a low-contrast indicator as medium severity.

Output format: first line must be either "ISSUES: none" or "ISSUES: found". If found, list each issue on its own line as "- [severity: low|medium|high] [confidence: confirmed|possible] <description>". Severity is impact; confidence is whether this screenshot actually shows the problem. A `possible` finding never becomes a release blocker, so an uncertain observation costs nothing to report.
