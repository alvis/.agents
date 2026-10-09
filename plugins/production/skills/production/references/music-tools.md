# Music tools

Read from `directions/motion-design/music.md` when choosing a music provider, or when a needed control (supplied lyrics, voice reference, regional edit, stems) may be missing from the current one.

Provider facts as of September 2026 per the source. A documented endpoint does not establish that a given account can use it, and an MCP connector exposes only the operations it lists, not the provider's whole API. The ElevenLabs `music` skill owns ElevenLabs call shapes, models, and limits.

## Providers

| Provider | Kind | Model surface | Agent access |
| --- | --- | --- | --- |
| ElevenLabs | Hosted songs with vocals | `music_v2_5`; v2 still available; older examples and defaults name v1 or v2 | Official hosted MCP (`https://api.elevenlabs.io/v1/mcp`, OAuth) includes music generation; the older local MCP is deprecated |
| Mureka | Hosted songs with vocals, editing, stems | V9.5; V9 and O2 also priced | Official local MCP (`uvx mureka-mcp`): fixes `model="auto"`, sends no candidate count, has no edit or stem tools |
| Google Lyria | Hosted songs with vocals | `lyria-3.5` in the Gemini API; the public generation guide still shows Lyria 3 Pro | No first-party music MCP; Layer's hosted MCP and fal expose Lyria 3.5 under their own accounts, billing, and terms |
| Lyria RealTime | Live instrumental stream steered while playing | Experimental | Gemini API session |
| Soundverse | Hosted workspace: songs, singing, stems, lyrics | Song v7 through a generic task pipeline | Official hosted MCP (`https://mcp.soundverse.ai/mcp`, OAuth); outputs land in its Library behind signed URLs |
| Stable Audio 3 | Instrumentals and sound effects; no intelligible singing | Hosted up to 6 minutes; self-hosted variants | REST API |
| ACE-Step 1.5 | Self-hosted songs with lyrics, BPM, key | Declared MIT | Self-hosted HTTP API; authentication is off by default |
| Melodia v3 (Treblo, formerly Sonauto) | Hosted songs with streaming and webhooks | v3 generation; editing documented only for v2 | REST API |
| MiniMax Music 3.0 | Hosted songs | New paid access restricted to existing customers | REST API |
| Beatoven, SOUNDRAW, Loudly, Mubert | Background music for apps and video | Mubert also streams live with adjustable intensity | REST APIs; Mubert publishes an agent skill, not an MCP |
| Suno | Songs with vocals | Official API portal; eligibility, model, price, and terms not public | Third-party "Suno APIs" are separate suppliers |
| Udio | Songs with vocals | No public API | Consumer app only |

Artlist's MCP spans media generation and stock catalogue retrieval through underlying providers; it adds no music model of its own.

## Lyric and vocal controls

| Provider | Sings supplied lyrics | Musical reference | Described vocal tone | Own voice as singer |
| --- | --- | --- | --- | --- |
| ElevenLabs | Yes, in the composition plan | Audio reference guides style, tempo, instrumentation; not lyrics or the singer | Yes | Not documented; Professional Voice Cloning excludes singing; music fine-tunes learn a style, not a singer |
| Mureka | Yes | `reference_id` for style; separate `melody_id` | Yes, plus vocal gender | Vocal clone from a 15–30 s sample returns a reusable ID |
| Lyria 3.5 | Yes, or writes its own | Text and image only | Yes | Not documented |
| Soundverse | Yes | `similar_song` matches style | Yes | `vocal_reference` or a saved consented `vocal_id` |
| ACE-Step 1.5 | Yes | Reference audio for acoustic style; source audio for covers | Yes, in the caption | Reference audio conditions timbre; no identity-preserving clone |
| Melodia v3 | Yes | Continues uploaded audio | Yes | Not documented |
| Suno (app) | Yes | Covers, personas, audio uploads | Yes | Own voice after live identity verification |
| Udio (app) | Yes | Style from a song | Yes | Excludes uploaded personal voices |
| Stable Audio 3, background-music services | No | Instrumental conditioning only | No | No |

Control combinations are restricted: Mureka allows `reference_id` or a prompt with `vocal_id`, but `melody_id` combines with nothing, and O2 supports neither `vocal_id` nor `melody_id`. Soundverse's saved voice does not combine with melody input. Transcribing lyrics already in a song, writing lyrics from a text topic, and writing new words to fit existing music are different operations; no surveyed API documents the last.

## Editing a region

| Provider | Region selection | What changes in the region | Limit |
| --- | --- | --- | --- |
| ElevenLabs | Plan chunks with durations; inpainting keeps stored slices of a song saved for inpainting | Per-chunk styles and lyrics | Only stored slices keep accepted audio; reference conditioning alone does not |
| Mureka | Start and end in milliseconds | New lyrics only, no style field | At least 3 s; generated songs editable for one month, otherwise re-upload the audio |
| Soundverse | Start and end seconds, or a named section | Prompt plus required replacement lyrics | No instrumental-only mood edit documented |
| Stable Audio 3 | One or more masks in seconds | One prompt shared by all masks | Small masks let the surrounding audio dominate |
| ACE-Step 1.5 | Repaint start and end seconds | Prompt | Explicit masking needed for the chosen interval |
| Melodia (v2 route) | One interval per call | Prompt or tags, lyrics as required | v3 editing not documented |
| Lyria 3.5 | None documented | Whole-take regeneration only | Single-turn generation |
| Suno, Udio, SOUNDRAW | Consumer editors replace a selected section or adjust block energy | Revised prompt | No equivalent API documented |

No provider documents sample-identical audio outside the edited region; the edit is local, not guaranteed bit-exact.

## Stems

- ElevenLabs: a separate stem API, subject to plan entitlement.
- Mureka: `audio-separation-1` up to five WAV stems; `audio-separation-2` up to 12 WAV stems plus MIDI; `audio-separation-3` vocals and accompaniment plus MIDI. These are separation and transcription after generation, not an editable score.
- Soundverse and Loudly: stem tools; Loudly also lossless WAV.
- Stable Audio 3: generated parts are not automatically phase-aligned as a multitrack.

## Prices and licensing gates

Prices as of September 2026 per the source, in USD; units differ and are not comparable.

| Provider | Price | Unit and gate |
| --- | --- | --- |
| ElevenLabs | Extra generation minutes about $0.15–0.18 on paid tiers | Plan-dependent; API quota, stems, and use rights depend on the plan and the Music-specific terms, not the consumer "you own it" announcement |
| Mureka V9.5 | $0.15 per song from supplied lyrics, $0.50 from a prompt; V9 $0.045 | Per output, two outputs per request by default; $10 trial purchase; concurrency by purchase tier |
| Lyria 3.5 | $0.08 per song | Paid Gemini API only; excludes RealTime and resellers |
| Soundverse song v7 | $0.12 royalty-free, $0.25 standard, $0.27 distribution, $0.67 sync, $1.67 master | Price follows the licence tier chosen per generation; stems and agent work cost extra; its agent budget is checked after tools settle and can overshoot |
| SOUNDRAW API | $29.99/month for 100 songs; $300/month for 1,000 | Starter limited to new companies of up to three employees; Pro has a six-month minimum |
| Mubert API | $49/month trial (promotional), $199/month startup | 100 and 5,000 generations; streaming allowances separate |
| Melodia | $11/month for 20,000 credits; $88/month for 160,000 | Credits per operation not published |
| MiniMax Music 3.0 | $0.15 per song up to five minutes | Existing paying accounts only |
| Beatoven, Loudly, Stable Audio, ACE-Step | Not published, or compute cost | Contract, usage billing, or self-hosted operations |

Commercial-use permission, exclusivity, copyright protection, and platform eligibility are separate questions. Film, television, games, client work, standalone music distribution, and sublicensing to app users each need the relevant written grant for the exact provider, route, plan, and model. Permission to use a recording in a video does not extend to training a model on it or imitating its performer.
