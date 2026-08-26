import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { lstat, readFile, realpath } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const adapterDirectory = dirname(fileURLToPath(import.meta.url))
const configRoot = resolve(adapterDirectory, "..")

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"))
}

function validateContract(contract) {
  const stringKeys = [
    "manager",
    "canonical_skill",
    "canonical_command",
    "projected_skill",
    "projected_command",
    "canonical_bundle_path",
    "projected_bundle_path",
  ]
  if (
    stringKeys.some((key) => typeof contract?.[key] !== "string") ||
    !Number.isInteger(contract?.schema_version) ||
    contract?.skill_separator !== "-" ||
    typeof contract?.opencode_hooks !== "object" ||
    contract?.opencode_hooks === null ||
    Array.isArray(contract?.opencode_hooks)
  ) {
    throw new Error("invalid Alvis OpenCode projection contract")
  }
}

function validateHookReceipt(receipt, plugin, manifest) {
  const audiences = receipt?.audiences
  const aliases = receipt?.tool_aliases
  const requirements = receipt?.requirements
  if (
    !Array.isArray(audiences) ||
    audiences.length === 0 ||
    audiences.some((audience) => !["root", "child"].includes(audience)) ||
    new Set(audiences).size !== audiences.length ||
    !["advisory", "after", "before", "context", "unavailable"].includes(
      receipt?.enforcement_mode,
    ) ||
    typeof receipt?.managed_resource !== "string" ||
    !receipt.managed_resource.startsWith(`${plugin.bundle_path}/`) ||
    typeof receipt?.requirements !== "object" ||
    receipt.requirements === null ||
    Array.isArray(receipt.requirements) ||
    Object.values(requirements).some((value) => typeof value !== "string") ||
    !["PostToolUse", "PreToolUse", "SessionStart", "Stop", "SubagentStart"].includes(
      receipt?.source_event,
    ) ||
    !Number.isInteger(receipt?.source_order) ||
    receipt.source_order < 0 ||
    receipt?.source_plugin !== plugin.name ||
    typeof receipt?.source_scope !== "string" ||
    !Array.isArray(aliases) ||
    aliases.some((alias) => typeof alias !== "string" || alias === "") ||
    new Set(aliases).size !== aliases.length ||
    !Object.hasOwn(manifest.file_digests, receipt.managed_resource)
  ) {
    throw new Error("invalid Alvis OpenCode hook receipt")
  }
  const supportingResource = requirements.supporting_resource
  if (
    supportingResource !== undefined &&
    (typeof supportingResource !== "string" ||
      !supportingResource.startsWith(`${plugin.bundle_path}/`) ||
      !Object.hasOwn(manifest.file_digests, supportingResource))
  ) {
    throw new Error("invalid Alvis OpenCode hook receipt")
  }
}

function validateManifest(manifest, contract) {
  if (
    manifest?.manager !== contract.manager ||
    manifest?.schema_version !== contract.schema_version ||
    !["project", "user"].includes(manifest?.scope) ||
    !Array.isArray(manifest?.plugins) ||
    typeof manifest?.file_digests !== "object" ||
    Array.isArray(manifest?.file_digests) ||
    manifest?.file_digests === null
  ) {
    throw new Error("invalid Alvis OpenCode manifest")
  }
  const names = new Set()
  for (const plugin of manifest.plugins) {
    if (
      typeof plugin?.name !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(plugin.name) ||
      plugin.bundle_path !== `alvis/plugins/${plugin.name}` ||
      !Array.isArray(plugin.hooks) ||
      names.has(plugin.name)
    ) {
      throw new Error("invalid Alvis OpenCode plugin receipt")
    }
    for (const receipt of plugin.hooks) {
      validateHookReceipt(receipt, plugin, manifest)
    }
    names.add(plugin.name)
  }
  if (!names.has("essential")) {
    throw new Error("Alvis OpenCode projection requires essential")
  }
}

async function readManagedFile(root, manifest, relativePath) {
  if (isAbsolute(relativePath) || relativePath.split("/").includes("..")) {
    throw new Error(`unsafe managed path ${relativePath}`)
  }
  const expectedDigest = manifest.file_digests[relativePath]
  if (!/^[0-9a-f]{64}$/.test(expectedDigest ?? "")) {
    throw new Error(`unmanaged runtime file ${relativePath}`)
  }
  let current = root
  for (const segment of relativePath.split("/")) {
    current = join(current, segment)
    const status = await lstat(current)
    if (status.isSymbolicLink()) {
      throw new Error(`symlinked runtime path ${relativePath}`)
    }
  }
  const [resolvedRoot, resolvedFile] = await Promise.all([
    realpath(root),
    realpath(current),
  ])
  const containment = relative(resolvedRoot, resolvedFile)
  if (containment.startsWith("..") || isAbsolute(containment)) {
    throw new Error(`runtime path escapes projection ${relativePath}`)
  }
  const content = await readFile(resolvedFile)
  const digest = createHash("sha256").update(content).digest("hex")
  if (digest !== expectedDigest) {
    throw new Error(`managed runtime file was modified ${relativePath}`)
  }
  return { path: resolvedFile, text: content.toString("utf8") }
}

async function loadProjection(root, expectedContract) {
  const manifestFile = join(root, "alvis", "manifest.json")
  const manifestStatus = await lstat(manifestFile)
  if (manifestStatus.isSymbolicLink() || !manifestStatus.isFile()) {
    throw new Error("projection manifest is not a regular file")
  }
  const [contract, manifest] = await Promise.all([
    readJson(join(root, "alvis", "contract.json")),
    readJson(manifestFile),
  ])
  validateContract(contract)
  if (
    expectedContract &&
    (contract.manager !== expectedContract.manager ||
      contract.schema_version !== expectedContract.schema_version ||
      contract.skill_separator !== expectedContract.skill_separator)
  ) {
    throw new Error("project projection contract differs from user projection")
  }
  validateManifest(manifest, contract)
  await Promise.all([
    readManagedFile(root, manifest, "alvis/contract.json"),
    readManagedFile(root, manifest, "plugins/alvis-marketplace.js"),
  ])
  return { contract, manifest }
}

async function logWarning(client, service, message, extra = {}) {
  try {
    await client.app.log({
      body: {
        service,
        level: "warn",
        message,
        extra,
      },
    })
  } catch {
    // logging must never disable the adapter
  }
}

function openCodeChildEnvironment(pluginRoot) {
  const environment = { ...process.env }
  delete environment.CLAUDE_PLUGIN_ROOT
  delete environment.GROK_PLUGIN_ROOT
  delete environment.PLUGIN_ROOT
  environment.PLUGIN_ROOT = pluginRoot
  return environment
}

async function runProcess({ command, environment, input, workingDirectory }) {
  return new Promise((resolveProcess, rejectProcess) => {
    const childProcess = spawn(command[0], command.slice(1), {
      cwd: workingDirectory,
      env: environment,
      stdio: ["pipe", "pipe", "pipe"],
    })
    let standardError = ""
    let standardOutput = ""
    childProcess.stderr.setEncoding("utf8")
    childProcess.stdout.setEncoding("utf8")
    childProcess.stderr.on("data", (chunk) => {
      standardError += chunk
    })
    childProcess.stdout.on("data", (chunk) => {
      standardOutput += chunk
    })
    childProcess.on("error", rejectProcess)
    childProcess.on("close", (status) => {
      if (status !== 0) {
        const detail =
          standardError.trim() || standardOutput.trim() || `exit ${status}`
        rejectProcess(new Error(`${command[0]} failed: ${detail}`))
        return
      }
      resolveProcess({ standardError, standardOutput })
    })
    childProcess.stdin.end(input)
  })
}

function parseHookOutput(result, tool) {
  const standardOutput = result.standardOutput.trim()
  const diagnostics = result.standardError.trim()
  if (standardOutput === "") {
    return { advice: diagnostics, context: "" }
  }
  let parsed
  try {
    parsed = JSON.parse(standardOutput)
  } catch {
    throw new Error(`${tool} hook emitted invalid JSON`)
  }
  const hookOutput = parsed?.hookSpecificOutput
  const decision = hookOutput?.permissionDecision ?? parsed?.decision
  const reason = hookOutput?.permissionDecisionReason ?? parsed?.reason
  if (decision === "deny" || decision === "block") {
    throw new Error(reason || `${tool} denied`)
  }
  const advice = [
    hookOutput?.additionalContext,
    decision === "allow" ? parsed?.reason : undefined,
    diagnostics,
  ]
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .join("\n\n")
  return {
    advice,
    context:
      typeof hookOutput?.additionalContext === "string"
        ? hookOutput.additionalContext
        : "",
  }
}

async function runHookReceipt(
  projectionRoot,
  manifest,
  plugin,
  receipt,
  input,
  workingDirectory,
) {
  const resources = [
    receipt.managed_resource,
    receipt.requirements.supporting_resource,
  ].filter((value) => typeof value === "string")
  const managedFiles = await Promise.all(
    resources.map((relativePath) =>
      readManagedFile(projectionRoot, manifest, relativePath),
    ),
  )
  const executable = managedFiles[0]
  const command = executable.path.endsWith(".sh")
    ? ["bash", executable.path]
    : [executable.path]
  return runProcess({
    command,
    environment: openCodeChildEnvironment(
      join(projectionRoot, plugin.bundle_path),
    ),
    input: JSON.stringify(input),
    workingDirectory,
  })
}

function translateModelContextProtocolServer(server) {
  if (server?.type === "http" && typeof server.url === "string") {
    return {
      type: "remote",
      url: server.url,
      enabled: true,
      headers: server.headers,
    }
  }
  if (typeof server?.command === "string") {
    return {
      type: "local",
      command: [server.command, ...(Array.isArray(server.args) ? server.args : [])],
      enabled: true,
      environment: server.env,
    }
  }
  throw new Error("unsupported Claude MCP server definition")
}

async function configureModelContextProtocol(
  config,
  projectionRoot,
  manifest,
  client,
) {
  config.mcp ??= {}
  for (const plugin of manifest.plugins) {
    const relativePath = `${plugin.bundle_path}/.mcp.json`
    if (!Object.hasOwn(manifest.file_digests, relativePath)) continue
    const sourceFile = await readManagedFile(
      projectionRoot,
      manifest,
      relativePath,
    )
    const source = JSON.parse(sourceFile.text)
    for (const [name, server] of Object.entries(source.mcpServers ?? {})) {
      if (Object.hasOwn(config.mcp, name)) {
        await logWarning(client, manifest.manager, `kept existing MCP server ${name}`, {
          plugin: plugin.name,
        })
        continue
      }
      config.mcp[name] = translateModelContextProtocolServer(server)
    }
  }
}

async function readReceiptPayload(projectionRoot, manifest, plugin, receipt) {
  const payload = await readManagedFile(
    projectionRoot,
    manifest,
    receipt.managed_resource,
  )
  return payload.text.replaceAll(
    "{{PLUGIN_DIR}}",
    join(projectionRoot, plugin.bundle_path),
  )
}

async function resolveSessionAudience(client, sessionId) {
  if (!sessionId) throw new Error("system transform has no session ID")
  const result = await client.session.get({ path: { id: sessionId } })
  if (result?.error || !result?.data || typeof result.data !== "object") {
    throw new Error("session lookup returned no session")
  }
  return result.data.parentID ? "child" : "root"
}

function buildIdentifierContext(contract) {
  return [
    "## Alvis OpenCode V1 projection",
    "",
    `- \`${contract.canonical_skill}\` and \`${contract.canonical_command}\` map to \`${contract.projected_skill}\` and \`${contract.projected_command}\`.`,
    `- \`${contract.canonical_bundle_path}\` maps to \`${contract.projected_bundle_path}\` under this OpenCode config root.`,
    "- OpenCode child sessions are task subagents; persistent teammate identities and direct peer messaging are unavailable.",
  ].join("\n")
}

async function buildSystemContext(
  projectionRoot,
  contract,
  manifest,
  client,
  sessionId,
  workingDirectory,
) {
  let sessionAudience
  try {
    sessionAudience = await resolveSessionAudience(client, sessionId)
  } catch (error) {
    const caughtError = /** @type {Error} */ (error)
    await logWarning(client, manifest.manager, "could not resolve session audience", {
      error: caughtError.message,
    })
  }

  const contextAudience = sessionAudience === "root" ? "session" : "subagent"
  const payloads = []
  if (!sessionAudience) {
    payloads.push(buildIdentifierContext(contract))
    return payloads.join("\n\n")
  }
  for (const plugin of manifest.plugins) {
    const receipts = plugin.hooks
      .filter(
        (receipt) =>
          ["advisory", "context"].includes(receipt.enforcement_mode) &&
          receipt.audiences.includes(sessionAudience),
      )
      .sort((left, right) => left.source_order - right.source_order)
    for (const receipt of receipts) {
      if (receipt.requirements.supporting_resource !== undefined) {
        await readManagedFile(
          projectionRoot,
          manifest,
          receipt.requirements.supporting_resource,
        )
      }
      const requiredAgent = receipt.requirements.projected_agent
      if (requiredAgent !== undefined) {
        const agentPath = `agents/${requiredAgent}.md`
        if (!Object.hasOwn(manifest.file_digests, agentPath)) continue
        await readManagedFile(projectionRoot, manifest, agentPath)
      }
      if (receipt.enforcement_mode === "advisory") {
        const advisory = await readReceiptPayload(
          projectionRoot,
          manifest,
          plugin,
          receipt,
        )
        payloads.push(
          [
            "## OpenCode host limitation: Stop hook is advisory",
            "",
            advisory.trim(),
          ].join("\n"),
        )
        continue
      }
      if (receipt.managed_resource.endsWith(".md")) {
        payloads.push(
          await readReceiptPayload(
            projectionRoot,
            manifest,
            plugin,
            receipt,
          ),
        )
        continue
      }
      const result = await runHookReceipt(
        projectionRoot,
        manifest,
        plugin,
        receipt,
        receipt.source_event === "SessionStart" ? { source: "unknown" } : {},
        workingDirectory,
      )
      const context = parseHookOutput(result, contextAudience).context
      if (context) payloads.push(context)
    }
  }
  payloads.push(buildIdentifierContext(contract))
  return payloads.join("\n\n")
}

async function isSuppressedByProjectProjection(manifest, contract, worktree) {
  if (manifest.scope !== "user" || !worktree) return false
  try {
    const projectRoot = resolve(worktree, ".opencode")
    const project = await loadProjection(projectRoot, contract)
    if (project.manifest.scope !== "project") return false
    await Promise.all(
      project.manifest.plugins.flatMap((plugin) =>
        plugin.hooks.flatMap((receipt) =>
          [
            receipt.managed_resource,
            receipt.requirements.supporting_resource,
          ]
            .filter((value) => typeof value === "string")
            .map((relativePath) =>
              readManagedFile(projectRoot, project.manifest, relativePath),
            ),
        ),
      ),
    )
    return true
  } catch {
    return false
  }
}

export const AlvisMarketplace = async ({ client, directory, worktree }) => {
  const { contract, manifest } = await loadProjection(configRoot)
  if (await isSuppressedByProjectProjection(manifest, contract, worktree)) return {}

  const hookBindings = manifest.plugins.flatMap((plugin) =>
    plugin.hooks.map((receipt) => ({ plugin, receipt })),
  )
  const pendingAdvice = new Map()

  const adviceKey = (sessionID, callID) => `${sessionID}\0${callID}`
  const clearSessionAdvice = (sessionID) => {
    const prefix = `${sessionID}\0`
    for (const key of pendingAdvice.keys()) {
      if (key.startsWith(prefix)) pendingAdvice.delete(key)
    }
  }

  const audienceForToolCall = async (bindings, sessionID) => {
    if (
      bindings.every(
        ({ receipt }) =>
          receipt.audiences.includes("root") &&
          receipt.audiences.includes("child"),
      )
    ) {
      return undefined
    }
    try {
      return await resolveSessionAudience(client, sessionID)
    } catch (error) {
      const exception = /** @type {Error} */ (error)
      await logWarning(client, manifest.manager, "could not resolve hook audience", {
        error: exception.message,
      })
      return null
    }
  }

  const bindingsForTool = async (enforcementMode, input) => {
    const matching = hookBindings.filter(
      ({ receipt }) =>
        receipt.enforcement_mode === enforcementMode &&
        receipt.tool_aliases.includes(input.tool),
    )
    const audience = await audienceForToolCall(matching, input.sessionID)
    return matching.filter(
      ({ receipt }) => audience === undefined || receipt.audiences.includes(audience),
    )
  }

  return {
    dispose: async () => {
      pendingAdvice.clear()
    },
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        clearSessionAdvice(event.properties.sessionID)
      }
      if (event.type === "session.deleted") {
        clearSessionAdvice(event.properties.info.id)
      }
    },
    config: async (config) =>
      configureModelContextProtocol(config, configRoot, manifest, client),
    "experimental.chat.system.transform": async (input, output) => {
      const context = await buildSystemContext(
        configRoot,
        contract,
        manifest,
        client,
        input.sessionID,
        directory,
      )
      output.system.push(context)
    },
    "tool.execute.before": async (input, output) => {
      const advice = []
      for (const { plugin, receipt } of await bindingsForTool("before", input)) {
        const result = await runHookReceipt(
          configRoot,
          manifest,
          plugin,
          receipt,
          { tool_input: output.args, tool_name: input.tool },
          directory,
        )
        const parsed = parseHookOutput(result, input.tool)
        if (parsed.advice) advice.push(parsed.advice)
      }
      if (advice.length > 0) {
        pendingAdvice.set(adviceKey(input.sessionID, input.callID), advice)
      }
    },
    "tool.execute.after": async (input, output) => {
      const key = adviceKey(input.sessionID, input.callID)
      const advice = pendingAdvice.get(key) ?? []
      pendingAdvice.delete(key)
      for (const { plugin, receipt } of await bindingsForTool("after", input)) {
        const exitCode =
          output.metadata?.exit_code ??
          output.metadata?.exitCode ??
          output.metadata?.exit ??
          output.metadata?.code
        const result = await runHookReceipt(
          configRoot,
          manifest,
          plugin,
          receipt,
          {
            exit_code: exitCode,
            tool_input: input.args,
            tool_name: input.tool,
            tool_output: {
              ...output.metadata,
              exit_code: exitCode,
              output: output.output,
            },
          },
          directory,
        )
        const parsed = parseHookOutput(result, input.tool)
        if (parsed.advice) advice.push(parsed.advice)
      }
      if (advice.length > 0) {
        output.output = [output.output, "Alvis hook advice:", ...advice].join(
          "\n\n",
        )
      }
    },
  }
}
