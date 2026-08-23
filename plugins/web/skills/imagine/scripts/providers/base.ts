import { basename } from "node:path";

/** parsed CLI arguments and provider payload fields shared across providers */
export type Args = Record<string, unknown>;
/** validation and help metadata for one provider model parameter */
export type ModelParam = {
  default?: unknown;
  choices?: readonly unknown[];
  type?: "int";
  range?: readonly [number, number];
  help?: string;
  edit_only?: boolean;
};

/** external image inputs attached to one generation call */
export type GenerateOptions = {
  images?: string[] | null;
  mask?: string | null;
  references?: string[] | null;
};

/** operational failure carrying the process exit code the CLI should report */
export class ImagineError extends Error {
  readonly exit_code: number;

  constructor(message: string, exit_code = 1, options?: ErrorOptions) {
    super(message, options);
    this.name = "ImagineError";
    this.exit_code = exit_code;
  }
}

/** contract every image generation backend implements for the CLI */
export abstract class ImageProvider {
  abstract readonly name: string;
  abstract readonly env_var: string;
  abstract readonly MODEL_PARAMS: Record<string, ModelParam>;

  /** fails fast without an API key and allows keyless dry-runs with a warning */
  ensure_api_key(dry_run: boolean): void {
    if (process.env[this.env_var]) {
      process.stderr.write(`${this.env_var} is set.\n`);
      return;
    }
    if (dry_run) {
      process.stderr.write(
        `Warning: ${this.env_var} is not set; dry-run only.\n`,
      );
      return;
    }
    throw new ImagineError(
      `${this.env_var} is not set. Export it before running.`,
    );
  }

  /** rejects argument values outside the choices and ranges this provider declares */
  validate(args: Args): void {
    for (const [name, spec] of Object.entries(this.MODEL_PARAMS)) {
      const value = args[name];
      if (value == null) continue;
      if (spec.choices && !spec.choices.includes(value)) {
        throw new ImagineError(
          `--${name.replaceAll("_", "-")} must be one of: ${spec.choices.join(", ")}`,
        );
      }
      if (spec.type === "int" && spec.range) {
        const parsed = Number(value);
        if (!Number.isInteger(parsed))
          throw new ImagineError(
            `--${name.replaceAll("_", "-")} must be an integer`,
          );
        const [low, high] = spec.range;
        if (parsed < low || parsed > high)
          throw new ImagineError(
            `--${name.replaceAll("_", "-")} must be between ${low} and ${high}`,
          );
      }
    }
  }

  /** reports the output format the provider derives from arguments, if any */
  effective_output_format(args: Args): string | null {
    return typeof args.output_format === "string" ? args.output_format : null;
  }

  /** generates one batch of base64-encoded images for a prompt */
  abstract generate(
    prompt: string,
    args: Args,
    options?: GenerateOptions,
  ): Promise<string[]>;
  /** batch entry point the retry wrapper calls; may share the generate path */
  abstract async_generate(
    prompt: string,
    args: Args,
    options?: GenerateOptions,
  ): Promise<string[]>;
  /** describes the request that would be sent, for --dry-run output */
  abstract dry_run_payload(
    prompt: string,
    args: Args,
    options?: GenerateOptions,
  ): Record<string, unknown>;
}

/** providers available to the CLI, keyed by their registered name */
export const PROVIDER_REGISTRY: Record<string, new () => ImageProvider> =
  Object.create(null) as Record<string, new () => ImageProvider>;
/**
 * adds a provider class to the registry under its declared name
 * @param provider provider class to register
 * @returns the same provider class for decorator-style use
 */
export function register_provider<T extends new () => ImageProvider>(
  provider: T,
): T {
  PROVIDER_REGISTRY[new provider().name] = provider;
  return provider;
}
/**
 * instantiates the registered provider matching a selection
 * @param name registered provider name such as google or openai
 * @returns a fresh provider instance
 * @throws ImagineError when the name is absent from or inherited onto the registry
 */
export function get_provider(name: string): ImageProvider {
  const Provider = Object.hasOwn(PROVIDER_REGISTRY, name)
    ? PROVIDER_REGISTRY[name]
    : undefined;
  if (!Provider)
    throw new ImagineError(
      `Unknown provider '${name}'. Available: ${Object.keys(PROVIDER_REGISTRY).sort().join(", ") || "(none)"}`,
    );
  return new Provider();
}

/**
 * wraps a local image file as a multipart upload part for provider APIs
 * @param path local file path to read at request time
 * @param type MIME type reported for the part
 * @returns file part named after the path's basename
 */
export function file_part(path: string, type = "image/png"): File {
  return new File([Bun.file(path)], basename(path), { type });
}
