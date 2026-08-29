# Style Extraction from a Reference Image

How to turn a user-supplied reference image into a reusable style constraint. Determine the intended provider and model first — the extraction method depends on that choice.

**Default-path note**: The default Recraft model is V4, not V3. Unless the user explicitly requests V3 or `recraftv3`/`recraftv3_vector`, style references follow Path B (style prompt analysis). When using the default Recraft model, omit `--model` (it already defaults to the latest).

## Path A — Recraft V3 models (`recraftv3`, `recraftv3_vector`)

1. Use `mcp__recraft__create_style` to extract a reusable style from the reference image.
2. Pass the returned `styleID` via the `generate_image` MCP tool or the `--style-id` CLI flag.

## Path B — All other models (Google Gemini, OpenAI, Recraft V4/V2)

Visually analyze the reference image yourself and produce a **style prompt** — a structured text description that captures the visual identity of the reference. Cover these dimensions, including only those that are distinctive or non-default:

- **Medium/technique**: e.g., watercolor, digital illustration, oil painting, 3D render, vector flat
- **Color palette**: dominant hues, saturation level, temperature (warm/cool), contrast
- **Texture/surface**: smooth, grainy, painterly brushstrokes, halftone, noise
- **Lighting**: direction, quality (soft/hard), color temperature, rim light, ambient
- **Composition style**: symmetrical, rule-of-thirds, cinematic widescreen, centered
- **Mood/atmosphere**: serene, dramatic, whimsical, gritty, ethereal
- **Line quality**: clean/sketchy, thick/thin, visible outlines or not
- **Rendering detail level**: minimal/stylized vs hyperdetailed/photorealistic

Present the style prompt to the user for confirmation, then weave the confirmed style prompt into the structured prompt spec (under `Style/medium:`, `Lighting:`, `Color palette:`, `Materials/textures:`, `Vibe/mood:` fields).

## Both paths

Describe the extracted or analyzed style attributes back to the user (palette, texture, composition, mood) before proceeding.
