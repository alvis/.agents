# Decision explainer direction

Use this direction when a newcomer needs the decisions a repository already rests on explained before they can work in it. The page answers, per decision, "what problem was this?", "what did we choose, in plain words?", "what else was on the table?", and "what does it mean for what I do on Monday?" — and lets the reader ask for more on any one of them without having to know what to ask.

It is not the [domain explainer](domain-explainer.md), which makes one unfamiliar mechanism concrete so that a decision can be *taken*. This board explains decisions already taken, many at once, to someone who was not there; it settles nothing, and every question on it is a follow-up.

## Entry conditions

Reached from the [decisions](../../decisions.md) mode, which owns which records appear and how they are classified. Build it from the real records and the files they cite; a board of paraphrased records written from memory teaches a system that may not exist.

## Suggested composition

1. Masthead: the `--only` set in the lede, and `meta` counts per kind and status — ADRs, local decisions, active, proposed, superseded — so the reader knows the size of what they are about to read.
2. An orientation section: two or three sentences on what an ADR is (a human-approved record under `docs/architecture/decisions/`) against a local decision (one an agent recorded while working, under `.state/works/<stream>/decisions/`), and a `glossary` of every term the decisions below repeat. Terms used once are defined where they are used, with a `term` run.
3. One section per decision, in the order a newcomer meets them — foundations before what builds on them, active before proposed, superseded last:
   - a `tldr` whose lead states the choice in one line;
   - the kind and status in the section `eyebrow`, spelled as words — `ADR · human-approved · active`, `Local decision · AI-recorded · proposed — not yet agreed`, `… · superseded` — so the status survives greyscale and a screen reader;
   - the problem as a story: the concrete situation, and what breaks without the decision;
   - the illustration the mode chose: `tree`, `code`, `mermaid` or `diagram`, or `table`;
   - the decision in plain words, then the alternatives it beat and why, in a `table` when there are more than two;
   - "What this means for you": the one or two things the reader now does, or must not do, because of it;
   - the record itself as a `source` run, with the files it cites;
   - the follow-up question below.
4. A superseded decision says what replaced it in a `callout` and links the successor's section when both are on the board.
5. A scope note section when the mode left anything out: unresolved selectors, records outside the `--only` set, records set aside, and index mismatches, each with its reason.

## The follow-up question

Every decision section ends with one `decision` block asked as a follow-up, relabelled, and defaulted to approve:

```json
{
  "type": "decision",
  "response": "follow-up",
  "default": "approve",
  "id": "adr-1-more",
  "ref": "ADR-1",
  "label": "Installed plugin resolution",
  "ask": "Want this explained further?",
  "labels": {
    "approve": "I'm good with it",
    "change": "Tell me more about it",
    "note": "What would you like to know? (optional)"
  },
  "placeholder": "e.g. why not just use relative paths?"
}
```

"I'm good with it" is the default: it carries the **Default** badge, and leaving the question alone files it under _Not requested_. "Tell me more about it" reveals the optional question and files the decision under _Requested_ in the reply. `ref` is the chip, which the renderer caps at six characters so it fits beside the label: `ADR-<n>` for an ADR up to ADR-99 and `A<n>` from ADR-100, and a short code such as `L1` for a local decision, glossed in the section eyebrow with its `<stream>/<slug>`.

## Interaction instructions

- Every section is annotatable, so a reader can point at the exact sentence that lost them; the annotation reaches the reply beside the follow-ups.
- The reply template asks the coder to answer each requested decision at the same newcomer depth, quoting the reader's question, and to say which illustration would help if one would.
- Keep the explanations, illustrations, and badges readable without JavaScript; only the buttons and the reply need it.
- Nothing on the board recommends a decision be changed. A reader who disagrees says so in a note or in "Tell me more", and the coder routes it to the owning record's process — [ADR supersession](../../../../../directions/adr-supersession.md) or [work-local decision lifecycle](../../../../../directions/decisions.md) — rather than editing it from here.
