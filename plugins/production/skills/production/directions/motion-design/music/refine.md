# Refine the music

Read from `directions/motion-design/music.md` when a measured or auditioned take has a fault, or before mixing and mastering the accepted take for delivery.

Improve the weak passage without losing what made the take worth keeping. Refinement starts after a take is chosen; generating, comparing, and storing takes belongs to [the music pipeline](directions/motion-design/music/pipeline.md).

## Diagnose the layer

Name the layer before touching anything; the fix lives in that layer.

| Symptom | Layer | Smallest useful fix | Passes when |
| --- | --- | --- | --- |
| Polished but emotionally empty | Intent, composition | Rewrite the central thought or hook | The idea works without production gloss |
| Awkward or mispronounced line | Lyric, performance | Rewrite the line, then regenerate the whole phrase | Correct words, natural stress, same singer |
| Chorus does not arrive | Form, arrangement | Change its approach: harmony, register, or subtraction before it | The contrast survives a level-matched comparison |
| Replacement sounds like another singer | Regional generation | Widen the edited region to a fuller musical unit, or keep the original | No change of voice identity or room |
| Good vocal is masked | Arrangement, mix | Reduce the competing part before replacing the performance | Words are understood without the lyric sheet |
| Music misses a reveal | Timing | Move the event, change the entry, or rebuild the local phrase | The hit lands within the [music](directions/motion-design/music.md) tolerance |
| Clicks or chopped tail | Assembly, export | Repair boundaries and fades, or extend the delivery length | The final encoded file plays continuously |

## Repair the smallest musical unit

1. **Preserve the accepted take.** Keep it as its own revision and write a preservation contract: what must not change (words, melody, singer, groove, surrounding audio, runtime). A seed does not guarantee exact replay, so the saved bytes are the only copy of a take.
2. **Select a complete musical unit.** Include the pickup, breath, and release, and start and end on whole bars. A phrase edits more naturally than an isolated word; never cut through a sustained note or a reverb tail.
3. **Change one cause.** Revise wording, delivery, instrumentation, or transition according to the diagnosis, not all four because they are editable.
4. **Repair in place.** Prefer a regional edit that keeps the accepted audio around the region over regenerating the song: with ElevenLabs, inpainting keeps stored slices of the accepted take and regenerates only the chosen section; the ElevenLabs `music` skill owns the call. Other providers' regional controls are described in [music tools](references/music-tools.md).
5. **Audition before, through, and after the seam.** Check for doubled breaths, dropped beats, tuning, voice identity, room sound, missing words, and energy jumps.
6. **Compare the whole result** with the preserved take. Accept only when the target improves with no unacceptable regression; cleaner is not always better.
7. **Recheck dependent timing** as listed under Reopen after a change below: a new pickup or a longer syllable moves word cues even when the total duration is unchanged.

Set an attempt budget of three per diagnosis, a project policy rather than a model property: beyond it, retries without a new diagnosis are not progress. Then change method: widen the unit, simplify the line, rebuild from usable parts, have a person perform it, or keep the original.

Fine-tuning a model addresses a sonic identity that many pieces miss repeatedly; it never fixes one line in one take, so return to this loop for that.

## Finish the arrangement before the mix

- Give every moment one focus. Remove ornamental parts that compete with the key word or the visual hit.
- Assign each part a distinct role: pulse, bass foundation, harmonic support, lead, answer, atmosphere. A part with no distinct role goes.
- A chorus that needs more lift usually needs less material just before it, not more compression on it.
- Keep intentional space around decisive words, reveals, and the ending.

## Stems

- Stems are separated or separately generated audio parts, not original multitracks, MIDI, or notation. Use them only when they give control the stereo master cannot.
- Line every stem up from a common start with matching duration and sample rate. Sum them and compare with the master: separation and master processing can make the sum differ, so matching file names prove nothing.
- Listen to each stem alone and in context: vocal stems carry accompaniment leakage and removal artifacts; MIDI extractions need correction.
- Keep the stereo master as the reference until a stem mix beats it.

## Mix and master for video

- Mix against the picture, not alone. For fades, ducking under narration, and the music-bed level, use the HyperFrames `hyperframes-audio` skill.
- Check on headphones, small speakers, and summed to mono; words must be intelligible, with no clipping, no unintended silence, and an ending that decays with the last frame.
- Measure loudness on the final encoded video, because encoding changes peaks: `ffmpeg -i <render>.mp4 -af ebur128=peak=true -f null -` reports integrated loudness (LUFS) and true peak (dBTP).
- Starting targets, which the platform's current delivery specification overrides ([platforms](references/platforms.md)):

| Delivery | Integrated loudness | True peak | Reason |
| --- | --- | --- | --- |
| Web, social, YouTube | about -14 LUFS | -1 dBTP or lower | Major platforms normalise playback near -14 LUFS, so a louder master is turned down and only loses dynamics; lossy AAC encoding creates inter-sample peaks above the source's |
| Broadcast | -23 LUFS (EBU R128) or -24 LKFS (ATSC A/85) | -1 dBTP (R128), -2 dBTP (A/85) | Required by those broadcast standards |
| Muted autoplay loop | none | none | No sound plays; ship without an audio track or with silence |

## Lock timing, then master

A timing lock fixes the performance and arrangement on the timeline; only mixing and mastering may follow it. Save the timing master and the final master as separate revisions. When the final master replaces the timing master, verify the start sample, duration, pickups, vocal timing, and tail: "same song" is not proof of interchangeability.

## Reopen after a change

| Change | Reopen |
| --- | --- |
| Mix or master only; start sample and duration unchanged | Re-render and re-measure loudness; sync points stand |
| One phrase repaired | Re-measure that section's beats and words ([music](directions/motion-design/music.md) step 5), refit its events and the transitions on both sides, re-snapshot them, update that phrase's word cues |
| Section regenerated, tempo or duration changed | Re-measure the whole take and refit every later event and the tail |
| New take | Everything downstream of the music |

Every change produces a new render revision: record the new take and mark renders built on the old one stale through the [track](directions/track.md) action; approvals of earlier renders lapse under the [review](directions/review.md) action.
