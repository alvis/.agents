/**
 * selects how the coding plugin reaches GitHub; kept free of runtime-specific
 * imports so the review publisher and its guard can share it. route.ts
 * explains why a REST route exists.
 */

/** how one invocation reaches GitHub */
export type Route = "native" | "rest";

/**
 * selects the route: `GH_ROUTE=native|rest` wins, otherwise a Claude Code
 * cloud session (`CLAUDE_CODE_REMOTE=true`) takes REST and everything else
 * keeps the native `gh` behavior
 * @param env - process environment
 * @returns the selected route
 */
export function detectRoute(env: Record<string, string | undefined>): Route {
  if (env.GH_ROUTE === "native" || env.GH_ROUTE === "rest") return env.GH_ROUTE;
  return env.CLAUDE_CODE_REMOTE === "true" ? "rest" : "native";
}
