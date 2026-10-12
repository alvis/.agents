# Evaluation calibration examples

Illustrative only. These are worked instances of [the evaluation summary](../templates/evaluation.md) for calibrating judgment; none is an observed test result, and none prescribes a house style.

## A. Focused refinement

**Request:** a settings label overlaps its toggle below 360 px. The design system and implementation authorisation are clear.

**Route:** inherit the system. No moodboard, palette, or alternative screen. Fix the affected row, then check the narrow state, the long-label case, and keyboard order.

| Dimension | Target | Observed result | Target met |
| --- | --- | --- | --- |
| Product fit | Inherited | Inherited from `docs/design/system.md`; not reassessed | n/a |
| Distinctiveness | Inherited | Not reassessed: a familiar settings pattern is correct here | n/a |
| Coherence | Competent | Competent: the fix reuses the existing row component and spacing tokens | yes |
| Craft | Competent | Competent: the label wraps to two lines without orphaning, and the toggle stays aligned to the first baseline | yes |
| Task completion | Required checks verified | Ready: the toggle works at 320 px and at 200% zoom, keyboard order is unchanged, and the dark mode supported by the product passes contrast. Other settings screens are not rechecked | yes |
| Efficiency | Proportionate effort | One edit, one render pass; elapsed time unavailable | yes |

The report does not claim that untouched areas were reviewed.

## B. Expressive new direction

**Request:** a city's autumn cultural programme needs a campaign page. The target is Exceptional for Distinctiveness and Craft, and Strong for Product fit.

**Route:** the same real programme content (22 events, 6 venues, ticket links) goes into three cheap concepts, each one composition at desktop and phone:

1. **Poster wall** — a dense, overlapping typographic grid where each event is a poster fragment. Tradeoff: thrilling at desktop, but scanning by date suffers on a phone.
2. **Artwork-led** — one commissioned image per week becomes the page's chapter break. Tradeoff: depends on assets that don't exist yet, so placeholders are labelled.
3. **Place-led** — a map of the six venues orders the programme by walking route. Tradeoff: strongest Product fit for visitors planning an evening, and the map must have a list equivalent.

The place-led concept wins on Product fit, and the poster wall's typographic energy is kept as a named trait. Only the chosen concept gets responsive, accessible, working-flow treatment. Rejected concepts never become complete sites.

| Dimension | Target | Observed result (slice) | Target met |
| --- | --- | --- | --- |
| Product fit | Strong | Strong: the route ordering answers "what can I see tonight near me?" | yes |
| Distinctiveness | Exceptional | Exceptional: the walking route doubles as the page's reading order, and the type scale borrowed from the poster concept marks each venue; neither would survive a logo swap | yes |
| Coherence | Strong | Strong: one route line, one type system, one ticket affordance | yes |
| Craft | Exceptional | Strong: map labels collide at 390 px | no |
| Task completion | Required checks verified | **Not ready:** the map's list equivalent exists, but ticket links for 3 events are unverified | no |
| Efficiency | Proportionate effort | Three single-composition concepts and one slice; tool count measured, cost unavailable | yes |

**Next:** resolve the label collision and verify ticket links within the shared budget. Do not reopen the direction.

## C. Excellent utility and excellent expression

A conventional account-settings screen uses familiar forms, the existing type, and no animation. A colourful retro campaign uses dense imagery and expressive type. Both can be **Exceptional** for their own briefs:

- **Settings:** Exceptional Product fit comes from grouping by mental model, and every readiness check passes because inline validation preserves input, the destructive action is undoable, and the keyboard flow is complete. Its Distinctiveness target is Competent, and meeting it is correct.
- **Campaign:** Exceptional Distinctiveness comes from imagery and type that belong to this subject. It still fails Task completion if the signup form drops input on error.

Neither minimalism nor maximalism earns a bonus or a penalty. Judge clarity, purpose, coherence, execution, and working access.

## Illustrative report: polished but broken

| Dimension | Target | Observed result | Target met |
| --- | --- | --- | --- |
| Product fit | Strong | Strong: results and actions reflect the intended search task | yes |
| Distinctiveness | Competent | Competent: product-specific information design within a familiar pattern | yes |
| Coherence | Strong | Strong: established components, terminology, and states are consistent | yes |
| Craft | Strong | Strong: hierarchy and responsive composition are well resolved | yes |
| Task completion | Required checks verified | **Not ready:** the filter changes its chip but not the results; the mobile keyboard journey is unverified | no |
| Efficiency | Proportionate effort | Two layout studies and one implementation; exact model cost unavailable | yes |

The useful next step is to repair and verify filtering and keyboard behaviour, not to restart the visual direction.
