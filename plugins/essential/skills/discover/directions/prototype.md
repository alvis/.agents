# Prototype mode

Use this mode only when creating a disposable artifact is the cheapest way to
resolve a material unknown.

1. Confirm the question the prototype must answer and explicit authorization to
   create artifacts. If the requested output is production UI design, route to
   `web:design`; if it is production code, route to the implementing skill.
2. Choose the smallest representative medium: static HTML, a fixture-backed
   interaction, a throwaway script, a diagram, or another isolated artifact.
   Avoid backend wiring, production state, migrations, and dependencies not
   required to answer the question.
3. Create non-HTML artifacts only under the active work's
   `artifacts/prototypes/<semantic-slug>/`, with a clear `DISPOSABLE` marker and
   fake or sanitized data. Create any generated HTML review surface under a
   unique OS temporary directory as required by
   [presentation](presentation.md). Never edit application source.
4. When the unknown concerns latent preference, produce two to four materially
   different variants and state what each is testing.
5. Present or render the artifact, collect the user's reaction, and translate it
   into confirmed criteria or a new hypothesis. Retain rejected variants with a
   short reason so later work does not rediscover them.

Complete with the question tested, artifact paths, observations, confirmed
criteria, rejected variants, and whether the artifact should be retained or
removed after its decisions are transferred.

For an interactive review surface, use the **interactive prototype** direction
in [presentation](presentation.md). The presentation shell is disposable and
must not be mistaken for production UI or application source.
