import { collapse, truncate } from "./quote.ts";

/** a usable selection inside a section. */
export interface Picked {
  /** the section the passage sits in */
  sectionId: string;
  /** the passage, collapsed and truncated */
  quote: string;
  /** where it sits on screen, for placing the pill */
  rect: DOMRect;
}

/** how far the pill sits from the selection and from the viewport edge. */
const MARGIN = 8;

/**
 * tells whether an element is somewhere the reader is editing rather than reading
 * @param element the element to test
 * @returns whether a selection here is editing, not annotating
 */
function isEditing(element: Element | null): boolean {
  return Boolean(element?.closest("[data-note-dialog], input, textarea, select"));
}

/**
 * reads the current selection, if it is a passage inside a section
 * @returns what was selected, or null when nothing usable is
 */
export function readSelection(): Picked | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;

  const quote = collapse(selection.toString());
  if (!quote) return null;

  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;

  if (!element || isEditing(element)) return null;

  const sectionId = element.closest<HTMLElement>("[data-section]")?.dataset
    .sectionId;
  if (!sectionId) return null;

  return { sectionId, quote: truncate(quote), rect: range.getBoundingClientRect() };
}

/**
 * places the pill under a selection without letting it leave the viewport
 * @param pill the pill to place
 * @param rect where the selection sits
 */
export function placePill(pill: HTMLElement, rect: DOMRect): void {
  // unhidden first so `offsetWidth` is real: a selection ending near the right
  // edge would otherwise push the pill off-screen, which both hides half the
  // control and makes the whole document scroll sideways
  pill.hidden = false;
  const limit = Math.max(
    MARGIN,
    document.documentElement.clientWidth - pill.offsetWidth - MARGIN,
  );

  pill.style.top = `${rect.bottom + window.scrollY + MARGIN}px`;
  pill.style.left = `${Math.min(Math.max(rect.left, MARGIN), limit) + window.scrollX}px`;
}

/** what the reader can type into */
const FIELDS = new Set(["input", "textarea", "select"]);

/**
 * tells whether an event landed inside an open dialog.
 *
 * a modal traps focus but not keystrokes: a shortcut bound to the document
 * still fires while the reader is in a dialog, and would answer or navigate a
 * board they cannot currently see. Focus being trapped is what makes the
 * event's own target a sound test for it.
 * @param target whatever the event reached
 * @returns whether it sits inside a dialog that is open
 */
export function isInDialog(target: EventTarget | null): boolean {
  const element = target as Partial<Element> | null;

  return typeof element?.closest === "function"
    ? element.closest("dialog[open]") !== null
    : false;
}

/**
 * tells whether a keystroke landed somewhere the reader is typing.
 *
 * this reads the tag rather than testing `instanceof HTMLInputElement`, because
 * the constructor is a global: a document handed in from a frame, or a test
 * harness standing in for the DOM, does not carry it, and a guard that throws
 * where it cannot see the constructor would let every shortcut fire mid-word.
 * @param target what the event reached
 * @returns whether a shortcut must stand aside
 */
export function isTyping(target: EventTarget | null): boolean {
  const element = target as Partial<HTMLElement> | null;
  if (!element || typeof element.tagName !== "string") return false;

  return (
    FIELDS.has(element.tagName.toLowerCase()) || element.isContentEditable === true
  );
}

/**
 * watches the selection and offers to note it.
 *
 * the pill lives on `document.body` rather than inside the page, so a
 * positioned ancestor cannot re-base its document coordinates.
 * @param onNote what to call with the passage the reader chose to note
 * @returns a reader for the passage currently selected, which the section
 *   controls need so a press can note the selection rather than the section
 */
export function installSelection(
  onNote: (picked: Picked) => void,
): () => Picked | null {
  let pending: Picked | null = null;

  const pill = document.createElement("button");
  pill.type = "button";
  pill.className = "selection-pill";
  pill.dataset.selectionPill = "";
  pill.hidden = true;
  pill.textContent = "Note selection";
  // pressing a button collapses the selection before the click arrives, which
  // would take the quote with it
  pill.addEventListener("mousedown", (event) => event.preventDefault());
  pill.addEventListener("click", () => {
    if (pending) onNote(pending);
  });
  document.body.append(pill);

  const refresh = (): void => {
    const found = readSelection();
    pending = found;
    if (!found) {
      pill.hidden = true;

      return;
    }
    placePill(pill, found.rect);
  };

  // deferred so the selection has settled, but by a timer rather than a frame:
  // a frame callback is not delivered in the automation this project verifies
  // with (R-37), and the requirement here is only to run after the current
  // event, which a zero timer satisfies exactly as well
  document.addEventListener("selectionchange", () => {
    window.setTimeout(refresh, 0);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "n" && event.key !== "N") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (!pending || isTyping(event.target) || isInDialog(event.target)) return;
    event.preventDefault();
    onNote(pending);
  });

  return () => pending;
}
