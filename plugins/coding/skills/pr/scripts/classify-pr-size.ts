#!/usr/bin/env bun

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";

/** zone a PR's review surface falls into, ordered from least to most review */
export type Zone = (typeof ZONES)[number];

/** semantic risk class of a change, from R0 (least) to R3 (most) */
export type RiskClass = (typeof RISK_CLASSES)[number];

/** declared change inventory from the PR body or a reviewer's recount */
export interface ChangeInventory {
  /** risk class of the whole change */
  riskClass: RiskClass;
  /** number of logical change units */
  units: number;
}

type AttributePaths = Record<(typeof PATH_ATTRIBUTES)[number], Set<string>>;

type ExclusionBucket = "generated" | "vendored" | "snapshot" | "test";

interface LineCounts {
  additions: number;
  deletions: number;
}

interface DiffEntry {
  path: string;
  /** source path of a detected rename, null otherwise */
  previousPath: string | null;
  /** null for a binary change */
  lineCounts: LineCounts | null;
}

interface UnitBand {
  zone: Zone;
  maxUnits: number;
}

interface SizeThresholds {
  unitBands: UnitBand[];
  riskFloors: Record<RiskClass, Zone>;
  lineBump: { authoredLinesAbove: number; steps: number };
  renameSimilarityPercent: number;
}

interface ClassifierArguments {
  repo: string;
  base: string;
  head: string;
  inventory: ChangeInventory | null;
}

interface ArgumentExit {
  exitCode: number;
}

interface GitResult {
  stdout: Uint8Array;
  stderr: Uint8Array;
  exitCode: number;
}

const ZONES = ["green", "yellow", "red", "black"] as const;
const UNIT_BAND_ZONES = ["green", "yellow", "red"] as const;
const RISK_CLASSES = ["R0", "R1", "R2", "R3"] as const;
const PATH_ATTRIBUTES = ["linguist-generated", "linguist-vendored"] as const;

const PACKAGE_LOCKFILES = new Set([
  "Cargo.lock",
  "Gemfile.lock",
  "Pipfile.lock",
  "bun.lock",
  "bun.lockb",
  "composer.lock",
  "go.sum",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "poetry.lock",
  "uv.lock",
  "yarn.lock",
]);

// git's current diff.renameLimit default, pinned so a change to git's own default cannot move the counts; it bounds the quadratic similarity matrix
const RENAME_CANDIDATE_LIMIT = 1_000;
// git writes this to stderr, untranslated under LC_ALL=C, when it skips inexact renames beyond the limit
const RENAME_LIMIT_WARNING = "exhaustive rename detection was skipped";
// PATH finds git, HOME locates the user, TMPDIR places temporary files
const INHERITED_ENVIRONMENT = ["HOME", "PATH", "TMPDIR"];
// a promisor fetch alone also needs proxies, CA bundles, SSH programs and variants, and credential prompts; OpenSSH runs SSH_ASKPASS without a TTY only with DISPLAY or SSH_ASKPASS_REQUIRE; none of them change the counts
const TRANSPORT_ENVIRONMENT = [
  "ALL_PROXY",
  "DISPLAY",
  "GIT_ASKPASS",
  "GIT_SSH",
  "GIT_SSH_COMMAND",
  "GIT_SSH_VARIANT",
  "GIT_SSL_CAINFO",
  "GIT_SSL_CAPATH",
  "HTTPS_PROXY",
  "NO_PROXY",
  "SSH_ASKPASS",
  "SSH_ASKPASS_REQUIRE",
  "SSH_AUTH_SOCK",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "all_proxy",
  "http_proxy",
  "https_proxy",
  "no_proxy",
];
const GIT_ARGUMENT_BATCH_SIZE = 128;
// git rejects a rename similarity above 100%
const MAX_SIMILARITY_PERCENT = 100;
const SIZE_THRESHOLDS = join(
  import.meta.dirname,
  "../assets/size-thresholds.json",
);

const USAGE =
  "usage: classify-pr-size.ts [-h] [--repo REPO] --base BASE --head HEAD [--units UNITS] [--risk {R0,R1,R2,R3}]";
const HELP = `${USAGE}

classify a Git diff into a PR-size zone from authored lines and inventory

options:
  -h, --help            show this help message and exit
  --repo REPO
  --base BASE
  --head HEAD
  --units UNITS
  --risk {R0,R1,R2,R3}

rename_detection_skipped is true when git skipped inexact rename matching because the sources times destinations left after exact and basename matches exceeded ${RENAME_CANDIDATE_LIMIT} squared, so those moves count as authored lines
`;
const CLASSIFIER_OPTIONS = [
  "--help",
  "--repo",
  "--base",
  "--head",
  "--units",
  "--risk",
];
const ARGPARSE_NEGATIVE_NUMBER = /^-\p{Nd}+$|^-\p{Nd}*\.\p{Nd}+$/u;

class GitCommandError extends Error {
  constructor(readonly result: GitResult) {
    super(
      new TextDecoder().decode(result.stderr).trim() || "git command failed",
    );
  }
}

function runGit(
  repo: string,
  args: string[],
  options: {
    input?: Uint8Array;
    environment?: Record<string, string>;
    check?: boolean;
  } = {},
): GitResult {
  const result = Bun.spawnSync(["git", "-C", repo, ...args], {
    stdin: options.input,
    stdout: "pipe",
    stderr: "pipe",
    env: options.environment,
  });
  const normalized = {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
  if ((options.check ?? true) && result.exitCode !== 0)
    throw new GitCommandError(normalized);
  return normalized;
}

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function splitBytes(bytes: Uint8Array, delimiter: number): Uint8Array[] {
  const parts: Uint8Array[] = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== delimiter) continue;
    parts.push(bytes.subarray(start, index));
    start = index + 1;
  }
  parts.push(bytes.subarray(start));
  return parts;
}

function surrogateDecode(bytes: Uint8Array): string {
  let result = "";
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index]!;
    if (first < 0x80) {
      result += String.fromCodePoint(first);
      index += 1;
      continue;
    }
    const length =
      first >= 0xc2 && first <= 0xdf
        ? 2
        : first >= 0xe0 && first <= 0xef
          ? 3
          : first >= 0xf0 && first <= 0xf4
            ? 4
            : 0;
    const sequence = bytes.subarray(index, index + length);
    const validContinuation =
      sequence.length === length &&
      [...sequence.subarray(1)].every((byte) => byte >= 0x80 && byte <= 0xbf);
    const validBoundary =
      length !== 3 ||
      ((first !== 0xe0 || sequence[1]! >= 0xa0) &&
        (first !== 0xed || sequence[1]! <= 0x9f));
    const validFourByteBoundary =
      length !== 4 ||
      ((first !== 0xf0 || sequence[1]! >= 0x90) &&
        (first !== 0xf4 || sequence[1]! <= 0x8f));
    if (
      length > 0 &&
      validContinuation &&
      validBoundary &&
      validFourByteBoundary
    ) {
      result += new TextDecoder("utf-8", { fatal: true }).decode(sequence);
      index += length;
    } else {
      result += String.fromCharCode(0xdc00 + first);
      index += 1;
    }
  }
  return result;
}

function surrogateEncode(value: string): Uint8Array {
  const bytes: number[] = [];
  let ordinary = "";
  const flush = () => {
    if (!ordinary) return;
    bytes.push(...new TextEncoder().encode(ordinary));
    ordinary = "";
  };
  for (const character of value) {
    const codepoint = character.codePointAt(0)!;
    if (codepoint >= 0xdc80 && codepoint <= 0xdcff) {
      flush();
      bytes.push(codepoint - 0xdc00);
    } else ordinary += character;
  }
  flush();
  return Uint8Array.from(bytes);
}

function comparePythonStrings(left: string, right: string): number {
  const leftPoints = [...left].map((character) => character.codePointAt(0)!);
  const rightPoints = [...right].map((character) => character.codePointAt(0)!);
  for (
    let index = 0;
    index < Math.min(leftPoints.length, rightPoints.length);
    index += 1
  ) {
    if (leftPoints[index] !== rightPoints[index])
      return leftPoints[index]! - rightPoints[index]!;
  }
  return leftPoints.length - rightPoints.length;
}

function hermeticEnvironment(): Record<string, string> {
  // an allowlist, because git keeps adding GIT_* inputs (such as GIT_ATTR_SOURCE) that would change the counts
  return {
    ...inheritedEnvironment(INHERITED_ENVIRONMENT),
    GIT_ATTR_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
    LC_ALL: "C",
  };
}

function inheritedEnvironment(names: string[]): Record<string, string> {
  return Object.fromEntries(
    names.flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
}

function resolveCommit(
  repo: string,
  revision: string,
  environment: Record<string, string>,
): string {
  return text(
    runGit(repo, ["rev-parse", "--verify", `${revision}^{commit}`], {
      environment,
    }).stdout,
  ).trim();
}

function resolveBase(
  repo: string,
  revision: string,
  environment: Record<string, string>,
): string {
  const objectId = text(
    runGit(repo, ["rev-parse", "--verify", `${revision}^{object}`], {
      environment,
    }).stdout,
  ).trim();
  const objectType = text(
    runGit(repo, ["cat-file", "-t", objectId], { environment }).stdout,
  ).trim();
  if (objectType === "commit") return objectId;
  const emptyTree = text(
    runGit(repo, ["hash-object", "-t", "tree", "--stdin"], {
      environment,
      input: new Uint8Array(),
    }).stdout,
  ).trim();
  if (objectType === "tree" && objectId === emptyTree) return objectId;
  return resolveCommit(repo, revision, environment);
}

function committedAttributes(
  repo: string,
  revisions: string[],
  paths: Set<string>,
  environment: Record<string, string>,
): AttributePaths {
  const attributes: AttributePaths = {
    "linguist-generated": new Set(),
    "linguist-vendored": new Set(),
  };
  if (paths.size === 0) return attributes;
  const encodedPaths = [...paths]
    .sort(comparePythonStrings)
    .map(surrogateEncode);
  const pathInput = Uint8Array.from(
    encodedPaths.flatMap((path) => [...path, 0]),
  );
  const temporary = mkdtempSync(join(tmpdir(), "pr-size-index-"));
  try {
    const indexEnvironment = {
      ...environment,
      GIT_INDEX_FILE: join(temporary, "index"),
    };
    for (const revision of revisions) {
      runGit(repo, ["read-tree", revision], { environment: indexEnvironment });
      const fields = splitBytes(
        runGit(
          repo,
          ["check-attr", "-z", "--cached", "--stdin", ...PATH_ATTRIBUTES],
          { input: pathInput, environment: indexEnvironment },
        ).stdout,
        0,
      );
      for (let index = 0; index < fields.length - 2; index += 3) {
        const name = text(fields[index + 1]!);
        const attribute = PATH_ATTRIBUTES.find(
          (candidate) => candidate === name,
        );
        const value = text(fields[index + 2]!);
        if (attribute && (value === "set" || value === "true"))
          attributes[attribute].add(surrogateDecode(fields[index]!));
      }
    }
    return attributes;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function diffEntries(
  repo: string,
  base: string,
  head: string,
  environment: Record<string, string>,
  diffOptions: string[],
): { entries: DiffEntry[]; isRenameDetectionSkipped: boolean } {
  const result = runGit(
    repo,
    [
      "diff",
      "--numstat",
      "-z",
      "--no-ext-diff",
      "--no-textconv",
      "--diff-algorithm=myers",
      "--ignore-submodules=none",
      ...diffOptions,
      base,
      head,
      "--",
    ],
    { environment },
  );
  const fields = splitBytes(result.stdout, 0);
  const entries: DiffEntry[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index]!;
    if (entry.length === 0) continue;
    const firstTab = entry.indexOf(9);
    const secondTab = entry.indexOf(9, firstTab + 1);
    const added = text(entry.subarray(0, firstTab));
    const deleted = text(entry.subarray(firstTab + 1, secondTab));
    const lineCounts =
      added === "-" || deleted === "-"
        ? null
        : {
            additions: Number.parseInt(added, 10),
            deletions: Number.parseInt(deleted, 10),
          };
    const pathBytes = entry.subarray(secondTab + 1);
    if (pathBytes.length > 0) {
      entries.push({
        path: surrogateDecode(pathBytes),
        previousPath: null,
        lineCounts,
      });
      continue;
    }
    // a rename's numstat record carries its source and destination as the next two fields
    entries.push({
      path: surrogateDecode(fields[index + 2]!),
      previousPath: surrogateDecode(fields[index + 1]!),
      lineCounts,
    });
    index += 2;
  }
  return {
    entries,
    isRenameDetectionSkipped: text(result.stderr).includes(
      RENAME_LIMIT_WARNING,
    ),
  };
}

function exclusionBucket(
  entry: DiffEntry,
  attributes: AttributePaths,
): ExclusionBucket | null {
  const paths = entry.previousPath
    ? [entry.previousPath, entry.path]
    : [entry.path];
  if (
    paths.some(
      (path) =>
        PACKAGE_LOCKFILES.has(basename(path)) ||
        attributes["linguist-generated"].has(path),
    )
  )
    return "generated";
  if (paths.some((path) => attributes["linguist-vendored"].has(path)))
    return "vendored";
  if (paths.some(isSnapshotPath)) return "snapshot";
  if (paths.some(isTestPath)) return "test";
  return null;
}

function isSnapshotPath(path: string): boolean {
  return (
    path.endsWith(".snap") ||
    path.split("/").slice(0, -1).includes("__snapshots__")
  );
}

function isTestPath(path: string): boolean {
  return (
    // a story with play() is the component test the web testing standard requires
    /\.(?:spec|stories|test)\./.test(basename(path)) ||
    path.split("/").slice(0, -1).includes("__tests__")
  );
}

function diffObjects(
  repo: string,
  base: string,
  head: string,
  environment: Record<string, string>,
): [Set<string>, Set<string>] {
  const fields = splitBytes(
    runGit(
      repo,
      [
        "diff",
        "--raw",
        "-z",
        "--abbrev=64",
        "--full-index",
        "--no-renames",
        "--no-ext-diff",
        "--no-textconv",
        "--diff-algorithm=myers",
        "--ignore-submodules=none",
        base,
        head,
        "--",
      ],
      { environment },
    ).stdout,
    0,
  );
  const objectIds = new Set<string>();
  const paths = new Set<string>();
  for (let index = 0; index < fields.length - 1; index += 2) {
    const header = text(fields[index]!);
    paths.add(surrogateDecode(fields[index + 1]!));
    const [oldMode, newMode, oldId, newId] = header.slice(1).split(" ", 5);
    for (const [mode, objectId] of [
      [oldMode, oldId],
      [newMode, newId],
    ]) {
      if (mode !== "160000" && objectId && /[^0]/.test(objectId))
        objectIds.add(objectId);
    }
  }
  return [paths, objectIds];
}

function attributePaths(paths: Set<string>): Set<string> {
  const attributes = new Set([".gitattributes"]);
  // node:path would replace the lone surrogates that carry undecodable path bytes
  for (const path of paths)
    for (
      let end = path.lastIndexOf("/");
      end > 0;
      end = path.lastIndexOf("/", end - 1)
    )
      attributes.add(`${path.slice(0, end)}/.gitattributes`);
  return attributes;
}

function blobIdsAtPaths(
  repo: string,
  revision: string,
  paths: Set<string>,
  environment: Record<string, string>,
): Set<string> {
  const orderedPaths = [...paths].sort(comparePythonStrings);
  const literalEnvironment = { ...environment, GIT_LITERAL_PATHSPECS: "1" };
  // undecodable path bytes cannot travel as pathspec arguments, so list the whole tree instead
  const listings = orderedPaths.some((path) => /[\udc80-\udcff]/.test(path))
    ? [["-r", "-z", "--full-tree", revision]]
    : Array.from(
        {
          length: Math.ceil(orderedPaths.length / GIT_ARGUMENT_BATCH_SIZE),
        },
        (_, batch) => [
          "-z",
          "--full-tree",
          revision,
          "--",
          ...orderedPaths.slice(
            batch * GIT_ARGUMENT_BATCH_SIZE,
            (batch + 1) * GIT_ARGUMENT_BATCH_SIZE,
          ),
        ],
      );
  return new Set(
    listings
      .flatMap((listing) =>
        splitBytes(
          runGit(repo, ["ls-tree", ...listing], {
            environment: literalEnvironment,
          }).stdout,
          0,
        ).filter((part) => part.length > 0),
      )
      .map((entry) => {
        const separator = entry.indexOf(9);
        const [, objectType, objectId] = text(
          entry.subarray(0, separator),
        ).split(" ", 3);
        return {
          objectId: objectId!,
          objectType,
          path: surrogateDecode(entry.subarray(separator + 1)),
        };
      })
      // a gitlink has no blob to hydrate
      .filter((entry) => entry.objectType === "blob" && paths.has(entry.path))
      .map((entry) => entry.objectId),
  );
}

function hydrateObjects(
  repo: string,
  objectIds: Set<string>,
  environment: Record<string, string>,
): void {
  if (objectIds.size === 0) return;
  const orderedIds = [...objectIds].sort();
  const result = runGit(repo, ["cat-file", "--batch-check"], {
    input: new TextEncoder().encode(`${orderedIds.join("\n")}\n`),
    environment: { ...environment, GIT_NO_LAZY_FETCH: "1" },
  });
  const missingIds = text(result.stdout)
    .split(/\r?\n/)
    .filter((line) => line.endsWith(" missing"))
    .map((line) => line.split(" ", 1)[0]!);
  if (missingIds.length === 0) return;
  const remoteResult = runGit(
    repo,
    ["config", "--local", "--get-regexp", String.raw`^remote\..*\.promisor$`],
    // exit 1 with empty output means no promisor key is configured
    { environment, check: false },
  );
  const remotes: string[] = [];
  for (const line of text(remoteResult.stdout).split(/\r?\n/).filter(Boolean)) {
    const separator = line.lastIndexOf(" ");
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    const remote = key.replace(/^remote\./, "").replace(/\.promisor$/, "");
    if (
      value.toLowerCase() === "true" &&
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(remote)
    )
      remotes.push(remote);
  }
  if (remotes.length === 0)
    throw new Error("missing objects require a configured promisor remote");
  const fetchEnvironment = {
    ...inheritedEnvironment(TRANSPORT_ENVIRONMENT),
    ...environment,
  };
  for (
    let start = 0;
    start < missingIds.length;
    start += GIT_ARGUMENT_BATCH_SIZE
  ) {
    const batch = missingIds.slice(start, start + GIT_ARGUMENT_BATCH_SIZE);
    const failures: string[] = [];
    let fetched = false;
    for (const remote of remotes) {
      const fetchResult = runGit(
        repo,
        [
          "fetch",
          "--quiet",
          "--no-tags",
          "--no-write-fetch-head",
          remote,
          ...batch,
        ],
        { environment: fetchEnvironment, check: false },
      );
      if (fetchResult.exitCode === 0) {
        fetched = true;
        break;
      }
      failures.push(text(fetchResult.stderr).trim());
    }
    if (!fetched)
      throw new Error(
        failures.filter(Boolean).join("; ") ||
          "promisor remotes could not provide required objects",
      );
  }
}

function loadSizeThresholds(): SizeThresholds {
  const source = expectExactObject(
    JSON.parse(readFileSync(SIZE_THRESHOLDS, "utf8")),
    [
      "line_bump",
      "rename_similarity_percent",
      "risk_floors",
      "schema_version",
      "unit_bands",
    ],
    "thresholds",
  );
  if (source.schema_version !== 2)
    throw new Error(`invalid PR-size threshold schema: ${SIZE_THRESHOLDS}`);
  return {
    unitBands: parseUnitBands(source.unit_bands),
    riskFloors: parseRiskFloors(source.risk_floors),
    lineBump: parseLineBump(source.line_bump),
    renameSimilarityPercent: parseRenameSimilarity(
      source.rename_similarity_percent,
    ),
  };
}

function parseUnitBands(value: unknown): UnitBand[] {
  if (!Array.isArray(value))
    throw new TypeError(
      `PR-size unit_bands must be an array: ${SIZE_THRESHOLDS}`,
    );
  const bands = value.map((entry: unknown, index) => {
    const band = expectExactObject(
      entry,
      ["max_units", "reason", "zone"],
      `unit band ${index + 1}`,
    );
    expectReason(band.reason, `unit band ${index + 1} reason`);
    return {
      zone: band.zone,
      maxUnits: expectPositiveInteger(
        band.max_units,
        `unit band ${index + 1} max_units`,
      ),
    };
  });
  if (
    bands.length !== UNIT_BAND_ZONES.length ||
    bands.some((band, index) => band.zone !== UNIT_BAND_ZONES[index])
  )
    throw new Error(
      `PR-size unit bands must be ordered green, yellow, red: ${SIZE_THRESHOLDS}`,
    );
  for (let index = 1; index < bands.length; index += 1) {
    if (bands[index - 1]!.maxUnits >= bands[index]!.maxUnits)
      throw new Error(
        `PR-size unit band maxima must increase (${UNIT_BAND_ZONES[index - 1]} -> ${UNIT_BAND_ZONES[index]}): ${SIZE_THRESHOLDS}`,
      );
  }
  return bands.map((band, index) => ({
    zone: UNIT_BAND_ZONES[index]!,
    maxUnits: band.maxUnits,
  }));
}

function parseRiskFloors(value: unknown): Record<RiskClass, Zone> {
  const riskFloors = expectExactObject(
    value,
    ["floors", "reason"],
    "risk_floors",
  );
  expectReason(riskFloors.reason, "risk_floors reason");
  const floors = expectExactObject(
    riskFloors.floors,
    [...RISK_CLASSES],
    "risk_floors floors",
  );
  return {
    R0: expectZone(floors.R0, "R0"),
    R1: expectZone(floors.R1, "R1"),
    R2: expectZone(floors.R2, "R2"),
    R3: expectZone(floors.R3, "R3"),
  };
}

function parseLineBump(value: unknown): SizeThresholds["lineBump"] {
  const lineBump = expectExactObject(
    value,
    ["authored_lines_above", "reason", "steps"],
    "line_bump",
  );
  expectReason(lineBump.reason, "line_bump reason");
  return {
    authoredLinesAbove: expectPositiveInteger(
      lineBump.authored_lines_above,
      "line_bump authored_lines_above",
    ),
    steps: expectPositiveInteger(lineBump.steps, "line_bump steps"),
  };
}

function parseRenameSimilarity(value: unknown): number {
  const similarity = expectExactObject(
    value,
    ["reason", "value"],
    "rename_similarity_percent",
  );
  expectReason(similarity.reason, "rename_similarity_percent reason");
  return expectPositiveInteger(
    similarity.value,
    "rename_similarity_percent value",
    MAX_SIMILARITY_PERCENT,
  );
}

function expectExactObject(
  value: unknown,
  keys: string[],
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== [...keys].sort().join()
  )
    throw new Error(
      `invalid PR-size ${label} shape, expected keys ${keys.join(", ")}: ${SIZE_THRESHOLDS}`,
    );
  return value as Record<string, unknown>;
}

function expectReason(value: unknown, label: string): void {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(
      `PR-size ${label} must be a non-empty string: ${SIZE_THRESHOLDS}`,
    );
}

function expectPositiveInteger(
  value: unknown,
  label: string,
  maximum = Number.POSITIVE_INFINITY,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > maximum
  )
    throw new Error(
      `PR-size ${label} must be a positive integer${maximum === Number.POSITIVE_INFINITY ? "" : ` of at most ${maximum}`}: ${SIZE_THRESHOLDS}`,
    );
  return value;
}

function expectZone(value: unknown, riskClass: RiskClass): Zone {
  const zone = ZONES.find((candidate) => candidate === value);
  if (!zone)
    throw new Error(
      `PR-size risk floor ${riskClass} must be one of ${ZONES.join(", ")}: ${SIZE_THRESHOLDS}`,
    );
  return zone;
}

function zoneFields(
  inventory: ChangeInventory | null,
  hasLineBump: boolean,
  thresholds: SizeThresholds,
): Record<string, unknown> {
  if (!inventory)
    return {
      risk_class: null,
      risk_floor: null,
      tier: null,
      unit_band: null,
      units: null,
      zone: null,
    };
  const unitBand =
    thresholds.unitBands.find((band) => inventory.units <= band.maxUnits)
      ?.zone ?? "black";
  const riskFloor = thresholds.riskFloors[inventory.riskClass];
  const tier = Math.max(ZONES.indexOf(unitBand), ZONES.indexOf(riskFloor));
  const zone = Math.min(
    tier + (hasLineBump ? thresholds.lineBump.steps : 0),
    ZONES.length - 1,
  );
  return {
    risk_class: inventory.riskClass,
    risk_floor: riskFloor,
    tier: ZONES[tier],
    unit_band: unitBand,
    units: inventory.units,
    zone: ZONES[zone],
  };
}

function withIsolatedRepository<T>(
  repo: string,
  environment: Record<string, string>,
  action: (
    isolatedRepo: string,
    isolatedEnvironment: Record<string, string>,
  ) => T,
): T {
  let commonDirectory = text(
    runGit(repo, ["rev-parse", "--git-common-dir"], { environment }).stdout,
  ).trim();
  if (!isAbsolute(commonDirectory))
    commonDirectory = resolve(repo, commonDirectory);
  const objectFormat = text(
    runGit(repo, ["rev-parse", "--show-object-format"], { environment }).stdout,
  ).trim();
  const temporaryRoot = mkdtempSync(join(tmpdir(), "pr-size-"));
  const bareRepo = join(temporaryRoot, "repository.git");
  const isolatedEnvironment = {
    ...environment,
    GIT_ALTERNATE_OBJECT_DIRECTORIES: join(commonDirectory, "objects"),
    XDG_CONFIG_HOME: join(temporaryRoot, "xdg"),
  };
  try {
    const result = Bun.spawnSync(
      [
        "git",
        "init",
        "--bare",
        "--quiet",
        `--object-format=${objectFormat}`,
        bareRepo,
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
        env: isolatedEnvironment,
      },
    );
    if (result.exitCode !== 0)
      throw new GitCommandError({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      });
    return action(bareRepo, isolatedEnvironment);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

/**
 * classifies the diff between two revisions into authored lines and, with an inventory, a PR-size zone
 * @param repo - path to the repository holding both revisions
 * @param baseRevision - base revision, resolved to a commit or the empty tree
 * @param headRevision - head revision, resolved to a commit
 * @param inventory - declared units and risk class, or null when the zone stays undetermined
 * @returns size metrics keyed by their wire-format snake_case names
 */
export function classify(
  repo: string,
  baseRevision: string,
  headRevision: string,
  inventory: ChangeInventory | null = null,
): Record<string, unknown> {
  const thresholds = loadSizeThresholds();
  const environment = hermeticEnvironment();
  const base = resolveBase(repo, baseRevision, environment);
  const head = resolveCommit(repo, headRevision, environment);
  const [sourcePaths, sourceObjectIds] = diffObjects(
    repo,
    base,
    head,
    environment,
  );
  const attributes = attributePaths(sourcePaths);
  const attributeObjectIds = blobIdsAtPaths(
    repo,
    base,
    attributes,
    environment,
  );
  for (const objectId of blobIdsAtPaths(repo, head, attributes, environment))
    attributeObjectIds.add(objectId);
  hydrateObjects(
    repo,
    new Set([...sourceObjectIds, ...attributeObjectIds]),
    environment,
  );
  const renameOptions = [
    `--find-renames=${thresholds.renameSimilarityPercent}%`,
    `-l${RENAME_CANDIDATE_LIMIT}`,
  ];
  const { changes, isRenameDetectionSkipped, authoredCounts, pathAttributes } =
    withIsolatedRepository(
      repo,
      environment,
      (isolatedRepo, isolatedEnvironment) => {
        const { entries: changes, isRenameDetectionSkipped } = diffEntries(
          isolatedRepo,
          base,
          head,
          isolatedEnvironment,
          renameOptions,
        );
        // formatting-only hunks drop out under ignore-all-space plus ignore-blank-lines
        const { entries: authoredEntries } = diffEntries(
          isolatedRepo,
          base,
          head,
          isolatedEnvironment,
          [...renameOptions, "--ignore-all-space", "--ignore-blank-lines"],
        );
        return {
          changes,
          isRenameDetectionSkipped,
          authoredCounts: new Map(
            authoredEntries.map((entry) => [entry.path, entry.lineCounts]),
          ),
          pathAttributes: committedAttributes(
            isolatedRepo,
            [base, head],
            new Set(
              changes.flatMap((entry) =>
                entry.previousPath
                  ? [entry.previousPath, entry.path]
                  : [entry.path],
              ),
            ),
            isolatedEnvironment,
          ),
        };
      },
    );

  let additions = 0;
  let deletions = 0;
  const buckets: Record<ExclusionBucket, string[]> = {
    generated: [],
    snapshot: [],
    test: [],
    vendored: [],
  };
  const binaryFiles: string[] = [];
  for (const entry of changes) {
    const bucket = exclusionBucket(entry, pathAttributes);
    if (bucket) buckets[bucket].push(entry.path);
    else if (!entry.lineCounts) binaryFiles.push(entry.path);
    else {
      const counts = authoredCounts.get(entry.path);
      additions += counts?.additions ?? 0;
      deletions += counts?.deletions ?? 0;
    }
  }
  const authoredLines = additions + deletions;
  const hasLineBump = authoredLines > thresholds.lineBump.authoredLinesAbove;
  return {
    authored_additions: additions,
    authored_deletions: deletions,
    authored_lines: authoredLines,
    base_oid: base,
    binary_files: binaryFiles.sort(comparePythonStrings),
    excluded_files: {
      snapshot: buckets.snapshot.sort(comparePythonStrings),
      test: buckets.test.sort(comparePythonStrings),
      vendored: buckets.vendored.sort(comparePythonStrings),
    },
    generated_files: buckets.generated.sort(comparePythonStrings),
    head_oid: head,
    line_bump: hasLineBump,
    renamed_files: changes
      .filter((entry) => entry.previousPath !== null)
      .map((entry) => ({ from: entry.previousPath, to: entry.path }))
      .sort((left, right) => comparePythonStrings(left.to, right.to)),
    rename_detection_skipped: isRenameDetectionSkipped,
    ...zoneFields(inventory, hasLineBump, thresholds),
  };
}

function pythonJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(pythonJson).join(", ")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([left], [right]) => comparePythonStrings(left, right))
      .map(([key, item]) => `${pythonString(key)}: ${pythonJson(item)}`)
      .join(", ")}}`;
  return typeof value === "string"
    ? pythonString(value)
    : JSON.stringify(value);
}

function pythonString(value: string): string {
  return JSON.stringify(value).replace(
    /[^\x00-\x7f]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function isSeparatedArgumentValue(value: string): boolean {
  return (
    !value.startsWith("-") ||
    value === "-" ||
    ARGPARSE_NEGATIVE_NUMBER.test(value)
  );
}

function classifierArgumentError(message: string): ArgumentExit {
  process.stderr.write(`${USAGE}\nclassify-pr-size.ts: error: ${message}\n`);
  return { exitCode: 2 };
}

function showHelp(): ArgumentExit {
  process.stdout.write(HELP);
  return { exitCode: 0 };
}

function resolveClassifierOption(rawArgument: string): string | ArgumentExit {
  const name = rawArgument.split("=", 1)[0]!;
  const candidates = CLASSIFIER_OPTIONS.filter((option) =>
    option.startsWith(name),
  );
  if (candidates.includes(name)) return name;
  if (candidates.length > 1)
    return classifierArgumentError(
      `ambiguous option: ${rawArgument} could match ${candidates.join(", ")}`,
    );
  return candidates[0] ?? rawArgument;
}

function parseArguments(argv: string[]): ClassifierArguments | ArgumentExit {
  let repo = process.cwd();
  let base: string | undefined;
  let head: string | undefined;
  let units: number | undefined;
  let riskClass: RiskClass | undefined;
  const unknown: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const rawArgument = argv[index]!;
    const equals = rawArgument.indexOf("=");
    if (rawArgument === "-h" || rawArgument.startsWith("-h=")) {
      if (rawArgument !== "-h")
        return classifierArgumentError(
          `argument -h/--help: ignored explicit argument '${rawArgument.slice(3)}'`,
        );
      return showHelp();
    }
    const argument = rawArgument.startsWith("--")
      ? resolveClassifierOption(rawArgument)
      : rawArgument;
    if (typeof argument !== "string") return argument;
    if (argument === "--help") {
      if (equals >= 0)
        return classifierArgumentError(
          `argument -h/--help: ignored explicit argument '${rawArgument.slice(equals + 1)}'`,
        );
      return showHelp();
    }
    if (!CLASSIFIER_OPTIONS.includes(argument)) {
      unknown.push(rawArgument);
      continue;
    }
    const inlineValue = equals < 0 ? undefined : rawArgument.slice(equals + 1);
    const value = inlineValue ?? argv[index + 1];
    if (
      value === undefined ||
      (inlineValue === undefined && !isSeparatedArgumentValue(value))
    )
      return classifierArgumentError(
        `argument ${argument}: expected one argument`,
      );
    if (inlineValue === undefined) index += 1;
    if (argument === "--repo") repo = value;
    else if (argument === "--base") base = value;
    else if (argument === "--head") head = value;
    else if (argument === "--units") {
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
        return classifierArgumentError(
          `argument --units: invalid non-negative integer value: '${value}'`,
        );
      units = Number(value);
    } else {
      riskClass = RISK_CLASSES.find((candidate) => candidate === value);
      if (!riskClass)
        return classifierArgumentError(
          `argument --risk: invalid choice: '${value}' (choose from ${RISK_CLASSES.map((candidate) => `'${candidate}'`).join(", ")})`,
        );
    }
  }
  const missing = [
    ["--base", base],
    ["--head", head],
  ]
    .filter(([, value]) => value === undefined)
    .map(([name]) => name);
  if (missing.length)
    return classifierArgumentError(
      `the following arguments are required: ${missing.join(", ")}`,
    );
  if (unknown.length)
    return classifierArgumentError(
      `unrecognized arguments: ${unknown.join(" ")}`,
    );
  if ((units === undefined) !== (riskClass === undefined))
    return classifierArgumentError(
      "arguments --units and --risk must be given together",
    );
  return {
    repo,
    base: base!,
    head: head!,
    inventory:
      units === undefined || riskClass === undefined
        ? null
        : { riskClass, units },
  };
}

/**
 * runs the command-line entry point and writes the classification as JSON
 * @param argv - command-line arguments with the executable path already removed
 * @returns 0 on success or help, 2 on a usage error, and 1 on a classification failure
 */
export function main(argv = process.argv.slice(2)): number {
  const parsed = parseArguments(argv);
  if ("exitCode" in parsed) return parsed.exitCode;
  try {
    process.stdout.write(
      `${pythonJson(classify(resolve(parsed.repo), parsed.base, parsed.head, parsed.inventory))}\n`,
    );
    return 0;
  } catch (error) {
    const caughtError = error as Error;
    process.stderr.write(`${caughtError.message}\n`);
    return 1;
  }
}

/* v8 ignore next */
if (import.meta.main) process.exitCode = main();
