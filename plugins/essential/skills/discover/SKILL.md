---
name: discover
description: "Discovers material unknowns before planning. Use for a blindspot pass or unknown unknowns, to brainstorm approaches from cheapest to ambitious, interview about architecture, extract reference implementation semantics, make a disposable prototype before touching the real app, check whether discovery is ready for a decision, read the local state tree into an operations board, or account for a finished build against the plan it departed from; researched option selection belongs to essential:decide."
requirements:
  intelligence: high
---

# Discover

Reduce consequential uncertainty before it becomes an implementation assumption. This skill owns divergent exploration and a decision-ready evidence ledger; `essential:decide` owns converging on one approach, domain skills own production artifacts, and implementing skills own application-source changes.

## Boundaries

- Use for: explicit "blindspot pass" or "unknown unknowns" requests, unfamiliar code or domains, broad solution brainstorming, preferences the user can recognize but not yet articulate, extracting semantics from a reference, disposable prototypes, readiness checks before planning, the standing of work already in flight, and an account of a finished build for whoever has to merge it.
- Do not use for: fact-finding reports (`essential:deep-research`), metric-driven optimization (`essential:autoresearch`), choosing among already-grounded options (`essential:decide`), production UI design (`web:design`), or clear bounded implementation.
- Never claim an unknown unknown has been found merely because it is plausible; record it as a hypothesis until evidence supports it.

## Inputs and output

- **Required**: the problem, goal, or artifact to explore.
- **Optional**: `--mode`; `--persist`; explicit `--work-id`; the user's experience, confidence, references, hard constraints, and known unanswered questions.

Before creating or materially rewriting a project artifact, read the absolute `state.md` path injected by Essential. If unavailable, stop artifact writes and report the missing contract. Resolve the active work directory from that contract. A direct persistent run passes `--work-id` to the resolver only when the user supplied that explicit override; otherwise accept automatic existing-work selection and ask only on `work_id_required`. The main agent performs the contract's ignore gate and no-clobber bootstrap before the first persistent artifact.

Default to a conversational result. With `--persist` or a long-lived task, add the ledger as typed discovery entities in the stream's linked MDC graph; each material finding also earns one append-only event from the main agent (a subagent returns the entity and event as reconciliation deltas). Keep requested disposable prototypes under `artifacts/prototypes/<semantic-slug>/` and copied or summarized source material under `artifacts/discovery/`. Never modify application source.

For persistent discovery, follow `state-format.md` linked by the state contract. Register one `DSC` parent and every discovery leaf in `state.mdc`; store detailed discovery entities in a linked child document with the same immutable refs. Use `DSC01 → {DSC02,DSC03} → DSC04` only when the work maps to capture, independent intent/system probes, then synthesis. Otherwise encode the smallest truthful DAG. After each transition, the main agent stages the complete changed graph, appends the event, reconciles root and child entities, validates through the shared codec, and commits through the lease-protected writer with `state.mdc` last. Workers return deltas and never edit root state.

When structured comparison, explanation, or preference capture would be easier to understand interactively, follow [presentation](directions/presentation.md). State mode is the exception: its direction invokes the typed state renderer directly and never authors board data. Generated HTML is a temporary review surface, not a durable deliverable: always create it in a collision-safe OS temporary directory and discard it after its decisions and annotations have been transferred. A persisted discovery ledger may record the temporary path and extracted decisions, but must not treat the HTML as long-lived evidence.

The evidence ledger uses these fields:

| ID  | Kind | Statement | Source or evidence | Decision impact | Reversibility | Disposition | Owner |
| --- | ---- | --------- | ------------------ | --------------- | ------------- | ----------- | ----- |

`Kind` is one of `intent`, `observed`, `inference`, `unknown`, or `assumption`. An accepted assumption must be low-impact, reversible, and have a recheck trigger. A material unknown must be resolved, explicitly deferred with an owner, or marked blocking.

## Workflow

1. **Capture the starting map.** State the goal, requested deliverable, why it matters, what the user already knows, their familiarity with the codebase or domain, known questions, hard constraints, and supplied references. Ask only when a missing answer changes which discovery mode is appropriate.
2. **Resolve exactly one mode.** An explicit valid `--mode` wins; otherwise use:
   - `blindspots`: missing constraints, failure modes, history, or integration surfaces may change the problem;
   - `options`: the problem is understood but the solution space is too narrow or too broad;
   - `interview`: the user holds material intent or preferences not yet stated;
   - `reference`: a codebase, document, site, image, or example defines the desired semantics more precisely than prose;
   - `prototype`: the cheapest way to learn is a disposable artifact and the user has authorized creating it;
   - `readiness`: existing evidence needs a plan/implementation go-no-go check;
   - `state`: the unknown is where work already in flight actually stands, and the local state tree is the only honest source for it;
   - `implementation`: a change is built and someone else has to understand what it departed from before they can merge it.
3. **Load only the selected mode reference** and execute it:
   - [blindspots](directions/blindspots.md)
   - [options](directions/options.md)
   - [interview](directions/interview.md)
   - [reference](directions/reference.md)
   - [prototype](directions/prototype.md)
   - [readiness](directions/readiness.md)
   - [state](directions/state.md)
   - [implementation](directions/implementation.md)
4. **Update the ledger.** Preserve provenance. Move an item between kinds only when evidence or a user decision justifies it; do not collapse inference into observed fact. Record rejected alternatives and why they were rejected when they would otherwise be rediscovered.
5. **Choose the next probe or stop.** Continue only when another cheap probe can resolve a material unknown. Stop when all material items are resolved, explicitly deferred with an owner, or blocking; remaining assumptions must be low-impact and reversible.
6. **Route the result.** Recommend exactly one next owner: another discovery mode, `essential:decide`, `specification:spec-code`, `specification:plan-code`, `web:design`, an implementing skill, or stop. Pass the evidence ledger and artifact paths without rewriting them as certainty.
7. **Present interactive results when useful.** State mode follows its own one-shot renderer contract and skips the authored-board steps below. For every other mode, if presentation criteria are met, choose the most suitable directional action from the presentation reference (including the plan/implementation/change lifecycle actions). Write a JSON data file, never HTML: the renderer owns every byte of the page, so what is authored here is content and the shape it takes, and there is no markup, stylesheet, or script to hand-write. Before composing:
   - **Check `references/features.md`** — the Floor features are mandatory; the Menu is a shelf of proven devices, never a completeness requirement.
   - **Build a coverage map**: list every ledger finding, unknown, stream, and decision, and assign each to a section. Content that fits no block type goes in prose rather than being dropped — never lose ledger content to satisfy the catalog.
   - **Theme the board**: give the board a `theme`, whose `accent` hue rotates the whole accent ramp from one number (companion boards get distinct hues), and whose `light` and `dark` maps override any `--ui-*` token, including the semantic ramps (`--ui-verdict-*`, `--ui-status-*`, `--ui-k-*`). No token is whitelisted, so the contrast a themed board reaches is yours to hold.
   - **Design within the block vocabulary.** Section order, block choice, and the shape of each block are yours to design for the content at hand — approach it like a design lead, not a form-filler. The boards under `examples/data/` are the working catalogue of what the blocks can be asked to do. Where a card carries a real decision with alternatives, render the option set with reasons and a badged recommendation — never a bare accept.
   Then render the board, which is self-contained and makes no network request:

   ```bash
   scripts/render-page.ts <board>.json -o <board>.html   # one board
   scripts/render-page.ts --set run.json -o <dir>        # a set, cross-linked
   ```

   Present the rendered file in preference order: the LLM environment's built-in local HTML viewer, then a safe cloud artifact viewer, then a local browser such as Chrome. Capture the user's answers and section annotations in the page's single generated prompt and transfer them back to the ledger.
8. Run the verification below. Fix a failed check and repeat until it passes or a concrete blocker remains.

## Verification

- Every consequential claim is labeled and carries evidence or an explicit user source; hypotheses are not reported as facts.
- No application source changed. Every prototype is visibly disposable; non-HTML prototypes are contained inside the active work's artifacts directory and generated HTML is contained inside a collision-safe OS temporary directory.
- Every material unknown has a disposition and owner; every accepted assumption is low-impact, reversible, and has a recheck trigger.
- The recommended next owner receives the ledger and all artifact paths.
- Any HTML result is stored under the OS temporary root, supports annotation of every user-facing section, and exposes exactly one live prompt intended for replying to the LLM coder.
- Parity self-check against the ledger: every finding, unknown, stream, and decision appears on the board or in an explicit scope-cuts note — nothing silently dropped. Every recommendation-bearing card captures a response (options with a badged recommendation where alternatives exist; accept otherwise; note everywhere), and each response feeds the generated prompt. Walk the Floor checklist in `references/features.md` before shipping.
- Validate the Essential plugin and run repository policy plus trigger checks.
- In state mode, exactly one `render-state-dashboard.ts` transformation was invoked with the supplied `.mdc` or normalized `.json` path; no intermediate board data or partial HTML was created.

## Completion

Report the selected mode, starting point, material unknowns found or resolved, accepted assumptions, decisions and rejected alternatives, persistent workspace when any, readiness verdict (`ready`, `more-discovery`, or `blocked`), and the single recommended next owner. Return explicit final paths generated or materially rewritten as `generated_files`; the main agent reconciles and validates the affected MDC graph. Runtime trigger behavior is reported as exercised only when an executable evaluation actually ran.
