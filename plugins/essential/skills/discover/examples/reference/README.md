# Reference boards (design targets, not suite members)

Two user-approved boards demonstrating the marriage of the discover shell with
the free-form lessons. They are **design references**: open them in a browser
to see the target look and interaction, and read
`directions/presentation/components.md` ("Decision-first devices") for the
distilled recipes. They are intentionally *not* part of the example
suite — they are hand-written HTML with their own capture wiring, whereas every
suite board is JSON rendered by `scripts/render-page/cli.ts`.

- `readiness-verdict-board.html` — verdict dashboard: board-theme accent from
  the shell's olive family, `--ui-verdict-*` ramp, stat rails, filter chips,
  data-driven verdict cards with per-card accept + note, critical-path strip,
  sign-off, live generated reply. (Artifact `0d374551`.)
- `decision-browser.html` — one-decision-at-a-time browser: `--ui-k-*`
  category ramp, pip index, ←/→ + `A` keyboard nav, option sets with reasons
  and a badged recommendation (selection = the decision), accept toggle for
  single-recommendation cards, per-card notes, live generated reply.
  (Artifact `367d0714`.)

The devices these boards demonstrate are generalized into the renderer's own
block vocabulary — option sets with reasons, accept/override pairs, per-card
capture, semantic-ramp edges, sequence strips, board sign-off — so ANY action
can compose them from data. These two boards are illustrations, not the only
shapes.

What every generated board must copy from these is the **floor behavior**
(`references/features.md`): per-card response capture reflected in counters
and the single generated prompt, semantic-ramp theming through the board-theme
overlay, static docbar on narrow viewports, and no docmark.
