# Action: for-logic-change

Loaded by `SKILL.md` for an intended behavior change to existing code. Shared steps and the `--phase` contract live in [procedure.md](procedure.md).

- **`before`**: change the affected expectations, confirm they fail (`TST-CORE-02`), and return the red evidence.
- **`after`**: rerun those expectations unchanged to green. Delete tests for removed behavior and their orphaned helpers (`TST-CORE-04`); tests for untouched behavior stay unchanged.
