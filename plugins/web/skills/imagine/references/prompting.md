# Prompting best practices

> These practices apply to both Google Gemini and OpenAI providers.

## Contents

- [Structure](#structure)
- [Artistic framework (7 elements)](#artistic-framework-7-elements)
- [Prompt depth: short vs structured](#prompt-depth-short-vs-structured)
- [Specificity](#specificity)
- [Avoiding "tacky" outputs](#avoiding-tacky-outputs)
- [Composition & layout](#composition--layout)
- [Constraints & invariants](#constraints--invariants)
- [Text in images](#text-in-images)
- [Multi-image inputs](#multi-image-inputs)
- [Iterate deliberately](#iterate-deliberately)
- [Quality vs latency](#quality-vs-latency)
- [Format-specific cheat sheets](#format-specific-cheat-sheets)
- [Use-case tips](#use-case-tips)
- [Where to find copy/paste recipes](#where-to-find-copypaste-recipes)

## Structure

- Use a consistent order: scene/background -> subject -> key details -> constraints -> output intent.
- Include intended use (ad, UI mock, infographic) to set the mode and polish level.
- For complex requests, use short labeled lines instead of a long paragraph.

## Artistic framework (7 elements)

Seven visual elements as a mental model for crafting prompts:

| Element | Role | Example phrase |
| --- | --- | --- |
| **Subject** | Focal point — who/what the viewer notices first | "a woman sitting on a rooftop ledge" |
| **Composition** | Framing, camera angle, spatial relationships | "wide shot, centered, low 30-degree angle" |
| **Context** | Environment, story, atmosphere | "at sunset, after the rain, city glistening below" |
| **Medium** | Visual format/technique — shapes entire rendering approach | "cinematic photograph", "watercolor painting", "flat vector" |
| **Style** | Artistic tradition or aesthetic direction | "Art Nouveau", "Pop Art", "contemporary editorial" |
| **Vibe** | Emotional tone (distinct from lighting) | "reflective, bittersweet", "serene", "dramatic" |
| **Attributes** | Fine details: lighting, color, texture, camera, materials | "soft golden backlight, muted tones, shallow DOF, f/2.8, film grain" |

Universal prompt template:

```
[Medium] of [Subject] in [Composition], [Context/Setting], [Style] aesthetic,
[Vibe/Mood], [Attributes: lighting, color, texture, camera, materials]
```

Full example: "Cinematic photograph of a woman sitting on a rooftop ledge at sunset, wide shot with the city skyline behind her, soft golden backlighting, muted warm tones, shallow depth of field, contemporary editorial aesthetic, reflective and bittersweet mood, gentle rim light on hair, slight film grain, 35mm lens perspective"

Key diagnostic: If the image feels random, it usually lacks spatial, lighting, or mood anchors — not detail.

## Prompt depth: short vs structured

- **Short/interpretive prompts** (2-3 elements, let model fill gaps):
  - Best for: visual exploration, mood discovery, concept sketching, allowing model variation.
  - Example: "Fashion couple portrait, close up." — the model fills in composition, lighting, color, styling.
- **Structured/architectural prompts** (all 7 elements in global-to-local order):
  - Best for: precision, repeatability, production-ready results.
  - The more spatial, lighting, and mood detail you provide, the more intentional and controllable the output.

Global-to-local ordering (for structured prompts):

1. Core concept — subject(s) and scene
2. Background and environment
3. Primary subject framing and pose
4. Physical attributes and identity details
5. Secondary subjects and spatial relationships
6. Lighting direction and behavior
7. Camera, depth, and contrast
8. Mood and compositional resolution

Detail levels:

- **Minimal** — maximum creative freedom; good for exploration.
- **Moderate** — balance control with flexibility; good for general-purpose work.
- **Detailed** — maximum precision; good for production-ready, repeatable results.

## Specificity

- Name materials, textures, and visual medium (photo, watercolor, 3D render).
- For photorealism, include camera/composition language (lens, framing, lighting).
- Add targeted quality cues only when needed (film grain, textured brushstrokes, macro detail); avoid generic "8K" style prompts.
- Separate vibe/mood from lighting — they are different levers. "Nostalgic" is a vibe; "golden hour side-light" is lighting.
- For production-ready results, specify all 7 elements (Subject, Composition, Context, Medium, Style, Vibe, Attributes). For exploration, specify 2-3 and let the model fill gaps.

## Avoiding "tacky" outputs

- Don't use vibe-only buzzwords ("epic", "cinematic", "trending", "8k", "award-winning", "unreal engine", "artstation") unless the user explicitly wants that look.
- Specify restraint: "minimal", "editorial", "premium", "subtle", "natural color grading", "soft contrast", "no harsh bloom", "no oversharpening".
- For 3D/illustration, name the finish you want: "matte", "paper grain", "ink texture", "flat color with soft shadow"; avoid "glossy plastic" unless requested.
- Add a short negative line when needed (especially for marketing art): "Avoid: stock-photo vibe; cheesy lens flare; oversaturated neon; excessive bokeh; fake-looking smiles; clutter".

## Composition & layout

- Specify framing and viewpoint (close-up, wide, top-down) and placement ("logo top-right").
- Call out negative space if you need room for UI or overlays.
- Describe spatial relationships between subjects ("seated left of center, turned three-quarter toward camera").
- Specify depth layers: foreground, midground, background.

## Constraints & invariants

- State what must not change ("keep background unchanged").
- For edits, say "change only X; keep Y unchanged" and repeat invariants on every iteration to reduce drift.

## Text in images

- Put literal text in quotes or ALL CAPS and specify typography (font style, size, color, placement).
- Spell uncommon words letter-by-letter if accuracy matters.
- For in-image copy, require verbatim rendering and no extra characters.

## Multi-image inputs

- Reference inputs by index and role ("Image 1: product, Image 2: style").
- Describe how to combine them ("apply Image 2's style to Image 1").
- For compositing, specify what moves where and what must remain unchanged.

## Style references (`--reference`)

- Use `--reference` to supply one or more style guide images. The model uses these to influence color palette, texture, and visual style.
- A style-reference context line is automatically prepended to the prompt (even with `--no-augment`) so the model knows the extra images are style guides.
- For best results, describe the desired style explicitly in the prompt as well (e.g., "apply the watercolor style from the reference").
- Combine with `--image` for style-guided edits: the reference provides the target style while the edit image is the content to transform.
- Multiple `--reference` flags blend styles; the model may weight them differently depending on the prompt.

## Iterate deliberately

- Start with a clean base prompt, then make small single-change edits.
- Re-specify critical constraints when you iterate.

## Quality vs latency

- For latency-sensitive runs, start at `quality=low` (OpenAI) or `resolution=512px` (Google) and only raise it if needed.
- Use `quality=high` (OpenAI) or `resolution=2K`/`4K` (Google) for text-heavy or detail-critical images.
- For strict edits (identity preservation, layout lock), consider `input_fidelity=high` (OpenAI only).

## Format-specific cheat sheets

Ordered checklists by visual format. Use as a prompt skeleton — fill in each item for the format you need. These complement the taxonomy-based use-case tips below.

### Photorealism

1. Subject + action/pose
2. Framing + camera angle
3. Setting/environment
4. Lighting direction + quality (golden hour, soft window light, spotlight)
5. Camera specs (lens, DOF, aperture — e.g., 85mm, f/2.8 shallow DOF)
6. Color temperature + palette
7. Mood/atmosphere
8. Photography style reference (editorial, documentary, commercial)

### Illustration

1. Medium (watercolor, ink, digital painting, etc.)
2. Subject + action
3. Style descriptors (painterly, graphic, hand-drawn, flat)
4. Color palette
5. Texture (paper grain, brush marks, ink bleed)
6. Mood/atmosphere

### Vector / Logo

1. Format (logo, icon set, badge, wordmark)
2. Subject/symbol
3. Shape language (geometric, organic, minimal)
4. Color constraint (two-tone, monochrome, limited palette)
5. Edge treatment (clean, hand-drawn wobble, consistent stroke width)
6. Scalability notes (works at small sizes, clear silhouette)
7. Avoid list (no gradients, no shadows, no fine detail)

### Graphic design

1. Format (poster, banner, cover, card)
2. Layout structure + grid (centered, asymmetric, columns)
3. Typography hierarchy (headline size/weight/placement, subhead, body)
4. Imagery/illustration integration
5. Color scheme + brand palette
6. Visual weight distribution
7. Production constraints (bleed, safe zones, text-safe areas)

### 3D render

1. Render type (designer toy, cinematic 3D, product render, lookbook)
2. Form and proportion system (chibi, realistic, exaggerated)
3. Material behavior (matte, gloss, plastic, fabric, metal)
4. Spatial environment (floor, background, atmosphere)
5. Lighting direction and intensity
6. Camera angle and depth
7. Color system

## Use-case tips

Generate:

- photorealistic-natural: Prompt as if a real photo is captured in the moment; use photography language (lens, lighting, framing); call for real texture (pores, wrinkles, fabric wear, imperfections); avoid studio polish or staging; use `quality=high` when detail matters.
- product-mockup: Describe the product/packaging and materials; ensure clean silhouette and label clarity; if in-image text is needed, require verbatim rendering and specify typography.
- ui-mockup: Describe a real product; focus on layout, hierarchy, and common UI elements; avoid concept-art language so it looks shippable.
- infographic-diagram: Define the audience and layout flow; label parts explicitly; require verbatim text; use `quality=high`.
- logo-brand: Keep it simple and scalable; ask for a strong silhouette and balanced negative space; avoid gradients and fine detail.
- illustration-story: Define panels or scene beats; keep each action concrete; for continuity, restate character traits and outfit each time.
- stylized-concept: Specify style cues, material finish, and rendering approach (3D, painterly, clay); add a short "Avoid" line to prevent tacky effects.
- historical-scene: State the location/date and required period accuracy; constrain clothing, props, and environment to match the era.

Edit:

- text-localization: Change only the text; preserve layout, typography, spacing, and hierarchy; no extra words or reflow unless needed.
- identity-preserve: Lock identity (face, body, pose, hair, expression); change only the specified elements; match lighting and shadows; use `input_fidelity=high` if likeness drifts (OpenAI only).
- precise-object-edit: Specify exactly what to remove/replace; preserve surrounding texture and lighting; keep everything else unchanged.
- lighting-weather: Change only environmental conditions (light, shadows, atmosphere, precipitation); keep geometry, framing, and subject identity.
- background-extraction: Request transparent background; crisp silhouette; no halos; preserve label text exactly; optionally add a subtle contact shadow. Requires `--provider openai` with `--background transparent`.
- style-transfer: Use `--reference` to supply the style image. Specify style cues to preserve (palette, texture, brushwork) and what must change; add "no extra elements" to prevent drift.
- compositing: Reference inputs by index; specify what moves where; match lighting, perspective, and scale; keep background and framing unchanged.
- sketch-to-render: Preserve layout, proportions, and perspective; add plausible materials, lighting, and environment; "do not add new elements or text."

## Where to find copy/paste recipes

For copy/paste prompt specs (examples only), see `examples/prompts.md`. This file focuses on principles, structure, and iteration patterns.
