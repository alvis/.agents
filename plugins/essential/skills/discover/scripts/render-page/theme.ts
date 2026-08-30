import { RenderError } from "./error.ts";
import { requireObject } from "./validate.ts";

import type { Theme } from "./types.ts";

/** every key a theme may carry, quoted verbatim when one is refused. */
const THEME_KEYS = ["accent", "light", "dark"] as const;

/**
 * the accent ramp per scheme, as the lightness and chroma each token keeps
 * while `accent` rotates its hue. The numbers are the built-in accents
 * converted to oklch, so an authored hue lands in the same contrast family the
 * default sits in rather than an arbitrary one.
 */
const RAMP = {
  light: [
    ["--ui-accent", ".672 .131"],
    ["--ui-accent-soft", ".965 .013"],
    ["--ui-accent-ink", ".482 .116"],
    ["--ui-focus", ".58 .127"],
  ],
  dark: [
    ["--ui-accent", ".75 .14"],
    ["--ui-accent-soft", ".29 .055"],
    ["--ui-accent-ink", ".9 .055"],
    ["--ui-focus", ".79 .14"],
  ],
} as const satisfies Record<string, readonly (readonly [string, string])[]>;

/** a token name this page will accept an override for. */
const TOKEN_NAME = /^--ui-[a-z0-9-]+$/;

/**
 * what a token value may never contain.
 *
 * the value is written into the page verbatim, so this is to a stylesheet what
 * `escapeHtml` is to markup. `}` and `;` would end the declaration and let the
 * next one be authored freely, `<` would close the `<style>` element, `@` would
 * open an at-rule, `/*` would comment out what follows, and `url(` would make
 * the page fetch something — which is the one thing a self-contained page
 * cannot do.
 */
const FORBIDDEN = /[{};<>@\\]|\/\*|\*\/|url\s*\(/i;

/**
 * reads the accent hue, refusing anything outside a full turn
 * @param accent the author-supplied value
 * @param path JSON path of the value, named verbatim by the refusal
 * @returns the hue in degrees, or undefined when it was omitted
 */
function readAccent(accent: unknown, path: string): number | undefined {
  if (accent === undefined) return undefined;
  if (typeof accent !== "number" || !Number.isFinite(accent) || accent < 0 || accent > 360)
    throw new RenderError(
      `${path}: required number between 0 and 360, received ${JSON.stringify(accent)}`,
    );

  return accent;
}

/**
 * reads one scheme's raw token overrides.
 *
 * every `--ui-*` token is overridable and none is privileged, so the contrast
 * a board reaches is the author's to hold, not this renderer's.
 * @param overrides the author-supplied map
 * @param path JSON path of the map, named verbatim by the refusal
 * @returns the overrides as name/value pairs, in authored order
 */
function readTokens(overrides: unknown, path: string): [string, string][] {
  if (overrides === undefined) return [];

  return Object.entries(requireObject<Record<string, unknown>>(overrides, path)).map(
    ([name, value]) => {
      if (!TOKEN_NAME.test(name))
        throw new RenderError(
          `${path}.${name}: token names must match ${String(TOKEN_NAME)}`,
        );
      if (typeof value !== "string" || !value.trim())
        throw new RenderError(
          `${path}.${name}: required non-empty string, received ${JSON.stringify(value)}`,
        );

      const forbidden = FORBIDDEN.exec(value);
      if (forbidden)
        throw new RenderError(
          `${path}.${name}: value may not contain ${JSON.stringify(forbidden[0])}`,
        );

      return [name, value.trim()];
    },
  );
}

/**
 * builds one scheme's declarations, accent ramp first so a raw override of the
 * same token still wins
 * @param scheme which half of the ramp to rotate
 * @param hue the authored accent hue, if any
 * @param overrides the scheme's raw token overrides
 * @returns the declarations, already indented
 */
function declare(
  scheme: keyof typeof RAMP,
  hue: number | undefined,
  overrides: [string, string][],
): string {
  const ramp: [string, string][] =
    hue === undefined
      ? []
      : RAMP[scheme].map(([name, shade]) => [name, `oklch(${shade} ${hue})`]);

  return [...ramp, ...overrides]
    .map(([name, value]) => `  ${name}:${value};`)
    .join("\n");
}

/**
 * renders a page's colour overrides as a stylesheet layered over the built-in
 * tokens
 * @param theme the author-supplied theme, if any
 * @param path JSON path of the theme, named verbatim by every refusal
 * @returns the stylesheet, or an empty string when nothing was overridden
 */
export function renderTheme(theme: unknown, path: string): string {
  if (theme === undefined) return "";

  for (const key of Object.keys(requireObject<Theme>(theme, path)))
    if (!THEME_KEYS.some((known) => known === key))
      throw new RenderError(
        `${path}.${key}: unknown theme key, expected one of ${THEME_KEYS.map(
          (known) => JSON.stringify(known),
        ).join(", ")}`,
      );

  const { accent, light, dark } = theme as Theme;
  const hue = readAccent(accent, `${path}.accent`);
  const bright = declare("light", hue, readTokens(light, `${path}.light`));
  const dim = declare("dark", hue, readTokens(dark, `${path}.dark`));

  // the dark half is emitted under both selectors the built-in tokens use, so
  // an override reaches the reader who follows the system and the reader who
  // chose dark by hand alike
  return [
    bright && `:root{\n${bright}\n}`,
    dim && `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){\n${dim}\n}}`,
    dim && `:root[data-theme="dark"]{\n${dim}\n}`,
  ]
    .filter(Boolean)
    .join("\n");
}
