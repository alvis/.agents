# {{PROJECT_NAME}} — {{DESIGN_TITLE}}

Choose the scope before filling anything in. **Lightweight** (a local refinement, one component, or a quick prototype) keeps the metadata, §1 Brief, §2 Targets, the decisions in §5, §6 Evaluation, and §8 Implementation state. **Full** (a new direction, a multi-page or production UI, or a facelift) completes every applicable section. Fill each field from this product's evidence and decisions; leave nothing at a template default. Remove these instructions and any section that doesn't apply.

> **Status**: {{draft|approved|implemented|promoted|superseded}} · **Headline**: {{ONE_LINE_HEADLINE}} · **Owner**: {{OWNER}}

> **Work**: `{{WORK_ID}}` · **State**: `../state.md` · **Artifacts**: `../artifacts/design/{{DESIGN_SLUG}}/` · **Created**: {{ISO_8601}}

> **Provenance**: {{SOURCE_URLS_PATHS_REVISIONS_AND_PRIOR_DESIGN_REFS}}

> **Handoff contract**: §5, §6, §8, and (at full scope) §9 stay current at every save point. Whole-work context and planning remain in `state.md`; this file owns design detail and decisions.

---

## 1. Brief

Mark each entry **fact**, **assumption**, or **unknown**, and cite its evidence.

| Field | Entry |
| --- | --- |
| Audience and context | {{WHO_SITUATION_DEVICES_INPUT_METHODS_NEEDS}} |
| Intended outcome and key journeys | {{WHAT_PEOPLE_UNDERSTAND_DECIDE_OR_DO}} |
| Deliverable and authorization | {{exploration|specification|prototype|implementation|audit}} · {{design-only|implementation-authorized|ambiguous}} |
| Content and data | {{REAL_COPY_DATA_SHAPES_ASSETS_EXTREMES_MISSING_INPUTS}} |
| Existing system and constraints | {{BRAND_COMPONENTS_TOKENS_FRAMEWORK_ROUTES_SUPPORTED_MODES}} |
| Invariants to preserve | {{CONTENT_MEANING_BRAND_INTENT_ROUTES_CTA_DESTINATIONS_DATA_MEANING_WORKING_BEHAVIOR}} |
| Open decisions | {{UNCERTAINTY_AND_THE_EVIDENCE_THAT_RESOLVES_IT}} |
| Route and flags | {{ROUTE_FROM_SKILL_SECTION_2_AND_FLAGS}} |

## 2. Targets

Set these before reviewing any output, using the levels in `web:directions/evaluation.md`.

| Dimension | Target | Why this target fits the brief |
| --- | --- | --- |
| Product fit | {{LEVEL}} | {{REASON}} |
| Distinctiveness | {{LEVEL|inherited}} | {{REASON}} |
| Coherence | {{LEVEL}} | {{REASON}} |
| Craft | {{LEVEL}} | {{REASON}} |
| Task completion | Required readiness checks verified | {{JOURNEYS_SUPPORTED_MODES_VIEWPORTS_AND_STATES_IN_SCOPE}} |
| Efficiency | Proportionate effort | {{EXPLORATION_AND_REWORK_BUDGET}} |

## 3. Direction

**Organizing idea**: {{ONE_SENTENCE_A_STRANGER_COULD_CHECK_AGAINST_THE_SCREEN}}

| Aspect | Decision and reason |
| --- | --- |
| Composition and hierarchy | {{FOCAL_ORDER_GROUPING_DENSITY}} |
| Typography | {{FACES_WITH_FALLBACKS_SCALE_AND_WHY}} |
| Palette roles | {{ROLE_STRATEGY_AND_SUPPORTED_MODES}} |
| Imagery and content | {{IMAGERY_JOB_TREATMENT_CROPS_VOICE}} |
| Interaction and motion | {{STATE_CHANGES_THAT_MOVE_AND_WHY_OR_DELIBERATE_STILLNESS}} |
| Responsive strategy | {{HOW_HIERARCHY_DENSITY_NAVIGATION_RECOMPOSE}} |
| References | {{REFERENCE_AND_THE_SPECIFIC_PROPERTY_BORROWED}} |
| Intentional exceptions | {{EXCEPTION_AND_REASON}} |

## 4. System

Record only what this design defines or changes; link the project's existing theme and components for everything else.

### Tokens

Components consume tier-2 `--ui-<role>` tokens. Each is fed by a `--theme-light-<role>` / `--theme-dark-<role>` tier-1 pair inside `@layer theme`, scaffolded by `web:css` (CSS-MODE-04). List only the supported modes.

| Tier-2 token | Role | Light | Dark |
| --- | --- | --- | --- |
| {{--ui-ROLE}} | {{PURPOSE}} | {{VALUE}} | {{VALUE_OR_NOT_SUPPORTED}} |

| Type token | Value with fallbacks | Usage |
| --- | --- | --- |
| `--font-display` | {{FACE_AND_FALLBACK_STACK}} | {{ROLE}} |
| `--font-body` | {{FACE_AND_FALLBACK_STACK}} | {{ROLE}} |

Document the type scale as a table of levels, not per-level size tokens (WT-VARIANT-01). Spacing follows the project's 4px-grid primitives (DES-SPAC-01). Radius uses role tokens: `--radius-control`, `--radius-card`, and `--radius-modal`.

### Components and states

| Component | Variants | Applicable states (DES-STAT-01) | Interaction and motion | Source |
| --- | --- | --- | --- | --- |
| {{COMPONENT}} | {{VARIANTS}} | {{REACHABLE_STATES_OR_N/A_WITH_REASON}} | {{TRIGGER_STATES_TIMING_REDUCED_MOTION}} | {{library|patched-upstream|local}} `{{PATH}}` |

### Responsive and modes

| Breakpoint | Content reason | What recomposes |
| --- | --- | --- |
| {{WIDTH}} | {{WHERE_THE_COMPOSITION_BREAKS}} | {{CHANGE}} |

Supported range: {{NARROWEST_TO_WIDEST}} · Input methods: {{POINTER_TOUCH_KEYBOARD}} · Modes: {{light|dark|system — only those supported}}

## 5. Decisions

Record every presented option, choice, rejection, confirmation, and follow-up as it happens.

| Date | ID | Question | Presented (with concrete details) | Chosen | Rejected + reason | Retained traits / confirmation / assumption |
| --- | --- | --- | --- | --- | --- | --- |
| {{YYYY-MM-DD}} | {{d-001}} | {{QUESTION}} | {{OPTIONS}} | {{CHOICE}} | {{REASONS}} | {{NOTES}} |

## 6. Evaluation

The current summary, in the `web:templates/evaluation.md` layout, with its stage, revision, and links to canonical review files and evidence. Replace it on each evaluation; earlier summaries stay in the evidence tree.

## 7. Before-state and parity

Facelift and existing-product redesigns only.

- **Before evidence**: `../artifacts/design/{{DESIGN_SLUG}}/captures/` · inventory `../artifacts/design/{{DESIGN_SLUG}}/inventories/facelift-inventory-before.json`
- **Keep / evolve / replace**: {{ELEMENT_VERDICT_REASON_ROWS}}
- **Parity diff**: {{MOVED_OR_MERGED_MAPPINGS_AND_JUSTIFIED_ADDITIONS}}
- **Performance baseline versus final (lab conditions)**: {{METRICS_AND_CONDITIONS}}

## 8. Implementation state and next steps

**Built so far**: {{PATH — STATUS}}

**Current slice and budget**: {{SLICE}} · rework pass {{n}} of the shared budget in `web:directions/evaluation.md` · best checkpoint {{CHANGE_ID}}

**Known gaps**: {{FAILED_UNVERIFIED_OR_BLOCKED_CHECKS_AND_OPEN_FINDINGS}}

**Promotion candidates**:

| Knowledge | Destination | Disposition | Provenance |
| --- | --- | --- | --- |
| {{RULE_OR_DECISION}} | {{docs/design/system.md or docs/design/<slug>.md}} | {{candidate|promoted|rejected}} | {{WORK_REVIEW_EVIDENCE}} |

**Next actions** (exact and ordered; a fresh agent starts at #1):

1. {{NEXT_ACTION}}

## 9. File map

| Artifact | Path |
| --- | --- |
| Theme stylesheet | {{PATH}} |
| Key component directories | {{PATHS}} |
| Boards (data and captures) | `../artifacts/design/{{DESIGN_SLUG}}/boards/` |
| Previews | `../artifacts/design/{{DESIGN_SLUG}}/previews/` |
| Captures and diffs | `../artifacts/design/{{DESIGN_SLUG}}/captures/`, `diffs/` |
| Whole-work state | `../state.md` |
| Save points | {{CHANGE_IDS_NEWEST_LAST}} |
