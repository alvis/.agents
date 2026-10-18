# Direction and decision boards

Read this when concepts need comparing, a design decision needs the user's eyes, or a before/after pair needs sign-off. A board is authored as one JSON data file and rendered by Essential's discover renderer, which owns the page's markup, styling, annotation, and single generated reply. Never hand-write board HTML.

## Author the data

Follow `essential:skills/discover/directions/presentation.md` for the shared contract and `essential:skills/discover/directions/presentation/components.md` for the block vocabulary. Use the action that matches the job:

| Job | Discover action | Blocks that carry it |
| --- | --- | --- |
| Compare 2–3 direction concepts | Ranked options (`essential:skills/discover/directions/presentation/actions/ranked-options.md`) | `image` or `embed` per concept, a comparison `table`, a final `choice`, keep/steal/reject `decision` blocks |
| Show one concept or specimen in the product's own palette and explain it in place | Specimen board (`essential:skills/discover/directions/presentation/actions/specimen-board.md`) | `image` or `svg` with `pins`, `tradeoffs` |
| Confirm one design decision (a state pattern, a density, a palette question) | Ranked options, or a single section with a `decision` | `image`, `decision`, `note` |
| Sign off a before/after or design-versus-build pair | Specimen board | Paired `image` blocks per viewport and mode, `decision` |

Every concept frame uses the same real content, state, and viewport, so the concept is the only variable. Render each concept as an actual artifact first: a small self-contained HTML composition screenshotted at the relevant widths and placed with `image`, or packed with `embed` and `viewports` when interaction is the point. Captions name the organizing idea, its meaningful choices, and its main tradeoff, and label any illustrative content. Put the recommendation and its reason in the `choice` block's `recommendation`; a rank communicates evidence, not approval. Keep board chrome on the renderer's house tokens. The product's palette belongs inside the concept images or the specimen, never in board `theme` overrides that would restyle the tool.

## Render and present

Store the data and every asset it cites in one directory under `<design-evidence-dir>/boards/<timestamped-board-stem>/`, named under `essential:references/naming.md`; asset paths resolve against the data file and cannot leave its directory. Render with the renderer from Essential's root (from the injected state contract, as for the docs templates):

```bash
bun run "${ESSENTIAL_ROOT}/skills/discover/scripts/render-page/cli.ts" "<board-dir>/board.json" -o "<board-dir>/board.html"
```

Open the rendered page and look at it before the user does: broken layout, missing images, or unreadable captions get fixed in the data and re-rendered, never in the HTML. Present it as `essential:skills/discover/directions/presentation.md#present-the-board` orders. Remote users cannot see a local browser window, so when no viewer reaches them, send the concept images themselves with any file or image delivery the harness offers.

## Capture the decision

The board's generated reply carries the user's selection, kept and stolen traits, rejections, and annotations. When the reply comes back, return immediately for the main agent to record in the design child's decision log: every presented concept's concrete details, the chosen concept, rejected concepts with one-line reasons, retained traits, and confirmation or assumption notes. When the user answers outside the board, ask through the harness's structured question tool under `essential:directions/questions.md`, putting the recommendation first and giving a free-text escape for mixes.

Ask only when the user requested a visual choice or a major decision genuinely needs their judgment. Otherwise select under existing authorization and present the board as a record of the choice and its alternatives.

## Keep the evidence

The board data and concept images stay under `boards/` through sign-off as design evidence. The HTML can be regenerated from the data, so treat it as disposable. Retire evidence only under the shared work-retention lifecycle, never automatically through this skill.
