#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { join } from "node:path";

interface AuthorizationReceipt {
  author_login: string;
  authorization_body: string;
  base_oid: string;
  comment_id: number;
  comment_node_id: string;
  comment_url: string;
  head_oid: string;
  rationale: { consequence: string; coupling: string; subject: string };
}

try {
  verifyAuthorization();
} catch (error) {
  console.error((error as Error).message);
  console.error("authorization_required");
  process.exit(1);
}

function verifyAuthorization(): void {
  const [host, repository, pullNumber, headOid, baseOid, ...remaining] =
    process.argv.slice(2);
  if (
    !host ||
    !/^[A-Za-z0-9.-]+$/.test(host) ||
    !repository ||
    !/^[^/\s]+\/[^/\s]+$/.test(repository) ||
    !pullNumber ||
    !/^[1-9][0-9]*$/.test(pullNumber) ||
    !headOid ||
    !/^[0-9a-f]{40}$/.test(headOid) ||
    !baseOid ||
    !/^[0-9a-f]{40}$/.test(baseOid) ||
    remaining.length > 0
  ) {
    console.error(
      "usage: verify-black-zone-authorization.ts <host> <owner/repo> <pr-number> <head-oid> <base-oid>",
    );
    process.exit(2);
  }

  const githubCli = process.env.REVIEW_PUBLICATION_GH_BIN ?? "gh";
  const pull = parseRecord(
    readApi(githubCli, host, [`repos/${repository}/pulls/${pullNumber}`]),
  );
  if (
    parseRecord(pull?.head)?.sha !== headOid ||
    parseRecord(pull?.base)?.sha !== baseOid
  ) {
    throw new Error("live PR revision does not match the authorization target");
  }

  const pages = readApi(githubCli, host, [
    "--paginate",
    "--slurp",
    `repos/${repository}/issues/${pullNumber}/comments?per_page=100`,
  ]);
  if (!Array.isArray(pages) || !pages.every(Array.isArray)) {
    throw new Error("invalid GitHub comment pages");
  }
  const [account, repo] = repository.split("/");
  for (const comment of pages.flat()) {
    const receipt = createReceipt(comment, headOid, baseOid);
    if (!receipt) continue;
    const owner = spawnSync(
      "bun",
      [
        "run",
        join(import.meta.dirname, "verify-code-owner.ts"),
        `--username=${receipt.author_login}`,
        `--repo-account=${account}`,
        `--repo-name=${repo}`,
      ],
      {
        env: {
          ...process.env,
          CODE_OWNER_GH_BIN: githubCli,
          CODE_OWNER_HOST: host,
          CODE_OWNER_REF: baseOid,
        },
        stdio: "ignore",
      },
    );
    if (owner.status === 0) {
      console.log(JSON.stringify(receipt));
      return;
    }
  }
  console.error("authorization_required");
  process.exit(1);
}

function createReceipt(
  comment: unknown,
  headOid: string,
  baseOid: string,
): AuthorizationReceipt | null {
  const value = parseRecord(comment);
  const user = parseRecord(value?.user);
  if (
    user?.type !== "User" ||
    typeof user.login !== "string" ||
    !user.login ||
    typeof value?.body !== "string" ||
    typeof value.id !== "number" ||
    typeof value.node_id !== "string" ||
    !value.node_id ||
    typeof value.html_url !== "string" ||
    !value.html_url
  )
    return null;

  const lines = value.body
    .replaceAll("\r\n", "\n")
    .replace(/\n$/, "")
    .split("\n");
  if (
    lines.length !== 5 ||
    lines[0] !== "Black-zone authorization" ||
    lines[1] !== `Head OID: \`${headOid}\`` ||
    lines[2] !== `Base OID: \`${baseOid}\`` ||
    lines[3] !==
      "Authorization: I authorize this one-off black-zone publication."
  )
    return null;

  const rationaleLine = lines[4] ?? "";
  const rationale = /^Indivisibility: (.+) because (.+); otherwise (.+)$/.exec(
    rationaleLine,
  );
  if (
    !rationale ||
    !rationale.slice(1).every((part) => /[\p{L}\p{N}]/u.test(part)) ||
    /too large|many files|review takes longer|because (they|these) are related|would be inconvenient/i.test(
      rationaleLine,
    )
  )
    return null;

  return {
    author_login: user.login,
    authorization_body: value.body,
    base_oid: baseOid,
    comment_id: value.id,
    comment_node_id: value.node_id,
    comment_url: value.html_url,
    head_oid: headOid,
    rationale: {
      consequence: rationale[3]!,
      coupling: rationale[2]!,
      subject: rationale[1]!,
    },
  };
}

function readApi(executable: string, host: string, args: string[]): unknown {
  const result = spawnSync(executable, ["api", "--hostname", host, ...args], {
    encoding: "utf8",
    // retain the shell helper's unbounded response size for paginated comments
    maxBuffer: Infinity,
  });
  if (result.status !== 0) {
    const detail =
      result.stderr?.trim() || result.error?.message || "unknown error";
    throw new Error(
      `GitHub authorization lookup failed (${executable}, ${args.at(-1)}): ${detail}`,
      { cause: result.error },
    );
  }
  return JSON.parse(result.stdout) as unknown;
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
