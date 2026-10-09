# Build the picture

Read from `directions/motion-design.md` step 7, after `BRIEF.md`, `STORYBOARD.md`, and the accepted take's locked timing exist. HyperFrames owns the composition contract; this direction owns how a storyboard becomes good motion.

## Ground rules

- Every frame is a pure function of time. HyperFrames enforces a single paused, seekable timeline; keep it that way: no wall-clock reads, no unseeded randomness, no state carried between frames. Seek-safety is what lets snapshots, parallel builders, draft renders, and a later take revision work.
- Time everything from the timing data object locked in `directions/motion-design/music.md` step 6, never from hand-typed seconds. It holds the tempo, bar length, and every sync point's measured time, and the scenes import it, so a revised take moves the cut by editing one table.
- Follow the style sheet in the storyboard for palette, type, and motion grammar; a scene that needs a new colour or easing adds it to the style sheet first.
- Reuse components and functions as much as possible. The hero, recurring props, transitions, and motion functions each live once in shared components or helpers that every scene imports, with per-scene differences passed as parameters; before writing a second copy of anything, extract it into the shared files. Reuse keeps one grammar across scenes and lets one fix land everywhere.

## Pacing

These rules come from music videos built this way, where the first cuts were rejected for sitting still:

- One action per shot, and something moves in every shot. A frame that holds fully still for longer than one bar reads as a stall against the pulse; a held reaction or comic pause keeps a breath, blink, or camera drift alive inside the hold. Performance and ambient forms (V1, V7, MUS7) let gestures finish and change little by design; there the light, camera, or environment carries the motion.
- Lay out each shot with [composition](directions/motion-design/composition.md): it says what leads the eye and how attention hands over across a cut.
- Cuts and hits land on beats; big changes land on downbeats or section boundaries.
- Every transition is motivated: an object, colour, or camera move from the outgoing shot carries into the incoming one.
- Keep the camera alive with slow pushes, drifts, or parallax when nothing else moves.
- The words are not the video. Unless the format is a lyric video, on-screen type carries the catchphrases and the story carries the rest.

## Motion from functions

Drive continuous motion with functions of time rather than chains of held poses: a function stays smooth at any frame rate and seeks exactly, because its value depends on time alone. Use one wherever a cut between keyed poses would read stiff:

- **Settle**: a damped spring, `1 − e^(−ζωt) · cos(ω·√(1 − ζ²) · t)`, for slams, landings, and pops; ζ near 0.5 overshoots once, ζ near 1 settles without a bounce.
- **Blink**: close and reopen the lids over two to four frames at 25 fps, at seeded intervals of roughly two to six seconds, because a faster blink is invisible and a slower or regular one reads as sleepy or mechanical; add an extra blink before a head turn or a change of thought.
- **Idle life**: a sine breath or sway, `A · sin(2πft + φ)`, with its own phase for each part, so a held pose keeps breathing; set `f` to the beat rate (`BPM / 60`) or half of it when the hold sits on the music.
- **Limbs**: rotate each joint (shoulder, elbow, wrist) about its parent with its own slightly delayed function, so arms bend, follow through, and settle; swapping whole-arm drawings between poses reads stiff.
- **Paths**: move along an arc or Bézier curve by eased progress instead of a straight line between keys.
- **Shake and jitter**: seeded value noise of time with a decaying amplitude, never `Math.random`.

With GSAP, pass the function as a tween's `ease`, or drive it from a linear proxy tween spanning the shot whose `onUpdate` sets the SVG attributes from that tween's time; both are recomputed on every seek. Keep these functions in the shared helpers so every scene moves with one grammar.

## Build order

1. Write a short animation guide in the project: the style sheet, the shared helpers, the timing data object, which files each scene may edit, and the pacing rules above.
2. Build one reference scene end to end, usually the hook. Review it with `npx hyperframes snapshot --at <t1>,<t2>,<t3>` at its sync points and fix it until it sets the bar for the rest.
3. Build the remaining scenes. When several are independent, give each to its own subagent with the animation guide and its storyboard scene; a builder edits only its own scene file and reports bugs in shared files instead of editing them.
4. Review every scene on snapshots at its sync points and transitions. Send a scene back with specific notes rather than accepting a weak one.
5. Run `npx hyperframes check` and fix every finding before the [draft](directions/motion-design/render.md#draft).

## Failure signals

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Snapshot differs between runs at the same time | Unseeded randomness or wall-clock use | Derive variation from a seeded hash of the element index |
| Scene looks right in preview but jumps in render | State carried between frames | Recompute every value from time alone |
| Cuts feel late against the music | Times typed in seconds drifted from the measured timing | Re-derive from the timing data object |
| A hero looks frozen between beats | No blink or breath runs through the hold | Add the [blink and idle-life functions](#motion-from-functions) from the shared helpers |
| Limbs or held poses look stiff | Whole poses swap with nothing moving between them | Drive joints and holds with [functions](#motion-from-functions) |
| The same element moves differently between scenes | It was copied into each scene instead of shared | Move it into one shared component or helper and import it |
| Two scenes clash at the cut | Transition not motivated | Carry one element across the boundary |
