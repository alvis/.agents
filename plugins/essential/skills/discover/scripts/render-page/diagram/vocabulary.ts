import type { EdgeKind, NodeRole } from "./shape.ts";

/** every role, in the order the legend lists them. */
export const NODE_ROLES = [
  "client",
  "edge",
  "domain",
  "engine",
  "source",
  "derived",
  "ephemeral",
] as const;

/** every edge kind, in the order the legend lists them. */
export const EDGE_KINDS = ["flow", "fanout", "derive"] as const;

/**
 * the tag drawn inside each node.
 *
 * This mapping is injective, which is what makes the role recoverable under
 * `filter: grayscale(1)` without reading any other channel.
 */
export const ROLE_TAG: Record<NodeRole, string> = {
  client: "CLIENT",
  edge: "EDGE",
  domain: "DOMAIN",
  engine: "ENGINE",
  source: "SOURCE",
  derived: "DERIVED",
  ephemeral: "EPHEMERAL",
};

/** what each role means, for the legend and the text list. */
export const ROLE_NOTE: Record<NodeRole, string> = {
  client: "outside the service boundary",
  edge: "stateless boundary",
  domain: "owns business logic",
  engine: "load-bearing computation",
  source: "durable source of truth",
  derived: "rebuildable cache",
  ephemeral: "no durability guarantee",
};

/** what each edge kind means, used whenever an edge declares no label. */
export const KIND_NOTE: Record<EdgeKind, string> = {
  flow: "direct path",
  fanout: "fan-out",
  derive: "derived state",
};

