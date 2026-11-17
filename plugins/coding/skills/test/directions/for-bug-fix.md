# Action: for-bug-fix

Loaded by `SKILL.md` for a diagnosed defect; diagnosis and the fix belong to `coding:fix`. Shared steps and the `--phase` contract live in [procedure.md](procedure.md).

- **`before`**: write the regression test that reproduces the defect and return the confirmed-red evidence (confirm-red step in the testing standard's decision tree).
- **`after`**: rerun the same test unchanged to green.
