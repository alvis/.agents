import { describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { installDiagramDetail } from "./detail.ts";

/** what a cloned template reports having appended. */
interface Cloned {
  /** the id of the template the content came from */
  from: string;
}

/**
 * builds a diagram with two detailed nodes and a host
 * @returns the figure, its nodes, and its host
 */
function figure(): {
  root: StubElement;
  nodes: StubElement[];
  host: StubElement & { appended: Cloned[] };
} {
  const nodes = [
    new StubElement("g", { "data-diagram-node": "merge" }),
    new StubElement("g", { "data-diagram-node": "fanout" }),
  ];
  const templates = ["merge", "fanout"].map((id) => {
    const template = new StubElement("template", { "data-diagram-detail": id });
    Object.assign(template, {
      content: { cloneNode: (): Cloned => ({ from: id }) },
    });

    return template;
  });
  const host = Object.assign(
    new StubElement("aside", { "data-diagram-detail-host": "" }),
    {
      appended: [] as Cloned[],
      replaceChildren(): void {
        (this as unknown as { appended: Cloned[] }).appended = [];
      },
      append(node: Cloned): void {
        (this as unknown as { appended: Cloned[] }).appended.push(node);
      },
    },
  );
  const held = new StubElement("figure", { class: "diagram" }, [
    ...nodes,
    host as unknown as StubElement,
    ...templates,
  ]);
  const root = new StubElement("div", {}, [held]);

  return { root, nodes, host: host as StubElement & { appended: Cloned[] } };
}

describe("fn:installDiagramDetail", () => {
  it("should show the chosen node's card", () => {
    const { root, nodes, host } = figure();
    installDiagramDetail(root as unknown as ParentNode);

    nodes[0]!.dispatch("click");

    expect(host.appended).toEqual([{ from: "merge" }]);
  });

  it("should replace the card rather than stack a second one", () => {
    const { root, nodes, host } = figure();
    installDiagramDetail(root as unknown as ParentNode);

    nodes[0]!.dispatch("click");
    nodes[1]!.dispatch("click");

    expect(host.appended).toEqual([{ from: "fanout" }]);
  });

  it("should mark which node the card belongs to", () => {
    const { root, nodes } = figure();
    installDiagramDetail(root as unknown as ParentNode);

    nodes[1]!.dispatch("click");

    expect(nodes.map((node) => node.classList.contains("is-active"))).toEqual([
      false,
      true,
    ]);
  });

  it("should answer the keys that activate a control, since a group has none", () => {
    const { root, nodes, host } = figure();
    installDiagramDetail(root as unknown as ParentNode);
    let prevented = false;

    nodes[0]!.dispatch("keydown", {
      key: "Enter",
      preventDefault: () => {
        prevented = true;
      },
    });

    expect(host.appended).toEqual([{ from: "merge" }]);
    expect(prevented).toBe(true);
  });

  it("should ignore a key that activates nothing", () => {
    const { root, nodes, host } = figure();
    installDiagramDetail(root as unknown as ParentNode);

    nodes[0]!.dispatch("keydown", { key: "x", preventDefault: () => undefined });

    expect(host.appended).toEqual([]);
  });
});
