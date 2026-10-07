# Build the picture

Read from `directions/motion-design.md` step 6, after `BRIEF.md` and `STORYBOARD.md` exist. HyperFrames owns the composition contract; this direction owns how a storyboard becomes good motion.

## Ground rules

- Every frame is a pure function of time. HyperFrames enforces a single paused, seekable timeline; keep it that way: no wall-clock reads, no unseeded randomness, no state carried between frames. Seek-safety is what lets snapshots, parallel builders, and the music refit work.
- Time everything from the storyboard's bar grid, not from hand-typed seconds. Keep the tempo, bar length, and every sync point in one data object the scenes import, so the music refit in `directions/motion-design/music.md` moves the cut by editing one table.
- Follow the style sheet in the storyboard for palette, type, and motion grammar; a scene that needs a new colour or easing adds it to the style sheet first.

## Pacing

These rules come from music videos built this way, where the first cuts were rejected for sitting still:

- One action per shot, and something moves in every shot. A frame that holds fully still for longer than one bar reads as a stall against the pulse; a held reaction or comic pause keeps a breath, blink, or camera drift alive inside the hold. Performance and ambient forms (V1, V7, MUS7) let gestures finish and change little by design; there the light, camera, or environment carries the motion.
- Lay out each shot with [composition](directions/motion-design/composition.md): it says what leads the eye and how attention hands over across a cut.
- Cuts and hits land on beats; big changes land on downbeats or section boundaries.
- Every transition is motivated: an object, colour, or camera move from the outgoing shot carries into the incoming one.
- Keep the camera alive with slow pushes, drifts, or parallax when nothing else moves.
- The words are not the video. Unless the format is a lyric video, on-screen type carries the catchphrases and the story carries the rest.

## Build order

1. Write a short animation guide in the project: the style sheet, the shared helpers, the timing data object, which files each scene may edit, and the pacing rules above.
2. Build one reference scene end to end, usually the hook. Review it with `npx hyperframes snapshot --at <t1>,<t2>,<t3>` at its sync points and fix it until it sets the bar for the rest.
3. Build the remaining scenes. When several are independent, give each to its own subagent with the animation guide and its storyboard frame; a builder edits only its own scene file and reports bugs in shared files instead of editing them.
4. Review every scene on snapshots at its sync points and transitions. Send a scene back with specific notes rather than accepting a weak one.
5. Run `npx hyperframes check` and fix every finding before scoring.

## Failure signals

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Snapshot differs between runs at the same time | Unseeded randomness or wall-clock use | Derive variation from a seeded hash of the element index |
| Scene looks right in preview but jumps in render | State carried between frames | Recompute every value from time alone |
| Cuts feel late against the music | Times typed in seconds drifted from the grid | Re-derive from the timing data object |
| Two scenes clash at the cut | Transition not motivated | Carry one element across the boundary |
