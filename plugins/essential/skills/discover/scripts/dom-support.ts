/**
 * a stand-in for `Element.classList`, holding the four calls the runtime makes.
 *
 * a set rather than a string, because every caller here asks whether a class is
 * present or toggles one; none of them reads the attribute back as text.
 */
export class StubTokenList {
  /** the classes currently on the element */
  private readonly held = new Set<string>();

  /**
   * adds a class
   * @param name the class to add
   */
  add(name: string): void {
    this.held.add(name);
  }

  /**
   * removes a class
   * @param name the class to remove
   */
  remove(name: string): void {
    this.held.delete(name);
  }

  /**
   * reports whether a class is present
   * @param name the class to look for
   * @returns whether the element carries it
   */
  contains(name: string): boolean {
    return this.held.has(name);
  }

  /**
   * adds or removes a class
   * @param name the class to move
   * @param force whether to add rather than remove
   * @returns whether the class is present afterwards
   */
  toggle(name: string, force?: boolean): boolean {
    const wanted = force ?? !this.held.has(name);
    if (wanted) this.held.add(name);
    else this.held.delete(name);

    return wanted;
  }
}

/**
 * takes a node out of wherever it sits, so a move never leaves a copy behind
 * @param node the node to detach
 */
function detach(node: StubElement): void {
  const held = node.parent?.children;
  if (held) held.splice(held.indexOf(node), 1);

  node.parent = null;
}

/**
 * a minimal element stand-in for exercising the runtime's field logic.
 *
 * this repository ships no dependencies, so there is no DOM to test against.
 * The stub covers only what `render-page/runtime/answer.ts` reaches for: a
 * tag, attributes, a dataset, text, listeners, and the handful of selectors
 * those modules use. It proves the branching, not the browser — layout,
 * cascade, and focus order are proven by driving a rendered page instead.
 */
export class StubElement {
  /** the element's tag name, lowercased */
  readonly tag: string;
  /** every attribute, including the `data-*` ones `dataset` mirrors */
  readonly attributes: Record<string, string>;
  /** the `data-*` attributes, camel-cased as the DOM presents them */
  readonly dataset: Record<string, string>;
  /** children, in document order; the stub has no deeper tree than this */
  readonly children: StubElement[];
  /** whether a checkable input is checked */
  checked = false;
  /** the value a control carries */
  value = "";
  /** whether the element is hidden */
  hidden = false;
  /** whether `focus()` has been called on this element */
  focused = false;
  /** whether `scrollIntoView()` has been called on this element */
  scrolled = false;
  /** the element that holds this one, set as the tree is built */
  parent: StubElement | null = null;
  /** the element's text, as the runtime sets it */
  textContent = "";

  /** whether the reader can type into the element itself */
  isContentEditable = false;

  /** whether a dialog is showing, kept in step with its attribute */
  open: boolean;

  /** the element's classes, as the DOM's token list presents them */
  readonly classList = new StubTokenList();
  /** the element's keyboard order, defaulting to unreachable as a div is */
  tabIndex = -1;

  /** every handler registered here, by event type */
  private readonly handlers: Record<string, ((event: unknown) => void)[]> = {};

  /**
   * the tag as the DOM reports it, upper-cased
   * @returns the upper-cased tag name
   */
  get tagName(): string {
    return this.tag.toUpperCase();
  }

  /**
   * builds one element
   * @param tag the element's tag name
   * @param attributes its attributes, `data-*` included
   * @param children its children, in document order
   */
  constructor(
    tag: string,
    attributes: Record<string, string> = {},
    children: StubElement[] = [],
  ) {
    this.tag = tag;
    this.attributes = attributes;
    this.children = children;
    this.open = "open" in attributes;
    for (const child of children) child.parent = this;
    this.dataset = Object.fromEntries(
      Object.entries(attributes)
        .filter(([name]) => name.startsWith("data-"))
        .map(([name, held]) => [
          name
            .slice("data-".length)
            .replaceAll(/-([a-z])/g, (_, letter: string) =>
              letter.toUpperCase(),
            ),
          held,
        ]),
    );
  }

  /** the element that holds this one, under the name the DOM gives it */
  get parentElement(): StubElement | null {
    return this.parent;
  }

  /**
   * tests one compound selector against this element
   * @param selector a tag, `:checked`, or `[name]`/`[name="value"]` clauses
   * @returns whether every clause holds
   */
  matches(selector: string): boolean {
    const clauses = selector.match(/^[a-z]+|:checked|\[[^\]]+\]/g) ?? [];

    return clauses.every((clause) => {
      if (clause === ":checked") return this.checked;
      if (!clause.startsWith("[")) return this.tag === clause;

      const [, name, held] =
        /^\[([^=\]]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(clause) ?? [];

      return held === undefined
        ? name in this.attributes
        : this.attributes[name] === held;
    });
  }

  /**
   * finds every descendant matching a selector, in document order
   * @param selector the selector to match
   * @returns the matching descendants, this element excluded
   */
  querySelectorAll(selector: string): StubElement[] {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }

  /**
   * finds the first descendant matching a selector
   * @param selector the selector to match
   * @returns the match, or null when nothing matches
   */
  querySelector(selector: string): StubElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  /**
   * walks up from this element to the nearest match, this element included
   * @param selector the selector to match
   * @returns the match, or null when no ancestor matches
   */
  closest(selector: string): StubElement | null {
    for (let node: StubElement | null = this; node; node = node.parent)
      if (node.matches(selector)) return node;

    return null;
  }

  /**
   * the element that follows this one under the same parent
   * @returns the next sibling, or null where this is the last
   */
  get nextElementSibling(): StubElement | null {
    return this.sibling(1);
  }

  /**
   * the element that precedes this one under the same parent
   * @returns the previous sibling, or null where this is the first
   */
  get previousElementSibling(): StubElement | null {
    return this.sibling(-1);
  }

  /**
   * reads a sibling by how far along it sits
   * @param step how many places away, signed
   * @returns the sibling, or null where there is none that far along
   */
  private sibling(step: number): StubElement | null {
    const held = this.parent?.children;
    if (!held) return null;

    return held[held.indexOf(this) + step] ?? null;
  }

  /**
   * moves a node next to this one.
   *
   * the landing place is read after the node is detached rather than before,
   * because moving an earlier sibling later pulls this element down one; an
   * index taken first would put the node a place beyond where the DOM puts it.
   * @param node the node to move
   * @param offset 0 to land before this element, 1 to land after it
   */
  private place(node: StubElement, offset: number): void {
    const parent = this.parent;
    if (!parent) return;

    detach(node);
    node.parent = parent;
    parent.children.splice(parent.children.indexOf(this) + offset, 0, node);
  }

  /**
   * moves a node to just after this one
   * @param node the node to move
   */
  after(node: StubElement): void {
    this.place(node, 1);
  }

  /**
   * moves a node to just before this one
   * @param node the node to move
   */
  before(node: StubElement): void {
    this.place(node, 0);
  }

  /**
   * moves a node to the end of this element's children
   * @param node the node to move
   */
  append(node: StubElement): void {
    detach(node);
    node.parent = this;
    this.children.push(node);
  }

  /**
   * reads an attribute
   * @param name the attribute's name
   * @returns the value, or null when the element does not carry it
   */
  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  /**
   * reports whether the element carries an attribute
   * @param name the attribute's name
   * @returns whether it is set
   */
  hasAttribute(name: string): boolean {
    return name in this.attributes;
  }

  /**
   * drops an attribute
   * @param name the attribute's name
   */
  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  /**
   * registers a handler, as the DOM does
   * @param type the event type to listen for
   * @param handler what to run when it arrives
   */
  addEventListener(type: string, handler: (event: unknown) => void): void {
    (this.handlers[type] ??= []).push(handler);
  }

  /**
   * runs every handler registered for an event type
   * @param type the event type to raise
   * @param event the event handed to each handler
   */
  dispatch(type: string, event: unknown = { target: this }): void {
    for (const handler of this.handlers[type] ?? []) handler(event);
  }

  /** shows a dialog modally, as the DOM's own call does. */
  showModal(): void {
    this.open = true;
    this.attributes.open = "";
  }

  /**
   * closes a dialog.
   *
   * the event fires only where there was something to close, which is what the
   * DOM does and what a caller closing an already-closed dialog depends on.
   */
  close(): void {
    if (!this.open) return;

    this.open = false;
    delete this.attributes.open;
    this.dispatch("close");
  }

  /** records that the element was focused. */
  focus(): void {
    this.focused = true;
  }

  /** records that the element was scrolled to. */
  scrollIntoView(): void {
    this.scrolled = true;
  }

  /**
   * activates the element as a click would, moving a checkable control first.
   *
   * a radio and a checkbox move differently under the same call, and the
   * events follow the move rather than the other way round, which is what the
   * page's own delegated listeners depend on
   */
  click(): void {
    if (this.tag === "input")
      this.checked = this.attributes.type === "checkbox" ? !this.checked : true;

    for (const type of ["click", "input", "change"]) this.dispatch(type);
  }

  /**
   * sets an attribute, keeping `dataset` in step
   * @param name the attribute's name
   * @param held the value to set
   */
  setAttribute(name: string, held: string): void {
    this.attributes[name] = held;
  }
}
