#!/usr/bin/env bun
/** publishes completed-work retrospectives and their derived history views */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  fstatSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface Summary {
  workId: string;
  domain: string;
  started: string;
  completed: string;
  summary: string;
  file: Buffer;
  target: string;
}

class PublicationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const USAGE =
  "usage: bun state-journals.ts publish --work-dir ABS --token TOKEN --summary-file ABS\n";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FIELDS = ["work-id", "domain", "started", "completed", "summary"];

function main(): void {
  try {
    const command = parseCommand();
    if (command) {
      const result = publish(
        command.workDir,
        command.token,
        command.summaryFile,
      );
      if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } catch (error) {
    const failure = error as Error;
    const code =
      failure instanceof PublicationError ? failure.code : "internal_error";
    const message =
      failure instanceof PublicationError
        ? failure.message
        : "journal publication failed";
    process.stdout.write(
      `${JSON.stringify({ status: "error", code, error: message })}\n`,
    );
    process.exitCode = code === "usage" ? 2 : 1;
  }
}

function fail(code: string, message: string): never {
  throw new PublicationError(code, message);
}

function parseCommand():
  { workDir: string; token: string; summaryFile: string } | undefined {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stderr.write(USAGE);
    return undefined;
  }
  if (args.shift() !== "publish") fail("usage", USAGE.trim());
  const options = new Map<string, string>();
  while (args.length) {
    const argument = args.shift()!;
    const equals = argument.indexOf("=");
    const name = equals < 0 ? argument : argument.slice(0, equals);
    const value = equals < 0 ? args.shift() : argument.slice(equals + 1);
    if (!["--work-dir", "--token", "--summary-file"].includes(name))
      fail("usage", "unknown argument");
    if (!value || options.has(name)) fail("usage", `invalid ${name}`);
    options.set(name, value);
  }
  for (const name of ["--work-dir", "--token", "--summary-file"])
    if (!options.has(name)) fail("usage", `${name} is required`);
  return {
    workDir: options.get("--work-dir")!,
    token: options.get("--token")!,
    summaryFile: options.get("--summary-file")!,
  };
}

function validateSlug(value: string, label: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
    fail("invalid_summary", `${label} must be a safe slug`);
}

function validateDate(value: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail("invalid_summary", `${label} must be YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  )
    fail("invalid_summary", `${label} is not a real date`);
}

function validateTimestamp(value: string): void {
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match)
    fail("invalid_summary", "completed must be an ISO timestamp with timezone");
  validateDate(match[1], "completed date");
  const [, , hours, minutes, seconds, zone] = match;
  if (+hours > 23 || +minutes > 59 || +seconds > 59)
    fail("invalid_summary", "completed has an invalid time");
  if (zone !== "Z") {
    const [zoneHours, zoneMinutes] = zone.slice(1).split(":").map(Number);
    if (zoneHours > 23 || zoneMinutes > 59)
      fail("invalid_summary", "completed has an invalid timezone");
  }
  if (!Number.isFinite(Date.parse(value)))
    fail("invalid_summary", "completed is not a real timestamp");
}

function parseScalar(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const decoded: unknown = JSON.parse(value);
      if (typeof decoded === "string") return decoded;
    } catch {
      fail("invalid_summary", "invalid quoted frontmatter value");
    }
    fail("invalid_summary", "frontmatter value must be a string");
  }
  if (value.startsWith("'") && value.endsWith("'"))
    return value.slice(1, -1).replaceAll("''", "'");
  return value;
}

function parseSummary(file: Buffer, target = ""): Summary {
  const source = file.toString("utf8");
  if (!Buffer.from(source, "utf8").equals(file))
    fail("invalid_summary", "summary must be UTF-8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match) fail("invalid_summary", "summary needs YAML frontmatter");
  const fields = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([a-z-]+):[ \t]*(.*)$/.exec(line);
    if (!field || !FIELDS.includes(field[1]) || fields.has(field[1]))
      fail("invalid_summary", "summary has malformed or duplicate frontmatter");
    fields.set(field[1], parseScalar(field[2]));
  }
  if (fields.size !== FIELDS.length)
    fail("invalid_summary", "summary is missing required frontmatter");
  const [workId, domain, started, completed, summary] = FIELDS.map((key) =>
    fields.get(key)!,
  );
  validateSlug(workId, "work-id");
  validateSlug(domain, "domain");
  validateDate(started, "started");
  validateTimestamp(completed);
  if (
    !summary ||
    /[\r\n\u0000-\u001f]/.test(summary) ||
    summary !== summary.trim()
  )
    fail("invalid_summary", "summary must be one nonempty line");
  if (started > completed.slice(0, 10))
    fail("invalid_summary", "started must not follow completed");
  return { workId, domain, started, completed, summary, file, target };
}

function inspectPath(
  path: string,
  kind: "file" | "directory",
  required: boolean,
): boolean {
  if (path !== resolve(path)) fail("unsafe_path", "path must be normalized");
  let current = resolve(path);
  while (true) {
    const metadata = lstatSync(current, { throwIfNoEntry: false });
    if (metadata?.isSymbolicLink())
      fail("unsafe_path", `symlink path: ${current}`);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const metadata = lstatSync(path, { throwIfNoEntry: false });
  if (!metadata) {
    if (required) fail("missing_path", `missing ${kind}: ${path}`);
    return false;
  }
  if (kind === "file" ? !metadata.isFile() : !metadata.isDirectory())
    fail("unsafe_path", `expected ${kind}: ${path}`);
  return true;
}

function readCompletion(workDir: string): void {
  const statePath = join(workDir, "state.md");
  inspectPath(statePath, "file", true);
  const state = readFileSync(statePath, "utf8");
  if ((state.match(/^- Phase: `?completed`?[ \t]*$/gm) ?? []).length !== 1)
    fail("incomplete_work", "workstream phase must be completed");
  const receipt =
    /^## Completion receipt[ \t]*\r?\n([\s\S]*?)(?=^#{1,2} |$(?![\s\S]))/m.exec(
      state,
    )?.[1];
  if (
    !receipt ||
    !receipt
      .split(/\r?\n/)
      .some((line) => line.trim() && !/^(?:<!--|#)/.test(line.trim()))
  )
    fail("incomplete_work", "workstream needs a nonempty Completion receipt");
}

function readExistingSummaries(stateRoot: string): Summary[] {
  const journalRoot = join(stateRoot, "journals");
  if (!inspectPath(journalRoot, "directory", false)) return [];
  const summaries: Summary[] = [];
  const ids = new Set<string>();
  for (const domain of readdirSync(journalRoot).sort()) {
    validateSlug(domain, "existing domain");
    const folder = join(journalRoot, domain);
    inspectPath(folder, "directory", true);
    for (const name of readdirSync(folder).sort()) {
      if (!name.endsWith(".md"))
        fail("invalid_history", `unexpected journal entry: ${name}`);
      const target = `journals/${domain}/${name}`;
      const path = join(stateRoot, target);
      inspectPath(path, "file", true);
      const summary = parseSummary(readFileSync(path), target);
      const expected = `${summary.completed.slice(0, 10)}-${summary.workId}.md`;
      if (summary.domain !== domain || name !== expected)
        fail(
          "invalid_history",
          `summary path differs from frontmatter: ${target}`,
        );
      if (ids.has(summary.workId))
        fail("invalid_history", `duplicate work-id: ${summary.workId}`);
      ids.add(summary.workId);
      summaries.push(summary);
    }
  }
  return summaries;
}

function formatLine(summary: Summary): string {
  return `- ${summary.completed.slice(0, 10)} — [\`${summary.workId}\`](${summary.target}): ${summary.summary}`;
}

function compareRecent(left: Summary, right: Summary): number {
  return (
    Date.parse(right.completed) - Date.parse(left.completed) ||
    left.workId.localeCompare(right.workId, "en")
  );
}

function renderIndex(summaries: Summary[]): string {
  const domains = [
    ...new Set(summaries.map((summary) => summary.domain)),
  ].sort();
  return `# Workstream journals\n${domains
    .map((domain) => {
      const lines = summaries
        .filter((item) => item.domain === domain)
        .sort(compareRecent)
        .map(formatLine);
      return `\n## ${domain}\n\n${lines.join("\n")}\n`;
    })
    .join("")}`;
}

function updateOverview(source: string, lines: string[]): string {
  const masked = source.replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) =>
    comment.replace(/[^\r\n]/g, " "),
  );
  const sourceLines = source.match(/.*(?:\r?\n|$)/g)?.filter(Boolean) ?? [];
  const maskedLines = masked.match(/.*(?:\r?\n|$)/g)?.filter(Boolean) ?? [];
  let offset = 0;
  let fence = "";
  const headings: {
    start: number;
    body: number;
    level: number;
    title: string;
  }[] = [];
  for (let index = 0; index < maskedLines.length; index++) {
    const line = maskedLines[index];
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (marker?.[0] === fence[0] && marker.length >= fence.length) fence = "";
    } else if (marker) fence = marker;
    else {
      const heading =
        /^ {0,3}(#{1,2})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*\r?\n?$/.exec(line);
      if (heading)
        headings.push({
          start: offset,
          body: offset + sourceLines[index].length,
          level: heading[1].length,
          title: heading[2].trim(),
        });
    }
    offset += sourceLines[index].length;
  }
  const recent = headings.filter(
    (heading) => heading.level === 2 && heading.title === "Recently landed",
  );
  if (recent.length > 1)
    fail("invalid_overview", "overview has duplicate Recently landed sections");
  const body = `\n${lines.length ? `${lines.join("\n")}\n` : ""}\n`;
  if (!recent.length)
    return `${source}${source.endsWith("\n") ? "\n" : "\n\n"}## Recently landed\n${body}`;
  const heading = recent[0];
  const next = headings.find(
    (candidate) =>
      candidate.start > heading.start && candidate.level <= heading.level,
  );
  return `${source.slice(0, heading.body)}${body}${source.slice(next?.start ?? source.length)}`;
}

function checkLease(workDir: string, token: string): void {
  const leasePath = join(workDir, "lease.json");
  inspectPath(leasePath, "file", true);
  let lease: { token_sha256?: unknown; expires_at_epoch?: unknown };
  try {
    lease = JSON.parse(readFileSync(leasePath, "utf8"));
  } catch {
    fail("invalid_lease", "lease is malformed");
  }
  if (
    lease.token_sha256 !== createHash("sha256").update(token).digest("hex") ||
    typeof lease.expires_at_epoch !== "number" ||
    lease.expires_at_epoch <= Date.now() / 1000
  )
    fail("invalid_lease", "a live matching lease is required");
}

function holdsLock(lockPath: string): boolean {
  const descriptor = Number(process.env.STATE_JOURNALS_LOCK_FD);
  if (!Number.isSafeInteger(descriptor) || descriptor < 0) return false;
  try {
    const held = fstatSync(descriptor);
    const current = statSync(lockPath);
    return (
      held.isFile() && held.dev === current.dev && held.ino === current.ino
    );
  } catch {
    return false;
  }
}

function runUnderLock(
  lockPath: string,
  workDir: string,
  token: string,
  summaryFile: string,
): void {
  const result = spawnSync(
    "python3",
    [
      join(SCRIPT_DIR, "state-journals-lock.py"),
      lockPath,
      process.execPath,
      fileURLToPath(import.meta.url),
      "publish",
      "--work-dir",
      workDir,
      "--token",
      token,
      "--summary-file",
      summaryFile,
    ],
    { encoding: "utf8" },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.status ?? 1;
}

function writeState(
  workDir: string,
  token: string,
  target: string,
  content: Buffer | string,
): void {
  const result = spawnSync(
    join(SCRIPT_DIR, "state-write"),
    ["--work-dir", workDir, "--token", token, "--state-target", target],
    { input: content, encoding: "utf8" },
  );
  if (result.status !== 0)
    fail(
      "write_failed",
      `state-write failed for ${target} (exit ${result.status ?? "signal"})`,
    );
}

function preparePublication(
  stateRoot: string,
  workId: string,
  summary: Summary,
): { index: string; overview: string; entries: number } {
  const overviewPath = join(stateRoot, "overview.md");
  inspectPath(overviewPath, "file", true);
  inspectPath(join(stateRoot, "journals.md"), "file", false);
  inspectPath(join(stateRoot, "journals"), "directory", false);
  inspectPath(join(stateRoot, "journals", summary.domain), "directory", false);
  inspectPath(join(stateRoot, summary.target), "file", false);
  const existing = readExistingSummaries(stateRoot);
  const prior = existing.find((item) => item.workId === workId);
  if (
    prior &&
    (prior.domain !== summary.domain || prior.target !== summary.target)
  )
    fail(
      "identity_conflict",
      "existing summary domain or completion date differs",
    );
  const summaries = [
    ...existing.filter((item) => item.workId !== workId),
    summary,
  ];
  return {
    index: renderIndex(summaries),
    overview: updateOverview(
      readFileSync(overviewPath, "utf8"),
      [...summaries].sort(compareRecent).slice(0, 5).map(formatLine),
    ),
    entries: summaries.length,
  };
}

function publish(
  workDirInput: string,
  token: string,
  summaryFile: string,
): object | undefined {
  if (!isAbsolute(workDirInput) || !isAbsolute(summaryFile))
    fail("usage", "work-dir and summary-file must be absolute paths");
  inspectPath(workDirInput, "directory", true);
  inspectPath(summaryFile, "file", true);
  const workDir = realpathSync(workDirInput);
  const workId = basename(workDir);
  validateSlug(workId, "work directory ID");
  const worksRoot = dirname(workDir);
  if (
    basename(worksRoot) !== "works" ||
    basename(dirname(worksRoot)) !== ".state"
  )
    fail("unsafe_path", "work-dir must be .state/works/<work-id>");
  const stateRoot = dirname(worksRoot);
  const summary = parseSummary(readFileSync(summaryFile));
  if (summary.workId !== workId)
    fail("invalid_summary", "summary work-id differs from selected workstream");
  summary.target = `journals/${summary.domain}/${summary.completed.slice(0, 10)}-${summary.workId}.md`;
  readCompletion(workDir);
  checkLease(workDir, token);
  const lockPath = join(stateRoot, ".state-journals.lock");
  inspectPath(lockPath, "file", false);
  if (!holdsLock(lockPath)) {
    preparePublication(stateRoot, workId, summary);
    if (process.env.STATE_JOURNALS_LOCK_FD !== undefined)
      fail("lock_failed", "journal publication lock was not inherited");
    runUnderLock(lockPath, workDir, token, summaryFile);
    return undefined;
  }
  const publication = preparePublication(stateRoot, workId, summary);
  checkLease(workDir, token);
  writeState(workDir, token, summary.target, summary.file);
  writeState(workDir, token, "journals.md", publication.index);
  writeState(workDir, token, "overview.md", publication.overview);
  return {
    status: "published",
    work_id: workId,
    target: summary.target,
    entries: publication.entries,
    generated_files: [summary.target, "journals.md", "overview.md"].map(
      (target) => join(stateRoot, target),
    ),
  };
}

main();
