import type { Tree } from "./read.ts";

/** what the caller knows about where this session is working. */
export interface ScopeParams {
  /** the stream named on the command line, which wins outright */
  stream?: string;
  /** this session's id, matched against the holder each lease records */
  session?: string;
}

/** which board to draw, and the sentence saying how that was decided. */
export interface Scope {
  /** the stream whose tasks are drawn, empty where every stream is */
  stream: string;
  /** how the choice was made, printed on the board */
  reason: string;
}

/**
 * decides whether the board is about one stream or all of them.
 *
 * a stream named on the command line wins, and one that is not live is
 * refused rather than quietly swapped for every stream, because the reader
 * asked about that stream. Otherwise the one live lease naming this session
 * picks the stream: that lease is what starting or resuming a stream leaves
 * behind. Two such leases break the one-stream rule, and a lease that could
 * not be read might be a second one, so in either case picking a stream could
 * hide another; the board shows every stream and says why.
 * @param tree everything the tree had to say
 * @param params what the caller knows about where this session is working
 * @param now when the board is being built, which leases are measured against
 * @returns the scope, or a sentence saying why the named stream cannot be drawn
 */
export function scopeOf(tree: Tree, params: ScopeParams, now: Date): Scope | string {
  const live = tree.streams.map((stream) => stream.id);
  if (params.stream)
    return live.includes(params.stream)
      ? { stream: params.stream, reason: "This stream was named when the board was asked for." }
      : `no live stream is called ${params.stream}; the live streams are ${live.join(", ") || "none"}`;
  if (!params.session)
    return { stream: "", reason: "No session was given to look for, so every live stream is shown." };
  if (tree.leaseProblems.length)
    return {
      stream: "",
      reason: `The lease on ${tree.leaseProblems.map((problem) => problem.id).join(", ")} could not be read, so whether this session holds it is unknown and every live stream is shown.`,
    };

  const held = tree.leases.filter(
    (lease) => lease.session === params.session && lease.expiresAtSeconds * 1000 > now.getTime(),
  );
  if (held.length === 1)
    return {
      stream: held[0]!.stream,
      reason: "This session holds this stream's lease, so the board is about the stream it is working in.",
    };

  return {
    stream: "",
    reason: held.length
      ? `This session holds leases on ${held.map((lease) => lease.stream).join(", ")}, and choosing one would hide the others, so every live stream is shown.`
      : "This session holds no live stream's lease, so every live stream is shown.",
  };
}
