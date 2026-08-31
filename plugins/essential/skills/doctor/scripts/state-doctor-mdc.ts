#!/usr/bin/env bun
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import {
  decodeStateDashboard,
  StateValidationFailure,
  type ValidationError,
} from "../../../scripts/state-codec.ts";
import { parse, type MdcNode } from "../../../scripts/vendor/mdc-bundle.mjs";

interface Options {
  strict: boolean;
  repositoryRoot?: string;
  stateDir?: string;
  workDir?: string;
  workId?: string;
}

type Check =
  | "adr"
  | "lease"
  | "state-format"
  | "state-graph"
  | "state-overview";
interface Finding {
  check: Check;
  severity: "error" | "warning";
  message: string;
  fix: string;
  document?: string;
  work?: string;
}

interface DocumentIdentity {
  kind?: string;
  ref?: string;
  workId?: string;
  workRef?: string;
  sources: string[];
}

function argumentsOf(args: string[]): Options {
  const output: Options = { strict: false };
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === "--json") continue;
    if (item === "--strict") {
      output.strict = true;
      continue;
    }
    if (item === "--bootstrap")
      throw new Error("--bootstrap was removed; use resolve-state-workspace");
    const pair =
      /^(--repository-root|--state-dir|--work-dir|--work-id)=(.+)$/.exec(item);
    const key = pair?.[1] ?? item;
    const value =
      pair?.[2] ??
      (["--repository-root", "--state-dir", "--work-dir", "--work-id"].includes(
        item,
      )
        ? args[++index]
        : undefined);
    if (!value) throw new Error(`unknown or incomplete argument: ${item}`);
    if (key === "--repository-root") output.repositoryRoot = resolve(value);
    else if (key === "--state-dir") output.stateDir = resolve(value);
    else if (key === "--work-dir") output.workDir = resolve(value);
    else if (key === "--work-id") output.workId = value;
    else throw new Error(`unknown argument: ${item}`);
  }
  return output;
}

async function exists(path: string): Promise<boolean> {
  return Boolean(await lstat(path).catch(() => undefined));
}

function within(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return (
    path === "" ||
    (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path))
  );
}

async function filesUnder(
  root: string,
  predicate: (name: string) => boolean,
): Promise<string[]> {
  const output: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(
      () => [],
    )) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(path);
      else if (predicate(entry.name)) output.push(path);
    }
  }
  await visit(root);
  return output.sort();
}

async function legacy(root: string): Promise<string[]> {
  const names = new Set([
    "overview.md",
    "environment.md",
    "traps.md",
    "goal.md",
    "state.md",
    "working.md",
    "journal.md",
  ]);
  return filesUnder(root, (name) => names.has(name));
}

interface StreamDirectory {
  group: "works" | "archive";
  id: string;
  directory: string;
}

async function streamDirectories(stateDir: string): Promise<StreamDirectory[]> {
  const output: StreamDirectory[] = [];
  for (const group of ["works", "archive"] as const) {
    for (const entry of await readdir(join(stateDir, group), {
      withFileTypes: true,
    }).catch(() => [])) {
      if (entry.isDirectory() && !entry.isSymbolicLink())
        output.push({
          group,
          id: entry.name,
          directory: join(stateDir, group, entry.name),
        });
    }
  }
  return output.sort((left, right) =>
    left.directory.localeCompare(right.directory),
  );
}

function documentIdentity(source: string): DocumentIdentity {
  const ast = parse(source);
  const annotations = ast.annotations ?? {};
  const sources: string[] = [];
  const visit = (node: MdcNode): void => {
    if (
      node.type === "state.source" &&
      typeof node.annotations?.href === "string"
    )
      sources.push(node.annotations.href);
    for (const child of node.children ?? []) visit(child);
  };
  visit(ast);
  return {
    kind: typeof annotations.kind === "string" ? annotations.kind : undefined,
    ref: typeof annotations.ref === "string" ? annotations.ref : undefined,
    workId:
      typeof annotations.workId === "string" ? annotations.workId : undefined,
    workRef:
      typeof annotations.workRef === "string" ? annotations.workRef : undefined,
    sources,
  };
}

async function hasSymlinkComponent(
  stateRoot: string,
  candidate: string,
): Promise<boolean> {
  const path = relative(stateRoot, candidate);
  let current = stateRoot;
  for (const segment of path.split(sep).filter(Boolean)) {
    current = join(current, segment);
    if ((await lstat(current).catch(() => undefined))?.isSymbolicLink())
      return true;
  }
  return false;
}

function safeStateHref(href: string): boolean {
  const segments = href.split("/");
  return (
    href.endsWith(".mdc") &&
    !href.includes("\\") &&
    !isAbsolute(href) &&
    segments.length > 0 &&
    segments.every(
      (segment) => segment.length > 0 && segment !== "." && segment !== "..",
    )
  );
}

async function reachableDocuments(
  root: string,
  stateRoot: string,
): Promise<{ reached: Set<string>; findings: Finding[] }> {
  const reached = new Set<string>();
  const findings: Finding[] = [];
  async function visit(path: string): Promise<void> {
    if (!within(stateRoot, path)) {
      findings.push(
        finding(
          "state-graph",
          "state.source path escapes the canonical .state root",
          "Use a POSIX relative .mdc path contained by .state.",
          path,
        ),
      );
      return;
    }
    if (await hasSymlinkComponent(stateRoot, path)) {
      findings.push(
        finding(
          "state-graph",
          "state.source path contains a symlink component",
          "Replace the symlink with a regular in-tree MDC document.",
          path,
        ),
      );
      return;
    }
    const canonical = await realpath(path).catch(() => undefined);
    if (!canonical || !within(stateRoot, canonical) || reached.has(canonical))
      return;
    reached.add(canonical);
    const identity = documentIdentity(await readFile(canonical, "utf8"));
    for (const href of identity.sources) {
      if (!safeStateHref(href)) {
        findings.push(
          finding(
            "state-graph",
            "state.source href must be a POSIX relative .mdc path",
            "Use a typed state.source link to an in-tree MDC document; keep locator URIs in entity fields.",
            canonical,
          ),
        );
        continue;
      }
      await visit(resolve(dirname(canonical), href));
    }
  }
  await visit(root);
  return { reached, findings };
}

function finding(
  check: Check,
  message: string,
  fix: string,
  document?: string,
  work?: string,
  severity: "error" | "warning" = "error",
): Finding {
  return {
    check,
    severity,
    message,
    fix,
    ...(document ? { document } : {}),
    ...(work ? { work } : {}),
  };
}

function asFinding(error: ValidationError, root: string): Finding {
  return finding(
    "state-graph",
    `${error.code}: ${error.message}`,
    "Repair the essential.state/v1 graph and rerun Doctor.",
    error.document,
    /\/(works|archive)\//.test(root)
      ? basename(resolve(root, ".."))
      : undefined,
  );
}

async function leaseFindings(
  directory: string,
  id: string,
): Promise<Finding[]> {
  const path = join(directory, "lease.json");
  if (!(await exists(path))) return [];
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return [
      finding(
        "lease",
        "corrupt lease.json",
        "Remove or repair the corrupt lease only through an approved Doctor repair.",
        path,
        id,
      ),
    ];
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return [
      finding(
        "lease",
        "corrupt lease.json",
        "Remove or repair the corrupt lease only through an approved Doctor repair.",
        path,
        id,
      ),
    ];
  const lease = value as Record<string, unknown>;
  if (
    lease.work_id !== id ||
    typeof lease.expires_at_epoch !== "number" ||
    !Number.isFinite(lease.expires_at_epoch)
  )
    return [
      finding(
        "lease",
        "lease fields do not match the owning work directory",
        "Repair the lease metadata through an approved Doctor repair.",
        path,
        id,
      ),
    ];
  if (lease.expires_at_epoch <= Math.floor(Date.now() / 1000))
    return [
      finding(
        "lease",
        "stale coordinator lease requires explicit takeover or release",
        "Use the lease takeover workflow before writing this stream.",
        path,
        id,
        "warning",
      ),
    ];
  return [];
}

function adrNumber(name: string): string | undefined {
  return /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.exec(name)?.[1];
}

async function adrFindings(repositoryRoot: string): Promise<Finding[]> {
  const architecture = join(repositoryRoot, "docs", "architecture");
  const decisions = join(architecture, "decisions");
  if (!(await exists(decisions))) return [];
  const effective = await markdownNames(decisions);
  const archivedRoot = join(decisions, "superseded");
  const archived = await markdownNames(archivedRoot);
  const output = [
    ...(await effectiveAdrFindings(decisions, effective)),
    ...(await archivedAdrFindings(archivedRoot, archived, effective)),
  ];
  return [
    ...output,
    ...(await adrIndexFindings(architecture, effective, archived)),
  ];
}

async function markdownNames(directory: string): Promise<string[]> {
  return (await readdir(directory, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
}

async function effectiveAdrFindings(
  decisions: string,
  effective: string[],
): Promise<Finding[]> {
  const output: Finding[] = [];
  for (const name of effective) {
    const path = join(decisions, name);
    const number = adrNumber(name);
    const body = await readFile(path, "utf8");
    if (!number || !new RegExp(`^# ADR-${number}: \\S`, "m").test(body))
      output.push(
        finding(
          "adr",
          "effective ADR filename and canonical heading do not match",
          "Rename the ADR or repair its canonical heading after approval.",
          path,
        ),
      );
    if (/Status:\s*Superseded|Superseded by:|\]\([^)]*superseded\//i.test(body))
      output.push(
        finding(
          "adr",
          "effective ADR contains supersession metadata",
          "Move historical metadata to the archived predecessor after approval.",
          path,
        ),
      );
    if (/\[(?:TODO|Description|Decision|Context)\]/i.test(body))
      output.push(
        finding(
          "adr",
          "effective ADR contains an unresolved template placeholder",
          "Replace the placeholder with approved decision content.",
          path,
        ),
      );
  }
  return output;
}

async function archivedAdrFindings(
  archivedRoot: string,
  archived: string[],
  effective: string[],
): Promise<Finding[]> {
  const output: Finding[] = [];
  for (const name of archived) {
    const path = join(archivedRoot, name);
    const number = adrNumber(name);
    const body = await readFile(path, "utf8");
    const successor =
      /^> \*\*Status:\*\* Superseded\n>\n> \*\*Superseded by:\*\* \[ADR-(\d{4}) — [^\]]+\]\(\.\.\/(\d{4})-([^)]+)\.md\)\n>\n> \*\*What changed:\*\* ([^\n]+)/.exec(
        body,
      );
    const successorName = successor
      ? `${successor[2]}-${successor[3]}.md`
      : undefined;
    if (
      !number ||
      !new RegExp(`^# ADR-${number}: \\S`, "m").test(body) ||
      !successor ||
      !/\b(partial|complete)\b/i.test(successor?.[4] ?? "")
    )
      output.push(
        finding(
          "adr",
          "archived ADR violates the supersession header or retained-body contract",
          "Repair only the prepended header and preserve the historical body.",
          path,
        ),
      );
    else if (
      successor[1] !== successor[2] ||
      Number(successor[1]) <= Number(number) ||
      !successorName ||
      !effective.includes(successorName)
    )
      output.push(
        finding(
          "adr",
          "archived ADR successor is missing, inconsistent, or not later",
          "Point the header at an existing later effective ADR.",
          path,
        ),
      );
  }
  return output;
}

async function adrIndexFindings(
  architecture: string,
  effective: string[],
  archived: string[],
): Promise<Finding[]> {
  const indexPath = join(architecture, "README.md");
  if (!(await exists(indexPath)))
    return [
      finding(
        "adr",
        "architecture index is missing",
        "Create the architecture index and list every effective ADR as Accepted.",
        indexPath,
      ),
    ];
  const index = await readFile(indexPath, "utf8");
  const rows = index.split("\n").filter((line) => /^\s*\|/.test(line));
  const headerIndex = rows.findIndex((line) => /\bStatus\b/.test(line));
  const output: Finding[] = [];
  if (headerIndex < 0 || !rows[headerIndex + 1])
    output.push(
      finding(
        "adr",
        "ADR index lacks a valid table with a Status column",
        "Repair the ADR index table.",
        indexPath,
      ),
    );
  else
    output.push(
      ...validateAdrIndexTable(
        rows,
        headerIndex,
        index,
        indexPath,
        effective,
        archived,
      ),
    );
  return output;
}

function tableCells(row: string): string[] {
  return row
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function validateAdrIndexTable(
  rows: string[],
  headerIndex: number,
  index: string,
  indexPath: string,
  effective: string[],
  archived: string[],
): Finding[] {
  const output: Finding[] = [];
  const header = tableCells(rows[headerIndex]);
  const delimiter = tableCells(rows[headerIndex + 1]);
  const statusColumn = header.indexOf("Status");
  const tableRows = rows.slice(headerIndex + 2).map(tableCells);
  if (
    delimiter.length !== header.length ||
    delimiter.some((cell) => !/^:?-{3,}:?$/.test(cell))
  )
    output.push(
      finding(
        "adr",
        "ADR index delimiter does not match its header",
        "Repair the ADR index table delimiter.",
        indexPath,
      ),
    );
  output.push(
    ...effectiveAdrIndexFindings(effective, tableRows, statusColumn, indexPath),
    ...archivedAdrIndexFindings(archived, index, indexPath),
  );
  return output;
}

function effectiveAdrIndexFindings(
  effective: string[],
  rows: string[][],
  statusColumn: number,
  indexPath: string,
): Finding[] {
  return effective.flatMap((name) => {
    const row = rows.find((candidate) =>
      candidate.some((cell) => cell.includes(`decisions/${name}`)),
    );
    return !row || row[statusColumn] !== "Accepted"
      ? [
          finding(
            "adr",
            `effective ADR is absent or not Accepted in the architecture index: ${name}`,
            "Add the effective ADR to the index with Accepted status.",
            indexPath,
          ),
        ]
      : [];
  });
}

function archivedAdrIndexFindings(
  archived: string[],
  index: string,
  indexPath: string,
): Finding[] {
  return archived.flatMap((name) =>
    index.includes(`decisions/superseded/${name}`)
      ? [
          finding(
            "adr",
            `archived ADR appears in the effective architecture index: ${name}`,
            "Remove the archived ADR row from the effective index.",
            indexPath,
          ),
        ]
      : [],
  );
}

interface DoctorResult {
  status: string;
  findings: Finding[];
  checked: string[];
}

interface DoctorContext {
  repositoryCanonical: string;
  stateDir: string;
}

export async function diagnose(options: Options): Promise<DoctorResult> {
  const resolved = await resolveDoctorContext(options);
  if ("status" in resolved) return resolved;
  const { repositoryCanonical, stateDir } = resolved;
  const legacyResult = await legacyFormatDiagnosis(options, stateDir);
  if (legacyResult) return legacyResult;
  const directories = await streamDirectories(stateDir);
  const selected = selectedDirectories(options, directories);
  if (options.workId && selected.length === 0)
    return missingWorkResult(stateDir, options.workId);
  const overview = join(stateDir, "overview.mdc");
  const roots = await selectedRoots(options, selected, overview);
  const findings = [
    ...duplicateDirectoryFindings(directories, stateDir),
    ...(await selectedDirectoryFindings(selected)),
    ...(await decodeRootFindings(roots)),
  ];
  const graph = await graphInventoryFindings(
    options.workDir ?? stateDir,
    stateDir,
    roots,
  );
  findings.push(...graph.findings);
  findings.push(
    ...(await overviewLinkFindings(
      options,
      overview,
      directories,
      graph.reached,
    )),
    ...(await adrFindings(repositoryCanonical)),
  );
  return doctorResult(findings, roots);
}

async function resolveDoctorContext(
  options: Options,
): Promise<DoctorContext | DoctorResult> {
  const inferredStateDir =
    options.stateDir ??
    (options.workDir ? resolve(options.workDir, "../..") : undefined);
  const repositoryRoot =
    options.repositoryRoot ??
    (inferredStateDir ? resolve(inferredStateDir, "..") : resolve("."));
  const repositoryCanonical = await realpath(repositoryRoot);
  const stateDir = inferredStateDir ?? join(repositoryCanonical, ".state");
  for (const [label, path] of [
    ["state directory", stateDir],
    ["work directory", options.workDir],
  ] as const) {
    const canonical = path
      ? await realpath(path).catch(() => resolve(path))
      : undefined;
    if (canonical && !within(repositoryCanonical, canonical))
      return {
        status: "invalid",
        checked: [],
        findings: [
          finding(
            "state-graph",
            `${label} escapes --repository-root`,
            "Pass a state path contained by the selected repository root.",
            path,
          ),
        ],
      };
  }
  return { repositoryCanonical, stateDir };
}

async function legacyFormatDiagnosis(
  options: Options,
  stateDir: string,
): Promise<DoctorResult | undefined> {
  const old = await legacy(options.workDir ?? stateDir);
  const mdc = await filesUnder(options.workDir ?? stateDir, (name) =>
    name.endsWith(".mdc"),
  );
  if (old.length) {
    const mixed = mdc.length > 0;
    return {
      status: mixed ? "invalid" : "migration_required",
      checked: [],
      findings: old.map((document) =>
        finding(
          "state-format",
          mixed
            ? "mixed legacy Markdown and MDC state is invalid"
            : "legacy Markdown state requires essential:doctor migration",
          "Run essential:doctor --migrate-state=mdc-v1 with an external backup directory.",
          document,
          options.workDir ? basename(options.workDir) : undefined,
        ),
      ),
    };
  }
  return undefined;
}

function selectedDirectories(
  options: Options,
  directories: StreamDirectory[],
): StreamDirectory[] {
  return options.workDir
    ? directories.filter(
        (item) => resolve(item.directory) === resolve(options.workDir!),
      )
    : directories.filter(
        (item) => !options.workId || item.id === options.workId,
      );
}

function missingWorkResult(stateDir: string, workId: string): DoctorResult {
  return {
    status: "not_found",
    checked: [],
    findings: [
      finding(
        "state-graph",
        `selected work id was not found in works/ or archive/: ${workId}`,
        "Select an existing immutable work id.",
        stateDir,
        workId,
      ),
    ],
  };
}

async function selectedRoots(
  options: Options,
  selected: StreamDirectory[],
  overview: string,
): Promise<string[]> {
  return options.workDir
    ? [join(options.workDir, "state.mdc")]
    : options.workId
      ? selected.map((item) => join(item.directory, "state.mdc"))
      : (await exists(overview))
        ? [overview]
        : selected.map((item) => join(item.directory, "state.mdc"));
}

function duplicateDirectoryFindings(
  directories: StreamDirectory[],
  stateDir: string,
): Finding[] {
  const duplicateIds = new Set<string>();
  for (const item of directories)
    if (directories.some((other) => other !== item && other.id === item.id))
      duplicateIds.add(item.id);
  return [...duplicateIds].map((id) =>
    finding(
      "state-graph",
      `work id appears in both live and archive membership: ${id}`,
      "Keep each work id in exactly one membership directory.",
      stateDir,
      id,
    ),
  );
}

async function selectedDirectoryFindings(
  selected: StreamDirectory[],
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const item of selected) {
    const root = join(item.directory, "state.mdc");
    if (!(await exists(root)))
      findings.push(
        finding(
          "state-graph",
          "work directory has no state.mdc root",
          "Restore or remove the incomplete work directory after approval.",
          root,
          item.id,
        ),
      );
    else {
      try {
        const identity = documentIdentity(await readFile(root, "utf8"));
        if (
          identity.workId !== item.id ||
          !identity.ref?.endsWith(`:work:${item.id}`)
        )
          findings.push(
            finding(
              "state-graph",
              "stream identity does not match its owning directory",
              "Move the stream to its immutable work-id directory or repair the root identity after approval.",
              root,
              item.id,
            ),
          );
        const decoded = await decodeStateDashboard(root);
        const stream = decoded.stream as Record<string, unknown> | undefined;
        const archived = stream?.phase === "archived";
        if (
          (item.group === "archive" && !archived) ||
          (item.group === "works" && archived)
        )
          findings.push(
            finding(
              "state-graph",
              item.group === "archive"
                ? "archive membership requires stream phase archived"
                : "live works membership cannot contain stream phase archived",
              "Move the immutable stream directory only through the lifecycle archive transition.",
              root,
              item.id,
            ),
          );
      } catch {
        // The shared codec reports parse and schema failures below.
      }
    }
    findings.push(...(await leaseFindings(item.directory, item.id)));
  }
  return findings;
}

async function decodeRootFindings(roots: string[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const root of roots) {
    try {
      await decodeStateDashboard(root);
    } catch (error) {
      if (error instanceof StateValidationFailure)
        findings.push(...error.errors.map((item) => asFinding(item, root)));
      else
        findings.push(
          finding(
            "state-graph",
            (error as Error).message,
            "Repair the state graph and rerun Doctor.",
            root,
          ),
        );
    }
  }
  return findings;
}

async function graphInventoryFindings(
  inventoryRoot: string,
  stateDir: string,
  roots: string[],
): Promise<{ findings: Finding[]; reached: Set<string> }> {
  const inventory = await filesUnder(inventoryRoot, (name) =>
    name.endsWith(".mdc"),
  );
  const stateCanonical = await realpath(stateDir).catch(() =>
    resolve(stateDir),
  );
  const reached = new Set<string>();
  const findings: Finding[] = [];
  for (const root of roots) {
    const canonicalRootPath = resolve(
      stateCanonical,
      relative(resolve(stateDir), resolve(root)),
    );
    const traversal = await reachableDocuments(
      canonicalRootPath,
      stateCanonical,
    ).catch(() => ({ reached: new Set<string>(), findings: [] }));
    findings.push(...traversal.findings);
    for (const path of traversal.reached) reached.add(path);
  }
  for (const path of inventory)
    findings.push(...(await inventoryDocumentFindings(path, reached)));
  return { findings, reached };
}

async function inventoryDocumentFindings(
  path: string,
  reached: Set<string>,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const canonical = await realpath(path).catch(() => path);
  if (!reached.has(canonical))
    findings.push(
      finding(
        "state-graph",
        "unreachable MDC document is not committed by a selected root",
        "Link the document from its owning root or remove it after approval.",
        path,
      ),
    );
  const match = /\/(works|archive)\/([^/]+)\//.exec(path);
  if (!match) return findings;
  try {
    const identity = documentIdentity(await readFile(path, "utf8"));
    if (
      identity.kind !== "stream" &&
      identity.workRef !== undefined &&
      !identity.workRef.endsWith(`:work:${match[2]}`)
    )
      findings.push(
        finding(
          "state-graph",
          "supporting document workRef does not match its directory",
          "Move the document to its owning work or repair workRef after approval.",
          path,
          match[2],
        ),
      );
  } catch {
    // The shared codec reports malformed reachable documents.
  }
  return findings;
}

async function overviewLinkFindings(
  options: Options,
  overview: string,
  directories: StreamDirectory[],
  reached: Set<string>,
): Promise<Finding[]> {
  if (options.workDir || options.workId || !(await exists(overview))) return [];
  const findings: Finding[] = [];
  const linkedRoots = new Set(
    [...reached].filter((path) =>
      /\/(works|archive)\/[^/]+\/state\.mdc$/.test(path),
    ),
  );
  for (const item of directories) {
    const root = await realpath(join(item.directory, "state.mdc")).catch(
      () => undefined,
    );
    if (root && !linkedRoots.has(root))
      findings.push(
        finding(
          "state-overview",
          "project overview does not link this stream root",
          "Reconcile overview.mdc and publish it last.",
          root,
          item.id,
        ),
      );
  }
  return findings;
}

function doctorResult(findings: Finding[], roots: string[]): DoctorResult {
  return {
    status: findings.some((item) => item.severity === "error")
      ? "invalid"
      : findings.length
        ? "advisory"
        : "ok",
    findings,
    checked: roots,
  };
}

try {
  const options = argumentsOf(process.argv.slice(2));
  const output = await diagnose(options);
  console.log(JSON.stringify(output));
  if (output.status === "not_found") process.exitCode = 2;
  else if (options.strict && output.findings.length) process.exitCode = 1;
} catch (error) {
  console.log(
    JSON.stringify({
      status: "invalid",
      findings: [
        finding(
          "state-graph",
          (error as Error).message,
          "Correct the invocation and rerun Doctor.",
        ),
      ],
    }),
  );
  process.exitCode = 2;
}
