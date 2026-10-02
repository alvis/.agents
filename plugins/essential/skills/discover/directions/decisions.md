# Decisions mode

Use this mode when someone new to the repository needs the reasons behind its shape: the human-approved architecture decision records (ADRs) and the decisions agents recorded in the local state tree. The mode is read-only: it changes no record, no state file, and no documentation.

1. **Read the invocation.** `/discover decisions [--only=<set>] [selector…]`, where `<set>` is a comma-separated subset of:

   | Value | ADRs | Local decisions |
   | --- | --- | --- |
   | `active` | effective records under `docs/architecture/decisions/<domain>/` | status `accepted` |
   | `proposed` | — (an ADR is only ever effective or superseded) | status `proposed` |
   | `superseded` | archived records under `docs/architecture/decisions/superseded/<domain>/` | status `superseded`, or filed under `decisions/superseded/` |

   The default is `active,proposed`. Refuse any other value, list the three valid ones, and render nothing. `rejected` records and streams under `.state/archive/` are never shown: a rejected choice explains nothing about the system a newcomer joins, and an archived stream is excluded by its location as in [state mode](state.md).

2. **Enumerate the records.** Take ADRs from the paths above under [ADR supersession](../../../directions/adr-supersession.md), and cross-check the effective ones against the index in `docs/architecture/README.md`; a record missing from the index, or an index row with no file, is drawn on the board rather than trusted either way. Resolve the local `.state` root through the injected `state.md` contract, then read every `works/<stream>/decisions/**/*.md`; the stream's `decisions.md` overview sits beside that folder and is not a record. Classify a local decision by its `- Status:` line in [the decision template](../../../templates/state/decisions/decision.md), except that a file under `decisions/superseded/` or opening with a superseded header is superseded whatever its own status line still says. A file with no status line is set aside and named on the board with that reason, because a board that refuses to open over one malformed record is useless exactly when it is needed.

3. **Resolve the selectors.** `ADR-<n>` or `adr-<n>` names an ADR; `<stream>/<slug>` names a local decision; a bare `<slug>` names one only while a single stream uses it; `<stream>` names all of that stream's decisions. No selector means every record in the set. A selector that matches nothing, is ambiguous, or matches only records outside the set goes in the board's scope note — naming the candidates, or the `--only` value that would include it. When nothing resolves, stop, report why, and render nothing.

4. **Read each record and what it cites.** Read the record in full, the source files and sibling records it links, and, for a superseded record, its successor. What a record or source states is observed; the explainer's framing, analogies, and inferred consequences are labelled as inference.

5. **Explain for a newcomer.** Follow the [durable documentation reader contract](../../../references/durable-documentation.md#terminology-and-migration), pitched lower than a record is: assume the reader knows neither the system nor its domain. Open with the concrete situation the decision governs, say what would break without it, state the choice in plain words before its rules, lay out the alternatives it beat and why, and end with what it changes about the reader's own day-to-day work. A proposed decision is marked not yet agreed. A superseded decision is taught as history and links the decision that replaced it.

6. **Illustrate from the sources.** Add an illustration where it teaches faster than prose: a file tree for a layout decision, a code excerpt for an API or format decision, a diagram for a flow or state machine, a table for the alternatives. Draw each from the real record or the files it cites; an invented illustration teaches a system that does not exist. A decision nothing illustrates better goes without one.

Render the board through the [decision explainer](presentation/actions/decision-explainer.md) direction in the temporary session workspace. When the reply arrives, answer each "Tell me more about it" in chat at the same newcomer depth, one decision at a time; when several are requested or the answers need illustrations, render a follow-up board limited to those decisions instead.

Complete with the `--only` set, the records shown by kind and status, the scope note, the records set aside with the reason for each, and the index mismatches found.
