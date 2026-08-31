#!/usr/bin/env bun
/** Project this marketplace into an OpenCode V1 config directory. */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  cpSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

import { resolveHookReceipts } from "./opencode_hook_receipts.ts";

import type { HookReceipt } from "./opencode_hook_receipts.ts";

type JsonObject = Record<string, unknown>;

// Path(__file__).resolve().parents[1]: fully symlink-resolved so containment
// checks agree with resolvePath even under macOS /var or /tmp aliases.
const ROOT = realpathSync(resolve(import.meta.dirname, ".."));
const MARKETPLACE_PATH = join(ROOT, ".claude-plugin", "marketplace.json");
const ADAPTER_PATH = join(ROOT, "scripts", "opencode_adapter.js");
const CONTRACT_PATH = join(ROOT, "scripts", "opencode_contract.json");
const MANIFEST_RELATIVE_PATH = "alvis/manifest.json";
const SKILL_LINK_PATTERN = /(\]\()([^)\s]+)(\))/g;
const JSON_RELATIVE_PATH_PATTERN = /"(\.\.?\/[^"\\]+)"/g;
const SKILL_DIRECTORY_PATH_PATTERN =
  /(\$(?:\{)?(?:[A-Z][A-Z0-9_]*_)?SKILL_DIR(?:\})?)\/\.\.\/\.\./g;
const PROJECTED_TEXT_SUFFIXES = new Set([
  ".js",
  ".json",
  ".md",
  ".py",
  ".sh",
  ".toml",
  ".ts",
]);
const OPEN_CODE_COLOR_BY_CLAUDE_COLOR: Readonly<Record<string, string>> = {
  blue: "info",
  cyan: "info",
  green: "success",
  magenta: "accent",
  orange: "warning",
  purple: "accent",
  red: "error",
  yellow: "warning",
};
const READ_ONLY_AGENT_POLICIES: Readonly<
  Record<
    string,
    { readonly hook_sha256: string; readonly edit_patterns: readonly string[] }
  >
> = {
  "aesthetic-evaluator": {
    hook_sha256:
      "8af8edfdebade1440ac05b22cc6a06214b97e242313430ed306f1bd55a3dcfd0",
    edit_patterns: [".claude/agent-memory/aesthetic-evaluator/*"],
  },
  "code-quality-critic": {
    hook_sha256:
      "55ed192c18d49185d611985294c636cb2a71b8667ee1be7bd9ff0d3ff765cdd9",
    edit_patterns: [
      ".claude/agent-memory/code-quality-critic/*",
      ".state/works/*/review.mdc",
    ],
  },
};

/** Raised when the projection cannot be completed safely. */
class ProjectionError extends Error {}

function readJsonObject(path: string): JsonObject {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ProjectionError(
      `cannot read JSON object ${path}: ${String(error)}`,
    );
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ProjectionError(`expected JSON object in ${path}`);
  }
  return value as JsonObject;
}

let cachedContract: JsonObject | undefined;

function projectionContract(): JsonObject {
  if (cachedContract !== undefined) return cachedContract;
  const contract = readJsonObject(CONTRACT_PATH);
  const manager = contract.manager;
  const schemaVersion = contract.schema_version;
  const separator = contract.skill_separator;
  if (typeof manager !== "string" || manager === "") {
    throw new ProjectionError(`invalid manager in ${CONTRACT_PATH}`);
  }
  if (!Number.isInteger(schemaVersion) || (schemaVersion as number) < 1) {
    throw new ProjectionError(`invalid schema version in ${CONTRACT_PATH}`);
  }
  if (separator !== "-") {
    throw new ProjectionError(
      `unsupported skill separator in ${CONTRACT_PATH}`,
    );
  }
  cachedContract = contract;
  return contract;
}

function contractString(key: string): string {
  const value = projectionContract()[key];
  if (typeof value !== "string" || value === "") {
    throw new ProjectionError(`invalid ${key} in ${CONTRACT_PATH}`);
  }
  return value;
}

function contractSchemaVersion(): number {
  return projectionContract().schema_version as number;
}

/** Resolve symlinks in the longest existing prefix, like Path.resolve(strict=False). */
function resolvePath(...input: readonly string[]): string {
  const absolute = resolve(...input);
  const missing: string[] = [];
  let probe = absolute;
  for (;;) {
    try {
      return join(realpathSync(probe), ...missing.reverse());
    } catch {
      const parent = dirname(probe);
      if (parent === probe) return absolute;
      missing.push(basename(probe));
      probe = parent;
    }
  }
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return (
    path === "" ||
    (!path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
      path !== ".." &&
      !isAbsolute(path))
  );
}

/**
 * The user's home directory, honoring $HOME before the platform lookup like
 * Python's expanduser — Bun's homedir() skips $HOME, which would send a
 * caller-provided environment to the real home.
 */
function homeDirectory(): string {
  return process.env.HOME ?? homedir();
}

function expandUser(value: string): string {
  return value.startsWith("~") ? `${homeDirectory()}${value.slice(1)}` : value;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function fileDigest(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function stateDirectory(target: string): string {
  const stateHome =
    process.env.XDG_STATE_HOME ?? join(homeDirectory(), ".local", "state");
  const targetKey = sha256Text(target);
  return resolvePath(expandUser(stateHome), "alvis-opencode-v1", targetKey);
}

function ownershipPath(target: string): string {
  return join(stateDirectory(target), "ownership.json");
}

function transactionPath(target: string): string {
  return join(stateDirectory(target), "transaction.json");
}

/** True when a path or broken symlink occupies a location. */
function pathExists(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false }) !== undefined;
}

function fsyncDirectory(directory: string): void {
  const descriptor = openSync(
    directory,
    constants.O_RDONLY | (constants.O_DIRECTORY ?? 0),
  );
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeDurableJson(path: string, value: JsonObject): void {
  mkdirSync(dirname(path), { mode: 0o700, recursive: true });
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.tmp`,
  );
  try {
    const descriptor = openSync(temporary, "wx");
    try {
      writeSync(descriptor, `${ensureAscii(JSON.stringify(value, null, 2))}\n`);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    chmodSync(temporary, 0o600);
    renameSync(temporary, path);
    fsyncDirectory(dirname(path));
  } finally {
    if (existsFollowing(temporary)) unlinkSync(temporary);
  }
}

function removeDurableFile(path: string): void {
  if (existsFollowing(path)) {
    unlinkSync(path);
    fsyncDirectory(dirname(path));
  }
}

function existsFollowing(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function ownershipRecord(
  target: string,
  manifestPath: string,
  schemaVersion: number = contractSchemaVersion(),
): JsonObject {
  return {
    manager: contractString("manager"),
    schema_version: schemaVersion,
    target,
    manifest_sha256: fileDigest(manifestPath),
  };
}

/** Render non-ASCII as lowercase \uXXXX escapes, like json.dumps(ensure_ascii=True). */
function ensureAscii(text: string): string {
  return text.replace(/[\u0080-\u{10FFFF}]/gu, (character) => {
    const code = character.codePointAt(0)!;
    if (code <= 0xffff) return `\\u${code.toString(16).padStart(4, "0")}`;
    const offset = code - 0x10000;
    const high = 0xd800 + (offset >> 10);
    const low = 0xdc00 + (offset & 0x3ff);
    return `\\u${high.toString(16).padStart(4, "0")}\\u${low
      .toString(16)
      .padStart(4, "0")}`;
  });
}

function renderCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(renderCanonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value as JsonObject)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${renderCanonical((value as JsonObject)[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function canonicalJson(value: unknown): string {
  return ensureAscii(renderCanonical(value));
}

function readValidOwnership(
  target: string,
  manifestPath: string,
  schemaVersion: number = contractSchemaVersion(),
): JsonObject {
  const recordPath = ownershipPath(target);
  const info = lstatSync(recordPath, { throwIfNoEntry: false });
  if (!info || !info.isFile()) {
    throw new ProjectionError(
      `managed manifest has no authenticated ownership record: ${manifestPath}`,
    );
  }
  const record = readJsonObject(recordPath);
  const expected = ownershipRecord(target, manifestPath, schemaVersion);
  if (canonicalJson(record) !== canonicalJson(expected)) {
    throw new ProjectionError(
      `managed manifest ownership does not match ${recordPath}`,
    );
  }
  return record;
}

function rejectSourceSymlinkComponents(
  sourcePath: string,
  pluginName: string,
): void {
  const pathFromRoot = relative(ROOT, sourcePath);
  if (
    pathFromRoot === "" ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new ProjectionError(
      `invalid plugin source for ${pluginName}: ${sourcePath}`,
    );
  }
  let currentPath = ROOT;
  for (const component of pathFromRoot.split(/[\\/]/).filter(Boolean)) {
    currentPath = join(currentPath, component);
    const info = lstatSync(currentPath, { throwIfNoEntry: false });
    if (!info) return;
    if (info.isSymbolicLink()) {
      throw new ProjectionError(
        `plugin source contains symlink component for ${pluginName}: ${currentPath}`,
      );
    }
  }
}

function marketplacePlugins(): Record<string, string> {
  const marketplace = readJsonObject(MARKETPLACE_PATH);
  const entries = marketplace.plugins;
  if (!Array.isArray(entries)) {
    throw new ProjectionError(`missing plugins array in ${MARKETPLACE_PATH}`);
  }
  const pluginsByName: Record<string, string> = {};
  for (const entry of entries) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ProjectionError("marketplace plugin entries must be objects");
    }
    const record = entry as JsonObject;
    const name = record.name;
    const source = record.source;
    if (typeof name !== "string" || typeof source !== "string") {
      throw new ProjectionError(
        "marketplace plugins require string name and source",
      );
    }
    const sourcePath = resolve(ROOT, source);
    rejectSourceSymlinkComponents(sourcePath, name);
    const pluginRoot = resolvePath(sourcePath);
    const pluginInfo = existsFollowing(pluginRoot)
      ? statSync(pluginRoot)
      : undefined;
    if (!isInside(ROOT, pluginRoot) || !pluginInfo?.isDirectory()) {
      throw new ProjectionError(`invalid plugin source for ${name}: ${source}`);
    }
    if (name in pluginsByName) {
      throw new ProjectionError(`duplicate marketplace plugin ${name}`);
    }
    pluginsByName[name] = pluginRoot;
  }
  return pluginsByName;
}

function pluginDependencies(
  pluginRoot: string,
  expectedName: string,
): readonly string[] {
  const manifestPath = join(pluginRoot, ".claude-plugin", "plugin.json");
  const manifest = readJsonObject(manifestPath);
  if (manifest.name !== expectedName) {
    throw new ProjectionError(`plugin name mismatch in ${manifestPath}`);
  }
  const dependencies = manifest.dependencies ?? [];
  if (
    !Array.isArray(dependencies) ||
    !dependencies.every((dependency) => typeof dependency === "string")
  ) {
    throw new ProjectionError(
      `dependencies must be strings in ${manifestPath}`,
    );
  }
  return dependencies as readonly string[];
}

function resolvePlugins(
  selectedPlugins: readonly string[],
  pluginsByName: Readonly<Record<string, string>>,
): readonly string[] {
  const resolved: string[] = [];
  const visiting: string[] = [];

  function visit(name: string): void {
    if (resolved.includes(name)) return;
    if (visiting.includes(name)) {
      throw new ProjectionError(
        `plugin dependency cycle: ${[...visiting, name].join(" -> ")}`,
      );
    }
    const pluginRoot = pluginsByName[name];
    if (pluginRoot === undefined) {
      throw new ProjectionError(`unknown plugin ${name}`);
    }
    visiting.push(name);
    for (const dependency of pluginDependencies(pluginRoot, name))
      visit(dependency);
    visiting.pop();
    resolved.push(name);
  }

  for (const selectedPlugin of selectedPlugins) visit(selectedPlugin);
  return resolved;
}

function projectTarget(
  scope: "project" | "user",
  projectRoot?: string,
): string {
  if (scope === "user") {
    if (projectRoot !== undefined) {
      throw new ProjectionError(
        "--project-root is valid only with --scope project",
      );
    }
    const configHome =
      process.env.XDG_CONFIG_HOME ?? join(homeDirectory(), ".config");
    return resolvePath(expandUser(configHome), "opencode");
  }
  let root = projectRoot;
  if (root === undefined) {
    const gitResult = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    if (
      gitResult.status === 0 &&
      typeof gitResult.stdout === "string" &&
      gitResult.stdout.trim() !== ""
    ) {
      root = gitResult.stdout.trim();
    } else {
      const jjResult = spawnSync("jj", ["root"], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      if (
        jjResult.status !== 0 ||
        typeof jjResult.stdout !== "string" ||
        jjResult.stdout.trim() === ""
      ) {
        throw new ProjectionError(
          "project scope requires a Git or Jujutsu worktree or --project-root",
        );
      }
      root = jjResult.stdout.trim();
    }
  }
  const resolvedRoot = resolvePath(expandUser(root));
  let rootInfo;
  try {
    rootInfo = statSync(resolvedRoot);
  } catch {
    throw new ProjectionError(
      `project root is not a directory: ${resolvedRoot}`,
    );
  }
  if (!rootInfo.isDirectory()) {
    throw new ProjectionError(
      `project root is not a directory: ${resolvedRoot}`,
    );
  }
  return join(resolvedRoot, ".opencode");
}

function worktreeFiles(sourceRoot: string): readonly string[] {
  const repositoryRelativeRoot = relative(ROOT, sourceRoot)
    .split("\\")
    .join("/");
  if (
    repositoryRelativeRoot === "" ||
    repositoryRelativeRoot === ".." ||
    repositoryRelativeRoot.startsWith("../")
  ) {
    throw new ProjectionError(
      `source root is outside the repository: ${sourceRoot}`,
    );
  }
  const gitDirectoryResult = spawnSync(
    "git",
    ["rev-parse", "--absolute-git-dir"],
    { cwd: ROOT, encoding: "utf8" },
  );
  const result =
    gitDirectoryResult.status === 0 &&
    typeof gitDirectoryResult.stdout === "string" &&
    gitDirectoryResult.stdout.trim() !== ""
      ? spawnSync(
          "git",
          [
            `--git-dir=${gitDirectoryResult.stdout.trim()}`,
            `--work-tree=${ROOT}`,
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            repositoryRelativeRoot,
          ],
          { cwd: ROOT, encoding: "utf8" },
        )
      : jujutsuFiles(repositoryRelativeRoot);
  if (result.status !== 0 || typeof result.stdout !== "string") {
    const detail =
      typeof result.stderr === "string" && result.stderr.trim() !== ""
        ? result.stderr.trim()
        : `exit ${result.status ?? "unknown"}`;
    throw new ProjectionError(`cannot enumerate source files: ${detail}`);
  }
  const files: string[] = [];
  for (const repositoryRelativePath of result.stdout
    .split("\0")
    .filter(Boolean)) {
    const sourcePath = join(ROOT, repositoryRelativePath);
    const info = lstatSync(sourcePath, { throwIfNoEntry: false });
    if (!info) continue;
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new ProjectionError(
        `source path is not a regular file: ${sourcePath}`,
      );
    }
    if (!isInside(sourceRoot, sourcePath)) {
      throw new ProjectionError(
        `source inventory escapes plugin root: ${sourcePath}`,
      );
    }
    files.push(relative(sourceRoot, sourcePath).split("\\").join("/"));
  }
  return files.sort();
}

function jujutsuFiles(
  repositoryRelativeRoot: string,
): ReturnType<typeof spawnSync> {
  const rootResult = spawnSync("jj", ["root"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (
    rootResult.status !== 0 ||
    typeof rootResult.stdout !== "string" ||
    rootResult.stdout.trim() === ""
  ) {
    const detail =
      typeof rootResult.stderr === "string" && rootResult.stderr.trim() !== ""
        ? rootResult.stderr.trim()
        : `exit ${rootResult.status ?? "unknown"}`;
    throw new ProjectionError(`cannot resolve source repository: ${detail}`);
  }
  if (resolvePath(rootResult.stdout.trim()) !== ROOT) {
    throw new ProjectionError(
      `source repository root does not match installer root: ${rootResult.stdout.trim()}`,
    );
  }
  return spawnSync(
    "jj",
    ["file", "list", "-T", 'path ++ "\\0"', repositoryRelativeRoot],
    { cwd: ROOT, encoding: "utf8" },
  );
}

interface CopyRegularFilesParams {
  readonly destinationRoot: string;
  readonly files: readonly string[];
  readonly sourceRoot: string;
}

function copyRegularFile(sourcePath: string, destinationPath: string): void {
  const info = lstatSync(sourcePath, { throwIfNoEntry: false });
  if (!info || info.isSymbolicLink() || !info.isFile()) {
    throw new ProjectionError(
      `source path is not a regular file: ${sourcePath}`,
    );
  }
  mkdirSync(dirname(destinationPath), { recursive: true });
  cpSync(sourcePath, destinationPath, { preserveTimestamps: true });
}

function copyRegularFiles(params: CopyRegularFilesParams): void {
  const { destinationRoot, files, sourceRoot } = params;
  for (const relativePath of files) {
    const sourcePath = join(sourceRoot, relativePath);
    const destinationPath = join(destinationRoot, relativePath);
    copyRegularFile(sourcePath, destinationPath);
  }
}

function splitLinesKeepingEndings(text: string): readonly string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function rewriteSkillName(
  text: string,
  projectedName: string,
  source: string,
): string {
  if (projectedName.length > 64) {
    throw new ProjectionError(
      `OpenCode skill name exceeds 64 characters: ${projectedName}`,
    );
  }
  const lines = [...splitLinesKeepingEndings(text)];
  if (lines.length === 0 || lines[0]!.trim() !== "---") {
    throw new ProjectionError(`skill has no YAML frontmatter: ${source}`);
  }
  let closingIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]!.trim() === "---") {
      closingIndex = index;
      break;
    }
  }
  if (closingIndex === -1) {
    throw new ProjectionError(`skill frontmatter is not closed: ${source}`);
  }
  const nameIndexes: number[] = [];
  for (let index = 1; index < closingIndex; index += 1) {
    if (/^name\s*:/.test(lines[index]!)) nameIndexes.push(index);
  }
  if (nameIndexes.length !== 1) {
    throw new ProjectionError(
      `skill requires exactly one frontmatter name: ${source}`,
    );
  }
  const newline = lines[nameIndexes[0]!]!.endsWith("\r\n") ? "\r\n" : "\n";
  lines[nameIndexes[0]!] = `name: ${projectedName}${newline}`;
  return lines.join("");
}

interface RewriteContext {
  readonly destinationFile: string;
  readonly stagedRoot: string;
  readonly sourceSkillRoot: string;
}

function rewriteMarkdownLinks(
  text: string,
  sourceFile: string,
  context: RewriteContext,
): string {
  const pluginsRoot = join(ROOT, "plugins");
  return text.replace(SKILL_LINK_PATTERN, (_match, prefix, target, suffix) => {
    if (
      target.startsWith("#") ||
      target.startsWith("/") ||
      target.startsWith("{") ||
      target.startsWith("$") ||
      target.includes("://")
    ) {
      return `${prefix}${target}${suffix}`;
    }
    const fragmentIndex = target.indexOf("#");
    const pathText =
      fragmentIndex === -1 ? target : target.slice(0, fragmentIndex);
    const fragment =
      fragmentIndex === -1 ? undefined : target.slice(fragmentIndex + 1);
    const sourceTarget = resolvePath(resolve(dirname(sourceFile), pathText));
    if (
      !existsFollowing(sourceTarget) ||
      !isInside(pluginsRoot, sourceTarget)
    ) {
      return `${prefix}${target}${suffix}`;
    }
    if (isInside(context.sourceSkillRoot, sourceTarget)) {
      return `${prefix}${target}${suffix}`;
    }
    const relativeSource = relative(pluginsRoot, sourceTarget);
    const destinationTarget = join(
      context.stagedRoot,
      "alvis",
      "plugins",
      relativeSource,
    );
    const relativeTarget = relative(
      dirname(context.destinationFile),
      destinationTarget,
    );
    let projectedTarget = relativeTarget.split("\\").join("/");
    if (fragment !== undefined) projectedTarget += `#${fragment}`;
    return `${prefix}${projectedTarget}${suffix}`;
  });
}

function rewriteJsonResourcePaths(
  text: string,
  sourceFile: string,
  context: RewriteContext,
): string {
  const pluginsRoot = join(ROOT, "plugins");
  return text.replace(JSON_RELATIVE_PATH_PATTERN, (_match, target: string) => {
    const sourceTarget = resolvePath(resolve(dirname(sourceFile), target));
    if (
      !existsFollowing(sourceTarget) ||
      !isInside(pluginsRoot, sourceTarget) ||
      isInside(context.sourceSkillRoot, sourceTarget)
    ) {
      return `"${target}"`;
    }
    const relativeSource = relative(pluginsRoot, sourceTarget);
    const destinationTarget = join(
      context.stagedRoot,
      "alvis",
      "plugins",
      relativeSource,
    );
    const relativeTarget = relative(
      dirname(context.destinationFile),
      destinationTarget,
    );
    return ensureAscii(JSON.stringify(relativeTarget.split("\\").join("/")));
  });
}

function rewriteSkillRuntimePaths(
  text: string,
  pluginName: string,
  isSkillEntrypoint: boolean,
): string {
  const bundlePath = `../../alvis/plugins/${pluginName}`;
  let rewritten = text.replace(
    SKILL_DIRECTORY_PATH_PATTERN,
    (_match, variable: string) => `${variable}/${bundlePath}`,
  );
  if (isSkillEntrypoint) {
    rewritten = rewritten.split("`../..`").join(`\`${bundlePath}\``);
  }
  return rewritten;
}

function walkRelativeFiles(
  root: string,
  directory: string = root,
): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walkRelativeFiles(root, entryPath));
    else if (entry.isFile()) {
      found.push(relative(root, entryPath).split("\\").join("/"));
    } else {
      throw new ProjectionError(
        `staged path is not a regular file: ${entryPath}`,
      );
    }
  }
  return found.sort();
}

interface ProjectSkillParams {
  readonly pluginName: string;
  readonly sourceFiles: readonly string[];
  readonly sourceSkillRoot: string;
  readonly stagedRoot: string;
}

function projectSkill(params: ProjectSkillParams): string {
  const { pluginName, sourceFiles, sourceSkillRoot, stagedRoot } = params;
  const separator = contractString("skill_separator");
  const projectedName = [pluginName, basename(sourceSkillRoot)].join(separator);
  const destinationRoot = join(stagedRoot, "skills", projectedName);
  copyRegularFiles({
    destinationRoot,
    files: sourceFiles,
    sourceRoot: sourceSkillRoot,
  });
  for (const relativePath of sourceFiles) {
    const extension = relativePath.slice(relativePath.lastIndexOf("."));
    if (!PROJECTED_TEXT_SUFFIXES.has(extension)) continue;
    const sourceFile = join(sourceSkillRoot, relativePath);
    const destinationFile = join(destinationRoot, relativePath);
    let text = readFileSync(sourceFile, "utf8");
    const context: RewriteContext = {
      destinationFile,
      stagedRoot,
      sourceSkillRoot,
    };
    if (relativePath === "SKILL.md") {
      text = rewriteSkillName(text, projectedName, sourceFile);
    }
    if (extension === ".md")
      text = rewriteMarkdownLinks(text, sourceFile, context);
    if (extension === ".json")
      text = rewriteJsonResourcePaths(text, sourceFile, context);
    text = rewriteSkillRuntimePaths(
      text,
      pluginName,
      relativePath === "SKILL.md",
    );
    writeFileSync(destinationFile, text, "utf8");
  }
  return projectedName;
}

function skillDescription(skillPath: string): string {
  const text = readFileSync(skillPath, "utf8");
  const match = /^description:\s*(.+)$/m.exec(text);
  if (!match) {
    throw new ProjectionError(`skill description missing: ${skillPath}`);
  }
  let value = match[1]!.trim();
  if (
    value.length >= 2 &&
    value[0] === value[value.length - 1] &&
    (value[0] === "'" || value[0] === '"')
  ) {
    value = value.slice(1, -1);
  }
  return value.split(/\s+/).filter(Boolean).join(" ");
}

function writeCommand(
  destination: string,
  projectedName: string,
  description: string,
): void {
  const renderedDescription = ensureAscii(
    JSON.stringify(`Load and run ${projectedName}: ${description}`),
  );
  writeFileSync(
    destination,
    [
      "---",
      `description: ${renderedDescription}`,
      "---",
      "",
      `Load the \`${projectedName}\` skill with the native skill tool, follow it exactly, and apply it to:`,
      "",
      "$ARGUMENTS",
      "",
    ].join("\n"),
    "utf8",
  );
}

function agentPermissions(name: string, claude: JsonObject): readonly string[] {
  const hooks = claude.hooks;
  if (hooks === undefined || hooks === null) return [];
  const policy = READ_ONLY_AGENT_POLICIES[name];
  if (
    policy === undefined ||
    hooks === null ||
    typeof hooks !== "object" ||
    Array.isArray(hooks)
  ) {
    throw new ProjectionError(
      `unsupported security-sensitive hooks for agent ${name}`,
    );
  }
  if (
    createHash("sha256").update(canonicalJson(hooks), "utf8").digest("hex") !==
    policy.hook_sha256
  ) {
    throw new ProjectionError(
      `changed security-sensitive hooks for agent ${name}`,
    );
  }
  return policy.edit_patterns;
}

function writeAgent(agentRoot: string, destination: string): string {
  const meta = readJsonObject(join(agentRoot, "frontmatter", "meta.json"));
  const claude = readJsonObject(join(agentRoot, "frontmatter", "claude.json"));
  const name = meta.name;
  const description = meta.description;
  if (
    typeof name !== "string" ||
    name !== basename(agentRoot) ||
    typeof description !== "string"
  ) {
    throw new ProjectionError(
      `invalid canonical metadata for agent ${basename(agentRoot)}`,
    );
  }
  const steps = claude.maxTurns;
  if (!Number.isInteger(steps) || (steps as number) < 1) {
    throw new ProjectionError(`agent ${name} requires a positive maxTurns`);
  }
  const initialPrompt = claude.initialPrompt;
  if (typeof initialPrompt !== "string" || initialPrompt.trim() === "") {
    throw new ProjectionError(`agent ${name} requires initialPrompt`);
  }
  const color = claude.color;
  const projectedColor =
    typeof color === "string"
      ? OPEN_CODE_COLOR_BY_CLAUDE_COLOR[color]
      : undefined;
  const permissions = agentPermissions(name, claude);

  const frontmatter = [
    "---",
    `description: ${ensureAscii(JSON.stringify(description))}`,
    "mode: subagent",
    `steps: ${steps}`,
  ];
  if (projectedColor !== undefined)
    frontmatter.push(`color: ${projectedColor}`);
  if (permissions.length > 0) {
    frontmatter.push("permission:", "  edit:", '    "*": deny');
    for (const pattern of permissions) {
      frontmatter.push(`    ${ensureAscii(JSON.stringify(pattern))}: allow`);
    }
    frontmatter.push("  bash: deny", "  external_directory: deny");
  }
  frontmatter.push("---", "");
  const body = readFileSync(join(agentRoot, "base.md"), "utf8").trim();
  writeFileSync(
    destination,
    [...frontmatter, initialPrompt.trim(), "", body, ""].join("\n"),
    "utf8",
  );
  return name;
}

function sourceRevision(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT });
  if (result.status === 0 && result.stdout !== null) {
    return result.stdout.toString().trim();
  }
  const jjResult = spawnSync(
    "jj",
    ["log", "--no-graph", "-r", "@", "-T", "commit_id"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return jjResult.status === 0 && typeof jjResult.stdout === "string"
    ? jjResult.stdout.trim()
    : "unknown";
}

function stagedFiles(stagedRoot: string): readonly string[] {
  return walkRelativeFiles(stagedRoot);
}

function writeManifest(
  stagedRoot: string,
  scope: "project" | "user",
  selectedPlugins: readonly string[],
  resolvedPlugins: readonly string[],
  hookReceiptsByPlugin: Readonly<Record<string, readonly HookReceipt[]>>,
): JsonObject {
  const filesBeforeManifest = stagedFiles(stagedRoot);
  const digests: Record<string, string> = {};
  for (const path of filesBeforeManifest) {
    digests[path] = fileDigest(join(stagedRoot, path));
  }
  const aggregate = createHash("sha256");
  for (const [path, digest] of Object.entries(digests)) {
    aggregate.update(`${path}\0${digest}\n`, "utf8");
  }
  const manifest: JsonObject = {
    schema_version: contractSchemaVersion(),
    manager: contractString("manager"),
    scope,
    selected_plugins: [...selectedPlugins],
    resolved_plugins: [...resolvedPlugins],
    plugins: resolvedPlugins.map((name) => ({
      name,
      bundle_path: `alvis/plugins/${name}`,
      hooks: hookReceiptsByPlugin[name] ?? [],
    })),
    source: {
      revision: sourceRevision(),
      marketplace_sha256: fileDigest(MARKETPLACE_PATH),
      projection_sha256: aggregate.digest("hex"),
    },
    file_digests: digests,
    managed_paths: [...Object.keys(digests), MANIFEST_RELATIVE_PATH],
  };
  const manifestPath = join(stagedRoot, MANIFEST_RELATIVE_PATH);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(
    manifestPath,
    `${ensureAscii(JSON.stringify(manifest, null, 2))}\n`,
    "utf8",
  );
  return manifest;
}

function buildProjection(
  stagedRoot: string,
  scope: "project" | "user",
  selectedPlugins: readonly string[],
  resolvedPlugins: readonly string[],
  pluginsByName: Readonly<Record<string, string>>,
): JsonObject {
  mkdirSync(join(stagedRoot, "plugins"), { recursive: true });
  mkdirSync(join(stagedRoot, "skills"));
  mkdirSync(join(stagedRoot, "commands"));
  mkdirSync(join(stagedRoot, "agents"));
  mkdirSync(join(stagedRoot, "alvis"));
  copyRegularFile(
    ADAPTER_PATH,
    join(stagedRoot, "plugins", "alvis-marketplace.js"),
  );
  copyRegularFile(CONTRACT_PATH, join(stagedRoot, "alvis", "contract.json"));

  const skillNames = new Set<string>();
  const agentNames = new Set<string>();
  const pluginFilesByName: Record<string, readonly string[]> = {};
  for (const pluginName of resolvedPlugins) {
    const pluginRoot = pluginsByName[pluginName]!;
    const pluginFiles = worktreeFiles(pluginRoot);
    pluginFilesByName[pluginName] = pluginFiles;
    copyRegularFiles({
      destinationRoot: join(stagedRoot, "alvis", "plugins", pluginName),
      files: pluginFiles,
      sourceRoot: pluginRoot,
    });
    const skillDirectoryNames = [
      ...new Set(
        pluginFiles.flatMap((path) => {
          const match = /^skills\/([^/]+)\/SKILL\.md$/.exec(path);
          return match ? [match[1]!] : [];
        }),
      ),
    ].sort();
    for (const skillDirectoryName of skillDirectoryNames) {
      const skillRoot = join(pluginRoot, "skills", skillDirectoryName);
      const skillPrefix = `skills/${skillDirectoryName}/`;
      const skillFiles = pluginFiles
        .filter((path) => path.startsWith(skillPrefix))
        .map((path) => path.slice(skillPrefix.length));
      const projectedName = projectSkill({
        pluginName,
        sourceFiles: skillFiles,
        sourceSkillRoot: skillRoot,
        stagedRoot,
      });
      if (skillNames.has(projectedName)) {
        throw new ProjectionError(
          `projected skill collision: ${projectedName}`,
        );
      }
      skillNames.add(projectedName);
      writeCommand(
        join(stagedRoot, "commands", `${projectedName}.md`),
        projectedName,
        skillDescription(join(skillRoot, "SKILL.md")),
      );
    }

    const pluginAgentNames = [
      ...new Set(
        pluginFiles.flatMap((path) => {
          const match = /^agents\/([^/]+)\/base\.md$/.exec(path);
          return match ? [match[1]!] : [];
        }),
      ),
    ].sort();
    for (const agentName of pluginAgentNames) {
      if (agentNames.has(agentName)) {
        throw new ProjectionError(`cross-plugin agent collision: ${agentName}`);
      }
      agentNames.add(agentName);
      writeAgent(
        join(pluginRoot, "agents", agentName),
        join(stagedRoot, "agents", `${agentName}.md`),
      );
    }
  }
  const hookReceiptsByPlugin = Object.fromEntries(
    resolvedPlugins.map((pluginName) => {
      try {
        return [
          pluginName,
          resolveHookReceipts({
            contract: projectionContract(),
            pluginFiles: pluginFilesByName[pluginName]!,
            pluginName,
            pluginRoot: pluginsByName[pluginName]!,
          }),
        ];
      } catch (error) {
        const exception = error as Error;
        throw new ProjectionError(exception.message);
      }
    }),
  );
  return writeManifest(
    stagedRoot,
    scope,
    selectedPlugins,
    resolvedPlugins,
    hookReceiptsByPlugin,
  );
}

function isIdentifier(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && !value.includes("\n");
}

function isHexDigest64(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value) && !value.includes("\n");
}

function normalizedParts(pathText: string): readonly string[] {
  return pathText.split("/").filter((part) => part !== "" && part !== ".");
}

function isCanonicalManagedPath(
  parts: readonly string[],
  pluginNames: ReadonlySet<string>,
): boolean {
  const joined = parts.join("/");
  if (
    joined === MANIFEST_RELATIVE_PATH ||
    joined === "alvis/contract.json" ||
    joined === "plugins/alvis-marketplace.js"
  ) {
    return true;
  }
  if (parts.length >= 3 && parts[0] === "skills" && isIdentifier(parts[1]!)) {
    return true;
  }
  if (
    parts.length === 2 &&
    (parts[0] === "agents" || parts[0] === "commands")
  ) {
    const file = parts[1]!;
    const dotIndex = file.lastIndexOf(".");
    return (
      dotIndex > 0 &&
      file.slice(dotIndex) === ".md" &&
      isIdentifier(file.slice(0, dotIndex))
    );
  }
  return (
    parts.length >= 4 &&
    parts[0] === "alvis" &&
    parts[1] === "plugins" &&
    pluginNames.has(parts[2]!)
  );
}

type ExistingProjectionClassification =
  "authenticated-schema-v1" | "fresh" | "managed-schema-v2";

interface PreviousProjection {
  readonly classification: ExistingProjectionClassification;
  readonly legacySymlinkPaths: ReadonlySet<string>;
  readonly managedPaths: ReadonlySet<string>;
}

function validateManagedPathParents(target: string, destination: string): void {
  let parent = dirname(destination);
  while (parent !== target && isInside(target, parent)) {
    if (lstatSync(parent, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new ProjectionError(`symlink blocks managed path: ${parent}`);
    }
    parent = dirname(parent);
  }
}

function validateManagedPathState(
  target: string,
  relativePath: string,
  expectedDigest: string,
): void {
  const destination = join(target, relativePath);
  validateManagedPathParents(target, destination);
  const info = lstatSync(destination, { throwIfNoEntry: false })!;
  if (!info) {
    throw new ProjectionError(`managed path is missing: ${destination}`);
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new ProjectionError(
      `managed path is not a regular file: ${destination}`,
    );
  }
  if (fileDigest(destination) !== expectedDigest) {
    throw new ProjectionError(`managed path was modified: ${destination}`);
  }
}

function loadPreviousProjection(
  target: string,
  desiredPaths: ReadonlySet<string>,
): PreviousProjection {
  const manifestPath = join(target, MANIFEST_RELATIVE_PATH);
  const info = lstatSync(manifestPath, { throwIfNoEntry: false });
  if (!info) {
    return {
      classification: "fresh",
      legacySymlinkPaths: new Set(),
      managedPaths: new Set(),
    };
  }
  if (info.isSymbolicLink()) {
    throw new ProjectionError(
      `managed manifest must not be a symlink: ${manifestPath}`,
    );
  }
  const manifest = readJsonObject(manifestPath);
  const schemaVersion = manifest.schema_version;
  if (
    manifest.manager !== contractString("manager") ||
    (schemaVersion !== 1 && schemaVersion !== contractSchemaVersion())
  ) {
    throw new ProjectionError(
      `unmanaged or incompatible manifest: ${manifestPath}`,
    );
  }
  readValidOwnership(target, manifestPath, schemaVersion);
  const paths = manifest.managed_paths;
  if (
    !Array.isArray(paths) ||
    !paths.every((path) => typeof path === "string")
  ) {
    throw new ProjectionError(`invalid managed_paths in ${manifestPath}`);
  }
  const digests = manifest.file_digests;
  if (
    digests === null ||
    typeof digests !== "object" ||
    Array.isArray(digests) ||
    !Object.values(digests).every(
      (digest) => typeof digest === "string" && isHexDigest64(digest),
    )
  ) {
    throw new ProjectionError(`invalid file_digests in ${manifestPath}`);
  }
  const plugins = manifest.plugins;
  if (!Array.isArray(plugins)) {
    throw new ProjectionError(`invalid plugins in ${manifestPath}`);
  }
  const pluginNames = new Set<string>();
  for (const plugin of plugins) {
    if (
      plugin === null ||
      typeof plugin !== "object" ||
      Array.isArray(plugin)
    ) {
      throw new ProjectionError(`invalid plugin receipt in ${manifestPath}`);
    }
    const receipt = plugin as JsonObject;
    const name = receipt.name;
    const bundlePath = receipt.bundle_path;
    if (
      typeof name !== "string" ||
      !isIdentifier(name) ||
      bundlePath !== `alvis/plugins/${name}` ||
      pluginNames.has(name)
    ) {
      throw new ProjectionError(`invalid plugin receipt in ${manifestPath}`);
    }
    pluginNames.add(name);
  }
  const managedPaths = new Set<string>();
  for (const pathText of paths as readonly string[]) {
    const parts = normalizedParts(pathText);
    if (
      isAbsolute(pathText) ||
      parts.length === 0 ||
      pathText.split("/").includes("..") ||
      !isCanonicalManagedPath(parts, pluginNames)
    ) {
      throw new ProjectionError(
        `unsafe managed path in ${manifestPath}: ${pathText}`,
      );
    }
    managedPaths.add(parts.join("/"));
  }
  const digestKeys = new Set(Object.keys(digests as Record<string, string>));
  const expectedDigestPaths = new Set(
    [...managedPaths].filter((path) => path !== MANIFEST_RELATIVE_PATH),
  );
  const expectedKeys = new Set([...expectedDigestPaths].map((path) => path));
  if (
    digestKeys.size !== expectedKeys.size ||
    [...expectedKeys].some((key) => !digestKeys.has(key))
  ) {
    throw new ProjectionError(
      `managed paths and digests differ in ${manifestPath}`,
    );
  }
  const orderedPaths = [...managedPaths].sort();
  for (let index = 0; index < orderedPaths.length; index += 1) {
    const path = orderedPaths[index]!;
    if (
      orderedPaths
        .slice(index + 1)
        .some((other) => other.startsWith(`${path}/`))
    ) {
      throw new ProjectionError(
        `overlapping managed paths in ${manifestPath}: ${path}`,
      );
    }
  }
  const legacySymlinkPaths = new Set<string>();
  for (const path of expectedDigestPaths) {
    const destination = join(target, path);
    validateManagedPathParents(target, destination);
    const pathInfo = lstatSync(destination, { throwIfNoEntry: false });
    if (schemaVersion === 1 && pathInfo?.isSymbolicLink()) {
      if (desiredPaths.has(path)) {
        throw new ProjectionError(
          `legacy managed symlink overlaps the desired projection: ${destination}`,
        );
      }
      legacySymlinkPaths.add(path);
      continue;
    }
    validateManagedPathState(
      target,
      path,
      (digests as Record<string, string>)[path]!,
    );
  }
  return {
    classification:
      schemaVersion === 1 ? "authenticated-schema-v1" : "managed-schema-v2",
    legacySymlinkPaths,
    managedPaths,
  };
}

function journalPaths(journal: JsonObject, key: string): Set<string> {
  const values = journal[key];
  if (
    !Array.isArray(values) ||
    !values.every((value) => typeof value === "string")
  ) {
    throw new ProjectionError(`invalid ${key} in transaction journal`);
  }
  const paths = new Set<string>();
  for (const value of values as readonly string[]) {
    const parts = normalizedParts(value);
    if (
      paths.has(value) ||
      isAbsolute(value) ||
      parts.length === 0 ||
      value.split("/").includes("..")
    ) {
      throw new ProjectionError(`unsafe ${key} in transaction journal`);
    }
    paths.add(value);
  }
  if (paths.size !== (values as readonly string[]).length) {
    throw new ProjectionError(`invalid ${key} in transaction journal`);
  }
  return paths;
}

function journalDigests(
  journal: JsonObject,
  key: string,
): Record<string, string> {
  const values = journal[key];
  if (
    values === null ||
    typeof values !== "object" ||
    Array.isArray(values) ||
    !Object.entries(values).every(
      ([path, digest]) =>
        typeof path === "string" &&
        typeof digest === "string" &&
        isHexDigest64(digest),
    )
  ) {
    throw new ProjectionError(`invalid ${key} in transaction journal`);
  }
  return values as Record<string, string>;
}

function validateRecoveryFile(path: string, expectedDigest: string): void {
  const info = lstatSync(path, { throwIfNoEntry: false });
  if (!info || info.isSymbolicLink() || !info.isFile()) {
    throw new ProjectionError(
      `transaction recovery path is not a file: ${path}`,
    );
  }
  if (fileDigest(path) !== expectedDigest) {
    throw new ProjectionError(
      `transaction recovery path was modified: ${path}`,
    );
  }
}

function validateRecoverySymlink(path: string): void {
  if (!lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new ProjectionError(
      `transaction recovery path is not a symlink: ${path}`,
    );
  }
}

function cleanupTransaction(target: string): void {
  const directory = stateDirectory(target);
  const backupRoot = join(directory, "backup");
  if (existsFollowing(backupRoot)) {
    rmRecursive(backupRoot);
    fsyncDirectory(directory);
  }
  removeDurableFile(transactionPath(target));
}

function rmRecursive(path: string): void {
  rmSync(path, { force: true, recursive: true });
}

function restorePreparedTransaction(target: string, journal: JsonObject): void {
  const previousPaths = journalPaths(journal, "previous_paths");
  const previousSymlinkPaths = journalPaths(journal, "previous_symlink_paths");
  const desiredPaths = journalPaths(journal, "desired_paths");
  const previousDigests = journalDigests(journal, "previous_file_digests");
  const desiredDigests = journalDigests(journal, "desired_file_digests");
  const sameMembers = (
    keys: ReadonlySet<string>,
    digests: Record<string, string>,
  ) =>
    keys.size === Object.keys(digests).length &&
    Object.keys(digests).every((key) => keys.has(key));
  const previousRegularPaths = new Set(
    [...previousPaths].filter((path) => !previousSymlinkPaths.has(path)),
  );
  if (
    [...previousSymlinkPaths].some(
      (path) => !previousPaths.has(path) || desiredPaths.has(path),
    ) ||
    !sameMembers(previousRegularPaths, previousDigests) ||
    !sameMembers(desiredPaths, desiredDigests)
  ) {
    throw new ProjectionError(
      "transaction journal path and digest sets differ",
    );
  }
  const backupRoot = join(stateDirectory(target), "backup");

  for (const relativePath of [...previousPaths].sort()) {
    const destination = join(target, relativePath);
    const backup = join(backupRoot, relativePath);
    const isPreviousSymlink = previousSymlinkPaths.has(relativePath);
    if (pathExists(backup)) {
      if (isPreviousSymlink) validateRecoverySymlink(backup);
      else validateRecoveryFile(backup, previousDigests[relativePath]!);
      if (pathExists(destination)) {
        if (!desiredPaths.has(relativePath)) {
          throw new ProjectionError(
            `unexpected recovery collision: ${destination}`,
          );
        }
        validateRecoveryFile(destination, desiredDigests[relativePath]!);
        unlinkSync(destination);
      }
      mkdirSync(dirname(destination), { recursive: true });
      renameSync(backup, destination);
    } else {
      if (isPreviousSymlink) validateRecoverySymlink(destination);
      else validateRecoveryFile(destination, previousDigests[relativePath]!);
    }
  }

  for (const relativePath of [...desiredPaths]
    .filter((path) => !previousPaths.has(path))
    .sort()
    .reverse()) {
    const destination = join(target, relativePath);
    if (pathExists(destination)) {
      validateRecoveryFile(destination, desiredDigests[relativePath]!);
      unlinkSync(destination);
      removeEmptyParents(destination, target);
    }
  }

  const previousOwnership = journal.previous_ownership;
  const recordPath = ownershipPath(target);
  if (previousOwnership === undefined || previousOwnership === null) {
    removeDurableFile(recordPath);
  } else if (
    previousOwnership !== null &&
    typeof previousOwnership === "object" &&
    !Array.isArray(previousOwnership)
  ) {
    writeDurableJson(recordPath, previousOwnership as JsonObject);
  } else {
    throw new ProjectionError(
      "invalid previous_ownership in transaction journal",
    );
  }
  cleanupTransaction(target);
}

function recoverInterruptedTransaction(target: string): void {
  const journalPath = transactionPath(target);
  // Path.exists() follows links, so a broken symlink counts as absent here;
  // a live symlink still fails the dedicated check below.
  if (!existsFollowing(journalPath)) return;
  if (lstatSync(journalPath, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new ProjectionError(
      `transaction journal must not be a symlink: ${journalPath}`,
    );
  }
  const journal = readJsonObject(journalPath);
  if (
    journal.manager !== contractString("manager") ||
    journal.schema_version !== contractSchemaVersion() ||
    journal.target !== target
  ) {
    throw new ProjectionError(`invalid transaction journal: ${journalPath}`);
  }
  if (journal.status === "prepared") {
    restorePreparedTransaction(target, journal);
    return;
  }
  if (journal.status === "committed") {
    readValidOwnership(target, join(target, MANIFEST_RELATIVE_PATH));
    cleanupTransaction(target);
    return;
  }
  throw new ProjectionError(`invalid transaction status in ${journalPath}`);
}

function validateCollisions(
  target: string,
  desiredPaths: Iterable<string>,
  previousManagedPaths: ReadonlySet<string>,
): void {
  if (pathExists(target)) {
    const targetInfo = lstatSync(target, { throwIfNoEntry: false })!;
    if (targetInfo.isSymbolicLink() || !targetInfo.isDirectory()) {
      throw new ProjectionError(
        `OpenCode config target must be a directory: ${target}`,
      );
    }
  }
  for (const relativePath of desiredPaths) {
    const destination = join(target, relativePath);
    if (pathExists(destination) && !previousManagedPaths.has(relativePath)) {
      throw new ProjectionError(
        `unmanaged path collision: ${destination} [classification=unmanaged; recovery=move-or-remove-path]`,
      );
    }
    let parent = dirname(destination);
    while (parent !== target && isInside(target, parent)) {
      if (pathExists(parent)) {
        const parentInfo = lstatSync(parent, { throwIfNoEntry: false })!;
        if (parentInfo.isSymbolicLink()) {
          throw new ProjectionError(`symlink blocks projection: ${parent}`);
        }
        if (!parentInfo.isDirectory()) {
          throw new ProjectionError(
            `non-directory blocks projection: ${parent}`,
          );
        }
      }
      parent = dirname(parent);
    }
  }
}

function removeEmptyParents(path: string, target: string): void {
  let parent = dirname(path);
  while (parent !== target && isInside(target, parent)) {
    try {
      rmdirSync(parent);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOTEMPTY" || code === "EEXIST" || code === "ENOENT") {
        return;
      }
      throw error;
    }
    parent = dirname(parent);
  }
}

function installStagedProjection(
  stagedRoot: string,
  target: string,
): PreviousProjection {
  const desiredPaths = new Set(stagedFiles(stagedRoot));
  const previousProjection = loadPreviousProjection(target, desiredPaths);
  const previousPaths = previousProjection.managedPaths;
  validateCollisions(target, desiredPaths, previousPaths);
  const affectedPaths = [
    ...new Set([...previousPaths, ...desiredPaths]),
  ].sort();

  mkdirSync(dirname(target), { recursive: true });
  mkdirSync(target, { recursive: true });
  const directory = ensurePrivateStateDirectory(target);
  const journalPath = transactionPath(target);
  const backupRoot = join(directory, "backup");
  if (pathExists(journalPath) || pathExists(backupRoot)) {
    throw new ProjectionError(
      `installer transaction state already exists for ${target}; rerun to recover`,
    );
  }
  const existingPreviousPaths = new Set(
    [...previousPaths].filter((path) => pathExists(join(target, path))),
  );
  const previousOwnershipPath = ownershipPath(target);
  const ownershipInfo = lstatSync(previousOwnershipPath, {
    throwIfNoEntry: false,
  });
  const previousOwnership =
    ownershipInfo && ownershipInfo.isFile()
      ? readJsonObject(previousOwnershipPath)
      : null;
  const journal: JsonObject = {
    manager: contractString("manager"),
    schema_version: contractSchemaVersion(),
    target,
    status: "prepared",
    previous_paths: [...existingPreviousPaths].sort(),
    previous_symlink_paths: [...previousProjection.legacySymlinkPaths].sort(),
    desired_paths: [...desiredPaths].sort(),
    previous_file_digests: Object.fromEntries(
      [...existingPreviousPaths]
        .filter((path) => !previousProjection.legacySymlinkPaths.has(path))
        .sort()
        .map((path) => [path, fileDigest(join(target, path))]),
    ),
    desired_file_digests: Object.fromEntries(
      [...desiredPaths]
        .sort()
        .map((path) => [path, fileDigest(join(stagedRoot, path))]),
    ),
    previous_ownership: previousOwnership,
  };
  writeDurableJson(journalPath, journal);
  mkdirSync(backupRoot, { mode: 0o700 });
  fsyncDirectory(directory);
  try {
    for (const relativePath of affectedPaths) {
      const destination = join(target, relativePath);
      if (!pathExists(destination)) continue;
      const backup = join(backupRoot, relativePath);
      mkdirSync(dirname(backup), { recursive: true });
      renameSync(destination, backup);
    }

    const installOrder = [...desiredPaths]
      .sort()
      .sort(
        (a, b) =>
          Number(a === MANIFEST_RELATIVE_PATH) -
          Number(b === MANIFEST_RELATIVE_PATH),
      );
    for (const relativePath of installOrder) {
      const source = join(stagedRoot, relativePath);
      const destination = join(target, relativePath);
      mkdirSync(dirname(destination), { recursive: true });
      renameSync(source, destination);
    }
    writeDurableJson(
      ownershipPath(target),
      ownershipRecord(target, join(target, MANIFEST_RELATIVE_PATH)),
    );
    journal.status = "committed";
    writeDurableJson(journalPath, journal);
  } catch (installError) {
    try {
      restorePreparedTransaction(target, journal);
      // Preserve the backup even when cancellation interrupts rollback.
    } catch (rollbackError) {
      throw new ProjectionError(
        `rollback failed; recover managed files from ${backupRoot}: ${String(rollbackError)}`,
      );
    }
    throw installError;
  }

  cleanupTransaction(target);
  for (const relativePath of [...previousPaths]
    .filter((path) => !desiredPaths.has(path))
    .sort()
    .reverse()) {
    removeEmptyParents(join(target, relativePath), target);
  }
  return previousProjection;
}

function ensurePrivateStateDirectory(target: string): string {
  const directory = stateDirectory(target);
  if (lstatSync(directory, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new ProjectionError(
      `installer state directory must not be a symlink: ${directory}`,
    );
  }
  mkdirSync(directory, { mode: 0o700, recursive: true });
  if (!statSync(directory).isDirectory()) {
    throw new ProjectionError(
      `installer state path is not a directory: ${directory}`,
    );
  }
  chmodSync(directory, 0o700);
  return directory;
}

export interface InstallerArguments {
  /** config scope being projected */
  readonly scope: "project" | "user";
  /** selected plugin names in first-mention order */
  readonly plugins: readonly string[];
  /** whether every catalogued plugin was requested via --all */
  readonly installAll: boolean;
  /** explicit project root overriding Git worktree detection */
  readonly projectRoot?: string;
  /** build and validate without touching the target or installer state */
  readonly dryRun: boolean;
}
export type ParsedArguments =
  | { readonly kind: "arguments"; readonly value: InstallerArguments }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "help" };

const program = "install_opencode.ts";
const usage = `usage: ${program} [-h] --scope {user,project} (--plugin NAME | --all)
${" ".repeat(program.length + 8)}[--project-root PROJECT_ROOT] [--dry-run]`;
const help = `${usage}

Project this marketplace into an OpenCode V1 config directory.

options:
  -h, --help            show this help message and exit
  --scope {user,project}
  --plugin NAME
  --all
  --project-root PROJECT_ROOT
  --dry-run
`;

/**
 * Parses the public installer command line with argparse-compatible errors.
 *
 * @param argv - command-line tokens without the program name
 * @returns parsed arguments, a help request, or an error message
 */
export function parseArgs(argv: readonly string[]): ParsedArguments {
  let scope: InstallerArguments["scope"] | undefined;
  let projectRoot: string | undefined;
  let installAll = false;
  let dryRun = false;
  let sawPlugin = false;
  const plugins: string[] = [];
  const unrecognized: string[] = [];

  function optionValue(argument: string): string {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("-")) {
      return fail(`argument ${argument}: expected one argument`);
    }
    index += 1;
    return value;
  }
  function fail(message: string): never {
    throw Object.assign(new Error(message), { parseFailure: true });
  }

  let index = -1;
  try {
    while (++index < argv.length) {
      const argument = argv[index]!;
      if (argument === "-h" || argument === "--help") return { kind: "help" };
      else if (argument === "--scope") {
        const value = optionValue("--scope");
        if (value !== "user" && value !== "project") {
          fail(
            `argument --scope: invalid choice: '${value}' (choose from user, project)`,
          );
        }
        scope = value;
      } else if (argument.startsWith("--scope=")) {
        const value = argument.slice("--scope=".length);
        if (value !== "user" && value !== "project") {
          fail(
            `argument --scope: invalid choice: '${value}' (choose from user, project)`,
          );
        }
        scope = value;
      } else if (argument === "--plugin") {
        if (installAll)
          fail("argument --plugin: not allowed with argument --all");
        plugins.push(optionValue("--plugin"));
        sawPlugin = true;
      } else if (argument.startsWith("--plugin=")) {
        if (installAll)
          fail("argument --plugin: not allowed with argument --all");
        plugins.push(argument.slice("--plugin=".length));
        sawPlugin = true;
      } else if (argument === "--all") {
        if (sawPlugin)
          fail("argument --all: not allowed with argument --plugin");
        installAll = true;
      } else if (argument === "--project-root") {
        projectRoot = optionValue("--project-root");
      } else if (argument.startsWith("--project-root=")) {
        projectRoot = argument.slice("--project-root=".length);
      } else if (argument === "--dry-run") {
        dryRun = true;
      } else unrecognized.push(argument);
    }
  } catch (error) {
    if ((error as { parseFailure?: boolean }).parseFailure === true) {
      return { kind: "error", message: (error as Error).message };
    }
    throw error;
  }
  if (scope === undefined) {
    return {
      kind: "error",
      message: "the following arguments are required: --scope",
    };
  }
  if (!sawPlugin && !installAll) {
    return {
      kind: "error",
      message: "one of the arguments --plugin --all is required",
    };
  }
  if (unrecognized.length > 0) {
    return {
      kind: "error",
      message: `unrecognized arguments: ${unrecognized.join(" ")}`,
    };
  }
  return {
    kind: "arguments",
    value: { scope, plugins, installAll, projectRoot, dryRun },
  };
}

/**
 * Builds and optionally installs an OpenCode V1 projection.
 *
 * @param argv - command-line arguments; defaults to `process.argv.slice(2)`
 * @returns the process exit code
 */
export function main(argv: readonly string[] = process.argv.slice(2)): number {
  const parsed = parseArgs(argv);
  if (parsed.kind === "help") {
    process.stdout.write(help);
    return 0;
  }
  if (parsed.kind === "error") {
    process.stderr.write(`${usage}\n${program}: error: ${parsed.message}\n`);
    return 2;
  }
  const args = parsed.value;
  try {
    const pluginsByName = marketplacePlugins();
    const selectedPlugins = args.installAll
      ? Object.keys(pluginsByName)
      : [...new Set(args.plugins)];
    const resolvedPlugins = resolvePlugins(selectedPlugins, pluginsByName);
    const target = projectTarget(args.scope, args.projectRoot);
    if (args.dryRun) {
      if (pathExists(transactionPath(target))) {
        throw new ProjectionError(
          "an interrupted transaction requires a non-dry-run recovery",
        );
      }
    } else {
      recoverInterruptedTransaction(target);
    }
    const temporaryParent = args.dryRun ? undefined : dirname(target);
    if (temporaryParent !== undefined) {
      mkdirSync(temporaryParent, { recursive: true });
    }
    const stagedRoot = mkdtempSync(
      join(temporaryParent ?? tmpdir(), "alvis-opencode-stage-"),
    );
    let manifest: JsonObject;
    let previousProjection: PreviousProjection;
    try {
      manifest = buildProjection(
        stagedRoot,
        args.scope,
        selectedPlugins,
        resolvedPlugins,
        pluginsByName,
      );
      if (args.dryRun) {
        const desiredPaths = new Set(stagedFiles(stagedRoot));
        previousProjection = loadPreviousProjection(target, desiredPaths);
        validateCollisions(
          target,
          desiredPaths,
          previousProjection.managedPaths,
        );
      } else {
        previousProjection = installStagedProjection(stagedRoot, target);
      }
    } finally {
      rmRecursive(stagedRoot);
    }
    const managedPaths = manifest.managed_paths;
    if (!Array.isArray(managedPaths)) {
      throw new ProjectionError("generated manifest has no managed paths");
    }
    process.stdout.write(
      `${ensureAscii(
        JSON.stringify(
          {
            status: args.dryRun ? "dry-run" : "installed",
            target,
            selected_plugins: selectedPlugins,
            resolved_plugins: resolvedPlugins,
            existing_projection: previousProjection.classification,
            retired_legacy_symlink_count:
              previousProjection.legacySymlinkPaths.size,
            managed_file_count: managedPaths.length,
          },
          null,
          2,
        ),
      )}\n`,
    );
    return 0;
  } catch (error) {
    if (error instanceof ProjectionError) {
      process.stderr.write(`${program}: error: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

if (import.meta.main) process.exit(main());
