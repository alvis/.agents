import { statSync } from "node:fs";
import { basename, join } from "node:path";

/** payload paths every context-owning plugin may inject at session start */
export const INJECTED_PAYLOADS = [
  "hooks/ALLAGENT.md",
  "hooks/MAINAGENT.md",
  "hooks/SUBAGENT.md",
] as const;
/** byte ceiling applied to each individually injected payload */
export const PAYLOAD_BUDGET_BYTES = 2_000;
/** byte ceiling applied to a plugin's whole unconditional hook read chain */
export const CHAIN_BUDGET_BYTES = 40_960;

function getFileSize(path: string): number | undefined {
  try {
    const status = statSync(path);
    return status.isFile() ? status.size : undefined;
  } catch {
    return undefined;
  }
}

/**
 * validates one plugin's declared payload sizes against the shared budgets.
 * @param pluginRoot directory of the plugin under review
 * @param payloads payload paths the plugin declares as injected
 * @param chain unconditional read chain paths declared beside the budgets
 * @returns human-readable violations, empty when the plugin complies
 * @throws when a declaration arrives as a bare string instead of a sequence
 */
export function checkPlugin(
  pluginRoot: string,
  payloads: Iterable<string>,
  chain: Iterable<string>,
): string[] {
  if (typeof payloads === "string") {
    throw new TypeError("payloads must be a sequence of file names, not a str");
  }
  if (typeof chain === "string") {
    throw new TypeError("chain must be a sequence of file names, not a str");
  }

  const declaredPayloads = [...payloads];
  const violations: string[] = [];
  const pluginName = basename(pluginRoot);
  for (const relative of declaredPayloads) {
    const sizeBytes = getFileSize(join(pluginRoot, relative));
    if (sizeBytes === undefined) {
      violations.push(
        `${pluginName}/${relative} is declared as an injected payload but does not exist; update the declaration or restore the file.`,
      );
    } else if (sizeBytes > PAYLOAD_BUDGET_BYTES) {
      violations.push(
        `${pluginName}/${relative} is ${sizeBytes} bytes; budget is ${PAYLOAD_BUDGET_BYTES}. Every session pays this file, so move detail into a reference instead of growing it.`,
      );
    }
  }

  for (const relative of INJECTED_PAYLOADS) {
    if (
      !declaredPayloads.includes(relative) &&
      getFileSize(join(pluginRoot, relative)) !== undefined
    ) {
      violations.push(
        `${pluginName}/${relative} is injected at runtime but is not declared here, so its budget is never checked; add it to the declaration.`,
      );
    }
  }

  const sizesByRelative = new Map<string, number>();
  for (const relative of chain) {
    const sizeBytes = getFileSize(join(pluginRoot, relative));
    if (sizeBytes === undefined) {
      violations.push(
        `${pluginName}/${relative} is named in the mandatory chain but does not exist; update the declaration or restore the file.`,
      );
    } else {
      sizesByRelative.set(relative, sizeBytes);
    }
  }
  const totalBytes = [...sizesByRelative.values()].reduce(
    (total, sizeBytes) => total + sizeBytes,
    0,
  );
  if (totalBytes > CHAIN_BUDGET_BYTES) {
    const breakdown = [...sizesByRelative]
      .map(([name, sizeBytes]) => `${name}=${sizeBytes}`)
      .join(", ");
    violations.push(
      `${pluginName} unconditional read chain is ${totalBytes} bytes (${breakdown}); budget is ${CHAIN_BUDGET_BYTES}. Move detail into a per-moment reference instead of growing an always-read file.`,
    );
  }
  return violations;
}
