(() => {
  "use strict";

  globalThis.__transitionCheckDomains ??= {};
  globalThis.__transitionCheckDomains.overlays = {
    "menu-dropdown": {
      primary: checkMenuDropdownPrimary,
      replay: checkMenuDropdownReplay,
      disposed: checkMenuDropdownDisposed,
      controlledReduce: checkMenuDropdownControlledReduce,
    },
    modal: {
      primary: checkModalPrimary,
      replay: checkModalReplay,
      disposed: checkModalDisposed,
      controlledReduce: checkModalControlledReduce,
    },
    "plus-menu-morph": {
      primary: checkPlusMenuMorphPrimary,
      replay: checkPlusMenuMorphReplay,
      disposed: checkPlusMenuMorphDisposed,
      controlledReduce: checkPlusMenuMorphControlledReduce,
    },
    tooltip: {
      primary: checkTooltipPrimary,
      replay: checkTooltipReplay,
      disposed: checkTooltipDisposed,
    },
  };

  async function checkMenuDropdownPrimary(t) {
    const trigger = t.find('[aria-controls="project-actions"]');
    const menu = t.find("#project-actions");
    const items = t.all('[role="menuitem"]');
    const icon = trigger.querySelector("svg");

    t.check("menu starts collapsed", trigger.getAttribute("aria-expanded") === "false");
    t.check(
      "menu starts semantically unavailable",
      menu.hidden && menu.inert && menu.getAttribute("aria-hidden") === "true",
    );
    t.check(
      "menu starts with one roving tab stop",
      items[0].tabIndex === 0 && items.slice(1).every((item) => item.tabIndex === -1),
    );
    t.expectTransition(icon, ["rotate"]);
    t.expectTransition(menu, ["opacity", "scale"]);

    t.key(trigger, "ArrowDown");
    await t.frame(2);
    t.check(
      "Arrow Down opens the menu",
      trigger.getAttribute("aria-expanded") === "true" &&
        menu.dataset.state === "open" &&
        !menu.hidden &&
        !menu.inert &&
        menu.getAttribute("aria-hidden") === "false",
    );
    t.check("Arrow Down focuses the first item", document.activeElement === items[0]);

    t.key(items[0], "ArrowUp");
    t.check("Arrow Up wraps to the last item", document.activeElement === items.at(-1));
    t.key(items.at(-1), "Home");
    t.check("Home focuses the first item", document.activeElement === items[0]);
    t.key(items[0], "End");
    t.check("End focuses the last item", document.activeElement === items.at(-1));
    t.key(items.at(-1), "ArrowDown");
    t.check(
      "Arrow Down wraps focus and the roving tab stop to the first item",
      document.activeElement === items[0] &&
        items[0].tabIndex === 0 &&
        items.slice(1).every((item) => item.tabIndex === -1),
    );

    t.key(items[0], "Escape");
    await t.wait(180);
    t.check(
      "Escape reaches the final closed state",
      trigger.getAttribute("aria-expanded") === "false" &&
        menu.dataset.state === "closed" &&
        menu.hidden &&
        menu.inert &&
        menu.getAttribute("aria-hidden") === "true",
    );
    t.check("Escape restores trigger focus", document.activeElement === trigger);

    trigger.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
    await t.frame(2);
    t.check(
      "pointer activation opens without moving focus into the menu",
      menu.dataset.state === "open" &&
        document.activeElement === trigger &&
        items[0].tabIndex === 0 &&
        items.slice(1).every((item) => item.tabIndex === -1),
    );
    t.pointer(t.root, "pointerdown", { pointerType: "mouse" });
    await t.wait(180);
    t.check("an outside pointer press closes the menu", menu.hidden && menu.inert);
    t.check("outside dismissal does not steal focus", document.activeElement === trigger);
  }

  async function checkMenuDropdownReplay(t) {
    const trigger = t.find('[aria-controls="project-actions"]');
    const menu = t.find("#project-actions");
    const items = t.all('[role="menuitem"]');

    trigger.focus();
    t.key(trigger, "Enter");
    t.check("synthetic Enter awaits native activation", menu.hidden);
    trigger.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
    );
    await t.frame(2);
    t.check(
      "Enter activation opens and focuses the first roving item",
      menu.dataset.state === "open" &&
        document.activeElement === items[0] &&
        items[0].tabIndex === 0 &&
        items.slice(1).every((item) => item.tabIndex === -1),
    );
    t.key(items[0], "Escape");
    await t.wait(180);

    t.key(trigger, " ");
    t.check("synthetic Space awaits native activation", menu.hidden);
    trigger.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
    );
    await t.frame(2);
    t.check(
      "Space activation opens and focuses the first roving item",
      menu.dataset.state === "open" &&
        document.activeElement === items[0] &&
        items[0].tabIndex === 0 &&
        items.slice(1).every((item) => item.tabIndex === -1),
    );

    trigger.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
    );
    t.check("a second activation starts the exit", menu.dataset.state === "closing");
    await t.wait(20);
    trigger.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
    );
    await t.frame(2);
    await t.wait(180);
    t.check(
      "reopening wins over the stale close timer",
      trigger.getAttribute("aria-expanded") === "true" &&
        menu.dataset.state === "open" &&
        !menu.hidden &&
        !menu.inert,
    );

    t.click(items[0]);
    await t.wait(180);
    t.check("an item activation closes the replayed menu", menu.hidden && menu.inert);
    t.check("item activation returns focus to the trigger", document.activeElement === trigger);
  }

  async function checkMenuDropdownDisposed(t) {
    const trigger = t.find('[aria-controls="project-actions"]');
    const menu = t.find("#project-actions");
    const before = t.fingerprint(menu);

    t.click(trigger);
    t.key(trigger, "ArrowDown");
    t.pointer(t.root, "pointerdown", { pointerType: "mouse" });
    await t.frame(2);
    await t.wait(180);
    t.check("disposed menu listeners stop responding", t.fingerprint(menu) === before);
    t.check(
      "disposed menu stays reset",
      trigger.getAttribute("aria-expanded") === "false" && menu.hidden && menu.inert,
    );
  }

  async function checkMenuDropdownControlledReduce(t) {
    const trigger = t.find('[aria-controls="project-actions"]');
    const menu = t.find("#project-actions");

    t.click(trigger);
    await t.frame(2);
    t.click(trigger);
    t.check("menu exit is in progress before preference changes", menu.dataset.state === "closing");
    t.setReduced(true);
    await t.frame();
    t.check(
      "enabling reduced motion finishes the menu exit",
      trigger.getAttribute("aria-expanded") === "false" &&
        menu.dataset.state === "closed" &&
        menu.hidden &&
        menu.inert &&
        menu.getAttribute("aria-hidden") === "true",
    );
  }

  async function checkModalPrimary(t) {
    const openButton = t.find("[data-open-modal]");
    const dialog = t.find("#discard-dialog");
    const cancelButton = t.find('[data-dialog-action="cancel"]');
    const discardButton = t.find('[data-dialog-action="discard"]');
    const result = t.find("[data-result]");

    t.check("dialog starts outside the top layer", !dialog.open && dialog.dataset.state === "closed");
    t.expectTransition(dialog, ["opacity", "scale"]);

    t.click(openButton);
    await t.frame(2);
    t.check("opener displays the modal", dialog.open && dialog.dataset.state === "open");
    t.check("autofocus lands on Keep editing", document.activeElement === cancelButton);
    openButton.focus();
    await t.frame();
    t.check("the modal blocks background focus", dialog.contains(document.activeElement));

    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    await t.wait(180);
    t.check(
      "Escape cancellation closes the native dialog",
      !dialog.open && dialog.dataset.state === "closed" && dialog.returnValue === "cancel",
    );
    t.check("Escape cancellation restores opener focus", document.activeElement === openButton);

    t.click(openButton);
    await t.frame(2);
    t.click(discardButton);
    await t.wait(180);
    t.check("discard updates the result", result.textContent === "Draft discarded.");
    t.check(
      "discard closes with its return value",
      !dialog.open && dialog.dataset.state === "closed" && dialog.returnValue === "discard",
    );
    t.check("discard restores opener focus", document.activeElement === openButton);

    t.click(openButton);
    await t.frame(2);
    dialog.click();
    await t.wait(180);
    t.check("a backdrop-targeted click closes the dialog", !dialog.open);
  }

  async function checkModalReplay(t) {
    const openButton = t.find("[data-open-modal]");
    const dialog = t.find("#discard-dialog");
    const cancelButton = t.find('[data-dialog-action="cancel"]');

    t.click(openButton);
    await t.frame(2);
    t.click(cancelButton);
    t.check("modal exit enters its closing state", dialog.open && dialog.dataset.state === "closing");
    await t.wait(20);
    openButton.click();
    await t.frame(2);
    await t.wait(180);
    t.check(
      "an interrupted modal exit stays reopened",
      dialog.open && dialog.dataset.state === "open",
    );

    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    await t.wait(180);
    t.click(openButton);
    await t.frame(2);
    t.check("modal replays from the closed state", dialog.open && dialog.dataset.state === "open");
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    await t.wait(180);
    t.check("replayed modal returns to its final closed state", !dialog.open);
  }

  async function checkModalDisposed(t) {
    const openButton = t.find("[data-open-modal]");
    const dialog = t.find("#discard-dialog");
    const before = t.fingerprint(dialog);

    t.click(openButton);
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    await t.frame(2);
    await t.wait(180);
    t.check("disposed modal listeners stop responding", t.fingerprint(dialog) === before);
    t.check("disposed modal stays outside the top layer", !dialog.open && dialog.dataset.state === "closed");
  }

  async function checkModalControlledReduce(t) {
    const openButton = t.find("[data-open-modal]");
    const dialog = t.find("#discard-dialog");
    const cancelButton = t.find('[data-dialog-action="cancel"]');

    t.click(openButton);
    await t.frame(2);
    t.click(cancelButton);
    t.check("modal exit is in progress before preference changes", dialog.dataset.state === "closing");
    t.setReduced(true);
    await t.frame();
    t.check(
      "enabling reduced motion finishes the modal exit",
      !dialog.open && dialog.dataset.state === "closed" && dialog.returnValue === "cancel",
    );
    t.check("the immediate modal exit restores opener focus", document.activeElement === openButton);
  }

  async function checkPlusMenuMorphPrimary(t) {
    const morph = t.find("[data-morph]");
    const trigger = t.find('[aria-controls="create-menu"]');
    const menu = t.find("#create-menu");
    const items = t.all('[role="menuitem"]');
    const icon = trigger.querySelector("svg");

    t.check(
      "morph starts as a compact unavailable menu",
      morph.dataset.state === "closed" &&
        trigger.getAttribute("aria-expanded") === "false" &&
        menu.hidden &&
        menu.inert,
    );
    t.check(
      "morph starts with one roving tab stop",
      items[0].tabIndex === 0 && items.slice(1).every((item) => item.tabIndex === -1),
    );
    t.expectTransition(morph, ["width", "height", "border-radius"]);
    t.expectTransition(menu, ["opacity", "translate", "scale", "filter"]);
    t.expectTransition(icon, ["rotate"]);

    t.key(trigger, "ArrowDown");
    await t.frame(2);
    t.check(
      "Arrow Down expands the morph",
      morph.dataset.state === "open" &&
        trigger.getAttribute("aria-expanded") === "true" &&
        trigger.getAttribute("aria-label") === "Close create menu" &&
        !menu.hidden &&
        !menu.inert &&
        menu.getAttribute("aria-hidden") === "false",
    );
    t.check("Arrow Down focuses the first morph item", document.activeElement === items[0]);
    t.key(items[0], "ArrowDown");
    t.check("Arrow Down advances morph menu focus", document.activeElement === items[1]);
    t.key(items[1], "End");
    t.check("End focuses the last morph item", document.activeElement === items.at(-1));
    t.key(items.at(-1), "Home");
    t.check(
      "Home moves focus and the morph roving tab stop to the first item",
      document.activeElement === items[0] &&
        items[0].tabIndex === 0 &&
        items.slice(1).every((item) => item.tabIndex === -1),
    );

    t.key(items[0], "Escape");
    await t.wait(280);
    t.check(
      "Escape compacts the morph and resets semantics",
      morph.dataset.state === "closed" &&
        trigger.getAttribute("aria-expanded") === "false" &&
        trigger.getAttribute("aria-label") === "Open create menu" &&
        menu.hidden &&
        menu.inert &&
        menu.getAttribute("aria-hidden") === "true",
    );
    t.check("Escape restores morph trigger focus", document.activeElement === trigger);

    trigger.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
    await t.frame(2);
    t.check(
      "pointer activation expands without moving focus into the morph menu",
      morph.dataset.state === "open" &&
        document.activeElement === trigger &&
        items[0].tabIndex === 0 &&
        items.slice(1).every((item) => item.tabIndex === -1),
    );
    t.pointer(t.root, "pointerdown", { pointerType: "mouse" });
    await t.wait(280);
    t.check("an outside pointer press compacts the morph", morph.dataset.state === "closed");
  }

  async function checkPlusMenuMorphReplay(t) {
    const morph = t.find("[data-morph]");
    const trigger = t.find('[aria-controls="create-menu"]');
    const menu = t.find("#create-menu");
    const items = t.all('[role="menuitem"]');

    trigger.focus();
    t.key(trigger, "Enter");
    t.check("synthetic Enter awaits native morph activation", menu.hidden);
    trigger.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
    );
    await t.frame(2);
    t.check(
      "Enter activation expands and focuses the first roving morph item",
      morph.dataset.state === "open" &&
        document.activeElement === items[0] &&
        items[0].tabIndex === 0 &&
        items.slice(1).every((item) => item.tabIndex === -1),
    );
    t.key(items[0], "Escape");
    await t.wait(280);

    t.key(trigger, " ");
    t.check("synthetic Space awaits native morph activation", menu.hidden);
    trigger.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
    );
    await t.frame(2);
    t.check(
      "Space activation expands and focuses the first roving morph item",
      morph.dataset.state === "open" &&
        document.activeElement === items[0] &&
        items[0].tabIndex === 0 &&
        items.slice(1).every((item) => item.tabIndex === -1),
    );

    trigger.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
    );
    t.check("a second morph activation starts the exit", morph.dataset.state === "closing");
    await t.wait(20);
    trigger.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
    );
    await t.frame(2);
    await t.wait(280);
    t.check(
      "reopening the morph wins over the stale close timer",
      morph.dataset.state === "open" &&
        trigger.getAttribute("aria-expanded") === "true" &&
        !menu.hidden &&
        !menu.inert,
    );

    trigger.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
    );
    await t.wait(280);
    t.check("replayed morph reaches its compact final state", morph.dataset.state === "closed");
  }

  async function checkPlusMenuMorphDisposed(t) {
    const morph = t.find("[data-morph]");
    const trigger = t.find('[aria-controls="create-menu"]');
    const menu = t.find("#create-menu");
    const before = t.fingerprint(morph);

    t.click(trigger);
    t.key(trigger, "ArrowDown");
    t.pointer(t.root, "pointerdown", { pointerType: "mouse" });
    await t.frame(2);
    await t.wait(280);
    t.check("disposed morph listeners stop responding", t.fingerprint(morph) === before);
    t.check(
      "disposed morph stays reset",
      morph.dataset.state === "closed" &&
        trigger.getAttribute("aria-expanded") === "false" &&
        menu.hidden &&
        menu.inert,
    );
  }

  async function checkPlusMenuMorphControlledReduce(t) {
    const morph = t.find("[data-morph]");
    const trigger = t.find('[aria-controls="create-menu"]');
    const menu = t.find("#create-menu");

    t.click(trigger);
    await t.frame(2);
    t.click(trigger);
    t.check("morph exit is in progress before preference changes", morph.dataset.state === "closing");
    t.setReduced(true);
    await t.frame();
    t.check(
      "enabling reduced motion finishes the morph exit",
      morph.dataset.state === "closed" &&
        trigger.getAttribute("aria-expanded") === "false" &&
        trigger.getAttribute("aria-label") === "Open create menu" &&
        menu.hidden &&
        menu.inert &&
        menu.getAttribute("aria-hidden") === "true",
    );
  }

  async function checkTooltipPrimary(t) {
    const group = t.find("[data-tooltip-group]");
    const tooltip = t.find("#toolbar-tooltip");
    const tooltipText = t.find("[data-tooltip-text]");
    const triggers = t.all("[data-tooltip]");

    t.check(
      "tooltip starts semantically hidden",
      group.dataset.state !== "open" &&
        tooltip.dataset.state === "closed" &&
        tooltip.getAttribute("aria-hidden") === "true",
    );
    t.check(
      "tooltip triggers retain accessible names",
      triggers.map((trigger) => trigger.getAttribute("aria-label")).join("|") ===
        "Copy link|Share project|Open settings",
    );
    t.expectTransition(tooltip, ["translate", "width"]);
    t.expectTransition(tooltipText, ["opacity", "scale"]);

    t.pointer(triggers[0], "pointerenter", { pointerType: "mouse" });
    await t.frame();
    t.check(
      "pointer hover opens the shared tooltip",
      group.dataset.state === "open" &&
        tooltip.dataset.state === "open" &&
        tooltip.getAttribute("aria-hidden") === "false" &&
        tooltipText.textContent === "Copy link",
    );
    const firstWidth = tooltip.style.getPropertyValue("--tooltip-width");
    const firstOffset = tooltip.style.getPropertyValue("--tooltip-x");

    t.pointer(triggers.at(-1), "pointerenter", { pointerType: "mouse" });
    await t.frame();
    t.check("moving between triggers updates the label", tooltipText.textContent === "Open settings");
    t.check(
      "moving between triggers updates bubble geometry",
      tooltip.style.getPropertyValue("--tooltip-width") !== firstWidth ||
        tooltip.style.getPropertyValue("--tooltip-x") !== firstOffset,
    );
    t.pointer(group, "pointerleave", { pointerType: "mouse" });
    t.check(
      "leaving the toolbar hides the tooltip",
      tooltip.dataset.state === "closed" && tooltip.getAttribute("aria-hidden") === "true",
    );

    const activeLabelBeforeFocus = document.activeElement?.getAttribute?.("aria-label");
    triggers[1].focus();
    await t.frame();
    t.check(
      "keyboard focus opens the matching tooltip",
      document.activeElement === triggers[1] &&
        tooltip.dataset.state === "open" &&
        tooltipText.textContent === "Share project",
      {
        activeLabel: document.activeElement?.getAttribute?.("aria-label"),
        activeLabelBeforeFocus,
        state: tooltip.dataset.state,
        text: tooltipText.textContent,
      },
    );
    t.key(group, "Escape");
    t.check(
      "Escape hides the focused tooltip",
      tooltip.dataset.state === "closed" && tooltip.getAttribute("aria-hidden") === "true",
    );

    triggers.at(-1).focus();
    await t.frame(2);
    const offsetBeforeResize = tooltip.style.getPropertyValue("--tooltip-x");
    triggers[0].style.width = "6rem";
    await t.frame(3);
    t.check(
      "group resize repositions the active tooltip",
      tooltip.style.getPropertyValue("--tooltip-x") !== offsetBeforeResize,
      {
        activeLabel: document.activeElement?.getAttribute?.("aria-label"),
        after: tooltip.style.getPropertyValue("--tooltip-x"),
        before: offsetBeforeResize,
        groupWidth: group.getBoundingClientRect().width,
      },
    );
    triggers[0].style.width = "";
    await t.frame(2);
    triggers.at(-1).blur();
    await t.frame();
    t.check("focus leaving the toolbar hides the tooltip", tooltip.dataset.state === "closed");
  }

  async function checkTooltipReplay(t) {
    const group = t.find("[data-tooltip-group]");
    const tooltip = t.find("#toolbar-tooltip");
    const tooltipText = t.find("[data-tooltip-text]");
    const triggers = t.all("[data-tooltip]");

    t.pointer(triggers[0], "pointerenter", { pointerType: "mouse" });
    await t.frame();
    const firstGeometry = `${tooltip.style.getPropertyValue("--tooltip-x")}|${tooltip.style.getPropertyValue("--tooltip-width")}`;
    t.pointer(triggers.at(-1), "pointerenter", { pointerType: "mouse" });
    await t.frame();
    const lastGeometry = `${tooltip.style.getPropertyValue("--tooltip-x")}|${tooltip.style.getPropertyValue("--tooltip-width")}`;
    t.check("replayed hover follows a different trigger", firstGeometry !== lastGeometry);
    t.check("replayed hover exposes the latest label", tooltipText.textContent === "Open settings");

    triggers[1].focus();
    await t.frame();
    t.check("focus replay moves the shared tooltip", tooltipText.textContent === "Share project");
    t.key(group, "Escape");
    t.check(
      "replayed tooltip reaches its hidden final state",
      tooltip.dataset.state === "closed" && tooltip.getAttribute("aria-hidden") === "true",
    );
  }

  async function checkTooltipDisposed(t) {
    const group = t.find("[data-tooltip-group]");
    const tooltip = t.find("#toolbar-tooltip");
    const triggers = t.all("[data-tooltip]");
    const before = t.fingerprint(group);

    t.pointer(triggers[0], "pointerenter", { pointerType: "mouse" });
    triggers[1].focus();
    t.key(group, "Escape");
    await t.frame(3);
    t.check("disposed tooltip listeners stop responding", t.fingerprint(group) === before);
    t.check(
      "disposed tooltip stays reset",
      tooltip.dataset.state === "closed" &&
        tooltip.getAttribute("aria-hidden") === "true" &&
        tooltip.style.getPropertyValue("--tooltip-width") === "" &&
        tooltip.style.getPropertyValue("--tooltip-x") === "",
    );
  }

})();
