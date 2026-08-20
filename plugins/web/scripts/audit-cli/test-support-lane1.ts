import { spawnSync } from "node:child_process";

/**
 * runs a Bun script to completion and captures its streams
 * @param args arguments forwarded after the bun runner
 * @param options working directory and stdin input overrides
 * @returns exit status with captured stdout and stderr
 */
export function runBun(
  args: readonly string[],
  options: { readonly cwd?: string; readonly input?: string } = {},
): {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
} {
  const result = spawnSync("bun", ["run", ...args], {
    cwd: options.cwd,
    input: options.input,
    encoding: "utf8",
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
