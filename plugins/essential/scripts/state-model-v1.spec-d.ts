import type {
  NoPromotionRequired,
  StreamStateDocumentV1,
} from "./state-model-v1.ts";

type IsExact<Actual, Expected> =
  (<Value>() => Value extends Actual ? 1 : 2) extends <
    Value,
  >() => Value extends Expected ? 1 : 2
    ? (<Value>() => Value extends Expected ? 1 : 2) extends <
        Value,
      >() => Value extends Actual ? 1 : 2
      ? true
      : false
    : false;

type Assert<Condition extends true> = Condition;

export type DirectStreamEnvironmentIsEmpty = Assert<
  IsExact<StreamStateDocumentV1["environment"], []>
>;
export type DirectStreamTrapsIsEmpty = Assert<
  IsExact<StreamStateDocumentV1["traps"], []>
>;
export type NoPromotionPathsIsEmpty = Assert<
  IsExact<NoPromotionRequired["paths"], []>
>;
