import { readFileSync, existsSync } from "node:fs";
import { ImagineError } from "./providers/base";

import type { Args } from "./providers/base";

/** prompt field keys accepted as CLI flags and JSONL job overrides */
export const PROMPT_FIELDS = [
  "use_case",
  "scene",
  "subject",
  "style",
  "composition",
  "lighting",
  "palette",
  "materials",
  "text",
  "constraints",
  "negative",
] as const;
export type PromptFields = Record<
  (typeof PROMPT_FIELDS)[number],
  string | null | undefined
>;

/** supplies optional reference images when augmenting a prompt */
export interface PromptAugmentOptions {
  references?: string[] | null;
}

/**
 * resolves the prompt text from a direct value or a prompt file
 * @param prompt inline prompt text
 * @param prompt_file path to a file holding the prompt text
 * @returns trimmed prompt text
 * @throws ImagineError when both sources are given, the file is missing, or neither is set
 */
export function _read_prompt(
  prompt?: string | null,
  prompt_file?: string | null,
): string {
  if (prompt && prompt_file)
    throw new ImagineError("Use --prompt or --prompt-file, not both.");
  if (prompt_file) {
    if (!existsSync(prompt_file))
      throw new ImagineError(`Prompt file not found: ${prompt_file}`);
    return readFileSync(prompt_file, "utf8").trim();
  }
  if (prompt) return prompt.trim();
  throw new ImagineError("Missing prompt. Use --prompt or --prompt-file.");
}

/**
 * collects every declared prompt field from parsed CLI arguments
 * @param args parsed arguments keyed by prompt field name
 * @returns field values keyed by canonical prompt field order
 */
export function _fields_from_args(args: Args): PromptFields {
  return Object.fromEntries(
    PROMPT_FIELDS.map((key) => [key, args[key] as string | null | undefined]),
  ) as PromptFields;
}

/**
 * assembles the final prompt from labeled fields and reference guidance
 * @param augment whether structured prompt fields are rendered as labeled sections
 * @param prompt primary request text
 * @param fields prompt field values keyed by field name
 * @param options extra augmentation inputs such as style references
 * @returns sections joined in stable presentation order
 */
export function _augment_prompt_fields(
  augment: boolean,
  prompt: string,
  fields: Partial<PromptFields>,
  options: PromptAugmentOptions = {},
): string {
  const sections: string[] = [];
  if (options.references?.length)
    sections.push(
      "Style reference: use the provided reference image(s) to guide the visual style, color palette, and texture of the output.",
    );
  if (!augment) return [...sections, prompt].join("\n");
  const labels: Partial<Record<keyof PromptFields, string>> = {
    use_case: "Use case",
    scene: "Scene/background",
    subject: "Subject",
    style: "Style/medium",
    composition: "Composition/framing",
    lighting: "Lighting/mood",
    palette: "Color palette",
    materials: "Materials/textures",
    constraints: "Constraints",
    negative: "Avoid",
  };
  if (fields.use_case) sections.push(`Use case: ${fields.use_case}`);
  sections.push(`Primary request: ${prompt}`);
  for (const key of PROMPT_FIELDS) {
    if (key === "use_case" || key === "text" || !fields[key]) continue;
    sections.push(`${labels[key]}: ${fields[key]}`);
  }
  if (fields.text)
    sections.splice(
      fields.constraints
        ? sections.length - (fields.negative ? 2 : 1)
        : fields.negative
          ? sections.length - 1
          : sections.length,
      0,
      `Text (verbatim): "${fields.text}"`,
    );
  return sections.join("\n");
}

/**
 * augments a prompt using the prompt fields carried by parsed arguments
 * @param args parsed arguments supplying augment and prompt field values
 * @param prompt primary request text
 * @param options extra augmentation inputs such as style references
 * @returns assembled prompt text ready for the provider
 */
export function _augment_prompt(
  args: Args,
  prompt: string,
  options: PromptAugmentOptions = {},
): string {
  return _augment_prompt_fields(
    args.augment !== false,
    prompt,
    _fields_from_args(args),
    options,
  );
}
