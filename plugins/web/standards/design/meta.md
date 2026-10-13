# Design Standards

_Compact rules for visual hierarchy, typography, color, spacing, consistency, accessibility, states, navigation, content, responsiveness, iconography, and branding._


## What's Stricter Here

This standard enforces requirements beyond common design practices:

| Standard Practice                          | Our Stricter Requirement                                                  |
|--------------------------------------------|---------------------------------------------------------------------------|
| Visual appeal is subjective                | **Measurable framework: hierarchy levels, scan patterns, CRAP principles** |
| Typography choices are flexible            | **Max 2–3 typefaces, enforced type scale, line-height/line-length ranges** |
| Contrast "looks fine"                      | **WCAG 2.2 AA floor: 4.5:1 normal text, 3:1 large text and UI components** |
| Spacing is eyeballed                       | **4px/8px base grid; all spacing values must land on grid**               |
| Hardcoded values are common                | **Design tokens (CSS variables) required; hardcoded values flagged**      |
| Accessibility is a nice-to-have            | **WCAG 2.2 AA floor (24px target minimum) plus a stricter project rule: 44px touch targets** |
| States are designed ad hoc                 | **Applicable state inventory: every reachable loading, empty, error, success, permission, and domain state** |
| Navigation structure varies                | **Organized by user mental model; ≤7 top-level items; location indicated** |
| Button labels like "OK" / "Submit" are fine | **Action-verb labels; layered help text; error = problem + cause + fix** |
| Desktop-first is acceptable                | **Supported range from 320px with content-driven breakpoints; no horizontal page scroll** |
| Mixed icon styles are tolerated            | **Single icon family; no emoji as UI icons; motion stays purposeful, accessible, and performance-checked** |
| Brand is optional polish                   | **Deliberate brand expression; no dark patterns; ethical defaults**       |

## Exception Policy

Allowed exceptions only when:

- False positive
- No viable workaround exists now
- Brand deviation required by client brand guidelines

Required exception note fields:

- `rule_id`
- `reason` (`false_positive`, `no_workaround`, or `brand_deviation`)
- `evidence`
- `temporary_mitigation`
- `follow_up_action`

If exception note is missing, submission is rejected.

## Rule Groups

- `DES-HIER-*`: Visual hierarchy and layout — clear importance levels, scan patterns, CRAP principles, task-first identification.
- `DES-TYPO-*`: Typography — typeface limits, type scale, line-height, line-length, minimum mobile body size.
- `DES-COLR-*`: Color and contrast — intentional palette, WCAG AA contrast ratios, semantic color usage, no color-only indicators.
- `DES-SPAC-*`: Spacing and grid — 4px/8px base grid, consistent margins/padding, proximity-based grouping, alignment.
- `DES-CONS-*`: Consistency and design tokens — CSS variable adoption, component reuse, border-radius/shadow uniformity, naming consistency.
- `DES-A11Y-*`: Accessibility — keyboard navigation, visible focus indicators, ARIA labels, form labels, alt text, touch targets ≥44×44 CSS px.
- `DES-STAT-*`: States and feedback — the applicable inventory of loading, empty, error, success, permission, and domain states; hover/active/disabled/focus on interactive elements.
- `DES-NAVI-*`: Navigation and IA — mental-model grouping, ≤7 top-level items, breadcrumbs, search/filter, current-location indication.
- `DES-COPY-*`: Content and microcopy — action-verb labels, help text layering (L0–L3), error message clarity, no jargon, consistent terminology.
- `DES-RESP-*`: Responsiveness — the viewport coverage contract, content-driven breakpoints, mobile touch targets, content reflow, no horizontal page scroll.
- `DES-ICON-*`: Imagery, icons, and motion — single icon set, no emoji as icons, labeled ambiguous icons, purposeful subordinate animation, reduced-motion behavior, layout stability, and performance checks.
- `DES-BRND-*`: Branding — deliberate brand expression, no dark patterns, ethical defaults, transparent data collection.
