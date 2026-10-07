# Interview

Read from `directions/motion-design.md` steps 1 and 3. Settle the brief with direction questions, then confirm the look, cast, concept and sound on a board.

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

Run `essential:discover` in `interview` mode and present a guided-interview board as its presentation direction describes, carrying answers 1–6 and the drafted concepts as confirmed context. The board confirms:

- **Style directions**: five to eight visually distinct directions from the [visual style catalogue](references/styles.md), so the user compares genuinely different looks rather than variants of one. Draw them from at least three rows that differ in medium (print, drawn, 3D, photographic, typographic). Each is shown as an `embed` block holding a short looping animation demo in that style's palette, type, and motion grammar, with a decision to pick, mix, or reject. Each demo is one self-contained HTML file with inline script and no network request, written next to the board in its temporary directory.
- **Character styles**: when answer 6 applies, six to eight styles from the [character style catalogue](references/characters.md) spanning high, medium, and low likeness, each drawn as the actual subject from their photos and signature features rather than a generic figure. Let the user pick one, mix two, or ask for adjustments such as build, hair, or clothing, and redraw until they confirm the likeness.
- **Storybook**: the five concepts drafted under [concept](directions/motion-design/concept.md), each as a sequence of its key moments with a sketch or still and one line of action, marking where the music hook lands.
- **Sound**: instrumental or vocals, vocal character, language, and how the lyric relates to the message; [songwriting](directions/motion-design/music/songwriting.md) holds the options worth offering.
- **Anything else**: an open question for what the earlier sections missed.

Transfer every answer and annotation back to the discovery ledger before continuing. Repeat a board round only when an answer opens a new material question; when the user rejects every concept, draft five new ones on recipes not yet shown.
