(() => {
  "use strict";

  const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
  const attribute = (element, name) => element.getAttribute(name);

  const unchanged = (t, name, before, selectorOrElement = t.root) => {
    t.check(name, t.fingerprint(selectorOrElement) === before);
  };

  globalThis.__transitionCheckDomains ??= {};
  globalThis.__transitionCheckDomains.feedback = {
    "notification-badge": {
      async primary(t) {
        const trigger = t.find("[data-trigger]");
        const badge = t.find("[data-badge]");
        const status = t.find("[data-status]");
        const box = trigger.getBoundingClientRect();

        t.expectTransition(badge, ["opacity", "translate", "scale", "filter"]);
        t.check("badge starts visible", badge.dataset.visible === "true");
        t.check("visible badge is announced by the trigger", attribute(trigger, "aria-label") === "Inbox, 3 unread messages" && status.textContent === "3 unread messages");

        t.click(trigger);
        t.check("hiding the badge updates its complete semantic state", badge.dataset.visible === "false" && attribute(trigger, "aria-pressed") === "false" && attribute(trigger, "aria-label") === "Inbox, no unread messages" && status.textContent === "All caught up");
        if (matchMedia(REDUCED_QUERY).matches) {
          const reducedStyle = t.style(badge);
          const neutralTranslate = reducedStyle.translate === "none" || reducedStyle.translate.split(/\s+/).every((value) => Number.parseFloat(value) === 0);
          const neutralScale = reducedStyle.scale === "none" || reducedStyle.scale === "1" || reducedStyle.scale === "1 1";
          t.check("reduced badge state has no residual travel or scale", neutralTranslate && neutralScale, { scale: reducedStyle.scale, translate: reducedStyle.translate });
        }
        const hiddenBox = trigger.getBoundingClientRect();
        t.check("badge visibility does not move the trigger", box.x === hiddenBox.x && box.y === hiddenBox.y && box.width === hiddenBox.width && box.height === hiddenBox.height, { before: box.toJSON(), after: hiddenBox.toJSON() });
      },

      async replay(t) {
        const trigger = t.find("[data-trigger]");
        const badge = t.find("[data-badge]");
        t.click(trigger);
        t.click(trigger);
        t.click(trigger);
        t.click(trigger);
        t.check("rapid toggles resolve to the latest unread state", badge.dataset.visible === "true" && attribute(trigger, "aria-pressed") === "true" && t.find("[data-status]").textContent === "3 unread messages");
      },

      async disposed(t) {
        const before = t.fingerprint();
        t.click("[data-trigger]");
        await t.frame(2);
        unchanged(t, "disposed badge trigger no longer responds", before);
      },

    },

    "success-check": {
      async primary(t) {
        const path = t.find("[data-check-path]");
        t.check("success confirmation starts settled", t.root.dataset.state === "shown" && t.find("[data-status]").textContent === "Your preferences are up to date.");
        t.check("check path length is measured for the draw", path.style.getPropertyValue("--check-length") !== "");
        if (matchMedia(REDUCED_QUERY).matches) {
          t.check("native reduced motion exposes the completed path", Number.parseFloat(t.style(path).strokeDashoffset) === 0);
        } else {
          t.check("success glyph has an entry animation", t.style(path.parentElement.parentElement).animationName.includes("feedback-success-check"));
        }
      },

      async replay(t) {
        const replay = t.find("[data-replay]");
        t.click(replay);
        t.check("replay synchronously restores the hidden baseline", t.root.dataset.state === "idle" && t.find("[data-status]").textContent === "Saving your preferences.");
        t.click(replay);
        t.click(replay);
        await t.frame(2);
        t.check("repeated replay settles one confirmation", t.root.dataset.state === "shown" && t.find("[data-status]").textContent === "Your preferences are up to date.");
      },

      async disposed(t) {
        const before = t.fingerprint();
        t.click("[data-replay]");
        await t.frame(2);
        unchanged(t, "disposed success replay no longer responds", before);
      },

      async controlledReduce(t) {
        t.click("[data-replay]");
        t.check("success replay enters its motion baseline", t.root.dataset.state === "idle");
        t.setReduced(true);
        t.check("enabling reduced motion settles the success immediately", t.root.dataset.state === "shown" && t.find("[data-status]").textContent === "Your preferences are up to date.");
      },
    },

    "error-state-shake": {
      async primary(t) {
        const field = t.find("[data-field]");
        const input = t.find("[data-input]");
        const error = t.find("[data-error]");
        t.click("button[type=submit]");
        t.check("invalid submission keeps a visible semantic error", field.dataset.invalid === "true" && input.getAttribute("aria-invalid") === "true" && error.dataset.visible === "true" && error.getAttribute("aria-hidden") === "false");
        t.check("invalid submission focuses the field", document.activeElement === input);
        t.check("shake supplements the persistent error when motion is allowed", matchMedia(REDUCED_QUERY).matches ? field.dataset.shaking === "false" : field.dataset.shaking === "true");

        t.input(input, "person@example.com");
        t.check("valid input clears the complete error state", field.dataset.invalid === "false" && field.dataset.shaking === "false" && input.getAttribute("aria-invalid") === "false" && error.dataset.visible === "false" && error.getAttribute("aria-hidden") === "true" && t.find("[data-status]").textContent === "Email address is ready to use.");

        t.input(input, "partial");
        t.check("invalid editing clears the stale success status", t.find("[data-status]").textContent === "");
        t.click("button[type=submit]");
        t.check("invalid resubmission does not retain the success status", field.dataset.invalid === "true" && input.getAttribute("aria-invalid") === "true" && error.dataset.visible === "true" && t.find("[data-status]").textContent === "");
      },

      async replay(t) {
        const field = t.find("[data-field]");
        t.input("[data-input]", "partial");
        t.click("button[type=submit]");
        t.click("button[type=submit]");
        t.check("replayed invalid submission retains its message", field.dataset.invalid === "true" && t.find("[data-error]").dataset.visible === "true");
        if (!matchMedia(REDUCED_QUERY).matches) {
          t.check("replayed invalid submission restarts the shake", field.dataset.shaking === "true");
        }
        await t.wait(350);
        t.check("shake ends without clearing the error", field.dataset.shaking === "false" && field.dataset.invalid === "true" && t.find("[data-error]").dataset.visible === "true");
      },

      async disposed(t) {
        const field = t.find("[data-field]");
        const error = t.find("[data-error]");
        const before = {
          error: t.fingerprint(error),
          field: field.outerHTML,
          status: t.find("[data-status]").textContent,
        };
        const submitted = t.find("[data-form]").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        t.input("[data-input]", "person@example.com");
        await t.frame(2);
        t.check("disposed form no longer intercepts submission", submitted);
        t.check("disposed validation controls and timer no longer respond", t.fingerprint(error) === before.error && field.outerHTML === before.field && t.find("[data-status]").textContent === before.status);
      },

      async controlledReduce(t) {
        t.click("button[type=submit]");
        t.check("invalid submission begins its shake", t.find("[data-field]").dataset.shaking === "true");
        t.setReduced(true);
        const field = t.find("[data-field]");
        t.check("reduced motion stops displacement but retains the error", field.dataset.shaking === "false" && field.dataset.invalid === "true" && t.find("[data-error]").dataset.visible === "true" && t.find("[data-input]").getAttribute("aria-invalid") === "true");
      },
    },

    "skeleton-reveal": {
      async primary(t) {
        const content = t.find("[data-content]");
        t.expectTransition("[data-skeleton]", ["opacity", "filter"]);
        t.expectTransition(content, ["opacity", "filter"]);
        if (matchMedia(REDUCED_QUERY).matches) {
          t.check("reduced loading settles with content available", t.root.dataset.state === "revealed" && t.root.getAttribute("aria-busy") === "false" && !content.hasAttribute("inert") && content.getAttribute("aria-hidden") === "false");
          return;
        }
        t.check("loading content starts unavailable", t.root.dataset.state === "loading" && t.root.getAttribute("aria-busy") === "true" && content.hasAttribute("inert") && content.getAttribute("aria-hidden") === "true");
        await t.wait(1100);
        t.check("loaded content becomes available", t.root.dataset.state === "revealed" && t.root.getAttribute("aria-busy") === "false" && !content.hasAttribute("inert") && content.getAttribute("aria-hidden") === "false");
      },

      async replay(t) {
        t.click("[data-replay]");
        t.click("[data-replay]");
        t.check("replayed loading state stays inaccessible", t.root.dataset.state === "loading" && t.root.getAttribute("aria-busy") === "true" && t.find("[data-content]").hasAttribute("inert"));
        t.click("[data-reveal]");
        await t.wait(1100);
        t.check("manual reveal cancels every stale replay timer", t.root.dataset.state === "revealed" && t.root.getAttribute("aria-busy") === "false" && !t.find("[data-content]").hasAttribute("inert"));
      },

      async disposed(t) {
        const before = t.fingerprint();
        t.click("[data-replay]");
        t.click("[data-reveal]");
        await t.wait(1100);
        unchanged(t, "disposed skeleton controls and reveal timer no longer respond", before);
      },

      async controlledReduce(t) {
        t.click("[data-replay]");
        t.check("skeleton replay starts loading", t.root.dataset.state === "loading");
        t.setReduced(true);
        t.check("reduced motion immediately exposes meaningful content", t.root.dataset.state === "revealed" && t.root.getAttribute("aria-busy") === "false" && !t.find("[data-content]").hasAttribute("inert") && t.find("[data-content]").getAttribute("aria-hidden") === "false");
      },
    },

    toast: {
      async primary(t) {
        const toast = t.find("[data-toast]");
        t.expectTransition(toast, ["opacity", "translate", "scale", "filter"]);
        t.click("[data-show]");
        t.check("show exposes the toast to assistive technology", toast.dataset.open === "true" && toast.getAttribute("aria-hidden") === "false");
        t.pointer(toast, "pointerenter", { pointerType: "mouse" });
        await t.wait(50);
        t.check("hover keeps the toast open", toast.dataset.open === "true");
        t.pointer(toast, "pointerleave", { pointerType: "mouse" });
        t.find("[data-close]").focus();
        await t.wait(50);
        t.check("focus keeps the toast open", toast.dataset.open === "true" && document.activeElement === t.find("[data-close]"));
        t.click("[data-close]");
        t.check("direct dismissal hides the toast and restores focus", toast.dataset.open === "false" && toast.getAttribute("aria-hidden") === "true" && document.activeElement === t.find("[data-show]"));
      },

      async replay(t) {
        const toast = t.find("[data-toast]");
        t.click("[data-show]");
        t.click("[data-close]");
        t.check("toast enters its exit state", toast.dataset.open === "false");
        t.click("[data-show]");
        t.click("[data-show]");
        t.check("show interrupts exit and replaces the prior dismissal", toast.dataset.open === "true" && toast.getAttribute("aria-hidden") === "false");
      },

      async disposed(t) {
        const before = t.fingerprint();
        t.click("[data-show]");
        t.pointer("[data-toast]", "pointerenter", { pointerType: "mouse" });
        t.click("[data-close]");
        await t.frame(2);
        unchanged(t, "disposed toast controls no longer respond", before);
      },

    },

    "thinking-states": {
      async primary(t) {
        const line = t.find("[data-line]");
        const pause = t.find("[data-pause]");
        t.expectTransition(line, ["opacity", "translate", "filter"]);
        if (matchMedia(REDUCED_QUERY).matches) {
          t.check("reduced thinking state is static and readable", t.root.dataset.paused === "true" && line.dataset.phase === "idle" && pause.disabled && pause.textContent === "Motion reduced");
          return;
        }
        const seen = new Set([line.textContent]);
        for (let step = 0; step < 3; step += 1) {
          await t.wait(2200);
          seen.add(line.textContent);
        }
        t.check("all meaningful thinking stages cycle", seen.size === 3, { seen: [...seen] });
      },

      async replay(t) {
        if (matchMedia(REDUCED_QUERY).matches) {
          t.check("reduced thinking replay remains settled", t.root.dataset.paused === "true" && t.find("[data-line]").dataset.phase === "idle");
          return;
        }
        const pause = t.find("[data-pause]");
        const line = t.find("[data-line]");
        const heldText = line.textContent;
        t.click(pause);
        await t.wait(2200);
        t.check("pause during a hold cancels the cycle", t.root.dataset.paused === "true" && line.dataset.phase === "idle" && line.textContent === heldText && pause.getAttribute("aria-pressed") === "true");
        t.click(pause);
        await t.wait(2020);
        t.check("resumed thinking state begins its swap", line.dataset.phase === "exit");
        t.click(pause);
        t.check("pause during a swap settles the current label", t.root.dataset.paused === "true" && line.dataset.phase === "idle" && pause.textContent === "Resume status updates");
      },

      async disposed(t) {
        const before = t.fingerprint();
        t.click("[data-pause]");
        await t.wait(2300);
        unchanged(t, "disposed thinking controls and cycle timers no longer respond", before);
      },

      async controlledReduce(t) {
        const line = t.find("[data-line]");
        await t.wait(2020);
        t.check("thinking transition is in progress", line.dataset.phase === "exit");
        const currentText = line.textContent;
        t.setReduced(true);
        await t.wait(250);
        const pause = t.find("[data-pause]");
        t.check("reduced motion settles and freezes the current thinking state", t.root.dataset.paused === "true" && line.dataset.phase === "idle" && line.textContent === currentText && pause.disabled && pause.textContent === "Motion reduced");
      },
    },

    "matrix-loader": {
      async primary(t) {
        const dots = t.all("[data-matrix] > i");
        const matrix = t.find("[data-matrix]");
        t.check("matrix keeps one stable 4 by 4 decorative grid", dots.length === 16 && matrix.getAttribute("aria-hidden") === "true");
        const expected = {
          scan: "a column scan",
          twinkle: "a twinkle",
          orbit: "a perimeter orbit",
          pulse: "a center pulse",
        };
        for (const [variant, phrase] of Object.entries(expected)) {
          t.change("[data-variant]", variant);
          t.check(`${variant} pattern updates the status`, t.find("[data-status]").textContent.includes(phrase));
          t.check(`${variant} pattern reuses the same dots`, t.all("[data-matrix] > i").every((dot, index) => dot === dots[index]));
        }
        t.change("[data-rounded]", true);
        const gaps = dots.filter((dot) => dot.dataset.gap === "true");
        t.check("rounded matrix removes only its four corners", gaps.length === 4 && [0, 3, 12, 15].every((index) => dots[index].dataset.gap === "true"));
      },

      async replay(t) {
        const pause = t.find("[data-pause]");
        t.click(pause);
        t.check("pause exposes a meaningful static loader state", t.root.dataset.paused === "true" && pause.getAttribute("aria-pressed") === "true" && pause.textContent === "Resume loader" && t.find("[data-status]").textContent.endsWith("Animation paused."));
        t.change("[data-variant]", "orbit");
        t.check("pattern changes remain meaningful while paused", t.find("[data-status]").textContent === "Loading results with a perimeter orbit. Animation paused.");
        t.click(pause);
        t.check("resume restarts the selected loader pattern", t.root.dataset.paused === "false" && pause.getAttribute("aria-pressed") === "false" && pause.textContent === "Pause loader" && t.find("[data-status]").textContent === "Loading results with a perimeter orbit.");
      },

      async disposed(t) {
        const status = t.find("[data-status]").textContent;
        const paused = t.root.dataset.paused;
        const delays = t.all("[data-matrix] > i").map((dot) => dot.style.getPropertyValue("--delay")).join(",");
        t.change("[data-variant]", "twinkle");
        t.click("[data-pause]");
        await t.frame(2);
        t.check("disposed matrix controls no longer render state", t.find("[data-status]").textContent === status && t.root.dataset.paused === paused && t.all("[data-matrix] > i").map((dot) => dot.style.getPropertyValue("--delay")).join(",") === delays);
      },

      async controlledReduce(t) {
        t.change("[data-variant]", "twinkle");
        t.check("matrix loader begins active", t.root.dataset.paused === "false");
        t.setReduced(true);
        const pause = t.find("[data-pause]");
        t.check("reduced motion pauses dots while preserving the status", t.root.dataset.paused === "true" && pause.disabled && pause.textContent === "Motion reduced" && t.find("[data-status]").textContent === "Loading results with a twinkle. Animation paused.");
      },
    },
  };
})();
