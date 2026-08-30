export interface MdcPosition {
  line: number;
  column: number;
  offset: number;
}

export interface MdcNode {
  type: string;
  ref?: string;
  annotations?: Record<string, unknown>;
  content?: MdcInlineNode[];
  children?: MdcNode[];
  range?: { start: MdcPosition; end: MdcPosition };
}

export interface MdcInlineNode {
  type: string;
  text?: string;
  formats?: string[];
  annotations?: Record<string, unknown>;
}

export interface MdcDocument extends MdcNode {
  children: MdcNode[];
}

export function parse(source: string): MdcDocument;
