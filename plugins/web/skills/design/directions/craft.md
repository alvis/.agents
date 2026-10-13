# Craft

Read only the sections the current slice needs. This guide helps execute decisions well; it doesn't choose a style. Every item has a type, and that type decides how it binds:

- **Rule** — owned by a standard and linked here, never restated. Violating it is a finding.
- **Convention** — this repository's chosen practice. Follow it unless the project's own system differs.
- **Heuristic** — a contextual starting point. Apply it when its condition holds, and depart from it with a reason.

Correctness and accessibility rules live in the Design, CSS, and Theming standards (`web:standards/design/`, `web:standards/css/`, `web:standards/theming/`). Judgment criteria live in `web:directions/evaluation.md`.

## Distinctiveness diagnostics

These are heuristics for finding generic choices. They are not bans.

- **Logo swap.** Put another product's name and content into the composition. If nothing breaks, the composition carries no idea from this brief. That is a problem when the brief targets Distinctiveness, and it is fine for familiar utility patterns.
- **Unexamined defaults.** Check whether each of these was chosen or inherited: the accent hue, the display face, the hero's three-part stack, the identical card grid, the alternating section tints, the four-column footer. Any of them can be right. None should arrive by default.
- **Decoration test.** Remove the effect and see what is lost. Keep an effect that carries meaning, hierarchy, or brand. Cut one that only fills space.
- **Organising idea.** State the idea in one sentence a stranger could check against the screen, such as "the walking route is the reading order" or "every number shows its trend before its value". When no sentence fits, the concept is unresolved.

For ambitious expressive work, find the idea in the subject itself: its material, place, history, data, sound, or ritual. Then let one or two bold decisions carry it through type, scale, imagery, crop, colour, composition, or interaction. Keep everything else quiet enough for those decisions to land. Strong concepts usually commit fully to a few moves rather than half-commit to many.

## Composition and hierarchy

- **Heuristic:** decide the focal order before styling. A viewport has one primary focus, then supporting information and peripheral information. Size, weight, colour, position, and space all express that order.
- **Heuristic:** group by meaning with proximity, and separate groups with more space than you use inside them (DES-SPAC-02 owns the rule).
- **Heuristic:** density follows the task. Operators scanning records need dense, aligned, predictable layouts. First-time visitors need fewer, larger decisions. Reading surfaces need measure and rhythm.
- **Heuristic:** section boundaries are design decisions. Whitespace scale shifts, hairlines, colour bands, overlaps, full-bleed imagery, and angled or curved edges all work in context. Choose one deliberate boundary language per page. No variety quota applies.

## Typography and reading

- **Heuristic:** choose type from the brief's character and the content's needs, such as language coverage, numerals, x-height at UI sizes, and personality at display sizes. Be able to say why in one sentence. Common faces are legitimate when they fit; a font is never wrong because it is common.
- **Rule:** typeface count, type scale, line height, and measure are owned by DES-TYPO-01 and DES-TYPO-02.
- **Heuristic:** use `text-wrap: balance` on headings and short blocks, and `text-wrap: pretty` on body text. Leave code and pre-formatted text alone.
- **Heuristic:** tighten tracking as size grows, to roughly −0.02em at display sizes and about −0.01em at 20–28px, because default sidebearings are drawn for text sizes and read loose when enlarged. Positive tracking suits small caps and labels, not large headlines.
- **Heuristic:** use `font-variant-numeric: tabular-nums` for counters, timers, prices, and number columns.
- **Heuristic:** declare system fallbacks for every web font, use `font-display: swap` for critical fonts, and measure layout shift when fonts swap.
- Check real copy at its extremes: long names, translations, empty values, and the longest heading.

## Colour and surfaces

- **Rule:** contrast is owned by DES-COLR-02, measured through `web:directions/contrast-protocol.md`. Colour must never be the only signal (DES-COLR-01).
- **Convention:** components consume tier-2 `--ui-*` tokens through the two-tier mode chain (CSS-MODE-*, WT-*). Roles describe purpose, not size or hue.
- **Heuristic:** define palettes in OKLCH. Reduce chroma near lightness extremes. Tint neutrals slightly toward the brand hue when cohesion helps. Balance visual weight so the accent stays rare enough to mean something.
- **Heuristic:** put tinted text on coloured backgrounds rather than grey, by using a darker or lighter shade of the background hue.
- **Heuristic:** in light mode, make nested surfaces visibly distinct, with a clear lightness step or a shadow you can actually see. In dark mode, step surfaces by lightness, because drop shadows nearly vanish there.
- **Heuristic:** choose light, dark, or both from audience and context. Long sessions in low light, data-dense operator tools, and media browsing often favour dark. Daytime reading, clinical trust, and warm analog brands often favour light. Neither is a default. Runtime mode support is a product contract implemented through `web:css`.
- **Conditional checks with a reason:**
  - `backdrop-filter` glass is expensive on low-power devices. Profile it, and give it a solid fallback.
  - `background-clip: text` gradient text disappears in forced-colours mode. Keep a readable solid fallback.
  - Pill radius on large containers distorts their shape. Use the radius roles.
  - Wide coloured side borders read as an error state in many systems. Use them only when that is the meaning.

## Spacing and optical detail

- **Rule:** grid alignment and token use are owned by DES-SPAC-01 and DES-CONS-01.
- **Heuristic:** make nested radii concentric, so the outer radius is the inner radius plus the padding. When padding exceeds about 24px, treat the layers as separate surfaces, because the two curves stop reading as one shape.
- **Heuristic:** align optically, not just mathematically. Nudge icons until they look centred, use slightly less padding on the icon side of a button, and shift play triangles toward their visual weight.
- **Convention:** use role-named radius tokens (`--radius-control`, `--radius-card`, `--radius-modal`) and never size-tier names (WT-VARIANT-01). Fully round elements use the `9999px` literal.
- **Rule:** interactive targets follow DES-A11Y-02, which separates the WCAG 2.2 AA floor from the stricter project touch rule. Extend small visible controls with a centred hit area, and never let two hit areas overlap.

## Content, imagery, and data display

- **Rule:** action labels and error structure are owned by DES-COPY-01 and DES-COPY-02, and honest claims by DES-BRND-02.
- **Heuristic:** make each image do a job: explain, evidence, orient, or carry the brand idea. Choose crops, treatments such as duotone, grain, masks, or outlines, and radius as a direction decision, and apply them consistently.
- **Heuristic:** label missing assets honestly with descriptive placeholders that show their intended role. Never hide the gap behind generic stock filler.
- **Heuristic:** charts label axes and units, keep series colours consistent, pair colour with text, and offer a readable data equivalent. Missing, stale, and zero values each look different.
- **Rule:** images carry `alt` text and explicit dimensions, and images below the fold load lazily (DES-A11Y-02, DES-ICON-02).

## Interaction and motion

- **Rule:** DES-ICON-02 owns motion purpose, reduced motion, layout stability, and performance. DES-STAT-02 owns interactive states.
- **Heuristic:** animate the element whose state or spatial relationship changes, and leave unaffected content still. Deliberate stillness is valid. No entrance, signature effect, cursor, or scroll reveal is required.
- **Heuristic:** start with a fade, then a small translate plus fade, then a tiny scale plus fade for overlays. Depart from that only when a different relationship needs different motion. The same component type uses the same motion.
- **Heuristic:** use CSS transitions for interruptible state changes and keyframes for staged one-time sequences. Exits run shorter and softer than entrances. Apply hover styles inside `@media (hover: hover)`.
- **Convention:** never use `transition: all`; list the exact properties. Use `will-change` only for a property that measurably stutters, and remove it when the motion ends.

Starting values (heuristics: tune them for distance, size, and urgency):

| Property | Starting value | Why |
| --- | --- | --- |
| Entrance | 200–400 ms, `cubic-bezier(0.16, 1, 0.3, 1)` | Long enough to show where content came from; the fast start makes it feel responsive |
| Exit | 150–250 ms, `ease-in` | Leaving content matters less, so it clears faster than it arrived |
| Stagger | ~80–100 ms per semantic chunk, keeping reading order | Each step stays perceptible without making the last chunk wait |
| Icon swap | 120 ms opacity with `scale(0.9)` to `scale(1)` | Confirms the state change without delaying the next press |
| Page transition | ≤300 ms through View Transitions, with a reduced-motion fallback | Navigation is blocking, so continuity must not cost reading time |
| Scroll reveal | ≤24px translate, once only, never hiding usable content | A short travel signals arrival without moving text away from where the eye lands |
| Vocabulary | 2–3 motion families per page; add one only for a distinct relationship | Each family should mean one kind of relationship; more families stop carrying meaning |

### GSAP and Three.js

Reach for a motion library only when the direction needs what CSS and View Transitions cannot express: scroll-scrubbed timelines, pinned sequences, or real-time 3D. These rules bind whenever a library is used (convention):

| Rule | Why |
| --- | --- |
| Scope animations in `gsap.context(…, scopeEl)` and `ctx.revert()` on teardown | Live tweens across route changes leak and double-bind |
| Branch with `gsap.matchMedia()` on `(prefers-reduced-motion: reduce)` | matchMedia tears down the inactive branch when the preference flips |
| Kill or revert every ScrollTrigger; call `refresh()` after async layout shifts | Orphan triggers fire at stale positions and cause layout shift |
| Scrub `transform` and `opacity` only | Scrubbing layout properties produces long tasks every frame |
| Make the reduced-motion branch a calm composition, not a dead one | Reduced motion keeps meaning and final state |
| Lazy-load and code-split 3D, off the critical path | A blocking WebGL hero fails loading budgets |
| Cap the device pixel ratio at 1.5–2 | Uncapped DPR multiplies fragment work on dense screens |
| Pause render loops offscreen and on `visibilitychange` | Hidden loops waste battery and hurt interaction responsiveness |
| `dispose()` geometries, materials, textures, and the renderer | GPU resources are not garbage-collected |
| Ship a static fallback when WebGL is unavailable or reduced motion is set | 3D enhances an accessible baseline; it never replaces it |

### Stack consistency (convention)

Name one styling strategy per project (Tailwind, CSS Modules, or CSS-in-JS) and one icon family, and don't mix them on one element. Never double-animate one property through two systems, such as a JavaScript library together with a CSS transition. With Tailwind v4, keep class names static and complete so generation can find them.

## Responsive composition

- **Rule:** DES-RESP-01 owns viewport coverage and DES-RESP-02 owns touch behaviour.
- **Heuristic:** re-compose rather than shrink. Reorder by task priority, change density, re-crop images, and move navigation into a named control. Wide data scrolls inside its own labelled region, never across the whole page.
- **Heuristic:** handle full-bleed layouts with `env(safe-area-inset-*)`, scrolling overlays with `overscroll-behavior: contain`, and taps with `touch-action: manipulation`.

## Interaction patterns

- **Affordance.** Primary actions are real buttons with verb labels, and links have a signifier beyond colour. Rows that open show a hover state and an affordance. Controls sit near what they affect.
- **Lists.** One primary field per row, with the rest muted. Rows have consistent height and alignment. Search, filter, and sort come before the list. Active filters are visible and removable. Frequent actions are visible, and the long tail sits under "more".
- **Detail pages.** The title matches the object, key facts come first, and actions are grouped as primary, secondary, or destructive.
- **Forms.** Use sensible defaults and prefill, give hints before submission, show inline validation, group fields by meaning, and have one primary submit. Errors sit beside their fields, and input is preserved.
- **Settings.** Group by mental model, such as account, security, notifications, integrations, and appearance. Separate destructive actions and label them clearly.
- **Overlays.** Use a modal only when the action truly needs a focus lock. Otherwise prefer inline expansion, a detail panel, or a route, which keep browser back working.

### Practical HCI (heuristics)

- **Fitts.** The primary action is large and near the focus. Destructive actions are small and kept apart.
- **Hick.** Decision time grows with the number of equal choices, so group, search, or filter long option sets, and let defaults remove decisions. Navigation item limits belong to DES-NAVI-*.
- **Working memory.** Chunk forms and navigation, and carry context forward rather than asking users to remember it.
- **Norman.** Use visible signifiers, natural mapping, constraints before warnings, and immediate feedback. Close the execution gulf with clear actions and the evaluation gulf with clear results. Undo and confirmation catch slips; better labels and models prevent mistakes.
- **Peak-end.** The completion moment and the hardest step shape the memory of the whole flow, so invest there.

---

*Earlier versions adapted ideas from [Waza](https://github.com/tw93/Waza), [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (Apache 2.0), and [getdesign.md](https://getdesign.md) (MIT). Their context-free bans are deliberately not carried forward.*
