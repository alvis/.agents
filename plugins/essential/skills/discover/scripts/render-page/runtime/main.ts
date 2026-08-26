import { answerText, readField, recommendedOf, writeField } from "./answer.ts";
import { installBulkApprove } from "./bulk.ts";
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

const body = document.body;
const pageId = body.dataset.pageId ?? "";
const drawerRoot = document.querySelector<HTMLElement>("[data-drawer]")!;
const store = safeStore();
installDrawer(drawerRoot);
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

const targets = {
  list: drawerRoot.querySelector<HTMLElement>("[data-summaries]")!,
  count: drawerRoot.querySelector<HTMLElement>("[data-unanswered-count]")!,
  // the reply lives in its own dialog rather than in the drawer, so it is
  // found from the document
  reply: document.querySelector<HTMLElement>("[data-reply]")!,
};

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
  // the offer has to shrink as the reader answers, or it keeps promising to
  // fill gaps that are no longer there
  repaintBulk?.();

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
installReplyDialog(
  document.querySelector<HTMLDialogElement>("[data-reply-dialog]")!,
  drawerRoot.querySelector<HTMLElement>("[data-reply-open]")!,
);
installCopy(drawerRoot.querySelector<HTMLElement>("[data-copy]")!, targets.reply);
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
