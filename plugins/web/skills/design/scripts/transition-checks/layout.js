(() => {
  "use strict";

  globalThis.__transitionCheckDomains ??= {};

  const isExposed = (element) =>
    element.getAttribute("aria-hidden") === "false" && !element.inert && !element.hidden;

  const cardResize = {
    async primary(t) {
      const card = t.find("[data-card]");
      const toggle = t.find("[data-card-toggle]");
      const details = t.find("[data-card-details]");
      t.expectTransition(toggle.querySelector("svg"), ["rotate"]);
      t.expectTransition(details, ["grid-template-rows"]);
      t.check(
        "card starts collapsed",
        card.dataset.open === "false" &&
          toggle.getAttribute("aria-expanded") === "false" &&
          details.getAttribute("aria-hidden") === "true" &&
          details.inert,
      );
      t.click(toggle);
      await t.frame(2);
      t.check(
        "card expansion exposes details and accessible state together",
        card.dataset.open === "true" &&
          toggle.getAttribute("aria-expanded") === "true" &&
          isExposed(details),
      );
    },

    async replay(t) {
      const card = t.find("[data-card]");
      const toggle = t.find("[data-card-toggle]");
      const details = t.find("[data-card-details]");
      t.click(toggle);
      t.click(toggle);
      t.click(toggle);
      await t.frame(2);
      t.check(
        "rapid replay leaves the latest expanded state authoritative",
        card.dataset.open === "true" &&
          toggle.getAttribute("aria-expanded") === "true" &&
          isExposed(details),
      );
      t.click(toggle);
      await t.wait(350);
      t.check(
        "collapsed card removes details from interaction",
        card.dataset.open === "false" &&
          toggle.getAttribute("aria-expanded") === "false" &&
          details.getAttribute("aria-hidden") === "true" &&
          details.inert,
      );
    },

    async disposed(t) {
      const before = t.fingerprint(t.root);
      t.click("[data-card-toggle]");
      await t.frame(2);
      t.check("disposed card ignores its former toggle listener", t.fingerprint(t.root) === before);
    },
  };

  const panelReveal = {
    async primary(t) {
      const panel = t.find("[data-panel]");
      const toggle = t.find("[data-panel-toggle]");
      t.expectTransition(panel, ["translate", "opacity", "filter"]);
      t.check(
        "panel starts unavailable",
        toggle.getAttribute("aria-expanded") === "false" &&
          panel.getAttribute("aria-hidden") === "true" &&
          panel.inert,
      );
      t.click(toggle);
      await t.frame(2);
      t.check(
        "panel reveal exposes one usable panel",
        toggle.getAttribute("aria-expanded") === "true" && isExposed(panel),
      );
      t.click("[data-panel-close]");
      t.check("panel close returns focus to its trigger", document.activeElement === toggle);
      await t.wait(350);
      t.check(
        "panel close restores hidden interaction state",
        toggle.getAttribute("aria-expanded") === "false" &&
          panel.getAttribute("aria-hidden") === "true" &&
          panel.inert,
      );
    },

    async replay(t) {
      const panel = t.find("[data-panel]");
      const toggle = t.find("[data-panel-toggle]");
      t.click(toggle);
      t.click("[data-panel-close]");
      t.click(toggle);
      await t.frame(2);
      t.check(
        "interrupted panel close cannot hide the reopened panel",
        toggle.getAttribute("aria-expanded") === "true" && isExposed(panel),
      );
    },

    async disposed(t) {
      const before = t.fingerprint(t.root);
      t.click("[data-panel-toggle]");
      await t.frame(2);
      t.check("disposed panel ignores its former controls", t.fingerprint(t.root) === before);
    },
  };

  const pageSideBySide = {
    async primary(t) {
      const tabs = t.all("[data-page-tab]");
      const panels = t.all("[data-page-panel]");
      const track = t.find("[data-page-track]");
      t.expectTransition(track, ["transform"]);
      const firstShift = track.style.getPropertyValue("--page-shift");
      t.click(tabs[1]);
      await t.frame(2);
      t.check(
        "page selection synchronizes tabs and panels",
        tabs[0].getAttribute("aria-selected") === "false" &&
          tabs[1].getAttribute("aria-selected") === "true" &&
          panels[0].getAttribute("aria-hidden") === "true" &&
          panels[0].inert &&
          panels[1].getAttribute("aria-hidden") === "false" &&
          !panels[1].inert,
      );
      t.check(
        "page track moves for the selected page",
        track.style.getPropertyValue("--page-shift") !== firstShift,
        { before: firstShift, after: track.style.getPropertyValue("--page-shift") },
      );
      t.key(tabs[1], "Home");
      t.check(
        "Home selects and focuses the first page",
        tabs[0].getAttribute("aria-selected") === "true" && document.activeElement === tabs[0],
      );
      t.key(tabs[0], "End");
      t.check(
        "End selects and focuses the last page",
        tabs[1].getAttribute("aria-selected") === "true" && document.activeElement === tabs[1],
      );
    },

    async replay(t) {
      const tabs = t.all("[data-page-tab]");
      const panels = t.all("[data-page-panel]");
      t.click(tabs[1]);
      t.click(tabs[0]);
      t.click(tabs[1]);
      await t.frame(2);
      t.check(
        "rapid page changes preserve only the latest page state",
        tabs[1].getAttribute("aria-selected") === "true" &&
          panels[0].inert &&
          !panels[1].inert,
      );
      t.key(tabs[1], "ArrowLeft");
      t.key(tabs[0], "ArrowRight");
      t.check(
        "arrow replay wraps through pages without stale state",
        tabs[1].getAttribute("aria-selected") === "true" && document.activeElement === tabs[1],
      );
    },

    async disposed(t) {
      const before = t.fingerprint(t.root);
      t.click(t.all("[data-page-tab]")[1]);
      await t.frame(2);
      t.check("disposed page switcher ignores its former tab listeners", t.fingerprint(t.root) === before);
    },
  };

  const bannerStacking = {
    async primary(t) {
      const stack = t.find("[data-stack]");
      const toggle = t.find("[data-stack-toggle]");
      t.expectTransition(t.find("[data-banner]"), ["transform", "opacity", "filter"]);
      const initialBanners = t.all("[data-banner]");
      const initialCount = initialBanners.length;
      t.click("[data-banner-add]");
      await t.frame(2);
      const bannersAfterAdd = t.all("[data-banner]");
      t.check(
        "adding a banner updates the rendered stack",
        bannersAfterAdd.some((banner) => !initialBanners.includes(banner)),
        { before: initialCount, after: bannersAfterAdd.length },
      );
      t.click(toggle);
      await t.frame(2);
      t.check(
        "stack expansion updates control and stack state together",
        toggle.getAttribute("aria-expanded") === "true" && stack.dataset.expanded === "true",
      );
      const expandedBanners = t.all("[data-banner]");
      const expectedExpandedHeight =
        expandedBanners.reduce((height, banner) => height + banner.offsetHeight, 0) +
        Math.max(0, expandedBanners.length - 1) * 8;
      const firstExpandedHeight = Number.parseFloat(stack.style.height);
      t.check(
        "expanded stack reserves untransformed banner heights",
        Math.abs(firstExpandedHeight - expectedExpandedHeight) <= 1,
        { actual: firstExpandedHeight, expected: expectedExpandedHeight },
      );
      t.click(toggle);
      t.click(toggle);
      await t.frame(2);
      t.check(
        "collapse and re-expand preserve measured stack geometry",
        Math.abs(Number.parseFloat(stack.style.height) - expectedExpandedHeight) <= 1,
        { afterReplay: Number.parseFloat(stack.style.height), expected: expectedExpandedHeight },
      );

      const dismissed = t.all("[data-banner]")[0];
      const dismiss = dismissed?.querySelector("[data-banner-dismiss]");
      t.check("banner exposes a dismissal control", Boolean(dismiss));
      if (!dismiss) return;
      t.click(dismiss);
      t.check(
        "exiting banner becomes inert immediately",
        dismissed.inert,
      );
      await t.wait(550);
      t.check("dismissed banner leaves the stack", !dismissed.isConnected);
    },

    async replay(t) {
      const initialCount = t.all("[data-banner]").length;
      for (let index = 0; index < 4; index += 1) t.click("[data-banner-add]");
      await t.wait(550);
      const banners = t.all("[data-banner]");
      t.check(
        "rapid additions retire stale overflow banners",
        banners.length <= Math.max(3, initialCount),
        { initialCount, finalCount: banners.length },
      );
      const toggle = t.find("[data-stack-toggle]");
      const before = toggle.getAttribute("aria-expanded");
      t.click(toggle);
      t.click(toggle);
      t.check(
        "stack expansion replay returns to its prior state",
        toggle.getAttribute("aria-expanded") === before,
      );
      t.check("stack keeps a live update channel", t.find("[data-banner-live]").textContent.length > 0);
    },

    async disposed(t) {
      const before = t.fingerprint(t.root);
      t.click("[data-banner-add]");
      t.click("[data-stack-toggle]");
      await t.wait(400);
      t.check("disposed banner stack ignores controls and pending work", t.fingerprint(t.root) === before);
    },

    async controlledReduce(t) {
      const dismissed = t.all("[data-banner]")[0];
      const dismiss = dismissed?.querySelector("[data-banner-dismiss]");
      t.check("controlled reduction has a banner to dismiss", Boolean(dismissed && dismiss));
      if (!dismissed || !dismiss) return;
      t.click(dismiss);
      t.check("banner is inert throughout its exit", dismissed.inert);
      t.setReduced(true);
      await t.frame(2);
      t.check("live reduced-motion change completes banner removal", !dismissed.isConnected);
    },
  };

  globalThis.__transitionCheckDomains.layout = {
    "banner-stacking": bannerStacking,
    "card-resize": cardResize,
    "page-side-by-side": pageSideBySide,
    "panel-reveal": panelReveal,
  };
})();
