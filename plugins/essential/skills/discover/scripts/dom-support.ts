/**
 * a stand-in for `Element.classList`, holding the four calls the runtime makes.
 *
 * a view over the `class` attribute rather than a set beside it, because the
 * DOM keeps the two in step: an element built with `class="diagram"` is one a
 * `.diagram` query finds, and a class added at runtime is one a later query
 * has to see.
 */
export class StubTokenList {
  /**
   * builds the list over an element's attributes
   * @param attributes the attributes carrying the `class` this list presents
   */
  constructor(private readonly attributes: Record<string, string>) {}

  /**
   * the classes currently on the element
   * @returns the class names, in attribute order
   */
  private get held(): string[] {
    return (this.attributes.class ?? "").split(/\s+/).filter(Boolean);
  }

  /**
   * writes the classes back to the attribute a query reads them from
   * @param names the class names to hold
   */
  private hold(names: string[]): void {
    this.attributes.class = names.join(" ");
  }

  /**
   * adds a class
   * @param name the class to add
   */
  add(name: string): void {
    if (!this.contains(name)) this.hold([...this.held, name]);
  }

  /**
   * removes a class
   * @param name the class to remove
   */
  remove(name: string): void {
    this.hold(this.held.filter((held) => held !== name));
  }

  /**
   * reports whether a class is present
   * @param name the class to look for
   * @returns whether the element carries it
   */
  contains(name: string): boolean {
    return this.held.includes(name);
  }

  /**
   * adds or removes a class
   * @param name the class to move
   * @param force whether to add rather than remove
   * @returns whether the class is present afterwards
   */
  toggle(name: string, force?: boolean): boolean {
    const wanted = force ?? !this.contains(name);
    if (wanted) this.add(name);
    else this.remove(name);

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
/**
 * names the attribute a dataset key stands for
 * @param key the camel-cased dataset key
 * @returns the `data-*` attribute name
 */
function attributeOf(key: string): string {
  return `data-${key.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

/**
 * names the dataset key an attribute presents as
 * @param name the `data-*` attribute name
 * @returns the camel-cased key
 */
function keyOf(name: string): string {
  return name
    .slice("data-".length)
    .replaceAll(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * builds the `dataset` view over an element's attributes
 * @param attributes the attributes to present, and to write through to
 * @returns the dataset, live in both directions
 */
function datasetOf(attributes: Record<string, string>): Record<string, string> {
  const held = (key: string | symbol): string =>
    typeof key === "string" ? attributeOf(key) : "";

  return new Proxy({} as Record<string, string>, {
    get: (_, key) => attributes[held(key)],
    set: (_, key, value: string) => {
      attributes[held(key)] = value;

      return true;
    },
    deleteProperty: (_, key) => {
      delete attributes[held(key)];

      return true;
    },
    has: (_, key) => held(key) in attributes,
    ownKeys: () =>
      Object.keys(attributes)
        .filter((name) => name.startsWith("data-"))
        .map(keyOf),
    getOwnPropertyDescriptor: (_, key) =>
      held(key) in attributes
        ? {
            configurable: true,
            enumerable: true,
            value: attributes[held(key)],
          }
        : undefined,
  });
}

export class StubElement {
  /** the element's tag name, lowercased */
  readonly tag: string;
  /** every attribute, including the `data-*` ones `dataset` mirrors */
  readonly attributes: Record<string, string>;
  /**
   * the `data-*` attributes, camel-cased as the DOM presents them.
   *
   * a view over `attributes` rather than a copy of it, because the DOM keeps
   * the two in step both ways: code that writes `dataset.noteEdit` expects a
   * later `[data-note-edit]` selector to find the element, and a snapshot
   * would leave that write invisible to every query.
   */
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

  /**
   * whether the last `focus()` let the browser scroll to this element.
   *
   * a real browser reveals whatever it focuses, which inside a collapsed
   * scroller means scrolling it — so a caller focusing something mid-animation
   * has to say it does not want that, and a test has to be able to read it.
   */
  focusScrolled = false;
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
  readonly classList: StubTokenList;

  /**
   * the `class` attribute as text, which is the other name the DOM gives it
   * @returns the class attribute, or empty where the element carries none
   */
  get className(): string {
    return this.attributes.class ?? "";
  }

  /**
   * sets the whole `class` attribute
   * @param held the classes to hold, space-separated
   */
  set className(held: string) {
    this.attributes.class = held;
  }
  /** the element's keyboard order, defaulting to unreachable as a div is */
  tabIndex = -1;

  /**
   * the inline styles the runtime writes, by property name.
   *
   * a plain record rather than a declaration: nothing here reads a style back
   * as the browser computes it, so what a test needs is the value the runtime
   * wrote, under the name it wrote it as.
   */
  readonly style: Record<string, string> = {};

  /** the element's laid-out width, which a test sets to the column it is read in */
  clientWidth = 0;

  /**
   * how wide the element's content is, which a test sets to overflow it.
   *
   * zero by default, matching `clientWidth`, so an element no test has laid out
   * reports a scroller with nothing hidden rather than one hiding its content.
   */
  scrollWidth = 0;

  /** how far a scroller has been scrolled sideways, as the runtime moves it */
  scrollLeft = 0;

  /**
   * where the element sits, which a test sets before driving a pointer.
   *
   * zeroed by default, as an element that has never been laid out reports.
   */
  box = { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 };

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
    this.classList = new StubTokenList(this.attributes);
    this.dataset = datasetOf(this.attributes);
  }

  /** the element that holds this one, under the name the DOM gives it */
  get parentElement(): StubElement | null {
    return this.parent;
  }

  /**
   * tests a selector against this element.
   *
   * commas are alternatives and spaces are descendant steps, because reading
   * either as one compound is how a stub silently agrees with a query the
   * browser would refuse: `"a,button,[tabindex]"` would demand all three of a
   * single element, and `".drawer-nav a"` — parsing to nothing — would match
   * every element there is.
   * @param selector one or more comma-separated descendant selectors
   * @returns whether any alternative holds
   */
  matches(selector: string): boolean {
    return selector.split(",").some((group) => this.descends(group.trim()));
  }

  /**
   * tests one descendant selector, rightmost part first
   * @param group a selector with no commas, such as `".drawer-nav a"`
   * @returns whether this element ends a matching chain
   */
  private descends(group: string): boolean {
    const parts = group.split(/\s+/).filter(Boolean);
    const own = parts.pop();
    if (!own || !this.fits(own)) return false;

    // nearest-ancestor-first is complete for descendant steps: taking the
    // closer match only widens what remains available to the parts left of it
    let node = this.parent;
    for (const part of parts.reverse()) {
      while (node && !node.fits(part)) node = node.parent;
      if (!node) return false;
      node = node.parent;
    }

    return true;
  }

  /**
   * tests one compound selector against this element alone
   * @param compound a tag, `.class`, `#id`, `:checked`, or `[name]`/`[name="value"]` clauses
   * @returns whether every clause holds
   */
  private fits(compound: string): boolean {
    const clauses =
      compound.match(/^[a-z][a-z0-9-]*|\.[\w-]+|#[\w-]+|:checked|\[[^\]]+\]/g) ?? [];
    // an unparsed selector matches nothing, rather than everything an empty
    // clause list would agree with
    if (!clauses.length) return false;

    return clauses.every((clause) => {
      if (clause === ":checked") return this.checked;
      if (clause.startsWith(".")) return this.classList.contains(clause.slice(1));
      if (clause.startsWith("#")) return this.attributes.id === clause.slice(1);
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
   * moves nodes to the end of this element's children
   * @param nodes the nodes to move, in the order they should land
   */
  append(...nodes: StubElement[]): void {
    for (const node of nodes) {
      detach(node);
      node.parent = this;
      this.children.push(node);
    }
  }

  /**
   * drops every child and puts these in their place
   * @param nodes the nodes to hold, in document order
   */
  replaceChildren(...nodes: StubElement[]): void {
    for (const child of this.children) child.parent = null;
    this.children.length = 0;
    this.append(...nodes);
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
   * reports where the element sits
   * @returns the box a test set, or a zeroed one where it set none
   */
  getBoundingClientRect(): StubElement["box"] {
    return this.box;
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

  /**
   * records that the element was focused.
   * @param options how the browser should scroll to the newly focused element
   */
  focus(options?: { preventScroll?: boolean }): void {
    this.focused = true;
    this.focusScrolled = !options?.preventScroll;
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
