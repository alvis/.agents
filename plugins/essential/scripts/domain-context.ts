import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";

type Audience = "main" | "subagent";
type JsonRecord = Record<string, unknown>;
type ReceiptIdentity = readonly unknown[];
type DeliveryScope = readonly [string, Audience, readonly string[]];

interface DomainPlugin {
  readonly name: string;
  readonly path: string;
  readonly enabled?: boolean;
}

interface DeliveryDomain {
  readonly policy: string;
  readonly files: Readonly<Record<string, string>>;
}

type DeliveryDomains = Record<string, DeliveryDomain>;

/** inputs for resolving the domain instructions not yet delivered to an agent */
export interface DomainContextParams {
  /** enabled plugin roots and their plugin-local routing policies */
  readonly plugins: readonly DomainPlugin[];
  /** main-agent or subagent payload boundary */
  readonly audience: Audience;
  /** repository identity that binds delivery receipts */
  readonly cwd: string;
  /** deterministic request, operation, and repository evidence */
  readonly evidence?: JsonRecord;
  /** previous delivery receipt for the current plugin set */
  readonly receipt?: string;
  /** receipts emitted by earlier per-plugin native hook invocations */
  readonly deliveredReceipts?: readonly string[];
  /** whether to discard prior delivery state for startup or a cleared session */
  readonly reset?: boolean;
  /** whether to re-emit all active context despite prior delivery identities */
  readonly reconstruct?: boolean;
  /** payload names selected for a per-plugin hook invocation */
  readonly payloadNames?: readonly string[];
}

/** incremental domain instructions and the receipt that identifies their state */
export interface DomainContextResult {
  /** newly applicable instructional context */
  readonly context: string;
  /** receipt for the exact scope, policies, and payload content now delivered */
  readonly receipt: string;
  /** plugin roots included in the resolved delivery state */
  readonly activeRoots: readonly string[];
}

/**
 * resolves incremental domain context against a caller-carried delivery receipt
 * @param params request evidence and delivery identity
 * @returns incremental context and updated receipt
 */
export function resolveDomainContext(
  params: DomainContextParams,
): DomainContextResult {
  const { audience, evidence = {}, receipt, reset = false } = params;
  if (audience !== "main" && audience !== "subagent")
    throw new Error("invalid context audience");
  const plugins = params.plugins
    .filter((plugin) => plugin.enabled !== false)
    .sort(
      (left, right) =>
        Number(right.name === "essential") -
          Number(left.name === "essential") ||
        left.path.localeCompare(right.path),
    );
  for (const plugin of plugins) {
    if (!isAbsolute(plugin.path))
      throw new Error(`enabled plugin root must be absolute: ${plugin.path}`);
    if (!statSync(plugin.path).isDirectory())
      throw new Error(`enabled plugin root is not a directory: ${plugin.path}`);
  }
  const scope: DeliveryScope = [
    realpathSync(params.cwd),
    audience,
    plugins.map((plugin) => realpathSync(plugin.path)),
  ];
  const previous = reset ? {} : readDeliveryReceipt(receipt, scope);
  const domains: DeliveryDomains = {};
  const context: string[] = [];
  const payloadNames = params.payloadNames ?? [
    "ALLAGENT",
    audience === "main" ? "MAINAGENT" : "SUBAGENT",
  ];
  for (const plugin of plugins) {
    const policyPath = join(plugin.path, "hooks", "context.json");
    const policyText = existsSync(policyPath)
      ? readFileSync(policyPath, "utf8")
      : undefined;
    const policy =
      policyText === undefined
        ? undefined
        : requireRecord(JSON.parse(policyText), "invalid domain policy");
    const policyHash = hashContext(policyText ?? "universal");
    const prior = (reset ? [] : (params.deliveredReceipts ?? [])).reduce<
      DeliveryDomain | undefined
    >((retained, deliveredReceipt) => {
      const delivered = readDeliveryReceipt(deliveredReceipt, [
        scope[0],
        audience,
        [realpathSync(plugin.path)],
      ])[plugin.path];
      if (
        !delivered ||
        delivered.policy !== policyHash ||
        !Object.entries(delivered.files).every(([name, identity]) => {
          if (
            ![
              "ALLAGENT",
              audience === "main" ? "MAINAGENT" : "SUBAGENT",
            ].includes(name)
          )
            return false;
          const path = join(plugin.path, "hooks", `${name}.md`);
          if (!existsSync(path) || !statSync(path).isFile()) return false;
          return (
            identity ===
            hashContext(
              readFileSync(path, "utf8").replaceAll(
                "{{PLUGIN_DIR}}",
                () => plugin.path,
              ),
            )
          );
        })
      )
        return retained;
      return {
        policy: policyHash,
        files: {
          ...(retained?.policy === policyHash ? retained.files : {}),
          ...delivered.files,
        },
      };
    }, previous[plugin.path]);
    if (policy && !prior && !matchesDomain(policy, evidence)) continue;
    const files: Record<string, string> = { ...prior?.files };
    for (const name of payloadNames) {
      if (!["ALLAGENT", "MAINAGENT", "SUBAGENT"].includes(name))
        throw new Error("invalid context payload");
      if (name === "MAINAGENT" && audience !== "main") continue;
      if (name === "SUBAGENT" && audience !== "subagent") continue;
      const path = join(plugin.path, "hooks", `${name}.md`);
      if (lstatSync(path, { throwIfNoEntry: false }) === undefined) continue;
      if (!statSync(path).isFile())
        throw new Error(`payload is not a regular file: ${path}`);
      const content = readFileSync(path, "utf8").replaceAll(
        "{{PLUGIN_DIR}}",
        () => plugin.path,
      );
      const identity = hashContext(content);
      if (
        params.reconstruct ||
        prior?.policy !== policyHash ||
        files[name] !== identity
      )
        context.push(content);
      files[name] = identity;
    }
    domains[plugin.path] = { policy: policyHash, files };
  }
  const body = { version: 1, scope, domains };
  return {
    context: context.join("\n\n"),
    receipt: JSON.stringify({
      ...body,
      checksum: hashContext(JSON.stringify(body)),
    }),
    activeRoots: Object.keys(domains),
  };
}

/**
 * runs one native payload registration without cross-plugin installation assumptions
 * @param root current plugin root
 * @param event native hook event
 * @param payloadName selected payload basename
 */
export function runNativeDomainHook(
  root: string,
  event: string,
  payloadName: string,
): void {
  const harness = process.env.PLUGIN_ROOT
    ? "codex"
    : process.env.GROK_PLUGIN_ROOT
      ? "grok"
      : process.env.CLAUDE_PLUGIN_ROOT
        ? "claude"
        : undefined;
  if (!harness || !root) throw new Error("plugin root unset");
  let input: JsonRecord;
  try {
    input = asRecord(JSON.parse(readFileSync(0, "utf8"))) ?? {};
  } catch {
    input = {};
  }
  const session =
    nonemptyString(input.session_id ?? input.sessionId) ??
    (harness === "grok"
      ? nonemptyString(process.env.GROK_SESSION_ID)
      : undefined);
  const actor =
    nonemptyString(input.agent_id ?? input.agentId) ??
    (harness === "grok" && nonemptyString(input.subagentType)
      ? session
      : undefined);
  const audience =
    event === "SubagentStart" || actor || input.agent_type || input.subagentType
      ? "subagent"
      : "main";
  if (harness === "grok" && payloadName !== "ALLAGENT") return;
  if (payloadName === "MAINAGENT" && audience !== "main") return;
  const cwd = realpathSync(nonemptyString(input.cwd) ?? process.cwd());
  const canonicalRoot = realpathSync(root);
  const identity: ReceiptIdentity | undefined =
    session && (audience === "main" || actor)
      ? [
          harness,
          session,
          actor ?? null,
          cwd,
          canonicalRoot,
          audience,
          harness === "grok" ? "domain" : payloadName,
        ]
      : undefined;
  if (harness === "grok") {
    if (
      event === "SessionStart" &&
      !["resume", "compact"].includes(nonemptyString(input.source) ?? "") &&
      identity
    )
      deleteDomainReceipt(identity);
    if (event === "PostToolUse") {
      if (identity) acknowledgeGrokLoader(input, root, audience, cwd, identity);
      return;
    }
    if (event !== "PreToolUse") return;
  } else if (event === "PostToolUse") return;
  const receipt = identity ? readDomainReceipt(identity) : undefined;
  const result = resolveDomainContext({
    plugins: [{ name: basename(canonicalRoot), path: root }],
    audience,
    cwd,
    evidence: {
      ...input,
      tool_name: input.tool_name ?? input.toolName,
      tool_input: input.tool_input ?? input.toolInput,
      agent_type: input.agent_type ?? input.subagentType,
    },
    receipt,
    reset:
      event === "SessionStart" &&
      !["resume", "compact"].includes(nonemptyString(input.source) ?? ""),
    payloadNames: harness === "grok" ? undefined : [payloadName],
  });
  if (identity) writeDomainReceipt(identity, result.receipt);
  if (result.context)
    process.stdout.write(
      JSON.stringify(
        harness === "grok"
          ? {
              decision: "deny",
              reason: JSON.stringify({
                context: result.context,
                receipt: result.receipt,
                retry:
                  "Read and follow this context, retain its receipt for the next loader call with --delivered-receipt, then retry the operation.",
              }),
            }
          : {
              hookSpecificOutput: {
                hookEventName: event,
                additionalContext: result.context,
              },
            },
      ) + "\n",
    );
}

function acknowledgeGrokLoader(
  input: JsonRecord,
  root: string,
  audience: Audience,
  cwd: string,
  identity: ReceiptIdentity,
): void {
  const command = asRecord(input.toolInput)?.command;
  const args = contextLoaderArguments(command);
  const result = asRecord(input.toolResult);
  if (
    !args ||
    input.toolInputTruncated ||
    input.toolResultTruncated ||
    result?.type !== "Bash" ||
    result.exit_code !== 0 ||
    result.command !== command ||
    typeof result.output_for_prompt !== "string" ||
    !result.output_for_prompt
  )
    return;
  try {
    const loader = realpathSync(args[0]);
    if (loader !== realpathSync(join(import.meta.dirname, "context.ts")))
      return;
    const declaredAudience = args[args.indexOf("--audience") + 1];
    if (declaredAudience !== audience) return;
    const validation = spawnSync(
      "bun",
      [...args, "--verify-output", result.output_for_prompt],
      { cwd, encoding: "utf8" },
    );
    if (validation.status !== 0) return;
    const loaderOutput = requireRecord(
      JSON.parse(result.output_for_prompt),
      "invalid loader output",
    );
    if (typeof loaderOutput.receipt !== "string") return;
    const delivered = requireRecord(
      JSON.parse(loaderOutput.receipt),
      "invalid loader receipt",
    );
    const deliveredDomains = asRecord(delivered.domains);
    const domain = deliveredDomains?.[root];
    if (!isDeliveryDomain(domain)) return;
    const body = {
      version: 1,
      scope: [
        realpathSync(cwd),
        audience,
        [realpathSync(root)],
      ] as DeliveryScope,
      domains: { [root]: domain },
    };
    writeDomainReceipt(
      identity,
      JSON.stringify({ ...body, checksum: hashContext(JSON.stringify(body)) }),
    );
  } catch {
    /* unverified output never acknowledges delivery */
  }
}

/**
 * reads an identity-bound receipt, treating absent or corrupt evidence as no delivery
 * @param identity exact harness or projection session identity
 * @returns previously acknowledged delivery
 */
export function readDomainReceipt(
  identity: ReceiptIdentity,
): string | undefined {
  try {
    const folder = receiptFolder();
    const stat = lstatSync(folder);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.()
    )
      return undefined;
    const path = join(folder, `${hashContext(JSON.stringify(identity))}.json`);
    const file = lstatSync(path);
    if (!file.isFile() || file.isSymbolicLink()) return undefined;
    const stored = asRecord(JSON.parse(readFileSync(path, "utf8")));
    if (stored === undefined) return undefined;
    if (
      JSON.stringify(stored.identity) !== JSON.stringify(identity) ||
      typeof stored.receipt !== "string"
    )
      return undefined;
    return stored.receipt;
  } catch {
    return undefined;
  }
}

/**
 * atomically persists delivery evidence without retaining request text
 * @param identity exact harness or projection session identity
 * @param receipt validated delivery receipt
 * @returns whether durable persistence succeeded
 */
export function writeDomainReceipt(
  identity: ReceiptIdentity,
  receipt: string,
): boolean {
  try {
    const folder = receiptFolder();
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const stat = lstatSync(folder);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.()
    )
      throw new Error("unsafe receipt directory");
    const key = hashContext(JSON.stringify(identity));
    const temporary = join(folder, `${key}-${randomUUID()}.json`);
    writeFileSync(temporary, JSON.stringify({ identity, receipt }), {
      flag: "wx",
      mode: 0o600,
    });
    renameSync(temporary, join(folder, `${key}.json`));
    return true;
  } catch (error) {
    const receiptError = error as Error;
    process.stderr.write(
      `context receipt unavailable: ${receiptError.message}\n`,
    );
    return false;
  }
}

/**
 * retires the exact receipt when its host reports the session deleted
 * @param identity exact harness or projection session identity
 */
export function deleteDomainReceipt(identity: ReceiptIdentity): void {
  const folder = receiptFolder();
  const directory = lstatSync(folder, { throwIfNoEntry: false });
  if (
    !directory?.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.uid !== process.getuid?.()
  )
    return;
  const path = join(folder, `${hashContext(JSON.stringify(identity))}.json`);
  const file = lstatSync(path, { throwIfNoEntry: false });
  if (file?.isFile() && !file.isSymbolicLink()) unlinkSync(path);
}

function receiptFolder(): string {
  return join(tmpdir(), `alvis-domain-context-${process.getuid?.() ?? "user"}`);
}

function nonemptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function hashContext(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function matchesDomain(policy: JsonRecord, evidence: JsonRecord): boolean {
  const toolInput = asRecord(evidence.tool_input ?? evidence.toolInput);
  if (isContextLoaderCommand(toolInput?.command)) return false;
  const categories = [
    ["request_patterns", String(evidence.prompt ?? "")],
    ["tool_patterns", String(evidence.tool_name ?? "")],
    ["tool_patterns", JSON.stringify(evidence.tool_input ?? {})],
    ["agent_patterns", String(evidence.agent_type ?? "")],
  ] as const;
  return categories.some(([key, value]) => {
    if (
      !Array.isArray(policy[key]) ||
      !policy[key].every((pattern) => typeof pattern === "string")
    )
      throw new Error(`invalid domain policy: ${key}`);
    return policy[key].some((pattern) => new RegExp(pattern, "i").test(value));
  });
}

function isContextLoaderCommand(command: unknown): boolean {
  return contextLoaderArguments(command) !== undefined;
}

function contextLoaderArguments(command: unknown): string[] | undefined {
  if (typeof command !== "string" || command.includes("\n")) return undefined;
  const words: string[] = [];
  let word = "",
    quote = "",
    started = false;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (quote === "'") {
      if (character === "'") quote = "";
      else word += character;
      continue;
    }
    if (character === "\\") {
      const next = command[++index];
      if (next === undefined) return undefined;
      word +=
        quote === '"' && !['"', "\\", "$", "`"].includes(next)
          ? `\\${next}`
          : next;
      started = true;
      continue;
    }
    if (
      character === "$" ||
      character === "`" ||
      (!quote && ";|&<>()*?[]{}".includes(character))
    )
      return undefined;
    if (quote === '"') {
      if (character === '"') quote = "";
      else word += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      started = true;
      continue;
    }
    if (/\s/.test(character)) {
      if (started) words.push(word);
      word = "";
      started = false;
      continue;
    }
    word += character;
    started = true;
  }
  if (quote) return undefined;
  if (started) words.push(word);
  if (words[0] === "rtk") {
    words.shift();
    if (words.at(0) === "proxy") words.shift();
  }
  if (words.shift() !== "bun") return undefined;
  if (words[0] === "run") words.shift();
  if (!isAbsolute(words[0] ?? "") || !words[0].endsWith("/scripts/context.ts"))
    return undefined;
  const flags = new Set<string>();
  for (let index = 1; index < words.length; index += 1) {
    const flag = words[index];
    if (
      (flags.has(flag) && flag !== "--delivered-receipt") ||
      ![
        "--audience",
        "--prompt",
        "--receipt",
        "--delivered-receipt",
        "--reset",
      ].includes(flag)
    )
      return undefined;
    flags.add(flag);
    if (flag !== "--reset" && words[++index] === undefined) return undefined;
  }
  if (
    !flags.has("--audience") ||
    !["main", "subagent"].includes(words[words.indexOf("--audience") + 1])
  )
    return undefined;
  return words;
}

function readDeliveryReceipt(
  receipt: string | undefined,
  scope: DeliveryScope,
): DeliveryDomains {
  if (receipt === undefined) return {};
  try {
    const parsed = asRecord(JSON.parse(receipt));
    if (parsed === undefined) return {};
    const { checksum, ...body } = parsed;
    // detects accidental edits; this checksum is not adversarial authentication
    if (
      body.version !== 1 ||
      checksum !== hashContext(JSON.stringify(body)) ||
      JSON.stringify(body.scope) !== JSON.stringify(scope)
    )
      return {};
    if (!isDeliveryDomains(body.domains)) return {};
    return body.domains;
  } catch {
    return {};
  }
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function requireRecord(value: unknown, message: string): JsonRecord {
  const record = asRecord(value);
  if (record === undefined) throw new Error(message);
  return record;
}

function isDeliveryDomain(value: unknown): value is DeliveryDomain {
  const domain = asRecord(value);
  const files = asRecord(domain?.files);
  return (
    typeof domain?.policy === "string" &&
    files !== undefined &&
    Object.values(files).every((identity) => typeof identity === "string")
  );
}

function isDeliveryDomains(value: unknown): value is DeliveryDomains {
  const domains = asRecord(value);
  return (
    domains !== undefined && Object.values(domains).every(isDeliveryDomain)
  );
}

if (import.meta.main) {
  runNativeDomainHook(process.argv[2], process.argv[3], process.argv[4]);
}
