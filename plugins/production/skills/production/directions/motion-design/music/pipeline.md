# Run paid music jobs

Read from `directions/motion-design/music.md` step 4 before submitting any paid generation, and again before comparing takes or handing the accepted track to the render.

Choose the workflow by what must survive the next revision. Explore with complete takes while the direction is open; once a hook, voice, or picture timing is approved, switch to a route that preserves it ([refine](directions/motion-design/music/refine.md)). The ElevenLabs `music` skill owns call shapes; this direction owns the job discipline around them.

## Admit each paid call deliberately

Before every paid call, confirm:

- **Permission**: the user approved this spend. Generation, fine-tuning, and publication are separate permissions; an official connector grants none of them.
- **Inputs**: lyrics, reference audio, and voices are owned or permitted for this use, as recorded through [track](directions/track.md).
- **Model**: an exact model ID the account can use, never a default that may silently change.
- **Candidate count**: count outputs, not requests; some providers return two songs per request by default and bill each ([music tools](references/music-tools.md)).
- **Budget**: projected cost fits the remaining budget after reserving in-flight jobs; reject new work when it does not.
- **Secrets**: the API key lives in the environment or a secret store, never in the project, compositions, receipts, or logs.

## Submit, reconcile, persist

1. Write the request to a receipt file before sending it, so an interrupted call still leaves a record.
2. Send it once. Never retry a paid create automatically: on a timeout or an uncertain response, check the provider's history or status for the job before resubmitting. Use an idempotency key only where the provider documents its scope and retention.
3. Follow the provider's actual contract: direct audio, an asynchronous task to poll, or a stream. Record every returned job or song ID in the receipt.
4. ElevenLabs' detailed music stream is server-sent events with CRLF line endings: normalise line endings before splitting events, or the parser misses every boundary. Audio arrives as base64 chunks: decode each, concatenate the bytes, then remux (`ffmpeg -i raw.mp3 -c copy take.mp3`) to get a valid file; the raw concatenation is not one. Observed in an October 2026 run.
5. Save audio and stems at once: signed download URLs expire, and a seed or job ID is not an archive. Keep the provider's original encoded file beside any working WAV; converting lossy audio to WAV restores nothing.
6. Keep paid calls out of the render. Compositions read saved local files only and never fetch or generate audio while drawing frames.

## Store and name

- Keep music in a `music` folder beside the HyperFrames project, holding `plan.json`, `receipts/`, and `takes/`. Media bytes stay out of Git per [track](directions/track.md).
- Name files by project, role, and revision: `<slug>_take-03_original.mp3`, `<slug>_audio-timing_v03.wav`, `<slug>_audio-final_v03.wav`.
- Record provenance (provider, model, request, inputs, hash) and revisions through [track](directions/track.md). The receipt holds only the operational fields track does not: account and access route, job IDs, candidate count, billed and estimated cost, measured duration, and the accept or reject decision with its reason.
- Keep rejected takes' receipts: they explain the cost and why the accepted take won.

## Validate before anyone listens

- Mechanical checks first: `ffprobe` duration and format; `ffmpeg -af silencedetect` for unintended silence; `ffmpeg -af ebur128=peak=true` for clipping and true peak.
- Then the user listens, with the picture when there is one, for words, pronunciation, voice continuity, motif, emotional fit, and transitions. An agent's description of audio is not listening evidence; report what was checked mechanically and ask the user for the rest.

## Compare takes

- Freeze the words, brief, and constraints before generating, and give each variant the same number of outputs; tuning one variant repeatedly while another keeps its first attempt is not a comparison.
- Apply hard gates before preference: permitted use, usable export, required words present, timing refittable within the [music](directions/motion-design/music.md) tolerance, authorised references.
- Loudness-match takes before the user compares them, because the louder take reliably sounds better. Play them unlabelled when practical.
- Judge preference, constraint adherence, revision success, and cost separately. Cost per accepted take counts every rejected output, billed retry, revision, stem operation, and finishing hour; a cheaper first take can cost more to finish.
- For a target language other than English, have a speaker of it review pronunciation; English demos say nothing about it.
- When choosing between providers rather than takes, run the same three briefs through each with three outputs per brief, a sample budget rather than statistical proof; keep every output including failures, then compare each provider's native editing route on one requested change to a protected section.

## Hand off a timing-locked version

Hand the render one named, timing-locked revision: the accepted master, its hash, the word and section timing measured from it ([alignment](directions/motion-design/music/alignment.md)), any stems, and the saved plan. Its start, duration, and sample rate must match what the timing data object was measured from. A later performance edit reopens what [refine](directions/motion-design/music/refine.md) lists.

Before delivery, check the encoded file: runtime, frame rate, dimensions, codecs, audio format, loudness and peak ([refine](directions/motion-design/music/refine.md)), and every requested alternate version. A successful export command does not prove the result. Publishing is a separate permission from rendering.
