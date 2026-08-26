import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runBun } from "./test-support.ts";

const scripts = import.meta.dirname;
const validator = join(scripts, "test-html-templates.ts");

describe("presentation validator", () => {
  it("should route help and invalid choices to the correct streams", () => {
    const help = runBun(validator, ["--help"]);
    expect(help.exitCode).toBe(0);
    const invalid = runBun(validator, ["--stage", "wrong"]);
    expect(invalid.exitCode).toBe(2);
    expect(invalid.stdout).toBe("");
  });
  it("should validate deterministically without network access", () => {
    const dead = {
      ALL_PROXY: "http://127.0.0.1:9",
      HTTP_PROXY: "http://127.0.0.1:9",
      HTTPS_PROXY: "http://127.0.0.1:9",
    };
    const result = runBun(validator, ["--stage=complete"], dead);
    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
  });
});
