import { describe, expect, it } from "vitest";

import { violations } from "./check_markdown_scripts.ts";
import {
  createTemporaryDirectory,
  removeTemporaryDirectory,
  writeFixture,
} from "./test-support.ts";

describe("shell fence limit enforcement", () => {
  it("should count content lines beyond the shell fence limit", async () => {
    const root = await createTemporaryDirectory("markdown-scripts-");
    try {
      const path = await writeFixture(
        root,
        "guide.md",
        `\`\`\`bash\n${"true\n".repeat(11)}\`\`\`\n`,
      );

      expect(await violations(path)).toEqual([
        { language: "bash", line: 1, lines: 11, path },
      ]);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  it("should allow non-shell examples and ten-line shell fences", async () => {
    const root = await createTemporaryDirectory("markdown-scripts-");
    try {
      const path = await writeFixture(
        root,
        "guide.md",
        `\`\`\`bash\n${"true\n".repeat(10)}\`\`\`\n\`\`\`python\n${"pass\n".repeat(11)}\`\`\`\n`,
      );

      expect(await violations(path)).toEqual([]);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  it("should require a matching-length marker with no trailing info to close a fence", async () => {
    const root = await createTemporaryDirectory("markdown-scripts-");
    try {
      const path = await writeFixture(
        root,
        "guide.md",
        `\`\`\`\`bash\n\`\`\`\n${"true\n".repeat(10)}\`\`\`not-a-closer\n\`\`\`\`\n`,
      );

      expect(await violations(path)).toEqual([
        { language: "bash", line: 1, lines: 12, path },
      ]);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  it("should check an unterminated shell fence at end of file", async () => {
    const root = await createTemporaryDirectory("markdown-scripts-");
    try {
      const path = await writeFixture(
        root,
        "guide.md",
        `\`\`\`zsh\n${"true\n".repeat(11).trimEnd()}`,
      );

      expect(await violations(path)).toEqual([
        { language: "zsh", line: 1, lines: 11, path },
      ]);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});
