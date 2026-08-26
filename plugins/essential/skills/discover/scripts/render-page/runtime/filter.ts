/**
 * reads the tags an item carries
 * @param item the filterable item
 * @returns its tags
 */
function tagsOf(item: HTMLElement): string[] {
  return (item.dataset.filterItem ?? "").split(/\s+/).filter(Boolean);
}

/**
 * wires chip bars that dim what they do not match.
 *
 * dimming rather than hiding is the whole point: a filtered list that shrinks
 * tells the reader the other findings went away, and a count beside a chip that
 * changes with the selection stops meaning anything. Everything stays on the
 * page, in place, and the counts stay what the data says they are.
 * @param root where to look for chip bars
 */
export function installFilters(root: ParentNode = document): void {
  for (const bar of root.querySelectorAll<HTMLElement>("[data-filter-chips]")) {
    const chips = [...bar.querySelectorAll<HTMLElement>("[data-filter]")];
    // the bar's own parent, so two filtered lists in one section keep their
    // chips over their own items
    const scope = bar.parentElement ?? bar;
    const items = [...scope.querySelectorAll<HTMLElement>("[data-filter-item]")];
    if (!chips.length || !items.length) continue;

    /**
     * applies one chip's selection
     * @param value the chip's filter value
     */
    const apply = (value: string): void => {
      for (const chip of chips)
        chip.setAttribute("aria-pressed", String(chip.dataset.filter === value));

      for (const item of items)
        item.classList.toggle(
          "is-dimmed",
          Boolean(value) && value !== "all" && !tagsOf(item).includes(value),
        );
    };

    for (const chip of chips)
      chip.addEventListener("click", () => {
        apply(chip.dataset.filter ?? "all");
      });
  }
}
