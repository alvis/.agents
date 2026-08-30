import type { ProbeOrder } from "./probe.ts";
import type { AnswerLine } from "./reply.ts";

/**
 * where an answer stands against what the page recommended.
 *
 * this is the distinction the legacy page made and the renderer lost: a reply
 * that lists every answer flat cannot tell its reader whether a suggestion was
 * agreed with, argued with, or never looked at, and those three are the whole
 * reason a decision board is sent out.
 */
export type Disposition =
  | "confirmed"
  | "changed"
  | "answered"
  | "suggested"
  | "unanswered";

/**
 * decides how an answer stands against the page's recommendation
 * @param line one question's label, answer, and what the page recommended
 * @returns the answer's disposition
 */
export function dispositionOf(line: AnswerLine): Disposition {
  // an untouched question is unresolved however the controls happen to sit: a
  // restored page and a page the reader has never scrolled to look identical
  if (!line.touched || !line.value)
    return line.recommended.length ? "suggested" : "unanswered";

  if (!line.recommended.length) return "answered";

  return line.recommended.includes(line.value) ? "confirmed" : "changed";
}

/** the heading each disposition is collected under, in the order they print. */
const DECISION_GROUPS: [Disposition, string][] = [
  ["changed", "Changed"],
  ["confirmed", "Confirmed"],
  ["answered", "Answered"],
  ["suggested", "Not yet marked"],
  ["unanswered", "Not yet marked"],
];

/** the heading each disposition is collected under for a follow-up. */
const FOLLOW_UP_GROUPS: [Disposition, string][] = [
  ["changed", "Requested"],
  ["confirmed", "Requested"],
  ["answered", "Requested"],
  ["suggested", "Not yet requested"],
  ["unanswered", "Not yet requested"],
];

/**
 * writes one answered question's line
 * @param line the question
 * @param disposition where its answer stands
 * @returns the line, with the recommendation it went against where it went
 *   against one
 */
function answered(line: AnswerLine, disposition: Disposition): string {
  const against =
    disposition === "changed"
      ? ` _(recommended: ${line.recommended.join(", ")})_`
      : "";

  return `- **${line.label}:** ${line.value}${against}`;
}

/**
 * writes one unresolved question's line
 * @param line the question
 * @returns the line, naming the suggestion nobody has agreed to yet
 */
function unresolved(line: AnswerLine): string {
  const suggestion = line.recommended.length
    ? `recommended ${line.recommended.join(", ")}; not yet confirmed`
    : "unanswered";

  return `- **${line.label}:** ${suggestion}`;
}

/**
 * groups a set of questions under their disposition headings
 * @param lines the questions in this section, in reading order
 * @param groups the heading each disposition prints under
 * @param empty what to print when the section holds nothing
 * @returns the section's body
 */
function group(
  lines: AnswerLine[],
  groups: [Disposition, string][],
  empty: string,
): string {
  const marked = lines.map(
    (line) => [line, dispositionOf(line)] as [AnswerLine, Disposition],
  );
  const out: string[] = [];

  for (const heading of [...new Set(groups.map(([, name]) => name))]) {
    const wanted = new Set(
      groups.filter(([, name]) => name === heading).map(([which]) => which),
    );
    const held = marked.filter(([, disposition]) => wanted.has(disposition));
    if (!held.length) continue;

    out.push(
      `### ${heading}`,
      ...held.map(([line, disposition]) =>
        disposition === "suggested" || disposition === "unanswered"
          ? unresolved(line)
          : answered(line, disposition),
      ),
      "",
    );
  }

  return out.length ? out.join("\n").trimEnd() : empty;
}

/**
 * renders the answers block, grouped by where each answer stands.
 *
 * a section is omitted entirely when the page asks nothing of that kind, so a
 * board with no follow-ups never sends a reply promising follow-ups; a section
 * the page does ask for is always present, because an absent heading and an
 * empty one say different things to whoever reads the reply.
 * @param lines every question's label, answer, and recommendation
 * @param probes where every ordering probe stands
 * @returns the block, or a plain marker when the page asks nothing at all
 */
export function formatAnswers(
  lines: AnswerLine[],
  probes: ProbeOrder[] = [],
): string {
  const decisions = lines.filter(({ response }) => response !== "follow-up");
  const followUps = lines.filter(({ response }) => response === "follow-up");
  const out: string[] = [];

  if (decisions.length)
    out.push(
      "## Decisions",
      "",
      group(decisions, DECISION_GROUPS, "- No decision has been marked yet."),
    );

  if (followUps.length)
    out.push(
      ...(out.length ? [""] : []),
      "## Follow-ups",
      "",
      group(followUps, FOLLOW_UP_GROUPS, "- No follow-up has been requested yet."),
    );

  // only the orderings the reader changed: a list left exactly as the page drew
  // it is the page's own proposal read back, not a ranking anybody made
  const moved = probes.filter(({ moved: changed }) => changed);
  if (moved.length)
    out.push(
      ...(out.length ? [""] : []),
      "## Orderings",
      "",
      ...moved.map(({ label, order }) => `- **${label}:** ${order.join(" → ")}`),
    );

  return out.length ? out.join("\n") : "(no questions)";
}

/**
 * counts each disposition among a set of questions
 * @param lines the questions to count
 * @returns how many fell into each disposition
 */
function tally(lines: AnswerLine[]): Record<Disposition, number> {
  const counts: Record<Disposition, number> = {
    confirmed: 0,
    changed: 0,
    answered: 0,
    suggested: 0,
    unanswered: 0,
  };
  for (const line of lines) counts[dispositionOf(line)] += 1;

  return counts;
}

/**
 * writes a count with its noun, pluralised
 * @param count how many
 * @param noun the singular noun
 * @returns the phrase, such as `1 note` or `4 notes`
 */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * writes one paragraph saying where the reply stands.
 *
 * the reply is long by the time a reader has worked through a board, and its
 * recipient reads the first paragraph whatever else they skip. This is the
 * sentence that tells them, before any list, whether anything was decided.
 * @param lines every question's label, answer, and recommendation
 * @param notes how many notes the reader left
 * @param reordered how many orderings the reader changed
 * @returns the paragraph
 */
export function summarise(
  lines: AnswerLine[],
  notes: number,
  reordered = 0,
): string {
  // a reply that opens by listing nothing is worse than one that opens by
  // saying plainly that nothing has been decided; the body below still lists
  // every unmarked question, so the counts are not lost by saying so
  const settled = lines.some(
    (line) => !["suggested", "unanswered"].includes(dispositionOf(line)),
  );
  if (!settled && !notes && !reordered)
    return "Nothing on this board has been answered or noted yet.";

  const decisions = lines.filter(({ response }) => response !== "follow-up");
  const followUps = lines.filter(({ response }) => response === "follow-up");
  const counts = tally(decisions);
  const said: string[] = [];

  if (decisions.length) {
    const parts = [
      counts.confirmed && `${counts.confirmed} confirmed`,
      counts.changed && `${counts.changed} changed`,
      counts.answered && `${counts.answered} answered`,
      counts.suggested + counts.unanswered &&
        `${counts.suggested + counts.unanswered} still unmarked`,
    ].filter(Boolean);
    said.push(`${plural(decisions.length, "decision")} — ${parts.join(", ")}`);
  }

  if (followUps.length) {
    const open = tally(followUps);
    const waiting = open.suggested + open.unanswered;
    said.push(
      `${plural(followUps.length, "follow-up")}, ${followUps.length - waiting} requested`,
    );
  }

  said.push(notes ? plural(notes, "note") : "no notes");
  if (reordered) said.push(`${plural(reordered, "ordering")} changed`);

  return `This reply carries ${said.slice(0, -1).join("; ")}${said.length > 1 ? "; and " : ""}${said.at(-1)}.`;
}
