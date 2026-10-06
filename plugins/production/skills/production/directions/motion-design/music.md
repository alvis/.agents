# Score to picture

Read from `directions/motion-design.md` step 7. The picture leads: the storyboard's bar grid fixes where sections, hits, and catchphrases fall, and the music is composed to that grid, then measured and the cut refit to what was actually generated. Read the [ElevenLabs `music` skill](https://github.com/elevenlabs/skills/blob/main/music/SKILL.md) for call shapes, models, limits, and content restrictions; this direction owns only the fitting.

When the user supplied the song, skip generation and hand the song to HyperFrames' `music-to-video` workflow: its analyzer and `audiomap.json` own the beat grid, so take every sync time from that audio map rather than from `hyperframes beats`.

## Choose the path

| Sound | Path |
| --- | --- |
| Instrumental bed, no section control needed | Render a picture-locked draft and generate with the music skill's video-to-music endpoint, passing the mood as description and tags, then run steps 5 and 6. This endpoint cannot regenerate one section, so when step 6 would regenerate, switch to a composition plan (steps 1–4) instead of retrying the endpoint. |
| Vocals, lyrics, or hits that must land on named moments | Steps 1–6 below with a composition plan. |

## Steps

1. **Lock the grid.** Take the tempo from the storyboard (chosen from the mood's range) in 4/4 unless the style calls otherwise; one bar lasts `240 / BPM` seconds. Adjust frame durations, not the tempo, so every section boundary falls on a whole bar; a change of more than half a bar means the storyboard moment needs re-pacing, so raise it with the user.
2. **Write the lyrics to the grid.** Give each sung line one or two bars and roughly one stressed syllable per beat, so a line fits its bars without the model rushing or stretching it. Put the hook catchphrase at the start of the section whose first downbeat carries the biggest visual hit. Keep lines singable: plain words, consistent rhyme, no artist names or copyrighted lyrics.
3. **Map sections to a composition plan.** One chunk per musical section (intro, verse, pre-chorus, chorus, bridge, outro), merging storyboard frames that share a section. Each chunk's `text` carries a `[Section]` label, its lyric lines, and inline cues such as `{drum fill}` or `{drop}` placed where the storyboard has a hit; `duration_ms` is the section's bar count times bar length. Put genre, instrumentation, vocal character, tempo as `<BPM> BPM`, and key mood words in the first chunk's `positive_styles`, and what to avoid in `negative_styles`. Save the plan beside the project as the music's source of truth.
4. **Generate with timestamps.** Compose from the plan with the detailed streaming call and word timestamps enabled, using the latest model the music skill names and a fixed `seed` so a regeneration is reproducible. Save the audio, the returned plan and metadata, and the word timestamps. Generate two or three takes when the budget allows and let the user pick by ear.
5. **Measure.** Chunk durations are targets the newest models do not enforce exactly, so never assume the plan's times. Place the track in the composition as the music clip (`data-timeline-role="music"`) and run `npx hyperframes beats` for the beat grid; take word times from the saved timestamps. Find each storyboard sync point's measured beat or word.
6. **Refit the picture.** Move every sync point in the timing data object to its measured time and re-render snapshots at those points. A hit is in sync within one video frame (about 33 ms at 30 fps), which stays under the roughly 45 ms audio-lead offset viewers start to notice. When a section drifted more than half a bar, moving the picture would distort the shot: regenerate that section with a corrected plan instead, then measure again.

## Finish

- Trim or extend the tail so the music resolves with the last frame; use the `hyperframes-audio` skill for fades and, when there is narration, ducking.
- Record the track through the `track` action as a generated asset: provider, model, seed, the saved plan, and the output hash. A regenerated take is a new revision, and every render built on the old take is stale.
