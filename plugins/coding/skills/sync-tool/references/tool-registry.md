# Tool Registry

`sync-tool` operates on a fixed registry of CLI tools, evaluated in order. Order matters: on macOS, `brew` must be present before `jj` and `gh` are installed.

## Currently registered

| Order | Name   | Min version | macOS-only | Installer script              | Source of truth                                    |
| ----- | ------ | ----------- | ---------- | ----------------------------- | -------------------------------------------------- |
| 1     | `brew` | 4.0.0       | yes        | `scripts/installers/brew.sh`  | <https://brew.sh>                                    |
| 2     | `jj`   | 0.44.0      | no         | `scripts/installers/jj.sh`    | <https://github.com/jj-vcs/jj>                       |
| 3     | `gh`   | 2.0.0       | no         | `scripts/installers/gh.sh`    | <https://cli.github.com> / <https://github.com/cli/cli> |
| 4     | `fallow` | 2.0.0     | no         | `scripts/installers/fallow.sh` | <https://github.com/fallow-rs/fallow>               |
| 5     | `python` | latest available | no       | `scripts/installers/python.sh` | <https://www.python.org/downloads/>                 |
| 6     | `qmd`    | 2.9.0       | no         | `scripts/installers/qmd.sh`    | <https://github.com/tobi/qmd> (npm `@tobilu/qmd`)    |

## Adding a new tool

To register a new tool (e.g., `rg`):

1. **Author the installer**: Create `scripts/installers/<tool>.sh` following the contract:
   - Branch on `uname -s`: `Darwin` / `Linux` / `MINGW*|MSYS*|CYGWIN*` / `*`.
   - Honor `DRY_RUN=1` (echo planned commands without executing) and `FORCE=1` (reinstall even if present).
   - Self-contained — no shared shell helpers.
   - Exit 0 on success; non-zero with a clear stderr message on failure.
   - Prefer the official upstream install method per OS (Homebrew on macOS, official apt repo / dnf / cargo / tarball on Linux, winget on Windows).
2. **Register it in `scripts/sync.ts`**: Append a `ToolEntry` object to `REGISTRY`. Set:
   - `name`: the executable name on `PATH`.
   - `installer`: filename in `scripts/installers/`.
   - `minVersion`: minimum acceptable `--version` output.
   - `versionArguments`: arguments that produce a parseable version string (default `["--version"]`).
   - `macosOnly`: `true` only for tools that genuinely don't apply elsewhere (e.g., `brew`).
   - `offPathPossible`: `true` when the installer places the executable in a package manager's global bin directory that may be off `PATH` (e.g., `qmd`). When such an install leaves the tool unresolvable, `sync.ts` reports `failed` with a pointer to the `export PATH=…` line the installer printed, instead of a bare "still missing".
3. **Update this file**: Add a row to the table above.
4. **Update `references/platforms.md`**: Document the per-OS install method for the new tool.

## Post-install verification

After an installer succeeds, `sync.ts` reads the tool's version. A tool with a `minVersion` is reported `failed` when no version can be read, as well as when the version is below the minimum; it is never reported `installed` or `updated` on an unverifiable install.

## Why this is a closed registry

`sync-tool` is intentionally not a generic package manager. It exists to guarantee a known set of coding CLIs are present at minimum versions for sibling skills (e.g., `coding:commit` uses `jj` for history and `gh` for remote-state checks, while `coding:pr create` uses both for publication). Keeping the registry small and explicit means each tool gets a hand-tuned, audited installer that matches its upstream's official guidance.

The `jj` floor is 0.44.0 because the shared coding guide and PR workflow rely on `jj arrange`, `jj bookmark advance`, and read-only `jj run`.

The `qmd` floor is 2.9.0 because metadata filtering and MCP project-config trust shipped in that release.
