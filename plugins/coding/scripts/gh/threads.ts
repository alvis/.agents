/**
 * reads pull-request review threads on either route. GitHub exposes thread
 * membership and resolution only through GraphQL; Claude Code cloud sessions,
 * which block GraphQL, serve the same data from the proxy's
 * `pulls/{n}/ccr/review_threads` route. both are normalized to that route's
 * shape, keyed by comment IDs so one identifier works on either route.
 */

import type { Route } from "./detect.ts";

/** one review thread, in the cloud route's shape */
export interface ReviewThread {
  /** the thread's comment IDs, root first */
  readonly comment_ids: number[];
  readonly resolved: boolean;
  readonly outdated: boolean;
  readonly path: string;
  readonly line: number | null;
  /** the GraphQL node ID, present on the native route only */
  readonly node_id?: string;
}

/** the pull request whose threads are read */
export interface ThreadTarget {
  readonly host: string;
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
}

/** runs `gh` with the given arguments and returns its parsed JSON stdout */
export type GhJson = (arguments_: readonly string[]) => unknown;

const THREAD_QUERY =
  "query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$cursor){pageInfo{hasNextPage endCursor} nodes{id isResolved isOutdated path line comments(first:100){pageInfo{hasNextPage endCursor} nodes{databaseId}}}}}}}";
const COMMENT_QUERY =
  "query($id:ID!,$cursor:String){node(id:$id){... on PullRequestReviewThread{comments(first:100,after:$cursor){pageInfo{hasNextPage endCursor} nodes{databaseId}}}}}";

interface Page<T> {
  readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null };
  readonly nodes: T[];
}

interface ThreadNode {
  readonly id: string;
  readonly isResolved: boolean;
  readonly isOutdated: boolean;
  readonly path: string;
  readonly line: number | null;
  readonly comments: Page<{ readonly databaseId: number }>;
}

/**
 * lists every review thread of a pull request, following every page
 * @param gh - runs `gh` and parses its JSON output
 * @param route - the route the caller selected
 * @param target - the pull request
 * @returns every thread
 */
export function listReviewThreads(gh: GhJson, route: Route, target: ThreadTarget): ReviewThread[] {
  const root = `repos/${target.owner}/${target.repo}/pulls/${target.number}`;
  if (route === "rest") {
    // the cloud route returns every thread in one response, so there is no page to follow
    const threads = gh(["api", "--hostname", target.host, `${root}/ccr/review_threads`]);
    if (!Array.isArray(threads)) throw new Error(`${root}/ccr/review_threads did not return a thread array`);
    return threads as ReviewThread[];
  }
  const threads: ReviewThread[] = [];
  let cursor: string | null = null;
  do {
    const response = gh([
      "api",
      "graphql",
      "--hostname",
      target.host,
      "-F",
      `owner=${target.owner}`,
      "-F",
      `name=${target.repo}`,
      "-F",
      `number=${target.number}`,
      ...(cursor === null ? [] : ["-F", `cursor=${cursor}`]),
      "-f",
      `query=${THREAD_QUERY}`,
    ]) as { data: { repository: { pullRequest: { reviewThreads: Page<ThreadNode> } } } };
    const page = response.data.repository.pullRequest.reviewThreads;
    for (const node of page.nodes)
      threads.push({
        comment_ids: [...node.comments.nodes.map((comment) => comment.databaseId), ...remainingComments(gh, target.host, node)],
        resolved: node.isResolved,
        outdated: node.isOutdated,
        path: node.path,
        line: node.line,
        node_id: node.id,
      });
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor !== null);
  return threads;
}

/**
 * reads the comment IDs past a thread's first comment page
 * @param gh - runs `gh` and parses its JSON output
 * @param host - the GitHub host
 * @param thread - the thread whose first comment page is already read
 * @returns the IDs on every later page, in order
 */
function remainingComments(gh: GhJson, host: string, thread: ThreadNode): number[] {
  const ids: number[] = [];
  let page = thread.comments;
  while (page.pageInfo.hasNextPage) {
    const response = gh([
      "api",
      "graphql",
      "--hostname",
      host,
      "-F",
      `id=${thread.id}`,
      "-F",
      `cursor=${page.pageInfo.endCursor}`,
      "-f",
      `query=${COMMENT_QUERY}`,
    ]) as { data: { node: { comments: Page<{ readonly databaseId: number }> } } };
    page = response.data.node.comments;
    ids.push(...page.nodes.map((comment) => comment.databaseId));
  }
  return ids;
}

/**
 * builds the `gh` arguments and stdin that resolve or unresolve the thread
 * containing `commentId`
 * @param gh - runs `gh` and parses its JSON output, for the native thread lookup
 * @param route - the route the caller selected
 * @param target - the pull request
 * @param commentId - any comment in the thread
 * @param resolved - true to resolve, false to unresolve
 * @returns the write's arguments and stdin bytes
 */
export function threadResolutionRequest(
  gh: GhJson,
  route: Route,
  target: ThreadTarget,
  commentId: number,
  resolved: boolean,
): { arguments_: string[]; input: string } {
  const action = resolved ? "resolve" : "unresolve";
  if (route === "rest")
    return {
      arguments_: [
        "api",
        "--hostname",
        target.host,
        "--method",
        "POST",
        `repos/${target.owner}/${target.repo}/pulls/${target.number}/ccr/comments/${commentId}/${action}`,
      ],
      input: "",
    };
  const thread = listReviewThreads(gh, route, target).find((candidate) => candidate.comment_ids.includes(commentId));
  if (thread?.node_id === undefined)
    throw new Error(`no review thread on pull request ${target.number} contains comment ${commentId}`);
  const field = resolved ? "resolveReviewThread" : "unresolveReviewThread";
  return {
    arguments_: ["api", "graphql", "--hostname", target.host, "--input", "-"],
    input: JSON.stringify({
      query: `mutation($threadId:ID!){${field}(input:{threadId:$threadId}){thread{isResolved}}}`,
      variables: { threadId: thread.node_id },
    }),
  };
}
