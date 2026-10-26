/**
 * shell parsing and decision output shared by the coding plugin's PreToolUse
 * guards over `gh` commands; kept free of runtime-specific imports so each
 * guard loads only what it needs
 */

/** a guard decision on one shell command; `ignore` marks a command the guard does not govern */
export interface GuardDecision {
  readonly decision: "allow" | "deny" | "ignore";
  readonly reason: string;
}

/**
 * strips the env, command, rtk, and one literal shell -c wrappers from a parsed command
 * @param input words of one simple command
 * @returns the words of the command those wrappers run, or ["command-query"] for command -v
 */
export function unwrapCommand(input: readonly string[]): readonly string[] {
  let words = [...input];
  let changed = true;
  while (changed) {
    changed = false;
    if (words[0] === "env") {
      let index = 1;
      while (index < words.length) {
        const word = words[index]!;
        if (word === "--") {
          index += 1;
          break;
        }
        if (
          word === "-u" ||
          word === "--unset" ||
          word === "-C" ||
          word === "--chdir"
        ) {
          if (words[index + 1] === undefined)
            throw new Error("incomplete env wrapper");
          index += 2;
          continue;
        }
        if (
          word === "-S" ||
          word === "--split-string" ||
          word.startsWith("--split-string=")
        ) {
          throw new Error("env split-string wrapper is unsupported");
        }
        if (
          word.includes("=") ||
          word === "-i" ||
          word === "--ignore-environment" ||
          word.startsWith("--unset=") ||
          word.startsWith("--chdir=")
        ) {
          index += 1;
          continue;
        }
        break;
      }
      words = words.slice(index);
      changed = true;
    }
    if (words[0] === "command") {
      if (words[1] === "-v" || words[1] === "-V") return ["command-query"];
      let index = 1;
      while (words[index] === "-p" || words[index] === "--") index += 1;
      words = words.slice(index);
      changed = true;
    }
    if (words[0] === "rtk") {
      words = words[1] === "proxy" ? words.slice(2) : words.slice(1);
      changed = true;
    }
    if (["bash", "sh", "zsh"].includes(words[0] ?? "") && words[1] === "-c") {
      if (words.length !== 3) throw new Error("ambiguous shell wrapper");
      words = [...parseShellWords(words[2]!)];
      changed = true;
    }
  }
  return words;
}

/**
 * splits one simple command into words under shell quoting and escaping
 * @param command one simple command, without operators or newlines
 * @returns the words, unquoted
 */
export function parseShellWords(command: string): readonly string[] {
  const words: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (const character of command) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "\n" || character === "\r") {
      throw new Error("compound shell command");
    }
    if (/\s/.test(character)) {
      if (current !== "") {
        words.push(current);
        current = "";
      }
      continue;
    }
    if ([";", "|", "&"].includes(character)) {
      throw new Error("compound shell command");
    }
    current += character;
  }
  if (escaped || quote !== null) throw new Error("unterminated shell token");
  if (current !== "") words.push(current);
  return words;
}

/** the `&1` or `&-` tail of a `>&1`-style descriptor duplication, which writes no file */
const DESCRIPTOR_DUPLICATION = /^&(?:[0-9]+|-)(?![^\s;|&<>()])/;

/** the `/dev/null` target of a discarding redirection, which writes no file */
const DISCARD_TARGET = /^>?\s*\/dev\/null(?![^\s;|&<>()])/;

/** one simple command of a compound shell command */
export interface ShellSegment {
  readonly text: string;
  /** whether the segment reads the previous segment's output through a pipe */
  readonly piped: boolean;
  /** whether the segment writes output to a file */
  readonly redirectsOutput: boolean;
}

/**
 * splits a command on unquoted `;`, `&`, `|`, `|&`, `&&`, `||` and newlines, dropping
 * `2>&1`-style descriptor duplications and flagging redirections to anything but `/dev/null`; rejects comments, heredocs, subshells, function definitions, process substitution
 * and ANSI-C quoting, whose quote and word rules this splitter does not model
 * @param command shell command without command substitutions
 * @returns the segments in order
 */
export function splitShellSegments(command: string): readonly ShellSegment[] {
  const segments: ShellSegment[] = [];
  let current = "";
  let piped = false;
  let redirectsOutput = false;
  let quote: "'" | '"' | null = null;
  let escaped = false;
  const flush = (nextPiped: boolean): void => {
    segments.push({ text: current, piped, redirectsOutput });
    current = "";
    piped = nextPiped;
    redirectsOutput = false;
  };
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]!;
    if (escaped || quote !== null) {
      if (!escaped && character === quote) quote = null;
      escaped = !escaped && character === "\\" && quote !== "'";
      current += character;
      continue;
    }
    const previous = command[index - 1];
    const next = command[index + 1];
    if (character === "\\") escaped = true;
    if (character === "'" || character === '"') {
      if (previous === "$") throw new Error("ANSI-C or locale quoting is unsupported");
      quote = character;
    }
    if ((character === "<" || character === ">") && next === "(") throw new Error("process substitution is unsupported");
    if (character === "(" || character === ")") throw new Error("subshells and function definitions are unsupported");
    if (character === "<" && next === "<") throw new Error("heredocs and here-strings are unsupported");
    if (character === "#" && (previous === undefined || /[\s;|&()<>]/.test(previous))) throw new Error("comments are unsupported");
    if (character === "&" && next === ">") {
      redirectsOutput = true;
      continue;
    }
    if (character === "&" && (previous === ">" || previous === "<")) {
      if (DESCRIPTOR_DUPLICATION.test(command.slice(index))) {
        current = current.replace(/[0-9]*[<>]$/, "");
        while (/[0-9-]/.test(command[index + 1] ?? "")) index += 1;
      }
      continue;
    }
    if (character === ">") {
      const target = command.slice(index + 1);
      if (!DESCRIPTOR_DUPLICATION.test(target) && !DISCARD_TARGET.test(target)) redirectsOutput = true;
      if (next === "|") index += 1;
    }
    if (character === "|" && next !== "|") {
      if (next === "&") index += 1;
      flush(true);
      continue;
    }
    if (character === "\n" || character === "\r" || character === ";" || character === "|" || character === "&") {
      if (next === character) index += 1;
      flush(false);
      continue;
    }
    current += character;
  }
  if (escaped || quote !== null) throw new Error("unterminated shell token");
  flush(false);
  return segments;
}

/**
 * renders a PreToolUse decision in the envelope the running harness reads
 * @param decision allow or deny, with the reason shown to the agent
 * @returns one line of hook output
 */
export function hookEnvelope(decision: GuardDecision): string {
  const isGrok =
    Boolean(process.env.GROK_PLUGIN_ROOT) && !process.env.PLUGIN_ROOT;
  if (isGrok) {
    return `${JSON.stringify({ decision: decision.decision === "deny" ? "deny" : "allow", reason: decision.reason })}\n`;
  }
  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision.decision === "deny" ? "deny" : "allow",
      permissionDecisionReason: decision.reason,
    },
  })}\n`;
}
