import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { discoverPackages } from "./analyze-typescript/discovery.ts";
import { runBoundedCli } from "./cli-report.ts";
import { validateProfile } from "./lint_profile_runner.ts";

import type {
  AnalysisDependencies,
  AnalysisOptions,
  AnalysisReport,
  OutputSinks,
  PackageAnalysis,
  PackageRequest,
  ParserModule,
} from "./analyze-typescript/contracts.ts";

/**
 * analyzes selected TypeScript files and eligible package peers without edits
 * @param options selected files and scan configuration
 * @param dependencies optional parser-loading capability
 * @returns advisory report, including explicit analysis failures
 */
export async function analyze(
  options: AnalysisOptions,
  dependencies: AnalysisDependencies = {},
): Promise<AnalysisReport> {
  try {
    const repositoryRoot = resolve(options.repositoryRoot ?? process.cwd());
    const profile: unknown =
      options.profilePath === undefined
        ? {}
        : JSON.parse(readFileSync(options.profilePath, "utf8"));
    const invalidProfile = validateProfile(options.profilePath, profile);
    if (invalidProfile !== undefined) return failure(invalidProfile);
    const packages = discoverPackages({ ...options, repositoryRoot }, profile);
    if (packages.length === 0) return { ...emptyReport(), packages };
    const parser = await (dependencies.loadParser ?? loadParser)();
    const results = packages.map((scope) =>
      parser.analyzePackage({ ...scope, repository_root: repositoryRoot }),
    );
    const diagnostics = results.flatMap((result) => result.diagnostics);
    return {
      status: diagnostics.some((item) => item.kind === "failure")
        ? "failure"
        : "complete",
      packages,
      reuse_candidates: results.flatMap((result) => result.reuse_candidates),
      extraction_proposals: results.flatMap(
        (result) => result.extraction_proposals,
      ),
      error_documentation_candidates: results.flatMap(
        (result) => result.error_documentation_candidates,
      ),
      diagnostics,
    };
  } catch (error) {
    return failure((error as Error).message);
  }
}

/**
 * runs package analysis and emits one JSON report
 * @param argv CLI arguments
 * @param sinks optional output destinations
 * @param dependencies optional parser-loading capability
 * @returns zero for completed analysis, one for failure, or two for invalid usage
 */
export async function run(
  argv: readonly string[],
  sinks: OutputSinks = {},
  dependencies: AnalysisDependencies = {},
): Promise<number> {
  const stdout =
    sinks.stdout ??
    ((text: string): void => {
      process.stdout.write(text);
    });
  const stderr =
    sinks.stderr ??
    ((text: string): void => {
      process.stderr.write(text);
    });
  const files: string[] = [];
  let repositoryRoot: string | undefined;
  let profilePath: string | undefined;
  let positionalOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (positionalOnly) files.push(argument);
    else if (argument === "--") positionalOnly = true;
    else if (argument === "--help" || argument === "-h") {
      stdout(
        "usage: analyze-typescript.ts [--profile ABSOLUTE_JSON] [--repository-root PATH] [--] FILES...\n",
      );
      return 0;
    } else if (
      argument === "--repository-root" ||
      argument === "--profile" ||
      argument.startsWith("--repository-root=") ||
      argument.startsWith("--profile=")
    ) {
      const hasInlineValue = argument.includes("=");
      const option = argument.split("=", 1)[0];
      const value = hasInlineValue
        ? argument.slice(argument.indexOf("=") + 1)
        : argv[index + 1];
      if (value === undefined || value === "" || value.startsWith("--")) {
        stderr(`${argument} requires a value\n`);
        return 2;
      }
      if (option === "--profile") profilePath = value;
      else repositoryRoot = value;
      if (!hasInlineValue) index += 1;
    } else if (!argument.startsWith("-")) {
      files.push(argument);
    } else {
      stderr(
        `unexpected option: ${argument}; use -- before dash-prefixed files\n`,
      );
      return 2;
    }
  }
  if (
    files.length === 0 ||
    (profilePath !== undefined && !isAbsolute(profilePath))
  ) {
    stderr("selected files are required; --profile must be absolute\n");
    return 2;
  }
  if (profilePath !== undefined) {
    try {
      const invalid = validateProfile(
        profilePath,
        JSON.parse(readFileSync(profilePath, "utf8")),
      );
      if (invalid !== undefined) {
        stderr(`${invalid}\n`);
        return 2;
      }
    } catch (error) {
      stderr(`invalid profile: ${(error as Error).message}\n`);
      return 2;
    }
  }
  if (repositoryRoot !== undefined && !existsSync(repositoryRoot)) {
    stderr(`repository root does not exist: ${repositoryRoot}\n`);
    return 2;
  }
  const report = await analyze(
    { files, repositoryRoot, profilePath },
    dependencies,
  );
  stdout(`${JSON.stringify(report)}\n`);
  return report.status === "failure" ? 1 : 0;
}

async function loadParser(): Promise<ParserModule> {
  return { analyzePackage: runParser };
}

function runParser(request: PackageRequest): PackageAnalysis {
  const parserPath = resolve(
    import.meta.dirname,
    "analyze-typescript/parser.ts",
  );
  // force cache resolution even when the scanned project has node_modules
  const result = spawnSync(process.execPath, ["--install=force", parserPath], {
    input: JSON.stringify(request),
    encoding: "utf8",
    maxBuffer: Infinity,
  });
  if (result.status !== 0)
    throw new Error(
      `TypeScript parser failed: ${result.stderr || result.error?.message || `exit ${result.status}`}`,
    );
  return JSON.parse(result.stdout) as PackageAnalysis;
}

function emptyReport(): AnalysisReport {
  return {
    status: "complete",
    packages: [],
    reuse_candidates: [],
    extraction_proposals: [],
    error_documentation_candidates: [],
    diagnostics: [],
  };
}

function failure(message: string): AnalysisReport {
  return {
    ...emptyReport(),
    status: "failure",
    diagnostics: [{ kind: "failure", message }],
  };
}

if (import.meta.main) process.exitCode = await runBoundedCli(process.argv.slice(2), run);
