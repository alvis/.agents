/**
 * the authored data format, in one place for every module that reads it.
 *
 * split by what a reader is looking for: the inline vocabulary, the shapes
 * blocks are built from, the block union itself, and the page around them.
 * This file re-exports all four, so no importer has to know which is which.
 */

export { CHOICE_TAGS } from "./types/content.ts";

export type { Block, CodeComment, CodeTie, Response } from "./types/block.ts";
export type {
  Cell,
  Choice,
  Finding,
  Metric,
  Option,
  Pin,
  Row,
  ScalePoint,
  Source,
  Step,
  Tag,
  TreeItem,
  Viewport,
} from "./types/content.ts";
export type { Rich, Run } from "./types/inline.ts";
export type { PageData, Section, Theme } from "./types/page.ts";
