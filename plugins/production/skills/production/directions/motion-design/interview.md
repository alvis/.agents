# Interview

Read from `directions/motion-design.md` steps 1, 3, and 4. Settle the brief with direction questions, confirm the look, concept, sound, and cast on a board, and show every story as a slideshow.

## Read what is already decided

List which direction questions the request clearly answers. A clear statement skips its question; an inference does not. When the user says "just build it" or "surprise me", answer the remaining questions yourself, state each answer with its reason, and continue.

## Direction questions

Ask with the harness's standard question tool, one at a time, two to four options each, recommended option first, free text always allowed. Use plain chat only when the harness has no question tool. Do not open an HTML board for these.

1. **Goal and message**: what the video should achieve and the one thing a viewer must take away. Offer messages inferred from the request.
2. **Platform**: where it will be watched. Map the answer to aspect, length, and sound behaviour with [platforms](references/platforms.md).
3. **References and materials**: the user's photos, logos, footage, or brand files; assets to obtain by web search; videos, images, or styles to mimic. Collect paths and links; search for assets only after the user agrees, and record each found asset's source and licence.
4. **Format**: suggest three or four formats from the [format catalogue](references/formats.md) that fit answers 1–3, each with a one-line reason.
5. **Mood**: suggest three or four moods that fit the format and platform, each named with a tempo range and a colour temperature so the choice carries into music and palette.
6. **Subject**: when a real person, pet, or brand figure is on screen, ask about them before designing anything: appearance and signature features, with photos; personality and catchphrases; places and eras of their life; the people around them; real anecdotes and in-jokes. Ask follow-ups until each story can be told from facts the user gave; never invent an anecdote and present it as real.

## Board

Run `essential:discover` in `interview` mode and present a guided-interview board as its presentation direction describes, carrying answers 1–6 and the drafted concepts as confirmed context. Each round demonstrates only the choice it asks the user to make, and every demo is code the build can reuse, so nothing is drawn for a choice already settled or redrawn once chosen.

The first round confirms:

- **Style directions**: five to eight visually distinct directions from the [visual style catalogue](references/styles.md), so the user compares genuinely different looks rather than variants of one. Draw them from at least three rows that differ in medium (print, drawn, 3D, photographic, typographic). Each is shown as an `embed` block holding a short looping animation demo in that style's palette, type, and motion grammar, with a decision to pick, mix, or reject. Each demo is one self-contained HTML file with inline script and no network request, written next to the board in its temporary directory.
- **Storybook**: the five concepts drafted under [concept](directions/motion-design/concept.md), each as one `embed` block holding a [slideshow](#slideshow) of its key moments, a sketch or still and one line of action per slide, marking where the music hook lands.
- **Sound**: instrumental or vocals, vocal character, language, and how the lyric relates to the message; [songwriting](directions/motion-design/music/songwriting.md) holds the options worth offering.
- **Anything else**: an open question for what the earlier sections missed.

When answer 6 applies, a second round confirms the **character styles**: six to eight styles from the [character style catalogue](references/characters.md) that suit the chosen look, spanning high, medium, and low likeness, each drawn as the actual subject from their photos and signature features rather than a generic figure. Let the user pick one, mix two, or ask for adjustments such as build, hair, or clothing, and redraw until they confirm the likeness.

Transfer every answer and annotation back to the discovery ledger before continuing. Repeat a board round only when an answer opens a new material question; when the user rejects every concept, draft five new ones on recipes not yet shown.

## Slideshow

Show a story, whether a storybook concept or the storyboard for approval, as one self-contained HTML `embed` the user steps through, because a scrolled strip of stills hides the order and pace the story depends on.

- One slide per moment: its still or sketch, one line of action, and where it sits in the song. A storybook slide marks the hook; a storyboard slide shows the frame's time window, bars, music section, and lyric.
- Controls: previous and next buttons, arrow keys, a position readout such as `3 / 7`, and a play button that advances each slide after its planned duration.
- Reuse the board's demo art for the stills, make no network request, and cut between slides instead of animating when the viewer prefers reduced motion.
