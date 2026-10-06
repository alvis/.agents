import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const { request_patterns: patterns } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../hooks/context.json"), "utf8"),
) as { request_patterns: string[] };

// domain-context.ts compiles every request pattern with the "i" flag
const matches = (prompt: string): boolean =>
  patterns.some((pattern) => new RegExp(pattern, "i").test(prompt));

describe("production request patterns", () => {
  it.each([
    "can you make a fun video for my sister's 30th birthday?",
    "Create a motion video for our product launch",
    "produce a music video for this track",
    "design an Instagram reel for the new collection",
    "record the client's approval of render v3",
  ])("should load the production workflow for %j", (prompt) => {
    expect(matches(prompt)).toBe(true);
  });

  it.each([
    "Create a React component that renders a video",
    "create a video player component",
    "design the video upload endpoint",
    "make the video autoplay on mobile",
    "make a short video clip of the bug for the issue",
    "create a reel component",
  ])("should leave %j to other plugins", (prompt) => {
    expect(matches(prompt)).toBe(false);
  });
});
