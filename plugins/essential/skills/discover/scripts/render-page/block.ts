import { renderBoards } from "./block/board.ts";
import { renderCallout } from "./block/callout.ts";
import { renderCode, renderCodePair } from "./block/code.ts";
import { renderDeviations } from "./block/deviation.ts";
import { renderDisclosure } from "./block/disclosure.ts";
import { renderEmbed } from "./block/embed.ts";
import { renderFaq, renderGlossary } from "./block/definition.ts";
import { renderFindings } from "./block/finding.ts";
import { renderImage } from "./block/image.ts";
import { renderFailureMap, renderList, renderTldr } from "./block/list.ts";
import { renderMermaid } from "./block/mermaid.ts";
import { renderOwners, renderReadiness } from "./block/meter.ts";
import { renderMetrics } from "./block/metric.ts";
import { renderObservations } from "./block/observation.ts";
import { renderRiskMatrix } from "./block/risk.ts";
import { renderSteps } from "./block/step.ts";
import { renderSvg } from "./block/svg.ts";
import { renderTable } from "./block/table.ts";
import { renderProbe } from "./block/probe.ts";
import { renderQuestion } from "./block/question.ts";
import { renderGate, renderQuiz } from "./block/quiz.ts";
import { renderKanban, renderTimeline } from "./block/timeline.ts";
import { renderTradeoffs } from "./block/tradeoff.ts";
import { renderTree } from "./block/tree.ts";
import { renderDiagram } from "./diagram.ts";
import { RenderError } from "./error.ts";
import { renderInline } from "./inline.ts";
import { requireObject, requireString } from "./validate.ts";

import type { PageContext } from "./context.ts";
import type { Block } from "./types.ts";

/**
 * draws one block, dispatching on its `type` and refusing an unknown one
 * @param block the block to draw
 * @param path JSON path of `block`, named verbatim by any refusal
 * @param page what the block is rendered into: claimed ids, and the files
 *   the CLI layer already read
 * @returns the block as HTML
 */
export function renderBlock(block: Block, path: string, page: PageContext): string {
  requireObject<Block>(block, path);
  requireString((block as { type?: unknown }).type, `${path}.type`);
  switch (block.type) {
    case "prose":
      return `<p class="prose">${renderInline(block.text, `${path}.text`)}</p>`;
    case "metrics":
      return renderMetrics(block.items, `${path}.items`);
    case "table":
      return renderTable(block, path);
    case "callout":
      return renderCallout(block, path);
    case "diagram":
      return renderDiagram(block, path);
    case "tree":
      return renderTree(block, path);
    case "mermaid":
      return renderMermaid(block, path);
    case "svg":
      return renderSvg(block, path, page);
    case "image":
      return renderImage(block, path, page);
    case "embed":
      return renderEmbed(block, path, page);
    case "steps":
      return renderSteps(block, path);
    case "list":
      return renderList(block, path);
    case "tldr":
      return renderTldr(block, path);
    case "code":
      return renderCode(block, path);
    case "codepair":
      return renderCodePair(block, path);
    case "faq":
      return renderFaq(block, path);
    case "glossary":
      return renderGlossary(block, path);
    case "readiness":
      return renderReadiness(block, path);
    case "owners":
      return renderOwners(block, path);
    case "risk-matrix":
      return renderRiskMatrix(block, path);
    case "failure-map":
      return renderFailureMap(block, path);
    case "timeline":
      return renderTimeline(block, path);
    case "deviations":
      return renderDeviations(block, path);
    case "gate":
      return renderGate(block, path, page);
    case "tradeoffs":
      return renderTradeoffs(block, path);
    case "kanban":
      return renderKanban(block, path);
    case "findings":
      return renderFindings(block, path, page.ids);
    case "boards":
      return renderBoards(block, path, page);
    case "disclosure":
      return renderDisclosure(block, path, (held, at) => renderBlock(held, at, page));
    case "probe":
      return renderProbe(block, path, page.ids);
    case "choice":
    case "checklist":
    case "scale":
    case "decision":
    case "note":
      return renderQuestion(block, path, page.ids);
    case "observations":
      return renderObservations(block, path, page.ids);
    case "quiz":
      return renderQuiz(block, path, page);
    default:
      throw new RenderError(
        `${path}.type: unknown block type ${JSON.stringify((block as { type: string }).type)}`,
      );
  }
}
