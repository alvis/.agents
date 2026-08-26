import { ANNOTATION_CSS } from "./style/annotation.ts";
import { BLOCK_CSS } from "./style/block.ts";
import { CONTENT_CSS } from "./style/content.ts";
import { DRAWER_CSS } from "./style/drawer.ts";
import { INLINE_CSS } from "./style/inline.ts";
import { LAYOUT_CSS } from "./style/layout.ts";
import { NOTE_CSS } from "./style/note.ts";
import { QUESTION_CSS } from "./style/question.ts";
import { REPLY_CSS } from "./style/reply.ts";
import { RESET_CSS } from "./style/reset.ts";
import { TOKEN_CSS } from "./style/token.ts";

/**
 * the stylesheet inlined into every generated page, in cascade order. The
 * blank line between parts is what makes the module boundaries legible in
 * the emitted page, so a reader can tell which module owns a rule.
 */
export const PAGE_CSS = [
  RESET_CSS,
  TOKEN_CSS,
  LAYOUT_CSS,
  BLOCK_CSS,
  CONTENT_CSS,
  INLINE_CSS,
  QUESTION_CSS,
  DRAWER_CSS,
  NOTE_CSS,
  REPLY_CSS,
  ANNOTATION_CSS,
].join("\n\n");
