# JSON block catalogue

Every board this skill ships is one JSON file rendered by
`scripts/render-page.ts`. The author writes data; the builder produces the
bytes. This catalogue is the vocabulary that data is written in: the page
envelope, the section, each block type, and the inline runs a sentence can
carry.

Nothing here is markup. There is no HTML pass-through anywhere in the format —
not in a block, not in a run, not in a table cell — so a data file can describe
an inline citation or a glossary term without being able to author a tag.

**A reference shelf, not a ceiling.** A board reaches for the blocks its
content calls for and no others. There is no completeness requirement and no
block a board must contain.

## The envelope

```json
{
  "kind": "ranked-options",
  "id": "ranked-options-storage-v1",
  "action": "Pick a storage engine",
  "title": "Storage engines, ranked",
  "masthead": {
    "eyebrow": "Decision",
    "headline": "Three engines, one of them ours",
    "lede": "What each buys, what it costs, and where it stops working.",
    "meta": [{ "label": "Options", "value": "3" }]
  },
  "sections": [],
  "reply": { "heading": "Reply", "template": "{{summary}}" }
}
```

| Field | Required | What it is |
| --- | --- | --- |
| `kind` | yes | one of the nineteen presentation kinds in `PAGE_KINDS` |
| `id` | yes | stable identifier, emitted as `data-page-id` and used as the key the reader's answers are saved under |
| `action` | yes | the label the collapsed drawer carries |
| `title` | yes | the document title |
| `masthead` | yes | `eyebrow`, `headline`, `lede`, and optional `meta` figures |
| `theme` | no | `accent` hue in degrees, or raw `--ui-*` overrides per scheme |
| `sections` | yes | the body, numbered in the order given |
| `sources` | no | what the board rests on, listed beneath the last section |
| `reply` | when the board asks anything | `heading` plus a `template` whose `{{markers}}` fill as the reader answers |

`id` is the storage key. Two boards sharing one `id` share one set of a
reader's answers, and a run listing two of them is refused by name.

A board that asks a question must carry a `reply` and is refused without it. A
board that asks nothing draws no reply half at all — no count, no reply, no copy
button — because a drawer offering to copy an empty reply invites the reader to
send one.

The template's markers are filled in as the reader works: `{{summary}}` becomes
one paragraph saying where the board stands, `{{answers}}` the questions grouped
by whether each was confirmed, changed, answered or left unmarked, and
`{{notes}}` the passages the reader annotated. `{{provenance}}` and
`{{caveats}}` are filled once at render time, because neither moves as the
reader answers.

## The section

```json
{
  "id": "cost",
  "label": "Cost",
  "eyebrow": "Section two",
  "title": "What each engine costs to run",
  "blocks": []
}
```

`id` is unique across the board and is what the drawer's navigation, a quiz's
`explains`, and every in-page jump link resolve against. Every id in the format
— section, question, finding, probe — must match `[A-Za-z0-9_-]+`, because it
becomes a URL fragment, and a space or a `#` produces a jump that silently fails
rather than an error. Each kind is unique within its own peer group.

## Blocks

Thirty-seven types, grouped by what they are for. Every one carries `type`.

### Prose and structure

#### `prose`

A paragraph, capped to a comfortable reading measure.

```json
{ "type": "prose", "text": "The engine is chosen once and lived with." }
```

`text` is `Rich` — a string, or a list of runs (see **Inline runs**).

#### `list`

A bulleted or numbered list, each item optionally led by its claim.

```json
{
  "type": "list",
  "ordered": false,
  "items": [{ "lead": "Durability", "text": "survives a hard kill" }]
}
```

#### `tldr`

An executive summary of two to four strong-lead bullets.

```json
{
  "type": "tldr",
  "title": "In short",
  "points": [{ "lead": "Pick B", "text": "it is the only one that fsyncs." }]
}
```

#### `steps`

An ordered sequence with numbered markers. Each step takes `title`, `text`,
and an optional `state` of `done`, `current` or `todo`.

#### `callout`

An aside set off from the surrounding prose.

```json
{
  "type": "callout",
  "tone": "bad",
  "title": "This loses writes",
  "lead": "3 engines",
  "text": "None of them fsync by default."
}
```

`tone` is `neutral`, `good` or `bad`, and is carried as a word in the heading
as well as a colour, so the difference between a warning and a reassurance
survives greyscale.

#### `disclosure`

Content the reader opens for themselves — `summary`, an optional `open`, and
its own `blocks`. A board earns its length by not spending it up front.

#### `table`

A comparison table. Every row must be as long as `columns`.

```json
{
  "type": "table",
  "columns": ["Engine", { "label": "p99", "align": "right" }],
  "rows": [
    [{ "text": "B-tree" }, { "text": "4ms", "verdict": "good" }]
  ]
}
```

A column may be a string or `{ label, width?, align? }`. A cell carries `text`
and an optional `verdict` of `good`, `mixed` or `bad`. A row may instead be
`{ cells, provenance }` where the whole row's figures share one source.

#### `metrics`

A responsive strip of labelled figures: `items` of `{ label, value }`.

#### `tree`

A directory listing drawn with box-drawing characters — `root` plus nested
`items` of `{ name, note?, children? }`. It is text, not a picture: it survives
copy and paste into a reply, reads aloud in order, and costs the page nothing.

#### `glossary`

Terms the board defines rather than assumes: `entries` of `{ term, detail }`.
A `term` run elsewhere on the page lights its entry, and is lit by it.

#### `faq`

Anticipated reviewer questions: `items` of `{ term, detail }`, where `detail`
may carry a `source` run.

### Figures

#### `diagram`

A layered node-and-edge graph, drawn as inline SVG at natural size.

```json
{
  "type": "diagram",
  "title": "Write path",
  "nodes": [{ "id": "wal", "label": "Write-ahead log" }],
  "edges": [{ "from": "wal", "to": "table" }],
  "pins": [{ "x": 40, "y": 120, "text": "the seam that loses writes" }]
}
```

Every edge end must name a declared node. A node's `detail` explains one box; a
`pin` explains a place — a junction, a boundary, a gap between two boxes that no
single node owns.

#### `mermaid`

A Mermaid graph, rendered in the browser from its own `source`. The source
travels with the page and stays visible when the runtime is absent or the graph
is malformed, so a broken diagram degrades to the text that describes it rather
than to nothing. `alt` is required.

#### `svg`

A hand-authored SVG, inlined as markup from a file beside the data. Inlined
rather than referenced, because a board is one file; as markup rather than a
data URL, so its own text inherits the page's tokens and stays selectable.
Takes `src`, `alt`, an optional `title` and optional `pins`.

#### `image`

A picture, inlined so the board stays one file. Takes `src`, `alt`, an optional
`caption` and optional `pins`. An SVG is inlined as markup rather than base64,
because that is both smaller and themeable.

#### `embed`

A packed HTML document, embedded in a sandboxed frame.

```json
{
  "type": "embed",
  "src": "prototypes/picker.html",
  "alt": "The engine picker, running",
  "viewports": [{ "name": "Phone", "width": 390, "height": 780 }],
  "chrome": "example.internal/picker"
}
```

The author names a path; the builder packs that file's own stylesheets, scripts
and images into one document and hands it over as `srcdoc`. The frame runs
scripts but is denied `allow-same-origin`, so a prototype behaves like itself
while being unable to read the page it sits in. The first viewport is the
initial one.

### Source excerpts

#### `code`

A source excerpt, held verbatim. The block *is* the excerpt — its fields sit
directly on it.

```json
{
  "type": "code",
  "language": "typescript",
  "label": "store/write.ts",
  "code": "await log.append(record);\nawait table.commit();",
  "highlight": [1],
  "selections": [
    { "text": "log.append(record)", "note": "the only durable step" }
  ],
  "comments": [{ "line": 2, "text": "not fsynced", "severity": "high" }],
  "ties": [{ "key": "commit", "lines": [2] }]
}
```

`language` is required and decides both the formatter and the grammar. The
builder formats the excerpt before rendering it, then measures colour as
ranges — never as markup — so no author byte can become a tag and no entity can
be cut in half by a span boundary. `tokens` is written by the builder and is
never authored.

A `selection` names the code it covers by its own `text`, verbatim as it reads
*after* formatting, so re-indentation cannot move it. Where the text appears
more than once, `occurrence` picks which match, 1-based, counted over
non-overlapping runs. A selection that matches nothing, matches more than once
with no `occurrence`, or names an `occurrence` past the last match is refused
by JSON path.

#### `codepair`

Two excerpts read against each other, sharing one annotation sequence.
Takes `eyebrow`, `caption` and `panels` — the two excerpts, left first.

### Findings and readings

#### `findings`

Severity-ranked observations, the risk report's core. `items` of
`{ id?, title, severity, text, owner?, evidence? }` where severity is
`critical`, `elevated`, `watch` or `clear`.

`filters` adds a chip per severity present. A chip dims what it does not match
rather than hiding it, so the set the reader is looking at never shrinks and the
counts on the chips keep meaning what they say.

#### `risk-matrix`

Severity, likelihood and mitigation, one row per risk:
`{ risk, severity, likelihood, mitigation }`.

#### `failure-map`

One failure, split into what prevents, detects and contains it: `failure` plus
`prevent`, `detect` and `contain`, each a list of `Rich`.

#### `tradeoffs`

What a direction buys, what it costs, and where it stops working: `wins`,
`costs`, `failsWhen`. The third is the one that makes the block honest — wins
and costs alone read as a balanced case.

#### `readiness`

Labelled `n of m` readings, drawn as bars and stated as numbers: `items` of
`{ label, value, of, note? }`.

#### `owners`

Who each piece of work is routed to: `people` of
`{ name, initials?, role?, due? }`.

#### `kanban`

Lanes whose membership is itself the claim: `lanes` of `{ label, cards }`.

#### `ledger`

Grouped rows that open for the whole of what is recorded about them: `groups`
of `{ label, note?, progress?, facts, entries, empty? }`, each entry
`{ code, title, status, tone?, facts }`, and each fact a `{ label, value }`
pair. `progress` is `{ done, of }` and draws as a bar beside the group name;
`tone` is `good`, `busy`, `bad` or `neutral`.

Where a `kanban` card carries only what fits on it, a ledger keeps the rest one
disclosure away, in native `details` elements — no runtime, open when the page
is printed, and already a disclosure to a screen reader. Use it when the record
behind each row has more fields than a card can hold and the reader will want
them one row at a time.

#### `timeline`

A dated or timestamped rail of moments: `items` of
`{ when, title, state?, kind?, tags? }`, where `kind` is `plan-confirmed`,
`discovery`, `deviation` or `todo`.

#### `deviations`

Where the build departed from the plan: `items` of
`{ title, planned, found, chose, revisit? }`. The plan and the code are drawn
against each other rather than in one paragraph, because the comparison is the
claim.

#### `boards`

The hub's index of every board the run produced. It carries no fields: the
boards come from the run's set file, which is the same list every board's
sidebar is drawn from.

### Questions

Seven blocks are questions — `choice`, `note`, `checklist`, `scale`,
`decision`, `observations` and `quiz` — and each carries `id`, `ref`, `label`
and `ask`, and may carry `response`. `id` is what the answer store keys by.
`ref` is the citation code drawn on its chip and beside it — `D4`, `T5`, `Q2` —
and must match `[A-Za-z0-9][A-Za-z0-9-]{0,5}`, six characters at most, because
it is drawn inside a fixed chip. Both are unique across the board: two questions
under one `id` share a radio group and erase each other, and two under one `ref`
make every later citation ambiguous in exactly the conversation the code exists
to serve. `response` is `decision` or `follow-up` — a decision is something the
reader settles, a follow-up something they may ask for, and the reply keeps them
apart so an untouched optional question is never reported as a refusal.

`gate` and `probe` are described here too because they belong to the same
reading, but neither is a question block: a gate asks nothing and only scores,
and a probe is answered by ranking rather than by choosing, so it carries an
`id` and a `label` but no `ref` and no `ask`.

#### `choice`

A single-answer question.

```json
{
  "type": "choice",
  "id": "engine",
  "ref": "D1",
  "label": "Storage engine",
  "ask": "Which engine do we build on?",
  "recommendation": "B-tree: the only one that fsyncs on commit.",
  "choices": [
    {
      "value": "B-tree",
      "summary": "Durable by default.",
      "tags": ["Recommended"],
      "pros": ["fsyncs on commit"],
      "cons": ["slower writes"]
    }
  ]
}
```

`tags` come from a closed vocabulary — `Architectural`, `Ideal`,
`Recommended`, `Pragmatic`, `Hotfix`, `Workaround` — and a tag outside it is
refused rather than drawn, because an unrecognised word in a badge reads as an
endorsement the page never made. Each tag has its own colour, held apart from
every other by a measured threshold in `scripts/render-page/style/token.spec.ts`.

A material decision must explain its recommendation: a `Recommended` badge
states which without stating why.

#### `checklist`

A multi-select question; its answer is a set, joined by `", "`. Takes `options`
of `{ value, summary? }`.

#### `scale`

An ordered scale; its answer carries the chosen ordinal position. Takes
`points` of `{ value, label? }`.

#### `decision`

A yes/no question, answered by pressing Approve or Change, with an optional
`placeholder` for the note beneath.

#### `note`

A free-text question, with an optional `placeholder`.

#### `observations`

Numbered cards the reader ticks where one lands: `items` of
`{ title, file?, found, impact, source? }`.

A `finding` states a risk the author already judged; an observation states
something they noticed and are asking the reader whether it lands. That is why
it carries no severity and does carry a tick — the reader's agreement is the
missing half of it.

#### `quiz`

A question with a right answer, asked of whoever is about to merge.

```json
{
  "type": "quiz",
  "id": "fsync",
  "ref": "Q1",
  "label": "Durability",
  "ask": "What happens to an uncommitted write on a hard kill?",
  "explains": "cost",
  "options": [
    { "value": "It is lost", "correct": true, "because": "the log is not fsynced" },
    { "value": "It is replayed" }
  ]
}
```

`explains` is required. It names the section a wrong answer links back to, and
is refused when the board holds no section by that name: a link-back that scrolls nowhere tells
a reader who got the answer wrong that there is nothing more to read.

Exactly one option must be marked `correct`; none and the gate could never
clear, two and the board holds a question with no single answer. `because` is
revealed once the question is answered, on the right option and the wrong ones
alike.

A quiz saves as a `choice` and reaches the reply like any other question. What
`correct` adds is read only by `gate` — a wrong answer is never reported to the
disposition machinery as a disagreement, because the reader was not being asked
what they preferred.

#### `gate`

The merge verdict, filled from every quiz question on the board.

```json
{
  "type": "gate",
  "title": "Ready to merge?",
  "pass": "Merge it.",
  "fail": "Not yet — re-read the sections linked above."
}
```

It ships showing the unanswered state rather than being built by the runtime, so
a board read with scripting off says plainly that the quiz decides whether to
merge instead of showing an empty box. A gate on a board that asks no quiz
question is refused: a gate with nothing to score would clear itself.

#### `probe`

A list the reader ranks, by dragging or by key: `id`, `label`, `items`. The
authored order is the page's own proposal; the reply reports the reader's only
once it differs from it, so a list left as drawn is never reported back as a
ranking somebody made.

## Inline runs

Any field typed `Rich` takes a string, or a list of runs. A run states what a
span *is*, never what it should look like.

| Kind | What it marks |
| --- | --- |
| `text` | plain text, escaped and otherwise unstyled |
| `code` | an identifier, path, or fragment of code, set in the mono face |
| `mark` | a passage the page is drawing the reader's eye to |
| `dim` | a qualifier that should read quieter than the sentence around it |
| `sub` | a secondary label under a table cell's own value |
| `term` | a term the board defines; ties to its glossary entry both ways |
| `tie` | a span tied to the region of a code block that produces it |
| `link` | a link; only `http`, `https` and `mailto` are accepted |
| `source` | a citation naming where the surrounding claim came from |
| `provenance` | a figure tagged `measured`, `estimated`, `assumed` or `invented` |

```json
{
  "type": "prose",
  "text": [
    "A commit costs ",
    { "kind": "provenance", "text": "4ms", "level": "measured" },
    " on the write path, in ",
    { "kind": "code", "text": "store/write.ts" },
    "."
  ]
}
```

A bare string anywhere in the list is shorthand for a `text` run.

## What the builder refuses

Every refusal names the problem *and* the JSON path it is at, so an author
never has to search for it.

- a field of the wrong type, or a required field absent
- a `kind` outside `PAGE_KINDS`, or a block `type` the dispatcher does not know
- an `id` that is not a safe URL fragment, or a `ref` longer than six characters
- a duplicate section, question, finding or probe `id`, or a duplicate `ref`
- a table row that is not as long as its `columns`
- a diagram edge naming a node that was never declared
- a quiz whose `explains` names no section on the board
- a quiz that does not mark exactly one option `correct`
- a gate on a board that asks no quiz question
- a code selection whose `text` is only whitespace, matches nothing, matches
  more than once with no `occurrence`, or names an `occurrence` past the last
  match
- two code selections overlapping, since neither can wrap the other's characters
- a code line number past the end of the excerpt
- a `codepair` that does not hold exactly two panels
- a choice tag outside the closed vocabulary
- a link whose scheme is not `http`, `https` or `mailto`
- a board that asks a question and carries no `reply`
- a run set listing two boards under one `id`, omitting the board being
  rendered, or giving a board an `href` that leaves the run

## Where each shape is defined

| Shape | Module |
| --- | --- |
| page, section, theme, kinds | `scripts/render-page/types/page.ts` |
| the block union | `scripts/render-page/types/block.ts` |
| question blocks | `scripts/render-page/types/question.ts` |
| choices, options, observations, quiz options | `scripts/render-page/types/answer.ts` |
| excerpts, selections, ties, comments | `scripts/render-page/types/code.ts` |
| inline runs | `scripts/render-page/types/inline.ts` |
| the content sub-shapes | `scripts/render-page/types/content.ts` |
| ledger groups, rows and facts | `scripts/render-page/types/ledger.ts` |
| the diagram graph | `scripts/render-page/diagram/shape.ts` |
| the run set | `scripts/render-page/types/set.ts` |

`scripts/render-page/block.ts` is the dispatcher every entry above answers to.
Nothing checks the two against each other: a test comparing this file to that
one would assert agreement between two checked-in artifacts, which
`TST-CORE-10` forbids. Adding a block type therefore means adding its entry
here in the same change.
