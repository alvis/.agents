/**
 * lists every disclosure that holds an element, innermost first
 * @param element the element to look around
 * @returns each `<details>` the element sits inside, at any depth
 */
function foldsAround(element: Element): HTMLDetailsElement[] {
  const folds: HTMLDetailsElement[] = [];
  for (
    let held = element.closest("details");
    held;
    held = held.parentElement?.closest("details") ?? null
  )
    folds.push(held);

  return folds;
}

/**
 * says whether a disclosure that is closed holds an element.
 *
 * a closed `<details>` hides what it holds without removing it, so the element
 * is still in the document, still reachable by a query, and still takes a key
 * or a focus call that does nothing the reader can see.
 * @param element the element to test
 * @returns true where any disclosure around it is closed
 */
export function isFolded(element: Element): boolean {
  return foldsAround(element).some((fold) => !fold.open);
}

/**
 * opens every disclosure that holds an element, so the element can be seen.
 *
 * the reader asked to be taken somewhere, and arriving at a closed fold would
 * be arriving at nothing: the scroll lands on the summary and the card the
 * jump named stays hidden under it.
 * @param element the element the reader is being taken to
 */
export function reveal(element: Element): void {
  for (const fold of foldsAround(element)) fold.open = true;
}

/**
 * makes every link to a question open the fold the question sits in.
 *
 * one handler on the document rather than one per kind of link, because the
 * drawer's rows, the bar's chips and a section heading's chips all point at the
 * same `#qs-` anchors and a fourth kind of link added later would otherwise
 * arrive without it. It runs before the browser follows the link, which is why
 * the scroll that follows lands on a card that is open.
 * @param onJump what else a jump does, given the question and the link
 */
export function installJumps(
  onJump: (target: HTMLElement, link: HTMLElement) => void,
): void {
  document.addEventListener("click", (event) => {
    const link = (event.target as HTMLElement | null)?.closest?.<HTMLElement>("a[href]");
    const href = link?.getAttribute("href") ?? "";
    if (!link || !href.startsWith("#qs-")) return;

    // the href is the one record of where the link points, and the browser is
    // navigating to the same fragment, so the two cannot disagree
    const target = document.getElementById(href.slice(1));
    if (!target) return;

    reveal(target);
    onJump(target, link);
  });
}
