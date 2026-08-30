#!/usr/bin/env bun
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import {
  decodeStateDashboard,
  StateValidationFailure,
  taskDefinitionHash,
} from "../../../scripts/state-codec.ts";

type RecordValue = Record<string, unknown>;

export interface MigrationReceipt {
  schema: "essential.state-migration-receipt/v1";
  createdAt: string;
  stateRoot: string;
  backupRoot: string;
  entries: Array<{ path: string; sha256: string; size: number }>;
  migratedWorkIds: string[];
  createdPaths?: string[];
}

export interface MigrationOptions {
  stateRoot: string;
  backupDir: string;
  workIds?: string[];
  approved?: boolean;
  failpoint?: string;
  now?: () => string;
}

export interface RestoreOptions {
  approval?: string;
  failpoint?: string;
}

const REQUIRED_LEGACY_FILES = [
  "goal.md",
  "state.md",
  "state/working.md",
  "state/journal.md",
] as const;

const RECORD_KINDS = ["proposal", "change", "decision", "design"] as const;
const REVIEW_AREAS = [
  "alignment",
  "correctness",
  "security",
  "quality",
  "testing",
  "docs",
  "style",
] as const;

interface LegacyWork {
  workId: string;
  workDir: string;
  legacyFiles: string[];
}

interface ParsedLegacyWork extends LegacyWork {
  model: RecordValue;
  artifacts: LegacyArtifact[];
}

interface MigrationPreflight {
  stateRoot: string;
  now: string;
  works: LegacyWork[];
  projectFiles: string[];
  hasOverview: boolean;
  snapshot: MigrationReceipt["entries"];
  parsed: ParsedLegacyWork[];
  diagnosis: LegacyWork[];
}

interface PreparedMigrationWork extends ParsedLegacyWork {
  stage: string;
  stageRoot: string;
  token: string;
}

interface MigrationStages {
  prepared: PreparedMigrationWork[];
  projectStage?: string;
  projectStageRoot?: string;
}

interface MigrationExecution extends MigrationPreflight, MigrationStages {
  options: MigrationOptions;
}

interface MigrationPreflightParams {
  stateRoot: string;
  works: LegacyWork[];
  now: string;
}

interface ParseLegacyWorkParams {
  work: LegacyWork;
  projectRef: string;
  stateRoot: string;
  now: string;
}

interface LegacyProjectOverviewParams {
  stateRoot: string;
  works: LegacyWork[];
  parsed: ParsedLegacyWork[];
}

interface CopyPreparedWorkStagesParams {
  stateRoot: string;
  prepared: PreparedMigrationWork[];
  projectStage: string;
}

interface PublishMigrationWorkParams {
  execution: MigrationExecution;
  item: PreparedMigrationWork;
  index: number;
}

interface LegacyArtifact {
  sourcePath: string;
  targetPath: string;
  bytes: Uint8Array;
}

interface LegacySupplemental {
  revisions: RecordValue[];
  questions: RecordValue[];
  records: RecordValue[];
  review?: RecordValue;
  submission?: RecordValue;
  completion?: RecordValue;
  documentations: RecordValue[];
  artifacts: LegacyArtifact[];
}

function result(status: string, details: RecordValue = {}): RecordValue {
  return { status, ...details };
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value))
    return value
      .map(canonical)
      .sort((left, right) =>
        left &&
        right &&
        typeof left === "object" &&
        typeof right === "object" &&
        "ref" in left &&
        "ref" in right
          ? String(left.ref).localeCompare(String(right.ref))
          : 0,
      );
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as RecordValue)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function scalar(value: unknown): string {
  if (typeof value === "string") return quote(value);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) return `[${value.map(scalar).join(", ")}]`;
  if (value && typeof value === "object")
    return `{ ${Object.entries(value as RecordValue)
      .map(([key, item]) => `${key}: ${scalar(item)}`)
      .join(", ")} }`;
  throw new Error("unsupported MDC annotation value");
}

function annotation(type: string, ref: string, fields: RecordValue): string {
  return `{{ type: ${type}, ref: ${quote(ref)}, ${Object.entries(fields)
    .map(([key, value]) => `${key}: ${scalar(value)}`)
    .join(", ")} }}`;
}

function semanticBlock(
  type: string,
  entity: RecordValue,
  visible: string,
  childBlocks: string[] = [],
  depth = 0,
): string {
  const fields = { ...entity };
  delete fields.ref;
  const indent = "  ".repeat(depth);
  return `${indent}${annotation(type, String(entity.ref), fields)}\n${indent}- ${visible}\n${childBlocks.join("")}${indent}--{ ref: ${entity.ref} }--\n`;
}

function evidenceBlock(evidence: RecordValue, depth: number): string {
  const fields = { ...evidence };
  const summary = String(fields.summary);
  delete fields.summary;
  return semanticBlock("state.evidence", fields, summary, [], depth);
}

function reviewBlock(review: RecordValue): string {
  const areas = (review.areas as RecordValue[]).map((area) => {
    const areaFields = { ...area };
    const findings = (areaFields.findings as RecordValue[]).map((finding) => {
      const findingFields = { ...finding };
      const summary = String(findingFields.summary);
      const evidences = (findingFields.evidence as RecordValue[]).map(
        (evidence) => evidenceBlock(evidence, 3),
      );
      delete findingFields.summary;
      if (evidences.length) delete findingFields.evidence;
      return semanticBlock(
        "state.finding",
        findingFields,
        summary,
        evidences,
        2,
      );
    });
    const visible = String(areaFields.area);
    delete areaFields.area;
    if (findings.length) delete areaFields.findings;
    return semanticBlock("state.reviewArea", areaFields, visible, findings, 1);
  });
  const fields = { ...review };
  delete fields.areas;
  return semanticBlock("state.review", fields, "Review", areas);
}

function submissionBlock(submission: RecordValue): string {
  const children = [
    ...(submission.pullRequests as RecordValue[]).map((pullRequest) => {
      const fields = { ...pullRequest };
      const visible = String(fields.url);
      delete fields.url;
      return semanticBlock("state.pullRequest", fields, visible, [], 1);
    }),
    ...(submission.deliverables as RecordValue[]).map((deliverable) => {
      const fields = { ...deliverable };
      const visible = String(fields.title);
      delete fields.title;
      return semanticBlock("state.deliverable", fields, visible, [], 1);
    }),
  ];
  const fields = { ...submission };
  if ((submission.pullRequests as RecordValue[]).length)
    delete fields.pullRequests;
  if ((submission.deliverables as RecordValue[]).length)
    delete fields.deliverables;
  return semanticBlock(
    "state.submission",
    fields,
    String(fields.kind),
    children,
  );
}

function completionBlock(completion: RecordValue): string {
  const children = [
    ...(completion.landing as RecordValue[]).map((evidence) =>
      evidenceBlock(evidence, 1),
    ),
    (() => {
      const promotion = completion.promotion as RecordValue;
      const fields = { ...promotion };
      const visible = String(fields.mode);
      delete fields.mode;
      return semanticBlock("state.promotion", fields, visible, [], 1);
    })(),
    ...(completion.outlives as RecordValue[]).map((item) => {
      const fields = { ...item };
      const visible = String(fields.summary);
      delete fields.summary;
      return semanticBlock("state.outlives", fields, visible, [], 1);
    }),
    ...(completion.decisionDispositions as RecordValue[]).map((item) => {
      const fields = { ...item };
      const visible = String(fields.decisionRef);
      delete fields.decisionRef;
      return semanticBlock("state.decisionDisposition", fields, visible, [], 1);
    }),
  ];
  const fields = { ...completion };
  if ((completion.landing as RecordValue[]).length) delete fields.landing;
  delete fields.promotion;
  if ((completion.outlives as RecordValue[]).length) delete fields.outlives;
  if ((completion.decisionDispositions as RecordValue[]).length)
    delete fields.decisionDispositions;
  const visible = String(fields.completedAt);
  delete fields.completedAt;
  return semanticBlock("state.completion", fields, visible, children);
}

function metadata(markdown: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of markdown.split("\n")) {
    const match = /^- ([A-Za-z][A-Za-z ]+): (.+)$/.exec(line);
    if (!match) continue;
    const key = match[1].trim();
    if (values.has(key))
      throw new Error(`ambiguous duplicate metadata: ${key}`);
    values.set(key, match[2].trim().replace(/^`|`$/g, ""));
  }
  return values;
}

function section(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line === `## ${heading}`);
  if (start < 0) throw new Error(`missing required section: ${heading}`);
  const next = lines.findIndex(
    (line, index) => index > start && line.startsWith("## "),
  );
  return lines
    .slice(start + 1, next < 0 ? undefined : next)
    .join("\n")
    .trim();
}

function optionalSection(
  markdown: string,
  heading: string,
): string | undefined {
  const lines = markdown.split("\n");
  if (!lines.includes(`## ${heading}`)) return undefined;
  return section(markdown, heading);
}

function hasLegacyContent(content: string | undefined): boolean {
  if (!content) return false;
  const normalized = content
    .split("\n")
    .map((line) =>
      stripMarkdown(line.replace(/^-\s+/, "").trim()).replace(/\.$/, ""),
    )
    .filter(Boolean);
  return normalized.some(
    (line) => line !== "None" && line !== "—" && line !== "Not started.",
  );
}

function assertSupportedPrimaryDocuments(
  state: string,
  goal: string,
  stateMeta: Map<string, string>,
  goalMeta: Map<string, string>,
): void {
  integerField(stateMeta, "Plan revision");
  integerField(goalMeta, "Charter revision");
  if (
    !["planned", "working", "reviewing", "completed", "archived"].includes(
      stateMeta.get("Phase") ?? "",
    )
  )
    throw new Error("invalid legacy phase");
  for (const heading of ["Requirements", "Boundary", "Non-goals"] as const) {
    const content = optionalSection(goal, heading);
    if (content !== undefined && !content.trim())
      throw new Error(`ambiguous empty charter section: ${heading}`);
  }
}

function proseSection(markdown: string, heading: string): string {
  const content = section(markdown, heading);
  if (!content || content.startsWith("|"))
    throw new Error(`ambiguous prose section: ${heading}`);
  return content.replace(/\n+/g, " ");
}

function simpleDocumentProse(
  markdown: string,
  expectedHeading: string,
): string {
  const lines = markdown.split("\n");
  if (lines[0] !== `# ${expectedHeading}`)
    throw new Error(`unsupported legacy document heading: ${expectedHeading}`);
  const body = lines
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);
  if (
    !body.length ||
    body.some((line) => line.startsWith("#") || line.startsWith("|"))
  )
    throw new Error(`unsupported legacy document shape: ${expectedHeading}`);
  return body.map(stripMarkdown).join(" ");
}

function statements(
  markdown: string,
  heading: string,
  refPrefix: string,
): RecordValue[] {
  const content = optionalSection(markdown, heading);
  if (content === undefined) return [];
  const items = content
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => stripMarkdown(line.slice(2)))
    .filter((line) => line !== "None");
  if (hasLegacyContent(content) && !items.length)
    throw new Error(`unsupported legacy list shape: ${heading}`);
  return items.map((text, index) => ({
    ref: `${refPrefix}-${index + 1}`,
    text,
  }));
}

function boundary(workRef: string, goal: string): RecordValue {
  const content = proseSection(goal, "Scope and non-goals");
  const labeled = /^(?:In scope:\s*)?(.*?)(?:\s+Out of scope:\s*(.+))$/i.exec(
    content,
  );
  const inText = (labeled?.[1] ?? content).trim();
  const outText = labeled?.[2]?.trim();
  if (!inText) throw new Error("ambiguous prose section: Scope and non-goals");
  return {
    ref: `${workRef}:boundary`,
    in: [{ ref: `${workRef}:statement:scope-in`, text: inText }],
    out: outText
      ? [{ ref: `${workRef}:statement:scope-out`, text: outText }]
      : [],
  };
}

function specificationProvenance(goal: string): RecordValue {
  const content = optionalSection(goal, "Specification provenance");
  if (
    !content ||
    content
      .split("\n")
      .map((line) => stripMarkdown(line.replace(/^-\s+/, "").trim()))
      .filter(Boolean)
      .every((line) => line === "None" || line === "Specification: None")
  )
    return { state: "none", entries: [] };
  throw new Error(
    "unsupported legacy lifecycle carrier: specification provenance",
  );
}

function anchors(workRef: string, goal: string): RecordValue[] {
  const content = optionalSection(goal, "Workspace anchors");
  if (!content || !hasLegacyContent(content)) return [];
  return content
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line, index) => {
      const match =
        /^- kind:\s*`?([^`·]+?)`?\s*·\s*locator:\s*`?([^`·]+?)`?\s*·\s*revision semantics:\s*(.+)$/.exec(
          line,
        );
      if (!match)
        throw new Error(
          "unsupported legacy lifecycle carrier: workspace anchors",
        );
      return {
        ref: `${workRef}:anchor:${index + 1}`,
        kind: stripMarkdown(match[1]),
        locator: { uri: stripMarkdown(match[2]) },
        revisionSemantics: stripMarkdown(match[3]),
      };
    });
}

function cells(line: string): string[] {
  return line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function table(
  markdown: string,
  heading: string,
  expectedHeaders: string[],
): string[][] {
  const lines = section(markdown, heading)
    .split("\n")
    .filter((line) => line.startsWith("|"));
  if (lines.length < 2 || cells(lines[1]).some((cell) => !cell.includes("-")))
    throw new Error(`malformed table: ${heading}`);
  const headers = cells(lines[0]).map(stripMarkdown);
  if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders))
    throw new Error(`noncanonical table header: ${heading}`);
  const width = headers.length;
  const rows = lines.slice(2).map(cells);
  if (rows.some((row) => row.length !== width))
    throw new Error(`ragged table: ${heading}`);
  return rows;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

function identifiers(value: string): string[] {
  if (value === "—" || value === "-") return [];
  return value.split(/,\s*/).map(stripMarkdown).filter(Boolean);
}

function safeRelativePath(path: string): boolean {
  return (
    path.length > 0 &&
    !isAbsolute(path) &&
    !path.includes("\\") &&
    path
      .split("/")
      .every(
        (component) =>
          component !== "" && component !== "." && component !== "..",
      )
  );
}

function parseTimestamp(value: string): string {
  if (Number.isNaN(Date.parse(value)))
    throw new Error(`invalid timestamp: ${value}`);
  return value;
}

function integerField(values: Map<string, string>, key: string): number {
  const value = Number(values.get(key));
  if (!Number.isInteger(value) || value < 1) throw new Error(`invalid ${key}`);
  return value;
}

function tableRows(
  markdown: string,
  heading: string,
): Array<Record<string, string>> {
  const content = optionalSection(markdown, heading);
  if (!content || !hasLegacyContent(content)) return [];
  const lines = content.split("\n").filter((line) => line.startsWith("|"));
  if (lines.length < 2) throw new Error(`malformed table: ${heading}`);
  const headers = cells(lines[0]).map((value) => stripMarkdown(value));
  if (
    new Set(headers).size !== headers.length ||
    cells(lines[1]).some((value) => !/^:?-{3,}:?$/.test(value))
  )
    throw new Error(`malformed table: ${heading}`);
  return lines.slice(2).map((line) => {
    const values = cells(line);
    if (values.length !== headers.length)
      throw new Error(`ragged table: ${heading}`);
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index]]),
    );
  });
}

function firstTableRows(
  markdown: string,
  label: string,
): Array<Record<string, string>> {
  const lines = markdown.split("\n").filter((line) => line.startsWith("|"));
  if (!lines.length) return [];
  if (lines.length < 2) throw new Error(`malformed table: ${label}`);
  const headers = cells(lines[0]).map(stripMarkdown);
  if (
    new Set(headers).size !== headers.length ||
    cells(lines[1]).some((value) => !/^:?-{3,}:?$/.test(value))
  )
    throw new Error(`malformed table: ${label}`);
  return lines.slice(2).map((line) => {
    const values = cells(line);
    if (values.length !== headers.length)
      throw new Error(`ragged table: ${label}`);
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index]]),
    );
  });
}

function slug(value: string, label: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
    throw new Error(`noncanonical ${label}: ${value}`);
  return value;
}

function field(values: Map<string, string>, key: string): string {
  const value = values.get(key);
  if (!value) throw new Error(`missing required metadata: ${key}`);
  return stripMarkdown(value);
}

function optionalList(value: string | undefined): string[] {
  if (!value || ["None", "—", "-"].includes(stripMarkdown(value))) return [];
  return value.split(/,\s*/).map(stripMarkdown).filter(Boolean);
}

function explicitRelationshipRef(
  item: string,
  workRef: string,
  taskIds: Set<string>,
  label: string,
): string | undefined {
  if (item.startsWith("state:")) {
    if (!item.startsWith(`${workRef}:`))
      throw new Error(`cross-work legacy record field ${label}: ${item}`);
    return item;
  }
  if (taskIds.has(item)) return `${workRef}:task:${item}`;
  return undefined;
}

function relationshipRefs(
  value: string | undefined,
  workRef: string,
  taskIds: Set<string>,
  label: string,
): string[] {
  return optionalList(value).map((item) => {
    const ref = explicitRelationshipRef(item, workRef, taskIds, label);
    if (!ref)
      throw new Error(`unmappable legacy record field ${label}: ${item}`);
    return ref;
  });
}

function recordRelationships(
  recordRef: string,
  relation: "affects" | "invalidates" | "preserves",
  value: string | undefined,
  workRef: string,
  taskIds: Set<string>,
): { refs: string[]; statements: RecordValue[] } {
  const refs: string[] = [];
  const statements: RecordValue[] = [];
  for (const item of optionalList(value)) {
    const ref = explicitRelationshipRef(item, workRef, taskIds, relation);
    if (ref) refs.push(ref);
    else
      statements.push({
        ref: `${recordRef}:statement:${relation}-${sha256(item).slice(0, 12)}`,
        text: item,
        relation,
      });
  }
  return { refs, statements };
}

function parseRevisions(
  markdown: string | undefined,
  workRef: string,
  planRevision: number,
  charterRevision: number,
): RecordValue[] {
  if (!markdown) {
    if (planRevision > 1 || charterRevision > 1)
      throw new Error("missing state/revisions.md for revision history");
    return [];
  }
  if (!markdown.startsWith("# Revisions\n"))
    throw new Error("unsupported legacy document heading: Revisions");
  const entries = markdown
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .filter((line) => stripMarkdown(line.slice(2)) !== "None")
    .map((line) => {
      const match =
        /^- (\S+) — (Plan|Charter) revision `(\d+)`; approved by ([^;]+); (.+)$/.exec(
          line,
        );
      if (!match) throw new Error(`ambiguous revision entry: ${line}`);
      const kind = match[2].toLowerCase();
      const number = Number(match[3]);
      const what = stripMarkdown(match[5]).replace(/\.$/, "");
      return {
        ref: `${workRef}:revision:${kind}-${number}`,
        kind,
        number,
        timestamp: parseTimestamp(match[1]),
        what,
        why: what,
        approver: stripMarkdown(match[4]),
      };
    });
  for (const [kind, current] of [
    ["plan", planRevision],
    ["charter", charterRevision],
  ] as const) {
    const numbers = entries
      .filter((entry) => entry.kind === kind)
      .map((entry) => Number(entry.number));
    for (let number = 1; number <= current; number += 1)
      if (numbers.filter((candidate) => candidate === number).length !== 1)
        throw new Error(
          `legacy ${kind} revision ${number} is not proven exactly once`,
        );
    if (numbers.some((number) => number > current))
      throw new Error(
        `legacy ${kind} revision history exceeds current revision`,
      );
  }
  return entries;
}

function parseQuestions(
  markdown: string | undefined,
  workRef: string,
): RecordValue[] {
  if (!markdown) return [];
  if (!markdown.startsWith("# Unresolved\n"))
    throw new Error("unsupported legacy document heading: Unresolved");
  if (!hasLegacyContent(markdown.split("\n").slice(1).join("\n"))) return [];
  return tableRows(markdown, "Questions").map((row) => {
    const id = slug(stripMarkdown(row.ID ?? ""), "question ID");
    const resolvedAt = stripMarkdown(row["Resolved at"] ?? "");
    const answer = stripMarkdown(row.Answer ?? "");
    const resolved = !["", "—", "-"].includes(resolvedAt);
    if (resolved !== !["", "—", "-"].includes(answer))
      throw new Error(`question ${id} must pair resolvedAt and answer`);
    return {
      ref: `${workRef}:question:${id}`,
      text: stripMarkdown(row.Question ?? ""),
      owner: stripMarkdown(row.Owner ?? ""),
      waitingSince: parseTimestamp(stripMarkdown(row["Waiting since"] ?? "")),
      awaitingUser: stripMarkdown(row["Awaiting user"] ?? "") === "yes",
      ...(resolved ? { resolvedAt: parseTimestamp(resolvedAt), answer } : {}),
    };
  });
}

async function parseRecords(
  work: LegacyWork,
  workRef: string,
  taskIds: Set<string>,
  revision?: string,
): Promise<{ records: RecordValue[]; artifacts: LegacyArtifact[] }> {
  const records: RecordValue[] = [];
  const artifacts: LegacyArtifact[] = [];
  for (const kind of RECORD_KINDS) {
    const parsed = await parseRecordCollection(
      work,
      kind,
      workRef,
      taskIds,
      revision,
    );
    records.push(...parsed.records);
    artifacts.push(...parsed.artifacts);
  }
  return { records, artifacts };
}

async function parseRecordCollection(
  work: LegacyWork,
  kind: (typeof RECORD_KINDS)[number],
  workRef: string,
  taskIds: Set<string>,
  revision?: string,
): Promise<{ records: RecordValue[]; artifacts: LegacyArtifact[] }> {
  const plural =
    kind === "change" ? "changes" : kind === "design" ? "design" : `${kind}s`;
  const collectionPath = `${plural}.md`;
  const children = work.legacyFiles.filter(
    (path) => path.startsWith(`${plural}/`) && path.endsWith(".md"),
  );
  if (!work.legacyFiles.includes(collectionPath)) {
    if (children.length)
      throw new Error(`missing legacy record collection: ${collectionPath}`);
    return { records: [], artifacts: [] };
  }
  const collection = await readFile(join(work.workDir, collectionPath), "utf8");
  const seen = new Set<string>();
  const records: RecordValue[] = [];
  const artifacts: LegacyArtifact[] = [];
  for (const row of firstTableRows(collection, plural)) {
    const parsed = await parseRecordRow({
      work,
      kind,
      plural,
      row,
      seen,
      children,
      workRef,
      taskIds,
      revision,
    });
    records.push(parsed.record);
    artifacts.push(parsed.artifact);
  }
  const extras = children.filter((path) => !seen.has(path));
  if (extras.length)
    throw new Error(`unindexed legacy record children: ${extras.join(", ")}`);
  return { records, artifacts };
}

interface ParseRecordRowParams {
  work: LegacyWork;
  kind: (typeof RECORD_KINDS)[number];
  plural: string;
  row: Record<string, string>;
  seen: Set<string>;
  children: string[];
  workRef: string;
  taskIds: Set<string>;
  revision?: string;
}

async function parseRecordRow(
  params: ParseRecordRowParams,
): Promise<{ record: RecordValue; artifact: LegacyArtifact }> {
  const {
    work,
    kind,
    plural,
    row,
    seen,
    children,
    workRef,
    taskIds,
    revision,
  } = params;
  const expectedPath = canonicalRecordPath(row.Path, kind, plural, seen);
  if (!children.includes(expectedPath))
    throw new Error(`missing legacy record child: ${expectedPath}`);
  const bytes = await readFile(join(work.workDir, expectedPath));
  const values = metadata(new TextDecoder().decode(bytes));
  const status = stripMarkdown(row.Status ?? "");
  const headline = stripMarkdown(row.Headline ?? "");
  if (
    field(values, "Status") !== status ||
    field(values, "Headline") !== headline
  )
    throw new Error(
      `legacy ${kind} collection and child disagree: ${expectedPath}`,
    );
  const childSlug = basename(expectedPath, ".md");
  const targetPath = `artifacts/migrated-state-records/${kind}/${childSlug}.md`;
  const locator = {
    uri: targetPath,
    hash: sha256(bytes),
    ...(revision ? { revision } : {}),
  };
  const recordRef = `${workRef}:record:${kind}:${childSlug}`;
  return {
    record: recordFromLegacyValues({
      values,
      kind,
      status,
      headline,
      locator,
      recordRef,
      workRef,
      taskIds,
    }),
    artifact: { sourcePath: expectedPath, targetPath, bytes },
  };
}

function canonicalRecordPath(
  pathCell: string | undefined,
  kind: (typeof RECORD_KINDS)[number],
  plural: string,
  seen: Set<string>,
): string {
  const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(pathCell ?? "");
  if (!link || !safeRelativePath(link[2]))
    throw new Error(`noncanonical ${kind} record path: ${pathCell ?? ""}`);
  const expectedPath = link[2];
  const childSlug = slug(basename(expectedPath, ".md"), `${kind} slug`);
  if (expectedPath !== `${plural}/${childSlug}.md` || seen.has(expectedPath))
    throw new Error(`noncanonical ${kind} record path: ${expectedPath}`);
  seen.add(expectedPath);
  return expectedPath;
}

interface LegacyRecordParams {
  values: Map<string, string>;
  kind: (typeof RECORD_KINDS)[number];
  status: string;
  headline: string;
  locator: RecordValue;
  recordRef: string;
  workRef: string;
  taskIds: Set<string>;
}

function recordFromLegacyValues(params: LegacyRecordParams): RecordValue {
  const {
    values,
    kind,
    status,
    headline,
    locator,
    recordRef,
    workRef,
    taskIds,
  } = params;
  const relations = Object.fromEntries(
    (["affects", "invalidates", "preserves"] as const).map((relation) => [
      relation,
      recordRelationships(
        recordRef,
        relation,
        values.get(relation[0].toUpperCase() + relation.slice(1)),
        workRef,
        taskIds,
      ),
    ]),
  ) as Record<string, { refs: string[]; statements: RecordValue[] }>;
  return {
    ref: recordRef,
    kind,
    status,
    headline,
    owner: field(values, "Owner"),
    createdAt: parseTimestamp(field(values, "Created")),
    locator,
    targetRef: workRef,
    provenance: [locator],
    supersedes: relationshipRefs(
      values.get("Supersedes"),
      workRef,
      taskIds,
      "Supersedes",
    ),
    affects: relations.affects.refs,
    invalidates: relations.invalidates.refs,
    preserves: relations.preserves.refs,
    relationshipStatements: Object.values(relations).flatMap(
      (item) => item.statements,
    ),
    ...(values.get("Effective from")
      ? { effectiveFrom: parseTimestamp(field(values, "Effective from")) }
      : {}),
  };
}

async function parseReview(
  work: LegacyWork,
  workRef: string,
  tasks: RecordValue[],
): Promise<RecordValue | undefined> {
  if (!work.legacyFiles.includes("review.md")) {
    if (work.legacyFiles.some((path) => path.startsWith("reviews/")))
      throw new Error("missing legacy review collection: review.md");
    return undefined;
  }
  const collection = await readFile(join(work.workDir, "review.md"), "utf8");
  const rows = tableRows(collection, "Areas");
  const areas: RecordValue[] = [];
  const seen = new Set<string>();
  for (const row of rows)
    areas.push(await parseReviewArea(work, row, seen, workRef, tasks));
  if (
    REVIEW_AREAS.some((area) => !seen.has(area)) ||
    work.legacyFiles.some(
      (path) => path.startsWith("reviews/") && !seen.has(basename(path, ".md")),
    )
  )
    throw new Error(
      "legacy review must index every canonical area exactly once",
    );
  return { ref: `${workRef}:review`, areas };
}

async function parseReviewArea(
  work: LegacyWork,
  row: Record<string, string>,
  seen: Set<string>,
  workRef: string,
  tasks: RecordValue[],
): Promise<RecordValue> {
  const area = stripMarkdown(row.Area ?? "");
  if (!REVIEW_AREAS.includes(area as (typeof REVIEW_AREAS)[number]))
    throw new Error(`noncanonical review area: ${area}`);
  const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(row.Path ?? "");
  const expected = `reviews/${area}.md`;
  if (!link || link[2] !== expected || seen.has(area))
    throw new Error(`noncanonical review area path: ${row.Path ?? ""}`);
  seen.add(area);
  const bytes = await readFile(join(work.workDir, expected));
  const child = new TextDecoder().decode(bytes);
  const values = metadata(child);
  if (field(values, "Area") !== area)
    throw new Error(`review collection and child disagree: ${area}`);
  const reviewedTaskRefs = optionalList(field(values, "Reviewed tasks")).map(
    (id) => `${workRef}:task:${id}`,
  );
  const selected = reviewedTaskRefs.map((ref) => {
    const task = tasks.find((candidate) => candidate.ref === ref);
    if (!task) throw new Error(`unknown reviewed task: ${ref}`);
    return task;
  });
  const expectedHash = taskDefinitionHash(selected);
  if (field(values, "Task definition hash") !== expectedHash)
    throw new Error(`review task definition hash mismatch: ${area}`);
  return {
    ref: `${workRef}:review-area:${area}`,
    area,
    reviewedAt: parseTimestamp(field(values, "Reviewed at")),
    reviewedRevision: Number(field(values, "Reviewed revision")),
    reviewedTaskRefs,
    taskDefinitionHash: expectedHash,
    findings: parseReviewFindings(child, bytes, expected, area, workRef),
  };
}

function parseReviewFindings(
  child: string,
  bytes: Uint8Array,
  expected: string,
  area: string,
  workRef: string,
): RecordValue[] {
  return tableRows(child, "Findings").map((row) => {
    const id = slug(stripMarkdown(row.ID ?? ""), "finding ID");
    const evidenceSummary = stripMarkdown(row.Evidence ?? "");
    const evidence = ["", "—", "-"].includes(evidenceSummary)
      ? []
      : [
          {
            ref: `${workRef}:evidence:review-${area}-${id}`,
            summary: evidenceSummary,
            locator: { uri: expected, hash: sha256(bytes) },
            inputs: [{ uri: expected, hash: sha256(bytes) }],
          },
        ];
    const optional = (name: string): string | undefined => {
      const value = stripMarkdown(row[name] ?? "");
      return ["", "—", "-"].includes(value) ? undefined : value;
    };
    return {
      ref: `${workRef}:finding:${area}:${id}`,
      status: stripMarkdown(row.Status ?? ""),
      ...(optional("Severity") ? { severity: optional("Severity") } : {}),
      summary: stripMarkdown(row.Summary ?? ""),
      evidence,
      ...(optional("Rationale") ? { rationale: optional("Rationale") } : {}),
      ...(optional("Owner") ? { owner: optional("Owner") } : {}),
      ...(optional("Recheck") ? { recheckCondition: optional("Recheck") } : {}),
    };
  });
}

function parseSubmission(
  markdown: string,
  workRef: string,
): RecordValue | undefined {
  const content = optionalSection(markdown, "Submission");
  if (!content || !hasLegacyContent(content)) return undefined;
  const values = metadata(`# Submission\n${content}`);
  const kind = field(values, "Kind").toLowerCase();
  const pullRequests = tableRows(markdown, "Pull requests").map((row) => {
    const number = Number(stripMarkdown(row.Number ?? ""));
    if (!Number.isInteger(number) || number < 1)
      throw new Error("invalid legacy pull request number");
    const status = stripMarkdown(row.Status ?? "").toLowerCase();
    const mergedRevision = stripMarkdown(row["Merged revision"] ?? "");
    return {
      ref: `${workRef}:pr:${number}`,
      number,
      url: stripMarkdown(row.URL ?? ""),
      repository: stripMarkdown(row.Repository ?? ""),
      headRevision: stripMarkdown(row["Head revision"] ?? ""),
      status,
      ...(!["", "—", "-"].includes(mergedRevision) ? { mergedRevision } : {}),
    };
  });
  const deliverables = tableRows(markdown, "Deliverables").map((row) => {
    const id = slug(stripMarkdown(row.ID ?? ""), "deliverable ID");
    const revision = stripMarkdown(row.Revision ?? "");
    return {
      ref: `${workRef}:deliverable:${id}`,
      title: stripMarkdown(row.Title ?? ""),
      locator: {
        uri: stripMarkdown(row.URI ?? ""),
        ...(!["", "—", "-"].includes(revision) ? { revision } : {}),
      },
      reviewed: stripMarkdown(row.Reviewed ?? "") === "yes",
    };
  });
  const accepter = values.get("Accepter");
  return {
    ref: `${workRef}:submission`,
    kind,
    pullRequests,
    deliverables,
    ...(accepter && !["—", "-"].includes(stripMarkdown(accepter))
      ? { accepter: stripMarkdown(accepter) }
      : {}),
  };
}

function locatorFromRow(row: Record<string, string>): RecordValue {
  const revision = stripMarkdown(row.Revision ?? "");
  const hash = stripMarkdown(row.Hash ?? "");
  return {
    uri: stripMarkdown(row.URI ?? ""),
    ...(!["", "—", "-"].includes(revision) ? { revision } : {}),
    ...(!["", "—", "-"].includes(hash) ? { hash } : {}),
  };
}

function parseCompletion(
  markdown: string,
  workRef: string,
  stateHash: string,
): RecordValue | undefined {
  const content = optionalSection(markdown, "Completion receipt");
  if (!content || !hasLegacyContent(content)) return undefined;
  const values = metadata(`# Completion receipt\n${content}`);
  const completedAt = parseTimestamp(field(values, "Completed at"));
  const landing = completionLanding(
    markdown,
    values,
    workRef,
    stateHash,
    completedAt,
  );
  return {
    ref: `${workRef}:completion`,
    completedAt,
    landing,
    promotion: completionPromotion(
      markdown,
      values,
      workRef,
      stateHash,
      completedAt,
    ),
    outlives: completionOutlives(markdown, workRef),
    decisionDispositions: completionDecisionDispositions(markdown, workRef),
  };
}

function completionLanding(
  markdown: string,
  values: Map<string, string>,
  workRef: string,
  stateHash: string,
  completedAt: string,
): RecordValue[] {
  const landing = tableRows(markdown, "Landing evidence").map((row, index) => ({
    ref: `${workRef}:evidence:landing-${index + 1}`,
    summary: stripMarkdown(row.Summary ?? ""),
    locator: locatorFromRow(row),
    inputs: [locatorFromRow(row)],
    observedAt: completedAt,
  }));
  const merge = values.get("Merge evidence");
  if (!landing.length && merge)
    landing.push({
      ref: `${workRef}:evidence:landing-1`,
      summary: stripMarkdown(merge),
      locator: { uri: "state.md", hash: stateHash },
      inputs: [{ uri: "state.md", hash: stateHash }],
      observedAt: completedAt,
    });
  return landing;
}

function completionPromotion(
  markdown: string,
  values: Map<string, string>,
  workRef: string,
  stateHash: string,
  completedAt: string,
): RecordValue {
  const promotionMode = field(values, "Promotion").toLowerCase();
  const promotionPaths = tableRows(markdown, "Promotion paths").map(
    locatorFromRow,
  );
  if (promotionMode === "paths")
    return {
      ref: `${workRef}:promotion`,
      mode: "paths",
      paths: promotionPaths,
    };
  if (promotionMode === "not-required")
    return {
      ref: `${workRef}:promotion`,
      mode: "not-required",
      paths: [],
      evidence: {
        ref: `${workRef}:evidence:promotion-not-required`,
        summary: "Legacy completion receipt records promotion not required.",
        locator: { uri: "state.md", hash: stateHash },
        inputs: [{ uri: "state.md", hash: stateHash }],
        observedAt: completedAt,
      },
    };
  throw new Error(`invalid legacy promotion mode: ${promotionMode}`);
}

function completionOutlives(markdown: string, workRef: string): RecordValue[] {
  return tableRows(markdown, "Outlives").map((row) => {
    const id = slug(stripMarkdown(row.ID ?? ""), "outlives ID");
    return {
      ref: `${workRef}:outlives:${id}`,
      summary: stripMarkdown(row.Summary ?? ""),
      owner: stripMarkdown(row.Owner ?? ""),
      carrier: locatorFromRow(row),
    };
  });
}

function completionDecisionDispositions(
  markdown: string,
  workRef: string,
): RecordValue[] {
  return tableRows(markdown, "Decision dispositions").map((row) => {
    const id = slug(stripMarkdown(row.ID ?? ""), "decision disposition ID");
    return {
      ref: `${workRef}:decision-disposition:${id}`,
      decisionRef: `${workRef}:record:decision:${stripMarkdown(row.Decision ?? "")}`,
      kind: stripMarkdown(row.Kind ?? ""),
      carrier: locatorFromRow(row),
    };
  });
}

async function parseSupplemental(
  work: LegacyWork,
  projectRef: string,
  state: string,
  goal: string,
  tasks: RecordValue[],
): Promise<LegacySupplemental> {
  const workRef = `${projectRef}:work:${work.workId}`;
  const stateMeta = metadata(state);
  const goalMeta = metadata(goal);
  const revisionPath = work.legacyFiles.includes("state/revisions.md")
    ? join(work.workDir, "state/revisions.md")
    : undefined;
  const questionPath = work.legacyFiles.includes("state/unresolved.md")
    ? join(work.workDir, "state/unresolved.md")
    : undefined;
  const recordResult = await parseRecords(
    work,
    workRef,
    new Set(tasks.map((task) => String(task.id))),
    stateMeta.get("Written under"),
  );
  const supplemental: LegacySupplemental = {
    revisions: parseRevisions(
      revisionPath ? await readFile(revisionPath, "utf8") : undefined,
      workRef,
      integerField(stateMeta, "Plan revision"),
      integerField(goalMeta, "Charter revision"),
    ),
    questions: parseQuestions(
      questionPath ? await readFile(questionPath, "utf8") : undefined,
      workRef,
    ),
    records: recordResult.records,
    review: await parseReview(work, workRef, tasks),
    submission: parseSubmission(state, workRef),
    completion: parseCompletion(state, workRef, sha256(state)),
    documentations: [],
    artifacts: recordResult.artifacts,
  };
  const phase = stateMeta.get("Phase");
  if (
    ["reviewing", "completed", "archived"].includes(String(phase)) &&
    !supplemental.submission
  )
    throw new Error(
      `${phase} legacy stream requires a canonical Submission carrier`,
    );
  if (
    ["completed", "archived"].includes(String(phase)) &&
    !supplemental.completion
  )
    throw new Error(
      `${phase} legacy stream requires a canonical Completion receipt`,
    );
  return supplemental;
}

interface LegacyModelParams {
  projectRef: string;
  workId: string;
  state: string;
  goal: string;
  working: string;
  journal: string;
  now: string;
}

function legacyModel(params: LegacyModelParams): RecordValue {
  const { projectRef, workId, state, goal, working, journal, now } = params;
  const stateMeta = metadata(state);
  const goalMeta = metadata(goal);
  if (stateMeta.get("Work ID") !== workId || goalMeta.get("Work ID") !== workId)
    throw new Error(`work identity mismatch: ${workId}`);
  assertSupportedPrimaryDocuments(state, goal, stateMeta, goalMeta);
  const workRef = `${projectRef}:work:${workId}`;
  const successCriteria = legacySuccessCriteria(goal, workRef);
  const tasks = legacyTasks(state, stateMeta, goal, workRef, successCriteria);
  const events = legacyEvents(journal, workId, workRef);
  const stateRevision = integerField(stateMeta, "State revision");
  validateLegacyJournal(events, stateRevision, workId);
  return {
    schemaVersion: 1,
    kind: "stream",
    projectRef,
    environment: [],
    traps: [],
    stream: legacyStream({
      projectRef,
      workId,
      workRef,
      stateMeta,
      goalMeta,
      goal,
      working,
      now,
      stateRevision,
      successCriteria,
      tasks,
      events,
    }),
  };
}

function legacySuccessCriteria(goal: string, workRef: string): RecordValue[] {
  return table(goal, "Success criteria", [
    "ID",
    "Criterion",
    "Acceptance evidence",
  ]).map((row, index) => ({
    ref: `${workRef}:sc:${index + 1}`,
    id: stripMarkdown(row[0]),
    text: stripMarkdown(row[1]),
    expectedEvidence: stripMarkdown(row[2]),
  }));
}

function legacyTasks(
  state: string,
  stateMeta: Map<string, string>,
  goal: string,
  workRef: string,
  successCriteria: RecordValue[],
): RecordValue[] {
  return table(state, "Tasks", [
    "ID",
    "Mark",
    "Status",
    "Task",
    "Depends on",
    "Required",
    "Acceptance",
    "Owner",
    "Evidence / next action",
  ]).map((row) => legacyTask(row, stateMeta, goal, workRef, successCriteria));
}

function legacyTask(
  row: string[],
  stateMeta: Map<string, string>,
  goal: string,
  workRef: string,
  successCriteria: RecordValue[],
): RecordValue {
  const id = stripMarkdown(row[0]);
  const targetMatch = /\[targets:\s*([^\]]+)\]/.exec(row[3]);
  const summary = stripMarkdown(
    row[3].replace(/\s*\[targets:[^\]]+\]\s*$/, ""),
  );
  const acceptanceRefs = [
    ...new Set(
      (row[6].match(/SC-\d+/g) ?? []).map((id) => {
        const position = successCriteria.findIndex(
          (criterion) => criterion.id === id,
        );
        if (position < 0)
          throw new Error(`unknown acceptance criterion: ${id}`);
        return `${workRef}:sc:${position + 1}`;
      }),
    ),
  ];
  const evidenceSummary = stripMarkdown(row[8]);
  const owner = stripMarkdown(row[7]);
  return {
    ref: `${workRef}:task:${id}`,
    id,
    summary,
    targets: targetMatch ? identifiers(targetMatch[1]) : [],
    dependsOn: identifiers(row[4]).map(
      (dependency) => `${workRef}:task:${dependency}`,
    ),
    required: row[5] === "yes",
    acceptanceRefs,
    status: stripMarkdown(row[2]),
    ...(owner !== "—" && owner !== "-" ? { owner } : {}),
    evidence:
      evidenceSummary !== "—" && evidenceSummary !== "-"
        ? [
            {
              ref: `${workRef}:evidence:task-${id.toLowerCase()}`,
              summary: evidenceSummary,
              locator: {
                uri: `state.md#task-${id}`,
                revision: stateMeta.get("Written under") ?? "legacy",
              },
              inputs: [
                { uri: "state.md" },
                { uri: "goal.md" },
                { uri: "state/journal.md" },
              ],
            },
          ]
        : [],
  };
}

function legacyEvents(
  journal: string,
  workId: string,
  workRef: string,
): RecordValue[] {
  return journal
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line, index) => {
      const match =
        /^- (\S+) ([^@]+)@([^ ]+) rev:(\d+) (status|decision|revision|sync|sweep|lease) ([^:]+): (.+)$/.exec(
          line,
        );
      if (!match) throw new Error(`ambiguous journal event: ${line}`);
      return {
        ref: `${workRef}:event:${match[4]}-${index + 1}`,
        timestamp: parseTimestamp(match[1]),
        actor: match[2],
        capabilityId: match[3],
        eventType: match[5],
        stateRevision: Number(match[4]),
        subjectRef:
          match[6] === workId ? workRef : `${workRef}:task:${match[6]}`,
        summary: stripMarkdown(match[7]),
        evidenceRefs: [],
        invalidates: [],
      };
    });
}

function validateLegacyJournal(
  events: RecordValue[],
  stateRevision: number,
  workId: string,
): void {
  if (
    !events.length ||
    events.at(-1)?.stateRevision !== stateRevision ||
    events.some(
      (event, index) =>
        event.stateRevision > stateRevision ||
        (index > 0 &&
          event.stateRevision < (events[index - 1]?.stateRevision ?? 0)),
    )
  )
    throw new Error(
      `journal does not prove State revision ${stateRevision}: ${workId}`,
    );
}

interface LegacyStreamParams {
  projectRef: string;
  workId: string;
  workRef: string;
  stateMeta: Map<string, string>;
  goalMeta: Map<string, string>;
  goal: string;
  working: string;
  now: string;
  stateRevision: number;
  successCriteria: RecordValue[];
  tasks: RecordValue[];
  events: RecordValue[];
}

function legacyStream(params: LegacyStreamParams): RecordValue {
  const {
    projectRef,
    workId,
    workRef,
    stateMeta,
    goalMeta,
    now,
    stateRevision,
  } = params;
  return {
    ref: workRef,
    projectRef,
    workId,
    phase: stateMeta.get("Phase"),
    charterStatus: goalMeta.get("Charter"),
    charterRevision: integerField(goalMeta, "Charter revision"),
    planRevision: integerField(stateMeta, "Plan revision"),
    stateRevision: stateRevision + 1,
    writtenUnder: stateMeta.get("Written under"),
    repositoryRevision: stripMarkdown(
      stateMeta.get("Repository revision") ?? "",
    ).split(" ")[0],
    syncState: stateMeta.get("Sync state")?.replace(/\.$/, ""),
    reviewState: stateMeta.get("Review state")?.replace(/\.$/, ""),
    updatedAt: parseTimestamp(stateMeta.get("Updated") ?? now),
    charter: legacyCharter(params),
    tasks: params.tasks,
    continuation: legacyContinuation(params),
    events: [...params.events, migrationSweepEvent(params)],
    revisions: [],
    questions: [],
    records: [],
    documentations: [],
  };
}

function legacyCharter(params: LegacyStreamParams): RecordValue {
  const { workRef, goal, goalMeta, successCriteria } = params;
  return {
    ref: `${workRef}:charter`,
    revision: integerField(goalMeta, "Charter revision"),
    goal: proseSection(goal, "Goal"),
    requirements: statements(
      goal,
      "Requirements",
      `${workRef}:statement:requirement`,
    ),
    boundary: boundary(workRef, goal),
    successCriteria,
    specification: specificationProvenance(goal),
    anchors: anchors(workRef, goal),
  };
}

function legacyContinuation(params: LegacyStreamParams): RecordValue {
  const { workRef, working, stateMeta, tasks } = params;
  return {
    ref: `${workRef}:continuation`,
    focus: simpleDocumentProse(working, "Working"),
    handback: stripMarkdown(stateMeta.get("Next owner") ?? "Unassigned"),
    nextAction: stripMarkdown(
      stateMeta.get("Next action") ?? "Continue migration",
    ),
    taskRefs: tasks
      .filter((task) => task.status === "working")
      .map((task) => task.ref),
    fastPaths: [],
  };
}

function migrationSweepEvent(params: LegacyStreamParams): RecordValue {
  const { workRef, stateRevision, events, now } = params;
  return {
    ref: `${workRef}:event:${stateRevision + 1}-${events.length + 1}`,
    timestamp: now,
    actor: "Doctor",
    capabilityId: "essential:doctor",
    eventType: "sweep",
    stateRevision: stateRevision + 1,
    subjectRef: workRef,
    summary: "Migrated canonical Markdown state to essential.state/v1",
    evidenceRefs: [],
    invalidates: [],
  };
}

function encodeGraph(model: RecordValue): Map<string, string> {
  const stream = model.stream as RecordValue;
  const workRef = String(stream.ref);
  const files = new Map<string, string>();
  const sources = [
    graphSource(workRef, "goal.mdc", "charter"),
    graphSource(workRef, "state/working.mdc", "tasks"),
    graphSource(workRef, "state/journal.mdc", "events"),
    graphSource(workRef, "state/tasks.mdc", "tasks"),
  ];
  encodeSupportingDocuments(stream, workRef, files, sources);
  encodeSingletonDocuments(stream, workRef, files, sources);
  files.set("state.mdc", encodeStreamDocument(stream, workRef, sources));
  files.set("goal.mdc", encodeCharterDocument(stream, workRef));
  files.set("state/working.mdc", encodeContinuationDocument(stream, workRef));
  files.set(
    "state/tasks.mdc",
    encodeEntityListDocument(stream, workRef, "tasks"),
  );
  files.set(
    "state/journal.mdc",
    encodeEntityListDocument(stream, workRef, "events"),
  );
  return files;
}

function graphHeader(workRef: string, kind: string, ref: string): string {
  return `---\nschema: essential.state/v1\nkind: ${kind}\nref: ${ref}\nworkRef: ${workRef}\n---\n`;
}

function graphSource(workRef: string, name: string, kind: string): string {
  return `${annotation(
    "state.source",
    `${workRef}:source:${basename(name, ".mdc")}`,
    {
      href: name,
      documentKind: kind,
    },
  )}\n- ${name}\n`;
}

function encodeSupportingDocuments(
  stream: RecordValue,
  workRef: string,
  files: Map<string, string>,
  sources: string[],
): void {
  const supporting: Array<{
    field: string;
    path: string;
    kind: string;
    type: string;
  }> = [
    {
      field: "revisions",
      path: "state/revisions.mdc",
      kind: "revisions",
      type: "state.revision",
    },
    {
      field: "questions",
      path: "state/unresolved.mdc",
      kind: "questions",
      type: "state.question",
    },
    {
      field: "records",
      path: "records.mdc",
      kind: "records",
      type: "state.record",
    },
  ];
  for (const item of supporting) {
    const entities = stream[item.field] as RecordValue[];
    if (!entities.length) continue;
    sources.push(graphSource(workRef, item.path, item.kind));
    files.set(
      item.path,
      `${graphHeader(workRef, item.kind, `${workRef}:document:${item.kind}`)}${entities
        .map((entity) => encodeSupportingEntity(item.type, entity))
        .join("")}`,
    );
  }
}

function encodeSupportingEntity(type: string, entity: RecordValue): string {
  const fields = { ...entity };
  delete fields.ref;
  const visible = String(fields.what ?? fields.text ?? fields.headline);
  delete fields.what;
  delete fields.text;
  delete fields.headline;
  return `${annotation(type, String(entity.ref), fields)}\n- ${visible}\n`;
}

function encodeSingletonDocuments(
  stream: RecordValue,
  workRef: string,
  files: Map<string, string>,
  sources: string[],
): void {
  for (const item of [
    {
      field: "review",
      path: "review.mdc",
      kind: "review",
      type: "state.review",
      visible: "Review",
    },
    {
      field: "submission",
      path: "children/submission.mdc",
      kind: "submission",
      type: "state.submission",
      visible: "submission",
    },
    {
      field: "completion",
      path: "children/completion.mdc",
      kind: "completion",
      type: "state.completion",
      visible: String(
        (stream.completion as RecordValue | undefined)?.completedAt ??
          "completion",
      ),
    },
  ]) {
    const entity = stream[item.field] as RecordValue | undefined;
    if (!entity) continue;
    sources.push(graphSource(workRef, item.path, item.kind));
    const block =
      item.field === "review"
        ? reviewBlock(entity)
        : item.field === "submission"
          ? submissionBlock(entity)
          : completionBlock(entity);
    files.set(
      item.path,
      `${graphHeader(workRef, item.kind, `${workRef}:document:${item.kind}`)}${block}`,
    );
  }
}

function encodeStreamDocument(
  stream: RecordValue,
  workRef: string,
  sources: string[],
): string {
  const rootFields = { ...stream };
  delete rootFields.ref;
  for (const field of [
    "charter",
    "tasks",
    "continuation",
    "events",
    "revisions",
    "questions",
    "records",
    "review",
    "submission",
    "completion",
    "documentations",
  ])
    delete rootFields[field];
  return `---\nschema: essential.state/v1\nkind: stream\nref: ${workRef}\nworkId: ${stream.workId}\n---\n${semanticBlock(
    "state.stream",
    { ref: workRef, ...rootFields },
    String(stream.workId),
    (stream.documentations as RecordValue[]).map((documentation) => {
      const fields = { ...documentation };
      const title = String(fields.title);
      delete fields.title;
      return semanticBlock("state.documentation", fields, title, [], 1);
    }),
  )}${sources.join("")}`;
}

function encodeCharterDocument(stream: RecordValue, workRef: string): string {
  const charter = stream.charter as RecordValue;
  const charterFields = { ...charter };
  delete charterFields.ref;
  delete charterFields.goal;
  return `${graphHeader(workRef, "charter", `${workRef}:document:charter`)}${annotation("state.charter", String(charter.ref), charterFields)}\n- ${charter.goal}\n`;
}

function encodeContinuationDocument(
  stream: RecordValue,
  workRef: string,
): string {
  const continuation = stream.continuation as RecordValue;
  const continuationFields = { ...continuation };
  delete continuationFields.ref;
  delete continuationFields.focus;
  return `${graphHeader(workRef, "tasks", `${workRef}:document:tasks-continuation`)}${annotation("state.continuation", String(continuation.ref), continuationFields)}\n- ${continuation.focus}\n`;
}

function encodeEntityListDocument(
  stream: RecordValue,
  workRef: string,
  field: "tasks" | "events",
): string {
  const kind = field === "tasks" ? "tasks" : "events";
  const type = field === "tasks" ? "state.task" : "state.event";
  const body = (stream[field] as RecordValue[])
    .map((entity) => {
      const fields = { ...entity };
      delete fields.ref;
      delete fields.summary;
      return `${annotation(type, String(entity.ref), fields)}\n- ${entity.summary}\n`;
    })
    .join("");
  return `${graphHeader(workRef, kind, `${workRef}:document:${kind}`)}${body}`;
}

function listSection(markdown: string, heading: string): string[] {
  return section(markdown, heading)
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => stripMarkdown(line.slice(2)))
    .filter((line) => line !== "None");
}

function projectModel(
  overview: string,
  streamModels: RecordValue[],
  environmentMarkdown?: string,
  trapsMarkdown?: string,
): RecordValue {
  const values = metadata(overview);
  const ref = String((streamModels[0].stream as RecordValue).projectRef);
  return {
    schemaVersion: 1,
    kind: "project",
    project: legacyProjectIdentity(overview, values, ref),
    streams: sortedProjectStreams(streamModels),
    environment: legacyEnvironment(ref, environmentMarkdown),
    traps: legacyTraps(ref, trapsMarkdown),
  };
}

function legacyProjectIdentity(
  overview: string,
  values: Map<string, string>,
  ref: string,
): RecordValue {
  const slug = ref.slice("state:".length);
  return {
    ref,
    slug,
    title: slug,
    goal: proseSection(overview, "Goal"),
    requirements: listSection(overview, "Requirements").map((text, index) => ({
      ref: `${ref}:statement:requirement-${index + 1}`,
      text,
    })),
    specification: { state: "none", entries: [] },
    updatedAt: parseTimestamp(
      values.get("Updated") ?? new Date().toISOString(),
    ),
  };
}

function sortedProjectStreams(streamModels: RecordValue[]): RecordValue[] {
  return streamModels
    .map((model) => model.stream as RecordValue)
    .sort((left, right) => String(left.ref).localeCompare(String(right.ref)));
}

function legacyEnvironment(ref: string, markdown?: string): RecordValue[] {
  if (!markdown) return [];
  const hash = sha256(markdown);
  return table(markdown, "Claims", ["Claim", "Observed at"]).map(
    (row, index) => ({
      ref: `${ref}:environment:claim-${index + 1}`,
      statement: stripMarkdown(row[0]),
      observedAt: parseTimestamp(stripMarkdown(row[1])),
      evidence: [
        {
          ref: `${ref}:evidence:environment-${index + 1}`,
          summary: "Migrated from the legacy environment ledger.",
          locator: { uri: "environment.md", hash },
          inputs: [{ uri: "environment.md", hash }],
          observedAt: parseTimestamp(stripMarkdown(row[1])),
        },
      ],
    }),
  );
}

function legacyTraps(ref: string, markdown?: string): RecordValue[] {
  if (!markdown) return [];
  const hash = sha256(markdown);
  return table(markdown, "Traps", [
    "Symptom",
    "Cause",
    "Action",
    "Verified at",
  ]).map((row, index) => {
    const verifiedAt =
      row[3] && row[3] !== "-"
        ? parseTimestamp(stripMarkdown(row[3]))
        : undefined;
    return {
      ref: `${ref}:trap:trap-${index + 1}`,
      symptom: stripMarkdown(row[0]),
      cause: stripMarkdown(row[1]),
      action: stripMarkdown(row[2]),
      ...(verifiedAt ? { verifiedAt } : {}),
      evidence: [
        {
          ref: `${ref}:evidence:trap-${index + 1}`,
          summary: "Migrated from the legacy traps ledger.",
          locator: { uri: "traps.md", hash },
          inputs: [{ uri: "traps.md", hash }],
          ...(verifiedAt ? { observedAt: verifiedAt } : {}),
        },
      ],
    };
  });
}

function applyOverviewStreamCarriers(
  overview: string,
  streamModels: RecordValue[],
): RecordValue[] {
  return firstTableRows(section(overview, "Streams"), "Streams").reduce(
    (models, row) => {
      const workId = stripMarkdown(row["Work ID"] ?? "");
      const modelIndex = models
        .map((model) => model.stream as RecordValue)
        .findIndex((candidate) => candidate.workId === workId);
      if (modelIndex < 0) return models;
      const model = models[modelIndex];
      const stream = model.stream as RecordValue;
      const updatedStream = withOverviewStreamCarrier({ stream, row, workId });
      return models.map((candidate, index) =>
        index === modelIndex ? { ...model, stream: updatedStream } : candidate,
      );
    },
    streamModels,
  );
}

interface OverviewStreamCarrierParams {
  stream: RecordValue;
  row: Record<string, string>;
  workId: string;
}

function withOverviewStreamCarrier(
  params: OverviewStreamCarrierParams,
): RecordValue {
  const { stream, row, workId } = params;
  const documentationCell = row.Documentations ?? "—";
  const links = [...documentationCell.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
  const residue = stripMarkdown(
    documentationCell.replace(/\[([^\]]+)\]\(([^)]+)\)/g, ""),
  )
    .replace(/(?:<br\s*\/?\s*>|[,;])/gi, "")
    .trim();
  if (!["", "—", "-"].includes(residue))
    throw new Error(`ambiguous overview Documentations cell: ${workId}`);
  const documentations = links.map((match, index) => ({
    ref: `${stream.ref}:documentation:${index + 1}`,
    title: stripMarkdown(match[1]),
    locator: { uri: match[2] },
  }));
  const location = stripMarkdown(row.Location ?? "");
  return {
    ...stream,
    documentations,
    ...(!["", "—", "-"].includes(location)
      ? { location: { uri: location } }
      : {}),
  };
}

function validateProjectOverview(
  stateRoot: string,
  overview: string,
  works: LegacyWork[],
): void {
  if (listSection(overview, "Specifications").length)
    throw new Error(
      "unsupported project lifecycle carrier: specification provenance",
    );
  const overviewIds = tableRows(overview, "Streams").map((row) =>
    stripMarkdown(row["Work ID"] ?? ""),
  );
  const liveIds = works
    .filter((work) => relative(stateRoot, work.workDir).startsWith("works/"))
    .map((work) => work.workId)
    .sort();
  if (
    JSON.stringify([...new Set(overviewIds)].sort()) !== JSON.stringify(liveIds)
  )
    throw new Error("legacy overview stream inventory is ambiguous");
}

function encodeProject(
  model: RecordValue,
  streamPaths: Array<{ workId: string; path: string }>,
): Map<string, string> {
  const project = model.project as RecordValue;
  const ref = String(project.ref);
  const files = new Map<string, string>();
  files.set("environment.mdc", encodeEnvironmentDocument(model, ref));
  files.set("traps.mdc", encodeTrapsDocument(model, ref));
  files.set("overview.mdc", encodeOverviewDocument(project, ref, streamPaths));
  return files;
}

function encodeEnvironmentDocument(model: RecordValue, ref: string): string {
  const body = (model.environment as RecordValue[])
    .map((item) => {
      const fields = { ...item };
      delete fields.ref;
      delete fields.statement;
      return `${annotation("state.environmentClaim", String(item.ref), fields)}\n- ${item.statement}\n`;
    })
    .join("");
  return `---\nschema: essential.state/v1\nkind: environment\nref: ${ref}:document:environment\n---\n${body}`;
}

function encodeTrapsDocument(model: RecordValue, ref: string): string {
  const body = (model.traps as RecordValue[])
    .map((item) => {
      const fields = { ...item };
      delete fields.ref;
      delete fields.symptom;
      return `${annotation("state.trap", String(item.ref), fields)}\n- ${item.symptom}\n`;
    })
    .join("");
  return `---\nschema: essential.state/v1\nkind: traps\nref: ${ref}:document:traps\n---\n${body}`;
}

function encodeProjectSource(
  ref: string,
  id: string,
  href: string,
  documentKind: string,
): string {
  return `${annotation("state.source", `${ref}:source:${id}`, {
    href,
    documentKind,
  })}\n- ${href}\n`;
}

function encodeOverviewDocument(
  project: RecordValue,
  ref: string,
  streamPaths: Array<{ workId: string; path: string }>,
): string {
  const fields = { ...project };
  delete fields.ref;
  delete fields.title;
  const sources = [
    encodeProjectSource(ref, "environment", "environment.mdc", "environment"),
    encodeProjectSource(ref, "traps", "traps.mdc", "traps"),
    ...streamPaths.map(({ workId, path }) =>
      encodeProjectSource(ref, `stream-${workId}`, path, "stream"),
    ),
  ];
  return `---\nschema: essential.state/v1\nkind: project\nref: ${ref}\n---\n${annotation("state.project", ref, fields)}\n- ${project.title}\n${sources.join("")}`;
}

async function safeFiles(root: string, prefix = ""): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(join(root, prefix), {
    withFileTypes: true,
  })) {
    const path = join(prefix, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`symlink is not allowed: ${path}`);
    if (entry.isDirectory()) found.push(...(await safeFiles(root, path)));
    else if (entry.isFile()) found.push(path);
  }
  return found.sort();
}

function isNativeStateFile(path: string): boolean {
  return path === "lease.json" || path.startsWith("artifacts/");
}

async function legacyFiles(workDir: string): Promise<string[]> {
  const files = (await safeFiles(workDir)).filter(
    (path) => !isNativeStateFile(path) && !path.endsWith(".mdc"),
  );
  for (const required of REQUIRED_LEGACY_FILES)
    if (!files.includes(required))
      throw new Error(`missing legacy file: ${join(workDir, required)}`);
  const supported = (path: string): boolean =>
    REQUIRED_LEGACY_FILES.some((required) => required === path) ||
    [
      "state/revisions.md",
      "state/unresolved.md",
      "proposals.md",
      "changes.md",
      "decisions.md",
      "design.md",
      "review.md",
    ].includes(path) ||
    /^(proposals|changes|decisions|design|reviews)\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(
      path,
    );
  const unsupported = files.filter((path) => !supported(path));
  if (unsupported.length)
    throw new Error(
      `unsupported legacy lifecycle carrier: ${unsupported.join(", ")}`,
    );
  return files;
}

async function inventory(
  stateRoot: string,
  selected?: string[],
): Promise<LegacyWork[]> {
  if (selected && new Set(selected).size !== selected.length)
    throw new Error("selected work IDs must be unique");
  const roots = [join(stateRoot, "works"), join(stateRoot, "archive")];
  const allLegacy: LegacyWork[] = [];
  const mdcWorkIds: string[] = [];
  for (const root of roots) {
    for (const entry of await readdir(root, { withFileTypes: true }).catch(
      () => [],
    )) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const workDir = join(root, entry.name);
      const hasMarkdown = Boolean(
        await lstat(join(workDir, "state.md")).catch(() => undefined),
      );
      const hasMdc = Boolean(
        await lstat(join(workDir, "state.mdc")).catch(() => undefined),
      );
      if (hasMarkdown && hasMdc)
        throw new Error(`mixed state formats: ${workDir}`);
      if (hasMarkdown)
        allLegacy.push({
          workId: entry.name,
          workDir,
          legacyFiles: await legacyFiles(workDir),
        });
      if (hasMdc) mdcWorkIds.push(entry.name);
    }
  }
  allLegacy.sort((left, right) => left.workDir.localeCompare(right.workDir));
  const output = selected
    ? allLegacy.filter((item) => selected.includes(item.workId))
    : allLegacy;
  if (selected) {
    const missing = selected.filter(
      (id) => !output.some((item) => item.workId === id),
    );
    if (missing.length)
      throw new Error(`selected legacy work not found: ${missing.join(", ")}`);
  }
  const hasLegacyOverview = Boolean(
    await lstat(join(stateRoot, "overview.md")).catch(() => undefined),
  );
  const hasMdcOverview = Boolean(
    await lstat(join(stateRoot, "overview.mdc")).catch(() => undefined),
  );
  if (
    (hasLegacyOverview && mdcWorkIds.length) ||
    (hasMdcOverview && allLegacy.length) ||
    (!hasLegacyOverview &&
      !hasMdcOverview &&
      allLegacy.length > 0 &&
      mdcWorkIds.length > 0)
  )
    throw new Error("mixed project state formats are ambiguous");
  if (hasLegacyOverview && selected && output.length !== allLegacy.length)
    throw new Error(
      "selected migration cannot publish an incomplete project graph",
    );
  return output;
}

async function projectInventory(stateRoot: string): Promise<string[]> {
  const supported = new Set(["overview.md", "environment.md", "traps.md"]);
  const markdown = (
    await readdir(stateRoot, { withFileTypes: true }).catch(() => [])
  )
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
  const unsupported = markdown.filter((path) => !supported.has(path));
  if (unsupported.length)
    throw new Error(
      `unsupported project lifecycle carrier: ${unsupported.join(", ")}`,
    );
  if (!markdown.includes("overview.md") && markdown.length)
    throw new Error("environment.md or traps.md requires overview.md");
  return markdown;
}

function isPathWithin(root: string, candidate: string): boolean {
  const offset = relative(root, candidate);
  return offset === "" || (!offset.startsWith("..") && !isAbsolute(offset));
}

async function validateBackupDirectory(
  stateRoot: string,
  backupDir: string,
): Promise<string> {
  if (!isAbsolute(backupDir)) throw new Error("--backup-dir must be absolute");
  const resolvedBackup = resolve(backupDir);
  const resolvedState = resolve(stateRoot);
  const repositoryRoot =
    basename(resolvedState) === ".state"
      ? dirname(resolvedState)
      : resolvedState;
  if (isPathWithin(repositoryRoot, resolvedBackup))
    throw new Error("--backup-dir must be external to the repository");
  const info = await lstat(resolvedBackup).catch(() => undefined);
  if (info?.isSymbolicLink())
    throw new Error("--backup-dir must not be a symbolic link");
  if (!info?.isDirectory())
    throw new Error("--backup-dir must name an existing directory");
  const components = resolvedBackup.split("/").filter(Boolean);
  let current = "/";
  for (const component of components) {
    current = join(current, component);
    const componentInfo = await lstat(current);
    if (
      componentInfo.isSymbolicLink() &&
      !(dirname(current) === "/" && componentInfo.uid === 0)
    )
      throw new Error("--backup-dir must not be symlink-mediated");
  }
  await realpath(resolvedBackup);
  return resolvedBackup;
}

async function captureLegacySnapshot(
  stateRoot: string,
  works: LegacyWork[],
  projectFiles: string[],
): Promise<MigrationReceipt["entries"]> {
  const entries: MigrationReceipt["entries"] = [];
  for (const path of projectFiles) {
    const bytes = await readFile(join(stateRoot, path));
    entries.push({ path, sha256: sha256(bytes), size: bytes.byteLength });
  }
  for (const work of works)
    for (const path of work.legacyFiles) {
      const targetPath = relative(stateRoot, join(work.workDir, path));
      const bytes = await readFile(join(stateRoot, targetPath));
      entries.push({
        path: targetPath,
        sha256: sha256(bytes),
        size: bytes.byteLength,
      });
    }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function assertSnapshotParity(
  expected: MigrationReceipt["entries"],
  actual: MigrationReceipt["entries"],
): void {
  const normalize = (entries: MigrationReceipt["entries"]) =>
    [...entries].sort((left, right) => left.path.localeCompare(right.path));
  if (JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(expected)))
    throw new Error("legacy state changed after preflight parsing");
}

async function backup(
  stateRoot: string,
  backupDir: string,
  works: LegacyWork[],
  projectFiles: string[],
  now: string,
  createdPaths: string[],
): Promise<{ receipt: MigrationReceipt; path: string }> {
  const validatedBackupDir = await validateBackupDirectory(
    stateRoot,
    backupDir,
  );
  const backupRoot = join(
    validatedBackupDir,
    `essential-state-${now.replace(/[:.]/g, "-")}`,
  );
  await mkdir(backupRoot, { recursive: false });
  const entries: MigrationReceipt["entries"] = [];
  for (const path of projectFiles) {
    const source = join(stateRoot, path);
    const target = join(backupRoot, path);
    await mkdir(dirname(target), { recursive: true });
    const bytes = await readFile(source);
    await writeFile(target, bytes);
    entries.push({ path, sha256: sha256(bytes), size: bytes.byteLength });
  }
  for (const work of works) {
    for (const path of work.legacyFiles) {
      const source = join(work.workDir, path);
      const targetPath = relative(stateRoot, source);
      const target = join(backupRoot, targetPath);
      await mkdir(dirname(target), { recursive: true });
      const bytes = await readFile(source);
      await writeFile(target, bytes);
      entries.push({
        path: targetPath,
        sha256: sha256(bytes),
        size: bytes.byteLength,
      });
    }
  }
  const receipt: MigrationReceipt = {
    schema: "essential.state-migration-receipt/v1",
    createdAt: now,
    stateRoot,
    backupRoot,
    entries,
    migratedWorkIds: works.map((work) => work.workId),
    createdPaths,
  };
  const path = join(backupRoot, "migration-receipt.json");
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`);
  return { receipt, path };
}

const ESSENTIAL_SCRIPTS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../scripts",
);
const STATE_DOCTOR = join(
  dirname(fileURLToPath(import.meta.url)),
  "state-doctor",
);

function invoke(script: string, args: string[]): RecordValue {
  const command = spawnSync(join(ESSENTIAL_SCRIPTS, script), args, {
    encoding: "utf8",
  });
  const output = command.stdout.trim();
  let parsed: RecordValue;
  try {
    parsed = JSON.parse(output) as RecordValue;
  } catch {
    throw new Error(
      `${script} returned invalid JSON: ${command.stderr.trim()}`,
    );
  }
  if (command.status !== 0) throw new Error(`${script} failed: ${output}`);
  return parsed;
}

function invokeDoctor(stateRoot: string, strict = false): RecordValue {
  const command = spawnSync(
    STATE_DOCTOR,
    [
      "--repository-root",
      dirname(stateRoot),
      "--state-dir",
      stateRoot,
      "--json",
      ...(strict ? ["--strict"] : []),
    ],
    { encoding: "utf8" },
  );
  try {
    return JSON.parse(String(command.stdout ?? "").trim()) as RecordValue;
  } catch {
    throw new Error(
      `state-doctor returned invalid JSON: ${String(command.stderr ?? "").trim()}`,
    );
  }
}

async function assertCanonicalDoctor(
  stateRoot: string,
  options: MigrationOptions,
): Promise<void> {
  const repository = await mkdtemp(join(tmpdir(), "essential-state-doctor-"));
  const canonicalState = join(repository, ".state");
  try {
    for (const path of await safeFiles(stateRoot)) {
      if (!path.endsWith(".mdc")) continue;
      await atomicCopy(join(stateRoot, path), join(canonicalState, path));
    }
    if (options.failpoint === "doctor-invalid")
      await atomicWrite(join(canonicalState, "overview.mdc"), "invalid\n");
    const output = invokeDoctor(canonicalState, true);
    if (output.status !== "ok")
      throw new Error(
        `structural Doctor rejected staged canonical graph: ${JSON.stringify(output.findings ?? [])}`,
      );
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
}

function assertRestoredClassification(stateRoot: string): void {
  const output = invokeDoctor(stateRoot);
  if (output.status !== "migration_required")
    throw new Error(
      `structural Doctor rejected restored legacy graph: ${JSON.stringify(output.findings ?? [])}`,
    );
}

function acquireLease(workDir: string): string {
  const output = invoke("state-lease", [
    "acquire",
    "--work-dir",
    workDir,
    "--capability",
    "essential:doctor",
    "--session",
    `migration-${process.pid}`,
  ]);
  if (output.status !== "acquired" || typeof output.token !== "string")
    throw new Error(`could not acquire migration lease: ${workDir}`);
  return output.token;
}

function releaseLease(workDir: string, token: string): void {
  invoke("state-lease", ["release", "--work-dir", workDir, "--token", token]);
}

function fail(options: MigrationOptions, point: string): void {
  if (options.failpoint === point)
    throw new Error(`injected failure: ${point}`);
}

function failRestore(options: RestoreOptions, point: string): void {
  if (options.failpoint === point)
    throw new Error(`injected restore failure: ${point}`);
}

async function atomicWrite(
  target: string,
  value: Uint8Array | string,
): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const temporary = join(
    dirname(target),
    `.${basename(target)}.migration-${process.pid}-${crypto.randomUUID()}`,
  );
  try {
    await writeFile(temporary, value);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function atomicCopy(source: string, target: string): Promise<void> {
  await atomicWrite(target, await readFile(source));
}

function validateReceipt(receipt: MigrationReceipt): void {
  if (
    receipt.schema !== "essential.state-migration-receipt/v1" ||
    !isAbsolute(receipt.stateRoot) ||
    !isAbsolute(receipt.backupRoot)
  )
    throw new Error("invalid migration receipt");
  if (
    new Set(receipt.entries.map((entry) => entry.path)).size !==
    receipt.entries.length
  )
    throw new Error("migration receipt contains duplicate paths");
  if (new Set(receipt.migratedWorkIds).size !== receipt.migratedWorkIds.length)
    throw new Error("migration receipt contains duplicate work IDs");
  if (
    new Set(receipt.createdPaths ?? []).size !==
    (receipt.createdPaths ?? []).length
  )
    throw new Error("migration receipt contains duplicate created paths");
  for (const entry of receipt.entries) {
    if (!safeRelativePath(entry.path))
      throw new Error(`unsafe receipt path: ${entry.path}`);
    if (
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0
    )
      throw new Error(`invalid receipt entry metadata: ${entry.path}`);
  }
  for (const path of receipt.createdPaths ?? [])
    if (
      !safeRelativePath(path) ||
      !/^(works|archive)\/[^/]+\/artifacts\/migrated-state-records\//.test(path)
    )
      throw new Error(`unsafe created path: ${path}`);
}

function restoreApproval(receipt: MigrationReceipt): string {
  return sha256(JSON.stringify(canonical(receipt)));
}

async function stageBackup(
  receipt: MigrationReceipt,
): Promise<{ stageRoot: string; entries: Map<string, Uint8Array> }> {
  validateReceipt(receipt);
  await validateBackupDirectory(receipt.stateRoot, receipt.backupRoot);
  const stageRoot = await mkdtemp(join(tmpdir(), "essential-state-restore-"));
  const entries = new Map<string, Uint8Array>();
  try {
    for (const entry of receipt.entries) {
      const source = join(receipt.backupRoot, entry.path);
      const sourceInfo = await lstat(source).catch(() => undefined);
      if (!sourceInfo?.isFile() || sourceInfo.isSymbolicLink())
        throw new Error(`backup entry is not a regular file: ${entry.path}`);
      const bytes = await readFile(source);
      if (bytes.byteLength !== entry.size)
        throw new Error(`backup size mismatch: ${entry.path}`);
      if (sha256(bytes) !== entry.sha256)
        throw new Error(`backup hash mismatch: ${entry.path}`);
      entries.set(entry.path, bytes);
      await atomicWrite(join(stageRoot, entry.path), bytes);
    }
  } catch (error) {
    await rm(stageRoot, { recursive: true, force: true });
    throw error;
  }
  return { stageRoot, entries };
}

async function restorableGeneratedPaths(
  receipt: MigrationReceipt,
): Promise<string[]> {
  const paths = new Set<string>();
  for (const workId of receipt.migratedWorkIds) {
    for (const base of ["works", "archive"] as const) {
      const workDir = join(receipt.stateRoot, base, workId);
      if (!(await lstat(workDir).catch(() => undefined))) continue;
      for (const path of await safeFiles(workDir))
        if (path.endsWith(".mdc"))
          paths.add(relative(receipt.stateRoot, join(workDir, path)));
    }
  }
  for (const path of ["overview.mdc", "environment.mdc", "traps.mdc"])
    if (await lstat(join(receipt.stateRoot, path)).catch(() => undefined))
      paths.add(path);
  for (const path of receipt.createdPaths ?? [])
    if (await lstat(join(receipt.stateRoot, path)).catch(() => undefined))
      paths.add(path);
  return [...paths].sort();
}

async function snapshotTargets(
  stateRoot: string,
  paths: string[],
): Promise<Map<string, Uint8Array | undefined>> {
  const snapshot = new Map<string, Uint8Array | undefined>();
  for (const path of paths) {
    const target = join(stateRoot, path);
    const info = await lstat(target).catch(() => undefined);
    if (info?.isSymbolicLink())
      throw new Error(`restore target is a symbolic link: ${path}`);
    snapshot.set(path, info?.isFile() ? await readFile(target) : undefined);
  }
  return snapshot;
}

async function rollbackTargets(
  stateRoot: string,
  snapshot: Map<string, Uint8Array | undefined>,
): Promise<void> {
  for (const path of snapshot.keys())
    await rm(join(stateRoot, path), { force: true });
  for (const [path, bytes] of snapshot)
    if (bytes) await atomicWrite(join(stateRoot, path), bytes);
}

async function restoreBackup(
  receipt: MigrationReceipt,
  options: RestoreOptions = {},
): Promise<void> {
  const staged = await stageBackup(receipt);
  const generatedPaths = await restorableGeneratedPaths(receipt);
  const touchedPaths = [
    ...new Set([...staged.entries.keys(), ...generatedPaths]),
  ];
  const snapshot = await snapshotTargets(receipt.stateRoot, touchedPaths);
  const workRoots = receipt.entries
    .map(({ path }) => path)
    .filter((path) => /^(works|archive)\/[^/]+\/state\.md$/.test(path))
    .sort();
  const projectRoot = staged.entries.has("overview.md")
    ? "overview.md"
    : undefined;
  const roots = new Set([...workRoots, ...(projectRoot ? [projectRoot] : [])]);
  try {
    failRestore(options, "after-stage");
    for (const path of staged.entries.keys())
      if (!roots.has(path))
        await atomicCopy(
          join(staged.stageRoot, path),
          join(receipt.stateRoot, path),
        );
    failRestore(options, "after-children");
    for (let index = 0; index < workRoots.length; index++) {
      const path = workRoots[index];
      await atomicCopy(
        join(staged.stageRoot, path),
        join(receipt.stateRoot, path),
      );
      failRestore(options, `after-work-root-${index}`);
    }
    if (projectRoot) {
      failRestore(options, "before-project-root");
      await atomicCopy(
        join(staged.stageRoot, projectRoot),
        join(receipt.stateRoot, projectRoot),
      );
      failRestore(options, "after-project-root");
    }
    for (const path of generatedPaths)
      await rm(join(receipt.stateRoot, path), { force: true });
    failRestore(options, "after-mdc-removal");
    if (options.failpoint === "post-doctor-invalid") {
      const target =
        generatedPaths.find((path) => path === "overview.mdc") ??
        generatedPaths.find((path) => path.endsWith(".mdc"));
      if (!target) throw new Error("no canonical root available to corrupt");
      await atomicWrite(join(receipt.stateRoot, target), "invalid\n");
    }
    assertRestoredClassification(receipt.stateRoot);
  } catch (error) {
    try {
      await rollbackTargets(receipt.stateRoot, snapshot);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "restore failed and rollback could not reinstate the previous state",
      );
    }
    throw error;
  } finally {
    await rm(staged.stageRoot, { recursive: true, force: true });
  }
}

export async function migrateState(
  options: MigrationOptions,
): Promise<RecordValue> {
  const stateRoot = resolve(options.stateRoot);
  const now = (options.now ?? (() => new Date().toISOString()))();
  const works = await inventory(stateRoot, options.workIds);
  if (!works.length) return result("nothing_to_migrate", { inventory: [] });
  const preflight = await prepareMigrationPreflight({
    stateRoot,
    works,
    now,
  });
  if (!options.approved)
    return result("approval_required", { inventory: preflight.diagnosis });
  const stages = await prepareMigrationStages(preflight);
  return executeMigrationTransaction({ ...preflight, ...stages, options });
}

async function prepareMigrationPreflight(
  params: MigrationPreflightParams,
): Promise<MigrationPreflight> {
  const { stateRoot, works, now } = params;
  const projectFiles = await projectInventory(stateRoot);
  const snapshot = await captureLegacySnapshot(stateRoot, works, projectFiles);
  const projectRef = migrationProjectRef(stateRoot);
  const parsed = await works.reduce<Promise<ParsedLegacyWork[]>>(
    async (itemsPromise, work) => [
      ...(await itemsPromise),
      await parseLegacyWork({ work, projectRef, stateRoot, now }),
    ],
    Promise.resolve([]),
  );
  const hasOverview = projectFiles.includes("overview.md");
  const migrated = hasOverview
    ? await applyLegacyProjectOverview({ stateRoot, works, parsed })
    : parsed;
  assertSnapshotParity(
    snapshot,
    await captureLegacySnapshot(stateRoot, works, projectFiles),
  );
  const diagnosis = works.map(({ workId, workDir, legacyFiles }) => ({
    workId,
    workDir,
    legacyFiles,
  }));
  return {
    stateRoot,
    now,
    works,
    projectFiles,
    hasOverview,
    snapshot,
    parsed: migrated,
    diagnosis,
  };
}

function migrationProjectRef(stateRoot: string): string {
  const slug =
    basename(dirname(stateRoot))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project";
  return `state:${slug}`;
}

async function parseLegacyWork(
  params: ParseLegacyWorkParams,
): Promise<ParsedLegacyWork> {
  const { work, projectRef, stateRoot, now } = params;
  const state = await readFile(join(work.workDir, "state.md"), "utf8");
  const goal = await readFile(join(work.workDir, "goal.md"), "utf8");
  const model = legacyModel({
    projectRef,
    workId: work.workId,
    state,
    goal,
    working: await readFile(join(work.workDir, "state/working.md"), "utf8"),
    journal: await readFile(join(work.workDir, "state/journal.md"), "utf8"),
    now,
  });
  const stream = model.stream as RecordValue;
  const supplemental = await parseSupplemental(
    work,
    projectRef,
    state,
    goal,
    stream.tasks as RecordValue[],
  );
  const migratedStream = {
    ...withSupplementalState(stream, supplemental),
    ...(relative(stateRoot, work.workDir).startsWith("archive/")
      ? { phase: "archived" }
      : {}),
  };
  return {
    ...work,
    model: { ...model, stream: migratedStream },
    artifacts: supplemental.artifacts,
  };
}

function withSupplementalState(
  stream: RecordValue,
  supplemental: LegacySupplemental,
): RecordValue {
  return {
    ...stream,
    revisions: supplemental.revisions,
    questions: supplemental.questions,
    records: supplemental.records,
    ...(supplemental.review ? { review: supplemental.review } : {}),
    ...(supplemental.submission ? { submission: supplemental.submission } : {}),
    ...(supplemental.completion ? { completion: supplemental.completion } : {}),
    documentations: supplemental.documentations,
  };
}

async function applyLegacyProjectOverview(
  params: LegacyProjectOverviewParams,
): Promise<ParsedLegacyWork[]> {
  const { stateRoot, works, parsed } = params;
  const overview = await readFile(join(stateRoot, "overview.md"), "utf8");
  validateProjectOverview(stateRoot, overview, works);
  const models = applyOverviewStreamCarriers(
    overview,
    parsed.map((item) => item.model),
  );
  return parsed.map((item, index) => ({ ...item, model: models[index] }));
}

async function prepareMigrationStages(
  preflight: MigrationPreflight,
): Promise<MigrationStages> {
  const prepared: PreparedMigrationWork[] = [];
  // NOTE: this performance-critical, invocation-local accumulator avoids O(n²)
  // array copies while retaining completed stage roots for later I/O cleanup;
  // no caller-owned collection or work item is mutated.
  try {
    for (const work of preflight.parsed) {
      const item = await stageMigrationWork(preflight.stateRoot, work);
      prepared.push(item);
    }
    const project = preflight.hasOverview
      ? await stageProjectMigration(preflight, prepared)
      : {};
    return { prepared, ...project };
  } catch (error) {
    await cleanupMigrationStages(prepared, undefined);
    throw normalizeStagingError(error, "staged graph invalid");
  }
}

async function stageMigrationWork(
  stateRoot: string,
  work: ParsedLegacyWork,
): Promise<PreparedMigrationWork> {
  const stageRoot = await mkdtemp(join(tmpdir(), "essential-state-migration-"));
  const stage = join(stageRoot, ".state", relative(stateRoot, work.workDir));
  try {
    await mkdir(stage, { recursive: true });
    for (const [path, content] of encodeGraph(work.model)) {
      await mkdir(dirname(join(stage, path)), { recursive: true });
      await writeFile(join(stage, path), content);
    }
    await stageMigrationArtifacts(work, stage);
    const decoded = await decodeStateDashboard(join(stage, "state.mdc"));
    if (
      JSON.stringify(canonical(decoded)) !==
      JSON.stringify(canonical(work.model))
    )
      throw new Error(`semantic parity failed: ${work.workId}`);
    return { ...work, stage, stageRoot, token: "" };
  } catch (error) {
    await rm(stageRoot, { recursive: true, force: true });
    throw error;
  }
}

async function stageMigrationArtifacts(
  work: ParsedLegacyWork,
  stage: string,
): Promise<void> {
  for (const artifact of work.artifacts) {
    const target = join(stage, artifact.targetPath);
    const existing = await lstat(join(work.workDir, artifact.targetPath)).catch(
      () => undefined,
    );
    if (existing)
      throw new Error(
        `migrated record carrier collision: ${artifact.targetPath}`,
      );
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, artifact.bytes);
    const stagedBytes = await readFile(target);
    if (sha256(stagedBytes) !== sha256(artifact.bytes))
      throw new Error(
        `migrated record carrier parity failed: ${artifact.sourcePath}`,
      );
  }
}

async function stageProjectMigration(
  preflight: MigrationPreflight,
  prepared: PreparedMigrationWork[],
): Promise<Pick<MigrationStages, "projectStage" | "projectStageRoot">> {
  const projectStageRoot = await mkdtemp(
    join(tmpdir(), "essential-project-migration-"),
  );
  const projectStage = join(projectStageRoot, ".state");
  try {
    await mkdir(projectStage, { recursive: true });
    await copyPreparedWorkStages({
      stateRoot: preflight.stateRoot,
      prepared,
      projectStage,
    });
    const model = await legacyProjectModel(preflight);
    const sources = projectStreamSources(preflight.stateRoot, prepared);
    for (const [path, content] of encodeProject(model, sources))
      await writeFile(join(projectStage, path), content);
    const decoded = await decodeStateDashboard(
      join(projectStage, "overview.mdc"),
    );
    if (JSON.stringify(canonical(decoded)) !== JSON.stringify(canonical(model)))
      throw new Error("project semantic parity failed");
    return { projectStage, projectStageRoot };
  } catch (error) {
    await rm(projectStageRoot, { recursive: true, force: true });
    throw normalizeStagingError(error, "staged project graph invalid");
  }
}

async function copyPreparedWorkStages(
  params: CopyPreparedWorkStagesParams,
): Promise<void> {
  const { stateRoot, prepared, projectStage } = params;
  for (const item of prepared) {
    const target = join(projectStage, relative(stateRoot, item.workDir));
    await mkdir(dirname(target), { recursive: true });
    await cp(item.stage, target, { recursive: true });
  }
}

async function legacyProjectModel(
  preflight: MigrationPreflight,
): Promise<RecordValue> {
  return projectModel(
    await readFile(join(preflight.stateRoot, "overview.md"), "utf8"),
    preflight.parsed.map((item) => item.model),
    preflight.projectFiles.includes("environment.md")
      ? await readFile(join(preflight.stateRoot, "environment.md"), "utf8")
      : undefined,
    preflight.projectFiles.includes("traps.md")
      ? await readFile(join(preflight.stateRoot, "traps.md"), "utf8")
      : undefined,
  );
}

function projectStreamSources(
  stateRoot: string,
  prepared: PreparedMigrationWork[],
): Array<{ workId: string; path: string }> {
  return prepared.map((item) => ({
    workId: item.workId,
    path: `${relative(stateRoot, item.workDir)}/state.mdc`,
  }));
}

function normalizeStagingError(error: unknown, message: string): Error {
  return error instanceof StateValidationFailure
    ? new Error(`${message}: ${JSON.stringify(error.errors)}`, { cause: error })
    : (error as Error);
}

async function executeMigrationTransaction(
  execution: MigrationExecution,
): Promise<RecordValue> {
  let saved: { receipt: MigrationReceipt; path: string } | undefined;
  let transaction = execution;
  try {
    await applyPreLeaseFailpoint(execution.options, execution.works);
    transaction = {
      ...execution,
      prepared: acquireMigrationLeases(execution.prepared),
    };
    await verifyLeasedSnapshot(transaction);
    saved = await backupMigration(transaction);
    fail(execution.options, "after-backup");
    await publishMigrationGraph(transaction);
    await assertCanonicalDoctor(execution.stateRoot, execution.options);
    fail(execution.options, "before-legacy-removal");
    await removeLegacyState(execution);
    return result("migrated", {
      receipt: saved.path,
      inventory: execution.diagnosis,
    });
  } catch (error) {
    if (saved) await restoreBackup(saved.receipt);
    throw error;
  } finally {
    releaseMigrationLeases(transaction.prepared);
    await cleanupMigrationStages(
      execution.prepared,
      execution.projectStageRoot,
    );
  }
}

function acquireMigrationLeases(
  prepared: PreparedMigrationWork[],
): PreparedMigrationWork[] {
  let acquired: PreparedMigrationWork[] = [];
  try {
    for (const item of prepared)
      acquired = [...acquired, { ...item, token: acquireLease(item.workDir) }];
    return acquired;
  } catch (error) {
    releaseMigrationLeases(acquired);
    throw error;
  }
}

async function verifyLeasedSnapshot(
  execution: MigrationExecution,
): Promise<void> {
  const leasedWorks = await inventory(
    execution.stateRoot,
    execution.options.workIds,
  );
  const leasedProjectFiles = await projectInventory(execution.stateRoot);
  assertSnapshotParity(
    execution.snapshot,
    await captureLegacySnapshot(
      execution.stateRoot,
      leasedWorks,
      leasedProjectFiles,
    ),
  );
}

async function backupMigration(
  execution: MigrationExecution,
): Promise<{ receipt: MigrationReceipt; path: string }> {
  const createdPaths = execution.prepared.flatMap((item) =>
    item.artifacts.map((artifact) =>
      relative(execution.stateRoot, join(item.workDir, artifact.targetPath)),
    ),
  );
  const saved = await backup(
    execution.stateRoot,
    execution.options.backupDir,
    execution.works,
    execution.projectFiles,
    execution.now,
    createdPaths,
  );
  assertSnapshotParity(execution.snapshot, saved.receipt.entries);
  return saved;
}

async function publishMigrationGraph(
  execution: MigrationExecution,
): Promise<void> {
  if (execution.projectStage)
    for (const path of ["environment.mdc", "traps.mdc"])
      await atomicCopy(
        join(execution.projectStage, path),
        join(execution.stateRoot, path),
      );
  for (let index = 0; index < execution.prepared.length; index++)
    await publishMigrationWork({
      execution,
      item: execution.prepared[index],
      index,
    });
  if (execution.projectStage)
    await publishProjectRoot(execution, execution.projectStage);
}

async function publishMigrationWork(
  params: PublishMigrationWorkParams,
): Promise<void> {
  const { execution, item, index } = params;
  fail(execution.options, `before-write-${index}`);
  for (const artifact of item.artifacts)
    await atomicWrite(join(item.workDir, artifact.targetPath), artifact.bytes);
  const written = invoke("state-write", [
    "--work-dir",
    item.workDir,
    "--token",
    item.token,
    "--staged-dir",
    item.stage,
  ]);
  if (written.status !== "written")
    throw new Error(`state transaction failed: ${item.workId}`);
  await decodeStateDashboard(join(item.workDir, "state.mdc"));
  await verifyPublishedArtifacts(item);
  fail(execution.options, `after-write-${index}`);
}

async function verifyPublishedArtifacts(
  item: PreparedMigrationWork,
): Promise<void> {
  for (const artifact of item.artifacts) {
    const published = await readFile(join(item.workDir, artifact.targetPath));
    if (
      sha256(published) !== sha256(artifact.bytes) ||
      !published.equals(Buffer.from(artifact.bytes))
    )
      throw new Error(
        `published record carrier parity failed: ${artifact.sourcePath}`,
      );
  }
}

async function publishProjectRoot(
  execution: MigrationExecution,
  projectStage: string,
): Promise<void> {
  fail(execution.options, "before-project-root");
  await atomicCopy(
    join(projectStage, "overview.mdc"),
    join(execution.stateRoot, "overview.mdc"),
  );
  await decodeStateDashboard(join(execution.stateRoot, "overview.mdc"));
  fail(execution.options, "after-project-root");
}

async function removeLegacyState(execution: MigrationExecution): Promise<void> {
  for (const work of execution.works)
    for (const path of work.legacyFiles) await rm(join(work.workDir, path));
  for (const path of execution.projectFiles)
    await rm(join(execution.stateRoot, path));
}

async function applyPreLeaseFailpoint(
  options: MigrationOptions,
  works: Array<{ workDir: string }>,
): Promise<void> {
  if (options.failpoint === "mutate-before-lease") {
    const target = join(works[0].workDir, "state.md");
    const mutated = Buffer.from(await readFile(target));
    mutated[mutated.length - 1] ^= 1;
    await atomicWrite(target, mutated);
  }
  if (options.failpoint === "add-carrier-before-lease")
    await atomicWrite(
      join(works[0].workDir, "state/revisions.md"),
      "# Revisions\n\n- 2026-08-30T10:00:00Z — Charter revision `1`; approved by user; establishes the charter.\n- 2026-08-30T10:00:00Z — Plan revision `1`; approved by user; establishes the plan.\n",
    );
}

function releaseMigrationLeases(
  prepared: Array<{ workDir: string; token: string }>,
): void {
  for (const item of prepared)
    if (item.token) {
      try {
        releaseLease(item.workDir, item.token);
      } catch {
        /* rollback may have removed the acquired lease */
      }
    }
}

async function cleanupMigrationStages(
  prepared: Array<{ stageRoot: string }>,
  projectStageRoot: string | undefined,
): Promise<void> {
  await Promise.all(
    prepared.map((item) =>
      rm(item.stageRoot, { recursive: true, force: true }),
    ),
  );
  if (projectStageRoot)
    await rm(projectStageRoot, { recursive: true, force: true });
}

export async function restoreState(
  receiptPath: string,
  options: RestoreOptions = {},
): Promise<RecordValue> {
  const resolvedReceiptPath = resolve(receiptPath);
  const receiptInfo = await lstat(resolvedReceiptPath).catch(() => undefined);
  if (!receiptInfo?.isFile() || receiptInfo.isSymbolicLink())
    throw new Error("migration receipt must be a regular file");
  const receipt = JSON.parse(
    await readFile(resolvedReceiptPath, "utf8"),
  ) as MigrationReceipt;
  validateReceipt(receipt);
  const diagnosed = await stageBackup(receipt);
  await rm(diagnosed.stageRoot, { recursive: true, force: true });
  const requiredApproval = restoreApproval(receipt);
  if (!options.approval)
    return result("approval_required", {
      receipt: resolvedReceiptPath,
      approval: requiredApproval,
      inventory: receipt.entries,
    });
  if (options.approval !== requiredApproval)
    throw new Error("restore approval does not match diagnosed receipt");
  const targetDirs = receipt.migratedWorkIds.map((workId) => {
    const entry = receipt.entries.find(
      ({ path }) =>
        path.startsWith(`works/${workId}/`) ||
        path.startsWith(`archive/${workId}/`),
    );
    if (!entry) throw new Error(`receipt has no files for work: ${workId}`);
    return join(receipt.stateRoot, entry.path.split("/").slice(0, 2).join("/"));
  });
  const leases: Array<{ workDir: string; token: string }> = [];
  try {
    for (const workDir of targetDirs)
      leases.push({ workDir, token: acquireLease(workDir) });
    await restoreBackup(receipt, options);
  } finally {
    for (const lease of leases.reverse())
      try {
        releaseLease(lease.workDir, lease.token);
      } catch {
        /* restoration may have reinstated the pre-migration lease state */
      }
  }
  return result("restored", {
    stateRoot: receipt.stateRoot,
    workIds: receipt.migratedWorkIds,
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const restore = args
    .find((arg) => arg.startsWith("--restore-state="))
    ?.slice(16);
  try {
    const restoreApprovalArgument = args
      .find((arg) => arg.startsWith("--approve="))
      ?.slice(10);
    const output = restore
      ? await restoreState(restore, {
          approval: restoreApprovalArgument,
          failpoint: process.env.ESSENTIAL_STATE_RESTORE_FAILPOINT,
        })
      : await migrateState({
          stateRoot:
            args.find((arg) => arg.startsWith("--state-root="))?.slice(13) ??
            join(process.cwd(), ".state"),
          backupDir:
            args.find((arg) => arg.startsWith("--backup-dir="))?.slice(13) ??
            "",
          workIds: args.some((arg) => arg.startsWith("--work-id="))
            ? args
                .filter((arg) => arg.startsWith("--work-id="))
                .map((arg) => arg.slice(10))
            : undefined,
          approved: args.includes("--approve"),
          failpoint: process.env.ESSENTIAL_STATE_MIGRATION_FAILPOINT,
        });
    console.log(JSON.stringify(output));
  } catch (error) {
    const errors =
      error instanceof StateValidationFailure
        ? error.errors
        : [{ code: "migration.invalid", message: (error as Error).message }];
    console.log(JSON.stringify({ status: "invalid", errors }));
    process.exitCode = 2;
  }
}

if (import.meta.main) await main();
