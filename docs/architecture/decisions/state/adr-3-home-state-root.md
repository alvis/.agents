# ADR-3: Keep work state in the home directory, keyed by the repository remote

📌

Agents keep their local work state for a repository in `~/.agents/states/<host>/<path>/`, named from that repository's Git remote, instead of in a `.state/` folder inside a checkout. Every checkout, Git worktree, and jj workspace of one repository therefore reads and writes the same state, and no source tree carries any.

- Status: `Accepted`
- Date: `2026-11-21`

## 🎯 Motivation

A developer runs three agent sessions on `alvis/presetter` at once, each in its own jj workspace under `~/.workspaces/presetter/`. All three must see the same work streams, the same leases, and the same overview, or two sessions can pick up the same task and a third can resume from stale notes. If state lives inside a checkout, each session must first find the one checkout that owns it. When that lookup fails, the session silently starts a new `.state/` in its own workspace, and the notes split. A `git clean -fdx` in the owning checkout also deletes notes that cannot be rebuilt, and a fresh clone of the same repository starts with no history at all.

## 🧭 Context

Work state is the ignored operational memory Essential keeps per repository: `overview.md`, live streams under `works/<work-id>/`, finished streams under `archive/`, journals, and backlogs. Only the main agent writes it, under a lease file inside each stream. One script, `plugins/essential/scripts/resolve-state-workspace`, tells every other script, hook, and instruction where that state lives. It returns `state_root`, the folder that holds the state, and `work_dir`, one stream's folder under it.

A repository's remote is the URL that `git remote get-url origin` prints, such as `git@github.com:alvis/presetter.git` or `https://github.com/alvis/presetter.git`. Two clones of one repository share that URL; two unrelated repositories never do, as long as the host is part of the name. A jj workspace reports the same remotes through `jj git remote list`.

Sandboxed harnesses such as Codex limit writes to the project and temporary folders by default, so a folder in the home directory needs an explicit write grant.

## ✅ Decision

State lives in one folder per repository in the home directory, named after where the repository is hosted. The resolver builds that name from the remote and never from a checkout path.

- **Remote.** Use `origin`. When `origin` is absent and exactly one remote exists, use it. Otherwise, or when the remote is not a network URL (for example a local folder path), the resolver refuses with a status that asks for a remote. It never guesses a name.
- **Key.** Take the host and the path from the URL, in SSH (`git@host:path`, `ssh://user@host:port/path`) or HTTPS form. Drop the user, port, a trailing `.git`, and trailing slashes, then lowercase it. `git@github.com:alvis/presetter.git` becomes `github.com/alvis/presetter`. Nested groups keep every segment: `gitlab.com/a/b/c`.
- **Root.** `state_root` is `~/.agents/states/<key>/`. It holds `overview.md`, `works/`, `archive/`, and the other state files directly, with no `.state` level inside. `work_dir` is `state_root/works/<work-id>/`.
- **No in-tree state.** No checkout holds a `.state/` folder, no resolver output reports whether one is ignored by Git, and no tool reads one.
- **Write access.** Essential's installer grants each supported harness write access to `~/.agents/states/`. A resolver or writer that cannot write there fails with a message naming the folder.

## 🔀 Alternatives considered

- **Keep state in the default source tree.** It still splits notes whenever a workspace cannot find that tree, and it stays exposed to `git clean`.
- **Key by path only (`alvis/presetter`).** Shorter, but two hosts with the same owner and repository name would share one folder.
- **Fall back to `local/<folder>` without a remote.** It keeps scratch repositories working, but two unrelated folders with one name would share state.
- **Keep a `.state` folder inside the new root.** Fewer script edits, but a hidden level inside a folder that holds nothing else.

## 🤝 Accepted Trade Offs

- A repository without a network remote cannot hold agent state until it gets one; this buys a name that is never a guess.
- Renaming or transferring a repository changes its key, so its state folder must be moved by hand; this buys a name that needs no stored mapping.

## ⚖️ Consequences

Every checkout of a repository sees the same streams and leases, so the lease alone decides who writes. Cleaning or deleting a checkout no longer loses notes, and a new clone resumes where the last one stopped. State is now outside every repository, so backing it up means backing up `~/.agents/states/`. Each harness's sandbox must allow writes there, which ties installation to each harness's configuration format.
