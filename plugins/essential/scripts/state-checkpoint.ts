#!/usr/bin/env bun
/**
 * records owned material work and its journal/table checkpoint for Stop recovery
 * keeps ownership explicit; reads and failed/no-op actions create no obligation
 */
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

type Action = "track" | "dirty" | "complete" | "record-write" | "turn" | "stop";
interface Checkpoint {
  generation: number;
  files?: Record<string, string>;
  overview_row_sha256?: string;
}
interface WorkRecord {
  schema: typeof SCHEMA;
  work_id: string;
  session_id: string;
  owner_session: string;
  lease_token_sha256: string;
  generation: number;
  checkpoint: Checkpoint;
  targets: string[];
  episode?: string;
  reason?: string;
  last_event?: string;
  journal_before?: string;
}
interface Lease {
  ownerSession: string;
  tokenHash: string;
}
interface CheckpointParams {
  ttlSeconds?: string;
  files: string[];
  prompt: string;
  work?: string;
  token?: string;
  session?: string;
  reason?: string;
  eventId?: string;
  generation?: number;
  target?: string;
  previousHash?: string;
}

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCHEMA = "state-checkpoint/v1";

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    console.error(usage());
    return;
  }
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "work-dir": { type: "string" },
      token: { type: "string" },
      ttl: { type: "string" },
      session: { type: "string" },
      reason: { type: "string" },
      "event-id": { type: "string" },
      generation: { type: "string" },
      file: { type: "string", multiple: true },
      target: { type: "string" },
      "previous-hash": { type: "string" },
      prompt: { type: "string" },
    },
  });
  const action = positionals[0];
  if (positionals.length !== 1 || !isAction(action)) {
    throw new Error(usage());
  }
  if (
    values.generation !== undefined &&
    !/^(0|[1-9][0-9]*)$/.test(values.generation)
  ) {
    throw new Error("generation must be a nonnegative integer");
  }
  const options: CheckpointParams = {
    work: values["work-dir"],
    token: values.token,
    ttlSeconds: values.ttl,
    session: values.session,
    reason: values.reason,
    eventId: values["event-id"],
    generation:
      values.generation === undefined ? undefined : Number(values.generation),
    files: values.file ?? [],
    target: values.target,
    previousHash: values["previous-hash"],
    prompt: values.prompt ?? join(ROOT, "hooks", "STOP.md"),
  };
  if (action === "stop" || action === "turn") runHookAction(action, options);
  else console.log(JSON.stringify(runOwnerAction(action, options)));
}

function usage(): string {
  return `usage: state-checkpoint.ts <action> [options]

owner actions:
  track | dirty | complete

internal actions:
  record-write | turn | stop

See directions/checkpoint.md for action-specific arguments.`;
}

function runOwnerAction(action: Action, options: CheckpointParams): object {
  const suppliedWork = requireString(options.work, "--work-dir");
  requireRegularFile(join(suppliedWork, "lease.json"));
  const work = realpathSync(suppliedWork);
  const token = requireString(options.token, "--token");
  const lease = readHeldLease(work, token);
  let session = options.session;
  if (action === "record-write") {
    const target = requireString(options.target, "--target");
    if (
      target.startsWith("artifacts/") ||
      target.startsWith("state/checkpoints/") ||
      target === "lease.json"
    ) {
      return { status: "not_material" };
    }
    const folder = join(work, "state", "checkpoints");
    rejectSymlinks(folder);
    const records = existsSync(folder)
      ? readdirSync(folder)
          .filter((p) => p.endsWith(".json"))
          .map((p) =>
            loadRecord(
              work,
              readStringField(readObject(join(folder, p)), "session_id"),
            ),
          )
          .filter(
            (record): record is WorkRecord =>
              record !== undefined &&
              record.owner_session === lease.ownerSession &&
              record.lease_token_sha256 === lease.tokenHash,
          )
      : [];
    if (records.length === 0) return { status: "untracked" };
    if (records.length !== 1)
      throw new Error("one runtime session must own this lease's checkpoint");
    session = records[0].session_id;
  }
  const runtimeSession = requireString(session, "--session");
  let record = loadRecord(work, runtimeSession);
  if (action === "track") {
    // reacquisition preserves pending work and monotonically increasing generations.
    record ??= {
      schema: SCHEMA,
      work_id: work.split(sep).at(-1)!,
      session_id: runtimeSession,
      owner_session: lease.ownerSession,
      lease_token_sha256: lease.tokenHash,
      generation: 0,
      checkpoint: { generation: 0 },
      targets: [],
    };
    record.owner_session = lease.ownerSession;
    record.lease_token_sha256 = lease.tokenHash;
  } else if (!record || record.lease_token_sha256 !== lease.tokenHash) {
    throw new Error(
      "register this runtime session with track before recording work",
    );
  } else if (action === "dirty" || action === "record-write") {
    if (action === "dirty")
      record = markDirty(work, record, {
        reason: requireString(options.reason, "--reason"),
        eventId: options.eventId,
      });
    else {
      const target = requireString(options.target, "--target");
      resolveWorkPath(work, target);
      record = markDirty(work, record, {
        reason: `canonical state changed: ${target}`,
        target,
      });
      // a journal write may itself be the first material action in an idle turn.
      if (
        target === relative(work, resolveJournalPath(work)) &&
        record.generation === record.checkpoint.generation + 1
      ) {
        record.journal_before = options.previousHash || undefined;
      }
    }
  } else if (action === "complete") {
    if (record.generation !== options.generation) {
      throw new Error(
        "material work advanced after the requested checkpoint generation",
      );
    }
    if (record.generation === record.checkpoint.generation)
      return { status: "current", generation: record.generation };
    const journal = relative(work, resolveJournalPath(work));
    const targets = [
      ...new Set([
        "state/journal.md",
        journal,
        "state.md",
        ...record.targets,
        ...options.files,
      ]),
    ].sort();
    const hashes: Record<string, string> = {};
    for (const target of targets) {
      hashes[target] = requireString(
        readFileHash(resolveWorkPath(work, target)),
        `checkpoint file ${target}`,
      );
    }
    if (hashes[journal] === record.journal_before) {
      throw new Error(
        "append the material event to the journal before completing its checkpoint",
      );
    }
    const overview = readFileSync(
      requireRegularFile(join(work, "..", "..", "overview.md")),
      "utf8",
    );
    const rows = readOverviewRows(overview, record.work_id);
    if (rows.length !== 1)
      throw new Error(
        "refresh the owned stream's unique overview row before completing",
      );
    record.checkpoint = {
      generation: record.generation,
      files: hashes,
      overview_row_sha256: hashBytes(rows[0]),
    };
  }
  saveRecord(work, token, record, options.ttlSeconds);
  return {
    status:
      record.generation === record.checkpoint.generation
        ? "current"
        : "pending",
    generation: record.generation,
    work_id: record.work_id,
  };
}

function runHookAction(
  action: "stop" | "turn",
  options: CheckpointParams,
): void {
  let event: Record<string, unknown>;
  try {
    event = parseObject(JSON.parse(readFileSync(0, "utf8")));
  } catch {
    return;
  }
  const session = event.session_id ?? event.sessionId;
  if (typeof session !== "string" || !session) return;
  const turnPath = resolveMarkerPath(session, ".turn");
  if (action === "turn") {
    // prompt boundaries are disposable suppression data, never work-state writes.
    requireRegularFile(turnPath);
    const staging = mkdtempSync(
      join(realpathSync(tmpdir()), "essential-state-turn-"),
    );
    try {
      writeFileSync(join(staging, "turn"), randomUUID(), { mode: 0o600 });
      renameSync(join(staging, "turn"), turnPath);
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
    return;
  }
  if ((event.stop_hook_active ?? event.stopHookActive) === true) return;
  const cwd = event.cwd ?? process.cwd();
  if (typeof cwd !== "string") return;
  const result = spawnSync(
    join(ROOT, "scripts", "resolve-state-workspace"),
    ["--path", cwd],
    { encoding: "utf8" },
  );
  let stateRoot: unknown;
  try {
    stateRoot = parseObject(JSON.parse(result.stdout)).state_root;
  } catch {
    return;
  }
  if (typeof stateRoot !== "string" || !stateRoot) return;
  const works = join(stateRoot, ".state", "works");
  rejectSymlinks(works);
  const pending: WorkRecord[] = [];
  for (const entry of existsSync(works)
    ? readdirSync(works, { withFileTypes: true })
    : []) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const record = loadRecord(join(works, entry.name), session);
    if (record && record.generation > record.checkpoint.generation)
      pending.push(record);
  }
  if (!pending.length) return;
  let turn = event.turn_id ?? event.turnId;
  if (typeof turn !== "string" || !turn)
    turn = existsSync(turnPath)
      ? readFileSync(requireRegularFile(turnPath), "utf8")
      : "";
  if (!turn) {
    // without a turn signal, repair writes remain in the same pending episode.
    turn = JSON.stringify(
      pending.map((record) => [record.work_id, record.episode]).sort(),
    );
  }
  const flag = resolveMarkerPath(
    session,
    `.reminded-${hashBytes(String(turn))}`,
  );
  if (existsSync(requireRegularFile(flag))) return;
  const prompt = readFileSync(options.prompt, "utf8").replaceAll(
    "{{PLUGIN_DIR}}",
    ROOT,
  );
  const names = pending
    .map((record) => `${record.work_id} (generation ${record.generation})`)
    .join(", ");
  // synchronous output completes before consuming the one repair request.
  writeFileSync(
    1,
    `${JSON.stringify({ decision: "block", reason: `Unfinished owned checkpoint: ${names}. ${prompt}` })}\n`,
  );
  if (!existsSync(flag)) closeSync(openSync(flag, "wx", 0o600));
}

function markDirty(
  work: string,
  record: WorkRecord,
  change: { reason: string; eventId?: string; target?: string },
): WorkRecord {
  if (change.eventId && record.last_event === change.eventId) return record;
  const isCurrent = record.generation === record.checkpoint.generation;
  const targets = isCurrent ? [] : record.targets;
  return {
    ...record,
    generation: record.generation + 1,
    episode: isCurrent ? randomUUID() : record.episode,
    journal_before: isCurrent
      ? readFileHash(resolveJournalPath(work))
      : record.journal_before,
    targets:
      change.target && !targets.includes(change.target)
        ? [...targets, change.target]
        : targets,
    reason: change.reason,
    last_event: change.eventId,
  };
}

function readHeldLease(work: string, token: string): Lease {
  const data = readObject(join(work, "lease.json"));
  if (
    typeof data.expires_at_epoch !== "number" ||
    data.expires_at_epoch <= Date.now() / 1000
  ) {
    throw new Error("checkpoint write requires a live lease");
  }
  if (data.token_sha256 !== hashBytes(token))
    throw new Error("checkpoint write requires the lease token");
  return {
    ownerSession: readStringField(data, "owner_session"),
    tokenHash: readStringField(data, "token_sha256"),
  };
}

function loadRecord(work: string, session: string): WorkRecord | undefined {
  const path = resolveRecordPath(work, session);
  if (!existsSync(requireRegularFile(path))) return undefined;
  const data = readObject(path);
  const checkpoint = parseObject(data.checkpoint);
  const generation = parseGeneration(data.generation);
  const completedGeneration = parseGeneration(checkpoint.generation);
  if (
    data.schema !== SCHEMA ||
    data.session_id !== session ||
    data.work_id !== work.split(sep).at(-1) ||
    completedGeneration > generation ||
    !Array.isArray(data.targets) ||
    !data.targets.every((target) => typeof target === "string")
  ) {
    throw new Error(`invalid checkpoint record: ${path}`);
  }
  const files =
    checkpoint.files === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(parseObject(checkpoint.files)).map(([key, value]) => [
            key,
            requireString(
              typeof value === "string" ? value : undefined,
              `checkpoint hash ${key}`,
            ),
          ]),
        );
  return {
    schema: SCHEMA,
    session_id: session,
    work_id: readStringField(data, "work_id"),
    owner_session: readStringField(data, "owner_session"),
    lease_token_sha256: readStringField(data, "lease_token_sha256"),
    generation,
    checkpoint: {
      generation: completedGeneration,
      files,
      overview_row_sha256: parseOptionalString(checkpoint.overview_row_sha256),
    },
    targets: data.targets,
    episode:
      generation > completedGeneration
        ? readStringField(data, "episode")
        : parseOptionalString(data.episode),
    reason: parseOptionalString(data.reason),
    last_event: parseOptionalString(data.last_event),
    journal_before: parseOptionalString(data.journal_before),
  };
}

function saveRecord(
  work: string,
  token: string,
  record: WorkRecord,
  ttlSeconds?: string,
): void {
  const result = spawnSync(
    join(ROOT, "scripts", "state-write"),
    [
      "--work-dir",
      work,
      "--token",
      token,
      "--target",
      relative(work, resolveRecordPath(work, record.session_id)),
      ...(ttlSeconds === undefined ? [] : ["--ttl", ttlSeconds]),
    ],
    { input: `${JSON.stringify(record)}\n`, encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(
      `checkpoint write failed: ${result.stderr || result.stdout}`,
    );
}

function resolveJournalPath(work: string): string {
  const state = join(work, "state");
  rejectSymlinks(state);
  const segments = (existsSync(state) ? readdirSync(state) : [])
    .filter((name) => name.endsWith(".md") && /^\d+-journal[-.]/i.test(name))
    .sort(
      (left, right) =>
        parseInt(left, 10) - parseInt(right, 10) || left.localeCompare(right),
    );
  return resolveWorkPath(work, `state/${segments.at(-1) ?? "journal.md"}`);
}

function readOverviewRows(text: string, workId: string): string[] {
  const rows: string[] = [];
  let fence = "";
  let isStreams = false;
  let sections = 0;
  // follow the overview contract's visible Streams table, excluding examples
  for (const line of text.replace(/<!--[\s\S]*?(?:-->|$)/g, "").split("\n")) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (marker?.[0] === fence[0] && marker.length >= fence.length) fence = "";
      continue;
    }
    if (marker) {
      fence = marker;
      continue;
    }
    if (/^( {4}|\t|\s*>)/.test(line)) continue;
    const heading = /^ {0,3}##\s+(.+?)(?:\s+#+)?\s*$/.exec(line)?.[1];
    if (heading) {
      isStreams = heading.toLowerCase() === "streams";
      if (isStreams) sections += 1;
      continue;
    }
    if (
      isStreams &&
      /^\s*\|/.test(line) &&
      line
        .split("|")[1]
        ?.trim()
        .replace(/^`+|`+$/g, "") === workId
    )
      rows.push(line);
  }
  if (sections !== 1)
    throw new Error("overview requires one visible Streams section");
  return rows;
}

function resolveWorkPath(work: string, target: string): string {
  if (
    isAbsolute(target) ||
    target.split(/[\\/]/).some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("checkpoint target must be a work-relative file");
  }
  return requireRegularFile(join(work, target));
}
function resolveRecordPath(work: string, session: string): string {
  return join(work, "state", "checkpoints", `${hashBytes(session)}.json`);
}
function resolveMarkerPath(session: string, suffix: string): string {
  return join(
    realpathSync(tmpdir()),
    `essential-state-stop-${hashBytes(session)}${suffix}`,
  );
}
function hashBytes(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
function readFileHash(path: string): string | undefined {
  return existsSync(requireRegularFile(path))
    ? hashBytes(readFileSync(path))
    : undefined;
}
function rejectSymlinks(path: string): void {
  let current = resolve(path);
  while (true) {
    if (lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new Error(`symlink in checkpoint path: ${current}`);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function requireRegularFile(path: string): string {
  rejectSymlinks(path);
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat && !stat.isFile()) throw new Error(`not a regular file: ${path}`);
  return path;
}
function readObject(path: string): Record<string, unknown> {
  return parseObject(
    JSON.parse(readFileSync(requireRegularFile(path), "utf8")),
  );
}
function parseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("expected a checkpoint object");
  return value as Record<string, unknown>;
}
function parseGeneration(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("invalid checkpoint generation");
  return value;
}
function parseOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
function readStringField(value: Record<string, unknown>, key: string): string {
  return requireString(parseOptionalString(value[key]), key);
}
function requireString(value: string | undefined, label: string): string {
  if (!value) throw new Error(`missing ${label}`);
  return value;
}
function isAction(value: string | undefined): value is Action {
  return (
    value === "track" ||
    value === "dirty" ||
    value === "complete" ||
    value === "record-write" ||
    value === "turn" ||
    value === "stop"
  );
}

try {
  main();
} catch (error) {
  // invalid evidence is diagnostic, never an invented owned obligation.
  console.error(`state-checkpoint: ${(error as Error).message}`);
  process.exitCode = 1;
}
