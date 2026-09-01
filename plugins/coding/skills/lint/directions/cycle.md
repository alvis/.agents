# Lint review cycle

Referenced from `SKILL.md` step 7. Use this cycle only when the Coding
workflow requires independent review because the change is consequential,
explicitly requested for review, or publication-bound. Tier 0/1 work otherwise
ends with the implementing owner's self-review.

## Ownership

- The implementing owner runs the scanner, reads the selected standards,
  applies mechanical fixes, reruns affected scans, and executes project lint,
  type, and focused test checks. Independent review never transfers that
  responsibility.
- A Tier 2 change adds one read-only reviewer after the owner's self-review.
- Tier 3, multiple dependent milestones, or multiple implementers may use the
  owning governed coordinator. It may allocate disjoint batches, but each
  batch retains one implementing owner and the reviewer remains read-only.
- A reviewer reports findings; it never edits files or delegates further.

## Review task

Keep each assignment at or below 4,096 characters. Name the batch files,
selected standard paths, requested scope, runner receipt, project-check
evidence, implementing owner, and exact review predicate. If that would exceed
the ceiling, use the owning task's durable review carrier and dispatch its path
plus at most two summary lines.

The reviewer checks that:

- every advisory scanner candidate was decided against the matching scan and
  rule guide, or the bounded `write.md` fallback when no guide exists;
- every edit stays inside the requested scope and is justified by a confirmed
  rule or project-tool failure;
- generic and profile scanners ran once in their declared order;
- relevant lint, type, and focused test checks passed; and
- the self-review did not introduce unsupported rewrites. In particular, a
  direct `error as Error` catch cast and a whole-error equality assertion stay
  unchanged when their owning rules permit them.

## Convergence

1. The implementing owner completes its self-review and sends the reviewer the
   bounded task above.
2. The reviewer writes concrete file/line findings to a bounded, secret-free
   review carrier and sends its path to the implementing owner. It returns only
   `ok` or `blocked`, its context level, and that path in at most two lines; the
   detailed structured review stays below 1,000 tokens.
3. On `ok`, mark the batch reviewed.
4. On `blocked`, the implementing owner fixes the findings, reruns the affected
   scans and project checks, then requests a fresh read-only review. Allow about
   two correction rounds; unchanged evidence after that is a blocker, not
   permission to weaken a rule or check.
5. The owner aggregates reviewed and self-review-only batch counts. A governed
   coordinator shuts down any temporary teammates after every owned batch is
   accounted for.

Session-level clean-pass iteration remains owned by `/goal`: rerun
`/coding:lint` until `violations_found_total: 0` with `status: compliant`, or
stop at the caller's declared turn limit. A pass that fixes violations reports
`success`; it does not claim that a fresh pass is already clean.
