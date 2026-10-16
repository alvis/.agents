import { RenderError } from "../error.ts";
import { requireString } from "../validate.ts";
import { MAX_LINES, MAX_STEP, WRAP_LIMIT } from "./geometry.ts";
import { DIAGRAM_FLOWS, EDGE_KINDS, NODE_ROLES } from "./vocabulary.ts";

import type {
  DiagramBlock,
  DiagramEdge,
  DiagramFlow,
  DiagramNode,
  PlacedNode,
  ResolvedEdge,
} from "./shape.ts";

/**
 * reads a layer band, refusing anything that is not a non-negative integer
 * @param value the author-supplied layer
 * @param path JSON path of the value, used verbatim in the refusal
 * @returns the layer as a number
 */
function requireLayer(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
    throw new RenderError(
      `${path}: required non-negative integer, received ${JSON.stringify(value)}`,
    );
  return value;
}

/**
 * reads a value that must be one of a fixed set of tokens
 * @param value the author-supplied token, or `undefined` for the fallback
 * @param allowed every accepted token, in the order the refusal lists them
 * @param fallback the token used when the author supplied none
 * @param path JSON path of the value, used verbatim in the refusal
 * @returns the matched token
 */
function requireToken<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  path: string,
): T {
  if (value === undefined) return fallback;
  const matched = allowed.find((option) => option === value);
  if (matched === undefined)
    throw new RenderError(
      `${path}: required one of ${allowed.map((option) => JSON.stringify(option)).join(", ")}, received ${JSON.stringify(value)}`,
    );
  return matched;
}

/**
 * reads an array, refusing a value of any other shape
 * @param value the author-supplied collection
 * @param path JSON path of the value, used verbatim in the refusal
 * @returns the same value, typed as an array of unknown members
 */
function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new RenderError(
      `${path}: required non-empty array, received ${JSON.stringify(value)}`,
    );
  return value;
}

/**
 * reads the three optional marks a node may carry, each by its own path
 * @param node the author-supplied node
 * @param at JSON path of the node, used as the prefix of every refusal
 * @param read the nodes already read, which no step number may repeat
 * @returns only the marks the author wrote, so an unmarked node gains no key
 */
function readMarks(
  node: DiagramNode,
  at: string,
  read: PlacedNode[],
): Pick<DiagramNode, "emphasis" | "step" | "tie"> {
  if (node.emphasis !== undefined && typeof node.emphasis !== "boolean")
    throw new RenderError(
      `${at}.emphasis: required true or false, received ${JSON.stringify(node.emphasis)}`,
    );
  const step = node.step;
  if (
    step !== undefined &&
    (typeof step !== "number" ||
      !Number.isInteger(step) ||
      step < 1 ||
      step > MAX_STEP)
  )
    throw new RenderError(
      `${at}.step: required an integer from 1 to ${MAX_STEP}, received ${JSON.stringify(step)}`,
    );
  // two boxes numbered alike would send a reader along a path that forks
  // where the author meant one line
  if (step !== undefined && read.some((seen) => seen.step === step))
    throw new RenderError(
      `${at}.step: required a step number used once, received ${step} for a second time`,
    );

  return {
    ...(node.emphasis === undefined ? {} : { emphasis: node.emphasis }),
    ...(step === undefined ? {} : { step }),
    ...(node.tie === undefined
      ? {}
      : { tie: requireString(node.tie, `${at}.tie`) }),
  };
}

/**
 * breaks a label into the lines drawn inside a node box
 * @param label the node's full label
 * @returns up to `MAX_LINES` lines, the last absorbing any remainder
 */
function wrapLabel(label: string): string[] {
  const lines = label
    .split(/\s+/)
    .filter(Boolean)
    .reduce<string[]>((wrapped, word) => {
      const last = wrapped.at(-1);
      if (last === undefined || `${last} ${word}`.length > WRAP_LIMIT)
        return [...wrapped, word];
      return [...wrapped.slice(0, -1), `${last} ${word}`];
    }, []);
  if (lines.length <= MAX_LINES) return lines;
  return [
    ...lines.slice(0, MAX_LINES - 1),
    lines.slice(MAX_LINES - 1).join(" "),
  ];
}

/**
 * validates every declared node and wraps its label
 * @param nodes the author-supplied node list
 * @param path JSON path of the block, used as the prefix of every refusal
 * @returns each node with its role resolved and its label wrapped, unplaced
 */
export function readNodes(nodes: unknown, path: string): PlacedNode[] {
  return requireArray(nodes, `${path}.nodes`).reduce<PlacedNode[]>(
    (read, entry, index) => {
      const at = `${path}.nodes[${index}]`;
      const node = entry as DiagramNode;
      const id = requireString(node.id, `${at}.id`);
      if (read.some((seen) => seen.id === id))
        throw new RenderError(
          `${at}.id: required a node id declared once, received ${JSON.stringify(id)} for a second time`,
        );
      const label = requireString(node.label, `${at}.label`);
      return [
        ...read,
        {
          id,
          label,
          layer: requireLayer(node.layer, `${at}.layer`),
          role: requireToken(node.role, NODE_ROLES, "domain", `${at}.role`),
          // every declared field is read explicitly, so an unusable `note`
          // refuses by path instead of being spread through unchecked and
          // then silently dropped by the truthiness tests that read it
          ...(node.note === undefined
            ? {}
            : { note: requireString(node.note, `${at}.note`) }),
          // carried rather than validated here: the figure renders the detail
          // through the inline reader, which refuses an unusable one by this
          // same path. What it may not do is arrive without it — the drawing
          // decides which box is choosable by reading this field, so a node
          // that loses it here draws a box no reader can open beside an aside
          // inviting them to open one
          ...(node.detail === undefined ? {} : { detail: node.detail }),
          ...readMarks(node, at, read),
          lines: wrapLabel(label),
          x: 0,
          y: 0,
        },
      ];
    },
    [],
  );
}

/**
 * reads the direction a diagram flows and, for an across flow, its row length
 * @param block the author-supplied diagram
 * @param path JSON path of the block, used as the prefix of every refusal
 * @returns the flow, with the row length only when the author wrote one
 */
export function readFlow(
  block: DiagramBlock,
  path: string,
): Pick<DiagramBlock, "wrap"> & { flow: DiagramFlow } {
  const flow = requireToken(block.flow, DIAGRAM_FLOWS, "down", `${path}.flow`);
  const wrap = block.wrap;
  if (wrap === undefined) return { flow };
  // a down flow already draws one layer per row, so it has nothing to wrap
  if (flow === "down")
    throw new RenderError(
      `${path}.wrap: required only with "flow": "across", received ${JSON.stringify(wrap)} with a down flow`,
    );
  // a one-layer row is a down flow drawn with a turn where each arrow should be
  if (typeof wrap !== "number" || !Number.isInteger(wrap) || wrap < 2)
    throw new RenderError(
      `${path}.wrap: required an integer of at least 2, received ${JSON.stringify(wrap)}`,
    );

  return { flow, wrap };
}

/**
 * resolves both ends of every declared edge against the declared nodes
 * @param edges the author-supplied edge list
 * @param nodes every node already validated by `readNodes`
 * @param path JSON path of the block, used as the prefix of every refusal
 * @returns each edge with its ends and kind resolved, unrouted
 */
export function readEdges(
  edges: unknown,
  nodes: PlacedNode[],
  path: string,
): ResolvedEdge[] {
  return requireArray(edges, `${path}.edges`).map((entry, index) => {
    const at = `${path}.edges[${index}]`;
    const edge = entry as DiagramEdge;
    const ends = (["from", "to"] as const).map((end) => {
      const id = requireString(edge[end], `${at}.${end}`);
      const node = nodes.find((candidate) => candidate.id === id);
      if (!node)
        throw new RenderError(
          `${at}.${end}: required the id of a declared node, received ${JSON.stringify(id)} which no node declares`,
        );
      return node;
    });
    const [from, to] = ends;
    if (from.id === to.id)
      throw new RenderError(
        `${at}: required two different nodes, received ${JSON.stringify(from.id)} at both ends`,
      );
    // the router draws adjacent layers and long-range layers, and nothing
    // else; an edge inside one layer has no supported shape, so it is refused
    // rather than drawn wrongly
    if (from.layer === to.layer)
      throw new RenderError(
        `${at}: required two nodes in different layers, received ${JSON.stringify(from.id)} and ${JSON.stringify(to.id)} both in layer ${from.layer}`,
      );
    return {
      from,
      to,
      kind: requireToken(edge.kind, EDGE_KINDS, "flow", `${at}.kind`),
      ...(edge.label === undefined
        ? {}
        : { label: requireString(edge.label, `${at}.label`) }),
    };
  });
}

