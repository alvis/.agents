import { RenderError } from "./error.ts";

/**
 * reads a required non-empty string, refusing anything else by JSON path
 * @param value the author-supplied value
 * @param path JSON path of the value, named verbatim by the refusal
 * @returns the value as a string
 */
export function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value)
    throw new RenderError(
      `${path}: required non-empty string, received ${JSON.stringify(value)}`,
    );
  return value;
}

/**
 * reads an optional string, refusing a present value of any other type
 * @param value the author-supplied value
 * @param path JSON path of the value, named verbatim by the refusal
 * @returns the value as a string, or `undefined` when it was omitted
 */
export function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : requireString(value, path);
}

/**
 * reads a plain object, refusing anything else by JSON path
 * @param value the author-supplied value
 * @param path JSON path of the value, named verbatim by the refusal
 * @returns the value as an object
 */
export function requireObject<T>(value: unknown, path: string): T {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new RenderError(
      `${path}: required object, received ${JSON.stringify(value)}`,
    );
  return value as T;
}

/**
 * reads an array, refusing anything else by JSON path
 * @param value the author-supplied value
 * @param path JSON path of the value, named verbatim by the refusal
 * @returns the value as an array
 */
export function requireArray<T>(value: unknown, path: string): T[] {
  if (!Array.isArray(value))
    throw new RenderError(
      `${path}: required array, received ${JSON.stringify(value)}`,
    );
  return value as T[];
}

/**
 * reads an array that must carry at least one entry
 * @param value the author-supplied value
 * @param path JSON path of the value, named verbatim by the refusal
 * @returns the value as a non-empty array
 */
export function requireFilledArray<T>(value: unknown, path: string): T[] {
  const items = requireArray<T>(value, path);
  if (!items.length)
    throw new RenderError(`${path}: required non-empty array, received []`);
  return items;
}

/**
 * reads a value drawn from a closed set, refusing anything else by JSON path
 * @param value the author-supplied value
 * @param allowed every accepted value, quoted verbatim by the refusal
 * @param path JSON path of the value, named verbatim by the refusal
 * @returns the value as one of `allowed`
 */
export function requireOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  if (!allowed.some((option) => option === value))
    throw new RenderError(
      `${path}: required one of ${allowed
        .map((option) => JSON.stringify(option))
        .join(", ")}, received ${JSON.stringify(value)}`,
    );
  return value as T;
}

/**
 * reads a 1-based line number, refusing anything that cannot name a line
 * @param value the author-supplied value
 * @param path JSON path of the value, named verbatim by the refusal
 * @param lines how many lines the text actually has
 * @returns the value as an integer
 */
export function requireLine(
  value: unknown,
  path: string,
  lines: number,
): number {
  if (!Number.isInteger(value) || (value as number) < 1)
    throw new RenderError(
      `${path}: required a line number of 1 or more, received ${JSON.stringify(value)}`,
    );
  // a number past the end is the one mistake that would otherwise pass in
  // silence: the mark simply would not appear, and the author would be left
  // looking at the stylesheet for a fault that is in the data
  if ((value as number) > lines)
    throw new RenderError(
      `${path}: line ${String(value)} is past the end of a ${String(lines)}-line excerpt`,
    );

  return value as number;
}

/**
 * reads a percentage across a figure, refusing one that would leave it.
 *
 * the value reaches an inline `style` as a custom property, so it is checked
 * as a number rather than trusted as text: a string here would be a way for a
 * data file to write arbitrary CSS into the page.
 * @param value the author-supplied value
 * @param path JSON path of the value, named verbatim by the refusal
 * @returns the value as a number
 */
export function requirePercent(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new RenderError(
      `${path}: required a number, received ${JSON.stringify(value)}`,
    );
  if (value < 0 || value > 100)
    throw new RenderError(
      `${path}: required a percentage from 0 to 100, received ${String(value)}`,
    );

  return value;
}
