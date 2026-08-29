import type { Block, Section } from "../types.ts";
import type { Tree } from "./read.ts";

/**
 * draws how the board read the tree it was built from.
 *
 * this section is the board's own provenance, and it is here because the tree
 * is not written to one shape: the phase is spelled two ways, a table row can
 * be malformed, and a stream can be set aside. Every one of those is a fact
 * about the record rather than about the work, and a board that quietly
 * normalised them would be a board nobody could use to go and fix the record.
 * @param tree everything the tree had to say
 * @returns the section
 */
export function readingSection(tree: Tree): Section {
  const malformed = tree.streams.reduce(
    (total, stream) => total + stream.malformed,
    0,
  );
  const blocks: Block[] = [
    {
      type: "table",
      columns: ["Stream", "Phase key used", "Phase", "Updated", "Tasks"],
      rows: tree.streams.map((stream) => ({
        cells: [
          { text: [{ kind: "code" as const, text: stream.id }] },
          stream.phaseKey
            ? { text: [{ kind: "code" as const, text: stream.phaseKey }] }
            : { text: "none found", verdict: "bad" as const },
          { text: stream.phase || "unrecorded" },
          { text: stream.updated || "unrecorded" },
          { text: `${stream.tasks.length}` },
        ],
      })),
    },
  ];
  const spellings = [
    ...new Set(tree.streams.map((stream) => stream.phaseKey).filter(Boolean)),
  ].sort();
  if (spellings.length > 1)
    blocks.push({
      type: "callout",
      tone: "neutral",
      title: "The phase is spelled more than one way",
      lead: `${spellings.length} keys`,
      text: `${spellings
        .map(
          (key) =>
            `${key}: ${tree.streams
              .filter((stream) => stream.phaseKey === key)
              .map((stream) => stream.id)
              .join(", ")}`,
        )
        .join(". ")}. Every spelling is read, so this is a note about the record rather than a gap in the board: a board that refused to open because one stream used a different key would be useless exactly when it is needed.`,
    });
  if (malformed)
    blocks.push({
      type: "callout",
      tone: "bad",
      title: "Some table rows could not be read",
      lead: `${malformed} row${malformed === 1 ? "" : "s"}`,
      text: "A row of the wrong width is counted here rather than guessed at, because a nine-column table read as eight shifts every owner one column left. Those rows are absent from everything above.",
    });
  if (tree.excluded.length)
    blocks.push({
      type: "callout",
      tone: "neutral",
      title: "Streams this board set aside",
      lead: `${tree.excluded.length} excluded`,
      text: tree.excluded
        .map((stream) => `${stream.id}: ${stream.reason}`)
        .join(". "),
    });

  return {
    id: "reading",
    label: "Reading",
    eyebrow: "Provenance",
    title: "How this board read the record",
    blocks,
  };
}
