/** one element in a synchronized-highlight group. */
export interface SyncMember {
  /** the element to light */
  element: HTMLElement;
  /** the group it belongs to; an empty key opts the element out */
  key: string;
}

/** how a group treats members the keyboard cannot otherwise reach. */
export interface SyncOptions {
  /** whether to give a member with no focus order one */
  focusable?: boolean;
}

/** the class every lit member carries. */
const ACTIVE = "is-active";

/**
 * lights every member of a group whenever any one of them is hovered or focused.
 *
 * this is the one primitive behind author pins, glossary terms, code pairs and
 * code maps: they differ only in which elements carry which key. Engagement is
 * reference-counted, because hovering a member and then tabbing to it are two
 * separate engagements, and releasing either one first must not take the
 * highlight away while the other still holds it.
 *
 * lighting is a class toggle and nothing else, so a group is reduced-motion
 * safe by construction: whether `.is-active` animates is the stylesheet's
 * decision, made where the media query lives.
 * @param members every element in every group, keyed
 * @param options whether to make unreachable members focusable
 */
export function installSyncGroup(
  members: SyncMember[],
  options: SyncOptions = {},
): void {
  const groups = new Map<string, HTMLElement[]>();
  for (const { element, key } of members)
    if (key) groups.set(key, [...(groups.get(key) ?? []), element]);

  const engaged = new Map<string, number>();

  /**
   * lights or unlights every member of one group
   * @param key the group to move
   * @param active whether the group is lit
   */
  function paint(key: string, active: boolean): void {
    for (const element of groups.get(key) ?? [])
      element.classList.toggle(ACTIVE, active);
  }

  /**
   * counts one engagement onto a group, lighting it on the first
   * @param key the group being engaged
   */
  function engage(key: string): void {
    const next = (engaged.get(key) ?? 0) + 1;
    engaged.set(key, next);
    if (next === 1) paint(key, true);
  }

  /**
   * counts one engagement off a group, unlighting it on the last.
   *
   * the floor at zero is what keeps a stray release — a blur with no focus, a
   * pointer that left while the element was being replaced — from driving the
   * count negative, where the next real engagement would not reach one and the
   * group would stop lighting altogether
   * @param key the group being released
   */
  function release(key: string): void {
    const next = Math.max(0, (engaged.get(key) ?? 0) - 1);
    engaged.set(key, next);
    if (next === 0) paint(key, false);
  }

  for (const { element, key } of members) {
    if (!key) continue;

    // a span or a list item has no focus order of its own, so a group made of
    // them would light on hover and be invisible to the keyboard entirely
    if (options.focusable && !element.hasAttribute("tabindex") && element.tabIndex < 0)
      element.tabIndex = 0;

    element.addEventListener("mouseenter", () => engage(key));
    element.addEventListener("mouseleave", () => release(key));
    element.addEventListener("focus", () => engage(key));
    element.addEventListener("blur", () => release(key));
  }
}
