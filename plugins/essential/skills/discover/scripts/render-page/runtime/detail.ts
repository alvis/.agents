/**
 * lets a diagram's boxes explain themselves, one at a time.
 *
 * the detail is cloned from a `<template>` rather than assembled from a string,
 * so the page never builds markup at runtime and nothing in the data can become
 * an element that was not already one when the file was written.
 * @param root where to look for a detailed diagram
 */
export function installDiagramDetail(root: ParentNode = document): void {
  for (const figure of root.querySelectorAll<HTMLElement>(".diagram")) {
    const host = figure.querySelector<HTMLElement>("[data-diagram-detail-host]");
    const nodes = [...figure.querySelectorAll<HTMLElement>("[data-diagram-node]")];
    if (!host || !nodes.length) continue;

    const cards = new Map(
      [...figure.querySelectorAll<HTMLTemplateElement>("template[data-diagram-detail]")].map(
        (template) => [template.dataset.diagramDetail ?? "", template],
      ),
    );

    /**
     * shows one box's detail, and marks which box it belongs to
     * @param node the box the reader chose
     */
    const show = (node: HTMLElement): void => {
      for (const other of nodes) other.classList.toggle("is-active", other === node);

      const card = cards.get(node.dataset.diagramNode ?? "");
      host.replaceChildren();
      if (card) host.append(card.content.cloneNode(true));
    };

    for (const node of nodes) {
      node.addEventListener("click", () => {
        show(node);
      });
      // an SVG group is not a button and gets none of a button's key handling,
      // so the two keys that activate one are wired here by hand
      node.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;

        event.preventDefault();
        show(node);
      });
    }
  }
}
