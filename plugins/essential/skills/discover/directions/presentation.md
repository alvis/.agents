# Presenting discovery results

Use an interactive HTML review surface when visual relationships, comparison,
or in-context feedback will reduce ambiguity more than prose alone. HTML is not
the default and is never evidence by itself. The evidence ledger remains the
source of truth after answers and annotations are transferred back.

## Choose a directional action

| Discovery mode   | Directional action    | Best fit                                                                |
| ---------------- | --------------------- | ----------------------------------------------------------------------- |
| `blindspots`     | risk/context report   | Interacting risks, constraints, actors, or failure surfaces             |
| `blindspots`     | domain explainer      | An unfamiliar mechanism must become understandable before deciding      |
| `blindspots`     | blind spots           | A short request leaves its hard decisions to whoever reads it           |
| `blindspots`     | concept primer        | One idea must be learned well enough to ask a professional for it       |
| `options`        | ranked options        | Viable approaches or experiential directions need in-context comparison |
| `options`        | brainstorm spectrum   | The user should react to a deliberately broad solution space            |
| `interview`      | guided interview      | Several coupled questions need visible supporting context               |
| `reference`      | semantics map         | Terms, relationships, or observable behavior must map into the target   |
| `prototype`      | interactive prototype | A disposable interaction is the cheapest useful probe                   |
| `readiness`      | readiness check       | Evidence, assumptions, blockers, and the next owner need one view       |
| `readiness`      | plan review           | A drafted plan's judgment calls need user confirmation before hand-off  |
| `readiness`      | change walkthrough    | A finished change needs to be genuinely understood before it merges     |
| `state`          | project state         | Work already in flight, read from the state tree rather than retold     |
| `implementation` | implementation notes  | A finished change owes its merger an account of what it departed from   |

**Lifecycle actions.** plan-review, build-journal, and change-walkthrough serve
the plan → implementation → change lifecycle and are also reached by direct
request ("review this plan", "log the build deviations", "walk me through the
change"). plan-review is the interview-over-a-plan; guided-interview remains the
pre-planning interview. build-journal has no mode row because it is authored
during implementation rather than chosen as a discovery mode. implementation-notes
is the journal's counterpart at the end: the journal asks the author's reviewer
to triage each divergence, the notes ask the merger to prove they understood
it.

These actions are directions, not page schemas. Add, remove, reorder, combine,
or redesign components to deliver the clearest experience for the actual
information. Never preserve a component merely because an example contains it.
The shared annotation and single-prompt behavior is mandatory; visual recipes
and component counts are not.

Each action must nevertheless feel complete for its own job. Build from one
credible scenario and enough realistic data to expose the relevant trade-offs.
An action page is not complete when it merely places the catalog markers on a
few generic cards. Its core composition must let the user perform the action:
compare full directions, manipulate a prototype, traverse a mechanism, react
across a spectrum, answer an ordered interview, inspect source-to-target
semantics, evaluate risks, or reach a readiness verdict.

The approved [domain explainer](presentation/actions/domain-explainer.md) and
its data at `examples/data/domain-explainer.json` define the shared visual
hierarchy, responsive shell, annotation flow, and folded single-prompt
experience. Render it to see them: `examples/html/` is generated, not
committed, so the data is what to read and one `--set` run is what to look at.
Every action example follows that contract while changing its content density
and its blocks to fit the action.

Together, the fifteen action examples and four convention boards
(specimen-board, board-hub, architecture-board, triage-board) must cover the
complete reusable pattern catalog — fifteen against fourteen mode rows because
build-journal is authored rather than chosen, as above. Use the
[presentation coverage map](presentation/coverage.md) to see which action owns
each demonstration. This is suite-level coverage: generated pages still select
only the components that improve their task-specific UX. Neither is checked
mechanically beyond `examples.spec.ts`, which renders the whole run, ties this
table to it board by board, and refuses a block type that reaches no board;
rendered review is what judges whether an action is complete.

## Variable length, modular sources

A board has no fixed shape. One single section demonstrating a component mockup
is a complete, valid page; a ten-plus-section implementation-direction review is
equally valid. Section count follows the information need, never the examples'
density. Any section type repeats 1..N — several decision sections, several file
cards — and the only per-page singleton is the generated-brief prompt host. The
sidebar quick-links are not hand-authored; the runtime derives them at run time
from the sections actually present.

Every board — including a generated user artifact — is authored as one JSON
data file and rendered by `scripts/render-page/cli.ts`. Never write the page's
markup, stylesheet, or script: the renderer owns every byte of the output, so
the shell, the drawer, the annotation wiring, and the generated-prompt host are
not yours to author, reproduce, or opt out of. What you author is the board's
`kind`, `masthead`, `sections`, `sources`, and `reply`, and inside each section
the ordered `blocks` that carry the content. That division is what keeps every
board on the shared contract without a scaffold to copy or placeholders to
fill. The nineteen boards under `examples/data/` are the working catalogue of
what the format can be asked to do.

## Shared interaction contract

Follow [components](presentation/components.md) for the declarative HTML hooks.
Every user-facing section must be annotatable, at two scopes from one dialog:
the whole section, and a passage the reader selects inside it. A selection note
carries its quote into the generated prompt, so a comment on one sentence
arrives attached to that sentence; both come from the shared runtime, and a
section neither re-implements nor opts out of them. Answers, decisions, optional
follow-up requests, overrides, and annotations regenerate one Markdown prompt
immediately. The page displays that prompt in one host and provides exactly one
control labelled **Copy prompt for LLM coder**. Do not add per-section prompt
copy actions. A separately labelled copy control for non-prompt material, such
as code, is allowed only when it cannot be mistaken for the generated reply.

Untouched defaults are suggestions, not user decisions. Record whether a
control was touched. Show suggested responses in the sidebar immediately; do
not fill empty lists with static explanatory strings. In the generated prompt,
distinguish confirmed recommendations, explicit overrides, optional or selected
follow-ups, unresolved suggestions, and free-form notes. User input always
outranks a recommendation. Do not manufacture a decision for an explanatory
page; it may contain only follow-up actions.

Use safe text APIs for user content. The page must remain legible when
JavaScript fails, storage is unavailable, or the clipboard API is blocked.
Persist only page answers and annotations in browser-local storage; fall back
to in-memory state without preventing review.

## Shared theme contract

The renderer emits its own stylesheet, and the `--ui-*` tokens it defines are
the only theme-value source. Every colour on a board resolves through one of
them, so a board is themed by re-pointing tokens rather than by writing rules.

The `theme` key. A board carries an optional `theme` object — the one place
colour is re-pointed for the board at hand. Its `accent` is a hue in degrees,
which rotates `--ui-accent`, `--ui-accent-soft`, `--ui-accent-ink`, and
`--ui-focus` in both schemes while keeping the built-ins' lightness and chroma;
one number is enough to give each board of a companion set its own identity so
the set reads as themed siblings. Its `light` and `dark` maps override any
`--ui-*` token by name, including the semantic ramps `--ui-verdict-*`,
`--ui-status-*`, and `--ui-k-*`, which is how a board's domain states — go/stop
verdicts, work statuses, finding categories — are mapped onto the shell's
vocabulary. Nothing is whitelisted and nothing checks the result, so the
contrast a themed board reaches in both schemes is the author's to hold. Prefer
aliasing the shell's own families (`--ui-positive`, `--ui-insight`,
`--ui-provenance-amber`, `--ui-sev-critical`) over inventing hues.

The specimen exception. House tokens stay the default for page chrome, but an
embedded specimen or mockup should read as the subject product, not the tool.
An `image` or `svg` block carries the product's own palette inside the picture
itself, and an inlined SVG that draws with `var(--ui-*, …)` fallbacks inherits
the board's tokens where it wants to and keeps its own where it does not. The
annotation pins layered over a specimen stay on house tokens, because they are
the tool's layer rather than the product's.

The page follows the host system's scheme by default and carries one control
that cycles auto, light, dark; the choice is saved across boards rather than
per board, because a reader who picks dark on one wants dark on its companions.
Both schemes are first-class — a token overridden in one and not the other is a
board that only half works.

The shared visual direction is an empowering developer workspace with liquid
glass depth and the warm editorial grammar of the approved source reference:
a natural canvas, translucent layered surfaces, crisp code typography,
terracotta interaction energy, and restrained olive for insight. Glass supports
hierarchy rather than decorating every region; prose sections can remain open
on the canvas. Preserve readable fallback colors whenever `backdrop-filter` is
unavailable.

## Guided conventions and extensibility

Four optional conventions raise the honesty and depth of a review surface when
the content warrants them. Reach for [components](presentation/components.md)
for the exact hooks:

- provenance pills wire each claim's status from the evidence ledger, so the
  reader sees what is observed, inferred, assumed, decided, approved, or open;
- a "Trade-offs, honestly" block states the wins, costs, and failure modes of a
  direction, with an invented-data flag for illustrative filler;
- author annotation pins over a browser-frame specimen teach a mockup in place,
  distinct from the user's own Add-note mechanism;
- a multi-board hub links sibling boards by session-relative href.

Two things are standard rather than optional, because a reader needs them
whether or not the content warrants a convention. A run that produces more than
one board puts the **board set** in every board's docnav, not only on a hub —
the runtime hides the block below two entries, so a single-artifact run shows
nothing and the author does nothing differently. And a section explaining a
flow, pipeline, or state machine **draws it**: hand-authored SVG where the
drawing carries the claim, otherwise a Mermaid figure, with prose supporting the
diagram rather than replacing it.

The foundation is fixed: the page shell, annotatable sections, **per-card
response capture** (an option set with reasons and a badged recommendation
wherever a card carries a real decision with alternatives — never a bare
accept; an accept toggle for single-recommendation cards; a note affordance
per card; every response reflected on the card, in the docnav counters, and in
the live prompt), the single-prompt contract, the `--ui-*` tokens and the
`theme` rules above, and these provenance, trade-off, pin, and board
conventions. `references/features.md` enumerates this floor as a checklist
with its validation mapping.

**Above that floor, design freely.** The block catalog is a reference shelf of
proven devices, not a completeness requirement, and the action recipes are
starting points, not prescribed section lists. Section order, block choice, and
the shape of each block are the executor's design decisions, made for the
content at hand — approach each board like a design lead giving this product
its own treatment, not a form-filler. Guided, not rigid — and never omit ledger
content because no block fits it neatly; say it in prose rather than losing it.

## Temporary artifact lifecycle

Always save generated, user-specific board data before presenting it. Use the
platform temp root through Python's `tempfile.mkdtemp` to open one session
workspace, with sanitized slugs and a unique suffix:

```python
workspace_dir = tempfile.mkdtemp(
    prefix=f"essential-discover-{repo_slug}-session-"
)
```

One workspace holds every board produced during the session, so boards can
cross-link with session-relative hrefs (`./sibling.html`). This resolves through <!-- doc-path-gate: ignore -->
the operating system (`$TMPDIR` on macOS, the configured temp root such as
`/tmp` on Linux, and `%TEMP%` on Windows) without a shared filename collision.
Write each board's JSON and any assets it cites inside that workspace; asset
paths resolve against the data file's own directory and may not escape it.
Artifacts stay ephemeral — durable, bookmarkable, and cross-linked only within
the session, never a permanent deliverable.

The presentation flow is always the same: write the data into the session
workspace and render it.

```bash
# one board
bun run scripts/render-page/cli.ts <board>.json -o <board>.html
# a whole run, every board carrying the same set list
bun run scripts/render-page/cli.ts --set <run>.json -o <dir>
```

A run file names each board's data, its output, and the label and blurb the set
list shows for it, so the cross-links are derived once rather than repeated in
nineteen places. The set block appears in every board's drawer, not only on a
hub, and stays hidden below two entries — so a single-board run shows nothing
and the author does nothing differently.

The output is one self-contained document that makes no network request: the
stylesheet and runtime are emitted inline, images arrive base64, SVG arrives as
markup, and a prototype arrives packed into a sandboxed `srcdoc`. A remote URL
is refused rather than fetched. Mermaid is the one heavy inclusion, and it is
inlined **only** into a board that carries a `mermaid` block, because the bundle
is several megabytes; a board without one weighs a few hundred kilobytes. That
is the trade the figure buys, taken per board.

Never hand-edit the rendered HTML — it is generated, and the next render
discards the edit. To change anything about a board, change its data and render
again.

Present the rendered file in this order:

1. the LLM coder's built-in local browser or HTML viewer;
2. a cloud artifact viewer/store only when a suitable tool exists and the
   content is safe to externalize;
3. a local browser such as Chrome.

Never externalize sensitive discovery content merely to satisfy the preference
order. After the user's decisions and annotations are captured in the one
generated prompt and transferred to the ledger, discard the whole session
workspace and every board rendered from it.

## Golden-example confirmation

The domain-explainer example was explicitly approved after desktop and narrow
review. Treat it as the golden baseline for new action pages. Preserve its
right-side desktop navigation, bottom narrow navigation, shared button
language, section annotation dialog, live decision/note lists, and one folded
generated prompt. The action recipe remains directional: change, remove, or
add content components whenever that improves the task-specific UX.

Read the golden examples as a ceiling of craft to aspire to, not a floor to
clear. They deliberately showcase the system at full stretch — a complete
provenance table, every trade-off group, a richly illustrated specimen — so one
page can demonstrate the whole catalog at once. A generated page is not obliged
to match that density: fill only what its own artifact needs, and let the
showcase set the bar for polish and personality rather than hand you a checklist
of sections to reproduce. Matching the golden board's delight is the goal;
copying its inventory is the failure mode.

## Non-goals and routing

Some presentation types are deliberately not offered here. Each would break the
single-prompt or disposable-surface contract, so route it to its proper owner
instead.

| Not offered                                                    | Why it is out of scope                                                                                                    | Where it belongs                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Recurring status reports, incident postmortems                 | Backward-looking reporting is not discovery, and a disposable surface is the wrong home for a record meant to last.       | reporting / documentation flows |
| Design-system reference sheets                                 | A production design artifact is durable by definition, which the temporary-surface contract forbids.                      | `web:design`                    |
| Exportable asset sheets, client-side file downloads            | A file the user keeps is a durable deliverable, contradicting the discard-after-transfer contract.                        | a durable-artifact skill        |
| Durable config or prompt editors with state-serialized exports | The atoms exist — live previews, toggle rigs — but a board's one output is the single generated prompt, not a saved blob. | the single generated prompt     |
| Pre-authored per-card prompt fragments                         | A board exposes exactly one live prompt, so per-card prompt snippets are prohibited outright.                             | the single prompt host          |
