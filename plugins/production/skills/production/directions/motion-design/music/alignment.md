# Align words and meaning to the audio

Read from `directions/motion-design/music.md` step 5 when lyrics, narration, or named moments must follow the accepted take, and before animating any word.

The recording sets the clock; the storyboard says what each moment means. Approved lyric text holds no performance timing, and a loudness detector finds no meaning, so both timings are measured from the one accepted take and authored into the timing data object that [build](directions/motion-design/build.md) defines.

## Fix the audio first

- Lock one accepted take as the audio timing master before detailed word animation. Regional repairs ([refine](directions/motion-design/music/refine.md)) come before alignment, because every repair moves word times.
- The composition references the saved local file, never a provider URL, and never generates or fetches audio while rendering.
- Store the master's revision and SHA-256 in the timing data object. When the file's hash no longer matches, the timing is stale: re-measure before rendering.
- A polished visual makes any soundtrack feel convincing; approve the take by ear before the animatic, not after the detail.

## Choose the vocal job

| Deliverable | Audio route | Timing leads from |
| --- | --- | --- |
| Song or musical short | Sung take generated from approved lyrics | The locked take's measured words and sections |
| Narrated piece | Narration made separately; an instrumental bed generated around its pacing | The narration and its pauses |
| Existing track | The user's permitted recording; no generation | HyperFrames' `music-to-video` audio map ([music](directions/motion-design/music.md)) |
| A specific person's singing voice | A route that documents consented singing-voice reference ([music tools](references/music-tools.md)) | The locked take, with identity reviewed separately from lyric accuracy |

A speech voice clone does not sing, and style conditioning does not transfer a singer's identity. A lyric video or stylised typography avoids lip-sync entirely; a singing face needs an **avatar** format from the [format catalogue](references/formats.md).

## Measure words

1. Run speech-to-text with word timestamps on the accepted take. In an October 2026 ElevenLabs run, requesting word timestamps from `music_v2_5` returned none; word times came from `scribe_v1` with word-level granularity run on the take. Forced alignment (audio plus the known lyrics) is the alternative when transcription garbles sung words.
2. Map the transcribed words onto the approved lyric lines in order. Sung transcription misspells, merges, and drops words; the approved lyric is the text, the transcript supplies only times.
3. Treat every time as an editable aid. Elongated vowels, repeats, and overlapping voices produce wrong word boundaries: snapshot the composition at each animated word's time and have the user confirm the ones that carry a hit.
4. Save the word table beside the take, keyed by the master's revision.

Keep only the granularity the picture uses: phrase cues for readable lyric display, word cues only where a word is highlighted or hit, and phoneme or viseme cues only for a face that sings. Amplitude is not a mouth shape. When the typography shows selected words, keep complete captions as a separate track.

## Author semantic timing

The event map is authored, not detected. It lives in the timing data object with the master's revision and hash, the frame rate, the duration, a section list, and an event table:

- **Sections**: id, start, and exclusive end in seconds, measured from the take; an exclusive end means the next section starts exactly where this one stops, so no frame belongs to two.
- **Events**: the time of each visual action, keyed by its meaning (`secondChairEnters`, `hookTitleSlam`, `holdFinalImage`).

Map meaning to events:

- A section boundary carries a scene or camera change; the hook word carries the biggest hit on its downbeat.
- A vocal entry brings its subject on screen; a phrase end releases or settles it.
- A significant rest is a held frame or a breath of stillness, not dead air to fill.
- The last chord's decay holds the final image until the audio ends.
- A small number of chosen accents get hits; marking every beat makes nothing land.

Audio-reactive detail (amplitude or frequency driving small motion) stays inside an authored scene and never drives scene changes; `npx hyperframes beats` gives the beat grid, not chorus or meaning. Precompute any reactive feature from the master into a per-frame table, so every frame stays seek-safe.

## Place events on the timeline

- Every event goes on the composition's single paused GSAP timeline at the time read from the timing data object: `tl.to(target, vars, timing.events.hookTitleSlam)`. No `setTimeout`, no reads of the audio element's playback time, no CSS transitions running on their own clock.
- Convert to frames only where a decision is per-frame: `Math.round(seconds * fps)` for the nearest frame of a picture event; choose the rounding for caption boundaries deliberately so a caption never appears before its word. Derive every marker from absolute time as [scoring](directions/motion-design/music/scoring.md) tempo arithmetic describes.
- Keep sample-accurate audio placement separate from frame rounding: the audio clip starts at its exact time even when picture events snap to frames.
- Load fonts and images before a frame is accepted, and test arbitrary seeks and out-of-order snapshots; an animation that only works played from the start hides a state dependency.

## Animatic before detail

Build only the recurring visual anchor, the section changes, rough gestures, and lyric placement, then preview with the accepted take. Approve that musical relationship before adding particles, textures, elaborate camera moves, or secondary animation; detail built on a wrong relationship is rebuilt.

## Check

- Render boundary ranges first: lyric entries, section transitions, the strongest refrain, and the ending; then the whole piece, watched with sound.
- Mechanical: exact runtime, the audio stream present, captions inside the frame, no stale master hash, the full tail present.
- Human: important words intelligible, type on screen long enough to read, motion serving the phrase, repeated sections keeping their identity, flashes and camera moves comfortable.
