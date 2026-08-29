# Discover presentation features — the migration record

The `discover` skill has finished migrating from a hand-authored HTML pipeline
to a JSON-driven renderer. This document is the reconciliation that made the
target set choosable: it lists **every feature across all three reference
points**, so what the renderer now owes the reader was decided deliberately
rather than discovered missing.

It reads as history. The 🏛️ column describes a pipeline whose files have since
been deleted, and its line citations are evidence of what that system did, not
paths to open. What survives is the `Pick` column: the rows ticked there are
the set the renderer was built to carry, and they are the list any review of
that build is owed.

## The three columns

| Column | What it is | Where it lived |
| --- | --- | --- |
| 🏛️ **Had** | The legacy pipeline: a composer plus a shared runtime. Removed | `scripts/build-artifact.ts`, `assets/html/discovery.js` (2,282 lines), `assets/html/discovery.css` (5,255 lines), 15 boards under `examples/src/` | <!-- doc-path-gate: ignore -->
| 🆕 **New** | The JSON renderer, as it stood when this was written: two files, four board kinds | `scripts/render-page.ts` (1,268 lines), `scripts/page-diagram.ts` (726 lines) | <!-- doc-path-gate: ignore -->
| 🔍 **Ref** | The single-file page held up as clearer to navigate | `examples/reference/` sibling; archived as `artifacts/rival-specimen.html` (1,007 lines) | <!-- doc-path-gate: ignore -->

## Legend

| Mark | Meaning |
| --- | --- |
| ✅ | Implemented and in use |
| 🟡 | Partial, or a one-off rather than a house convention |
| 📄 | **Documented but never implemented.** Read the Notes before picking |
| ❌ | Absent |
| ➕ | Neither system has it — a new request |

## Three things to know before picking

**1. The 📄 rows are the trap.** `references/features.md` §H presents a
validation-mapping table crediting `scripts/build-artifact.ts` with a <!-- doc-path-gate: ignore -->
`_validate()` that enforces the token whitelist, dual-theme completeness, stray
hex, `${…}` literals and self-containment, and crediting
`scripts/test-html-templates.ts` with asserting the board-set block, selection <!-- doc-path-gate: ignore -->
annotation, density scale and Mermaid wiring.

No `_validate()` exists in `build-artifact.ts` — all 509 lines were read.
`test-html-templates.ts` contains zero occurrences of `data-board-set`,
`selection`, `annotation`, `grid-density` or `data-mermaid`; it checks that
required **files exist**, not that features are wired. Every 📄 row below was
therefore an intention, not a guarantee. Picking one means building it, not
restoring it.

**2. Inline devices force a schema change.** Provenance pills mid-sentence,
`data-term` glossary spans, `<mark>` inside `<pre>`, and source-ref chips are
all *inline* — they live inside a sentence, not beside it. The renderer's
`prose` block is a plain string passed through `escapeHtml`
(`render-page.ts:675-682`) and there is **no HTML pass-through anywhere**.
Picking any row marked **⚠ inline** means adopting either a rich-text
sub-format in the JSON or a restricted inline grammar, which changes the
contract for every existing example. These rows are cheap to want and expensive
to have.

**3. Two corrections to earlier statements.**

- **There is no Mermaid in the current samples.** All four contain zero
  occurrences. `page-diagram.ts` is a bespoke inline-SVG layout engine over
  `nodes`/`edges`. Mermaid exists only in the legacy CDN path. Mermaid is owed,
  not delivered.
- **The reference page is ours.** Its embedded `WebResourceURL` decodes to the
  `prospector` repository (`.state/works/signal-to-execution/plan.html`), and its
  HTML is byte-identical to `artifacts/rival-specimen.html`. It is not a <!-- doc-path-gate: ignore -->
  third-party design, so its choices carry no external authority — only whatever
  merit they have on inspection.

---

## A. Shell and layout

| Feature | 🏛️ | 🆕 | 🔍 | Pick | Notes |
| --- | :-: | :-: | :-: | :-: | --- |
| Stable page root with page id | ✅ | ✅ | ❌ | ☐ | Legacy `data-page-id` keys local state; renderer emits `data-page-id`; ref has none |
| Masthead: eyebrow, headline, lede | ✅ | ✅ | ✅ | ☐ | All three agree. Ref caps lede at 78ch |
| Masthead stat strip | ✅ | ✅ | ✅ | ☐ | Renderer `metrics` block; ref uses 6 header chips |
| Masthead aside / true margin column | ✅ | ❌ | ❌ | ☐ | `discovery.css:411-419`, all 15 boards. Second grid column beside the masthead |
| Docbar with title and reply quick-link | ✅ | 🟡 | ✅ | ☐ | Renderer puts the reply in the drawer instead of a top bar |
| Numbered sections | ✅ | ✅ | ✅ | ☐ | Ref numbers inline in the `h2` (`01`–`08`) |
| Section title above its content | ✅ | ✅ | ✅ | ☐ | Was request P3; already true in the renderer |
| Footer with sources and live-check flags | ✅ | ❌ | ❌ | ☐ | Ref has no `<footer>` at all |
| Reading-measure cap on prose | ✅ | ✅ | ✅ | ☐ | Renderer caps via `--cap`; ref uses 74–78ch |
| Content column max width | ✅ | ✅ | ✅ | ☐ | Renderer `--cap: 78rem`; ref `1080px`. Request P1 was "too narrow" |
| Column density scale (tile/compact/prose/wide) | 📄 | ❌ | ❌ | ☐ | `components.md:611-623` defines 8/14/22/30rem via `data-grid-density`. Never enforced |
| Free-pattern section escape hatch | ✅ | ❌ | ❌ | ☐ | Legacy allows bespoke markup in a plain annotatable section. A closed JSON schema cannot |
| Two-up comparison grid | ✅ | ❌ | ✅ | ☐ | Ref `.grid2`, collapses at 760px |
| Generic panel/surface primitive | ✅ | ✅ | ✅ | ☐ | |

## B. Navigation and wayfinding

| Feature | 🏛️ | 🆕 | 🔍 | Pick | Notes |
| --- | :-: | :-: | :-: | :-: | --- |
| Section navigation | ✅ | ✅ | ✅ | ☐ | Legacy right rail; renderer inside drawer; ref sticky horizontal strip |
| Sticky always-visible TOC | ❌ | ❌ | ✅ | ☐ | Ref keeps all 8 destinations on screen, scrolls horizontally rather than wrapping |
| Scroll-spy active state | ✅ | ✅ | ❌ | ☐ | Ref has **none** — zero `aria-current`, no `IntersectionObserver`. A regression in the "clearer" page |
| Bottom status bar | ❌ | ✅ | ✅ | ☐ | Request P2. Renderer's is 48px and expands |
| Status bar expands to a drawer | ❌ | ✅ | ❌ | ☐ | Request P2 revised. Confirmed bottom-anchored and full-width at 1440px |
| Numeric section selector, expands on hover | ❌ | ❌ | ❌ | ☐ | Request P4. Built in neither |
| Board set — multi-board navigation | ✅ | ❌ | ❌ | ☐ | One entry per board of a run, `aria-current` by runtime, hidden below two entries |
| Board hub page | ✅ | ❌ | ❌ | ☐ | A 15th direction whose whole job is indexing sibling boards |
| Live counters in the nav | ✅ | ✅ | ✅ | ☐ | Legacy counts decisions and notes; renderer counts unanswered; ref counts items/approved |
| Filter chips | ✅ | ❌ | ❌ | ☐ | `aria-pressed` with live counts. **Dims rather than hides**, so counts stay truthful |
| Pip index for card stages | 📄 | ❌ | ❌ | ☐ | State-aware index dots. Documented in `features.md` §D; not implemented |
| Keyboard `←`/`→` between cards | 📄 | ❌ | ❌ | ☐ | Documented in `features.md` §D; not implemented |
| Keyboard `A` to accept | 📄 | ❌ | ❌ | ☐ | Same |
| Anchor flash on jump | ✅ | ❌ | ❌ | ☐ | Skipped entirely under reduced motion |
| Deep-link to an individual item | 🟡 | 🟡 | ❌ | ☐ | Renderer anchors sections only; ref card ids are `data-id`, so `#D7` does not resolve |
| Escape collapses / returns focus | ❌ | ✅ | ✅ | ☐ | Ref gets it free from native `<dialog>` |

## C. Theming — the stated deal breaker

| Feature | 🏛️ | 🆕 | 🔍 | Pick | Notes |
| --- | :-: | :-: | :-: | :-: | --- |
| **Per-product token override from data** | ✅ | ❌ | ❌ | ☐ | **The gap.** Legacy `<style data-board-theme>` overlay survives compilation (`build-artifact.ts:55-56, 319-320, 350`). Renderer has no theme field at all |
| All colour via tokens, none inline | ✅ | ✅ | 🟡 | ☐ | Ref declares 13 tokens, then writes **17 more hex literals outside them** (16 distinct values) |
| Light and dark both defined | ✅ | ✅ | ❌ | ☐ | Ref is dark-only, hardcoded, no `prefers-color-scheme` |
| `prefers-color-scheme` respected | ✅ | ✅ | ❌ | ☐ | Renderer redeclares 22 colour tokens in `oklch()` |
| `data-theme` manual override | ✅ | ❌ | ❌ | ☐ | Legacy supports both directions |
| Per-board accent so companions read as a set | ✅ | ❌ | ❌ | ☐ | Whitelisted overlay: accent, `--ui-verdict-*`, `--ui-status-*`, `--ui-k-*` ramps |
| Semantic ramps with soft/ink variants | ✅ | 🟡 | ❌ | ☐ | Renderer has a fixed accent/positive/amber/critical quartet, not author-extensible |
| Token whitelist validation | 📄 | ❌ | — | ☐ | Credited to `_validate()`, which does not exist |
| Stray-hex detection | 📄 | ❌ | — | ☐ | Same. Zero `hex` references in `build-artifact.ts`. For scale: the ref page would fail this check 17 times |
| Dual-theme completeness check | 📄 | ❌ | — | ☐ | Same |
| Contrast floor guaranteed in both themes | 📄 | ❌ | ❌ | ☐ | **Fully-open override moves this to whoever authors the theme.** The builder will not guarantee readability |
| Specimen brand re-point, scoped | ✅ | ❌ | ❌ | ☐ | `[data-specimen]` re-points `--ui-*` to a product's real palette; the one place a hex literal is sanctioned |
| Typography tokens | ✅ | ✅ | 🟡 | ☐ | Ref tokenises mono only; sans is a raw system stack |
| Radius and spacing tokens | ✅ | ✅ | ❌ | ☐ | Ref uses literals throughout — 9 distinct `border-radius` values, no scale |
| Reduced-motion kill switch | ✅ | ✅ | ❌ | ☐ | Ref has zero `prefers-reduced-motion` |

## D. Annotations — reader-authored

Every row here is ✅/❌/❌: the legacy runtime has the whole system, and neither
other page has any of it. This is the single largest block of lost function.

| Feature | 🏛️ | 🆕 | 🔍 | Pick | Notes |
| --- | :-: | :-: | :-: | :-: | --- |
| Per-section note | ✅ | ❌ | ❌ | ☐ | Runtime injects a trigger into every section; label cycles Add → Edit (`discovery.js:318-369`) |
| **Selection-scoped notes** | ✅ | ❌ | ❌ | ☐ | Select text inside a section, annotate *that passage*. Stored separately from the section note and additive to it |
| Floating "Annotate selection" pill | ✅ | ❌ | ❌ | ☐ | Viewport-clamped, positioned at the selection end. Uses `mousedown` + `preventDefault` so the selection survives the click |
| Keyboard and touch path for selection notes | ✅ | ❌ | ❌ | ☐ | Section trigger re-labels to "Note on selection"; `pointerdown` arms the quote before touch collapses it |
| `n` shortcut on a live selection | ✅ | ❌ | ❌ | ☐ | Guarded against form fields and contentEditable |
| Grapheme-safe quote truncation | ✅ | ❌ | ❌ | ☐ | `Intl.Segmenter` at 240 chars so an emoji is never cut mid-surrogate |
| Quote shown in the dialog | ✅ | ❌ | ❌ | ☐ | The note records *what it is about*, not a copy of it |
| One shared annotation dialog | ✅ | ❌ | ❌ | ☐ | `form method="dialog"`, `showModal()` with a fallback |
| Annotation summary panel | ✅ | ❌ | ❌ | ☐ | `role="note"`, built with safe DOM APIs, never `innerHTML` |
| Per-excerpt edit and remove | ✅ | ❌ | ❌ | ☐ | Emptying a note deletes it |
| Per-card note | ✅ | 🟡 | ✅ | ☐ | Renderer has one only on a `decision` set to Change; ref has one per rejected card |
| Notes reach the generated reply | ✅ | 🟡 | ✅ | ☐ | Legacy nests excerpts under their section as quote + indented note |
| Note count in the navigation | ✅ | 🟡 | ✅ | ☐ | Renderer counts unanswered questions, not notes |
| Clear-all behind a confirm | ✅ | ❌ | ❌ | ☐ | Wipes answers and annotations together |

## E. Annotations — author-authored

Teaching devices the author places. Distinct from section D throughout.

| Feature | 🏛️ | 🆕 | 🔍 | Pick | Notes |
| --- | :-: | :-: | :-: | :-: | --- |
| Numbered pins over a mockup or diagram | ✅ | ❌ | ❌ | ☐ | 2 boards. Positioned by `--pin-x`/`--pin-y` percentages; real buttons, 44px targets |
| Pin ↔ note-card synchronized highlight | ✅ | ❌ | ❌ | ☐ | Hover or focus either side lights both. Reference-counted so overlapping hover+focus never drops early |
| Pin layer outside the brand scope | ✅ | ❌ | ❌ | ☐ | Sibling of `[data-specimen]`, so a brand re-point never recolours the teaching pins |
| No leader lines | ✅ | — | — | ☐ | A **ruled decision**, documented so it is not "restored" later as a fix |
| Glossary term ↔ definition sync | ✅ | ❌ | ❌ | ☐ | 1 board, 11 term spans. ⚠ inline |
| Diagram node → detail card | ✅ | 🟡 | ❌ | ☐ | Legacy clones a `<template>` into a sticky `aria-live` host; renderer offers only an SVG `<title>` |
| Code-pair highlight across two panels | ✅ | ❌ | ❌ | ☐ | One-off, 1 board |
| Code-map region ↔ snippet | ✅ | ❌ | ❌ | ☐ | One-off, 1 board |
| Diff comments anchored to a line | ✅ | ❌ | ❌ | ☐ | One-off, 4 instances. Review-comment bubble on a rendered diff |
| Annotated code with `<mark>` | ✅ | ❌ | ❌ | ☐ | One-off. ⚠ inline |
| Expandable detail disclosure | ✅ | ❌ | ✅ | ☐ | Ref uses native `<details>` with a rotating custom marker and a classification pill on the summary row |

## F. Evidence and provenance

| Feature | 🏛️ | 🆕 | 🔍 | Pick | Notes |
| --- | :-: | :-: | :-: | :-: | --- |
| **Provenance pills** | ✅ | ❌ | 🟡 | ☐ | **Strongest legacy convention: 9 boards, ~79 instances.** observed/inferred/assumed/decided/open/approved. ⚠ inline |
| Provenance on table rows | ✅ | ❌ | 🟡 | ☐ | Ref approximates with a dedicated 30%-width Evidence column |
| Provenance collected into the reply | ✅ | ❌ | ❌ | ☐ | Runtime gathers every claim into a `## Provenance of claims` section |
| Invented-data flag | ✅ | ❌ | ❌ | ☐ | 9 boards, ~28 instances. `data-fabricated` adds a caveat line to the reply. Honest about filler |
| Source-ref chips (`file:line`) | ✅ | ❌ | ✅ | ☐ | 4 boards, ~25 instances. Ref uses mono cells with real `file:line`. ⚠ inline |
| Trade-offs block: wins / costs / fails-when | ✅ | 🟡 | ❌ | ☐ | Renderer has per-option pros/cons, not a board-level honest-trade-offs block |
| Mono ID badge as a stable citation anchor | 🟡 | ❌ | ✅ | ☐ | Ref's `D1`–`D14` appear in the page *and* in the exported text, so a reply can cite a card |
| Footer sources with provenance | ✅ | ❌ | ❌ | ☐ | |
| FAQ block | ✅ | ❌ | ❌ | ☐ | 1 board; answers carry provenance and source-refs |

## G. Content blocks

The renderer's 12 block types are its whole content vocabulary. The legacy
catalogue is open-ended by design — `components.md` calls itself "a reference
shelf, not a ceiling".

| Feature | 🏛️ | 🆕 | 🔍 | Pick | Notes |
| --- | :-: | :-: | :-: | :-: | --- |
| Prose paragraph | ✅ | ✅ | ✅ | ☐ | |
| Metric / stat tiles | ✅ | ✅ | ✅ | ☐ | |
| Table with semantic verdict cells | ✅ | ✅ | ✅ | ☐ | Renderer marks good/mixed/costly with a glyph and an sr-only label, not colour alone |
| Per-column width control | ✅ | ❌ | ✅ | ☐ | Renderer rejects ragged rows but offers no widths, spans or alignment |
| Callout / aside | ✅ | ✅ | ✅ | ☐ | 13 legacy boards. Ref has three semantic tones (neutral/bad/good) |
| Callout lead-in bolding | 🟡 | ❌ | ✅ | ☐ | Ref bolds the first clause as the claim, rest as the argument. Cheap and effective |
| Ordered steps with state | ✅ | ✅ | ❌ | ☐ | done / current / not-started, marked by border style as well as colour |
| Severity-ranked findings | ✅ | ✅ | ❌ | ☐ | critical / elevated / watch / clear |
| Owner and evidence on a finding | ✅ | ✅ | ❌ | ☐ | |
| Code block | ✅ | ❌ | ✅ | ☐ | Renderer styles `.mono` but never emits it |
| Inline code token | ✅ | ❌ | ✅ | ☐ | Ref gives inline code its own surface and uses it as mid-sentence evidence. ⚠ inline |
| Bulleted / numbered list | ✅ | ❌ | ✅ | ☐ | Renderer has only fixed-shape `steps` and `findings` |
| Links in prose | ✅ | ❌ | ✅ | ☐ | ⚠ inline |
| Readiness meter (`n/5`) | ✅ | ❌ | ❌ | ☐ | Menu device |
| Owner chips with initials | ✅ | ❌ | ❌ | ☐ | Menu device |
| Severity tags | ✅ | 🟡 | ❌ | ☐ | |
| Glossary / entity card | ✅ | ❌ | ❌ | ☐ | |
| tl;dr block | ✅ | ❌ | ❌ | ☐ | |
| Risk matrix table | ✅ | ❌ | ❌ | ☐ | |
| Prevent / Detect / Contain failure map | ✅ | ❌ | ❌ | ☐ | |
| Timeline rail with recheck triggers | ✅ | ❌ | ❌ | ☐ | |
| Kanban lanes | ✅ | ❌ | ❌ | ☐ | The `triage-board` direction's core device |
| Card sets rendered from a JSON array | ✅ | ✅ | ✅ | ☐ | Ref generates 25 cards from data at load |
| Sub-label inside a table cell | 🟡 | ❌ | ✅ | ☐ | ⚠ inline |
| Dimmed inline suffix in a title | ❌ | ❌ | ✅ | ☐ | Ref: "Make generators run — *unblocks everything*". ⚠ inline |

## H. Diagrams

| Feature | 🏛️ | 🆕 | 🔍 | Pick | Notes |
| --- | :-: | :-: | :-: | :-: | --- |
| **Mermaid figures** | ✅ | ❌ | ❌ | ☐ | 1 board. **Owed, not delivered** — no Mermaid in any current sample |
| Mermaid themed from live tokens | ✅ | ❌ | ❌ | ☐ | 20 `--ui-*` values mapped into `themeVariables` |
| oklch → hex conversion for Mermaid | ✅ | ❌ | ❌ | ☐ | Mermaid's parser predates CSS Color 4; a canvas `fillStyle` round-trip converts. Non-obvious and load-bearing |
| Serialized Mermaid render queue | ✅ | ❌ | ❌ | ☐ | `mermaid.initialize` is global, so figures must render in a chain to read their own scoped tokens |
| Re-render on theme flip | ✅ | ❌ | ❌ | ☐ | `MutationObserver` on `data-theme`, only affected figures |
| Visible failure on a broken diagram | ✅ | ❌ | ❌ | ☐ | Leaves the source visible rather than rendering blank |
| Hand-authored inline SVG | ✅ | ❌ | ❌ | ☐ | 6 files. Where the drawing itself carries the claim |
| **Generated layered SVG from data** | ❌ | ✅ | ❌ | ☐ | Renderer's own engine: `nodes`/`edges` with `layer` and `role`. No layout engine, no force simulation |
| 7 node roles, 3 edge kinds, injective tags | ❌ | ✅ | ❌ | ☐ | Role stays recoverable under `grayscale(1)` — never colour alone |
| Auto-built legend, only what is drawn | ❌ | ✅ | ❌ | ☐ | |
| Screen-reader text alternative for a diagram | 🟡 | ✅ | — | ☐ | Renderer emits an sr-only list of every node and edge |
| Diagram nodes keyboard-reachable | ✅ | ✅ | — | ☐ | |
| Unicode box-drawing diagram | ❌ | ❌ | ✅ | ☐ | Ref draws its only graphic in monospace text. Zero SVG, zero canvas, zero images in the whole file |
| Weight discipline for diagram runtimes | ✅ | — | — | ☐ | A board without Mermaid stays in the hundreds of KB; one figure takes it to megabytes. Deliberate per-board trade |

## I. Questions and capture

| Feature | 🏛️ | 🆕 | 🔍 | Pick | Notes |
| --- | :-: | :-: | :-: | :-: | --- |
| Single-choice question | ✅ | ✅ | ❌ | ☐ | 119 radios across 15 legacy boards |
| Multi-select question | ✅ | ✅ | ❌ | ☐ | Answer joined with `", "` |
| Ordered scale | ✅ | ✅ | ❌ | ☐ | Renderer records the ordinal position, not just the label |
| Free-text question | ✅ | ✅ | ✅ | ☐ | |
| **Approve / Change verdict pair** | 🟡 | ✅ | ✅ | ☐ | Request P5. Renderer and ref both toggle off on re-press |
| Note revealed only on Change | ❌ | ✅ | ✅ | ☐ | Both auto-focus the textarea |
| Recommended option marked | ✅ | ✅ | ❌ | ☐ | 59 legacy instances |
| Recommendation prose stating *why* | ❌ | ✅ | ❌ | ☐ | The badge says which; the prose says why. `questions.md` requires the why for a material decision |
| Six-tag vocabulary on options | ❌ | ✅ | ❌ | ☐ | Architectural / Ideal / Recommended / Pragmatic / Hotfix / Workaround |
| Unknown tag refused by name | ❌ | ✅ | — | ☐ | An unrecognised badge would read as an endorsement the page never made |
| Recommendation disposition in the reply | ✅ | ❌ | ❌ | ☐ | Legacy distinguishes confirmed / overridden / not-yet-confirmed. Genuinely useful and absent from the renderer |
| Touched tracking | ✅ | ❌ | ❌ | ☐ | A programmatic update never counts as a user answer |
| Follow-up vs decision question kinds | ✅ | ❌ | ❌ | ☐ | 18 instances |
| Bulk "approve everything unmarked" | ❌ | ❌ | ✅ | ☐ | Ref synthesises clicks. Cheap to add, real time-saver on a 25-item page |
| Drag probes with keyboard reorder | ✅ | ❌ | ❌ | ☐ | Reports order only once it differs from the authored default |
| What-if simulator | ❌ | ❌ | ✅ | ☐ | Ref's clickable rule ladder re-derives a prose explanation. **Keyboard-inaccessible as built** — `<div>` with a click handler, no `tabindex`, no role |

## J. Reply and output

| Feature | 🏛️ | 🆕 | 🔍 | Pick | Notes |
| --- | :-: | :-: | :-: | :-: | --- |
| Exactly one generated reply host | ✅ | ✅ | ✅ | ☐ | |
| Reply rebuilds live from every input | ✅ | ✅ | ✅ | ☐ | |
| Copy with clipboard + `execCommand` fallback | ✅ | ✅ | ✅ | ☐ | Needed because these pages open over `file://` |
| Copy status announced | ✅ | ✅ | 🟡 | ☐ | Ref swaps the label but has no `aria-live` |
| Author-controlled reply template | ❌ | ✅ | ❌ | ☐ | `{{answers}}` placeholder, with `$&`-expansion deliberately suppressed |
| Reply pre-filled server-side | ❌ | ✅ | ❌ | ☐ | Reads correctly on first paint and with JS disabled |
| Natural-language reply preview | ✅ | ❌ | ❌ | ☐ | One paragraph composed from answers, notes and probes |
| Markdown export grouped by disposition | ❌ | ❌ | ✅ | ☐ | Ref groups CHANGE / APPROVED / UNMARKED and strips tags |
| Native `<dialog>` modal for the reply | ✅ | ❌ | ✅ | ☐ | Free focus trap and Esc dismissal |
| Reply folded into the drawer | ❌ | ✅ | ❌ | ☐ | |

## K. Embeds and media — the new requests

| Feature | 🏛️ | 🆕 | 🔍 | Pick | Notes |
| --- | :-: | :-: | :-: | :-: | --- |
| **Embed a packed HTML file in an iframe** | ➕ | ➕ | ➕ | ☐ | Builder inlines the entry file's CSS, JS and images into one document, embedded via `srcdoc`. The LLM supplies a *path*, never HTML into the page |
| **Viewport switcher above the embed** | ➕ | ➕ | ➕ | ☐ | JSON declares supported viewports; buttons top-right resize the iframe. Host-side only, so the embedded document need not cooperate |
| Rotation variant per viewport | ➕ | ➕ | ➕ | ☐ | A width/height swap |
| Sandboxed embed, scripts on | ➕ | ➕ | ➕ | ☐ | `allow-scripts` **without** `allow-same-origin`: prototypes behave, but cannot reach the host page or its answers |
| Refuse remote URLs in a packed embed | ➕ | ➕ | ➕ | ☐ | Self-containment is a hard property of every page this renderer emits |
| **Image embedded as base64** | ➕ | ➕ | ➕ | ☐ | JSON carries a path; builder inlines it. Base64 inflates ~33%, so a size budget belongs in the design |
| SVG inlined rather than base64 | ➕ | ➕ | ➕ | ☐ | Smaller and themeable |
| Browser-chrome frame around a specimen | ✅ | ❌ | ❌ | ☐ | `discovery-artifact-frame` with a URL bar, so a mockup reads as a real page |
| Any image support at all | 🟡 | ❌ | ❌ | ☐ | Renderer has zero `<img>`; ref has zero images and zero subresources |

## L. Interaction and behaviour

| Feature | 🏛️ | 🆕 | 🔍 | Pick | Notes |
| --- | :-: | :-: | :-: | :-: | --- |
| Wizard — one step at a time | ✅ | ❌ | ❌ | ☐ | With a show-all toggle and a summary that jumps back to any step. Pure progressive enhancement |
| Deck mode — scroll-snap slides | ✅ | ❌ | ❌ | ☐ | Roving focus, Arrow/Page/Home/End, guarded so controls inside a slide keep their own arrow keys |
| Exclusive accordions | ✅ | ❌ | ❌ | ☐ | Nested groups stay independent |
| Code tabs | ✅ | ❌ | ❌ | ☐ | Roving tabindex, `aria-selected`, Arrow/Home/End |
| Spectrum minimap | ✅ | ❌ | ❌ | ☐ | Numbered dots mirroring each card's reaction state, two-way synced |
| Reduced motion honoured | ✅ | ✅ | ❌ | ☐ | 5 places in legacy JS, 4 in CSS |
| Click anywhere on the bar to expand | ❌ | ✅ | ❌ | ☐ | Suppressed while a text selection is in progress |
| Print stylesheet | ❌ | ❌ | ❌ | ☐ | Nobody has one. Worth considering — these pages get printed to PDF |
| Search / filter across content | ❌ | ❌ | ❌ | ☐ | |

## M. Persistence

| Feature | 🏛️ | 🆕 | 🔍 | Pick | Notes |
| --- | :-: | :-: | :-: | :-: | --- |
| **Answers survive reload** | ✅ | ❌ | ❌ | ☐ | Legacy keys `localStorage` by page id. Renderer and ref both lose everything on refresh |
| Annotations survive reload | ✅ | ❌ | ❌ | ☐ | Section notes and excerpts both |
| Drag order survives reload | ✅ | ❌ | ❌ | ☐ | |
| Tolerant load of older saved state | ✅ | ❌ | ❌ | ☐ | Missing keys default rather than throwing |

## N. Accessibility

| Feature | 🏛️ | 🆕 | 🔍 | Pick | Notes |
| --- | :-: | :-: | :-: | :-: | --- |
| Visible focus styles | ✅ | ✅ | ❌ | ☐ | Ref has **zero** `:focus` or `:focus-visible` rules |
| `aria-pressed` on toggles | ✅ | ✅ | ✅ | ☐ | The only ARIA attribute in the ref page — 55 uses, nothing else |
| `aria-live` on changing counts | ✅ | ✅ | ❌ | ☐ | Both ref live regions are silent to screen readers |
| `aria-current` on the active section | ✅ | ✅ | ❌ | ☐ | |
| `aria-expanded` / `aria-controls` | ✅ | ✅ | ❌ | ☐ | |
| Labels on every input | ✅ | ✅ | ❌ | ☐ | Ref's 27 textareas rely on `placeholder` alone |
| Accessible name kept short | — | ✅ | — | ☐ | Choice options collapsed from 38/30/36/36 words to the option value alone |
| Non-colour channels for state | ✅ | ✅ | 🟡 | ☐ | Renderer uses border style, weight and glyph so a verdict survives greyscale |
| Screen-reader-only helper text | ✅ | ✅ | ❌ | ☐ | |
| Dialog semantics with focus trap | ✅ | ❌ | ✅ | ☐ | |
| Every control keyboard-reachable | ✅ | ✅ | ❌ | ☐ | Ref's simulator rungs are unreachable |

## O. Build and engineering

| Feature | 🏛️ | 🆕 | 🔍 | Pick | Notes |
| --- | :-: | :-: | :-: | :-: | --- |
| **Page built purely from JSON** | ❌ | ✅ | ❌ | ☐ | The migration's whole point. LLM supplies data; builder produces bytes |
| Blocks mix freely within a section | — | ✅ | — | ☐ | Verified by rendering: diagram then question inside one section |
| Zero external requests in output | ✅ | ✅ | ✅ | ☐ | All three self-contained. Ref's archive has zero subresources |
| Self-containment validated | 📄 | 🟡 | — | ☐ | Credited to `_validate()`, which does not exist. Renderer achieves it structurally — there is no code path that emits a remote URL |
| `${…}` literal guard | 📄 | — | — | ☐ | Credited to `_validate()`, which does not exist |
| Refusal messages name the JSON path | ❌ | ✅ | — | ☐ | e.g. `sections[2].blocks[0].choices[0].tags[0]: required one of …, received "Blessed"` |
| Refusal messages name the remedy | ❌ | 🟡 | — | ☐ | Currently names the violation and the legal set; naming the fix is a further step |
| Id safety and duplicate refusal | ❌ | ✅ | — | ☐ | `[A-Za-z0-9_-]+`, checked before the duplicate test so a malformed id never enters the claimed set |
| Generated ids registered against collision | ❌ | ❌ | — | ☐ | A question authored `x-opt-0` collides with option 0 of a question authored `x`. Not reachable in current data; unguarded |
| All author text escaped, no pass-through | ✅ | ✅ | ❌ | ☐ | Renderer escapes even the reply template. **This is what blocks every ⚠ inline row** |
| `</style>` and `</script>` break-out guards | ✅ | ✅ | — | ☐ | Legacy hard-errors on `</style` and escapes `</script` |
| Modular section composition | ✅ | ❌ | — | ☐ | Legacy merges `sections/*.html` at a marker; superseded by JSON |
| One-level sandboxed includes | ✅ | ❌ | — | ☐ | |
| Vendored runtime caching with offline mode | ✅ | — | — | ☐ | Not needed: the renderer vendors nothing |
| Example suite validated in CI | 🟡 | ✅ | — | ☐ | Legacy checks files **exist**; renderer has 171 tests over behaviour |
| GENERATED banner on output | ✅ | ❌ | — | ☐ | |

---

## Coverage: presentation directions

The legacy system shipped **15 example boards** under `examples/src/` but only
**14 direction files** under `references/presentation/actions/` — `architecture-board`
had an example and no direction. The renderer implemented **4 kinds** when this
was written; it now renders all fifteen from `examples/data/`.

| Direction | 🏛️ | 🆕 | Pick | Notes |
| --- | :-: | :-: | :-: | --- |
| `ranked-options` | ✅ | ✅ | ☐ | |
| `guided-interview` | ✅ | ✅ | ☐ | |
| `risk-context-report` | ✅ | ✅ | ☐ | |
| `readiness-check` | ✅ | ❌ | ☐ | Go/no-go review. One of two pages owed a Mermaid figure |
| `domain-explainer` | ✅ | ❌ | ☐ | The approved golden action that establishes the shared shell |
| `interactive-prototype` | ✅ | ❌ | ☐ | **Directly served by the embed request.** 2–4 variants on identical data |
| `specimen-board` | ✅ | ❌ | ☐ | **Directly served by tokens + embed + images.** Mockup in the subject's own brand, taught with pins |
| `brainstorm-spectrum` | ✅ | ❌ | ☐ | Cheapest probe to most ambitious intervention |
| `change-walkthrough` | ✅ | ❌ | ☐ | Where diff comments live |
| `triage-board` | ✅ | ❌ | ☐ | Kanban lanes; the arrangement *is* the answer |
| `plan-review` | ✅ | ❌ | ☐ | |
| `semantics-map` | ✅ | ❌ | ☐ | |
| `build-journal` | ✅ | ❌ | ☐ | |
| `board-hub` | ✅ | ❌ | ☐ | Index across a multi-board run |
| `architecture-board` | 🟡 | ✅ | ☐ | Has a legacy example but is **the one board with no direction file**. Also owed a Mermaid figure |

---

## How to read this list

The ticked `Pick` rows are what the renderer was built to carry. Rows marked
**📄** were builds rather than restorations — the legacy system documented them
without implementing them, so nothing was there to port. Rows marked
**⚠ inline** forced the schema decision that came first: rich text is an array
of typed runs, and every run's text is escaped.

The build is not approved. This list is the standard it is to be reviewed
against.
