export type JsonSchema = Record<string, unknown>;

const string = { type: "string" } as const;
const integer = { type: "integer", minimum: 0 } as const;
const positiveInteger = { type: "integer", minimum: 1 } as const;
const boolean = { type: "boolean" } as const;
const ref = <const Name extends string>(name: Name) =>
  ({ $ref: `#/$defs/${name}` }) as const;
const array = <
  const Items extends JsonSchema,
  const Extra extends JsonSchema = Record<never, never>,
>(
  items: Items,
  extra = {} as Extra,
) =>
  ({
    type: "array",
    items,
    ...extra,
  }) as const;
const enumeration = <const Values extends readonly (string | number)[]>(
  ...values: Values
) => ({ enum: values }) as const;

function object<const Properties extends Record<string, JsonSchema>>(
  properties: Properties,
): {
  readonly type: "object";
  readonly additionalProperties: false;
  readonly properties: Properties;
  readonly required: readonly (keyof Properties & string)[];
};
function object<
  const Properties extends Record<string, JsonSchema>,
  const Required extends readonly (keyof Properties & string)[],
>(
  properties: Properties,
  required: Required,
): {
  readonly type: "object";
  readonly additionalProperties: false;
  readonly properties: Properties;
  readonly required: Required;
};
function object(
  properties: Record<string, JsonSchema>,
  required: readonly string[] = Object.keys(properties),
): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required,
  };
}

const locator = object({ uri: string, revision: string, hash: string }, [
  "uri",
]);
const statement = object(
  {
    ref: string,
    text: string,
    relation: enumeration("affects", "invalidates", "preserves"),
  },
  ["ref", "text"],
);
const evidence = object(
  {
    ref: string,
    summary: string,
    locator: ref("Locator"),
    inputs: array(ref("Locator")),
    observedAt: string,
    disposition: string,
  },
  ["ref", "summary", "locator", "inputs"],
);
const validity = {
  oneOf: [
    object({ state: enumeration("stale"), reason: string }),
    object({ state: enumeration("unknown"), reason: string }),
  ],
};
const specification = object({
  state: enumeration("none", "pending", "linked"),
  entries: array(ref("Locator")),
});
const project = object({
  ref: string,
  slug: string,
  title: string,
  goal: string,
  requirements: array(ref("Statement")),
  specification: ref("SpecificationProvenance"),
  updatedAt: string,
});
const boundary = object({
  ref: string,
  in: array(ref("Statement")),
  out: array(ref("Statement")),
});
const successCriterion = object({
  ref: string,
  id: { type: "string", pattern: "^SC-[1-9][0-9]*$" },
  text: string,
  expectedEvidence: string,
});
const anchor = object({
  ref: string,
  kind: enumeration(
    "git",
    "jj",
    "media-project",
    "asset-store",
    "requirements-authority",
  ),
  locator: ref("Locator"),
  revisionSemantics: string,
});
const charter = object({
  ref: string,
  revision: positiveInteger,
  goal: string,
  requirements: array(ref("Statement")),
  boundary: ref("Boundary"),
  successCriteria: array(ref("SuccessCriterion")),
  specification: ref("SpecificationProvenance"),
  anchors: array(ref("Anchor")),
});
const attempt = object({
  outcome: enumeration("pass", "fail", "partial"),
  at: string,
});
const task = object(
  {
    ref: string,
    id: string,
    parentRef: string,
    summary: string,
    targets: array(string),
    dependsOn: array(string),
    required: boolean,
    acceptanceRefs: array(string),
    status: enumeration(
      "planned",
      "working",
      "done",
      "failed",
      "blocked",
      "cancelled",
    ),
    owner: string,
    evidence: array(ref("Evidence")),
    attempt: ref("Attempt"),
    retry: string,
    disposition: string,
    unblock: string,
    validity: ref("Validity"),
  },
  [
    "ref",
    "id",
    "summary",
    "targets",
    "dependsOn",
    "required",
    "acceptanceRefs",
    "status",
    "evidence",
  ],
);
const continuation = object({
  ref: string,
  focus: string,
  handback: string,
  nextAction: string,
  taskRefs: array(string),
  fastPaths: array(ref("Locator")),
});
const event = object({
  ref: string,
  timestamp: string,
  actor: string,
  capabilityId: string,
  eventType: enumeration(
    "status",
    "decision",
    "revision",
    "sync",
    "sweep",
    "lease",
  ),
  stateRevision: positiveInteger,
  subjectRef: string,
  summary: string,
  evidenceRefs: array(string),
  invalidates: array(string),
});
const revision = object(
  {
    ref: string,
    kind: enumeration("plan", "charter"),
    number: positiveInteger,
    timestamp: string,
    what: string,
    why: string,
    approver: string,
    specificationBaseId: string,
  },
  ["ref", "kind", "number", "timestamp", "what", "why", "approver"],
);
const question = object(
  {
    ref: string,
    text: string,
    owner: string,
    waitingSince: string,
    awaitingUser: boolean,
    resolvedAt: string,
    answer: string,
  },
  ["ref", "text", "owner", "waitingSince", "awaitingUser"],
);
const record = object(
  {
    ref: string,
    kind: enumeration("proposal", "change", "decision", "design"),
    status: enumeration(
      "open",
      "accepted",
      "rejected",
      "withdrawn",
      "pending",
      "applied",
      "reverted",
      "superseded",
      "proposed",
      "draft",
      "approved",
      "implemented",
      "promoted",
    ),
    headline: string,
    owner: string,
    createdAt: string,
    locator: ref("Locator"),
    targetRef: string,
    provenance: array(ref("Locator")),
    originRef: string,
    supersedes: array(string),
    affects: array(string),
    invalidates: array(string),
    preserves: array(string),
    relationshipStatements: array(ref("Statement")),
    effectiveFrom: string,
  },
  [
    "ref",
    "kind",
    "status",
    "headline",
    "owner",
    "createdAt",
    "locator",
    "targetRef",
    "provenance",
    "supersedes",
    "affects",
    "invalidates",
    "preserves",
    "relationshipStatements",
  ],
);
const finding = object(
  {
    ref: string,
    status: enumeration("open", "fixed", "acknowledged", "deferred", "skipped"),
    severity: enumeration("critical", "high", "medium", "low", "info"),
    summary: string,
    evidence: array(ref("Evidence")),
    rationale: string,
    owner: string,
    recheckCondition: string,
    riskAcceptance: ref("Locator"),
  },
  ["ref", "status", "summary", "evidence"],
);
const reviewArea = object(
  {
    ref: string,
    area: {
      type: "string",
      anyOf: [
        enumeration(
          "alignment",
          "correctness",
          "security",
          "quality",
          "testing",
          "docs",
          "style",
        ),
        { pattern: "^[a-z0-9-]+:[a-z0-9-]+$" },
      ],
    },
    reviewedAt: string,
    reviewedRevision: positiveInteger,
    reviewedTaskRefs: array(string),
    taskDefinitionHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    validity: ref("Validity"),
    findings: array(ref("Finding")),
  },
  [
    "ref",
    "area",
    "reviewedAt",
    "reviewedRevision",
    "reviewedTaskRefs",
    "taskDefinitionHash",
    "findings",
  ],
);
const review = object({ ref: string, areas: array(ref("ReviewArea")) });
const pullRequest = object(
  {
    ref: string,
    number: positiveInteger,
    url: string,
    repository: string,
    headRevision: string,
    status: enumeration("draft", "open", "merged", "closed"),
    mergedRevision: string,
  },
  ["ref", "number", "url", "repository", "headRevision", "status"],
);
const deliverable = object({
  ref: string,
  title: string,
  locator: ref("Locator"),
  reviewed: boolean,
});
const submission = object(
  {
    ref: string,
    kind: enumeration("coding", "non-coding"),
    pullRequests: array(ref("PullRequest")),
    deliverables: array(ref("Deliverable")),
    accepter: string,
  },
  ["ref", "kind", "pullRequests", "deliverables"],
);
const pathPromotion = object({
  ref: string,
  mode: enumeration("paths"),
  paths: array(ref("Locator")),
});
const noPromotion = object({
  ref: string,
  mode: enumeration("not-required"),
  paths: { type: "array", maxItems: 0 },
  evidence: ref("Evidence"),
});
const outlivesItem = object({
  ref: string,
  summary: string,
  owner: string,
  carrier: ref("Locator"),
});
const decisionDisposition = object({
  ref: string,
  decisionRef: string,
  kind: enumeration(
    "adr",
    "product-record",
    "production-record",
    "work-receipt",
    "expired-archive",
  ),
  carrier: ref("Locator"),
});
const completion = object({
  ref: string,
  completedAt: string,
  landing: array(ref("Evidence")),
  promotion: {
    oneOf: [ref("PathPromotion"), ref("NoPromotionRequired")],
  },
  outlives: array(ref("OutlivesItem")),
  decisionDispositions: array(ref("DecisionDisposition")),
});
const environmentClaim = object(
  {
    ref: string,
    statement: string,
    observedAt: string,
    evidence: array(ref("Evidence")),
    validity: ref("Validity"),
  },
  ["ref", "statement", "observedAt", "evidence"],
);
const trap = object(
  {
    ref: string,
    symptom: string,
    cause: string,
    action: string,
    verifiedAt: string,
    evidence: array(ref("Evidence")),
    validity: ref("Validity"),
  },
  ["ref", "symptom", "cause", "action", "evidence"],
);
const documentation = object(
  {
    ref: string,
    title: string,
    locator: ref("Locator"),
    capabilityRef: string,
  },
  ["ref", "title", "locator"],
);
const stream = object(
  {
    ref: string,
    projectRef: string,
    workId: string,
    phase: enumeration(
      "planned",
      "working",
      "reviewing",
      "completed",
      "archived",
    ),
    blockedOn: string,
    charterStatus: enumeration("approved", "reconstructed", "absent"),
    charterRevision: positiveInteger,
    planRevision: positiveInteger,
    stateRevision: positiveInteger,
    writtenUnder: string,
    repositoryRevision: string,
    syncState: string,
    reviewState: string,
    updatedAt: string,
    charter: ref("Charter"),
    tasks: array(ref("Task")),
    continuation: ref("Continuation"),
    events: array(ref("Event")),
    revisions: array(ref("Revision")),
    questions: array(ref("Question")),
    records: array(ref("RecordRef")),
    review: ref("Review"),
    submission: ref("Submission"),
    completion: ref("Completion"),
    location: ref("Locator"),
    documentations: array(ref("DocumentationRef")),
  },
  [
    "ref",
    "projectRef",
    "workId",
    "phase",
    "charterStatus",
    "charterRevision",
    "planRevision",
    "stateRevision",
    "writtenUnder",
    "syncState",
    "reviewState",
    "updatedAt",
    "tasks",
    "events",
    "revisions",
    "questions",
    "records",
    "documentations",
  ],
);

export const STATE_MODEL_V1_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://theriety.dev/schemas/essential.state/v1.json",
  title: "StateDashboardDocumentV1",
  oneOf: [ref("ProjectStateDocumentV1"), ref("StreamStateDocumentV1")],
  $defs: {
    Locator: locator,
    Statement: statement,
    Evidence: evidence,
    Validity: validity,
    SpecificationProvenance: specification,
    Project: project,
    Boundary: boundary,
    SuccessCriterion: successCriterion,
    Anchor: anchor,
    Charter: charter,
    Attempt: attempt,
    Task: task,
    Continuation: continuation,
    Event: event,
    Revision: revision,
    Question: question,
    RecordRef: record,
    Finding: finding,
    ReviewArea: reviewArea,
    Review: review,
    PullRequest: pullRequest,
    Deliverable: deliverable,
    Submission: submission,
    PathPromotion: pathPromotion,
    NoPromotionRequired: noPromotion,
    OutlivesItem: outlivesItem,
    DecisionDisposition: decisionDisposition,
    Completion: completion,
    EnvironmentClaim: environmentClaim,
    Trap: trap,
    DocumentationRef: documentation,
    Stream: stream,
    ProjectStateDocumentV1: object({
      schemaVersion: enumeration(1),
      kind: enumeration("project"),
      project: ref("Project"),
      streams: array(ref("Stream")),
      environment: array(ref("EnvironmentClaim")),
      traps: array(ref("Trap")),
    }),
    StreamStateDocumentV1: object({
      schemaVersion: enumeration(1),
      kind: enumeration("stream"),
      projectRef: string,
      stream: ref("Stream"),
      environment: { type: "array", maxItems: 0 },
      traps: { type: "array", maxItems: 0 },
    }),
  },
} as const satisfies JsonSchema;

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJson(child)]),
  );
}

export function renderStateModelSchema(): string {
  return `${formatJson(sortJson(STATE_MODEL_V1_SCHEMA))}\n`;
}

const PRINT_WIDTH = 80;

function formatJson(value: unknown, level = 0, prefixWidth = 0): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const inline = `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
    if (
      value.every(
        (item) =>
          item === null ||
          ["boolean", "number", "string"].includes(typeof item),
      ) &&
      prefixWidth + inline.length <= PRINT_WIDTH
    )
      return inline;
    const indentation = "  ".repeat(level + 1);
    return `[\n${value
      .map((item) => `${indentation}${formatJson(item, level + 1)}`)
      .join(",\n")}\n${"  ".repeat(level)}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const indentation = "  ".repeat(level + 1);
    return `{\n${entries
      .map(([key, child]) => {
        const prefix = `${indentation}${JSON.stringify(key)}: `;
        return `${prefix}${formatJson(child, level + 1, prefix.length)}`;
      })
      .join(",\n")}\n${"  ".repeat(level)}}`;
  }
  return JSON.stringify(value);
}
