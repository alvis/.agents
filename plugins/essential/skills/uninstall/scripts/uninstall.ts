import {
  defaultAgentDestination,
  uninstallAgents,
} from "../../../scripts/installation.ts";
import { InstallationError } from "../../../scripts/installation/transaction.ts";
import type { HarnessName } from "../../../scripts/installation.ts";

const usage =
  "usage: uninstall.sh [--harness {claude,codex,grok}] [--destination DESTINATION]";

/**
 * removes recorded native-harness installation files
 * @param argv command arguments
 * @returns zero on complete removal, one for preserved files, two on failure
 */
export function main(argv = process.argv.slice(2)): number {
  let harness: HarnessName = "claude";
  let destination: string | undefined;
  try {
    for (let index = 0; index < argv.length; index += 1) {
      const argument = argv[index]!;
      if (argument === "--help" || argument === "-h") {
        process.stdout.write(`${usage}\n`);
        return 0;
      }
      const separator = argument.indexOf("=");
      const flag = separator === -1 ? argument : argument.slice(0, separator);
      if (flag !== "--harness" && flag !== "--destination")
        throw new InstallationError(`unrecognized argument: ${argument}`);
      const value =
        separator === -1 ? argv[++index] : argument.slice(separator + 1);
      if (value === undefined || value === "" || value.startsWith("-"))
        throw new InstallationError(`argument ${flag}: expected one argument`);
      if (flag === "--harness") {
        if (value !== "claude" && value !== "codex" && value !== "grok")
          throw new InstallationError(`invalid harness: ${value}`);
        harness = value;
      } else destination = value;
    }
    const result = uninstallAgents(
      destination ?? defaultAgentDestination(harness),
      { harness },
    );
    return result.preserved > 0 ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${usage}\nuninstall: ${(error as Error).message}\n`);
    return 2;
  }
}

if (import.meta.main) process.exit(main());
