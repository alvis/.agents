# Risk/context report direction

Use this direction when several risks, constraints, actors, or operational
boundaries interact and the user needs to understand what can change the next
decision. The result should feel like a worked risk review for the actual
system, not a collection of generic warning cards.

## Information architecture

1. Name the decision this review enables and contrast the apparent task with
   the operational reality discovered underneath it.
2. Establish scale with concrete context: affected actors, surfaces, evidence
   scanned, reversibility, and the cost of being wrong.
3. Present enough full findings to make the terrain credible. A finding
   distinguishes observed evidence, inference or hypothesis, why it bites, the
   affected boundary, and the cheapest resolving probe. Commonly this needs
   four to seven findings; never substitute one-line risk labels for evidence.
4. Show how findings combine through at least one dependency, propagation, or
   amplification path. Use the same realistic scenario across the whole page.
5. Pair material risks with mitigations that name an owner, signal, rollback,
   and remaining proof. Let the user retain several responses without implying
   that selection alone resolves the risk.
6. End with the actual gate or priority question, unresolved probes, and one
   generated reply for the next planning or implementation owner.

Separate observed context from inference and hypothesis everywhere. Historical
reverts, environment differences, hidden registration steps, policy boundaries,
and indirect consumers are useful finding shapes when supported by evidence.
Use a risk map, evidence ledger, failure chain, mitigation sequence, or actor
rail only when it improves comprehension of the specific case.

## Structural fidelity

The checked-in example is directional, not a fixed schema. Generated pages may
use more, fewer, or different components, but every report must provide enough
specific evidence and internal structure for the user to inspect each material
risk rather than merely agree with its title. At minimum, the page needs:

- multiple evidence-backed findings with provenance and a consequence;
- a visible relationship between risks or boundaries;
- at least one response surface that can preserve several mitigations or
  constraints; and
- a decision gate whose result changes the generated prompt.

Do not copy source-site branding, copyright, prose, or ornamental framing.
Reference examples are inspiration for depth and information architecture only.

## Interaction instructions

- Make every user-facing section annotatable, including the evidence and
  generated-reply regions.
- Keep hypotheses visibly distinct from verified observations and untouched
  recommendations visibly unresolved.
- Allow multiple confirmed mitigations, constraints, or probes and list every
  touched answer and annotation beneath the sidebar labels.
- Phrase the page's single generated prompt as implementation or planning
  feedback for an LLM coder. It must update after every answer or saved note.
- Keep the report understandable without JavaScript; use native disclosure and
  form controls where interaction adds value.
