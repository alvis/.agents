---
name: production
description: Media production in three actions. motion-design crafts a motion video from zero with HyperFrames, optional Blender, and an ElevenLabs song composed to the approved storyboard; track records asset and render provenance; review binds feedback and approval to exact render revisions. Use when making a video, registering assets or renders, or recording feedback or approval.
requirements:
  model: capable
  effort: deliberate
argument-hint: "[motion-design|track|review] <request> [--work-id=<id>]"
---

# Production

Give media work the same truth discipline code enjoys, and help users make it. One skill, three actions: `motion-design` takes a video from a blank idea to a scored render, `track` gives every asset and render identity and lineage, and `review` binds feedback and approval to the exact revision it judged. Media bytes stay outside Git; their identity, lineage, and review truth do not.

## Actions

- **`motion-design`** — Make a new motion video, reel, music video, greeting, explainer, or other animated piece, starting from whatever the user has, including nothing. See [motion-design.md](directions/motion-design.md).
- **`track`** — Register footage, audio, graphics, fonts, LUTs, templates, or generated media; record a render or export; update rights or delivery; mark entries stale after an invalidating decision. See [track.md](directions/track.md).
- **`review`** — Record feedback, approval, or rejection on a cut or render; decide whether earlier approvals survive a new revision. See [review.md](directions/review.md).

Select the action by what the user wants done, not by the subject noun: "make a video" is `motion-design`, "log this render" is `track`, "the client approved v3" is `review`. When the request fits none, or two equally, ask which is intended. `motion-design` calls `track` for every asset and render it produces and `review` for every feedback round on them.

## Completion

Report the action taken and follow that action's completion contract.
