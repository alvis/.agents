# Production

Media and creative production lifecycle: giving footage, renders, and campaign deliverables the same truth discipline code enjoys. Depends on `essential`. A production work stream is an ordinary work stream that declares a `media-project` or `asset-store` anchor (`essential/references/anchors.md`); this plugin adds what media work needs beyond that: **motion-video creation from a blank idea**, **asset identity**, and **revision-bound review**.

Why: `Interview-final-final-2.mov` is not a provenance system. A filesystem path is not identity, and "approved" without a revision is not an approval. Media bytes stay outside Git; their identity and lineage do not.

## Skills

| Skill action | Use when |
| --- | --- |
| `production:production` `motion-design` | Making a motion video from a blank or half-formed idea: a direction interview (goal, platform, references, format, mood, subject), five concepts drafted from a recipe library, a style, story, and character board through `essential:discover`, a storyboard approved with its song timing, an ElevenLabs song composed to that timing, a HyperFrames build with optional Blender shots on the measured song, and a 1 fps draft the user confirms before the one full render. |
| `production:production` `track` | Registering assets (footage, audio, fonts, LUTs, templates, generated media) with content hashes, rights, and consent refs; recording each render with its exact inputs, settings, and output hash; marking entries stale when a decision invalidates them. Manifest shape: `production:skills/production/templates/asset-manifest.md`. |
| `production:production` `review` | Capturing stakeholder feedback and approvals bound to an exact render revision and timecode range; deciding which approvals survive a new revision (none carry forward automatically; a decision's `preserves` list may keep named aspects current). |

`track` and `review` maintain versioned text manifests and review records — they never edit media. Reproducing any render is a technical operation: its manifest entry names the timeline revision, asset-manifest hash, render settings, and output hash it was built from. `motion-design` links to the HyperFrames and ElevenLabs skills rather than copying them, and needs the HyperFrames CLI, an ElevenLabs API key, and Blender only for 3D shots.

Production owns the semantic asset-manifest template. Essential owns the shared `docs/production/README.md` and item `README.md` entrypoint shapes.
