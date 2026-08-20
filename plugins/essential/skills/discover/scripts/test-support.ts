import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Result of one Bun subprocess run, mirroring spawnSync's observed fields. */
interface BunRunResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/**
 * creates a unique temporary directory for one test's fixtures.
 * @returns absolute path of the created directory
 */
export async function temporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "discover-test-"));
}
/**
 * removes a directory created by temporaryDirectory.
 * @param path directory to delete along with all of its contents
 */
export async function removeDirectory(path: string): Promise<void> {
  await rm(path, { force: true, recursive: true });
}
/**
 * writes one fixture file below a test root, creating parent directories.
 * @param root test root the fixture is relative to
 * @param relative slash-separated path of the fixture below the root
 * @param text full fixture contents
 * @returns absolute path of the written fixture
 */
export async function fixture(
  root: string,
  relative: string,
  text: string,
): Promise<string> {
  const path = join(root, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
  return path;
}
/**
 * runs one TypeScript script in a fresh Bun subprocess.
 * @param script path of the script to execute
 * @param args arguments passed through to the script
 * @param environment extra variables layered over the inherited environment
 * @returns exit code and captured output streams
 */
export function runBun(
  script: string,
  args: readonly string[] = [],
  environment: NodeJS.ProcessEnv = {},
): BunRunResult {
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
