# Plan mode

Use this mode when the user wants to be interviewed toward an implementation direction or architecture, across as many rounds as it takes, before anyone writes an execution plan. Each round is one HTML questionnaire; the round the user marks ready hands a prompt to any agent to form the plan.

1. **Scan conventions before asking anything.** Read, without writing: root `README.md` and `AGENTS.md` or `CLAUDE.md`; `docs/` and its architecture decision record index; `.state/` through the injected state contract — open streams, their `goal.md` specification provenance, `decisions/`, and `state/journal.md`; and the external specification authority, such as a Notion page, when that provenance or the user names one. Record each finding as an `observed` ledger row; it either answers a question outright or becomes the evidence beside one. Never ask what the scan already settled.
2. **Rank and frame the open questions** under [interview](interview.md) steps 1–4; each also carries a badged recommendation with its reason.
3. **Render the round.** Author one `guided-interview` board under [presentation](presentation.md) and the [guided interview](presentation/actions/guided-interview.md) direction. Round two onward opens with the confirmed answers so far as context, never as questions again. Give each round a distinct board `id` so a reader's saved answers never cross rounds.
4. **Close every round with one readiness decision.** After the decision synthesis, the last section holds a `decision` asked as a decision — approve reads "Ready to form the execution plan", change reads "Run another round" — plus a note for what the next round must cover. The board's `reply.template` names the ledger path and carries both outcomes, so the copied prompt is self-directing. Either outcome first reconciles `{{answers}}` and `{{notes}}` into that ledger, then:
   - **Another round** — run `/discover plan` again on the same work to render the next round.
   - **Ready** — form an execution plan under `essential:directions/plan.md` from the ledger and the direction and architecture it settles; untouched recommendations stay open questions, not defaults.
5. **Prototype only when it is cheaper than asking.** Follow [prototype](prototype.md) and link the artifact from that question's evidence.
6. **Discard each round's temporary board** once its reply is reconciled.

Rounds span sessions, so the ledger always persists. This mode never writes `docs/`, the external specification, or the execution plan itself, and never approves one.

Stop when the user marks a round ready, or when no remaining question can change architecture, scope, data contracts, or user-visible behavior — then render a final round whose only question is the readiness decision. Complete with the rounds run, confirmed direction and architecture, deferred or blocking questions with owners, and the prompt that hands off to planning.
