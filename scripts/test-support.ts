import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** oldest Node major the shared suite supports */
export const MINIMUM_NODE_MAJOR = 20;

/**
 * throws when the runtime predates the suite's supported Node major.
 * @param version runtime version string, defaulting to the live process
 * @throws when the parsed major falls below the supported minimum
 */
export function assertSupportedTestRuntime(
  version = process.versions.node,
): void {
  const major = Number.parseInt(version.split(".", 1)[0]!, 10);
  if (!Number.isInteger(major) || major < MINIMUM_NODE_MAJOR) {
    throw new Error(
      `this suite needs Node ${MINIMUM_NODE_MAJOR}+ but Vitest is running on ${version}; retry with a current bunx runtime`,
    );
  }
}

assertSupportedTestRuntime();

/**
 * creates a unique temporary directory for fixture isolation.
 * @param prefix name prefix hinting at the owning suite
 * @returns absolute path of the created directory
 */
export async function createTemporaryDirectory(
  prefix: string,
): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/**
 * removes a temporary directory, tolerating its absence.
 * @param path directory previously returned by createTemporaryDirectory
 */
export async function removeTemporaryDirectory(path: string): Promise<void> {
  await rm(path, { force: true, recursive: true });
}

/**
 * writes a fixture file beneath a temporary repository root.
 * @param root root receiving the fixture
 * @param relativePath slash-separated location under the root
 * @param content text written verbatim to the file
 * @returns absolute path of the written file
 */
export async function writeFixture(
  root: string,
  relativePath: string,
  content: string,
): Promise<string> {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return path;
}

/**
 * spawns a Bun child process and collects its streams.
 * @param script script path handed to the child runtime
 * @param arguments_ arguments passed through to the script
 * @param options working directory and extra environment variables
 * @returns exit code plus captured standard streams
 */
export async function runBun(
  script: string,
  arguments_: readonly string[],
  options: {
    readonly cwd?: string;
    readonly env?: Readonly<Record<string, string>>;
  } = {},
): Promise<{
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const child = Bun.spawn([process.execPath, script, ...arguments_], {
    cwd: options.cwd,
    env:
      options.env === undefined
        ? undefined
        : { ...process.env, ...options.env },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);
  return { exitCode, stderr, stdout };
}
