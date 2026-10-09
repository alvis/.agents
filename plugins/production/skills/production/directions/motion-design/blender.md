# Blender shots

Read from `directions/motion-design.md` step 7 for shots the storyboard marks `render: blender`. Use Blender only when a shot needs what HyperFrames' Three.js adapter cannot deliver well, such as physically based materials, simulation, heavy geometry, or path-traced light. A Three.js scene stays on the HyperFrames timeline and follows a timing change for free; a Blender plate must be re-rendered when its timing changes.

## Timing

- Set the Blender scene frame rate to the composition frame rate.
- Derive each shot's frame range from the locked timing data object: `start = round(start_seconds × fps)`, `end = round(end_seconds × fps) − 1`. Its boundaries are measured from the accepted take in `directions/motion-design/music.md` step 6, so a plate rendered from them needs re-rendering only when the take is revised.

## Render

Keep scene setup (camera, lights, materials, colour management, output resolution) saved in the `.blend` file and drive the render with command-line flags only; a Blender connector that runs Python breaks the workflow's no-Python rule, so do not use one:

```bash
blender -b shots/<shot>.blend -s <start> -e <end> -o //../renders/<shot>/frame_#### -F PNG -x 1 -a
ffmpeg -framerate <fps> -start_number <start> -i renders/<shot>/frame_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 16 assets/<shot>.mp4
```

Run both from the project root; Blender resolves `//` against the `.blend` file's directory, so `//../renders/` lands in the root's `renders/`. Render a PNG sequence rather than a video, with Output > Overwrite off (and Placeholders on when several machines share a shot) saved in the `.blend`, so rerunning the same command after an interruption skips frames already written.

## Layering

- **3D behind web motion** (preferred): place the encoded plate as a HyperFrames video clip and animate HTML layers over it. HTML layers carry alpha natively.
- **3D over web motion**: render the HyperFrames layer with transparency (`npx hyperframes render --format mov`) and composite it under the Blender PNG sequence with ffmpeg's `overlay` filter at the same frame rate. Do not feed alpha WebM into a composition; Chromium's VP8/VP9 alpha playback is unreliable.
- Match the style sheet: take palette, light temperature, and grain from it so the plate and the web layers read as one film.
- Check colour at every handoff: render the plate in the view transform the style sheet's palette was picked under (Standard for flat brand colours) and compare one frame's swatches against the web layer, because a filmic transform shifts brand hexes.
- Keep words, prices, and anything that may change in HyperFrames layers over the plate, so a copy fix never re-renders Blender.

## Provenance

Record each plate through the `track` action as a derived asset: the `.blend` file hash, Blender version, engine, frame range, and output hash. A changed frame range is a new revision.
