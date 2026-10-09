# Music

Read from `directions/motion-design.md` step 2 when the sound may change what leads, step 4 to write the music plan, and step 6 to compose and lock the song. The [ElevenLabs `music` skill](https://github.com/elevenlabs/skills/blob/main/music/SKILL.md) owns call shapes, limits, and content rules, and [music tools](references/music-tools.md) owns provider facts; this direction owns the order, the locks, and the fitting.

## Decide what leads

The timing authority is the one artifact every later time comes from; name it in the music plan.

| Fixed first | Timing authority | Route |
| --- | --- | --- |
| Storyboard | The approved music plan until a take is accepted, then that take's measured times | Spot with [scoring](directions/motion-design/music/scoring.md), then steps 1–6 before any picture is built. |
| Finished cut | The cut's bar grid | Spot with [scoring](directions/motion-design/music/scoring.md), then steps 1–6, repairing the take rather than the cut where they disagree. |
| Final narration | That narration version | Spot its windows with [scoring](directions/motion-design/music/scoring.md), write with M8 in [song recipes](directions/motion-design/music/song-recipes.md), then steps 1–6. |
| Exact words or facts to sing | Approved words, then the accepted take | Sing a hook-sized lyric and rewrite words and melody together ([songwriting](directions/motion-design/music/songwriting.md)); never freeze a whole poem unsung. |
| A supplied song | The recording | HyperFrames' `music-to-video`: its `audiomap.json` owns the beat grid, so take sync times from it, not `hyperframes beats`. Direct the picture with [music video recipes](directions/motion-design/recipes/music-video.md). |

With only an emotional idea, test one thought in a few melodic readings and arrangements before a full track. When music and picture develop together, rough both, test the pair, then lock in order. Never shorten an essential explanation to keep a tidy grid, or force a plot onto a track whose promise is performance or atmosphere.

## Approval locks

Each lock approves an exact file and version through the `review` action before dependent work spends budget; liking an idea is not a lock.

1. **Direction selected**: the idea, point of view, and performance to develop, with what to keep and one next change. Compare a bounded set of distinct directions, first without picture; three directions of two takes is a spending policy, not an optimum.
2. **Timing locked**: words, delivery, arrangement, section positions, and ending approved; the exact take saved. Captions, mouth animation, and hard sync depend on this file, never on the plan or intended BPM. Repairs before it follow [refine](directions/motion-design/music/refine.md).
3. **Animatic approved**: the 1 fps draft page in [render](directions/motion-design/render.md#draft) shows the picture working on the locked take; fix concept or timing before render quality.
4. **Release ready**: master, render, stems and captions as needed, editable sources, asset records, and permissions present. Publishing is a separate authorized step.

A change reopens only what depends on it. Audio changes follow the reopen table in [refine](directions/motion-design/music/refine.md); a recut or new narration timing reopens cue entries, hits, narration windows, captions, and the ending; colour or type leaves the audio alone.

## Generation path

When a needed control may be missing, check [music tools](references/music-tools.md) before choosing.

| Sound | Path |
| --- | --- |
| Instrumental bed, no section control | Generate from a picture-locked draft with the video-to-music endpoint (mood as description and tags), then steps 5–6. It cannot regenerate one section, so when step 6 would regenerate, switch to a composition plan instead of retrying. |
| Vocals, lyrics, or named hits | Steps 1–6 with a composition plan. |

## Steps

1. **Lock the grid** while finalizing the storyboard. Take the storyboard tempo (from the mood's range), 4/4 unless the style says otherwise; one bar lasts `240 / BPM` seconds. Adjust frame durations, not tempo, so every section boundary falls on a whole bar; a change over half a bar means the moment needs re-pacing, so raise it with the user. Each section's time window comes from the frames it scores, so approving the storyboard approves the song's timing.
2. **Write the lyrics to the grid.** Draft two or three versions of each sung section, each a different angle on the same idea (cheekier, warmer, another language mix) and each fitting the same bars, so the user picks or mixes them per section on the storyboard instead of approving the only draft they saw. One or two bars per sung line and about one stressed syllable per beat, so the model neither rushes nor stretches. Open the section whose first downbeat carries the biggest visual hit with the hook catchphrase. Plain words, consistent rhyme, no artist names or copyrighted lyrics; craft is in [songwriting](directions/motion-design/music/songwriting.md).
3. **Map sections to a composition plan.** One chunk per musical section, merging frames that share one. Each chunk's `text` holds a `[Section]` label, its lyric lines, and cues such as `{drum fill}` or `{drop}` at storyboard hits; `duration_ms` is bars times bar length. Put genre, instruments, vocal character, `<BPM> BPM`, and mood words in the first chunk's `positive_styles`, each section's tone and rhythm in its own chunk's `positive_styles`, and exclusions in `negative_styles`. Save the plan beside the project as the music's source of truth.
4. **Generate.** Before any paid call, clear the checks in [pipeline](directions/motion-design/music/pipeline.md), which also owns receipts, storage, and comparing takes. Compose from the plan with the detailed streaming call, word timestamps enabled, the latest model the music skill names, and a fixed `seed`. The seed traces a take but does not guarantee an exact replay, so the saved audio bytes are the only copy of a take. Save them with the returned plan, metadata, and any timestamps. Generate takes within the direction budget and let the user pick by ear.
5. **Measure.** Newer models treat chunk durations as targets, so never assume the plan's times. Place the track as the music clip (`data-timeline-role="music"`) and run `npx hyperframes beats`. Take word times as [alignment](directions/motion-design/music/alignment.md) directs: from returned timestamps when present, otherwise from word-level speech-to-text on the rendered take. Observed with `music_v2_5` in October 2026: the timestamped call returned no word times and `scribe_v1` supplied them; seven sections landed within about 0.1 s of target, yet a planned silent break was sung through. Confirm every planned silence or gap on the audio before syncing picture to it, then find each sync point's measured beat or word.
6. **Lock the timing.** Write every sync point's measured beat or word time into the timing data object before the picture is built, so the cut is built once on the take instead of refitted after it. A hit is in sync within one video frame (40 ms at 25 fps), under the roughly 45 ms audio lead viewers start to notice. Compare the sung words with the approved lyrics for meaning, not word for word: a reworded or dropped line is fine while its section still carries the idea and the hook is sung. A section that drifted over half a bar, a missing hook, or a planned break or section the take dropped would distort the shot if the picture moved to it, so repair the take through [refine](directions/motion-design/music/refine.md) and measure again. Reshape the storyboard around a take only when the user prefers that take as it is, and approve the changed frames again before building.

## Finish

- Trim or extend the tail so the music resolves on the last frame; fades and narration ducking follow the `hyperframes-audio` skill, and mastering targets follow [refine](directions/motion-design/music/refine.md).
- Record the track through `track` as a generated asset: provider, model, seed, saved plan, output hash. A regenerated take is a new revision, and every render built on the old one is stale.
