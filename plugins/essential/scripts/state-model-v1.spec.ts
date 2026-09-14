import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  renderStateModelSchema,
  STATE_MODEL_V1_SCHEMA,
} from "./state-model-v1.schema.ts";
import type {
  ProjectStateDocumentV1,
  StateDashboardDocumentV1,
  StreamStateDocumentV1,
} from "./state-model-v1.ts";

type Schema = Record<string, unknown>;

const projectDocument = {
  schemaVersion: 1,
  kind: "project",
  project: {
    ref: "state:agents",
    slug: "agents",
    title: "Agents",
    goal: "Keep operational state typed.",
    requirements: [],
    specification: { state: "none", entries: [] },
    updatedAt: "2026-08-30T12:00:00Z",
  },
  streams: [],
  environment: [],
  traps: [],
} satisfies ProjectStateDocumentV1;

const streamDocument = {
  schemaVersion: 1,
  kind: "stream",
  projectRef: "state:agents",
  stream: {
    ref: "state:agents:work:dashboard",
    projectRef: "state:agents",
    workId: "dashboard",
    phase: "planned",
    charterStatus: "absent",
    charterRevision: 1,
    planRevision: 1,
    stateRevision: 1,
    writtenUnder: "uncommitted",
    syncState: "not-started",
    reviewState: "not-started",
    updatedAt: "2026-08-30T12:00:00Z",
    tasks: [],
    events: [],
    revisions: [],
    questions: [],
    records: [],
    documentations: [],
  },
  environment: [],
  traps: [],
} satisfies StreamStateDocumentV1;

function resolveReference(root: Schema, reference: string): Schema {
  const path = reference.replace(/^#\//, "").split("/");
  let value: unknown = root;
  for (const key of path) value = (value as Schema)[key];
  return value as Schema;
}

function matchesSchema(value: unknown, schema: Schema, root: Schema): boolean {
  if (typeof schema.$ref === "string") {
    return matchesSchema(value, resolveReference(root, schema.$ref), root);
  }
  if (Array.isArray(schema.oneOf)) {
    return (
      schema.oneOf.filter((entry) =>
        matchesSchema(value, entry as Schema, root),
      ).length === 1
    );
  }
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.some((entry) =>
      matchesSchema(value, entry as Schema, root),
    );
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
  if (schema.type === "string") {
    if (typeof value !== "string") return false;
    if (typeof schema.pattern === "string") {
      return new RegExp(schema.pattern).test(value);
    }
  }
  if (schema.type === "integer") {
    if (!Number.isInteger(value)) return false;
    if (
      typeof schema.minimum === "number" &&
      (value as number) < schema.minimum
    )
      return false;
  }
  if (schema.type === "boolean" && typeof value !== "boolean") return false;
  if (schema.type === "array") {
    if (!Array.isArray(value)) return false;
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems)
      return false;
    if (schema.items) {
      return value.every((entry) =>
        matchesSchema(entry, schema.items as Schema, root),
      );
    }
  }
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return false;
    const record = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    const required = (schema.required ?? []) as string[];
    if (required.some((key) => !(key in record))) return false;
    if (
      schema.additionalProperties === false &&
      Object.keys(record).some((key) => !(key in properties))
    )
      return false;
    return Object.entries(record).every(
      ([key, entry]) =>
        properties[key] === undefined ||
        matchesSchema(entry, properties[key], root),
    );
  }
  return true;
}

function isStateDocument(value: unknown): value is StateDashboardDocumentV1 {
  return matchesSchema(value, STATE_MODEL_V1_SCHEMA, STATE_MODEL_V1_SCHEMA);
}

describe("essential.state/v1 model", () => {
  it("accepts representative project and stream documents", () => {
    expect(isStateDocument(projectDocument)).toBe(true);
    expect(isStateDocument(streamDocument)).toBe(true);
  });

  it("rejects unknown fields, invalid enums, and raw MDC AST JSON", () => {
    expect(isStateDocument({ ...projectDocument, derivedMark: "done" })).toBe(
      false,
    );
    expect(
      isStateDocument({
        ...streamDocument,
        stream: { ...streamDocument.stream, phase: "paused" },
      }),
    ).toBe(false);
    expect(
      isStateDocument({
        ...projectDocument,
        project: { ...projectDocument.project, presentationOrder: 1 },
      }),
    ).toBe(false);
    expect(isStateDocument({ ...projectDocument, schemaVersion: 2 })).toBe(
      false,
    );
    expect(
      isStateDocument({
        ...streamDocument,
        stream: { ...streamDocument.stream, charterRevision: 0 },
      }),
    ).toBe(false);
    expect(
      isStateDocument({
        ...streamDocument,
        stream: { ...streamDocument.stream, planRevision: 0 },
      }),
    ).toBe(false);
    expect(
      isStateDocument({
        ...streamDocument,
        stream: { ...streamDocument.stream, stateRevision: 0 },
      }),
    ).toBe(false);
    expect(
      isStateDocument({ type: "root", children: [], frontmatter: {} }),
    ).toBe(false);
  });

  it("requires project knowledge to be empty for direct stream input", () => {
    expect(
      isStateDocument({
        ...streamDocument,
        environment: [
          {
            ref: "state:agents:environment:claim:1",
            statement: "Bun is installed",
            observedAt: "2026-08-30T12:00:00Z",
            evidence: [],
          },
        ],
      }),
    ).toBe(false);
  });

  it("renders the committed draft-2020-12 schema deterministically", async () => {
    const schemaPath = fileURLToPath(
      new URL("./state-model-v1.schema.json", import.meta.url),
    );
    expect(await readFile(schemaPath, "utf8")).toBe(renderStateModelSchema());
    expect(renderStateModelSchema()).toBe(renderStateModelSchema());
  });

  it("passes the generator stale-file check", () => {
    const generatorPath = fileURLToPath(
      new URL("./generate-state-model-schema.ts", import.meta.url),
    );
    const result = spawnSync("bun", [generatorPath, "--check"], {
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
  });

  it("should type-check itemless arrays as exact empty tuples", () => {
    const typecheckPath = fileURLToPath(
      new URL("./state-model-v1.spec-d.ts", import.meta.url),
    );
    const result = spawnSync(
      "bunx",
      [
        "--package",
        "typescript@^5.9.0",
        "tsc",
        "--noEmit",
        "--strict",
        "--target",
        "ESNext",
        "--module",
        "ESNext",
        "--moduleResolution",
        "Bundler",
        "--allowImportingTsExtensions",
        typecheckPath,
      ],
      { encoding: "utf8" },
    );
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
  });
});
