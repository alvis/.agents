# Action: for-refactor

Loaded by `SKILL.md` for a behavior-preserving structural change. Shared steps and the `--phase` contract live in [procedure.md](procedure.md). Apply `TST-CORE-16`:

- **`before`**:
  1. Inventory the supported behaviors the change touches.
  2. Pin each missing one with a test, with `TST-CORE-02` sensitivity proof.
  3. Run a green baseline.
  4. Return; the caller makes the change.
- **`after`**: rerun the same pins unchanged under `TST-CORE-16`.

A pin that fails in `after` is a blocker under `TST-CORE-16`: report it with its evidence and stop, never editing the pin; the caller reverts the change or reclassifies the work as a logic change through its owning skill, which runs `for-logic-change` from `before`.
