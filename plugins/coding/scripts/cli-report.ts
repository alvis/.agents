import { closeSync, mkdtempSync, openSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import type { OutputSinks } from "./analyze-typescript/contracts.ts";

interface CapturedReport {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly exit_code: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface Preservation {
  readonly status: "saved" | "fallback" | "failed";
  readonly path: string | null;
  readonly error?: string;
}

// The dispatch contract permits 4096 characters; UTF-8 bytes are a stricter bound.
const SUMMARY_BYTES = 4096;

/**
 * bounds an agent-facing CLI while retaining its complete output separately
 * @param argv original CLI arguments
 * @param execute original command with captured output destinations
 * @param sinks bounded presentation destinations
 * @returns command exit status, or a nonzero preservation failure
 */
export async function runBoundedCli(
  argv: readonly string[],
  execute: (argv: readonly string[], sinks: OutputSinks) => number | Promise<number>,
  sinks: OutputSinks = {},
): Promise<number> {
  const cwd = process.cwd();
  const parsed = reportArguments(argv);
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number;
  if (parsed.error) {
    stderr.push(parsed.error + "\n");
    exitCode = 2;
  } else {
    try {
      exitCode = await execute(parsed.args, { stdout: (text) => stdout.push(text), stderr: (text) => stderr.push(text) });
    } catch (error) {
      const exception = error as Error;
      stderr.push((exception.stack ?? exception.message) + "\n");
      exitCode = 1;
    }
  }
  if (parsed.args.length === 1 && ["--help", "-h"].includes(parsed.args[0]!)) {
    stdout.push("\nCLI output: bounded JSON; --report-file PATH retains complete output at a new file, otherwise a private temporary report is created. Existing files are never overwritten.\n");
  }
  const report = { argv, cwd, exit_code: exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
  const summary = render(report, preserve(report, parsed.path));
  (sinks.stdout ?? ((text) => process.stdout.write(text)))(summary.text);
  return summary.exitCode;
}

function reportArguments(argv: readonly string[]): { args: string[]; path?: string; error?: string } {
  const args: string[] = [];
  let path: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--") { args.push(...argv.slice(index)); break; }
    if (argument === "--report-file" || argument.startsWith("--report-file=")) {
      const value = argument === "--report-file" ? argv[++index] : argument.slice("--report-file=".length);
      if (path !== undefined || !value || value.startsWith("--")) return { args, error: "--report-file requires one nonempty path and may occur only once" };
      path = value;
    } else args.push(argument);
  }
  return { args, path };
}

function preserve(report: CapturedReport, requestedPath?: string): Preservation {
  const content = JSON.stringify(report) + "\n";
  let requestedError: string | undefined;
  if (requestedPath !== undefined) {
    try { return { status: "saved", path: writeReport(resolve(report.cwd, requestedPath), content) }; }
    catch (error) { requestedError = errorPreview(error); }
  }
  try {
    const folder = mkdtempSync(join(realpathSync(tmpdir()), "coding-cli-report-"));
    const path = writeReport(join(folder, "report.json"), content);
    return requestedError === undefined ? { status: "saved", path } : { status: "fallback", path, error: requestedError };
  } catch (error) {
    return { status: "failed", path: null, error: [requestedError, errorPreview(error)].filter(Boolean).join("; ") };
  }
}

function render(report: CapturedReport, preservation: Preservation): { text: string; exitCode: number } {
  const source = reportObject(report.stdout);
  const originalStatus = typeof source.status === "string" && ["complete", "compliant", "success", "failure", "pass", "fail"].includes(source.status)
    ? source.status : report.exit_code === 0 ? "success" : "failure";
  const exitCode = preservation.status === "failed" && report.exit_code === 0 ? 1 : report.exit_code;
  const counts: Record<string, number> = { stdout_bytes: Buffer.byteLength(report.stdout), stderr_bytes: Buffer.byteLength(report.stderr) };
  for (const key of ["files", "standards", "scanner_runs", "packages", "reuse_candidates", "extraction_proposals", "error_documentation_candidates", "diagnostics"]) {
    if (Array.isArray(source[key])) counts[key] = source[key].length;
  }
  const metadata: Record<string, unknown> = {
    schema: "coding-cli-summary/v1",
    status: preservation.status === "failed" ? "preservation_error" : originalStatus,
    original_status: originalStatus,
    exit_code: exitCode,
    original_exit_code: report.exit_code,
    counts,
    full_output: preservation.path,
    preservation: { status: preservation.status, error: preservation.error },
  };
  if (preservation.status === "failed") {
    metadata.no_report_retained = true;
    const rerun = {
      method: "repeat the original invocation, replacing --report-file with a new writable absolute path",
      argv: [process.execPath, process.argv[1], ...report.argv],
      cwd: report.cwd,
    };
    // Long caller arguments remain in the original invocation; never render them as shell code.
    metadata.rerun = process.argv[1] !== undefined && Buffer.byteLength(JSON.stringify({ ...metadata, rerun })) < SUMMARY_BYTES / 2
      ? rerun : { method: rerun.method, original_argv_omitted: true };
  }
  const serialize = (budget: number): string => {
    const streams = Number(report.stdout.length > 0) + Number(report.stderr.length > 0);
    const streamBudget = Math.floor(budget / Math.max(streams, 1));
    const stdout = ends(report.stdout, streamBudget);
    const stderr = ends(report.stderr, streamBudget);
    return JSON.stringify({
      ...metadata,
      preview: { stdout_head: stdout.head, stdout_tail: stdout.tail, stderr_head: stderr.head, stderr_tail: stderr.tail },
      truncated: stdout.head + stdout.tail !== report.stdout || stderr.head + stderr.tail !== report.stderr,
    }) + "\n";
  };
  let lower = 0;
  let upper = SUMMARY_BYTES;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (Buffer.byteLength(serialize(middle)) <= SUMMARY_BYTES) lower = middle;
    else upper = middle - 1;
  }
  return { text: serialize(lower), exitCode };
}

function writeReport(path: string, content: string): string {
  const absolute = resolve(path);
  // Keep at least half the envelope available for status, counts and diagnostics.
  if (Buffer.byteLength(JSON.stringify(absolute)) > SUMMARY_BYTES / 2) throw new Error("report path exceeds summary metadata budget");
  if (realpathSync(dirname(absolute)) !== dirname(absolute)) throw new Error("report parent must be a canonical directory, not a symlink");
  const descriptor = openSync(absolute, "wx", 0o600);
  try {
    writeFileSync(descriptor, content);
  } catch (error) {
    unlinkSync(absolute);
    throw error;
  } finally { closeSync(descriptor); }
  return absolute;
}

function errorPreview(error: unknown): string {
  // Reserve metadata space for two preservation attempts and an actionable preview.
  const preview = ends(String(error), SUMMARY_BYTES / 16);
  return preview.tail ? `${preview.head}…${preview.tail}` : preview.head;
}

function reportObject(stdout: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(stdout);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function ends(text: string, budget: number): { head: string; tail: string } {
  const bytes = Buffer.from(text);
  if (bytes.length <= budget) return { head: text, tail: "" };
  let headEnd = Math.floor(budget / 2);
  let tailStart = bytes.length - Math.floor(budget / 2);
  // Neither preview edge may split a multibyte UTF-8 codepoint.
  while (headEnd > 0 && (bytes[headEnd]! & 0xc0) === 0x80) headEnd -= 1;
  while (tailStart < bytes.length && (bytes[tailStart]! & 0xc0) === 0x80) tailStart += 1;
  return { head: bytes.subarray(0, headEnd).toString(), tail: bytes.subarray(tailStart).toString() };
}
