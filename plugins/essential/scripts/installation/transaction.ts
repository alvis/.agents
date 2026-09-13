import { randomUUID } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, parse, resolve } from "node:path";

/** bytes and mode captured before changing a regular file */
export interface FileSnapshot {
  readonly content: Buffer;
  readonly mode: number;
}

/** one preflighted file change */
export interface FileChange {
  readonly path: string;
  readonly before?: FileSnapshot;
  readonly after?: Buffer;
}

/** invalid ownership or an unsafe installation destination */
export class InstallationError extends Error {}

/**
 * canonicalizes the caller-selected directory, including existing ancestor aliases
 * @param path caller-selected root directory
 * @returns canonical absolute directory path
 */
export function canonicalDirectory(path: string): string {
  const missing: string[] = [];
  let ancestor = resolve(path);
  while (lstatSync(ancestor, { throwIfNoEntry: false }) === undefined) {
    missing.unshift(basename(ancestor));
    ancestor = dirname(ancestor);
  }
  if (!statSync(ancestor).isDirectory())
    throw new InstallationError(`not a directory: ${ancestor}`);
  return resolve(realpathSync(ancestor), ...missing);
}

/**
 * reads a regular file without traversing symbolic links
 * @param path absolute file path
 * @returns current bytes and mode, or undefined for a missing file
 */
export function readSnapshot(path: string): FileSnapshot | undefined {
  assertSafePath(path);
  const status = lstatSync(path, { throwIfNoEntry: false });
  if (status === undefined) return undefined;
  if (!status.isFile())
    throw new InstallationError(`not a regular file: ${path}`);
  return { content: readFileSync(path), mode: status.mode & 0o777 };
}

/**
 * commits preflighted files with adjacent atomic replacement and rollback
 * @param changes ordered changes, with the ownership receipt last
 */
export function commitFiles(changes: readonly FileChange[]): void {
  const pending = changes.filter(
    (change) => !sameBytes(change.before?.content, change.after),
  );
  if (pending.length === 0) return;
  const recovery = mkdtempSync(join(tmpdir(), "essential-recovery-"));
  chmodSync(recovery, 0o700);
  const directories: string[] = [];
  const staged: Array<{ change: FileChange; temporary?: string }> = [];
  const committed: FileChange[] = [];
  let keepRecovery = false;
  try {
    writeFileSync(
      join(recovery, "changes.json"),
      JSON.stringify(
        pending.map((change, index) => ({
          path: change.path,
          backup: change.before === undefined ? null : `${index}.bin`,
          mode: change.before?.mode,
        })),
        null,
        2,
      ),
      { mode: 0o600 },
    );
    for (const [index, change] of pending.entries()) {
      if (change.before !== undefined)
        writeFileSync(join(recovery, `${index}.bin`), change.before.content, {
          mode: 0o600,
        });
      ensureDirectory(dirname(change.path), directories);
      const temporary =
        change.after === undefined
          ? undefined
          : stageFile(change.path, change.after, change.before?.mode);
      staged.push({ change, temporary });
    }
    for (const { change, temporary } of staged) {
      const current = readSnapshot(change.path);
      if (
        !sameBytes(current?.content, change.before?.content) ||
        current?.mode !== change.before?.mode
      )
        throw new InstallationError(
          `file changed after preflight: ${change.path}`,
        );
      if (temporary === undefined) rmSync(change.path);
      else renameSync(temporary, change.path);
      committed.push(change);
    }
  } catch (error) {
    const failures: string[] = [];
    for (const change of [...committed].reverse()) {
      try {
        const current = readSnapshot(change.path);
        if (!sameBytes(current?.content, change.after))
          throw new InstallationError(
            `file changed before rollback: ${change.path}`,
          );
        if (change.before === undefined) rmSync(change.path, { force: true });
        else {
          const temporary = stageFile(
            change.path,
            change.before.content,
            change.before.mode,
          );
          try {
            renameSync(temporary, change.path);
          } finally {
            rmSync(temporary, { force: true });
          }
        }
      } catch (rollbackError) {
        failures.push(`${change.path}: ${(rollbackError as Error).message}`);
      }
    }
    keepRecovery = failures.length > 0;
    if (keepRecovery)
      throw new InstallationError(
        `installation failed: ${(error as Error).message}; rollback incomplete: ${failures.join("; ")}; recovery files: ${recovery}`,
        { cause: error },
      );
    throw error;
  } finally {
    for (const { temporary } of staged)
      if (temporary !== undefined) rmSync(temporary, { force: true });
    for (const directory of [...directories].reverse()) {
      try {
        rmdirSync(directory);
      } catch (error) {
        if (
          !new Set(["ENOTEMPTY", "EEXIST", "ENOENT"]).has(
            (error as NodeJS.ErrnoException).code ?? "",
          )
        )
          throw error;
      }
    }
    if (!keepRecovery) rmSync(recovery, { recursive: true, force: true });
  }
}

/**
 * rejects symbolic links in any existing path component
 * @param path destination path
 */
export function assertSafePath(path: string): void {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const components = absolute.slice(root.length).split("/").filter(Boolean);
  let current = root;
  for (const [index, component] of components.entries()) {
    current = join(current, component);
    const status = lstatSync(current, { throwIfNoEntry: false });
    if (status === undefined) return;
    if (status.isSymbolicLink())
      throw new InstallationError(`symlink in installation path: ${current}`);
    if (index < components.length - 1 && !status.isDirectory())
      throw new InstallationError(`not a directory: ${current}`);
  }
}

function sameBytes(
  left: Buffer | undefined,
  right: Buffer | undefined,
): boolean {
  return left === undefined
    ? right === undefined
    : right !== undefined && left.equals(right);
}

function ensureDirectory(path: string, created: string[]): void {
  assertSafePath(path);
  const status = lstatSync(path, { throwIfNoEntry: false });
  if (status !== undefined) {
    if (!status.isDirectory())
      throw new InstallationError(`not a directory: ${path}`);
    return;
  }
  ensureDirectory(dirname(path), created);
  mkdirSync(path);
  created.push(path);
}

function stageFile(target: string, content: Buffer, mode = 0o600): string {
  const temporary = join(
    dirname(target),
    `.${basename(target)}.${randomUUID()}.tmp`,
  );
  try {
    writeFileSync(temporary, content, { flag: "wx", mode });
    chmodSync(temporary, mode);
    return temporary;
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}
