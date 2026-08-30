# Readiness check direction

Use this direction when evidence, assumptions, blockers, exit criteria, and the
next owner must be inspected together before planning or implementation begins.
The page should operate like a real go/no-go review for the named change, not a
generic checklist with a preselected verdict.

## Information architecture

1. State the proposed next stage, the consequence of entering it too early,
   and the measurable readiness bar.
2. Inventory concrete evidence with provenance and status: observed, inferred,
   deferred, or assumed. Show enough detail to explain why each item does or
   does not satisfy the bar.
3. Evaluate several action-specific gates such as behavioral contract, ownership,
   data boundary, operability, rollback, or acceptance criteria. Each gate shows
   its criterion, current evidence, material gap, owner, and exit signal.
4. Isolate blockers that can change architecture or acceptance criteria. Show
   the competing outcomes and provide a cheap resolving probe rather than
   disguising the blocker as a task.
5. Register accepted assumptions with an owner, reversibility, recheck trigger,
   and consequence if false.
6. Capture exactly one readiness verdict and exactly one next owner. Preserve
   the reasoning, selected probes, supporting decisions, and annotations in one
   generated reply.

Use a status rail, evidence dossier, gate matrix, blocker map, exit checklist,
or sign-off block according to the actual decision density. A realistic page
usually needs four or more materially different gates; it must not compress the
review into a score with no traceable evidence.

## Structural fidelity

The checked-in example is directional, not a page schema. Executors should add,
remove, combine, or redesign components for the best task-specific UX, while
preserving these semantic requirements:

- evidence is traceable to a source or explicitly identified as user-supplied;
- every material gate has criterion, state, gap, owner, and exit signal;
- at least one unresolved blocker has a concrete resolving probe;
- assumptions are inspectable independently of confirmed evidence; and
- the verdict remains unresolved until the user explicitly touches it.

Do not copy source-site branding, copyright, prose, or ornamental framing.
Reference examples are inspiration for depth and information architecture only.

## Interaction instructions

- Make every user-facing section annotatable, including evidence, gates,
  blockers, assumptions, verdict, and generated reply.
- Use independent controls for supporting evidence or assumptions, but radios
  for the singular verdict and singular next owner.
- Do not reopen settled decisions implicitly in the generated prompt. Untouched
  suggested verdicts and owners remain unresolved suggestions.
- The page has exactly one live prompt and one **Copy prompt for LLM coder**
  control. It updates after every answer or saved annotation.
- Keep the readiness case legible without JavaScript and prefer native controls
  and disclosures over decorative, non-working interface chrome.
