# Production storyboard

The storyboard the `motion-design` action presents for approval and then writes as the HyperFrames `STORYBOARD.md`. It is the [HyperFrames storyboard format](https://github.com/heygen-com/hyperframes/blob/main/skills/hyperframes/references/storyboard-format.md) plus the production keys below, which HyperFrames keeps verbatim. Remove every placeholder before presenting it.

```markdown
---
format: 1080x1920
duration: 30s
message: <the one thing the viewer must take away>
reward: <what the viewer should learn, feel, recognise, or enjoy>
recipe: <main recipe code; supporting code and which wins on conflict>
lead: <picture | track | lyrics | narration>   # the timing authority
arc: Hook → Build → Turn → Payoff → Sign-off   # the chosen recipe's method; a music video or loop may need no plot
audience: <who watches, where>
platform: <social reel | website hero | ...>
fps: 25             # production rate; the draft renders at 1 fps
tempo: 112          # BPM; one bar = 240 / tempo seconds
meter: 4/4
style: <chosen style direction name>
sound: <instrumental | vocals: character, language>
---

## Style sheet

- Palette: <named tokens with hex values>
- Type: <display and text faces, sizes for the canvas>
- Motion grammar: <eases, hold lengths, transition vocabulary>
- Cast and props: <recurring characters or objects and how they are drawn>

## Catchphrases

| Line | Role | Where |
| --- | --- | --- |
| <What are you made of?> | Hook | Frame 1, bar 1 downbeat |
| <Stroke of a Pen> | Tagline | Frame 5, final hold |

## Music plan

| Section | Bars | Time | Lyrics or cue | Tone and rhythm |
| --- | --- | --- | --- | --- |
| Intro | 1–4 | 0.0–8.6 s | {pad swell} | <mood, groove, instrumentation, tempo> |
| Chorus | 5–12 | 8.6–25.7 s | <hook lines> | <lifted energy, bigger drums, layered vocals> |

## Frame 1 — <title>

- duration: 8.6s
- bars: 1–4
- render: web          # web | three | blender
- transition_in: cut
- scene: <one-line contact-sheet caption>
- attention: <what the viewer understands here and what leads the eye>
- sync: 1.1 hook text slams in; 3.1 camera whip
- lyric: <line sung over this frame, if any>

<One action, what moves, and what carries into the next frame.>
```

The music plan is the song's specification: approving the storyboard approves each section's time, tone, rhythm, and the lyric version the user picked or mixed, before the song is generated. `sync` points are `bar.beat` positions until `directions/motion-design/music.md` step 6 replaces them with the accepted take's measured times. Every frame starts and ends on a whole bar.
