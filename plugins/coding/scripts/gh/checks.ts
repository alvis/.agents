/**
 * maps REST check runs and commit statuses onto the shapes `gh` reports, so
 * a REST-routed caller sees the same CI evidence as `gh pr checks` and
 * `gh pr view --json statusCheckRollup` without GraphQL
 */

/** one REST check run, as `GET repos/{o}/{r}/commits/{sha}/check-runs` returns it */
export type CheckRun = Readonly<Record<string, unknown>>;

/** one REST commit status, as `GET repos/{o}/{r}/commits/{sha}/status` returns it */
export type CommitStatus = Readonly<Record<string, unknown>>;

/** one check in the `gh pr checks --json` shape */
export interface CheckEntry {
  readonly name: string;
  readonly bucket: "pass" | "fail" | "pending" | "skipping" | "cancel";
  readonly state: string;
  readonly link: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly workflow: string;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} is not a string`);
  return value;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * normalizes one check run the way `gh pr checks` reports it: the details URL
 * is the link, and neutral stays distinct from skipped
 * @param run - REST check run
 * @returns the check entry
 */
export function checkFromRun(run: CheckRun): CheckEntry {
  const status = text(run.status, "CI check run status").toLowerCase();
  const conclusion =
    run.conclusion === null || run.conclusion === undefined
      ? null
      : text(run.conclusion, "CI check run conclusion").toLowerCase();
  const bucket =
    status !== "completed" || conclusion === null
      ? "pending"
      : conclusion === "success"
        ? "pass"
        : ["skipped", "neutral"].includes(conclusion)
          ? "skipping"
          : conclusion === "cancelled"
            ? "cancel"
            : "fail";
  return {
    name: text(run.name, "CI check run name"),
    bucket,
    state: (status === "completed" && conclusion !== null ? conclusion : status).toUpperCase(),
    link: optionalText(run.details_url) ?? optionalText(run.html_url),
    startedAt: optionalText(run.started_at),
    completedAt: optionalText(run.completed_at),
    workflow: "",
  };
}

/**
 * normalizes one legacy commit status into the same shape
 * @param status - REST commit status
 * @returns the check entry
 */
export function checkFromStatus(status: CommitStatus): CheckEntry {
  const state = text(status.state, "commit status state").toLowerCase();
  return {
    name: text(status.context, "commit status context"),
    bucket: state === "success" ? "pass" : state === "pending" ? "pending" : "fail",
    state: state.toUpperCase(),
    link: optionalText(status.target_url),
    startedAt: optionalText(status.created_at),
    completedAt: state === "pending" ? null : optionalText(status.updated_at),
    workflow: "",
  };
}

/**
 * renders a check run as one `statusCheckRollup` entry of `gh pr view --json`
 * @param run - REST check run
 * @returns the rollup entry
 */
export function rollupFromRun(run: CheckRun): Record<string, unknown> {
  return {
    __typename: "CheckRun",
    name: text(run.name, "CI check run name"),
    workflowName: "",
    status: text(run.status, "CI check run status").toUpperCase(),
    conclusion: optionalText(run.conclusion)?.toUpperCase() ?? "",
    startedAt: optionalText(run.started_at),
    completedAt: optionalText(run.completed_at),
    detailsUrl: optionalText(run.details_url) ?? optionalText(run.html_url),
  };
}

/**
 * renders a commit status as one `statusCheckRollup` entry
 * @param status - REST commit status
 * @returns the rollup entry
 */
export function rollupFromStatus(status: CommitStatus): Record<string, unknown> {
  return {
    __typename: "StatusContext",
    context: text(status.context, "commit status context"),
    state: text(status.state, "commit status state").toUpperCase(),
    targetUrl: optionalText(status.target_url),
    startedAt: optionalText(status.created_at),
  };
}
