import { answerText, readField, recommendedOf, writeField } from "./answer.ts";
import { installBulkApprove } from "./bulk.ts";
import { installChips } from "./chips.ts";
import { installCopy } from "./copy.ts";
import { installMermaid } from "./diagram.ts";
import { installDiagramDetail } from "./detail.ts";
import { installDrawer } from "./drawer.ts";
import { installEmbeds } from "./embed.ts";
import { installFilters } from "./filter.ts";
import { installKeys } from "./keys.ts";
import { installNoteDialog } from "./note-dialog.ts";
import { rowsOf } from "./note-view.ts";
import { installNotes } from "./notes.ts";
import { installProbes } from "./probe.ts";
import { installQuiz } from "./quiz.ts";
import { installReplyDialog } from "./reply-dialog.ts";
import { installSectionSpy } from "./spy.ts";
import { installTies } from "./tie.ts";
import { loadState, safeStore, saveState } from "./store.ts";
import { paintSummary } from "./summary.ts";
import { installScheme } from "./theme.ts";
import { installVerdicts } from "./verdict.ts";

import type { ProbeOrder } from "./probe.ts";
import type { AnswerLine } from "./reply.ts";
import type { SavedState } from "./store.ts";

/**
 * wires the whole board: restores what the reader left, then makes every
 * control live.
 *
 * a function rather than a module body, so importing this is not the same as
 * running it. The wiring reads the live document, as every `install` it calls
 * does — a document passed in here would be honoured by these queries and
 * ignored by the twelve modules below them, which is a promise the runtime
 * cannot keep.
 *
 * order is load-bearing: the dialogs and the questions are set up before the
 * shortcuts that reach them, and the graphs are drawn last because they are the
 * only thing on the page that can take a moment.
 */
export function start(): void {
  const body = document.body;
  const pageId = body.dataset.pageId ?? "";
  const drawerRoot = document.querySelector<HTMLElement>("[data-drawer]")!;
  const store = safeStore();
  const drawer = installDrawer(drawerRoot);
  installScheme(
    drawerRoot.querySelector<HTMLElement>("[data-scheme-toggle]")!,
    document.documentElement,
    store,
  );
  const sectionLabels = new Map(
    [...document.querySelectorAll<HTMLElement>("[data-section]")].map((section) => [
      section.dataset.sectionId ?? "",
      section.dataset.sectionLabel ?? "",
    ]),
  );
  const fields = [...document.querySelectorAll<HTMLElement>("[data-question]")];
  const ids = fields.map((field) => field.dataset.questionId ?? "");
  const probes = [...document.querySelectorAll<HTMLElement>("[data-probe]")];

  // a board that asks nothing draws no reply half at all: no count, no reply,
  // nothing to copy and no chips. These queries return null there rather than
  // an empty control, so every use of them below is guarded by the same fact
  const targets = {
    list: drawerRoot.querySelector<HTMLElement>("[data-summaries]")!,
    count: drawerRoot.querySelector<HTMLElement>("[data-unanswered-count]"),
    // the reply lives in its own dialog rather than in the drawer, so it is
    // found from the document
    reply: document.querySelector<HTMLElement>("[data-reply]"),
  };

  const strip = drawerRoot.querySelector<HTMLElement>("[data-chip-strip]");
  const paintChips = strip ? installChips(strip, fields) : undefined;

  // following a decision row has to get the drawer out of the way, or the jump
  // lands behind the panel that started it. The anchor's own navigation does
  // the scrolling; this only collapses and puts the keyboard on the card, so a
  // reader arriving by Enter is reading the same question their eyes are
  targets.list.addEventListener("click", (event) => {
    const jump = (event.target as HTMLElement).closest<HTMLElement>(".summary-jump");
    if (!jump) return;

    drawer.setExpanded(false);
    // the href is the one record of where the row points, so the focus follows
    // the same fragment the browser is already navigating to
    document.getElementById(jump.getAttribute("href")!.slice(1))?.focus();
  });

  const saved: SavedState = loadState(store, pageId);
  const touched = new Set(saved.touched);

  /**
   * a restore moves controls exactly as a reader would, so the `input` and
   * `change` events it raises are indistinguishable from an answer. This is what
   * keeps a restored page from reporting every question as freshly touched.
   */
  let restoring = false;

  /** redraws the bulk-approve offer; set once the drawer's controls exist */
  let repaintBulk: (() => void) | undefined;

  /**
   * rescores the merge gate; absent on every board that holds no gate.
   *
   * wired into the same refresh the drawer is, rather than to its own listener,
   * so the verdict can never be drawn from a set of answers the drawer has
   * already moved past.
   */
  const repaintGate = installQuiz();

  /** reads where every ordering probe stands; set once the probes are wired */
  let readProbes: (() => ProbeOrder[]) | undefined;

  /**
   * redraws the drawer from the page's current controls, and saves them
   * @param persist whether the redraw should also write to storage
   */
  function refresh(persist: boolean): void {
    const answers: Record<string, ReturnType<typeof readField>> = {};
    const lines: AnswerLine[] = fields.map((field, index) => {
      const state = readField(field);
      answers[ids[index]] = state;

      return {
        ref: field.dataset.questionRef ?? "",
        label: field.dataset.questionLabel ?? "",
        value: answerText(state),
        response: field.dataset.responseKind === "follow-up" ? "follow-up" : "decision",
        recommended: recommendedOf(field),
        touched: touched.has(ids[index]),
      } as const;
    });

    const orders = readProbes?.() ?? [];
    paintSummary(
      targets,
      lines,
      touched,
      ids,
      rowsOf(saved, sectionLabels),
      orders,
    );
    // the bar's chips carry the same dispositions the drawer's rows do, drawn
    // from the same lines, so the two can never disagree about a question
    paintChips?.(lines);
    // the offer has to shrink as the reader answers, or it keeps promising to
    // fill gaps that are no longer there
    repaintBulk?.();
    repaintGate?.();

    if (persist)
      saveState(store, pageId, {
        answers,
        touched: [...touched],
        // the notes are the reader's other half of this board and are written by
        // the same save, so one refresh can never persist answers while dropping
        // a note made a moment earlier
        annotations: saved.annotations,
        excerpts: saved.excerpts,
        // only the probes the reader actually moved: restoring the board's own
        // proposal would read back as a ranking they made
        orders: Object.fromEntries(
          orders.filter(({ moved }) => moved).map(({ id, keys }) => [id, keys]),
        ),
      });
  }

  /**
   * records that the reader has touched a question, ignoring a restore
   * @param field the question the event reached, if any
   */
  function markTouched(field: HTMLElement | null): void {
    if (restoring || !field) return;

    const id = field.dataset.questionId;
    if (id) touched.add(id);
  }

  /**
   * finds the question a raw event landed in
   * @param event the event to trace
   * @returns the question element, or null when the event missed every question
   */
  function fieldOf(event: Event): HTMLElement | null {
    const target = event.target as HTMLElement | null;

    return target?.closest?.<HTMLElement>("[data-question]") ?? null;
  }

  restoring = true;
  for (const [index, field] of fields.entries()) {
    const state = saved.answers[ids[index]];
    if (state) writeField(field, state);
  }
  restoring = false;

  for (const type of ["input", "change"] as const)
    document.addEventListener(type, (event) => {
      markTouched(fieldOf(event));
      refresh(true);
    });

  installVerdicts((field) => {
    markTouched(field);
    refresh(true);
  });

  readProbes = installProbes(probes, saved.orders, () => refresh(true));

  installSectionSpy(drawerRoot);
  installEmbeds();
  // the author's own annotations: nothing here reads or writes saved state, so
  // they are live before the first paint and stay live whatever the reader does
  installTies();
  installDiagramDetail();
  installFilters();
  installNotes({
    state: saved,
    save: () => refresh(true),
    ask: installNoteDialog(
      document.querySelector<HTMLDialogElement>("[data-note-dialog]")!,
    ),
    panel: drawerRoot.querySelector<HTMLElement>("[data-notes]")!,
    count: drawerRoot.querySelector<HTMLElement>("[data-note-count]")!,
    clear: drawerRoot.querySelector<HTMLButtonElement>("[data-note-clear]")!,
  });
  if (targets.reply) {
    installReplyDialog(
      document.querySelector<HTMLDialogElement>("[data-reply-dialog]")!,
      drawerRoot.querySelector<HTMLElement>("[data-reply-open]")!,
    );
    installCopy(
      drawerRoot.querySelector<HTMLElement>("[data-copy]")!,
      targets.reply,
    );
  }
  repaintBulk = installBulkApprove(
    drawerRoot.querySelector<HTMLElement>("[data-approve-rest]")!,
    fields,
  );
  // after the questions are restored and the dialogs are wired, so a shortcut can
  // never reach a control the page has not finished setting up
  installKeys(fields);

  // the restore above wrote controls without persisting; this first paint is what
  // puts the drawer in step with them, and re-saving is what prunes any entry the
  // page no longer has a question for
  refresh(true);

  // last, because it is the only thing on the page that can take a moment: the
  // graphs draw after the drawer, the answers and the summary are already live
  void installMermaid();
}
