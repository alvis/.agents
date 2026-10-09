# Draft and render

Read from `directions/motion-design.md` steps 8 and 9. A full render costs about half an hour of capture for a minute and a half of picture, so the user confirms a 1 fps draft first and the full render runs once. The `hyperframes-cli` skill owns the command flags; this direction owns when each render runs and what it must prove.

## Draft

1. Run `npx hyperframes check --snapshots` and fix every finding.
2. Snapshot every sync point and every moment a title, lyric, or caption leaves the screen, with the times read from the timing data object: `npx hyperframes snapshot --at <t1>,<t2>,...`. Text that lingers past its exit can fall between draft frames, and it is the fault most likely to force a second full render.
3. Render the draft: `npx hyperframes render --fps 1 --quality draft --workers <n> -o <slug>-draft-r<N>.mp4`, with `<n>` as [full render](#full-render) sets it. Observed in October 2026 on a 4-core container: 107 frames for a 107-second piece captured in 24 seconds with 3 workers.
4. Review the draft yourself as a contact sheet, one frame per second, before the user sees it.
5. Shrink it for the page (`ffmpeg -i <draft> -vf scale=540:-2 -c:v libx264 -crf 30 -c:a aac -b:a 96k -movflags +faststart <small>.mp4`; 22 MB became 4 MB in that run) and write one standalone HTML page that plays it with the song: the video inlined as a data URI, play and pause, a scrubber, and a readout of the time and music section, so the page opens anywhere with no other file. Publish it where the user can open it, such as the harness's shareable page.
6. Ask the user to confirm it through the question tool. This is the animatic lock in [music](directions/motion-design/music.md#approval-locks): feedback goes back to the build or the music, and a revision redrafts before any full render.

## Full render

- Render once, after the draft is confirmed: `npx hyperframes render --fps 25 --quality high --workers <n> -o <slug>-r<N>-master.mp4`. Production renders at 25 fps unless the platform requires another rate.
- Set `<n>` to the core count minus one, and read `workerCount` in the render trace to confirm it. Left on `auto`, HyperFrames 0.8.138 captured a full-quality render on one worker of a 4-core, 15 GB container: 36 minutes for 3,201 frames.
- Report progress while it runs; the user sees nothing else until it returns.
- Make a share copy within the platform's limit with `-movflags +faststart`, and check the encoded file as [pipeline](directions/motion-design/music/pipeline.md#hand-off-a-timing-locked-version) describes before delivery.
