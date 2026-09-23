# Code owner

For a personal-account repository, only that account is a code owner. For an organization repository, a code owner is either an active organization owner or an eligible user named in the effective CODEOWNERS file. A team entry includes active team members when the team has repository write access; a directly listed user must also have write access.

The effective CODEOWNERS file is the first file named `CODEOWNERS` found in the `.github` directory, repository root, then `docs`. Invalid lines do not establish ownership. [GitHub's CODEOWNERS documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) owns file syntax, size limits, and access rules. Email-only entries cannot verify a username because GitHub may keep its email private.

The [verifier](../skills/pr/scripts/verify-code-owner.ts) accepts `--username=<username> --repo-account=<account> --repo-name=<name>`. Exit `0` prints the verified role, exit `1` prints a denial or verification failure, and exit `2` reports invalid input. Standalone calls inspect the default branch; `CODE_OWNER_REF` selects a revision and `CODE_OWNER_HOST` selects a host (default `github.com`). The PR authorization gate selects the exact base OID. `CODE_OWNER_GH_BIN` selects the GitHub CLI executable (default `gh`).
