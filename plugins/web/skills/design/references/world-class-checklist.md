# World-Class Element Checklist

Every design this skill produces — and every board variant it shows the user —
covers this checklist as standard. These are not enhancements bolted on at the
end; they are part of the proposal, the active work design ("Motion, Transitions
& Separators"), and the evaluation. Verify the checklist row by row against
the rendered result: any missing applicable row is a defect, not a
nice-to-have. Motion values (durations, easings, distances, staggers) come
from [`guardrails.md`](guardrails.md#motion-specifics)
Motion Specifics — do not restate or invent them.
When a direction needs scroll-scrubbed or 3D motion, that file's Motion
Libraries section (GSAP/Three.js scoped teardown, DPR caps, offscreen pausing,
reduced-motion branches) is binding, not optional.

| # | Element | Standard |
|---|---------|----------|
| 1 | **Page transitions** | Route/page-level transition specced per direction (View Transitions API or equivalent); crossfade, shared-element morph, slide, or wipe — a deliberate choice, ≤300ms. |
| 2 | **Section entrance transitions** | Scroll-triggered reveals with stagger (IntersectionObserver or `animation-timeline`); ONE consistent reveal language per page, once-only. |
| 3 | **Section separators** | Every section boundary gets a deliberate treatment from the [Section Separator Vocabulary](guardrails.md#section-separator-vocabulary); "plain whitespace" must be a stated choice, never an omission; consecutive boundaries never repeat the same treatment. |
| 4 | **Hover-state animations** | Every interactive element — links, buttons, cards, nav items, images — has a designed hover treatment consistent with the motion language. No default-browser hover anywhere. |
| 5 | **Focus-visible states** | Designed `:focus-visible` on every interactive element — part of the visual language, not the browser default ring. |
| 6 | **Signature micro-interaction** | The one named in the direction summary, visible above the fold. |
| 7 | **Scroll behavior** | Sticky elements, scroll progress, and parallax are specced deliberately; parallax budget ≤1 layer. |
| 8 | **Reduced-motion fallbacks** | `prefers-reduced-motion` honored for every animation above — reduced, not merely disabled, where motion carries meaning. |
| 9 | **Loading, empty & error states** | Every dynamic content region has skeleton/loading, empty, and error designs. |
| 10 | **Image treatment** | Consistent radius + inset outline from [Surfaces](guardrails.md#surfaces) plus any direction-specific treatment (duotone, grain, mask). |
| 11 | **Responsive proof** | Verified at 375 / 768 / 1280 px; touch targets ≥44px; no horizontal scroll. |
| 12 | **Light/dark parity** | Both modes designed and contrast-verified per `../directions/contrast-protocol.md` — never light-only with an inverted afterthought. |

Applicability: full pages cover all 12; single components cover every row that
has a surface to land on (a button has no section separator; it still has
hover, focus, motion, states, responsive proof, and mode parity).
