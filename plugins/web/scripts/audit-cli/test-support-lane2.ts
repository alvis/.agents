import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * creates a fresh temporary directory for suite artifacts
 * @returns absolute path of the created directory
 */
export async function temporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "audit-cli-lane2-"));
}

/**
 * removes a directory tree, tolerating absence
 * @param path directory to remove
 */
export async function removeDirectory(path: string): Promise<void> {
  await rm(path, { force: true, recursive: true });
}

/**
 * reads and parses a JSON document from disk
 * @param path file to read
 * @returns parsed document typed by the caller
 */
export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

/** exit status with captured stdout and stderr of one subprocess run */
interface RunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * runs a Bun script in a child process with extra environment variables
 * @param script script path passed to bun run
 * @param args additional CLI arguments
 * @param environment environment variables merged over the parent environment
 * @returns exit status with captured stdout and stderr
 */
export function runBun(
  script: string,
  args: readonly string[] = [],
  environment: NodeJS.ProcessEnv = {},
): RunResult {
  const result = spawnSync("bun", ["run", script, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
  return {
    exitCode: result.status ?? 1,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}
