# Evaluate a web interface

This direction is the canonical six-dimension rubric for web design and build evaluation. Designers use it to set targets, implementers and evaluators use it to judge evidence, and leads use it to decide the next action. Enforceable rules stay in their standards; this rubric says how to judge, rate, and report against them.

## The six dimensions

Report under these exact names, in this order. They are complementary, never averaged into one score.

| Dimension | Core question | Evaluation form |
| --- | --- | --- |
| **Product fit** | Does the design make sense for this audience, purpose, product, and usage context? | Evidence-backed judgment against the brief and intended journeys |
| **Distinctiveness** | Can we identify meaningful choices specific to this subject and brief? | Concrete decisions and their relevance; familiarity is allowed where useful |
| **Coherence** | Do the parts feel designed together? | Relationships across components, content, screens, states, modes, and implementation |
| **Craft** | How well are the decisions executed? | Inspection of composition, typography, spacing, colour, imagery, interaction, responsive composition, and detail |
| **Task completion** | Can intended users complete the important journeys under supported conditions? | Readiness checks with current evidence and visible failures or gaps |
| **Efficiency** | How much time, cost, rework, and human correction did a satisfactory result require? | Available execution evidence and labelled estimates or proxies |

An attractive interface with a broken journey remains incomplete. Fast execution does not excuse missing the brief. A faithfully implemented weak concept can be coherent and still fail Product fit. Efficiency means the efficiency of the design and delivery process; runtime speed belongs to Task completion, and how easily people use the interface informs Product fit and Task completion.

Set ambitious, context-sensitive targets. A campaign may demand Exceptional Distinctiveness and Craft. A dense operational tool may be exceptional through Product fit, Coherence, and Task completion. Familiar controls, repeated rhythm, and deliberate stillness can all be excellent. Neither minimalism nor maximalism earns an automatic bonus or penalty.

## Criteria

### Product fit

Examine task priorities, information architecture, terminology, real content, data interpretation, density, tone, platform conventions, and environmental constraints. Ask whether the interface supports the user's mental model and makes the next useful action understandable.

- **Strong:** important decisions map to the brief; meaningful information appears where users need it; the structure supports representative journeys; audience and context explain the chosen density and expression.
- **Weak:** a reusable template dictates the content; presentation obscures the task; familiar domain distinctions disappear; the interface assumes motivation, knowledge, or capability its users may lack.

Walk real content through the intended tasks. A reviewer's inference about comprehension is not observed user evidence; never claim user validation when no research occurred.

### Distinctiveness

Assess the specificity and strength of the organising idea: decisions tied to the product, subject, audience, content, or intended experience. They may concern composition, imagery, language, information design, or interaction, not just styling.

- **Strong:** an evaluator can name meaningful choices and explain why they belong to this brief; the experience has an identifiable character or organising logic without sacrificing useful conventions.
- **Weak:** swapping the logo and headline leaves a supposedly bespoke concept unchanged; decoration has no relationship to the subject; novelty adds effort without improving meaning or experience.

"Could this be any product?" is a diagnostic, not a rule. A settings form should usually keep familiar patterns, and extending a strong existing system may need no new signature idea. Never penalise a common font, restrained palette, repeated grid, conventional control, or absence of animation by itself, and never reward unfamiliarity by itself.

### Coherence

Examine type and spacing systems, colour roles, components, iconography, imagery treatment, terminology, interaction patterns, and relationships across screens, states, supported modes, and breakpoints. Check fidelity to the agreed direction and reuse of real tokens and components; separate purposeful variation from accidental drift.

- **Strong:** repeated patterns behave predictably, differences have a purpose, the experience stays recognisable across contexts, and implementation preserves the agreed logic.
- **Weak:** sections feel assembled from unrelated templates; similar actions differ in label or behaviour; token exceptions accumulate without reason; local improvements weaken the whole.

Fidelity does not prove the direction was good; judge that under Product fit and Distinctiveness.

### Craft

Inspect whole screens and journeys as well as crops; a beautiful component can still damage the page's hierarchy.

| Supporting area | What to inspect |
| --- | --- |
| Composition and hierarchy | Focal order, grouping, density, balance, alignment, and prominent versus supporting information |
| Typography and reading | Font suitability and fallback, hierarchy, weight, measure, line breaks, spacing, real copy, language coverage |
| Colour and surfaces | Consistent semantic roles, emphasis, depth, material or texture, clear state distinctions; objective contrast is a readiness check |
| Spacing and optical detail | Rhythm, alignment, borders, shadows, icon scale, baselines, control proportions, edge conditions |
| Content, imagery, and data display | Specific readable language, purposeful assets, crops, resolution, chart labels, units, legends, missing/stale/zero values |
| Interaction and motion | Affordances, feedback, continuity, direct manipulation, purposeful timing, deliberate stillness |
| Responsive composition | How hierarchy, density, images, navigation, and controls adapt, not merely whether they shrink |

- **Strong:** resolved at normal and demanding content sizes; details reinforce the composition; interactions explain what is happening; responsive layouts preserve purpose.
- **Weak:** awkward wraps, accidental spacing, decorative imagery, unclear state changes, inconsistent icon optics, or a polished desktop that collapses on narrow screens.

Microcopy, imagery, and motion are design decisions, not finishing decoration. Acknowledge missing assets and represent them honestly instead of hiding them behind generic filler.

### Task completion

Assess the user's outcome on each declared journey. Keep these readiness checks visible under this dimension; they are required evidence for applicable scope, never extra dimensions or values to average away.

| Readiness check | What must be established | Owning rules |
| --- | --- | --- |
| **Primary task correctness** | Declared journeys reach the expected result; navigation, forms, filters, sorting, selection, editing, submission, and persistence actually work. A success toast is not proof of the outcome | DES-NAVI-*, DES-HIER-02, DES-COPY-* |
| **State and recovery completeness** | Applicable loading, empty, error, success, permission, interrupted, returning-user, and domain states behave correctly; recovery preserves context and user work | DES-STAT-* |
| **Accessibility and input access** | Applicable semantics, names, keyboard, focus, contrast, reflow and zoom, alternatives, target sizes, and motion requirements, verified by suitable methods | DES-A11Y-*, DES-COLR-02, DES-ICON-02 |
| **Responsive and content resilience** | Supported modes, layouts, input methods, and realistic content extremes stay usable: clipping, wrapping, overlays, sticky regions, tables and charts, retained task priority | DES-RESP-*, CSS-MODE-* |
| **Performance and stability** | Agreed loading, interaction, layout, asset and font, and animation budgets verified under documented conditions; lab, field, and perceived evidence kept apart | DES-ICON-02 (animation only); loading, interaction, and layout budgets: **Performance** below |
| **Truth, trust, and implementation integrity** | Claims, testimonials, metrics, and affordances are honest; in-scope logic, routes, data meaning, integrations, component ownership, and framework conventions stay sound; required build, type, format, and focused checks pass | DES-BRND-02, DES-CONS-*, WT-* |

No level of Craft or Distinctiveness compensates for a failed required check.

**Coverage.** Use an applicable state inventory: a static divider needs no loading or permission UI, an asynchronous action needs feedback and failure handling. Test the modes the product supports; a light-only product does not invent dark mode, and a supported but untested mode is unverified. DES-RESP-01 owns the viewport contract and DES-STAT-01 the state inventory; stricter project commitments win.

**Accessibility baseline.** WCAG 2.2 AA unless stricter requirements are declared. Text contrast thresholds belong to DES-COLR-02. Target sizes belong to DES-A11Y-02, which separates the WCAG 2.2 AA floor from this repository's stricter touch-target rule; report a miss against the project rule as a project-rule failure, not an AA failure. Honour reduced-motion needs without calling the interaction-animation criterion (2.3.3, AAA) an AA requirement.

**Performance.** Good Core Web Vitals are LCP ≤ 2.5 s, INP ≤ 200 ms, and CLS ≤ 0.1 at the 75th percentile of field visits. A local trace or one interaction does not establish that field result; use documented lab budgets for local acceptance and label them lab. Absence of tasks over 50 ms does not establish 60 fps.

**Measurement.** Measure contrast with [the contrast protocol](contrast-protocol.md). Unparsed colours, unresolved compositing, gradients, images, and missing runtime evidence become manual review or unverified. Never pass an unmeasured case or infer conformance from a screenshot or an automated score.

### Efficiency

Use available evidence: elapsed time, model and tool usage, exploration artifacts, implementations attempted, review rounds, interventions, regressions, and reusable decisions. Label every figure measured, estimated, or unavailable.

- **Strong:** unresolved decisions settled with economical artifacts; existing decisions reused; a representative slice prevented broad rework; review produced actionable corrections; the process stopped when its purpose was met.
- **Weak:** full builds for rejected concepts; variants for every region; review repeated without new evidence; questions substituted for inspection; premature shortcuts caused expensive correction.

Do not optimise for the smallest initial tool count; compare effort against the agreed quality and readiness bar. Never invent exact costs or require a ledger for a minor edit.

## Stages

| Stage | What evaluation can establish |
| --- | --- |
| **Exploration** | Product fit, concept differences, coherence, and the craft a cheap artifact shows; feasibility and readiness risks; likely effort. Proposed runtime behaviour stays unverified |
| **Representative slice** | Actual rendering and the interactions and states built in the chosen slice; what can safely propagate and what needs correction |
| **Delivery** | The complete authorised scope, agreed targets, and every applicable readiness check, with remaining limitations stated |

Never build rejected concepts to populate checks, and never mark a future production requirement N/A because exploration has not built it. A design-only assignment can be complete at its agreed level; its report separates the verified design artifact, demonstrated prototype behaviour, and unimplemented production integration. A local refinement assesses the affected scope, checks relevant regressions, and records which decisions were inherited.

## Ratings and statuses

Product fit, Distinctiveness, Coherence, and Craft use anchored levels:

| Level | Meaning |
| --- | --- |
| **Weak** | Material problems remain in concept, suitability, coherence, or execution |
| **Competent** | The applicable decisions are purposeful and resolve the basic requirements soundly |
| **Strong** | Well-supported choices, confident composition, and careful execution beyond competence |
| **Exceptional** | Specific evidence shows unusually accomplished work for this brief and context |

Set targets before reviewing output and never lower them after seeing a weak candidate. Record achieved level and target attainment separately: `Craft: Strong · Target: Exceptional · Target met: No`. Do not require every surface to maximise every dimension, and avoid decimals or universal "10/10" demands. In a scoped refinement an unaffected judgment may be **inherited** or **not reassessed**, naming its source; such a dimension sets no target, so its target attainment is n/a. Missing applicable evidence is **unverified**. Never invent a fresh rating or confuse an inherited judgment with readiness N/A.

Task completion reports each readiness check as:

- **Pass:** sufficient current evidence establishes the requirement.
- **Fail:** evidence demonstrates a violation.
- **Unverified:** the requirement applies but evidence is absent or inadequate.
- **Blocked:** a named dependency prevents verification.
- **N/A:** the requirement genuinely does not apply to the agreed scope, with the reason.

Efficiency reports cost and correction evidence and whether effort was proportionate; it is not a taste rating.

## Evidence and findings

Keep one compact chain per observation:

`dimension → criterion/scope → target → observation → evidence → confidence → canonical finding and next action`

Bind evidence to the artifact or revision, route, viewport, mode, state, and conditions. Keep historical evidence, but invalidate conclusions whose basis changed.

Give each finding one primary dimension, with cross-references when useful; never duplicate it to inflate several scores. An unsuitable navigation concept is Product fit, inconsistent labels are Coherence, a broken destination is Task completion. A distinctive type choice supports Distinctiveness, poor line breaks are Craft, insufficient contrast fails the accessibility check. Purposeful motion can strengthen Craft; losing keyboard focus during it fails Task completion. Keep confidence apart from severity, preference apart from a standards violation, and inferred usability apart from observed user evidence.

Current findings live in the canonical review flow at `web:templates/review.md`, which keeps finding IDs, priorities, dispositions, and verdicts. Map each finding to its review area there (Product fit and Coherence divergences from an agreed design are usually `alignment`; broken journeys `correctness`; Craft `quality`; missing evidence `testing`; token drift `style`). Agent memory stores only durable lessons. A fix requires recheck; open and deferred findings stay outstanding; a risk-accepted finding (`acknowledged` or `skipped` under that contract), N/A, and unverified are different states, and an accepted defect never becomes verified conformance.

## Reviewer context and independence

Give a reviewer the neutral brief, intended tasks, agreed constraints and direction, this rubric, references, the exact artifact, and its evidence. Exclude builder rationale and self-scores. Use a genuinely separate bounded context when independent judgment improves the result; a fresh message to the same agent is not independent, so label solo review as solo. Small changes do not need a reviewer panel.

Reviewers cite evidence for strengths as well as defects, and calibrate against [the calibration examples](../examples/evaluation.md). A critic need not invent a divergence from an exemplar or count decorative effects. Route concept problems to design and implementation failures to the owning implementer.

## Rework budget

One coordinated budget of at most three evaluated revisions per screen or journey covers every role together; never multiply it across designer, implementer, evaluator, regions, modes, or nested loops. Three passes are enough to apply one round of concrete findings, recheck it, and correct what that recheck exposes; further passes without new evidence usually substitute preference for progress. Before each revision, name the problem or hypothesis and the evidence that will resolve it, and keep the best checkpoint.

| Observation | Next action |
| --- | --- |
| Concepts expose the meaningful tradeoffs and one satisfies the direction constraints | Select it and develop the representative slice; stop exploring |
| A required check fails and a concrete repair fits the budget | Repair the affected behaviour and recheck its evidence |
| Visual targets are unmet because the organising idea is weak | Revisit the concept within the budget; surface polish may not help |
| Targets are met and further suggestions are preference | Finish the authorised scope and stop polishing |
| Evidence is unavailable, or the budget ends with unmet requirements | Keep the best result and report the exact partial or blocked status and remaining work |
| The existing surface already meets the request | Give an evidence-backed no-change recommendation |

These transitions create no new approval gates. Existing authorisation and canonical risk dispositions stay authoritative, and exhausting the budget never turns a failure into a pass.

## Summary

Summarise with [the evaluation template](../templates/evaluation.md): the six headings, then delivery status, remaining gaps, and the next useful action, linking canonical evidence instead of duplicating it.
