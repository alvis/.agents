# Production storyboard

The storyboard the `motion-design` action presents for approval and then writes as the HyperFrames `STORYBOARD.md`. It is the [HyperFrames storyboard format](https://github.com/heygen-com/hyperframes/blob/main/skills/hyperframes/references/storyboard-format.md) plus the production keys below, which HyperFrames keeps verbatim. Remove every placeholder before presenting it.

```markdown
---
format: 1080x1920
duration: 30s
message: <the sentence the viewer can say when the piece ends>
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
| <What are you made of?> | Hook | Scene 1, bar 1 downbeat |
| <Stroke of a Pen> | Tagline | Scene 5, final hold |

## Product

Only for a product, service, or event piece; [directing](directions/motion-design/directing.md#product-pieces) defines each line.

- Tagline: <the line the piece lands on, also in the catchphrases>
- Facts: <true, checkable claims the piece may show>
- Colour tone: <brand palette or tone, if any>
- CTA: <the one next action>

## Music plan

| Section | Bars | Time | Lyrics or cue | Tone and rhythm |
| --- | --- | --- | --- | --- |
| Intro | 1–4 | 0.0–8.6 s | {pad swell} | <mood, groove, instrumentation, tempo> |
| Chorus | 5–12 | 8.6–25.7 s | <hook lines> | <lifted energy, bigger drums, layered vocals> |

## Scene 1 — <beat>

- duration: 8.6s
- bars: 1–4
- render: web          # web | three | blender
- transition_in: cut
- scene: <one-line contact-sheet caption>
- beat: <the story beat this scene delivers toward the message>
- frame: <camera shot, angle, and move; hero position; props; light>
- motion: <anticipation → action → follow-through>
- sound: <the cue that sells the action, on its beat>
- attention: <what the viewer understands here and what leads the eye>
- sync: 1.1 hook text slams in; 3.1 camera whip
- lyric: <line sung over this frame, if any>

<One action, what moves, and what carries into the next frame.>
```

The music plan is the song's specification: approving the storyboard approves each section's time, tone, rhythm, and the lyric version the user picked or mixed, before the song is generated. `sync` points are `bar.beat` positions until `directions/motion-design/music.md` step 6 replaces them with the accepted take's measured times. Every scene starts and ends on a whole bar and carries all four of `beat`, `frame`, `motion`, and `sound`, as [directing](directions/motion-design/directing.md#write-every-scene) requires; HyperFrames accepts `Scene` headings and keeps these keys verbatim.
