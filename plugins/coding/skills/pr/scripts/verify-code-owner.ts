#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

type ApiResult = { data: unknown; missing: false } | { missing: true };

const rawContentType = "application/vnd.github.raw+json";
// GitHub ignores CODEOWNERS files at 3 MiB, so larger responses cannot authorize.
const maxCodeownersBytes = 3 * 1024 * 1024;
const { username, account, repo } = parseArguments();
const inaccessibleLookups: string[] = [];

const host = process.env.CODE_OWNER_HOST ?? "github.com";
const gh = process.env.CODE_OWNER_GH_BIN ?? "gh";
if (!/^[A-Za-z0-9.-]+$/.test(host)) {
  console.error("invalid GitHub host");
  process.exit(2);
}

function parseArguments(): { username: string; account: string; repo: string } {
  try {
    const { values } = parseArgs({
      options: {
        username: { type: "string" },
        "repo-account": { type: "string" },
        "repo-name": { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    });
    const { username, "repo-account": account, "repo-name": repo } = values;
    if (
      username &&
      /^[A-Za-z0-9-]+$/.test(username) &&
      account &&
      /^[A-Za-z0-9-]+$/.test(account) &&
      repo &&
      /^[A-Za-z0-9_.-]+$/.test(repo)
    ) {
      return { username, account, repo };
    }
  } catch (error) {
    console.error((error as Error).message);
  }
  console.error(
    "usage: verify-code-owner.ts --username=<username> --repo-account=<account> --repo-name=<name>",
  );
  process.exit(2);
}

function isWritePermission(value: unknown): boolean {
  return (
    value === "admin" ||
    value === "maintain" ||
    value === "write" ||
    value === "push"
  );
}

function readApiRecord(
  path: string,
  accept?: string,
  allowForbidden = false,
): Record<string, unknown> | null {
  const result = readApi(path, accept, allowForbidden);
  return result.missing ? null : parseRecord(result.data);
}

function readApi(
  path: string,
  accept?: string,
  allowForbidden = false,
): ApiResult {
  const result = spawnSync(
    gh,
    [
      "api",
      "--hostname",
      host,
      ...(accept ? ["-H", `Accept: ${accept}`] : []),
      path,
    ],
    {
      encoding: "utf8",
      maxBuffer: maxCodeownersBytes,
    },
  );
  if (result.status !== 0) {
    const failure = result.stderr ?? result.error?.message ?? "unknown error";
    if (failure.includes("(HTTP 404)")) return { missing: true };
    if (allowForbidden && failure.includes("(HTTP 403)")) {
      inaccessibleLookups.push(
        `GitHub API failed for ${path}: ${failure.trim()}`,
      );
      return { missing: true };
    }
    throw new Error(`GitHub API failed for ${path}: ${failure.trim()}`);
  }
  return {
    data:
      accept === rawContentType
        ? result.stdout
        : (JSON.parse(result.stdout) as unknown),
    missing: false,
  };
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid GitHub API response");
  }
  return value as Record<string, unknown>;
}

try {
  const repository = readApiRecord(`repos/${account}/${repo}`);
  if (
    !repository ||
    String(parseRecord(repository.owner).login).toLowerCase() !==
      account.toLowerCase() ||
    String(repository.name).toLowerCase() !== repo.toLowerCase()
  ) {
    throw new Error("repository identity could not be verified");
  }

  const ownerType = parseRecord(repository.owner).type;
  if (ownerType === "User") {
    if (username.toLowerCase() === account.toLowerCase()) {
      console.log(
        `code_owner: ${username} owns personal repository ${account}/${repo}`,
      );
      process.exit(0);
    }
  } else if (ownerType === "Organization") {
    const membership = readApiRecord(
      `orgs/${account}/memberships/${username}`,
      undefined,
      true,
    );
    if (membership?.state === "active" && membership.role === "admin") {
      console.log(`code_owner: ${username} owns organization ${account}`);
      process.exit(0);
    }

    const ref = process.env.CODE_OWNER_REF ?? repository.default_branch;
    if (typeof ref !== "string" || ref.length === 0) {
      throw new Error("repository branch could not be verified");
    }
    let codeowners: string | null = null;
    let codeownersPath = "";
    for (const path of [
      ".github/CODEOWNERS",
      "CODEOWNERS",
      "docs/CODEOWNERS",
    ]) {
      const contentPath = `repos/${account}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
      const content = readApiRecord(
        contentPath,
        "application/vnd.github.object+json",
      );
      if (!content) continue;
      if (content.type === "dir") continue;
      if (content.type !== "file") {
        throw new Error("CODEOWNERS content could not be verified");
      }
      if (
        content.encoding === "base64" &&
        typeof content.content === "string"
      ) {
        codeowners = Buffer.from(content.content, "base64").toString("utf8");
      } else if (
        content.encoding === "none" &&
        content.content === "" &&
        typeof content.size === "number" &&
        content.size < maxCodeownersBytes
      ) {
        const raw = readApi(contentPath, rawContentType);
        if (raw.missing || typeof raw.data !== "string") {
          throw new Error("CODEOWNERS content could not be verified");
        }
        codeowners = raw.data;
      } else {
        throw new Error("CODEOWNERS content could not be verified");
      }
      codeownersPath = path;
      break;
    }
    if (codeowners !== null) {
      if (Buffer.byteLength(codeowners) >= maxCodeownersBytes) {
        throw new Error("CODEOWNERS exceeds GitHub's size limit");
      }
      const errors = readApiRecord(
        `repos/${account}/${repo}/codeowners/errors?ref=${encodeURIComponent(ref)}`,
      );
      if (!errors || !Array.isArray(errors.errors)) {
        throw new Error("CODEOWNERS validation could not be verified");
      }
      const invalidLines = new Set(
        errors.errors
          .map((error) => parseRecord(error))
          .filter((error) => error.path === codeownersPath)
          .map((error) => error.line),
      );
      const lines = codeowners.split(/\r?\n/);
      for (const [index, line] of lines.entries()) {
        if (invalidLines.has(index + 1)) continue;
        // consume escaped pattern characters before separating owner tokens
        const tokens = line.trim().match(/(?:\\.|[^\s\\])+/g) ?? [];
        if (tokens.length < 2 || tokens[0]?.startsWith("#")) continue;
        for (const token of tokens.slice(1)) {
          if (token.startsWith("#")) break;
          if (token.toLowerCase() === `@${username.toLowerCase()}`) {
            const permission = readApiRecord(
              `repos/${account}/${repo}/collaborators/${username}/permission`,
              undefined,
              true,
            );
            if (isWritePermission(permission?.permission)) {
              console.log(
                `code_owner: ${username} is listed in ${codeownersPath}`,
              );
              process.exit(0);
            }
          }
          const team = token.match(/^@([^/]+)\/([^/]+)$/);
          if (team?.[1]?.toLowerCase() !== account.toLowerCase()) continue;
          const slug = team[2];
          const teamMembership = readApiRecord(
            `orgs/${account}/teams/${slug}/memberships/${username}`,
            undefined,
            true,
          );
          if (!teamMembership) continue;
          const teamRepository = readApiRecord(
            `orgs/${account}/teams/${slug}/repos/${account}/${repo}`,
            "application/vnd.github.v3.repository+json",
            true,
          );
          const teamPermissions =
            teamRepository?.permissions === undefined
              ? null
              : parseRecord(teamRepository.permissions);
          if (
            teamMembership?.state === "active" &&
            (teamPermissions?.push === true ||
              teamPermissions?.maintain === true ||
              teamPermissions?.admin === true)
          ) {
            console.log(
              `code_owner: ${username} belongs to ${token} in ${codeownersPath}`,
            );
            process.exit(0);
          }
        }
      }
    }
  } else {
    throw new Error("repository account type could not be verified");
  }
  if (inaccessibleLookups.length > 0) {
    throw new Error(inaccessibleLookups.join("; "));
  }
  console.error(
    `not_code_owner: ${username} is not a code owner of ${account}/${repo}`,
  );
  process.exit(1);
} catch (error) {
  console.error(`code_owner_unknown: ${(error as Error).message}`);
  process.exit(1);
}
