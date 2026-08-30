import { describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { installSyncGroup } from "./sync.ts";

import type { SyncMember } from "./sync.ts";

/**
 * builds a member carrying a key
 * @param key the group the member belongs to
 * @returns the member, and the element behind it
 */
function member(key: string): SyncMember {
  return { element: new StubElement("span") as unknown as HTMLElement, key };
}

/**
 * reads which members are currently lit
 * @param members the members to read
 * @returns each member's active state, in order
 */
function lit(members: SyncMember[]): boolean[] {
  return members.map((held) => held.element.classList.contains("is-active"));
}

/**
 * raises an event on a member
 * @param held the member to raise on
 * @param type the event type
 */
function raise(held: SyncMember, type: string): void {
  (held.element as unknown as StubElement).dispatch(type);
}

describe("fn:installSyncGroup", () => {
  it("should light every member sharing a key when one is hovered", () => {
    const members = [member("a"), member("a"), member("b")];
    installSyncGroup(members);

    raise(members[0]!, "mouseenter");

    expect(lit(members)).toEqual([true, true, false]);
  });

  it("should unlight the group when the hover leaves", () => {
    const members = [member("a"), member("a")];
    installSyncGroup(members);

    raise(members[0]!, "mouseenter");
    raise(members[0]!, "mouseleave");

    expect(lit(members)).toEqual([false, false]);
  });

  it("should hold the highlight while a second engagement overlaps", () => {
    const members = [member("a"), member("a")];
    installSyncGroup(members);

    raise(members[0]!, "mouseenter");
    raise(members[1]!, "focus");
    raise(members[0]!, "mouseleave");

    expect(lit(members)).toEqual([true, true]);
  });

  it("should drop the highlight only once every engagement has ended", () => {
    const members = [member("a"), member("a")];
    installSyncGroup(members);

    raise(members[0]!, "mouseenter");
    raise(members[1]!, "focus");
    raise(members[0]!, "mouseleave");
    raise(members[1]!, "blur");

    expect(lit(members)).toEqual([false, false]);
  });

  it("should never count an engagement below zero", () => {
    const members = [member("a")];
    installSyncGroup(members);

    // a blur with no matching focus, as a member removed mid-interaction gives
    raise(members[0]!, "mouseleave");
    raise(members[0]!, "mouseenter");

    expect(lit(members)).toEqual([true]);
  });

  it("should ignore a member carrying no key", () => {
    const orphan = { element: new StubElement("span") as unknown as HTMLElement, key: "" };
    const members = [member("a"), orphan];
    installSyncGroup(members);

    raise(orphan, "mouseenter");

    expect(lit(members)).toEqual([false, false]);
  });

  it("should give a keyless member no focus order", () => {
    const orphan = { element: new StubElement("span") as unknown as HTMLElement, key: "" };
    installSyncGroup([orphan], { focusable: true });

    expect(orphan.element.tabIndex).toBe(-1);
  });

  it("should make a non-interactive member reachable when asked", () => {
    const members = [member("a")];
    installSyncGroup(members, { focusable: true });

    expect(members[0]!.element.tabIndex).toBe(0);
  });

  it("should leave an author-declared focus order alone", () => {
    const members = [member("a")];
    members[0]!.element.setAttribute("tabindex", "-1");
    installSyncGroup(members, { focusable: true });

    expect(members[0]!.element.tabIndex).toBe(-1);
  });

  it("should leave a natively focusable member's order alone", () => {
    const button = { element: new StubElement("button") as unknown as HTMLElement, key: "a" };
    button.element.tabIndex = 0;
    installSyncGroup([button], { focusable: true });

    expect(button.element.tabIndex).toBe(0);
  });
});
