/** Normalized domain types derived from the `essential.state/v1` JSON Schema. */

import { STATE_MODEL_V1_SCHEMA } from "./state-model-v1.schema.ts";

type Definitions = (typeof STATE_MODEL_V1_SCHEMA)["$defs"];
type DefinitionName = keyof Definitions;

type Simplify<Value> = { [Key in keyof Value]: Value[Key] };
type RequiredKeys<SchemaValue> = SchemaValue extends {
  readonly required: readonly (infer Key extends PropertyKey)[];
}
  ? Key
  : never;
type ObjectType<
  Properties extends Record<string, unknown>,
  Required extends PropertyKey,
> = Simplify<
  {
    -readonly [
      Key in keyof Properties as Key extends Required ? Key : never
    ]-?: FromSchema<Properties[Key]>;
  } & {
    -readonly [
      Key in keyof Properties as Key extends Required ? never : Key
    ]?: FromSchema<Properties[Key]>;
  }
>;

type PatternString<Pattern> = Pattern extends "^SC-[1-9][0-9]*$"
  ? `SC-${number}`
  : Pattern extends "^[a-z0-9-]+:[a-z0-9-]+$"
    ? `${Lowercase<string>}:${Lowercase<string>}`
    : string;

type FromSchema<SchemaValue> = SchemaValue extends {
  readonly $ref: `#/$defs/${infer Name}`;
}
  ? Name extends DefinitionName
    ? FromSchema<Definitions[Name]>
    : never
  : SchemaValue extends { readonly oneOf: readonly (infer Variant)[] }
    ? FromSchema<Variant>
    : SchemaValue extends { readonly anyOf: readonly (infer Variant)[] }
      ? FromSchema<Variant>
      : SchemaValue extends { readonly enum: readonly (infer Value)[] }
        ? Value
        : SchemaValue extends {
              readonly type: "object";
              readonly properties: infer Properties extends Record<
                string,
                unknown
              >;
            }
          ? ObjectType<Properties, RequiredKeys<SchemaValue>>
          : SchemaValue extends {
                readonly type: "array";
                readonly maxItems: 0;
              }
            ? []
            : SchemaValue extends {
                  readonly type: "array";
                  readonly items: infer Item;
                }
              ? Array<FromSchema<Item>>
              : SchemaValue extends { readonly pattern: infer Pattern }
                ? PatternString<Pattern>
                : SchemaValue extends { readonly type: "string" }
                  ? string
                  : SchemaValue extends { readonly type: "integer" }
                    ? number
                    : SchemaValue extends { readonly type: "boolean" }
                      ? boolean
                      : never;

type Definition<Name extends DefinitionName> = FromSchema<Definitions[Name]>;

export type Ref = string;
export type ISO8601 = string;

export type Locator = Definition<"Locator">;
export type Statement = Definition<"Statement">;
export type Evidence = Definition<"Evidence">;
export type Validity = Definition<"Validity">;
export type StaleValidity = Extract<Validity, { state: "stale" }>;
export type UnknownValidity = Extract<Validity, { state: "unknown" }>;
export type SpecificationProvenance = Definition<"SpecificationProvenance">;
export type SpecificationState = SpecificationProvenance["state"];
export type Project = Definition<"Project">;
export type Stream = Definition<"Stream">;
export type CharterStatus = Stream["charterStatus"];
export type Phase = Stream["phase"];
export type Charter = Definition<"Charter">;
export type Boundary = Definition<"Boundary">;
export type SuccessCriterion = Definition<"SuccessCriterion">;
export type Anchor = Definition<"Anchor">;
export type AnchorKind = Anchor["kind"];
export type Attempt = Definition<"Attempt">;
export type Task = Definition<"Task">;
export type TaskStatus = Task["status"];
export type Continuation = Definition<"Continuation">;
export type Event = Definition<"Event">;
export type EventType = Event["eventType"];
export type Revision = Definition<"Revision">;
export type Question = Definition<"Question">;
export type RecordRef = Definition<"RecordRef">;
export type RecordKind = RecordRef["kind"];
export type RecordStatus = RecordRef["status"];
export type Review = Definition<"Review">;
export type ReviewArea = Definition<"ReviewArea">;
export type ReviewAreaName = ReviewArea["area"];
export type Finding = Definition<"Finding">;
export type FindingStatus = Finding["status"];
export type Severity = Finding["severity"];
export type Submission = Definition<"Submission">;
export type PullRequest = Definition<"PullRequest">;
export type Deliverable = Definition<"Deliverable">;
export type Completion = Definition<"Completion">;
export type PathPromotion = Definition<"PathPromotion">;
export type NoPromotionRequired = Definition<"NoPromotionRequired">;
export type Promotion = PathPromotion | NoPromotionRequired;
export type OutlivesItem = Definition<"OutlivesItem">;
export type DecisionDisposition = Definition<"DecisionDisposition">;
export type DecisionDispositionKind = DecisionDisposition["kind"];
export type EnvironmentClaim = Definition<"EnvironmentClaim">;
export type Trap = Definition<"Trap">;
export type DocumentationRef = Definition<"DocumentationRef">;
export type ProjectStateDocumentV1 = Definition<"ProjectStateDocumentV1">;
export type StreamStateDocumentV1 = Definition<"StreamStateDocumentV1">;
export type StateDashboardDocumentV1 = FromSchema<typeof STATE_MODEL_V1_SCHEMA>;
