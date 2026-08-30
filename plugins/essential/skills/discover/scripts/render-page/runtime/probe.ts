/** one probe's reader-set order, as the reply reads it. */
export interface ProbeOrder {
  /** the probe's id, which the saved order is keyed by */
  id: string;
  /** what the probe asked the reader to rank */
  label: string;
  /** the items as they now stand, by their labels, in order */
  order: string[];
  /** the same order by item id, which is what the saved order keeps */
  keys: string[];
  /** whether the reader has moved anything from the order the page drew */
  moved: boolean;
}

/**
 * reads a probe's items in the order they currently stand
 * @param probe the probe
 * @returns its items, in document order
 */
function itemsOf(probe: HTMLElement): HTMLElement[] {
  return [...probe.querySelectorAll<HTMLElement>("[data-probe-item]")];
}

/**
 * reads where a probe stands
 * @param probe the probe
 * @param authored the order the page drew, by item id
 * @returns the probe's id, label, current order, and whether it has moved
 */
function stateOf(probe: HTMLElement, authored: string[]): ProbeOrder {
  const items = itemsOf(probe);
  const keys = items.map((item) => item.dataset.probeItem ?? "");

  return {
    id: probe.dataset.probeId ?? "",
    label: probe.dataset.probeLabel ?? "",
    order: items.map((item) => item.dataset.probeLabel ?? ""),
    keys,
    moved: keys.some((key, index) => key !== authored[index]),
  };
}

/**
 * puts a probe's items into a saved order.
 *
 * an item the saved order does not name is left where it stands rather than
 * being dropped, and the named ones settle after it: a probe whose list has
 * since gained an entry still restores the ranking the reader made of the
 * entries it does recognise, instead of losing all of it to one new item.
 * @param probe the probe
 * @param order the item ids, in the order to apply
 */
function applyOrder(probe: HTMLElement, order: string[]): void {
  const list = itemsOf(probe)[0]?.parentElement;
  if (!list) return;

  const byKey = new Map(
    itemsOf(probe).map((item) => [item.dataset.probeItem ?? "", item]),
  );
  for (const key of order) {
    const item = byKey.get(key);
    if (item) list.append(item);
  }
}

/**
 * moves an item one place, if there is a place to move it to
 * @param item the item to move
 * @param forward whether to move it later rather than earlier
 * @returns whether anything moved
 */
function shift(item: HTMLElement, forward: boolean): boolean {
  const neighbour = forward
    ? item.nextElementSibling
    : item.previousElementSibling;
  if (!neighbour) return false;

  // `after`/`before` on the neighbour rather than an insert on the parent: it
  // says which way the item went at the point the direction was decided
  if (forward) neighbour.after(item);
  else neighbour.before(item);

  return true;
}

/**
 * makes every probe on the page reorderable, by pointer and by key.
 *
 * both paths write through the same finish, so an order set by dragging and one
 * set by the arrow keys are the same answer as far as the reply is concerned.
 * @param probes every probe on the page
 * @param saved the orders the reader had set before this visit, by probe id
 * @param onChange what to call once an order has settled
 * @returns a reader for where every probe now stands
 */
export function installProbes(
  probes: HTMLElement[],
  saved: Record<string, string[]>,
  onChange: () => void,
): () => ProbeOrder[] {
  const authored = new Map(
    probes.map((probe) => [
      probe,
      itemsOf(probe).map((item) => item.dataset.probeItem ?? ""),
    ]),
  );

  for (const probe of probes) {
    const order = saved[probe.dataset.probeId ?? ""];
    if (order?.length) applyOrder(probe, order);

    let dragged: HTMLElement | null = null;

    probe.addEventListener("dragstart", (event) => {
      const item = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(
        "[data-probe-item]",
      );
      if (!item) return;

      dragged = item;
      item.classList.add("is-dragging");
    });

    probe.addEventListener("dragover", (event) => {
      const over = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(
        "[data-probe-item]",
      );
      if (!dragged || !over || over === dragged) return;

      // without this the browser refuses the drop and the item springs back
      event.preventDefault();
      // the midpoint decides which side, so an item dragged onto the top half
      // of its neighbour lands above it rather than always below
      const box = over.getBoundingClientRect();
      const past = (event as DragEvent).clientY > box.top + box.height / 2;
      if (past) over.after(dragged);
      else over.before(dragged);
    });

    probe.addEventListener("drop", (event) => {
      if (dragged) event.preventDefault();
    });

    probe.addEventListener("dragend", () => {
      if (!dragged) return;

      dragged.classList.remove("is-dragging");
      dragged = null;
      onChange();
    });

    probe.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(
        "[data-probe-move]",
      );
      const item = button?.closest<HTMLElement>("[data-probe-item]");
      if (!button || !item) return;

      if (!shift(item, button.dataset.probeMove === "down")) return;

      // the pressed button moved with the item, so focus follows it there;
      // otherwise a second press lands on whatever took its place
      button.focus();
      onChange();
    });

    probe.addEventListener("keydown", (event) => {
      const key = (event as KeyboardEvent).key;
      if (key !== "ArrowUp" && key !== "ArrowDown") return;

      const item = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(
        "[data-probe-item]",
      );
      if (!item) return;

      // the arrows would otherwise scroll the page out from under the list
      event.preventDefault();
      if (!shift(item, key === "ArrowDown")) return;

      item.focus();
      onChange();
    });
  }

  return () =>
    probes.map((probe) => stateOf(probe, authored.get(probe) ?? []));
}
