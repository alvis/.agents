# Evolution — next-round genome detail

This reference holds how the Evolve phase of `autoresearch` turns a scored round into the next round's genome — the
list of slots the Generate phase will fan out. SKILL.md owns the loop and the stop→ask→resume contract; this file
holds the strategy selected by the brief's `evolution.strategy`, the fanout adaptation rules, and the stop checks
that run at Evolve time. Read the section matching the chosen strategy, plus Fanout adaptation and Stop checks —
those two apply to every strategy.

Both strategies share one contract:

- **Evolution is pure computation.** Ranking, slot allocation, and fanout arithmetic are deterministic functions of
  scores.yaml — the orchestrator (Mechanism B) or the workflow script (Mechanism A) computes them directly; no agent
  is spawned to "decide" evolution. Agents generate and score; the genome is math.
- **Every decision is recorded** in the round log's "Evolve Decision" section: the ranking, which candidates earned
  which slots, each slot's directive, and the stop-check results. A genome that cannot be reconstructed from the
  round log is a defect.
- **No silent caps.** Every bound trip and every fanout change — widening, narrowing, hitting `fanout.max` or
  `fanout.min`, a stop check firing — is logged with its trigger. The loop never quietly clamps, terminates, or
  continues; the round log says exactly why the next round has the shape it has.

---

## Genetic (default)

Rank the round's scored, non-disqualified candidates by consensus (direction-aware: higher-is-better or
lower-is-better per the brief's metric direction). Disqualified candidates are excluded from ranking but their
disqualification reasons feed the round log. Allocate the next round's `fanout` slots:

- **Mutation slots** — each of the `evolution.top_k` survivors spawns one mutation slot: perturb within the parent's
  framing direction, not a reroll. The slot's directive carries the parent's artifact, its consensus score, and the
  judge reasoning or metric feedback it earned — the mutation agent is told what worked and what was weak, and asked
  to vary the weak part while keeping the strong part.
- **One recombination slot** — crossbreeds the top-2 survivors' strongest traits. Trait extraction is concrete, not
  vibes: the scorer reasoning (judge panels) or metric deltas (programmatic) identify *what* each parent did that
  earned its score — those named strengths are the traits, and the directive instructs the agent to combine trait A
  of parent 1 with trait B of parent 2 into one candidate.
- **`evolution.wildcards_per_round` wildcard slots** — fresh candidates from framing directions the run has not yet
  explored (the brief's direction list minus directions already tried), or, when the list is exhausted, deliberately
  orthogonal reframings of the goal. Wildcards carry no parents; they exist to keep the search out of local maxima.

If `top_k + 1 + wildcards_per_round` differs from the current `fanout`, wildcards flex to fill or yield the
difference (mutation and recombination slots are never cut to make room — log the adjustment).

Each genome slot is handed to exactly one Generate agent as its entire inheritance — no sibling visibility:

```yaml
slot: mutation|recombination|wildcard
parents: ['r03-c2'] # candidate ids; 2 for recombination, 0 for wildcard
directive: '' # what to keep, what to vary, which traits to combine — built from scorer feedback
direction: '' # the framing direction this slot explores
```

---

## Keep-best-and-regenerate

Use when recombination makes no sense for the artifact type — monolithic artifacts (a full codebase state, a single
trained model config) whose "traits" cannot be meaningfully spliced.

- The best candidate **survives verbatim** into the leaderboard — it is not re-generated, not mutated, and spends no
  slot. Its artifact is the round's floor.
- **All other slots regenerate fresh.** Each regeneration agent is given the best's consensus score as the explicit
  bar to beat, plus the round log's "why the winner won" synthesis as guidance — it knows the standing record and
  what earned it, but never sees sibling regenerations.
- Stop checks and fanout adaptation apply unchanged; the surviving best counts as the round's `best` for improvement
  arithmetic.

---

## Fanout adaptation

Fanout starts at `fanout.initial` (5) and adapts on evidence, never on whim:

- **Widen on stagnation**: improvement below `plateau.epsilon` for 2 consecutive rounds →
  `fanout = min(fanout.max, fanout + 2)`. The extra slots become wildcards — stagnation means the current directions
  are exhausted, so the new budget buys exploration, not more of the same.
- **Narrow on convergence**: the top-3 candidates sit within 10% of the scale of each other AND the run is still
  improving → `fanout = max(fanout.min, fanout − 1)`, dropping a wildcard slot first (mutation/recombination slots
  are the convergence engine; wildcards are the first to yield).
- **Every adjustment is logged with its trigger** in the Evolve Decision section: old fanout, new fanout, the rule
  that fired, and the numbers that fired it. Hitting `fanout.max` or `fanout.min` is itself logged — a bound that
  trips silently is a bug.

Note the widen trigger (2 stagnant rounds) deliberately fires before the plateau stop (`plateau.rounds` stagnant
rounds): the loop widens and tries harder before it gives up.

---

## Stop checks

Run at Evolve time, every round, before any genome is built — whichever fires first wins:

1. **Target met** — direction-aware `best >= target.threshold` (or `<=` for lower-is-better metrics) → `target_met`.
2. **Budget exhausted** — `round >= budget.max_rounds` → `budget_exhausted`.
3. **Plateau** — improvement below `plateau.epsilon` for `plateau.rounds` consecutive rounds → `plateau`.

A fired check returns control to the skill's Step 6 (accept / extend / pivot) with the stop reason, the round
number, and the current best. Evolution never silently terminates and never silently continues past a fired check —
the decision to stop, extend the budget, or pivot the brief belongs to the user, not the loop. When no check fires,
build the genome per the strategy above and proceed to the next Generate.
