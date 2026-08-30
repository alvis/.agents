import { lstat, readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

import { parse } from "./vendor/mdc-bundle.mjs";
import { STATE_MODEL_V1_SCHEMA } from "./state-model-v1.schema.ts";

import type { StateDashboardDocumentV1 } from "./state-model-v1.ts";

import type { MdcDocument, MdcNode } from "./vendor/mdc-bundle.mjs";

export type * from "./state-model-v1.ts";

export interface ValidationError {
  code: string;
  message: string;
  document: string;
  ref?: string;
  path?: string;
  line?: number;
  column?: number;
}

const TASK_DEFINITION_FIELDS = [
  "ref",
  "id",
  "summary",
  "parentRef",
  "required",
  "targets",
  "dependsOn",
  "acceptanceRefs",
] as const;

export function taskDefinitionHash(
  tasks: readonly Record<string, unknown>[],
): string {
  const normalized = tasks
    .map((task) => {
      const definition: Record<string, unknown> = {};
      for (const field of TASK_DEFINITION_FIELDS) {
        const value = task[field];
        if (value !== undefined)
          definition[field] = Array.isArray(value)
            ? [...value].sort((left, right) =>
                String(left).localeCompare(String(right)),
              )
            : value;
      }
      return definition;
    })
    .sort((left, right) => String(left.ref).localeCompare(String(right.ref)));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

type StateRecord = Record<string, unknown>;
type ValueKind =
  | "array"
  | "boolean"
  | "integer"
  | "number"
  | "object"
  | "string";

interface FieldRule {
  kind: ValueKind;
  optional?: boolean;
  values?: readonly (string | number | boolean)[];
  item?: FieldRule;
  fields?: Record<string, FieldRule>;
  minimum?: number;
}

interface EntityRule {
  display: string;
  fields: Record<string, FieldRule>;
  ref: RegExp;
}

interface LoadedMdcDocument {
  path: string;
  ast: MdcDocument;
  kind: string;
  ref: string;
  workRef?: string;
}

const text = (optional = false): FieldRule => ({ kind: "string", optional });
const integer = (optional = false): FieldRule => ({
  kind: "integer",
  minimum: 1,
  optional,
});
const bool = (optional = false): FieldRule => ({ kind: "boolean", optional });
const list = (item: FieldRule, optional = false): FieldRule => ({
  kind: "array",
  item,
  optional,
});
const object = (
  fields: Record<string, FieldRule>,
  optional = false,
): FieldRule => ({ kind: "object", fields, optional });
const enumeration = (
  values: readonly (string | number | boolean)[],
  optional = false,
): FieldRule => ({ kind: typeof values[0] as ValueKind, optional, values });

const LOCATOR = object({ uri: text(), revision: text(true), hash: text(true) });
const STATEMENT = object({
  ref: text(),
  text: text(),
  relation: enumeration(["affects", "invalidates", "preserves"], true),
});
const EVIDENCE = object({
  ref: text(),
  summary: text(),
  locator: LOCATOR,
  inputs: list(LOCATOR),
  observedAt: text(true),
  disposition: text(true),
});
const SPECIFICATION = object({
  state: enumeration(["none", "pending", "linked"]),
  entries: list(LOCATOR),
});
const VALIDITY = object({
  state: enumeration(["stale", "unknown"]),
  reason: text(),
});

const REF = {
  project: /^state:[a-z0-9]+(?:-[a-z0-9]+)*$/,
  stream: /^state:[a-z0-9]+(?:-[a-z0-9]+)*:work:[a-z0-9]+(?:-[a-z0-9]+)*$/,
};
const workEntity = (suffix: string): RegExp =>
  new RegExp(
    `^state:[a-z0-9]+(?:-[a-z0-9]+)*:work:[a-z0-9]+(?:-[a-z0-9]+)*:${suffix}$`,
  );

const ENTITY_RULES: Record<string, EntityRule> = {
  "state.project": {
    display: "title",
    ref: REF.project,
    fields: {
      slug: text(),
      goal: text(),
      requirements: list(STATEMENT),
      specification: SPECIFICATION,
      updatedAt: text(),
    },
  },
  "state.stream": {
    display: "workId",
    ref: REF.stream,
    fields: {
      projectRef: text(),
      phase: enumeration([
        "planned",
        "working",
        "reviewing",
        "completed",
        "archived",
      ]),
      blockedOn: text(true),
      charterStatus: enumeration(["approved", "reconstructed", "absent"]),
      charterRevision: integer(),
      planRevision: integer(),
      stateRevision: integer(),
      writtenUnder: text(),
      repositoryRevision: text(true),
      syncState: text(),
      reviewState: text(),
      updatedAt: text(),
      charter: object({}, true),
      tasks: list(object({})),
      continuation: object({}, true),
      events: list(object({})),
      revisions: list(object({})),
      questions: list(object({})),
      records: list(object({})),
      review: object({}, true),
      submission: object({}, true),
      completion: object({}, true),
      location: { ...LOCATOR, optional: true },
      documentations: list(object({})),
    },
  },
  "state.charter": {
    display: "goal",
    ref: workEntity("charter"),
    fields: {
      revision: integer(),
      requirements: list(STATEMENT),
      boundary: object({
        ref: text(),
        in: list(STATEMENT),
        out: list(STATEMENT),
      }),
      successCriteria: list(object({})),
      specification: SPECIFICATION,
      anchors: list(object({})),
    },
  },
  "state.statement": {
    display: "text",
    ref: /:statement:[a-z0-9]+(?:-[a-z0-9]+)*$/,
    fields: {
      relation: enumeration(["affects", "invalidates", "preserves"], true),
    },
  },
  "state.successCriterion": {
    display: "text",
    ref: /:sc:[1-9]\d*$/,
    fields: { id: text(), expectedEvidence: text() },
  },
  "state.anchor": {
    display: "locator.uri",
    ref: /:anchor:[a-z0-9]+(?:-[a-z0-9]+)*$/,
    fields: {
      kind: enumeration([
        "git",
        "jj",
        "media-project",
        "asset-store",
        "requirements-authority",
      ]),
      locator: LOCATOR,
      revisionSemantics: text(),
    },
  },
  "state.task": {
    display: "summary",
    ref: /:task:[A-Z]{3}(?:\d{2})?$/,
    fields: {
      id: text(),
      parentRef: text(true),
      targets: list(text()),
      dependsOn: list(text()),
      required: bool(),
      acceptanceRefs: list(text()),
      status: enumeration([
        "planned",
        "working",
        "done",
        "failed",
        "blocked",
        "cancelled",
      ]),
      owner: text(true),
      evidence: list(EVIDENCE),
      attempt: object(
        { outcome: enumeration(["pass", "fail", "partial"]), at: text() },
        true,
      ),
      retry: text(true),
      disposition: text(true),
      unblock: text(true),
      validity: { ...VALIDITY, optional: true },
    },
  },
  "state.continuation": {
    display: "focus",
    ref: workEntity("continuation"),
    fields: {
      handback: text(),
      nextAction: text(),
      taskRefs: list(text()),
      fastPaths: list(LOCATOR),
    },
  },
  "state.evidence": {
    display: "summary",
    ref: /:evidence:[a-z0-9]+(?:-[a-z0-9]+)*$/,
    fields: {
      locator: LOCATOR,
      inputs: list(LOCATOR),
      observedAt: text(true),
      disposition: text(true),
    },
  },
  "state.event": {
    display: "summary",
    ref: /:event:[1-9]\d*-[1-9]\d*$/,
    fields: {
      timestamp: text(),
      actor: text(),
      capabilityId: text(),
      eventType: enumeration([
        "status",
        "decision",
        "revision",
        "sync",
        "sweep",
        "lease",
      ]),
      stateRevision: integer(),
      subjectRef: text(),
      evidenceRefs: list(text()),
      invalidates: list(text()),
    },
  },
  "state.revision": {
    display: "what",
    ref: /:revision:(?:plan|charter)-[1-9]\d*$/,
    fields: {
      kind: enumeration(["plan", "charter"]),
      number: integer(),
      timestamp: text(),
      why: text(),
      approver: text(),
      specificationBaseId: text(true),
    },
  },
  "state.question": {
    display: "text",
    ref: /:question:[a-z0-9]+(?:-[a-z0-9]+)*$/,
    fields: {
      owner: text(),
      waitingSince: text(),
      awaitingUser: bool(),
      resolvedAt: text(true),
      answer: text(true),
    },
  },
  "state.record": {
    display: "headline",
    ref: /:record:(?:proposal|change|decision|design):[a-z0-9]+(?:-[a-z0-9]+)*$/,
    fields: {
      kind: enumeration(["proposal", "change", "decision", "design"]),
      status: text(),
      owner: text(),
      createdAt: text(),
      locator: LOCATOR,
      targetRef: text(),
      provenance: list(LOCATOR),
      originRef: text(true),
      supersedes: list(text()),
      affects: list(text()),
      invalidates: list(text()),
      preserves: list(text()),
      relationshipStatements: list(object({})),
      effectiveFrom: text(true),
    },
  },
  "state.review": {
    display: "literal:Review",
    ref: workEntity("review"),
    fields: { areas: list(object({})) },
  },
  "state.reviewArea": {
    display: "area",
    ref: /:review-area:[a-z]+(?::[a-z0-9-]+)?$/,
    fields: {
      reviewedAt: text(),
      reviewedRevision: integer(),
      reviewedTaskRefs: list(text()),
      taskDefinitionHash: text(),
      validity: { ...VALIDITY, optional: true },
      findings: list(object({})),
    },
  },
  "state.finding": {
    display: "summary",
    ref: /:finding:[a-z]+(?::[a-z0-9-]+)?:[a-z0-9]+(?:-[a-z0-9]+)*$/,
    fields: {
      status: enumeration([
        "open",
        "fixed",
        "acknowledged",
        "deferred",
        "skipped",
      ]),
      severity: enumeration(
        ["critical", "high", "medium", "low", "info"],
        true,
      ),
      evidence: list(EVIDENCE),
      rationale: text(true),
      owner: text(true),
      recheckCondition: text(true),
      riskAcceptance: { ...LOCATOR, optional: true },
    },
  },
  "state.submission": {
    display: "kind",
    ref: workEntity("submission"),
    fields: {
      pullRequests: list(object({})),
      deliverables: list(object({})),
      accepter: text(true),
    },
  },
  "state.pullRequest": {
    display: "url",
    ref: /:pr:[1-9]\d*$/,
    fields: {
      number: integer(),
      repository: text(),
      headRevision: text(),
      status: enumeration(["draft", "open", "merged", "closed"]),
      mergedRevision: text(true),
    },
  },
  "state.deliverable": {
    display: "title",
    ref: /:deliverable:[a-z0-9]+(?:-[a-z0-9]+)*$/,
    fields: { locator: LOCATOR, reviewed: bool() },
  },
  "state.completion": {
    display: "completedAt",
    ref: workEntity("completion"),
    fields: {
      landing: list(EVIDENCE),
      promotion: object({}),
      outlives: list(object({})),
      decisionDispositions: list(object({})),
    },
  },
  "state.promotion": {
    display: "mode",
    ref: workEntity("promotion"),
    fields: { paths: list(LOCATOR), evidence: { ...EVIDENCE, optional: true } },
  },
  "state.outlives": {
    display: "summary",
    ref: /:outlives:[a-z0-9]+(?:-[a-z0-9]+)*$/,
    fields: { owner: text(), carrier: LOCATOR },
  },
  "state.decisionDisposition": {
    display: "decisionRef",
    ref: /:decision-disposition:[a-z0-9]+(?:-[a-z0-9]+)*$/,
    fields: {
      kind: enumeration([
        "adr",
        "product-record",
        "production-record",
        "work-receipt",
        "expired-archive",
      ]),
      carrier: LOCATOR,
    },
  },
  "state.environmentClaim": {
    display: "statement",
    ref: /:environment:[a-z0-9]+(?:-[a-z0-9]+)*$/,
    fields: {
      observedAt: text(),
      evidence: list(EVIDENCE),
      validity: { ...VALIDITY, optional: true },
    },
  },
  "state.trap": {
    display: "symptom",
    ref: /:trap:[a-z0-9]+(?:-[a-z0-9]+)*$/,
    fields: {
      cause: text(),
      action: text(),
      verifiedAt: text(true),
      evidence: list(EVIDENCE),
      validity: { ...VALIDITY, optional: true },
    },
  },
  "state.documentation": {
    display: "title",
    ref: /:documentation:[a-z0-9]+(?:-[a-z0-9]+)*$/,
    fields: { locator: LOCATOR, capabilityRef: text(true) },
  },
};

const ROOT_RULES: Record<string, FieldRule> = {
  project: object({
    schemaVersion: enumeration([1]),
    kind: enumeration(["project"]),
    project: object({}),
    streams: list(object({})),
    environment: list(object({})),
    traps: list(object({})),
  }),
  stream: object({
    schemaVersion: enumeration([1]),
    kind: enumeration(["stream"]),
    projectRef: text(),
    stream: object({}),
    environment: list(object({})),
    traps: list(object({})),
  }),
};

const CHILD_FIELDS: Record<string, Record<string, string>> = {
  "state.project": { "state.statement": "requirements" },
  "state.stream": {
    "state.charter": "charter",
    "state.task": "tasks",
    "state.continuation": "continuation",
    "state.event": "events",
    "state.revision": "revisions",
    "state.question": "questions",
    "state.record": "records",
    "state.review": "review",
    "state.submission": "submission",
    "state.completion": "completion",
    "state.documentation": "documentations",
  },
  "state.charter": {
    "state.statement": "requirements",
    "state.successCriterion": "successCriteria",
    "state.anchor": "anchors",
  },
  "state.task": { "state.evidence": "evidence" },
  "state.review": { "state.reviewArea": "areas" },
  "state.reviewArea": { "state.finding": "findings" },
  "state.record": { "state.statement": "relationshipStatements" },
  "state.finding": { "state.evidence": "evidence" },
  "state.submission": {
    "state.pullRequest": "pullRequests",
    "state.deliverable": "deliverables",
  },
  "state.completion": {
    "state.evidence": "landing",
    "state.promotion": "promotion",
    "state.outlives": "outlives",
    "state.decisionDisposition": "decisionDispositions",
  },
  "state.environmentClaim": { "state.evidence": "evidence" },
  "state.trap": { "state.evidence": "evidence" },
};

const KNOWN_DOCUMENT_KINDS = new Set([
  "project",
  "stream",
  "charter",
  "tasks",
  "events",
  "revisions",
  "questions",
  "records",
  "review",
  "submission",
  "completion",
  "environment",
  "traps",
]);
const SUPPORTING_DOCUMENT_KINDS = new Set(
  [...KNOWN_DOCUMENT_KINDS].filter(
    (kind) => !["project", "stream", "environment", "traps"].includes(kind),
  ),
);
const DOCUMENT_ENTITIES: Record<string, Set<string>> = {
  project: new Set(["state.project"]),
  stream: new Set(["state.stream"]),
  charter: new Set(["state.charter"]),
  tasks: new Set(["state.task", "state.continuation"]),
  events: new Set(["state.event"]),
  revisions: new Set(["state.revision"]),
  questions: new Set(["state.question"]),
  records: new Set(["state.record"]),
  review: new Set(["state.review"]),
  submission: new Set(["state.submission"]),
  completion: new Set(["state.completion"]),
  environment: new Set(["state.environmentClaim"]),
  traps: new Set(["state.trap"]),
};
const DOCUMENT_SOURCES: Record<string, Set<string>> = {
  project: new Set(["environment", "traps", "stream"]),
  stream: new Set([
    "charter",
    "tasks",
    "events",
    "revisions",
    "questions",
    "records",
    "review",
    "submission",
    "completion",
  ]),
  tasks: new Set(["tasks"]),
  records: new Set(["records"]),
  review: new Set(["review"]),
};

export class StateValidationFailure extends Error {
  public constructor(public readonly errors: ValidationError[]) {
    super("state dashboard input is invalid");
  }
}

export async function decodeStateDashboard(
  input: string,
): Promise<StateDashboardDocumentV1> {
  const extension = extname(input).toLowerCase();
  let value: unknown;
  if (extension === ".json") {
    try {
      value = JSON.parse(await readFile(input, "utf8"));
    } catch (error) {
      throw new StateValidationFailure([
        {
          code: "json.parse",
          message: (error as Error).message,
          document: input,
        },
      ]);
    }
  } else if (extension === ".mdc") {
    value = await decodeMdcGraph(input);
  } else {
    throw new StateValidationFailure([
      {
        code: "input.extension",
        message: "input must end in .mdc or .json",
        document: input,
      },
    ]);
  }
  const errors: ValidationError[] = [];
  validateDashboard(value, input, errors);
  if (errors.length > 0) throw new StateValidationFailure(sortErrors(errors));
  return normalize(value as StateDashboardDocumentV1);
}

async function decodeMdcGraph(input: string): Promise<StateRecord> {
  const graph = await loadMdcGraph(input);
  validateReachableWorkRefs(graph.documents, graph.errors);
  if (graph.errors.length > 0)
    throw new StateValidationFailure(sortErrors(graph.errors));
  return assembleGraph(graph.root, [...graph.documents.values()]);
}

interface LoadedMdcGraph {
  documents: Map<string, LoadedMdcDocument>;
  errors: ValidationError[];
  root: LoadedMdcDocument;
}

/**
 * Invocation-local mutable accumulators for one recursive graph walk.
 * Mutation keeps cycle, duplicate-path, and duplicate-ref checks O(1) per edge;
 * copying each collection at every recursive step would make traversal quadratic.
 */
interface GraphLoadContext {
  readonly stateRoot: string;
  readonly stateReal: string;
  readonly documents: Map<string, LoadedMdcDocument>;
  readonly active: Set<string>;
  readonly errors: ValidationError[];
  readonly graphRefs: Map<string, string>;
}

interface GraphVisit {
  path: string;
  expectedKind?: string;
  expectedWorkRef?: string;
  expectedProjectRef?: string;
  expectedWorkId?: string;
}

interface DocumentIdentity {
  annotations: Record<string, unknown>;
  kind: string;
  ref: string;
  workRef?: string;
  domainChildren: MdcNode[];
}

interface DocumentValidation extends DocumentIdentity {
  context: GraphLoadContext;
  visit: GraphVisit;
  document: string;
  ast: MdcDocument;
}

interface DocumentIdentityParams {
  context: GraphLoadContext;
  visit: GraphVisit;
  document: string;
  ast: MdcDocument;
}

interface SourceKindParams {
  errors: ValidationError[];
  document: LoadedMdcDocument;
  node: MdcNode;
  documentKind: string;
}

interface TraverseDocumentSourcesParams {
  context: GraphLoadContext;
  document: LoadedMdcDocument;
  annotations: Record<string, unknown>;
}

interface SourceRefParams {
  context: GraphLoadContext;
  document: LoadedMdcDocument;
  node: MdcNode;
}

interface SourceGraphVisitParams {
  errors: ValidationError[];
  document: LoadedMdcDocument;
  node: MdcNode;
  source: { href: string; documentKind: string };
  annotations: Record<string, unknown>;
}

async function loadMdcGraph(input: string): Promise<LoadedMdcGraph> {
  const rootPath = resolve(input);
  const stateRoot = await findStateRoot(rootPath);
  const context: GraphLoadContext = {
    stateRoot,
    stateReal: await realpath(stateRoot),
    documents: new Map(),
    active: new Set(),
    errors: [],
    graphRefs: new Map(),
  };
  await visitMdcDocument(context, { path: rootPath });
  if (context.errors.length > 0)
    throw new StateValidationFailure(sortErrors(context.errors));
  const root = context.documents.get(await realpath(rootPath));
  if (root === undefined || !["project", "stream"].includes(root.kind)) {
    throw new StateValidationFailure([
      {
        code: "document.root-kind",
        message: "root must be project or stream",
        document: rootPath,
      },
    ]);
  }
  return { documents: context.documents, errors: context.errors, root };
}

async function visitMdcDocument(
  context: GraphLoadContext,
  visit: GraphVisit,
): Promise<void> {
  const canonical = await resolveGraphDocumentPath({ ...context, ...visit });
  if (canonical === undefined) return;
  context.active.add(canonical);
  const ast = await readMdcDocument(canonical, context.errors);
  if (ast === undefined) {
    context.active.delete(canonical);
    return;
  }
  const identity = validateDocumentIdentity({
    context,
    visit,
    document: canonical,
    ast,
  });
  const loaded: LoadedMdcDocument = {
    path: canonical,
    ast,
    kind: identity.kind,
    ref: identity.ref,
    workRef: identity.workRef,
  };
  context.documents.set(canonical, loaded);
  await traverseDocumentSources({
    context,
    document: loaded,
    annotations: identity.annotations,
  });
  context.active.delete(canonical);
}

function validateDocumentIdentity(
  params: DocumentIdentityParams,
): DocumentIdentity {
  const { context, visit, document, ast } = params;
  const annotations = ast.annotations ?? {};
  const kind = typeof annotations.kind === "string" ? annotations.kind : "";
  const ref = typeof annotations.ref === "string" ? annotations.ref : "";
  const workRef =
    typeof annotations.workRef === "string" ? annotations.workRef : undefined;
  const domainChildren = ast.children.filter(
    (node) => node.type !== "state.source",
  );
  const validation: DocumentValidation = {
    context,
    visit,
    document,
    ast,
    annotations,
    kind,
    ref,
    workRef,
    domainChildren,
  };
  validateDocumentFrontmatter(validation);
  validateDocumentWorkRef(validation);
  validateDocumentEntities(validation);
  return { annotations, kind, ref, workRef, domainChildren };
}

function validateDocumentFrontmatter(validation: DocumentValidation): void {
  const { context, document, ast, annotations } = validation;
  if (ast.ref !== undefined)
    context.errors.push({
      code: "document.root-ref",
      message: "document identity must be in frontmatter annotations",
      document,
    });
  const allowed = new Set(["schema", "kind", "ref", "workId", "workRef"]);
  for (const key of Object.keys(annotations))
    if (!allowed.has(key))
      context.errors.push({
        code: "document.unknown-field",
        message: `unknown frontmatter field ${key}`,
        document,
        path: key,
      });
  validateDocumentSchema(validation);
  registerDocumentRef(validation);
}

function validateDocumentSchema(validation: DocumentValidation): void {
  const { context, visit, document, annotations, kind } = validation;
  const { errors } = context;
  if (annotations.schema !== "essential.state/v1")
    errors.push({
      code: "document.schema",
      message: "schema must be essential.state/v1",
      document,
    });
  if (!KNOWN_DOCUMENT_KINDS.has(kind))
    errors.push({
      code: "document.kind",
      message: `unknown document kind ${kind}`,
      document,
    });
  if (visit.expectedKind !== undefined && visit.expectedKind !== kind)
    errors.push({
      code: "graph.kind",
      message: `expected ${visit.expectedKind}, received ${kind}`,
      document,
    });
}

function registerDocumentRef(validation: DocumentValidation): void {
  const { context, document, annotations, kind, ref } = validation;
  if (ref.length === 0)
    context.errors.push({
      code: "document.ref",
      message: "document ref is required",
      document,
    });
  else if (context.graphRefs.has(ref))
    context.errors.push({
      code: "ref.duplicate",
      message: "duplicate document or source ref",
      document,
      ref,
    });
  else context.graphRefs.set(ref, document);
  if ((kind === "project" || kind === "stream") && ref !== annotations.ref)
    context.errors.push({
      code: "document.identity",
      message: "root identity mismatch",
      document,
    });
}

function validateDocumentWorkRef(validation: DocumentValidation): void {
  const { context, document, annotations, kind, ref } = validation;
  const { errors } = context;
  const workRef = annotations.workRef;
  if (
    SUPPORTING_DOCUMENT_KINDS.has(kind) &&
    typeof workRef === "string" &&
    ref !== `${workRef}:document:${kind}` &&
    !ref.startsWith(`${workRef}:document:${kind}-`)
  )
    errors.push({
      code: "document.ref-grammar",
      message: "supporting document ref must derive from workRef and kind",
      document,
      ref,
    });
  validateWorkRefPresence(validation);
}

function validateWorkRefPresence(validation: DocumentValidation): void {
  const { context, visit, document, annotations, kind } = validation;
  const { errors } = context;
  const workRef = annotations.workRef;
  const supporting = SUPPORTING_DOCUMENT_KINDS.has(kind);
  if (supporting && typeof workRef !== "string")
    errors.push({
      code: "document.work-ref",
      message: `${kind} requires workRef`,
      document,
    });
  if (!supporting && workRef !== undefined)
    errors.push({
      code: "document.work-ref",
      message: `${kind} cannot declare workRef`,
      document,
    });
  if (typeof workRef === "string" && !REF.stream.test(workRef))
    errors.push({
      code: "document.work-ref",
      message: "workRef must be a canonical stream ref",
      document,
      ref: workRef,
    });
  if (
    visit.expectedWorkRef !== undefined &&
    supporting &&
    workRef !== visit.expectedWorkRef
  )
    errors.push({
      code: "graph.work-ref",
      message: `workRef must equal ${visit.expectedWorkRef}`,
      document,
      ref: typeof workRef === "string" ? workRef : undefined,
    });
}

function validateDocumentEntities(validation: DocumentValidation): void {
  const { context, document, annotations, kind, ref, domainChildren } =
    validation;
  const { errors } = context;
  validateEntityShape(validation);
  validateStreamIdentity(validation);
  const projectOwner = validateProjectOwnership(validation);
  const entityOwner =
    kind === "project" || kind === "stream"
      ? ref
      : SUPPORTING_DOCUMENT_KINDS.has(kind)
        ? typeof annotations.workRef === "string"
          ? annotations.workRef
          : undefined
        : projectOwner;
  if (entityOwner !== undefined)
    validateMdcEntityOwnership({
      nodes: domainChildren,
      ownerRef: entityOwner,
      projectScoped:
        kind === "project" || ["environment", "traps"].includes(kind),
      document,
      errors,
    });
}

function validateEntityShape(validation: DocumentValidation): void {
  const { context, document, kind, ref, domainChildren } = validation;
  const { errors } = context;
  const allowedEntities = DOCUMENT_ENTITIES[kind];
  if (
    allowedEntities !== undefined &&
    domainChildren.some((node) => !allowedEntities.has(node.type))
  )
    errors.push({
      code: "document.entity-type",
      message: `document kind ${kind} contains an invalid entity type`,
      document,
    });
  const singletonKinds = [
    "project",
    "stream",
    "charter",
    "review",
    "submission",
    "completion",
  ];
  if (singletonKinds.includes(kind) && domainChildren.length !== 1)
    errors.push({
      code: "document.entity-count",
      message: `${kind} requires exactly one root entity`,
      document,
    });
  if (["project", "stream"].includes(kind) && domainChildren[0]?.ref !== ref)
    errors.push({
      code: "document.identity",
      message: `${kind} entity ref must equal document ref`,
      document,
      ref: domainChildren[0]?.ref,
    });
}

function validateStreamIdentity(validation: DocumentValidation): void {
  const { context, visit, document, annotations, kind, ref, domainChildren } =
    validation;
  const { errors } = context;
  if (kind !== "stream") return;
  const workId = plainText(domainChildren[0]);
  if (workId !== annotations.workId)
    errors.push({
      code: "document.work-id",
      message: "stream entity workId must equal frontmatter workId",
      document,
      ref,
    });
  if (visit.expectedWorkId !== undefined && workId !== visit.expectedWorkId)
    errors.push({
      code: "graph.stream-work-id",
      message: "project stream source path must match the decoded workId",
      document,
      ref,
    });
}

function validateProjectOwnership(
  validation: DocumentValidation,
): string | undefined {
  const { context, visit, document, kind, ref, domainChildren } = validation;
  const { errors } = context;
  const streamProjectRef = projectRefFromStreamRef(ref);
  if (
    kind === "stream" &&
    (streamProjectRef === undefined ||
      domainChildren[0]?.annotations?.projectRef !== streamProjectRef ||
      (visit.expectedProjectRef !== undefined &&
        streamProjectRef !== visit.expectedProjectRef))
  )
    errors.push({
      code: "graph.project-owner",
      message: "stream ref and projectRef must identify the owning project",
      document,
      ref,
    });
  const projectOwner = projectRefFromDocumentRef(ref, kind);
  if (
    ["environment", "traps"].includes(kind) &&
    (projectOwner === undefined ||
      (visit.expectedProjectRef !== undefined &&
        projectOwner !== visit.expectedProjectRef))
  )
    errors.push({
      code: "graph.project-owner",
      message: `${kind} document ref must identify the owning project`,
      document,
      ref,
    });
  return projectOwner;
}

async function traverseDocumentSources(
  params: TraverseDocumentSourcesParams,
): Promise<void> {
  const { context, document, annotations } = params;
  for (const node of document.ast.children) {
    if (node.type !== "state.source") continue;
    validateSourceRef({ context, document, node });
    const source = decodeSource(node, document.path, context.errors);
    if (source === undefined) continue;
    validateSourceKind({
      errors: context.errors,
      document,
      node,
      documentKind: source.documentKind,
    });
    const visit = sourceGraphVisit({
      errors: context.errors,
      document,
      node,
      source,
      annotations,
    });
    await visitMdcDocument(context, visit);
  }
}

function validateSourceRef(params: SourceRefParams): void {
  const { context, document, node } = params;
  if (typeof node.ref !== "string")
    context.errors.push({
      code: "source.ref",
      message: "source ref is required",
      document: document.path,
    });
  else if (context.graphRefs.has(node.ref))
    context.errors.push({
      code: "ref.duplicate",
      message: "duplicate document or source ref",
      document: document.path,
      ref: node.ref,
    });
  else context.graphRefs.set(node.ref, document.path);
  if (
    typeof node.ref === "string" &&
    !node.ref.startsWith(`${document.ref}:source:`)
  )
    context.errors.push({
      code: "source.ref-grammar",
      message: "source ref must derive from the containing document ref",
      document: document.path,
      ref: node.ref,
    });
}

function validateSourceKind(params: SourceKindParams): void {
  const { errors, document, node, documentKind } = params;
  if (!(DOCUMENT_SOURCES[document.kind] ?? new Set()).has(documentKind))
    errors.push({
      code: "graph.source-kind",
      message: `${document.kind} cannot source ${documentKind}`,
      document: document.path,
      ref: node.ref,
    });
}

function sourceGraphVisit(params: SourceGraphVisitParams): GraphVisit {
  const { errors, document, node, source, annotations } = params;
  const projectSource = document.kind === "project";
  const streamRoot =
    projectSource && source.documentKind === "stream"
      ? /^(?:works|archive)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/state\.mdc$/.exec(
          source.href,
        )
      : undefined;
  if (projectSource && source.documentKind === "stream" && streamRoot === null)
    errors.push({
      code: "graph.stream-root",
      message:
        "project stream sources must target works/<workId>/state.mdc or archive/<workId>/state.mdc",
      document: document.path,
      ref: node.ref,
    });
  const ownerWorkRef =
    document.kind === "stream"
      ? document.ref
      : typeof annotations.workRef === "string"
        ? annotations.workRef
        : undefined;
  return {
    path: resolve(dirname(document.path), source.href),
    expectedKind: source.documentKind,
    expectedWorkRef:
      projectSource || source.documentKind === "stream"
        ? undefined
        : ownerWorkRef,
    expectedProjectRef: projectSource ? document.ref : undefined,
    expectedWorkId: streamRoot?.[1],
  };
}

function validateReachableWorkRefs(
  documents: Map<string, LoadedMdcDocument>,
  errors: ValidationError[],
): void {
  const streamRefs = new Set(
    [...documents.values()]
      .filter((document) => document.kind === "stream")
      .map((document) => document.ref),
  );
  for (const document of documents.values()) {
    if (document.workRef !== undefined && !streamRefs.has(document.workRef))
      errors.push({
        code: "graph.work-ref",
        message: "workRef does not name a reachable stream",
        document: document.path,
        ref: document.workRef,
      });
  }
}

interface GraphPathContext {
  path: string;
  stateRoot: string;
  stateReal: string;
  active: Set<string>;
  documents: Map<string, LoadedMdcDocument>;
  errors: ValidationError[];
}

async function resolveGraphDocumentPath(
  context: GraphPathContext,
): Promise<string | undefined> {
  const { path, stateRoot, stateReal, active, documents, errors } = context;
  const symlinkBase = isWithin(stateRoot, path) ? stateRoot : stateReal;
  const symlink = await findSymlinkComponent(symlinkBase, path);
  if (symlink !== undefined) {
    errors.push({
      code: "graph.symlink",
      message: "state graph paths cannot contain symbolic links",
      document: path,
      path: symlink,
    });
    return undefined;
  }
  let canonical: string;
  try {
    canonical = await realpath(path);
  } catch (error) {
    errors.push({
      code: "graph.missing",
      message: (error as Error).message,
      document: path,
    });
    return undefined;
  }
  if (!isWithin(stateReal, canonical)) {
    errors.push({
      code: "graph.escape",
      message: "source resolves outside .state",
      document: path,
    });
    return undefined;
  }
  if (active.has(canonical)) {
    errors.push({
      code: "graph.cycle",
      message: "source cycle detected",
      document: path,
    });
    return undefined;
  }
  if (documents.has(canonical)) {
    errors.push({
      code: "graph.duplicate-path",
      message: "source document declared more than once",
      document: path,
    });
    return undefined;
  }
  return canonical;
}

async function readMdcDocument(
  canonical: string,
  errors: ValidationError[],
): Promise<MdcDocument | undefined> {
  try {
    const source = await readFile(canonical, "utf8");
    if (!source.startsWith("---\n"))
      throw new Error("frontmatter must start at byte zero");
    if (source.includes("\t")) throw new Error("tabs are not permitted");
    return parse(source);
  } catch (error) {
    errors.push({
      code: "mdc.parse",
      message: (error as Error).message,
      document: canonical,
    });
    return undefined;
  }
}

function decodeSource(
  node: MdcNode,
  document: string,
  errors: ValidationError[],
): { href: string; documentKind: string } | undefined {
  const annotations = node.annotations ?? {};
  const keys = Object.keys(annotations).sort();
  if (keys.some((key) => !["href", "documentKind"].includes(key)))
    errors.push({
      code: "source.unknown-field",
      message: "source has unknown fields",
      document,
      ref: node.ref,
    });
  const href = annotations.href;
  const documentKind = annotations.documentKind;
  if (typeof href !== "string" || typeof documentKind !== "string") {
    errors.push({
      code: "source.fields",
      message: "source requires href and documentKind",
      document,
      ref: node.ref,
    });
    return undefined;
  }
  if (!isSafeSource(href))
    errors.push({
      code: "source.path",
      message: `unsafe source path ${href}`,
      document,
      ref: node.ref,
    });
  const visible = plainText(node);
  if (visible !== href)
    errors.push({
      code: "source.display",
      message: "source display must equal href",
      document,
      ref: node.ref,
    });
  return isSafeSource(href) ? { href, documentKind } : undefined;
}

function projectRefFromStreamRef(ref: string): string | undefined {
  const match =
    /^(state:[a-z0-9]+(?:-[a-z0-9]+)*):work:[a-z0-9]+(?:-[a-z0-9]+)*$/.exec(
      ref,
    );
  return match?.[1];
}

function projectRefFromDocumentRef(
  ref: string,
  kind: string,
): string | undefined {
  if (!["environment", "traps"].includes(kind)) return undefined;
  const suffix = `:document:${kind}`;
  if (!ref.endsWith(suffix)) return undefined;
  const projectRef = ref.slice(0, -suffix.length);
  return REF.project.test(projectRef) ? projectRef : undefined;
}

function validateMdcEntityOwnership(params: {
  nodes: readonly MdcNode[];
  ownerRef: string;
  projectScoped: boolean;
  document: string;
  errors: ValidationError[];
}): void {
  const { nodes, ownerRef, projectScoped, document, errors } = params;
  const visit = (node: MdcNode): void => {
    if (node.type === "state.source") return;
    if (
      typeof node.ref === "string" &&
      node.ref !== ownerRef &&
      (!node.ref.startsWith(`${ownerRef}:`) ||
        (projectScoped && node.ref.startsWith(`${ownerRef}:work:`)))
    )
      errors.push({
        code: "graph.entity-owner",
        message: "entity ref does not belong to its document owner",
        document,
        ref: node.ref,
      });
    for (const child of node.children ?? []) visit(child);
  };
  for (const node of nodes) visit(node);
}

function assembleGraph(
  root: LoadedMdcDocument,
  documents: LoadedMdcDocument[],
): StateRecord {
  const entities = documents.flatMap((document) =>
    document.ast.children
      .filter((node) => node.type !== "state.source")
      .map((node) => decodeEntity(node, document.path)),
  );
  const projects = entities
    .filter((entity) => entity.type === "state.project")
    .map(({ type: _type, ...entity }) => entity);
  const streams = entities
    .filter((entity) => entity.type === "state.stream")
    .map(({ type: _type, ...entity }) => attachStream(entity, entities));
  const environment = entities
    .filter((entity) => entity.type === "state.environmentClaim")
    .map(({ type: _type, ...entity }) => entity);
  const traps = entities
    .filter((entity) => entity.type === "state.trap")
    .map(({ type: _type, ...entity }) => entity);
  if (root.kind === "project")
    return {
      schemaVersion: 1,
      kind: "project",
      project: projects[0],
      streams,
      environment,
      traps,
    };
  const stream = streams.find((candidate) => candidate.ref === root.ref);
  return {
    schemaVersion: 1,
    kind: "stream",
    projectRef: stream?.projectRef,
    stream,
    environment,
    traps,
  };
}

function attachStream(
  stream: StateRecord,
  entities: StateRecord[],
): StateRecord {
  const workRef = String(stream.ref);
  const owned = entities.filter(
    (entity) =>
      typeof entity.ref === "string" &&
      (entity.ref === workRef || entity.ref.startsWith(`${workRef}:`)),
  );
  const mapping = CHILD_FIELDS["state.stream"];
  for (const [type, field] of Object.entries(mapping)) {
    const linked = owned
      .filter((entity) => entity.type === type)
      .map(({ type: _type, ...entity }) => entity);
    if (ENTITY_RULES["state.stream"].fields[field]?.kind === "array") {
      const nested = stream[field];
      if (nested === undefined) stream[field] = linked;
      else if (Array.isArray(nested)) stream[field] = [...nested, ...linked];
    } else if (stream[field] === undefined && linked[0] !== undefined)
      stream[field] = linked[0];
  }
  return stream;
}

function decodeEntity(node: MdcNode, document: string): StateRecord {
  const rule = ENTITY_RULES[node.type];
  if (rule === undefined)
    throw new StateValidationFailure([
      {
        code: "entity.type",
        message: `unknown entity type ${node.type}`,
        document,
        ref: node.ref,
      },
    ]);
  const entity: StateRecord = {
    type: node.type,
    ref: node.ref,
    ...(node.annotations ?? {}),
  };
  const display = plainText(node);
  if (rule.display.startsWith("literal:")) {
    if (display !== rule.display.slice(8))
      throw new StateValidationFailure([
        {
          code: "entity.display",
          message: "invalid literal display",
          document,
          ref: node.ref,
        },
      ]);
  } else if (rule.display.includes(".")) {
    const [outer, inner] = rule.display.split(".");
    const nested = entity[outer];
    if (typeof nested !== "object" || nested === null)
      entity[outer] = { [inner]: display };
    else (nested as StateRecord)[inner] = display;
  } else entity[rule.display] = display;
  if (node.type === "state.record") normalizeRecordRelationships(entity);
  for (const child of node.children ?? []) {
    const childEntity = decodeEntity(child, document);
    const field = CHILD_FIELDS[node.type]?.[child.type];
    if (field === undefined)
      throw new StateValidationFailure([
        {
          code: "entity.containment",
          message: `${child.type} cannot be owned by ${node.type}`,
          document,
          ref: child.ref,
        },
      ]);
    if (
      [
        "charter",
        "continuation",
        "review",
        "submission",
        "completion",
        "promotion",
      ].includes(field)
    )
      entity[field] = stripType(childEntity);
    else {
      const collection = Array.isArray(entity[field])
        ? (entity[field] as StateRecord[])
        : [];
      collection.push(stripType(childEntity));
      entity[field] = collection;
    }
  }
  return entity;
}

function normalizeRecordRelationships(record: StateRecord): void {
  const statements = arrayValue(record.relationshipStatements).filter(isRecord);
  for (const relation of ["affects", "invalidates", "preserves"] as const) {
    const refs: string[] = [];
    for (const value of arrayValue(record[relation])) {
      if (typeof value !== "string") continue;
      if (value.startsWith("state:")) refs.push(value);
      else
        statements.push({
          ref: `${String(record.ref)}:statement:${relation}-${createHash(
            "sha256",
          )
            .update(value)
            .digest("hex")
            .slice(0, 12)}`,
          text: value,
          relation,
        });
    }
    record[relation] = refs;
  }
  record.relationshipStatements = statements;
}

function stripType(entity: StateRecord): StateRecord {
  const { type: _type, ...value } = entity;
  return value;
}

function plainText(node: MdcNode): string {
  if (
    node.content?.length !== 1 ||
    node.content[0].type !== "text" ||
    typeof node.content[0].text !== "string" ||
    (node.content[0].formats?.length ?? 0) > 0 ||
    node.content[0].annotations !== undefined
  )
    return "";
  return node.content[0].text.trim();
}

function validateDashboard(
  value: unknown,
  document: string,
  errors: ValidationError[],
): void {
  validateSchemaStructure(value, document, errors);
  const root = validateDashboardRoot(value, document, errors);
  if (root === undefined) return;
  validateRule(root.value, root.rule, document, "$", errors);
  validateDashboardEntities(root.value, root.kind, document, errors);
  validateDirectStreamKnowledge(root.value, root.kind, document, errors);
  validateDashboardOwnership(root.value, document, errors);
  validateReferences(root.value, document, errors);
  validateLifecycle(root.value, document, errors);
}

function validateDashboardRoot(
  value: unknown,
  document: string,
  errors: ValidationError[],
): { value: StateRecord; kind: string; rule: FieldRule } | undefined {
  if (!isRecord(value)) {
    errors.push({
      code: "schema.type",
      message: "dashboard input must be an object",
      document,
    });
    return;
  }
  const kind = value.kind;
  const rule = typeof kind === "string" ? ROOT_RULES[kind] : undefined;
  if (rule === undefined) {
    errors.push({
      code: "schema.kind",
      message: "kind must be project or stream",
      document,
      path: "kind",
    });
    return;
  }
  return { value, kind, rule };
}

function validateDashboardEntities(
  value: StateRecord,
  kind: string,
  document: string,
  errors: ValidationError[],
): void {
  if (kind === "project" && isRecord(value.project))
    validateEntityObject(
      "state.project",
      value.project,
      document,
      "$.project",
      errors,
    );
  if (kind === "stream" && isRecord(value.stream))
    validateEntityObject(
      "state.stream",
      value.stream,
      document,
      "$.stream",
      errors,
    );
  for (const stream of arrayValue(value.streams))
    if (isRecord(stream))
      validateEntityObject(
        "state.stream",
        stream,
        document,
        "$.streams[]",
        errors,
      );
  for (const item of arrayValue(value.environment))
    if (isRecord(item))
      validateEntityObject(
        "state.environmentClaim",
        item,
        document,
        "$.environment[]",
        errors,
      );
  for (const item of arrayValue(value.traps))
    if (isRecord(item))
      validateEntityObject("state.trap", item, document, "$.traps[]", errors);
}

function validateDirectStreamKnowledge(
  value: StateRecord,
  kind: string,
  document: string,
  errors: ValidationError[],
): void {
  if (
    kind !== "stream" ||
    (arrayValue(value.environment).length === 0 &&
      arrayValue(value.traps).length === 0)
  )
    return;
  errors.push({
    code: "stream.project-knowledge",
    message: "direct stream documents have empty environment and traps arrays",
    document,
  });
}

type JsonSchema = Record<string, unknown>;
type SchemaFinding = { code: string; message: string; path: string };

function validateSchemaStructure(
  value: unknown,
  document: string,
  errors: ValidationError[],
): void {
  const findings: SchemaFinding[] = [];
  validateSchemaValue(
    value,
    STATE_MODEL_V1_SCHEMA,
    STATE_MODEL_V1_SCHEMA,
    "$",
    findings,
  );
  for (const finding of findings) errors.push({ ...finding, document });
}

function validateSchemaValue(
  value: unknown,
  schema: JsonSchema,
  root: JsonSchema,
  path: string,
  errors: SchemaFinding[],
): void {
  if (validateSchemaReferenceOrUnion(value, schema, root, path, errors)) return;
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push({
      code: "schema.enum",
      message: "value is outside the allowed enum",
      path,
    });
    return;
  }
  if (validateSchemaScalar(value, schema, path, errors)) return;
  if (schema.type === "array")
    validateSchemaArray(value, schema, root, path, errors);
  else if (schema.type === "object")
    validateSchemaObject(value, schema, root, path, errors);
}

function validateSchemaReferenceOrUnion(
  value: unknown,
  schema: JsonSchema,
  root: JsonSchema,
  path: string,
  errors: SchemaFinding[],
): boolean {
  if (typeof schema.$ref === "string") {
    validateSchemaValue(
      value,
      resolveSchemaReference(root, schema.$ref),
      root,
      path,
      errors,
    );
    return true;
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((candidate) =>
      matchesSchemaValue(value, candidate as JsonSchema, root),
    );
    if (matches.length !== 1) {
      errors.push({
        code: "schema.union",
        message: "value must match exactly one document variant",
        path,
      });
      return true;
    }
    validateSchemaValue(value, matches[0] as JsonSchema, root, path, errors);
    return true;
  }
  if (Array.isArray(schema.anyOf)) {
    const match = schema.anyOf.find((candidate) =>
      matchesSchemaValue(value, candidate as JsonSchema, root),
    );
    if (match === undefined) {
      errors.push({
        code: "schema.union",
        message: "value is outside the allowed variants",
        path,
      });
      return true;
    }
    validateSchemaValue(value, match as JsonSchema, root, path, errors);
    return true;
  }
  return false;
}

function validateSchemaScalar(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: SchemaFinding[],
): boolean {
  if (schema.type === "string") {
    if (typeof value !== "string") {
      errors.push({ code: "schema.type", message: "expected string", path });
      return true;
    }
    if (
      typeof schema.pattern === "string" &&
      !new RegExp(schema.pattern).test(value)
    )
      errors.push({
        code: "schema.pattern",
        message: "string does not match the required pattern",
        path,
      });
    return true;
  }
  if (schema.type === "integer") {
    if (!Number.isInteger(value)) {
      errors.push({ code: "schema.type", message: "expected integer", path });
      return true;
    }
    if (
      typeof schema.minimum === "number" &&
      (value as number) < schema.minimum
    )
      errors.push({
        code: "schema.minimum",
        message: `value must be at least ${schema.minimum}`,
        path,
      });
    return true;
  }
  if (schema.type === "boolean") {
    if (typeof value !== "boolean")
      errors.push({ code: "schema.type", message: "expected boolean", path });
    return true;
  }
  return false;
}

function validateSchemaArray(
  value: unknown,
  schema: JsonSchema,
  root: JsonSchema,
  path: string,
  errors: SchemaFinding[],
): void {
  if (!Array.isArray(value)) {
    errors.push({ code: "schema.type", message: "expected array", path });
    return;
  }
  if (typeof schema.maxItems === "number" && value.length > schema.maxItems)
    errors.push({
      code: "schema.maximum",
      message: `array must contain at most ${schema.maxItems} items`,
      path,
    });
  if (isRecord(schema.items))
    value.forEach((item, index) =>
      validateSchemaValue(
        item,
        schema.items as JsonSchema,
        root,
        `${path}[${index}]`,
        errors,
      ),
    );
}

function validateSchemaObject(
  value: unknown,
  schema: JsonSchema,
  root: JsonSchema,
  path: string,
  errors: SchemaFinding[],
): void {
  if (!isRecord(value)) {
    errors.push({ code: "schema.type", message: "expected object", path });
    return;
  }
  const properties = isRecord(schema.properties)
    ? (schema.properties as Record<string, JsonSchema>)
    : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((key): key is string => typeof key === "string")
    : [];
  for (const key of required)
    if (!(key in value))
      errors.push({
        code: "schema.required",
        message: `missing field ${key}`,
        path: `${path}.${key}`,
      });
  if (schema.additionalProperties === false)
    for (const key of Object.keys(value))
      if (!(key in properties))
        errors.push({
          code: "schema.unknown-field",
          message: `unknown field ${key}`,
          path: `${path}.${key}`,
        });
  for (const [key, child] of Object.entries(value))
    if (properties[key] !== undefined)
      validateSchemaValue(
        child,
        properties[key],
        root,
        `${path}.${key}`,
        errors,
      );
}

function matchesSchemaValue(
  value: unknown,
  schema: JsonSchema,
  root: JsonSchema,
): boolean {
  const errors: SchemaFinding[] = [];
  validateSchemaValue(value, schema, root, "$", errors);
  return errors.length === 0;
}

function resolveSchemaReference(
  root: JsonSchema,
  reference: string,
): JsonSchema {
  let value: unknown = root;
  for (const key of reference.replace(/^#\//, "").split("/"))
    value = isRecord(value) ? value[key] : undefined;
  return isRecord(value) ? value : {};
}

function validateDashboardOwnership(
  value: StateRecord,
  document: string,
  errors: ValidationError[],
): void {
  if (value.kind === "project" && isRecord(value.project)) {
    const projectRef = value.project.ref;
    if (typeof projectRef === "string") {
      for (const [node, path] of [
        [value.project, "$.project"],
        [value.environment, "$.environment"],
        [value.traps, "$.traps"],
      ] as const)
        validateOwnedTree({
          node,
          ownerRef: projectRef,
          path,
          projectScoped: true,
          document,
          errors,
        });
      for (const stream of arrayValue(value.streams))
        if (isRecord(stream)) {
          if (
            typeof stream.ref === "string" &&
            !stream.ref.startsWith(`${projectRef}:work:`)
          )
            errors.push({
              code: "ref.cross-work",
              message: "stream ref does not belong to the project",
              document,
              ref: stream.ref,
              path: "$.streams[]",
            });
          validateStreamOwnership({
            stream,
            path: "$.streams[]",
            document,
            errors,
          });
        }
    }
  } else if (value.kind === "stream" && isRecord(value.stream))
    validateStreamOwnership({
      stream: value.stream,
      path: "$.stream",
      document,
      errors,
    });
}

function validateOwnedTree(params: {
  node: unknown;
  ownerRef: string;
  path: string;
  projectScoped: boolean;
  document: string;
  errors: ValidationError[];
}): void {
  const { node, ownerRef, path, projectScoped, document, errors } = params;
  if (Array.isArray(node)) {
    node.forEach((item, index) =>
      validateOwnedTree({ ...params, node: item, path: `${path}[${index}]` }),
    );
    return;
  }
  if (!isRecord(node)) return;
  if (
    typeof node.ref === "string" &&
    node.ref !== ownerRef &&
    (!node.ref.startsWith(`${ownerRef}:`) ||
      (projectScoped && node.ref.startsWith(`${ownerRef}:work:`)))
  )
    errors.push({
      code: "ref.cross-work",
      message: `entity ref does not belong to ${ownerRef}`,
      document,
      ref: node.ref,
      path,
    });
  for (const [key, child] of Object.entries(node))
    if (key !== "locator" && key !== "provenance" && key !== "inputs")
      validateOwnedTree({
        ...params,
        node: child,
        path: `${path}.${key}`,
      });
}

function validateStreamOwnership(params: {
  stream: StateRecord;
  path: string;
  document: string;
  errors: ValidationError[];
}): void {
  const { stream, path, document, errors } = params;
  if (typeof stream.ref !== "string") return;
  const projectRef = projectRefFromStreamRef(stream.ref);
  if (projectRef === undefined || stream.projectRef !== projectRef)
    errors.push({
      code: "ref.cross-work",
      message: "stream ref and projectRef must identify the same project",
      document,
      ref: stream.ref,
      path,
    });
  validateOwnedTree({
    node: stream,
    ownerRef: stream.ref,
    path,
    projectScoped: false,
    document,
    errors,
  });
}

function validateEntityObject(
  type: string,
  value: StateRecord,
  document: string,
  path: string,
  errors: ValidationError[],
): void {
  const rule = ENTITY_RULES[type];
  validateRule(value, object(entityFields(rule)), document, path, errors);
  if (typeof value.ref === "string" && !rule.ref.test(value.ref))
    errors.push({
      code: "ref.grammar",
      message: `invalid ${type} ref`,
      document,
      ref: value.ref,
      path: `${path}.ref`,
    });
  validateEntityChildren(type, value, document, path, errors);
  validateEntityInvariants(type, value, document, path, errors);
}

function entityFields(rule: EntityRule): Record<string, FieldRule> {
  const display = rule.display.startsWith("literal:")
    ? undefined
    : rule.display.split(".")[0];
  return {
    ref: text(),
    ...rule.fields,
    ...(display === undefined
      ? {}
      : { [display]: display === "locator" ? LOCATOR : text() }),
  };
}

function validateEntityChildren(
  type: string,
  value: StateRecord,
  document: string,
  path: string,
  errors: ValidationError[],
): void {
  const nested: Record<string, string> = {};
  for (const [childType, field] of Object.entries(CHILD_FIELDS[type] ?? {}))
    nested[field] = childType;
  for (const [field, childType] of Object.entries(nested)) {
    const child = value[field];
    if (Array.isArray(child)) {
      for (const item of child)
        if (isRecord(item))
          validateEntityObject(
            childType,
            item,
            document,
            `${path}.${field}[]`,
            errors,
          );
    } else if (isRecord(child))
      validateEntityObject(
        childType,
        child,
        document,
        `${path}.${field}`,
        errors,
      );
  }
}

function validateRule(
  value: unknown,
  rule: FieldRule,
  document: string,
  path: string,
  errors: ValidationError[],
): void {
  if (rule.kind === "object")
    validateObjectRule(value, rule, document, path, errors);
  else if (rule.kind === "array")
    validateArrayRule(value, rule, document, path, errors);
  else validateScalarRule(value, rule, document, path, errors);
}

function validateObjectRule(
  value: unknown,
  rule: FieldRule,
  document: string,
  path: string,
  errors: ValidationError[],
): void {
  if (!isRecord(value)) {
    errors.push({
      code: "schema.type",
      message: "expected object",
      document,
      path,
    });
    return;
  }
  const fields = rule.fields ?? {};
  if (Object.keys(fields).length === 0) return;
  for (const key of Object.keys(value))
    if (!(key in fields))
      errors.push({
        code: "schema.unknown-field",
        message: `unknown field ${key}`,
        document,
        path: `${path}.${key}`,
      });
  for (const [key, childRule] of Object.entries(fields)) {
    if (!(key in value)) {
      if (!childRule.optional)
        errors.push({
          code: "schema.required",
          message: `missing field ${key}`,
          document,
          path: `${path}.${key}`,
        });
    } else
      validateRule(value[key], childRule, document, `${path}.${key}`, errors);
  }
}

function validateArrayRule(
  value: unknown,
  rule: FieldRule,
  document: string,
  path: string,
  errors: ValidationError[],
): void {
  if (!Array.isArray(value)) {
    errors.push({
      code: "schema.type",
      message: "expected array",
      document,
      path,
    });
    return;
  }
  value.forEach((item, index) =>
    validateRule(
      item,
      rule.item ?? text(),
      document,
      `${path}[${index}]`,
      errors,
    ),
  );
}

function validateScalarRule(
  value: unknown,
  rule: FieldRule,
  document: string,
  path: string,
  errors: ValidationError[],
): void {
  const matches =
    rule.kind === "integer"
      ? Number.isInteger(value)
      : typeof value === rule.kind;
  if (!matches)
    errors.push({
      code: "schema.type",
      message: `expected ${rule.kind}`,
      document,
      path,
    });
  else if (
    rule.values !== undefined &&
    !rule.values.some((candidate) => candidate === value)
  )
    errors.push({
      code: "schema.enum",
      message: "value is outside the allowed enum",
      document,
      path,
    });
  else if (
    typeof value === "number" &&
    rule.minimum !== undefined &&
    value < rule.minimum
  )
    errors.push({
      code: "schema.minimum",
      message: `value must be at least ${rule.minimum}`,
      document,
      path,
    });
  else if (typeof value === "string" && value.length === 0)
    errors.push({
      code: "schema.empty",
      message: "string must not be empty",
      document,
      path,
    });
}

function validateEntityInvariants(
  type: string,
  value: StateRecord,
  document: string,
  path: string,
  errors: ValidationError[],
): void {
  const add = (code: string, message: string): void =>
    errors.push({
      code,
      message,
      document,
      ref: typeof value.ref === "string" ? value.ref : undefined,
      path,
    });
  if (type === "state.task") validateTaskEntity(value, add);
  if (type === "state.question") validateQuestionEntity(value, add);
  if (type === "state.finding") validateFindingEntity(value, add);
  if (type === "state.reviewArea") validateReviewAreaEntity(value, add);
  if (type === "state.pullRequest") validatePullRequestEntity(value, add);
  if (type === "state.record") validateRecordEntity(value, add);
  if (type === "state.evidence") validateEvidenceEntity(value, add);
  if (
    ["state.environmentClaim", "state.trap"].includes(type) &&
    arrayValue(value.evidence).length === 0
  )
    add(
      "knowledge.evidence",
      "environment claims and traps require tied evidence",
    );
}

type EntityErrorAdder = (code: string, message: string) => void;

function validateTaskEntity(value: StateRecord, add: EntityErrorAdder): void {
  if (value.status === "done" && arrayValue(value.evidence).length === 0)
    add("task.done-evidence", "done task requires evidence");
  if (
    value.status === "failed" &&
    (!isRecord(value.attempt) ||
      value.attempt.outcome !== "fail" ||
      (value.retry === undefined && value.disposition === undefined))
  )
    add(
      "task.failed",
      "failed task requires failed attempt and retry or disposition",
    );
  if (value.status === "blocked" && value.unblock === undefined)
    add("task.unblock", "blocked task requires unblock");
  if (value.status === "cancelled" && value.required === true)
    add("task.cancelled-required", "required task cannot be cancelled");
}

function validateQuestionEntity(
  value: StateRecord,
  add: EntityErrorAdder,
): void {
  if ((value.resolvedAt === undefined) !== (value.answer === undefined))
    add("question.resolution", "resolvedAt and answer must appear together");
}

function validateFindingEntity(
  value: StateRecord,
  add: EntityErrorAdder,
): void {
  const disposition = ["acknowledged", "skipped"].includes(
    String(value.status),
  );
  if (
    disposition &&
    (value.owner === undefined ||
      value.rationale === undefined ||
      value.recheckCondition === undefined)
  )
    add(
      "finding.disposition",
      "acknowledged or skipped finding requires owner, rationale, and recheckCondition",
    );
  if (
    disposition &&
    ["critical", "high"].includes(String(value.severity)) &&
    (!isRecord(value.riskAcceptance) ||
      (value.riskAcceptance.revision === undefined &&
        value.riskAcceptance.hash === undefined))
  )
    add(
      "finding.risk-acceptance",
      "acknowledged or skipped critical and high findings require a revision-bound riskAcceptance locator",
    );
}

function validateReviewAreaEntity(
  value: StateRecord,
  add: EntityErrorAdder,
): void {
  if (typeof value.area !== "string") return;
  const marker = `:finding:${value.area}:`;
  for (const finding of arrayValue(value.findings))
    if (isRecord(finding) && typeof finding.ref === "string") {
      const markerIndex = finding.ref.indexOf(marker);
      const slug =
        markerIndex < 0 ? "" : finding.ref.slice(markerIndex + marker.length);
      if (markerIndex < 0 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
        add(
          "finding.area-ref",
          "finding ref must contain its owning review area and a canonical slug",
        );
    }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(
      String(value.reviewedAt),
    )
  )
    add(
      "review-area.reviewed-at",
      "reviewedAt must be an ISO8601 UTC timestamp",
    );
  if (arrayValue(value.reviewedTaskRefs).length === 0)
    add(
      "review-area.scope",
      "reviewedTaskRefs must identify at least one reviewed task",
    );
  if (!/^[a-f0-9]{64}$/.test(String(value.taskDefinitionHash)))
    add(
      "review-area.task-hash",
      "taskDefinitionHash must be a lowercase SHA-256 digest",
    );
}

function validatePullRequestEntity(
  value: StateRecord,
  add: EntityErrorAdder,
): void {
  if ((value.status === "merged") !== (value.mergedRevision !== undefined))
    add(
      "submission.merge",
      "mergedRevision exists exactly for merged pull requests",
    );
}

function validateRecordEntity(value: StateRecord, add: EntityErrorAdder): void {
  const statuses: Record<string, readonly string[]> = {
    proposal: ["open", "accepted", "rejected", "withdrawn"],
    change: ["pending", "applied", "reverted", "superseded"],
    decision: ["proposed", "accepted", "rejected", "superseded"],
    design: ["draft", "approved", "implemented", "promoted", "superseded"],
  };
  if (
    typeof value.kind !== "string" ||
    !statuses[value.kind]?.includes(String(value.status))
  )
    add("record.status", "record status is invalid for its kind");
  if (
    arrayValue(value.relationshipStatements).some(
      (statement) => isRecord(statement) && statement.relation === undefined,
    )
  )
    add(
      "record.relationship-statement",
      "record relationship statements require a relation",
    );
}

function validateEvidenceEntity(
  value: StateRecord,
  add: EntityErrorAdder,
): void {
  if (!isRecord(value.locator)) return;
  const uri = value.locator.uri;
  if (
    typeof uri === "string" &&
    !/^https?:\/\//.test(uri) &&
    value.locator.revision === undefined &&
    value.locator.hash === undefined
  )
    add(
      "evidence.revision",
      "repository evidence requires locator revision or hash",
    );
}

function validateReferences(
  value: StateRecord,
  document: string,
  errors: ValidationError[],
): void {
  const refs = new Map<string, string>();
  const relationships: ReferenceRelationship[] = [];
  collectReferences(value, "$", refs, relationships, document, errors);
  validateRootReferences(value, document, errors);
  validateRelationshipTargets(refs, relationships, document, errors);
  validateCrossProjectReferences(value, relationships, document, errors);
}

interface ReferenceRelationship {
  ref: string;
  path: string;
  expected?: RegExp;
}

function collectReferences(
  node: unknown,
  path: string,
  refs: Map<string, string>,
  relationships: ReferenceRelationship[],
  document: string,
  errors: ValidationError[],
): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) =>
      collectReferences(
        item,
        `${path}[${index}]`,
        refs,
        relationships,
        document,
        errors,
      ),
    );
    return;
  }
  if (!isRecord(node)) return;
  if (typeof node.ref === "string") {
    if (refs.has(node.ref))
      errors.push({
        code: "ref.duplicate",
        message: "duplicate ref",
        document,
        ref: node.ref,
        path,
      });
    else refs.set(node.ref, path);
  }
  collectNodeRelationships(node, path, relationships);
  for (const [key, child] of Object.entries(node))
    if (key !== "locator" && key !== "provenance" && key !== "inputs")
      collectReferences(
        child,
        `${path}.${key}`,
        refs,
        relationships,
        document,
        errors,
      );
}

function collectNodeRelationships(
  node: StateRecord,
  path: string,
  relationships: ReferenceRelationship[],
): void {
  const scalar: Record<string, RegExp | undefined> = {
    parentRef: /:task:[A-Z]{3}(?:\d{2})?$/,
    targetRef: undefined,
    originRef: /:record:/,
    decisionRef: /:record:decision:/,
    subjectRef: undefined,
  };
  for (const [key, expected] of Object.entries(scalar))
    if (typeof node[key] === "string")
      relationships.push({
        ref: node[key] as string,
        path: `${path}.${key}`,
        expected,
      });
  const arrays: Record<string, RegExp | undefined> = {
    dependsOn: /:task:[A-Z]{3}(?:\d{2})?$/,
    acceptanceRefs: /:sc:[1-9]\d*$/,
    taskRefs: /:task:[A-Z]{3}(?:\d{2})?$/,
    evidenceRefs: /:evidence:/,
    invalidates: undefined,
    supersedes: /:record:/,
    affects: undefined,
    preserves: undefined,
  };
  for (const [key, expected] of Object.entries(arrays))
    for (const ref of arrayValue(node[key]))
      if (typeof ref === "string")
        relationships.push({ ref, path: `${path}.${key}`, expected });
}

function validateRootReferences(
  value: StateRecord,
  document: string,
  errors: ValidationError[],
): void {
  if (value.kind === "project" && isRecord(value.project)) {
    for (const stream of arrayValue(value.streams))
      if (isRecord(stream) && stream.projectRef !== value.project.ref)
        errors.push({
          code: "ref.project",
          message: "stream projectRef must equal project ref",
          document,
          ref: typeof stream.ref === "string" ? stream.ref : undefined,
        });
  }
  if (
    value.kind === "stream" &&
    isRecord(value.stream) &&
    value.stream.projectRef !== value.projectRef
  )
    errors.push({
      code: "ref.project",
      message: "stream projectRef must equal root projectRef",
      document,
      ref: typeof value.stream.ref === "string" ? value.stream.ref : undefined,
    });
}

function validateRelationshipTargets(
  refs: Map<string, string>,
  relationships: ReferenceRelationship[],
  document: string,
  errors: ValidationError[],
): void {
  for (const relation of relationships)
    if (!refs.has(relation.ref))
      errors.push({
        code: "ref.dangling",
        message: `dangling ref ${relation.ref}`,
        document,
        ref: relation.ref,
        path: relation.path,
      });
    else if (
      relation.expected !== undefined &&
      !relation.expected.test(relation.ref)
    )
      errors.push({
        code: "ref.type",
        message: `relationship resolves to the wrong entity type: ${relation.ref}`,
        document,
        ref: relation.ref,
        path: relation.path,
      });
}

function validateCrossProjectReferences(
  value: StateRecord,
  relationships: ReferenceRelationship[],
  document: string,
  errors: ValidationError[],
): void {
  const projectRef =
    value.kind === "project" && isRecord(value.project)
      ? value.project.ref
      : value.projectRef;
  if (typeof projectRef === "string")
    for (const relation of relationships)
      if (
        relation.ref !== projectRef &&
        !relation.ref.startsWith(`${projectRef}:`)
      )
        errors.push({
          code: "ref.cross-project",
          message: `relationship crosses projects: ${relation.ref}`,
          document,
          ref: relation.ref,
          path: relation.path,
        });
}

function validateLifecycle(
  value: StateRecord,
  document: string,
  errors: ValidationError[],
): void {
  const streams =
    value.kind === "project"
      ? arrayValue(value.streams).filter(isRecord)
      : isRecord(value.stream)
        ? [value.stream]
        : [];
  if (
    value.kind === "project" &&
    streams.filter((stream) =>
      ["working", "reviewing"].includes(String(stream.phase)),
    ).length > 1
  )
    errors.push({
      code: "project.active-stream",
      message: "project root cannot contain more than one active stream",
      document,
      path: "$.streams",
    });
  for (const stream of streams)
    validateStreamLifecycle(stream, document, errors);
}

function validateStreamLifecycle(
  stream: StateRecord,
  document: string,
  errors: ValidationError[],
): void {
  const streamRef = typeof stream.ref === "string" ? stream.ref : undefined;
  const add = (code: string, message: string): void =>
    errors.push({ code, message, document, ref: streamRef });
  validateCharterLifecycle(stream, add);
  validateReviewLifecycle(stream, document, errors, add);
  const tasks = arrayValue(stream.tasks).filter(isRecord);
  validateTaskGraph(tasks, document, streamRef, errors);
  validatePhaseLifecycle(stream, tasks, add);
  validateCompletionLifecycle(stream, add);
  validateRevisions(stream, document, errors);
  validateEvents(stream, document, errors);
}

type StreamErrorAdder = (code: string, message: string) => void;

function validateCharterLifecycle(
  stream: StateRecord,
  add: StreamErrorAdder,
): void {
  const charter = isRecord(stream.charter) ? stream.charter : undefined;
  if (stream.charterStatus === "absent" && charter !== undefined)
    add("charter.unexpected", "absent charterStatus cannot include charter");
  if (stream.charterStatus !== "absent" && charter === undefined)
    add(
      "charter.required",
      "approved or reconstructed stream requires charter",
    );
  if (charter !== undefined) {
    if (stream.charterRevision !== charter.revision)
      add(
        "charter.revision-mismatch",
        "stream charterRevision must equal charter revision",
      );
    const criteria = arrayValue(charter.successCriteria).filter(isRecord);
    if (criteria.some((criterion, index) => criterion.id !== `SC-${index + 1}`))
      add(
        "charter.criteria",
        "success criteria must be unique and contiguous from SC-1",
      );
  }
}

function validateReviewLifecycle(
  stream: StateRecord,
  document: string,
  errors: ValidationError[],
  add: StreamErrorAdder,
): void {
  if (!isRecord(stream.review)) return;
  const reviewAreas = arrayValue(stream.review.areas).filter(isRecord);
  const reviewTasks = arrayValue(stream.tasks).filter(isRecord);
  const reviewEvents = arrayValue(stream.events).filter(isRecord);
  const tasksByRef = new Map(reviewTasks.map((task) => [task.ref, task]));
  for (const area of reviewAreas) {
    validateEntityObject(
      "state.reviewArea",
      area,
      document,
      "$.stream.review.areas[]",
      errors,
    );
    validateReviewAreaLifecycle(stream, area, tasksByRef, reviewEvents, add);
  }
  validateReviewAreaSet(reviewAreas, add);
}

function validateReviewAreaLifecycle(
  stream: StateRecord,
  area: StateRecord,
  tasksByRef: Map<unknown, StateRecord>,
  reviewEvents: StateRecord[],
  add: StreamErrorAdder,
): void {
  const reviewedTaskRefs = arrayValue(area.reviewedTaskRefs);
  const scopedTasks = reviewedTaskRefs
    .map((ref) => tasksByRef.get(ref))
    .filter(isRecord);
  if (
    typeof area.reviewedRevision === "number" &&
    typeof stream.stateRevision === "number" &&
    area.reviewedRevision > stream.stateRevision
  )
    add(
      "review-area.future-revision",
      "reviewedRevision cannot exceed the containing stream stateRevision",
    );
  const staleReview =
    isRecord(area.validity) && area.validity.state === "stale";
  if (
    scopedTasks.length === reviewedTaskRefs.length &&
    area.taskDefinitionHash !== taskDefinitionHash(scopedTasks) &&
    !staleReview
  )
    add(
      "review-area.task-hash-mismatch",
      "taskDefinitionHash must match the reviewed task definitions",
    );
  const reviewedRefs = new Set([area.ref, ...reviewedTaskRefs]);
  if (
    typeof area.reviewedRevision === "number" &&
    reviewEvents.some(
      (event) =>
        typeof event.stateRevision === "number" &&
        event.stateRevision > area.reviewedRevision &&
        arrayValue(event.invalidates).some((ref) => reviewedRefs.has(ref)),
    ) &&
    !staleReview
  )
    add(
      "review-area.invalidated",
      "a later event invalidates the reviewed area or task scope",
    );
}

function validateReviewAreaSet(
  reviewAreas: StateRecord[],
  add: StreamErrorAdder,
): void {
  const canonical = [
    "alignment",
    "correctness",
    "security",
    "quality",
    "testing",
    "docs",
    "style",
  ];
  const areas = reviewAreas.map((area) => area.area);
  if (
    canonical.some(
      (area) => areas.filter((candidate) => candidate === area).length !== 1,
    ) ||
    areas.some(
      (area) =>
        typeof area !== "string" ||
        (!canonical.includes(area) && !/^[a-z0-9-]+:[a-z0-9-]+$/.test(area)),
    )
  )
    add(
      "review.areas",
      "review requires every canonical area once and namespaced extensions",
    );
}

function validatePhaseLifecycle(
  stream: StateRecord,
  tasks: StateRecord[],
  add: StreamErrorAdder,
): void {
  const leaves = tasks.filter(
    (task) => !tasks.some((candidate) => candidate.parentRef === task.ref),
  );
  const requiredLeaves = leaves.filter((task) => task.required === true);
  if (
    stream.phase === "planned" &&
    tasks.some((task) => task.status !== "planned")
  )
    add(
      "phase.planned-execution",
      "planned stream cannot contain execution status",
    );
  if (stream.phase === "working") {
    if (
      !tasks.some(
        (task) => task.status === "working" && typeof task.owner === "string",
      )
    )
      add("phase.owner", "working stream requires an owned working task");
    if (!requiredLeaves.some((task) => isRunnable(task, tasks)))
      add("phase.runnable", "working stream requires a runnable required leaf");
  }
  if (
    ["planned", "working"].includes(String(stream.phase)) &&
    stream.blockedOn !== undefined &&
    (requiredLeaves.every((task) => task.status === "done") ||
      requiredLeaves.some((task) => isRunnable(task, tasks)))
  )
    add(
      "phase.blocked",
      "blocked stream requires remaining work with no runnable required leaf",
    );
  if (["reviewing", "completed", "archived"].includes(String(stream.phase))) {
    if (requiredLeaves.some((task) => task.status !== "done"))
      add(
        "phase.required-task",
        "reviewing or later requires every required leaf done",
      );
    if (!isRecord(stream.submission) || !isValidSubmission(stream.submission))
      add("phase.submission", "reviewing or later requires a valid submission");
  }
}

function validateCompletionLifecycle(
  stream: StateRecord,
  add: StreamErrorAdder,
): void {
  if (["completed", "archived"].includes(String(stream.phase))) {
    if (!isRecord(stream.completion) || !isValidCompletion(stream.completion))
      add(
        "phase.completion",
        "completed or archived requires a valid completion receipt",
      );
    if (
      isRecord(stream.completion) &&
      !hasDecisionDispositions(stream, stream.completion)
    )
      add(
        "completion.decisions",
        "completion requires a disposition for every accepted decision",
      );
  }
}

function validateTaskGraph(
  tasks: StateRecord[],
  document: string,
  streamRef: string | undefined,
  errors: ValidationError[],
): void {
  const byRef = new Map(
    tasks
      .filter(
        (task): task is StateRecord & { ref: string } =>
          typeof task.ref === "string",
      )
      .map((task) => [task.ref, task]),
  );
  const add = (code: string, message: string, ref?: string): void =>
    errors.push({ code, message, document, ref: ref ?? streamRef });
  for (const task of tasks) validateTaskStructure(task, tasks, byRef, add);
  validateTaskCycles(byRef, add);
}

type TaskErrorAdder = (code: string, message: string, ref?: string) => void;

function validateTaskStructure(
  task: StateRecord,
  tasks: StateRecord[],
  byRef: Map<string, StateRecord>,
  add: TaskErrorAdder,
): void {
  const ref = typeof task.ref === "string" ? task.ref : undefined;
  if (task.parentRef === undefined) validateParentTask(task, byRef, add, ref);
  else validateChildTask(task, byRef, add, ref);
  if (
    tasks.some((candidate) => candidate.parentRef === task.ref) &&
    (task.owner !== undefined || task.attempt !== undefined)
  )
    add(
      "task.parent-execution",
      "parent task roll-ups cannot carry execution ownership or attempts",
      ref,
    );
}

function validateParentTask(
  task: StateRecord,
  byRef: Map<string, StateRecord>,
  add: TaskErrorAdder,
  ref?: string,
): void {
  if (!/^[A-Z]{3}$/.test(typeof task.id === "string" ? task.id : ""))
    add("task.id", "top-level task id must be three uppercase letters", ref);
  for (const dependencyRef of arrayValue(task.dependsOn)) {
    const dependency =
      typeof dependencyRef === "string" ? byRef.get(dependencyRef) : undefined;
    if (dependency?.parentRef !== undefined)
      add(
        "task.parent-dependency",
        "parent dependencies must target parent tasks",
        ref,
      );
  }
}

function validateChildTask(
  task: StateRecord,
  byRef: Map<string, StateRecord>,
  add: TaskErrorAdder,
  ref?: string,
): void {
  const parent =
    typeof task.parentRef === "string" ? byRef.get(task.parentRef) : undefined;
  const id = typeof task.id === "string" ? task.id : "";
  if (parent === undefined)
    add("task.parent", "child parentRef must name a task", ref);
  else if (
    parent.parentRef !== undefined ||
    typeof parent.id !== "string" ||
    !new RegExp(`^${parent.id}(?:0[1-9]|[1-9]\\d)$`).test(id)
  )
    add(
      "task.child-id",
      "child id must append 01 through 99 to a top-level parent",
      ref,
    );
  for (const dependencyRef of arrayValue(task.dependsOn)) {
    const dependency =
      typeof dependencyRef === "string" ? byRef.get(dependencyRef) : undefined;
    if (dependency !== undefined && dependency.parentRef !== task.parentRef)
      add(
        "task.cross-parent-dependency",
        "child dependencies must target siblings",
        ref,
      );
  }
}

function validateTaskCycles(
  byRef: Map<string, StateRecord>,
  add: TaskErrorAdder,
): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(ref: string): boolean {
    if (visiting.has(ref)) return true;
    if (visited.has(ref)) return false;
    visiting.add(ref);
    const task = byRef.get(ref);
    const cyclic = arrayValue(task?.dependsOn).some(
      (dependency) =>
        typeof dependency === "string" &&
        byRef.has(dependency) &&
        visit(dependency),
    );
    visiting.delete(ref);
    visited.add(ref);
    return cyclic;
  }
  for (const ref of byRef.keys())
    if (visit(ref)) {
      add("task.cycle", "task dependency graph must be acyclic", ref);
      break;
    }
}

function isRunnable(task: StateRecord, tasks: StateRecord[]): boolean {
  if (!["planned", "working"].includes(String(task.status))) return false;
  const byRef = new Map(
    tasks
      .filter(
        (candidate): candidate is StateRecord & { ref: string } =>
          typeof candidate.ref === "string",
      )
      .map((candidate) => [candidate.ref, candidate]),
  );
  const ownReady = arrayValue(task.dependsOn).every(
    (dependency) =>
      typeof dependency === "string" &&
      byRef.get(dependency)?.status === "done",
  );
  if (!ownReady) return false;
  const parent =
    typeof task.parentRef === "string" ? byRef.get(task.parentRef) : undefined;
  return (
    parent === undefined ||
    arrayValue(parent.dependsOn).every(
      (dependency) =>
        typeof dependency === "string" &&
        byRef.get(dependency)?.status === "done",
    )
  );
}

function isValidSubmission(submission: StateRecord): boolean {
  if (submission.kind === "coding")
    return (
      arrayValue(submission.pullRequests).length > 0 &&
      submission.accepter === undefined
    );
  if (submission.kind === "non-coding")
    return (
      typeof submission.accepter === "string" &&
      arrayValue(submission.deliverables).some(
        (deliverable) => isRecord(deliverable) && deliverable.reviewed === true,
      )
    );
  return false;
}

function isValidCompletion(completion: StateRecord): boolean {
  if (
    arrayValue(completion.landing).length === 0 ||
    !isRecord(completion.promotion)
  )
    return false;
  const promotion = completion.promotion;
  const promotionValid =
    (promotion.mode === "paths" && arrayValue(promotion.paths).length > 0) ||
    (promotion.mode === "not-required" &&
      arrayValue(promotion.paths).length === 0 &&
      isRecord(promotion.evidence));
  return (
    promotionValid &&
    arrayValue(completion.outlives).every(
      (item) =>
        isRecord(item) &&
        typeof item.owner === "string" &&
        isRecord(item.carrier),
    )
  );
}

function hasDecisionDispositions(
  stream: StateRecord,
  completion: StateRecord,
): boolean {
  const accepted = arrayValue(stream.records)
    .filter(
      (record) =>
        isRecord(record) &&
        record.kind === "decision" &&
        record.status === "accepted",
    )
    .map((record) => record.ref);
  const disposed = new Set(
    arrayValue(completion.decisionDispositions)
      .filter(isRecord)
      .map((disposition) => disposition.decisionRef),
  );
  return accepted.every((ref) => disposed.has(ref));
}

function validateRevisions(
  stream: StateRecord,
  document: string,
  errors: ValidationError[],
): void {
  const revisions = arrayValue(stream.revisions).filter(isRecord);
  for (const kind of ["plan", "charter"] as const) {
    const current = stream[`${kind}Revision`];
    if (typeof current !== "number") continue;
    const numbers = revisions
      .filter((revision) => revision.kind === kind)
      .map((revision) => revision.number);
    for (let number = 2; number <= current; number += 1)
      if (numbers.filter((candidate) => candidate === number).length !== 1)
        errors.push({
          code: "revision.gap",
          message: `${kind} revision ${number} requires exactly one history entry`,
          document,
          ref: typeof stream.ref === "string" ? stream.ref : undefined,
        });
    if (
      numbers.some((number) => typeof number !== "number" || number > current)
    )
      errors.push({
        code: "revision.future",
        message: `${kind} history exceeds the current revision`,
        document,
        ref: typeof stream.ref === "string" ? stream.ref : undefined,
      });
  }
}

function validateEvents(
  stream: StateRecord,
  document: string,
  errors: ValidationError[],
): void {
  const events = arrayValue(stream.events).filter(isRecord);
  let previous: [number, number] | undefined;
  for (const event of events) {
    const match =
      typeof event.ref === "string"
        ? /:event:(\d+)-(\d+)$/.exec(event.ref)
        : undefined;
    if (match === null || match === undefined) continue;
    const current: [number, number] = [Number(match[1]), Number(match[2])];
    if (
      previous !== undefined &&
      (current[0] < previous[0] ||
        (current[0] === previous[0] && current[1] <= previous[1]))
    )
      errors.push({
        code: "event.order",
        message: "events must be strictly increasing by revision and sequence",
        document,
        ref: event.ref,
      });
    if (
      typeof stream.stateRevision === "number" &&
      (event.stateRevision !== current[0] || current[0] > stream.stateRevision)
    )
      errors.push({
        code: "event.revision",
        message:
          "event ref revision must equal stateRevision and not exceed stream stateRevision",
        document,
        ref: event.ref,
      });
    previous = current;
  }
}

function normalize<T>(value: T): T {
  if (Array.isArray(value))
    return value
      .map(normalize)
      .sort((left, right) =>
        isRecord(left) &&
        isRecord(right) &&
        typeof left.ref === "string" &&
        typeof right.ref === "string"
          ? left.ref.localeCompare(right.ref)
          : 0,
      ) as T;
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, normalize(value[key])]),
  ) as T;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function isRecord(value: unknown): value is StateRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isSafeSource(href: string): boolean {
  return (
    href.endsWith(".mdc") &&
    !isAbsolute(href) &&
    !href.includes("\\") &&
    !href.includes("\0") &&
    !href.includes("?") &&
    !href.includes("#") &&
    href
      .split("/")
      .every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}
function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}
async function findSymlinkComponent(
  stateRoot: string,
  candidate: string,
): Promise<string | undefined> {
  const path = relative(stateRoot, candidate);
  if (path === ".." || path.startsWith(`..${sep}`)) return undefined;
  let cursor = stateRoot;
  for (const segment of ["", ...path.split(sep).filter(Boolean)]) {
    if (segment.length > 0) cursor = resolve(cursor, segment);
    try {
      if ((await lstat(cursor)).isSymbolicLink()) return cursor;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
async function findStateRoot(path: string): Promise<string> {
  let cursor = dirname(path);
  while (dirname(cursor) !== cursor) {
    if (cursor.endsWith(`${sep}.state`)) {
      await lstat(cursor);
      return cursor;
    }
    cursor = dirname(cursor);
  }
  throw new StateValidationFailure([
    {
      code: "graph.state-root",
      message: "MDC root must be beneath .state",
      document: path,
    },
  ]);
}
function sortErrors(errors: ValidationError[]): ValidationError[] {
  return [...errors].sort(
    (left, right) =>
      left.document.localeCompare(right.document) ||
      (left.line ?? 0) - (right.line ?? 0) ||
      (left.column ?? 0) - (right.column ?? 0) ||
      left.code.localeCompare(right.code),
  );
}
