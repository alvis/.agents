import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { BunFile } from "bun";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ImagineError,
  ImageProvider,
  PROVIDER_REGISTRY,
  file_part,
  get_provider,
  register_provider,
} from "./base";

/** stands in for `Bun.file`, whose real reader is a Bun runtime handle. */
function fakeFile(path: string): BunFile {
  return new Blob([readFileSync(path)]) as Partial<BunFile> as BunFile;
}

class TestProvider extends ImageProvider {
  readonly name = "test-provider-foundation";
  readonly env_var = "IMAGINE_TEST_KEY";
  readonly MODEL_PARAMS = {
    quality: { choices: ["standard", "high"] },
    steps: { type: "int" as const, range: [1, 10] as const },
  };

  async generate(): Promise<string[]> {
    return [];
  }
  async async_generate(): Promise<string[]> {
    return [];
  }
  dry_run_payload(): Record<string, unknown> {
    return {};
  }
}

describe("image provider registry and validation", () => {
  beforeEach(() => {
    vi.spyOn(Bun, "file").mockImplementation((path) => fakeFile(String(path)));
  });

  afterEach(() => {
    delete PROVIDER_REGISTRY["test-provider-foundation"];
    delete process.env.IMAGINE_TEST_KEY;
  });

  it("registers and resolves providers while reporting unknown names", () => {
    expect(register_provider(TestProvider)).toBe(TestProvider);
    expect(get_provider("test-provider-foundation")).toBeInstanceOf(
      TestProvider,
    );
    expect(() => get_provider("missing-provider")).toThrow(
      "Unknown provider 'missing-provider'",
    );
  });

  it.each(["constructor", "toString"] as const)(
    "rejects inherited registry names: %s",
    (name) => {
      expect(() => get_provider(name)).toThrow(`Unknown provider '${name}'`);
    },
  );

  it("validates choices, integer types, and numeric ranges", () => {
    const provider = new TestProvider();
    expect(() =>
      provider.validate({ quality: "standard", steps: 5 }),
    ).not.toThrow();
    expect(() => provider.validate({ quality: "unknown" })).toThrow(
      "--quality must be one of: standard, high",
    );
    expect(() => provider.validate({ steps: 1.5 })).toThrow(
      "--steps must be an integer",
    );
    expect(() => provider.validate({ steps: 11 })).toThrow(
      "--steps must be between 1 and 10",
    );
  });

  it("handles API-key presence and dry-run absence without provider calls", () => {
    const provider = new TestProvider();
    expect(() => provider.ensure_api_key(true)).not.toThrow();
    process.env.IMAGINE_TEST_KEY = "opaque-key";
    expect(() => provider.ensure_api_key(false)).not.toThrow();
    delete process.env.IMAGINE_TEST_KEY;
    expect(() => provider.ensure_api_key(false)).toThrow(ImagineError);
  });

  it("creates a file part with the basename and MIME type", async () => {
    const root = await mkdtemp(join(tmpdir(), "imagine-file-part-"));
    try {
      const path = join(root, "opaque-input.bin");
      await writeFile(path, Uint8Array.from([1, 2, 3]));
      const part = file_part(path, "application/octet-stream");

      expect(part.name).toBe("opaque-input.bin");
      expect(part.type).toBe("application/octet-stream");
      expect(part.size).toBe(3);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
