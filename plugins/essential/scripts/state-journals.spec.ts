import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import type { SpawnSyncReturns } from "node:child_process";

interface Summary {
  id: string;
  domain: string;
  completed: string;
  summary: string;
}

const script = resolve(import.meta.dirname, "state-journals.ts");
const lease = resolve(import.meta.dirname, "state-lease");
const originalOverview = `# Project overview\n\n## Streams\n\n| Work ID | Phase |\n| --- | --- |\n| active | working |\n\n## Recently landed\n\nOld history\n\n## Awaiting you\n\n| Work ID | Question |\n| --- | --- |\n| active | Keep this question? |\n`;
const current: Summary = {
  id: "demo",
  domain: "essential",
  completed: "2026-09-30T12:00:00Z",
  summary: "Preserve completed work.",
};

class JournalHarness {
  readonly root: string;
  readonly state: string;
  readonly work: string;
  readonly input: string;
  readonly token: string;

  constructor() {
    this.root = realpathSync(mkdtempSync(join(tmpdir(), "state-journals-")));
    onTestFinished(() => rmSync(this.root, { recursive: true, force: true }));
    this.state = join(this.root, ".state");
    this.work = join(this.state, "works/demo");
    this.input = join(this.root, "summary.md");
    mkdirSync(this.work, { recursive: true });
    writeFileSync(
      join(this.work, "state.md"),
      "# State\n\n- Phase: `completed`\n\n## Completion receipt\n\n- Completed at: 2026-09-30T12:00:00Z\n- Landing evidence: merged commit abc123\n",
    );
    writeFileSync(join(this.state, "overview.md"), originalOverview);
    writeFileSync(this.input, summaryText(current));
    const acquired = spawnSync(
      "/bin/bash",
      [
        lease,
        "acquire",
        "--work-dir",
        this.work,
        "--capability",
        "pm",
        "--session",
        "test",
      ],
      { encoding: "utf8" },
    );
    expect(acquired.status, acquired.stderr).toBe(0);
    this.token = (JSON.parse(acquired.stdout) as { token: string }).token;
  }

  publish(...args: string[]): SpawnSyncReturns<string> {
    const token = args.includes("--token") ? [] : ["--token", this.token];
    return spawnSync(
      "bun",
      [
        script,
        "publish",
        "--work-dir",
        this.work,
        ...token,
        "--summary-file",
        this.input,
        ...args,
      ],
      { encoding: "utf8", timeout: 10000 },
    );
  }

  seed(summary: Summary, content = summaryText(summary)): string {
    const path = join(this.state, summaryPath(summary));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    return path;
  }
}

describe("cmd:state-journals", () => {
  it("should execute the documented command directly without changing state for help", () => {
    const harness = new JournalHarness();
    const before = snapshot(harness.root);

    const result = spawnSync(script, ["--help"], {
      cwd: harness.root,
      encoding: "utf8",
    });

    expect(result.status, String(result.error ?? result.stderr)).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(snapshot(harness.root)).toEqual(before);
  });

  it("should update one owned summary without duplicating its history entry", () => {
    const harness = new JournalHarness();
    expect(harness.publish().status).toBe(0);
    const updated = { ...current, summary: "Revised completion details." };
    writeFileSync(harness.input, summaryText(updated));

    expect(harness.publish().status).toBe(0);

    expect(
      readFileSync(join(harness.state, summaryPath(updated)), "utf8"),
    ).toBe(summaryText(updated));
    expect(
      readFileSync(join(harness.state, "journals.md"), "utf8")
        .split("\n")
        .filter((line) => line.startsWith("- ")),
    ).toEqual([entry(updated)]);
    expect(readFileSync(join(harness.state, "overview.md"), "utf8")).toBe(
      originalOverview.replace("Old history", entry(updated)),
    );
  });

  it("should group domains alphabetically and retain all history while showing five recent entries", () => {
    const harness = new JournalHarness();
    const history: Summary[] = [
      {
        id: "zulu",
        domain: "coding",
        completed: "2026-09-29T12:00:00Z",
        summary: "Tie after alpha.",
      },
      {
        id: "alpha",
        domain: "coding",
        completed: "2026-09-29T12:00:00Z",
        summary: "Tie before zulu.",
      },
      {
        id: "later",
        domain: "web",
        completed: "2026-09-30T13:00:00Z",
        summary: "Later on the same day.",
      },
      {
        id: "old",
        domain: "coding",
        completed: "2026-09-01T01:00:00Z",
        summary: "Retained oldest.",
      },
      {
        id: "middle",
        domain: "web",
        completed: "2026-09-28T01:00:00Z",
        summary: "Fifth recent entry.",
      },
    ];
    const paths = history.map((summary) => harness.seed(summary));
    const before = paths.map((path) => readFileSync(path));

    const result = harness.publish();

    expect(result.status, result.stdout).toBe(0);
    const index = readFileSync(join(harness.state, "journals.md"), "utf8");
    expect(index.split("\n").filter((line) => line.startsWith("## "))).toEqual([
      "## coding",
      "## essential",
      "## web",
    ]);
    expect(index.split("\n").filter((line) => line.startsWith("- "))).toEqual(
      [history[1], history[0], history[3], current, history[2], history[4]].map(
        entry,
      ),
    );
    expect(readFileSync(join(harness.state, "overview.md"), "utf8")).toBe(
      originalOverview.replace(
        "Old history",
        [history[2], current, history[1], history[0], history[4]]
          .map(entry)
          .join("\n"),
      ),
    );
    expect(paths.map((path) => readFileSync(path))).toEqual(before);
  });

  it.each(["summary", "summary and index"])(
    "should recover after publishing only %s and remain idempotent",
    (partial) => {
      const harness = new JournalHarness();
      harness.seed(current);
      if (partial === "summary and index")
        writeFileSync(
          join(harness.state, "journals.md"),
          `# Journals\n\n## essential\n\n${entry(current)}\n`,
        );

      expect(harness.publish().status).toBe(0);
      const paths = [summaryPath(current), "journals.md", "overview.md"].map(
        (path) => join(harness.state, path),
      );
      const before = paths.map((path) => readFileSync(path));
      expect(harness.publish().status).toBe(0);

      expect(paths.map((path) => readFileSync(path))).toEqual(before);
      expect(
        readFileSync(paths[1], "utf8")
          .split("\n")
          .filter((line) => line.startsWith("- ")),
      ).toEqual([entry(current)]);
    },
  );

  it.each([
    "work-id: other",
    "domain: ../escape",
    "completed: 2026-02-30T12:00:00Z",
    "started: 2026-10-01",
  ])(
    "should reject invalid identity or dates (%s) before changing history",
    (field) => {
      const harness = new JournalHarness();
      const key = field.slice(0, field.indexOf(":"));
      writeFileSync(
        harness.input,
        summaryText(current).replace(new RegExp(`^${key}:.*$`, "m"), field),
      );
      const before = snapshot(harness.state);

      expect(harness.publish().status).not.toBe(0);

      expect(snapshot(harness.state)).toEqual(before);
    },
  );

  it("should accept a start date matching the completion's local calendar date", () => {
    const harness = new JournalHarness();
    const localCompletion = {
      ...current,
      completed: "2026-09-30T00:30:00+02:00",
    };
    const authored = summaryText(localCompletion).replace(
      "started: 2026-09-01",
      "started: 2026-09-30",
    );
    writeFileSync(harness.input, authored);

    const result = harness.publish();

    expect(result.status, result.stdout || result.stderr).toBe(0);
    expect(
      readFileSync(join(harness.state, summaryPath(localCompletion)), "utf8"),
    ).toBe(authored);
    expect(readFileSync(join(harness.state, "overview.md"), "utf8")).toBe(
      originalOverview.replace("Old history", entry(localCompletion)),
    );
  });

  it.each(["domain", "date"])(
    "should reject an existing owned record under a conflicting %s",
    (conflict) => {
      const harness = new JournalHarness();
      harness.seed({
        ...current,
        ...(conflict === "domain"
          ? { domain: "coding" }
          : { completed: "2026-09-29T12:00:00Z" }),
      });
      const before = snapshot(harness.state);

      expect(harness.publish().status).not.toBe(0);

      expect(snapshot(harness.state)).toEqual(before);
    },
  );

  it.each(["missing", "expired", "foreign"])(
    "should refuse a %s lease without output changes",
    (kind) => {
      const harness = new JournalHarness();
      const path = join(harness.work, "lease.json");
      if (kind === "missing") rmSync(path);
      if (kind === "expired") {
        const record = JSON.parse(readFileSync(path, "utf8")) as Record<
          string,
          unknown
        >;
        writeFileSync(path, JSON.stringify({ ...record, expires_at_epoch: 0 }));
      }
      const before = snapshot(harness.state);

      expect(
        harness.publish(...(kind === "foreign" ? ["--token", "wrong"] : []))
          .status,
      ).not.toBe(0);

      expect(snapshot(harness.state)).toEqual(before);
    },
  );

  it.each(["working", "receipt missing"])(
    "should reject completion without evidence (%s)",
    (kind) => {
      const harness = new JournalHarness();
      writeFileSync(
        join(harness.work, "state.md"),
        kind === "working"
          ? "- Phase: working\n\n## Completion receipt\n\nEvidence\n"
          : "- Phase: completed\n",
      );
      const before = snapshot(harness.state);
      expect(harness.publish().status).not.toBe(0);
      expect(snapshot(harness.state)).toEqual(before);
    },
  );

  it("should preserve malformed existing history instead of overwriting it", () => {
    const harness = new JournalHarness();
    harness.seed(current, "---\nwork-id: demo\n---\nUnrecoverable metadata\n");
    const before = snapshot(harness.state);
    expect(harness.publish().status).not.toBe(0);
    expect(snapshot(harness.state)).toEqual(before);
  });

  it.each([
    "input symlink",
    "input directory",
    "destination symlink",
    "destination directory",
    "domain symlink",
    "overview symlink",
  ])(
    "should refuse unsafe files (%s) without touching their referents",
    (kind) => {
      const harness = new JournalHarness();
      const victim = join(harness.root, "victim");
      writeFileSync(victim, summaryText(current));
      const destination = join(harness.state, summaryPath(current));
      if (kind.startsWith("input")) {
        rmSync(harness.input);
        if (kind === "input symlink") symlinkSync(victim, harness.input);
        else mkdirSync(harness.input);
      } else if (kind === "domain symlink") {
        mkdirSync(join(harness.state, "journals"));
        symlinkSync(harness.root, join(harness.state, "journals/essential"));
      } else if (kind === "overview symlink") {
        rmSync(join(harness.state, "overview.md"));
        symlinkSync(victim, join(harness.state, "overview.md"));
      } else {
        mkdirSync(dirname(destination), { recursive: true });
        if (kind === "destination symlink") symlinkSync(victim, destination);
        else mkdirSync(destination);
      }
      const before = snapshot(harness.root);
      expect(harness.publish().status).not.toBe(0);
      expect(snapshot(harness.root)).toEqual(before);
    },
  );

  it.each(["-h", "--help"])("should display %s without writes", (flag) => {
    const harness = new JournalHarness();
    const before = snapshot(harness.root);
    const result = harness.publish(flag);
    expect(result).toMatchObject({ status: 0, stdout: "" });
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(snapshot(harness.root)).toEqual(before);
  });

  it("should preserve authored bytes and refresh only recent history", () => {
    const harness = new JournalHarness();
    const authored = readFileSync(harness.input);
    const result = harness.publish();

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      generated_files: expect.arrayContaining([
        join(harness.state, summaryPath(current)),
        join(harness.state, "journals.md"),
        join(harness.state, "overview.md"),
      ]),
    });
    expect(readFileSync(join(harness.state, summaryPath(current)))).toEqual(
      authored,
    );
    expect(readFileSync(join(harness.state, "overview.md"), "utf8")).toBe(
      originalOverview.replace("Old history", entry(current)),
    );
    expect(
      readFileSync(join(harness.state, "journals.md"), "utf8")
        .split("\n")
        .filter((line) => line.startsWith("- ")),
    ).toEqual([entry(current)]);
  });
});

function summaryText(summary: Summary): string {
  return `---\nwork-id: ${summary.id}\ndomain: ${summary.domain}\nstarted: 2026-09-01\ncompleted: ${summary.completed}\nsummary: ${JSON.stringify(summary.summary)}\n---\n\n# Retrospective\n\nAuthored detail with **formatting**.\n`;
}

function summaryPath(summary: Summary): string {
  return `journals/${summary.domain}/${summary.completed.slice(0, 10)}-${summary.id}.md`;
}

function entry(summary: Summary): string {
  return `- ${summary.completed.slice(0, 10)} — [\`${summary.id}\`](${summaryPath(summary)}): ${summary.summary}`;
}

function snapshot(root: string): unknown[] {
  return readdirSync(root)
    .sort()
    .map((name) => {
      const path = join(root, name);
      const stat = lstatSync(path);
      return [
        name,
        stat.mode,
        stat.isFile()
          ? readFileSync(path)
          : stat.isDirectory()
            ? snapshot(path)
            : null,
      ];
    });
}
