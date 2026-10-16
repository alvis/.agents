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
 * finds the question a fragment names
 *
 * the one place a `#qs-` fragment becomes an element, whether it came from a
 * link's `href` or from the address bar, so the two cannot be read differently.
 * @param fragment a fragment with its leading `#`
 * @returns the question, or null for any other fragment or a question the page
 *   does not hold
 */
function questionAt(fragment: string): HTMLElement | null {
  return fragment.startsWith("#qs-") ? document.getElementById(fragment.slice(1)) : null;
}

/**
 * opens the fold around the question the address bar names.
 *
 * the browser scrolls to a fragment before it fires `hashchange`, and on a
 * load before any script has run, so it has already scrolled to wherever the
 * hidden card sat; opening the fold moves the card, and the scroll is redone
 * for the same reason. A question that was never folded is left alone, so a
 * reader who has scrolled on is not pulled back.
 */
function arrive(): void {
  const target = questionAt(location.hash);
  if (!target || !isFolded(target)) return;

  reveal(target);
  target.scrollIntoView({ block: "start" });
}

/**
 * makes every way of arriving at a question open the fold the question sits in.
 *
 * one handler on the document rather than one per kind of link, because the
 * drawer's rows, the bar's chips and a section heading's chips all point at the
 * same `#qs-` anchors and a fourth kind of link added later would otherwise
 * arrive without it. It runs before the browser follows the link, which is why
 * the scroll that follows lands on a card that is open. A fragment reached any
 * other way — a reload after a jump, back and forward, a pasted address — is
 * read from the address bar, on load and on every change.
 * @param onJump what else a followed link does, given the question and the link
 */
export function installJumps(
  onJump: (target: HTMLElement, link: HTMLElement) => void,
): void {
  document.addEventListener("click", (event) => {
    const link = (event.target as HTMLElement | null)?.closest?.<HTMLElement>("a[href]");
    // the href is the one record of where the link points, and the browser is
    // navigating to the same fragment, so the two cannot disagree
    const target = link ? questionAt(link.getAttribute("href") ?? "") : null;
    if (!link || !target) return;

    reveal(target);
    onJump(target, link);
  });

  arrive();
  window.addEventListener("hashchange", arrive);
}
