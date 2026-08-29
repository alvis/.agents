/**
 * the authored data format, in one place for every module that reads it.
 *
 * split by what a reader is looking for: the inline vocabulary, the shapes a
 * question is built from, the shapes everything else is built from, the two
 * halves of the block union, and the page around them. This file re-exports
 * every one of them, so no importer has to know which file holds which name —
 * and no name reachable through here may be missing from it, because nothing
 * in this repository type-checks the difference.
 */

export { CHOICE_TAGS } from "./types/answer.ts";
export { PAGE_KINDS } from "./types/page.ts";

export type { Block } from "./types/block.ts";
export type { QuestionBlock, Response } from "./types/question.ts";
export type {
  CodeComment,
  CodeExcerpt,
  CodeSelection,
  CodeTie,
  TokenSpan,
} from "./types/code.ts";
export type {
  Choice,
  Observation,
  Option,
  QuizOption,
  ScalePoint,
  Tag,
} from "./types/answer.ts";
export type {
  Cell,
  Column,
  Definition,
  Deviation,
  Finding,
  Lane,
  Meter,
  Metric,
  Moment,
  Person,
  Pin,
  Point,
  Risk,
  Row,
  Source,
  Step,
  TreeItem,
  Viewport,
} from "./types/content.ts";
export type { Rich, Run } from "./types/inline.ts";
export type { BoardEntry, BoardSet } from "./types/set.ts";
export type { PageData, PageKind, Section, Theme } from "./types/page.ts";
