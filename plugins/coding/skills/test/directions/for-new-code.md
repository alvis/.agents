# Action: for-new-code

Loaded by `SKILL.md` for tests accompanying newly added supported behavior. Shared steps and the `--phase` contract live in [procedure.md](procedure.md).

- **`before`**: write a failing test for each new supported behavior and return the red evidence (`TST-CORE-02`). Reuse failing tests `draft-code` already wrote rather than duplicating them.
- **`after`**: rerun those tests unchanged to green, and cover every new runtime source to 100% (`TST-COVR-01`) through the coverage loop in procedure step 4.
- **Behavior already implemented** (finalizing a peeled staged-delivery layer, or code implemented before its tests): there is no red state, so use the `TST-CORE-02` sensitivity-proof route for already-correct behavior instead of red-first.
