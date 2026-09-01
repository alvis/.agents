import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PLUGIN_ROOT_ANCHOR, PLUGIN_ROOT_GUARD } from "./harness_contract.ts";

type JsonObject = Record<string, unknown>;

/** describes one source hook and its OpenCode enforcement projection */
export interface HookReceipt {
  readonly audiences: readonly string[];
  readonly enforcement_mode: string;
  readonly managed_resource: string;
  readonly requirements: Readonly<Record<string, string>>;
  readonly source_event: string;
  readonly source_order: number;
  readonly source_plugin: string;
  readonly source_scope: string;
  readonly tool_aliases: readonly string[];
}

/** supplies the source and policy inputs used to resolve hook receipts */
export interface ResolveHookReceiptsParams {
  readonly contract: JsonObject;
  readonly pluginFiles: readonly string[];
  readonly pluginName: string;
  readonly pluginRoot: string;
}

interface HookRegistration {
  readonly command: string;
  readonly event: string;
  readonly matcher?: string;
  readonly scope: string;
}

function objectValue(value: unknown, description: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid ${description}`);
  }
  return value as JsonObject;
}

function stringValue(value: unknown, description: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`invalid ${description}`);
  }
  return value;
}

function stringArray(value: unknown, description: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((entry) => typeof entry === "string" && entry !== "")
  ) {
    throw new Error(`invalid ${description}`);
  }
  return value;
}

function parseJsonObject(path: string): JsonObject {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`cannot parse hook source ${path}: ${(error as Error).message}`);
  }
  return objectValue(value, `hook source ${path}`);
}

function hookContract(contract: JsonObject): JsonObject {
  return objectValue(contract.opencode_hooks, "opencode_hooks contract");
}

function matcherAliases(matcher?: string): readonly string[] {
  if (matcher === undefined) return [];
  const aliases = matcher.split("|");
  if (aliases.some((alias) => alias === "") || new Set(aliases).size !== aliases.length) {
    throw new Error(`invalid hook matcher: ${matcher}`);
  }
  return aliases;
}

function receiptAliases(
  matcher: string | undefined,
  policy: JsonObject,
): readonly string[] {
  const nativeAliases = matcherAliases(matcher);
  const opencodeAliases =
    policy.opencode_aliases === undefined
      ? []
      : stringArray(policy.opencode_aliases, "OpenCode hook aliases");
  return [...new Set([...nativeAliases, ...opencodeAliases])];
}

function parseGlobalRegistrations(path: string): readonly HookRegistration[] {
  const source = parseJsonObject(path);
  const hooks = objectValue(source.hooks, `hooks in ${path}`);
  const registrations: HookRegistration[] = [];
  for (const [event, rawEntries] of Object.entries(hooks)) {
    if (!Array.isArray(rawEntries)) {
      throw new Error(`invalid ${event} registrations in ${path}`);
    }
    for (const rawEntry of rawEntries) {
      const entry = objectValue(rawEntry, `${event} registration in ${path}`);
      if (Object.keys(entry).some((key) => key !== "hooks" && key !== "matcher")) {
        throw new Error(`unsupported ${event} registration shape in ${path}`);
      }
      const matcher = entry.matcher;
      if (matcher !== undefined && typeof matcher !== "string") {
        throw new Error(`invalid ${event} matcher in ${path}`);
      }
      if (!Array.isArray(entry.hooks) || entry.hooks.length === 0) {
        throw new Error(`invalid ${event} commands in ${path}`);
      }
      for (const rawHook of entry.hooks) {
        const hook = objectValue(rawHook, `${event} command in ${path}`);
        if (
          Object.keys(hook).some((key) => key !== "command" && key !== "type") ||
          hook.type !== "command" ||
          typeof hook.command !== "string"
        ) {
          throw new Error(`unsupported ${event} command shape in ${path}`);
        }
        registrations.push({
          command: hook.command,
          event,
          matcher,
          scope: "global",
        });
      }
    }
  }
  return registrations;
}

function quotedScalar(value: string, description: string): string {
  try {
    const parsed = JSON.parse(value) as unknown;
    return stringValue(parsed, description);
  } catch (error) {
    throw new Error(`invalid ${description}: ${(error as Error).message}`);
  }
}

function parseSkillRegistrations(
  path: string,
  scope: string,
): readonly HookRegistration[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const hooksIndex = lines.indexOf("hooks:");
  if (hooksIndex === -1) return [];
  const registrations: HookRegistration[] = [];
  let event: string | undefined;
  let matcher: string | undefined;
  let awaitsCommand = false;
  for (let index = hooksIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line !== "" && !/^\s/.test(line)) break;
    if (line === "") continue;
    const eventMatch = /^  ([A-Za-z]+):$/.exec(line);
    if (eventMatch) {
      if (awaitsCommand) throw new Error(`incomplete skill hook in ${path}`);
      event = eventMatch[1]!;
      matcher = undefined;
      continue;
    }
    const matcherMatch = /^    - matcher: (.+)$/.exec(line);
    if (matcherMatch && event !== undefined) {
      matcher = quotedScalar(matcherMatch[1]!, `skill hook matcher in ${path}`);
      continue;
    }
    if (line === "      hooks:" && event !== undefined && matcher !== undefined) {
      continue;
    }
    if (line === "        - type: command" && event !== undefined && matcher !== undefined) {
      awaitsCommand = true;
      continue;
    }
    const commandMatch = /^          command: (.+)$/.exec(line);
    if (commandMatch && event !== undefined && matcher !== undefined && awaitsCommand) {
      registrations.push({
        command: quotedScalar(commandMatch[1]!, `skill hook command in ${path}`),
        event,
        matcher,
        scope,
      });
      awaitsCommand = false;
      continue;
    }
    throw new Error(`unsupported skill hook shape in ${path}: ${line.trim()}`);
  }
  if (awaitsCommand) throw new Error(`incomplete skill hook in ${path}`);
  return registrations;
}

function nativePayloadCommand(
  event: string,
  payloadName: string,
  guardedLeadAgent?: string,
): string {
  const leadGuard =
    payloadName === "MAINAGENT" && guardedLeadAgent !== undefined
      ? `if [ -n "\${PLUGIN_ROOT:-}" ] && [ ! -f "\${CODEX_HOME:-\${HOME}/.codex}/agents/${guardedLeadAgent}.toml" ]; then exit 0; fi; `
      : "";
  return `${PLUGIN_ROOT_GUARD}${leadGuard}sed "s|{{PLUGIN_DIR}}|${PLUGIN_ROOT_ANCHOR}|g" "${PLUGIN_ROOT_ANCHOR}/hooks/${payloadName}.md" | jq -Rs '{hookSpecificOutput:{hookEventName:"${event}",additionalContext:.}}'`;
}

function nativeScriptCommand(scriptName: string, policy: JsonObject): string {
  const rawArguments = policy.native_arguments;
  const argumentsList =
    rawArguments === undefined
      ? []
      : stringArray(rawArguments, `${scriptName} native arguments`);
  const argumentsText = argumentsList
    .map((argument) => {
      if (
        argument.startsWith("/") ||
        argument.split("/").includes("..") ||
        !/^[A-Za-z0-9._/-]+$/.test(argument)
      ) {
        throw new Error(`invalid ${scriptName} native argument: ${argument}`);
      }
      return ` "${PLUGIN_ROOT_ANCHOR}/${argument}"`;
    })
    .join("");
  return `${PLUGIN_ROOT_GUARD}"${PLUGIN_ROOT_ANCHOR}/hooks/scripts/${scriptName}"${argumentsText}`;
}

function nativeMatcher(policy: JsonObject, description: string): string | undefined {
  if (!("matcher" in policy)) {
    throw new Error(`missing native matcher in ${description}`);
  }
  return policy.matcher === null
    ? undefined
    : stringValue(policy.matcher, `${description} native matcher`);
}

function receiptFromGlobalRegistration(
  contract: JsonObject,
  pluginName: string,
  registration: HookRegistration,
): HookReceipt {
  const bundlePath = `alvis/plugins/${pluginName}`;
  const payloadPolicies = objectValue(
    hookContract(contract).payloads,
    "payload policies",
  );
  const leadAgents = objectValue(
    hookContract(contract).lead_agents,
    "lead agent policies",
  );
  for (const [payloadName, rawPayloadPolicy] of Object.entries(payloadPolicies)) {
    const payloadPolicy = objectValue(
      rawPayloadPolicy,
      `payload policy ${payloadName}`,
    );
    if (payloadPolicy[registration.event] === undefined) continue;
    const leadAgent =
      payloadName === "MAINAGENT" && typeof leadAgents[pluginName] === "string"
        ? (leadAgents[pluginName] as string)
        : undefined;
    if (payloadName === "MAINAGENT" && leadAgent === undefined) continue;
    const nativeGuardedPlugins =
      payloadName === "MAINAGENT"
        ? stringArray(
            payloadPolicy.native_guarded_plugins,
            "native guarded MAINAGENT plugins",
          )
        : [];
    const guardedLeadAgent = nativeGuardedPlugins.includes(pluginName)
      ? leadAgent
      : undefined;
    if (
      registration.command !==
      nativePayloadCommand(
        registration.event,
        payloadName,
        guardedLeadAgent,
      )
    ) {
      continue;
    }
    if (registration.matcher !== undefined) {
      throw new Error(`unsupported OpenCode payload matcher: ${registration.matcher}`);
    }
    const audiences = stringArray(
      payloadPolicy[registration.event],
      `${payloadName} ${registration.event} audiences`,
    );
    const requirements: Record<string, string> = {};
    if (guardedLeadAgent !== undefined) {
      requirements.projected_agent = guardedLeadAgent;
    }
    return {
      audiences,
      enforcement_mode: "context",
      managed_resource: `${bundlePath}/hooks/${payloadName}.md`,
      requirements,
      source_event: registration.event,
      source_order: 0,
      source_plugin: pluginName,
      source_scope: registration.scope,
      tool_aliases: [],
    };
  }

  const scriptPolicies = objectValue(
    hookContract(contract).scripts,
    "script policies",
  );
  for (const [scriptName, rawPolicy] of Object.entries(scriptPolicies)) {
    const policy = objectValue(rawPolicy, `script policy ${scriptName}`);
    if (registration.command !== nativeScriptCommand(scriptName, policy)) continue;
    if (
      policy.event !== registration.event ||
      nativeMatcher(policy, `script policy ${scriptName}`) !== registration.matcher
    ) {
      throw new Error(`unsupported OpenCode hook registration: ${scriptName}`);
    }
    const resource =
      typeof policy.managed_resource === "string"
        ? policy.managed_resource
        : `hooks/scripts/${scriptName}`;
    const requirements: Record<string, string> = {};
    if (resource !== `hooks/scripts/${scriptName}`) {
      requirements.supporting_resource = `${bundlePath}/hooks/scripts/${scriptName}`;
    } else if (typeof policy.supporting_resource === "string") {
      requirements.supporting_resource = `${bundlePath}/${policy.supporting_resource}`;
    }
    return {
      audiences: stringArray(policy.audiences, `${scriptName} audiences`),
      enforcement_mode: stringValue(
        policy.enforcement_mode,
        `${scriptName} enforcement mode`,
      ),
      managed_resource: `${bundlePath}/${resource}`,
      requirements,
      source_event: registration.event,
      source_order: 0,
      source_plugin: pluginName,
      source_scope: registration.scope,
      tool_aliases: receiptAliases(registration.matcher, policy),
    };
  }
  throw new Error(`unsupported OpenCode hook command: ${registration.command}`);
}

function receiptFromSkillRegistration(
  contract: JsonObject,
  pluginName: string,
  registration: HookRegistration,
): HookReceipt {
  const skillPolicies = objectValue(
    hookContract(contract).skill_scripts,
    "skill script policies",
  );
  const policyPrefix = `${pluginName}/skills/`;
  for (const [policyKey, rawPolicy] of Object.entries(skillPolicies)) {
    if (!policyKey.startsWith(policyPrefix)) continue;
    const parts = policyKey.slice(policyPrefix.length).split("/");
    if (parts.length !== 3 || parts[1] !== "scripts") {
      throw new Error(`invalid OpenCode skill hook policy: ${policyKey}`);
    }
    const [skillName, , scriptName] = parts as [string, string, string];
    const expectedCommand = `bash "${PLUGIN_ROOT_ANCHOR}/skills/${skillName}/scripts/${scriptName}"`;
    if (registration.command !== expectedCommand) continue;
    const policy = objectValue(rawPolicy, `skill script policy ${policyKey}`);
    if (
      policy.event !== registration.event ||
      policy.matcher !== registration.matcher
    ) {
      throw new Error(`unsupported OpenCode skill hook registration: ${policyKey}`);
    }
    return {
      audiences: stringArray(policy.audiences, `${policyKey} audiences`),
      enforcement_mode: stringValue(
        policy.enforcement_mode,
        `${policyKey} enforcement mode`,
      ),
      managed_resource: `alvis/plugins/${pluginName}/skills/${skillName}/scripts/${scriptName}`,
      requirements: {
        native_scope: "skill",
        opencode_scope: "command-filtered",
      },
      source_event: registration.event,
      source_order: 0,
      source_plugin: pluginName,
      source_scope: registration.scope,
      tool_aliases: receiptAliases(registration.matcher, policy),
    };
  }
  throw new Error(`unsupported OpenCode hook command: ${registration.command}`);
}

function validateReceiptResources(
  pluginFiles: ReadonlySet<string>,
  pluginName: string,
  receipts: readonly HookReceipt[],
): void {
  const bundlePrefix = `alvis/plugins/${pluginName}/`;
  for (const receipt of receipts) {
    const relativePath = receipt.managed_resource.slice(bundlePrefix.length);
    if (
      !receipt.managed_resource.startsWith(bundlePrefix) ||
      !pluginFiles.has(relativePath)
    ) {
      throw new Error(`hook resource is not projected: ${receipt.managed_resource}`);
    }
    const supportingResource = receipt.requirements.supporting_resource;
    if (
      supportingResource !== undefined &&
      (!supportingResource.startsWith(bundlePrefix) ||
        !pluginFiles.has(supportingResource.slice(bundlePrefix.length)))
    ) {
      throw new Error(`hook resource is not projected: ${supportingResource}`);
    }
  }
}

/** resolves all global and skill-scoped source hooks into manifest receipts */
export function resolveHookReceipts(
  params: ResolveHookReceiptsParams,
): readonly HookReceipt[] {
  const { contract, pluginFiles, pluginName, pluginRoot } = params;
  const receipts: HookReceipt[] = [];
  if (pluginFiles.includes("hooks/hooks.json")) {
    const registrations = parseGlobalRegistrations(
      join(pluginRoot, "hooks", "hooks.json"),
    );
    receipts.push(
      ...registrations.map((registration) =>
        receiptFromGlobalRegistration(contract, pluginName, registration),
      ),
    );
  }
  for (const relativePath of pluginFiles.filter((path) =>
    /^skills\/[^/]+\/SKILL\.md$/.test(path),
  )) {
    const skillName = relativePath.split("/")[1]!;
    const registrations = parseSkillRegistrations(
      join(pluginRoot, relativePath),
      `skill:${pluginName}:${skillName}`,
    );
    receipts.push(
      ...registrations.map((registration) =>
        receiptFromSkillRegistration(contract, pluginName, registration),
      ),
    );
  }
  validateReceiptResources(new Set(pluginFiles), pluginName, receipts);
  return receipts.map((receipt, sourceOrder) => ({
    ...receipt,
    source_order: sourceOrder,
  }));
}
