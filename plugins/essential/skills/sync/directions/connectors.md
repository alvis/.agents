# Bind connectors

Load this during sync step 4. A connector is any tool this harness exposes — usually an MCP server — that can read and write records on one external host. Bind one per host before planning writes, so an unreachable host is known before anything is written.

## Identify the system from the URL

| Host | System | Task record | Document record |
| --- | --- | --- | --- |
| `linear.app` | Linear | issue (`/issue/<PREFIX>-<n>`) | project or document page |
| `*.atlassian.net/browse/` | Jira | issue (`<PREFIX>-<n>`) | — |
| `*.atlassian.net/wiki/` | Confluence | — | page |
| `notion.so`, `*.notion.site` | Notion | database page with a status property | any other page |
| `app.asana.com` | Asana | task | — |
| `docs.google.com` | Google Drive | — | document |

An unlisted host is identified the same way: read the record through any connector that serves the host and classify it by whether it carries a workflow status. A Notion page is a task only when its parent database has a status property; read the page before classifying it.

## Select the connector

1. List the tools this session exposes and match each host to a server whose name or tool descriptions name the system, such as a Linear, Atlassian, or Notion MCP server.
2. Prove capability with a read before planning: fetch the referenced record through the candidate. A failed read, an authentication prompt, or a permission error means the host has no usable connector; queue it with the observed error.
3. Confirm the write operations the plan needs exist on that server: a status or state update plus comment create and edit for a task, and a content update for a document. A read-only server queues its writes as `pending: connector`. A server that can create but not edit comments follows the sync workflow's fallback for comments.
4. Use one connector per host for the whole run. When two servers serve one host, prefer the one whose read succeeded with the narrowest scope.
5. When an installed specification workflow governs bodies on a document's host, such as `specification:sync-notion` with a declared body author for Notion, write approved document edits through that workflow instead of the raw server.

## Read each tracker's workflow

Statuses are per tracker and often per team or project; never write a status name from memory. Read the allowed states from the task's own workflow, then choose by category:

| System | Where the states live | Completed category | In-review / in-progress category |
| --- | --- | --- | --- |
| Linear | the team's workflow states, each with a `type` | `completed` | `started` (pick the one named for review when present) |
| Jira | the issue's available transitions | status category `Done` | status category `In Progress` |
| Notion | the status property's options and groups | the `Complete` group | the `In progress` group |
| Asana | `completed` flag; sections for progress | `completed: true` | a section named for review or progress, if the project uses one |

When no state of the needed category exists, record `skipped: no <category> state` rather than choosing a near match.

## Ask to install a missing connector

Ask once per run, covering every queued host, after task writes finish. Name the system, the records waiting on it, and the planned action for each, then give the install route for the harness in use:

- Claude Code: `claude mcp add`, or `/mcp` inside a session; on claude.ai, Settings → Connectors.
- Codex: `codex mcp add`, then `codex mcp login` for an OAuth server.
- Grok Build: `grok mcp add`; `grok mcp doctor` diagnoses a server that fails to connect.
- OpenCode: add the server to the `mcp` section of its configuration.

Prefer the system's official remote MCP server when its documentation names one. A newly added server may need a new session before its tools appear; when the retry still finds no connector, leave the items `pending: connector` and say a new session is needed.
