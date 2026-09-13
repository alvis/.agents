import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import {
  assertSafePath,
  canonicalDirectory,
  commitFiles,
  InstallationError,
  readSnapshot,
} from "./installation/transaction.ts";
import type { FileChange, FileSnapshot } from "./installation/transaction.ts";

/** harnesses supported by native agent installation */
export type HarnessName = "claude" | "codex" | "grok";

/** a generated file relative to the agent destination */
export interface InstallationFile {
  readonly path: string;
  readonly content: string | Buffer;
  readonly kind: "agent" | "support";
}

/** installation settings shared with removal */
export interface InstallationOptions {
  readonly harness?: HarnessName;
  readonly grokHome?: string;
  readonly stdout?: (text: string) => void;
}

/** files removed or retained by an uninstall */
export interface UninstallResult {
  readonly removed: number;
  readonly preserved: number;
}

interface OwnedFile {
  readonly path: string;
  readonly sha256: string;
  readonly kind: "agent" | "support";
}

interface Attachment {
  readonly path: string;
  readonly block: string;
  readonly separator: string;
  readonly created: boolean;
}

interface Receipt {
  readonly version: 1;
  readonly harness: HarnessName;
  readonly destination: string;
  readonly files: readonly OwnedFile[];
  readonly attachment?: Attachment;
}

interface AttachmentChange {
  readonly attachment?: Attachment;
  readonly change?: FileChange;
  readonly preserved: boolean;
}

const receiptRelativePath = ".essential/installation.json";
const markerStart = "<!-- essential:install:start -->";
const markerEnd = "<!-- essential:install:end -->";

/**
 * installs generated files and records their ownership
 * @param destination agent directory
 * @param files rendered agents and support files
 * @param options harness and output settings
 * @param bootstrap Grok startup instruction source
 */
export function installManagedFiles(
  destination: string,
  files: readonly InstallationFile[],
  options: InstallationOptions = {},
  bootstrap?: string,
): void {
  const canonicalDestination = canonicalDirectory(destination);
  const harness = options.harness ?? "claude";
  const receiptPath = join(canonicalDestination, receiptRelativePath);
  const beforeReceipt = readSnapshot(receiptPath);
  const previous = readReceipt(beforeReceipt, canonicalDestination, harness);
  const previousByPath = new Map(
    previous?.files.map((file) => [file.path, file]),
  );
  const names = new Set<string>();
  const changes: FileChange[] = [];
  const owned: OwnedFile[] = [];
  for (const file of files) {
    validateRelativePath(file.path, file.kind, harness);
    if (names.has(file.path))
      throw new InstallationError(`duplicate installed path: ${file.path}`);
    names.add(file.path);
    const path = join(canonicalDestination, file.path);
    const before = readSnapshot(path);
    const after = Buffer.from(file.content);
    const previousFile = previousByPath.get(file.path);
    if (
      before !== undefined &&
      !before.content.equals(after) &&
      (previousFile === undefined ||
        hash(before.content) !== previousFile.sha256)
    )
      throw new InstallationError(
        `preserved conflicting file: ${path}; move it aside or restore the recorded version before reinstalling`,
      );
    changes.push({ path, before, after });
    owned.push({ path: file.path, kind: file.kind, sha256: hash(after) });
  }
  const stale = (previous?.files ?? [])
    .filter((file) => !names.has(file.path))
    .map((file) => ({
      file,
      before: readSnapshot(join(canonicalDestination, file.path)),
    }));
  const retainedAgents = stale.some(
    ({ file, before }) =>
      file.kind === "agent" &&
      before !== undefined &&
      hash(before.content) !== file.sha256,
  );
  for (const { file, before } of stale) {
    if (before === undefined) continue;
    const path = join(canonicalDestination, file.path);
    if (
      hash(before.content) !== file.sha256 ||
      (file.kind === "support" && retainedAgents)
    ) {
      owned.push(file);
      options.stdout?.(`preserved: ${path}\n`);
    } else changes.push({ path, before });
  }
  const attachment =
    harness === "grok"
      ? installAttachment(
          receiptPath,
          previous?.attachment,
          options.grokHome,
          bootstrap,
        )
      : undefined;
  if (attachment?.change !== undefined) changes.push(attachment.change);
  const receipt: Receipt = {
    version: 1,
    harness,
    destination: canonicalDestination,
    files: owned.sort((left, right) => left.path.localeCompare(right.path)),
    attachment: attachment?.attachment,
  };
  changes.push({
    path: receiptPath,
    before: beforeReceipt,
    after: Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`),
  });
  commitFiles(changes);
  for (const file of files)
    options.stdout?.(`installed: ${join(canonicalDestination, file.path)}\n`);
}

/**
 * removes unchanged owned files while retaining edited agents and their support
 * @param destination installed agent directory
 * @param options harness and output settings
 * @returns removal and preservation counts
 */
export function uninstallAgents(
  destination: string,
  options: InstallationOptions = {},
): UninstallResult {
  const canonicalDestination = canonicalDirectory(destination);
  const harness = options.harness ?? "claude";
  const receiptPath = join(canonicalDestination, receiptRelativePath);
  const beforeReceipt = readSnapshot(receiptPath);
  const previous = readReceipt(beforeReceipt, canonicalDestination, harness);
  if (previous === undefined) return { removed: 0, preserved: 0 };
  const candidates = previous.files.map((file) => ({
    file,
    path: join(canonicalDestination, file.path),
    before: readSnapshot(join(canonicalDestination, file.path)),
  }));
  const preservedAgents = candidates.some(
    ({ file, before }) =>
      file.kind === "agent" &&
      before !== undefined &&
      hash(before.content) !== file.sha256,
  );
  const retained: OwnedFile[] = [];
  const changes: FileChange[] = [];
  for (const { file, path, before } of candidates) {
    if (before === undefined) continue;
    if (
      hash(before.content) !== file.sha256 ||
      (file.kind === "support" && preservedAgents)
    )
      retained.push(file);
    else changes.push({ path, before });
  }
  const attachment =
    harness === "grok"
      ? removeAttachment(receiptPath, previous.attachment, options.grokHome)
      : undefined;
  const removed = changes.length + (attachment?.change === undefined ? 0 : 1);
  const preserved = retained.length + (attachment?.preserved ? 1 : 0);
  if (attachment?.change !== undefined) changes.push(attachment.change);
  const receipt: Receipt = {
    ...previous,
    files: retained,
    attachment: attachment?.attachment,
  };
  const after =
    retained.length === 0 && receipt.attachment === undefined
      ? undefined
      : Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  changes.push({ path: receiptPath, before: beforeReceipt, after });
  commitFiles(changes);
  const write =
    options.stdout ??
    ((text: string): void => {
      process.stdout.write(text);
    });
  for (const file of retained)
    write(`preserved: ${join(canonicalDestination, file.path)}\n`);
  if (attachment?.preserved) write(`preserved: ${previous.attachment!.path}\n`);
  write(`done — removed ${removed} owned file(s); preserved ${preserved}\n`);
  return { removed, preserved };
}

/**
 * resolves only the selected harness's default agent directory
 * @param harness target harness
 * @returns absolute destination directory
 */
export function defaultAgentDestination(harness: HarnessName): string {
  const home =
    harness === "claude"
      ? resolve(homedir(), ".claude")
      : harness === "codex"
        ? (process.env.CODEX_HOME || resolve(homedir(), ".codex"))
        : (process.env.GROK_HOME || resolve(homedir(), ".grok"));
  return resolve(home, "agents");
}

function installAttachment(
  receiptPath: string,
  previous: Attachment | undefined,
  grokHome: string | undefined,
  bootstrap: string | undefined,
): AttachmentChange {
  if (bootstrap === undefined || readSnapshot(bootstrap) === undefined)
    throw new InstallationError(
      `missing Grok bootstrap: ${bootstrap ?? "unspecified"}`,
    );
  if (/[\r\n]/.test(receiptPath) || /[\r\n]/.test(bootstrap))
    throw new InstallationError(
      "Grok attachment paths must not contain newlines",
    );
  const path = attachmentPath(grokHome);
  if (previous !== undefined && previous.path !== path)
    throw new InstallationError(
      `previous Grok attachment is at ${previous.path}; uninstall using that GROK_HOME first`,
    );
  const before = readSnapshot(path);
  const text = before?.content.toString("utf8") ?? "";
  assertUtf8(before, path);
  const block = `${markerStart}\nOwner: ${receiptPath}\n<IMPORTANT>\nBefore your first response or any other tool action in this session, read and follow the bootstrap at this literal absolute path:\n@${resolve(bootstrap)}\nPass the path without @ to your file-reading tool. Do not rebase it against the working directory or substitute another plugin root. Do not respond or ask a question until it has been read.\n</IMPORTANT>\n${markerEnd}\n`;
  const existing = locateBlock(text, receiptPath);
  if (existing !== undefined) {
    if (
      previous === undefined ||
      text.slice(existing.start, existing.end) !== previous.block
    )
      throw new InstallationError(
        `preserved modified or unowned Grok attachment: ${path}`,
      );
    const after = `${text.slice(0, existing.start)}${block}${text.slice(existing.end)}`;
    return {
      attachment: { ...previous, block },
      change: { path, before, after: Buffer.from(after) },
      preserved: false,
    };
  }
  const separator =
    text.length === 0 || text.endsWith("\n\n")
      ? ""
      : text.endsWith("\n")
        ? "\n"
        : "\n\n";
  return {
    attachment: { path, block, separator, created: before === undefined },
    change: { path, before, after: Buffer.from(`${text}${separator}${block}`) },
    preserved: false,
  };
}

function removeAttachment(
  receiptPath: string,
  previous: Attachment | undefined,
  grokHome: string | undefined,
): AttachmentChange {
  if (previous === undefined) return { preserved: false };
  const path = attachmentPath(grokHome);
  if (path !== previous.path)
    throw new InstallationError(
      `previous Grok attachment is at ${previous.path}; uninstall using that GROK_HOME`,
    );
  const before = readSnapshot(path);
  if (before === undefined) return { preserved: false };
  assertUtf8(before, path);
  const text = before.content.toString("utf8");
  let existing: { start: number; end: number } | undefined;
  try {
    existing = locateBlock(text, receiptPath);
  } catch (error) {
    if (!(error instanceof InstallationError)) throw error;
    return { attachment: previous, preserved: true };
  }
  if (existing === undefined) return { preserved: false };
  if (text.slice(existing.start, existing.end) !== previous.block)
    return { attachment: previous, preserved: true };
  const prefix = text.slice(0, existing.start);
  const separatorLength =
    previous.separator !== "" && prefix.endsWith(previous.separator)
      ? previous.separator.length
      : 0;
  const remaining = `${prefix.slice(0, prefix.length - separatorLength)}${text.slice(existing.end)}`;
  return {
    change: {
      path,
      before,
      after:
        remaining === "" && previous.created
          ? undefined
          : Buffer.from(remaining),
    },
    preserved: false,
  };
}

function locateBlock(
  text: string,
  receiptPath: string,
): { start: number; end: number } | undefined {
  const start = text.indexOf(markerStart);
  const closing = text.indexOf(markerEnd);
  if (start === -1 && closing === -1) return undefined;
  if (
    start === -1 ||
    closing < start ||
    text.indexOf(markerStart, start + markerStart.length) !== -1 ||
    text.indexOf(markerEnd, closing + markerEnd.length) !== -1
  )
    throw new InstallationError(
      "malformed or duplicate Grok attachment markers; preserve and repair the user AGENTS.md",
    );
  const blockEnd = closing + markerEnd.length;
  const end = text[blockEnd] === "\n" ? blockEnd + 1 : blockEnd;
  const owner = text
    .slice(start, end)
    .split("\n")
    .find((line) => line.startsWith("Owner: "))
    ?.slice("Owner: ".length);
  if (owner !== receiptPath)
    throw new InstallationError(
      `Grok attachment belongs to ${owner ?? "an unknown destination"}; run essential:uninstall for the previous owner first`,
    );
  return { start, end };
}

function attachmentPath(grokHome: string | undefined): string {
  const path = join(
    canonicalDirectory(
      grokHome || process.env.GROK_HOME || resolve(homedir(), ".grok"),
    ),
    "AGENTS.md",
  );
  if (/[\r\n]/.test(path))
    throw new InstallationError(
      `invalid Grok attachment path: ${JSON.stringify(path)}`,
    );
  return path;
}

function readReceipt(
  snapshot: FileSnapshot | undefined,
  destination: string,
  harness: HarnessName,
): Receipt | undefined {
  assertSafePath(destination);
  if (snapshot === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(snapshot.content.toString("utf8"));
  } catch (error) {
    throw new InstallationError(
      `invalid installation receipt: ${(error as Error).message}`,
      { cause: error },
    );
  }
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    value.harness !== harness ||
    value.destination !== destination ||
    !Array.isArray(value.files)
  )
    throw new InstallationError(
      `invalid installation receipt or harness/destination mismatch: ${destination}`,
    );
  const names = new Set<string>();
  const files: OwnedFile[] = value.files.map((file: unknown) => {
    if (
      !isRecord(file) ||
      typeof file.path !== "string" ||
      typeof file.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      (file.kind !== "agent" && file.kind !== "support")
    )
      throw new InstallationError("invalid owned file in installation receipt");
    validateRelativePath(file.path, file.kind, harness);
    if (names.has(file.path))
      throw new InstallationError(
        `duplicate path in installation receipt: ${file.path}`,
      );
    names.add(file.path);
    return { path: file.path, sha256: file.sha256, kind: file.kind };
  });
  const attachment = value.attachment;
  if (
    attachment !== undefined &&
    (harness !== "grok" || !isAttachment(attachment))
  )
    throw new InstallationError(
      "invalid Grok attachment in installation receipt",
    );
  return {
    version: 1,
    harness,
    destination,
    files,
    attachment,
  };
}

function isAttachment(value: unknown): value is Attachment {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    isAbsolute(value.path) &&
    typeof value.block === "string" &&
    typeof value.separator === "string" &&
    new Set(["", "\n", "\n\n"]).has(value.separator) &&
    typeof value.created === "boolean"
  );
}

function validateRelativePath(
  path: string,
  kind: OwnedFile["kind"],
  harness: HarnessName,
): void {
  if (
    isAbsolute(path) ||
    path
      .split("/")
      .some((part) => part === "" || part === "." || part === "..") ||
    /[\\\r\n\0]/.test(path) ||
    path === receiptRelativePath ||
    (kind === "agent"
      ? !new RegExp(
          `^[a-z0-9]+(?:-[a-z0-9]+)*\\.${harness === "codex" ? "toml" : "md"}$`,
        ).test(path)
      : !path.startsWith(".essential/"))
  )
    throw new InstallationError(`unsafe owned path: ${JSON.stringify(path)}`);
}

function assertUtf8(snapshot: FileSnapshot | undefined, path: string): void {
  if (
    snapshot !== undefined &&
    !Buffer.from(snapshot.content.toString("utf8")).equals(snapshot.content)
  )
    throw new InstallationError(`Grok AGENTS.md is not UTF-8: ${path}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hash(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}
