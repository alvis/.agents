# Scoring to fixed picture

Read from `directions/motion-design/music.md` when a cut or narration leads and its cues, hits, or narration windows must be planned before composing.

## Spot before choosing instruments

- Watch the locked cut (or its snapshot sequence) with narration and essential sound. Name the decisions, discoveries, demonstrations, and reactions; what the audience knows; and whether the score supports, complicates, or withholds an emotional reading.
- Write subtext before instrumentation: "sounds confident but does not believe it" decides more than "piano, strings, cinematic".
- Record the picture version, runtime, frame rate, timeline start, narration windows, entry and exit flexibility, and the ending requirement.
- Mark every hit point **must hit**, **may follow**, or **must not compete**. A camera cut is not automatically a musical accent.
- Leave room for unfamiliar terms, calculations, visual inspection, and reactions. Silence is a scoring choice, not a gap to fill.
- Take times from the actual cut or a verified timing sheet, never from a synopsis, and keep observed events apart from interpretation.

## Cue map

Keep one row per cue beside the composition plan: cue ID, picture version, entry and exit, event and priority, the music's job, constraint, and tolerance. Example: in a 30 s film, narration at 2–18 s must not compete (restrained support, no busy lead), the doors opening at 20 s must hit (answer the question motif), and the 27.5–30 s end card completes the gesture with its decay. This working map is not a rights cue sheet.

## Tempo arithmetic

Bar length is owned by [music](directions/motion-design/music.md) step 1.

- One beat lasts `60 / BPM` seconds; frames per beat are `fps × 60 / BPM` (at 96 BPM and 24 fps, 15 frames).
- To fill a slot, `BPM = 60 × beats / seconds`. Several tempos fit one slot (6 bars at 96 BPM and 8 bars at 128 BPM both last 15 s); choose by performance and phrasing, not convenient arithmetic.
- Compute every frame marker from absolute time and round once, because adding rounded beat lengths accumulates error.
- A pickup, held chord, extra beat, local tempo change, or later entry is better than distorting the scene. Keep measured drift that belongs to the performance; a perfect grid is not proof of sync.

Starting allocations at 96 BPM (a bar is 2.5 s):

| Runtime | Bars | Allocation |
| --- | --- | --- |
| 10 s | 4 | 1 question, 1 development, 1 answer, 1 identity or space |
| 15 s | 6 | 2 setup, 1 wordless action, 2 answer, 1 identity or space |
| 20 s | 8 | 2 setup, 2 development, 2 action or answer, 2 identity or space |
| 30 s | 12 | 4 setup, 2 wordless demonstration, 4 answer, 2 identity or space |

A 15 s sung cue as a starting allocation: 0–5 s one setup thought; 5–7.5 s no lyric while the key action shows; 7.5–12.5 s answer or refrain; 12.5–15 s identity phrase, breath, and decay. When the demonstration needs more room, shorten the lyric or lengthen the film; never sacrifice understanding to keep the song map.

## Emotional ranges

- Give every cue one identity (motif, instrumental roles, harmonic world, vocal policy) and vary only the local job, space, duration, event, and ending. Do not generate each small scene as an unrelated track.
- Build a mood range as sections of one plan, not separate generations: calm sparse piano, then expectant low pulses with resolution withheld, then a wider release with the motif answered; the motif and tempo relationship survive every span.
- Judge emotional contrast, motif survival, seams, and measured timing separately. Replacing one span of an existing cue while protecting its neighbours follows [refine](directions/motion-design/music/refine.md).

## Hard hits

- A section duration does not place an internal note or syllable on a frame. Put each must-hit on a section boundary or a cue in the plan, and keep the accent adjustable: a separate hit layer, or a section short enough to regenerate alone.
- Decide whether the accent anticipates, arrives with, or follows the picture event, then measure the returned audio before trusting it.

## Room for narration

- Make space by arrangement first: fewer layers and no lead melody under dense sentences. Then shape level automation and frequency balance.
- Treat ducking (the `hyperframes-audio` skill) as a starting envelope: prevent surges in short speech pauses and judge entrances and releases with the full scene.
- Audition any time-stretch for smeared transients, groove, and vocal quality; no stretch percentage is safe in general. Automatic rearrangement targets a duration and ignores lyric meaning, so inspect every join.

## Acceptance

The score serves the chosen perspective; necessary words are intelligible on ordinary speakers; must-hits land within the [music](directions/motion-design/music.md) tolerance on the correct picture version; transitions stay musical; the decay fits inside the rendered runtime. Judge the rendered film with narration, effects, and music together, not the cue alone.
