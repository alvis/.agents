#!/usr/bin/env bun
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { decodeStateDashboard, StateValidationFailure } from "./state-codec";

const [workDirectoryArgument, stagedDirectoryArgument] = process.argv.slice(2);
if (!workDirectoryArgument || !stagedDirectoryArgument)
  throw new Error("usage: state-transaction.ts <work-dir> <staged-dir>");
const workDirectory = resolve(workDirectoryArgument);
const stagedDirectory = resolve(stagedDirectoryArgument);
const stagedRoot = join(stagedDirectory, "state.mdc");

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null,
      )
    : [];
}
function streamOf(document: Record<string, unknown>): Record<string, unknown> {
  const stream = document.stream;
  if (!stream || typeof stream !== "object")
    throw new Error("transaction root must be a stream document");
  return stream as Record<string, unknown>;
}

const TASK_DEFINITION_FIELDS = [
  "ref",
  "id",
  "parentRef",
  "summary",
  "targets",
  "dependsOn",
  "required",
  "acceptanceRefs",
] as const;

function project(
  value: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    fields
      .filter((field) => value[field] !== undefined)
      .map((field) => [field, value[field]]),
  );
}

function planDefinition(stream: Record<string, unknown>): string {
  const tasks = records(stream.tasks)
    .map((task) => project(task, TASK_DEFINITION_FIELDS))
    .sort((left, right) => String(left.ref).localeCompare(String(right.ref)));
  return JSON.stringify(tasks);
}

function charterDefinition(stream: Record<string, unknown>): string {
  const charter =
    stream.charter && typeof stream.charter === "object"
      ? (stream.charter as Record<string, unknown>)
      : undefined;
  return JSON.stringify(
    charter
      ? project(charter, [
          "ref",
          "goal",
          "requirements",
          "boundary",
          "successCriteria",
          "specification",
          "anchors",
        ])
      : undefined,
  );
}

function assertHistoryPrefix(
  name: string,
  previous: Record<string, unknown>[],
  next: Record<string, unknown>[],
): void {
  if (
    next.length < previous.length ||
    JSON.stringify(next.slice(0, previous.length)) !== JSON.stringify(previous)
  )
    throw new Error(`${name} must be append-only`);
}

const ACCEPTED_RECORD_IMMUTABLE_FIELDS = [
  "ref",
  "kind",
  "headline",
  "owner",
  "createdAt",
  "locator",
  "targetRef",
  "provenance",
  "originRef",
  "supersedes",
  "affects",
  "invalidates",
  "preserves",
  "relationshipStatements",
  "effectiveFrom",
] as const;

function assertAcceptedRecordsImmutable(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): void {
  const nextRecords = new Map(
    records(next.records).map((record) => [record.ref, record]),
  );
  for (const record of records(previous.records).filter(
    (candidate) => candidate.status === "accepted",
  )) {
    const successor = nextRecords.get(record.ref);
    if (successor === undefined)
      throw new Error(
        `accepted record cannot be removed: ${String(record.ref)}`,
      );
    if (
      JSON.stringify(project(record, ACCEPTED_RECORD_IMMUTABLE_FIELDS)) !==
      JSON.stringify(project(successor, ACCEPTED_RECORD_IMMUTABLE_FIELDS))
    )
      throw new Error(
        `accepted record body and causality are immutable: ${String(record.ref)}`,
      );
    if (!["accepted", "superseded"].includes(String(successor.status)))
      throw new Error(
        `accepted record status can only remain accepted or become superseded: ${String(record.ref)}`,
      );
  }
}

function assertRevisionAuthorization(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  kind: "plan" | "charter",
  definitionChanged: boolean,
): void {
  const counter = `${kind}Revision`;
  const changeLabel = kind === "plan" ? "definition" : "charter";
  const previousRevision = Number(previous[counter]);
  const nextRevision = Number(next[counter]);
  if (nextRevision < previousRevision || nextRevision > previousRevision + 1)
    throw new Error(
      `${counter} must remain unchanged or increase by exactly one`,
    );

  if (definitionChanged && nextRevision === previousRevision)
    throw new Error(`${changeLabel} change requires ${counter} to increase`);
  if (!definitionChanged && nextRevision !== previousRevision)
    throw new Error(
      `${counter} cannot increase without a ${changeLabel} change`,
    );
  if (!definitionChanged) return;

  const revisionRef = `${String(next.ref)}:revision:${kind}-${nextRevision}`;
  const addedRevisions = records(next.revisions)
    .slice(records(previous.revisions).length)
    .filter(
      (revision) => revision.kind === kind && revision.number === nextRevision,
    );
  if (
    addedRevisions.length !== 1 ||
    addedRevisions[0]?.ref !== revisionRef ||
    addedRevisions[0]?.kind !== kind ||
    addedRevisions[0]?.number !== nextRevision ||
    typeof addedRevisions[0]?.approver !== "string" ||
    addedRevisions[0].approver.length === 0
  )
    throw new Error(
      `${changeLabel} change requires exactly one matching approved ${kind} revision`,
    );

  const matchingEvents = records(next.events)
    .slice(records(previous.events).length)
    .filter(
      (event) =>
        event.eventType === "revision" &&
        event.subjectRef === revisionRef &&
        event.stateRevision === next.stateRevision &&
        Array.isArray(event.evidenceRefs) &&
        event.evidenceRefs.length > 0,
    );
  if (matchingEvents.length !== 1)
    throw new Error(
      `approved ${kind} revision requires one causal revision event with evidence`,
    );
}

function assertMonotonic(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): void {
  if (Number(next.stateRevision) !== Number(previous.stateRevision) + 1)
    throw new Error("stateRevision must increase by exactly one");
  const previousEvents = records(previous.events);
  const nextEvents = records(next.events);
  assertHistoryPrefix("journal events", previousEvents, nextEvents);
  const appendedEvents = nextEvents.slice(previousEvents.length);
  if (
    appendedEvents.length === 0 ||
    appendedEvents.some((event) => event.stateRevision !== next.stateRevision)
  )
    throw new Error(
      "each stateRevision increase requires an appended event at that revision",
    );
  assertHistoryPrefix(
    "revision history",
    records(previous.revisions),
    records(next.revisions),
  );
  const nextTasks = new Map(
    records(next.tasks).map((task) => [task.ref, task]),
  );
  for (const task of records(previous.tasks)) {
    if (!nextTasks.has(task.ref))
      throw new Error(`task ref cannot be removed: ${String(task.ref)}`);
    const nextTask = nextTasks.get(task.ref);
    if (task.status === "done") {
      if (nextTask?.status !== "done")
        throw new Error(`completed task cannot reopen: ${String(task.ref)}`);
      if (JSON.stringify(task.evidence) !== JSON.stringify(nextTask.evidence))
        throw new Error(
          `completed task evidence is immutable: ${String(task.ref)}`,
        );
    }
  }
  assertAcceptedRecordsImmutable(previous, next);
  assertRevisionAuthorization(
    previous,
    next,
    "plan",
    planDefinition(previous) !== planDefinition(next),
  );
  assertRevisionAuthorization(
    previous,
    next,
    "charter",
    charterDefinition(previous) !== charterDefinition(next),
  );
}
async function files(root: string, prefix = ""): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(join(root, prefix), {
    withFileTypes: true,
  })) {
    const path = join(prefix, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`staged graph contains symlink: ${path}`);
    if (entry.isDirectory()) output.push(...(await files(root, path)));
    else if (entry.isFile() && entry.name.endsWith(".mdc")) output.push(path);
  }
  return output;
}

try {
  const next = (await decodeStateDashboard(stagedRoot)) as Record<
    string,
    unknown
  >;
  const currentRoot = join(workDirectory, "state.mdc");
  try {
    const current = (await decodeStateDashboard(currentRoot)) as Record<
      string,
      unknown
    >;
    assertMonotonic(streamOf(current), streamOf(next));
  } catch (error) {
    const missingCurrentRoot =
      error instanceof StateValidationFailure &&
      error.errors.length === 1 &&
      error.errors[0]?.code === "graph.missing" &&
      resolve(error.errors[0].document) === currentRoot;
    if (
      !missingCurrentRoot &&
      (!(error instanceof StateValidationFailure) ||
        !error.errors.some(
          (item) =>
            item.code === "io.read" && resolve(item.document) === currentRoot,
        ))
    )
      throw error;
  }
  const paths = await files(stagedDirectory);
  paths.sort((left, right) =>
    left === "state.mdc"
      ? 1
      : right === "state.mdc"
        ? -1
        : left.localeCompare(right),
  );
  const backup = await mkdtemp(join(tmpdir(), "essential-state-backup-"));
  const applied: string[] = [];
  try {
    for (const path of paths) {
      const target = join(workDirectory, path);
      const existing = await lstat(target).catch(() => undefined);
      if (existing?.isSymbolicLink())
        throw new Error(`target is a symlink: ${path}`);
      if (existing) {
        await mkdir(dirname(join(backup, path)), { recursive: true });
        await cp(target, join(backup, path));
      }
      await mkdir(dirname(target), { recursive: true });
      const temporary = `${target}.state-write-${process.pid}`;
      await cp(join(stagedDirectory, path), temporary);
      await rename(temporary, target);
      applied.push(path);
    }
  } catch (error) {
    for (const path of applied.reverse()) {
      const saved = join(backup, path);
      if (await lstat(saved).catch(() => undefined))
        await cp(saved, join(workDirectory, path));
      else await rm(join(workDirectory, path), { force: true });
    }
    throw error;
  } finally {
    await rm(backup, { recursive: true, force: true });
  }
  console.log(
    JSON.stringify({ status: "written", root: currentRoot, files: paths }),
  );
} catch (error) {
  const errors =
    error instanceof StateValidationFailure
      ? error.errors
      : [{ code: "transaction.invalid", message: (error as Error).message }];
  console.log(JSON.stringify({ status: "invalid", errors }));
  process.exit(2);
}
