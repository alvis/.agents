import { HelpRequest, WrapperError } from "./route.ts";

/** the flags one REST-routed subcommand accepts, in `gh`'s spelling */
export interface FlagSpec {
  /** long flags that take a value, such as `title` for `--title` */
  readonly values?: readonly string[];
  /** long flags that take no value */
  readonly booleans?: readonly string[];
  /** short aliases, such as `t` → `title` */
  readonly aliases?: Readonly<Record<string, string>>;
}

/** the parsed arguments of one subcommand */
export interface ParsedArgs {
  readonly positionals: string[];
  readonly values: Map<string, string[]>;
  readonly booleans: Set<string>;
}

/** flags every REST-routed subcommand accepts */
const COMMON: Required<FlagSpec> = {
  values: ["repo"],
  booleans: [],
  aliases: { R: "repo" },
};

/** the `--json`/`--jq` pair, for the subcommands that print a field projection */
export const JSON_FLAGS = {
  values: ["json", "jq"],
  aliases: { q: "jq" },
} as const satisfies FlagSpec;

/**
 * parses `gh`-style arguments. unknown flags are refused by name rather than
 * ignored, so a caller never believes a flag took effect when the REST route
 * cannot honor it; `--help` or `-h` lists the flags this route accepts
 * @param argv - the arguments after the subcommand
 * @param spec - the subcommand's own flags
 * @returns positionals, repeatable values, and boolean flags
 */
export function parseArgs(argv: readonly string[], spec: FlagSpec): ParsedArgs {
  const valueFlags = new Set([...COMMON.values, ...(spec.values ?? [])]);
  const booleanFlags = new Set(spec.booleans ?? []);
  const aliases = { ...COMMON.aliases, ...spec.aliases };
  const positionals: string[] = [];
  const values = new Map<string, string[]>();
  const booleans = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (!argument.startsWith("-") || argument === "-") {
      positionals.push(argument);
      continue;
    }
    if (argument === "--help" || argument === "-h") throw new HelpRequest(usageLines(valueFlags, booleanFlags, aliases));
    const long = argument.startsWith("--");
    const [rawName, inline] = argument.slice(long ? 2 : 1).split(/=(.*)/su, 2) as [
      string,
      string | undefined,
    ];
    const name = long ? rawName : aliases[rawName];
    if (name === undefined || (!valueFlags.has(name) && !booleanFlags.has(name)))
      throw new WrapperError(
        `flag ${argument.split("=")[0]} is not supported when this command is routed through REST`,
      );
    if (booleanFlags.has(name)) {
      if (inline === undefined || inline === "true") booleans.add(name);
      else if (inline !== "false")
        throw new WrapperError(`flag --${name} takes no value other than true or false`);
      continue;
    }
    const value = inline ?? argv[++index];
    if (value === undefined) throw new WrapperError(`flag --${name} needs a value`);
    values.set(name, [...(values.get(name) ?? []), value]);
  }
  return { positionals, values, booleans };
}

/**
 * reads the last value of a flag
 * @param parsed - parsed arguments
 * @param name - long flag name
 * @returns the value, or undefined
 */
export function value(parsed: ParsedArgs, name: string): string | undefined {
  return parsed.values.get(name)?.at(-1);
}

/**
 * lists the accepted flags, one per line, in `gh`'s `-s, --long <value>` shape
 * @param valueFlags - long flags that take a value
 * @param booleanFlags - long flags that take no value
 * @param aliases - short aliases by letter
 * @returns the flag lines, sorted by long name
 */
function usageLines(
  valueFlags: ReadonlySet<string>,
  booleanFlags: ReadonlySet<string>,
  aliases: Readonly<Record<string, string>>,
): string[] {
  const shortFor = new Map(Object.entries(aliases).map(([short, long]) => [long, short]));
  return [...valueFlags, ...booleanFlags].sort().map((name) => {
    const short = shortFor.get(name);
    return `  ${short ? `-${short}, ` : "    "}--${name}${valueFlags.has(name) ? " <value>" : ""}`;
  });
}
