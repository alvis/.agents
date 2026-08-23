import { spawnSync } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

export const OS_DARWIN = "darwin";
export const OS_LINUX = "linux";
export const OS_UNKNOWN = "unknown";
export const OS_WINDOWS = "windows";

/**
 * captured outcome of one spawned command
 */
export interface RunResult {
  readonly ok: boolean;
  readonly returnCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * normalizes a platform identifier into one of the supported operating-system names
 * @param platform platform string such as the runtime process platform value
 * @returns "darwin", "linux", "windows", or "unknown"
 */
export function detectOs(platform = process.platform): string {
  if (platform === "darwin") return OS_DARWIN;
  if (platform === "linux") return OS_LINUX;
  if (
    platform === "win32" ||
    platform.startsWith("mingw") ||
    platform.startsWith("msys") ||
    platform.startsWith("cygwin")
  )
    return OS_WINDOWS;
  return OS_UNKNOWN;
}

/**
 * reports whether an executable resolves on the supplied search path
 * @param name command name or direct path to probe
 * @param path PATH-style search list consulted when the name is not a direct path
 * @param options overrides for Windows extension probing, mainly for tests
 * @returns true when an accessible regular file matching the executable exists
 */
export function hasExecutable(
  name: string,
  path = process.env.PATH ?? "",
  options: {
    readonly pathExtensions?: string;
    readonly platform?: string;
  } = {},
): boolean {
  const platform = options.platform ?? process.platform;
  const isWindows = platform === "win32";
  const pathExtensions = (
    options.pathExtensions ??
    process.env.PATHEXT ??
    ".COM;.EXE;.BAT;.CMD"
  )
    .split(";")
    .filter(Boolean);
  const hasExecutableExtension = pathExtensions.some((extension) =>
    name.toLowerCase().endsWith(extension.toLowerCase()),
  );
  const extensions =
    isWindows && !hasExecutableExtension ? pathExtensions : [""];
  const directories =
    isAbsolute(name) || name.includes("/") || name.includes("\\")
      ? [undefined]
      : path.split(isWindows ? ";" : delimiter);
  return directories.some((directory) =>
    extensions.some((extension) => {
      try {
        const candidate =
          directory === undefined
            ? `${name}${extension}`
            : join(directory || ".", `${name}${extension}`);
        accessSync(candidate, isWindows ? constants.F_OK : constants.X_OK);
        return statSync(candidate).isFile();
      } catch {
        return false;
      }
    }),
  );
}

/**
 * spawns one command and captures its streams
 * @param command argument vector to execute, or a raw shell line when given as a string
 * @param options execution switches covering stream inheritance, failure checking, working directory, dry-run echo, and environment overrides
 * @returns captured exit status and streams, or a synthetic success for dry runs
 */
export function run(
  command: readonly string[] | string,
  options: {
    readonly capture?: boolean;
    readonly check?: boolean;
    readonly cwd?: string;
    readonly dryRun?: boolean;
    readonly env?: Readonly<Record<string, string>>;
  } = {},
): RunResult {
  const pretty = typeof command === "string" ? command : command.join(" ");
  if (options.dryRun) {
    console.error(`+ ${pretty}`);
    return { ok: true, returnCode: 0, stderr: "", stdout: "" };
  }
  const spawnOptions = {
    cwd: options.cwd,
    encoding: "utf8" as const,
    env: { ...process.env, ...options.env },
    stdio: options.capture === false ? ("inherit" as const) : ("pipe" as const),
  };
  const completed =
    typeof command === "string"
      ? spawnSync(command, { ...spawnOptions, shell: true })
      : spawnSync(command[0]!, command.slice(1), spawnOptions);
  if (completed.error) throw completed.error;
  const result = {
    ok: completed.status === 0,
    returnCode: completed.status ?? 1,
    stderr: completed.stderr ?? "",
    stdout: completed.stdout ?? "",
  };
  if (options.check && !result.ok)
    throw new Error(
      `Command '${pretty}' returned non-zero exit status ${result.returnCode}.`,
    );
  return result;
}

/**
 * extracts the dotted numeric version from free-form tool output
 * @param text stdout or stderr text that may embed a version
 * @returns numeric components of the first match, or undefined when none exists
 */
export function parseVersion(text: string): readonly number[] | undefined {
  const match = text.match(/(\d+(?:\.\d+){1,3})/);
  return match?.[1]?.split(".").map(Number);
}

/**
 * compares two dotted versions component-wise, counting missing segments as zero
 * @param actual observed version string
 * @param minimum required version string
 * @returns true when actual satisfies or exceeds minimum
 */
export function versionAtLeast(actual: string, minimum: string): boolean {
  const actualParts = parseVersion(actual);
  const minimumParts = parseVersion(minimum);
  if (actualParts === undefined || minimumParts === undefined) return false;
  const width = Math.max(actualParts.length, minimumParts.length);
  for (let index = 0; index < width; index += 1) {
    const difference = (actualParts[index] ?? 0) - (minimumParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

/**
 * reads an installed tool's self-reported version
 * @param executable command whose version is queried
 * @param arguments_ arguments invoking the version report, defaulting to --version
 * @returns trimmed version output preferring stdout, or undefined when absent or failing
 */
export function getVersion(
  executable: string,
  arguments_: readonly string[] = ["--version"],
): string | undefined {
  if (!hasExecutable(executable)) return undefined;
  const result = run([executable, ...arguments_]);
  if (!result.ok) return undefined;
  return (result.stdout || result.stderr).trim() || undefined;
}

/**
 * polls a condition and reprints its banner until the condition holds
 * @param check predicate evaluated between waits
 * @param options banner text, poll interval, immediate-exit switch, and reprint cadence
 * @returns true once the check passed, false when no-wait mode returned before polling
 */
export function pollUntil(
  check: () => boolean,
  options: {
    readonly banner: string;
    readonly intervalSeconds?: number;
    readonly noWait?: boolean;
    readonly reprintEveryPolls?: number;
  },
): boolean {
  console.log(options.banner);
  if (options.noWait) return false;
  const intervalMilliseconds = (options.intervalSeconds ?? 5) * 1000;
  const reprintEveryPolls = options.reprintEveryPolls ?? 6;
  let pollCount = 0;
  while (!check()) {
    pollCount += 1;
    if (reprintEveryPolls > 0 && pollCount % reprintEveryPolls === 0)
      console.log(options.banner);
    Atomics.wait(
      new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)),
      0,
      0,
      intervalMilliseconds,
    );
  }
  return true;
}

/**
 * renders one tool status line for session output
 * @param tool registered tool name
 * @param status computed lifecycle state
 * @param action detail explaining the status
 * @returns the formatted single-line summary
 */
export function statusLine(
  tool: string,
  status: string,
  action: string,
): string {
  return `${tool}: ${status} (${action})`;
}
