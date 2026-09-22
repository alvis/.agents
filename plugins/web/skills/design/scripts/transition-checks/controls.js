(() => {
  "use strict";

  const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
  const readAvatarTransform = (avatar) => {
    const match = /^translateY\((-?[\d.]+)px\) scale\(([\d.]+)\)$/.exec(
      avatar.style.transform,
    );
    return match === null
      ? null
      : { lift: Number.parseFloat(match[1]), scale: Number.parseFloat(match[2]) };
  };

  globalThis.__transitionCheckDomains ??= {};
  globalThis.__transitionCheckDomains.controls = {
    accordion: {
      async primary(t) {
        const accordion = t.find("[data-accordion]");
        const button = t.find("button[aria-controls]");
        const panel = t.find("[data-panel]");
        const content = panel.firstElementChild;
        const chevron = button.querySelector("svg");

        t.expectTransition(chevron, ["scale"]);
        t.expectTransition(panel, ["grid-template-rows"]);
        t.expectTransition(content, ["opacity", "filter"]);
        t.check(
          "accordion starts closed and unavailable",
          button.getAttribute("aria-expanded") === "false" &&
            panel.hidden &&
            panel.inert &&
            panel.getAttribute("aria-hidden") === "true",
        );

        t.click(button);
        await t.frame(2);
        t.check(
          "pointer activation exposes the panel",
          accordion.dataset.open === "true" &&
            button.getAttribute("aria-expanded") === "true" &&
            !panel.hidden &&
            !panel.inert &&
            panel.getAttribute("aria-hidden") === "false",
        );

        button.focus();
        t.key(button, "Enter");
        t.click(button);
        t.check(
          "focused native button closes with immediate semantics",
          document.activeElement === button &&
            accordion.dataset.open === "false" &&
            button.getAttribute("aria-expanded") === "false" &&
            panel.inert &&
            panel.getAttribute("aria-hidden") === "true",
        );
        await t.wait(300);
        t.check("closed panel is hidden after its fallback duration", panel.hidden);
      },
      async replay(t) {
        const accordion = t.find("[data-accordion]");
        const button = t.find("button[aria-controls]");
        const panel = t.find("[data-panel]");

        t.click(button);
        await t.frame(2);
        t.click(button);
        t.click(button);
        await t.frame(2);
        t.check(
          "rapid close reversal keeps the reopened panel exposed",
          accordion.dataset.open === "true" &&
            button.getAttribute("aria-expanded") === "true" &&
            !panel.hidden &&
            !panel.inert,
        );
        await t.wait(300);
        t.check("stale close timer cannot hide a reopened panel", !panel.hidden);

        t.click(button);
        await t.wait(300);
        t.check("replay returns to a fully closed state", panel.hidden && panel.inert);
      },
      async disposed(t) {
        const accordion = t.find("[data-accordion]");
        const button = t.find("button[aria-controls]");
        const panel = t.find("[data-panel]");
        const link = panel.querySelector("a");

        t.fixture.mount();
        t.click(button);
        t.fixture.dispose();
        await t.frame(2);
        link.focus();
        t.check(
          "disposal during the opening frame restores one closed state",
          accordion.dataset.open === "false" &&
            button.getAttribute("aria-expanded") === "false" &&
            panel.getAttribute("aria-hidden") === "true" &&
            panel.inert &&
            panel.hidden &&
            document.activeElement !== link,
        );

        const before = t.fingerprint("[data-accordion]");
        t.click(button);
        await t.frame(2);
        t.check("disposed accordion ignores activation", t.fingerprint("[data-accordion]") === before);
      },
      async controlledReduce(t) {
        const accordion = t.find("[data-accordion]");
        const button = t.find("button[aria-controls]");
        const panel = t.find("[data-panel]");

        t.click(button);
        await t.frame(2);
        t.click(button);
        t.check(
          "close begins with final accessible semantics before visual hiding",
          accordion.dataset.open === "false" && panel.inert && !panel.hidden,
        );
        t.setReduced(true);
        await t.frame();
        t.check(
          "live reduced motion finalizes the closed panel",
          panel.hidden &&
            panel.inert &&
            button.getAttribute("aria-expanded") === "false" &&
            panel.getAttribute("aria-hidden") === "true",
        );
      },
    },

    "avatar-group-hover": {
      async primary(t) {
        const group = t.find("[data-avatar-group]");
        const avatars = t.all("[data-avatar]");

        avatars.forEach((avatar) => t.expectTransition(avatar, ["transform"]));
        t.check(
          "avatar row starts flat",
          avatars.every(
            (avatar) => avatar.style.transform === "" || avatar.style.transform === "none",
          ),
        );

        t.pointer(avatars[2], "pointerenter", { pointerType: "mouse" });
        if (matchMedia(REDUCED_QUERY).matches) {
          t.check(
            "native reduced motion keeps pointer activation flat",
            avatars.every((avatar) => avatar.style.transform === "none"),
          );
        } else {
          const active = readAvatarTransform(avatars[2]);
          const neighbor = readAvatarTransform(avatars[1]);
          const distant = readAvatarTransform(avatars[0]);
          t.check(
            "hover lifts the active avatar and applies neighbor falloff",
            active?.lift === -10 &&
              active.scale === 1.08 &&
              neighbor?.lift === -4.5 &&
              distant?.lift === -2.03 &&
              Number(avatars[2].style.zIndex) > Number(avatars[0].style.zIndex),
          );
        }

        t.pointer(group, "pointerleave", { pointerType: "mouse" });
        t.check(
          "pointer leave restores the spring return state",
          avatars.every(
            (avatar) =>
              avatar.style.transform === "none" &&
              avatar.style.zIndex === "" &&
              avatar.style.transitionTimingFunction === "var(--ease-motion-spring)",
          ),
        );

        avatars[4].focus();
        await t.frame();
        const focused = readAvatarTransform(avatars[4]);
        t.check(
          "keyboard focus follows the current motion preference",
          document.activeElement === avatars[4] &&
            (matchMedia(REDUCED_QUERY).matches
              ? avatars[4].style.transform === "none"
              : focused?.lift === -10 && focused.scale === 1.08),
        );
        avatars[4].blur();
        await t.frame();
        t.check("focus leaving the group flattens every avatar", avatars.every((avatar) => avatar.style.transform === "none"));
      },
      async replay(t) {
        const group = t.find("[data-avatar-group]");
        const avatars = t.all("[data-avatar]");

        t.pointer(avatars[0], "pointerenter", { pointerType: "mouse" });
        t.pointer(avatars[3], "pointerenter", { pointerType: "mouse" });
        t.check(
          "rapid pointer travel replaces the previous active state",
          matchMedia(REDUCED_QUERY).matches
            ? avatars.every((avatar) => avatar.style.transform === "none")
            : avatars[3].style.transform.includes("scale(1.08)") &&
                avatars[0].style.transform.includes("scale(1)"),
        );
        t.pointer(group, "pointerleave", { pointerType: "mouse" });
        t.check("replay leaves no stale avatar transform", avatars.every((avatar) => avatar.style.transform === "none"));
      },
      async disposed(t) {
        const group = t.find("[data-avatar-group]");
        const avatars = t.all("[data-avatar]");

        t.pointer(avatars[1], "pointerenter", { pointerType: "mouse" });
        avatars[1].focus();
        await t.frame();
        t.check(
          "disposed avatar group has no pointer or focus response",
          avatars.every(
            (avatar) => avatar.style.transform === "none" && avatar.style.zIndex === "",
          ),
        );
        t.pointer(group, "pointerleave", { pointerType: "mouse" });
        avatars[1].blur();
      },
      async controlledReduce(t) {
        const avatars = t.all("[data-avatar]");

        t.pointer(avatars[2], "pointerenter", { pointerType: "mouse" });
        t.check("avatar motion is active before reduction", avatars[2].style.transform !== "none");
        t.setReduced(true);
        await t.frame();
        t.check(
          "live reduced motion removes all persistent pointer state",
          avatars.every(
            (avatar) => avatar.style.transform === "none" && avatar.style.zIndex === "",
          ),
        );
      },
    },

    "card-tilt": {
      async primary(t) {
        const hitArea = t.find("[data-tilt]");
        const card = t.find("[data-tilt-card]");
        const glare = t.find("[data-tilt-glare]");
        const bounds = hitArea.getBoundingClientRect();

        t.expectTransition(card, ["transform"]);
        if (matchMedia(REDUCED_QUERY).matches) {
          const glareStyle = t.style(glare);
          t.check(
            "native reduced motion removes glare from rendering",
            glareStyle.display === "none" && Number.parseFloat(glareStyle.opacity) === 0,
            { display: glareStyle.display, opacity: glareStyle.opacity },
          );
        } else {
          t.expectTransition(glare, ["opacity"]);
        }
        t.check(
          "tilt starts flat",
          ["", "0deg"].includes(card.style.getPropertyValue("--tilt-x")) &&
            ["", "0deg"].includes(card.style.getPropertyValue("--tilt-y")) &&
            ["", "0"].includes(glare.style.opacity),
        );
        t.pointer(hitArea, "pointermove", {
          pointerType: "mouse",
          clientX: bounds.left + bounds.width * 0.9,
          clientY: bounds.top + bounds.height * 0.2,
        });
        await t.frame(2);
        if (matchMedia(REDUCED_QUERY).matches) {
          t.check(
            "native reduced motion keeps pointer tracking flat",
            card.style.getPropertyValue("--tilt-x") === "0deg" &&
              card.style.getPropertyValue("--tilt-y") === "0deg" &&
              glare.style.opacity === "0",
          );
        } else {
          t.check(
            "mouse position drives both tilt axes and glare",
            card.style.getPropertyValue("--tilt-x") !== "0deg" &&
              card.style.getPropertyValue("--tilt-y") !== "0deg" &&
              glare.style.opacity === "0.8" &&
              glare.style.getPropertyValue("--glare-x") !== "" &&
              glare.style.getPropertyValue("--glare-y") !== "",
          );
        }

        t.pointer(hitArea, "pointerleave", { pointerType: "mouse" });
        t.check(
          "pointer leave restores a flat surface",
          card.style.getPropertyValue("--tilt-x") === "0deg" &&
            card.style.getPropertyValue("--tilt-y") === "0deg" &&
            glare.style.opacity === "0",
        );

        hitArea.focus();
        t.key(hitArea, "Enter");
        t.check(
          "keyboard path remains a normal focused destination without tilt",
          document.activeElement === hitArea &&
            hitArea.getAttribute("href") === "#featured-release" &&
            card.style.getPropertyValue("--tilt-x") === "0deg" &&
            card.style.getPropertyValue("--tilt-y") === "0deg",
        );
        hitArea.blur();
      },
      async replay(t) {
        const hitArea = t.find("[data-tilt]");
        const card = t.find("[data-tilt-card]");
        const bounds = hitArea.getBoundingClientRect();

        t.pointer(hitArea, "pointermove", {
          pointerType: "mouse",
          clientX: bounds.left,
          clientY: bounds.top + bounds.height,
        });
        t.pointer(hitArea, "pointermove", {
          pointerType: "mouse",
          clientX: bounds.left + bounds.width,
          clientY: bounds.top,
        });
        await t.frame(2);
        t.check(
          "queued tilt uses the latest pointer coordinates",
          matchMedia(REDUCED_QUERY).matches
            ? card.style.getPropertyValue("--tilt-x") === "0deg" &&
                card.style.getPropertyValue("--tilt-y") === "0deg"
            : Number.parseFloat(card.style.getPropertyValue("--tilt-x")) > 0 &&
                Number.parseFloat(card.style.getPropertyValue("--tilt-y")) > 0,
        );
        t.pointer(hitArea, "pointerleave", { pointerType: "mouse" });
        t.check(
          "replay leaves no persistent tilt",
          card.style.getPropertyValue("--tilt-x") === "0deg" &&
            card.style.getPropertyValue("--tilt-y") === "0deg",
        );
      },
      async disposed(t) {
        const hitArea = t.find("[data-tilt]");
        const card = t.find("[data-tilt-card]");
        const glare = t.find("[data-tilt-glare]");
        const bounds = hitArea.getBoundingClientRect();

        t.pointer(hitArea, "pointermove", {
          pointerType: "mouse",
          clientX: bounds.left + bounds.width,
          clientY: bounds.top,
        });
        await t.frame(2);
        t.check(
          "disposed tilt ignores pointer tracking",
          card.style.getPropertyValue("--tilt-x") === "0deg" &&
            card.style.getPropertyValue("--tilt-y") === "0deg" &&
            glare.style.opacity === "0",
        );
        hitArea.focus();
        t.check("disposed visual effect leaves keyboard navigation usable", document.activeElement === hitArea);
        hitArea.blur();
      },
      async controlledReduce(t) {
        const hitArea = t.find("[data-tilt]");
        const card = t.find("[data-tilt-card]");
        const glare = t.find("[data-tilt-glare]");
        const bounds = hitArea.getBoundingClientRect();

        t.pointer(hitArea, "pointermove", {
          pointerType: "mouse",
          clientX: bounds.left + bounds.width,
          clientY: bounds.top,
        });
        await t.frame(2);
        t.check("tilt motion is active before reduction", glare.style.opacity === "0.8");
        t.setReduced(true);
        await t.frame();
        t.check(
          "live reduced motion flattens tilt and glare immediately",
          card.style.getPropertyValue("--tilt-x") === "0deg" &&
            card.style.getPropertyValue("--tilt-y") === "0deg" &&
            glare.style.opacity === "0",
        );
      },
    },

    "checkbox-check": {
      async primary(t) {
        const input = t.find('input[type="checkbox"]');
        const box = input.nextElementSibling;
        const checkmark = box.querySelector("path");

        input.checked = false;
        t.expectTransition(box, ["background-color", "border-color", "box-shadow"]);
        t.expectTransition(checkmark, ["stroke-dashoffset"]);
        t.check("native checkbox starts unchecked and named", !input.checked && input.labels[0].textContent.includes("Include archived projects"));

        t.click(input);
        t.check("pointer activation updates the native checked state", input.checked);
        input.focus();
        t.key(input, " ");
        t.click(input);
        t.check(
          "focused keyboard path reverses the native state",
          document.activeElement === input && !input.checked,
        );
        input.blur();
      },
      async replay(t) {
        const input = t.find('input[type="checkbox"]');

        input.checked = false;
        t.click(input);
        t.click(input);
        t.click(input);
        t.check("rapid checkbox reversal settles at the latest native state", input.checked);
        t.click(input);
        t.check("checkbox replay returns to unchecked", !input.checked);
      },
      async disposed(t) {
        const input = t.find('input[type="checkbox"]');
        const before = input.checked;

        t.click(input);
        t.check("CSS-only checkbox retains native behavior after disposal", input.checked !== before);
        t.click(input);
      },
    },

    "icon-swap": {
      async primary(t) {
        const button = t.find("button[aria-pressed]");
        const icons = [...button.querySelectorAll("svg")];

        icons.forEach((icon) => t.expectTransition(icon, ["opacity", "filter", "scale"]));
        t.check(
          "icon swap starts with one accessible button name",
          button.getAttribute("aria-pressed") === "false" &&
            button.getAttribute("aria-label") === "Start playback" &&
            icons.every((icon) => icon.getAttribute("aria-hidden") === "true"),
        );
        t.click(button);
        t.check(
          "pointer activation swaps to pause semantics",
          button.getAttribute("aria-pressed") === "true" && button.getAttribute("aria-label") === "Pause playback",
        );
        button.focus();
        t.key(button, " ");
        t.click(button);
        t.check(
          "focused keyboard path restores play semantics",
          document.activeElement === button &&
            button.getAttribute("aria-pressed") === "false" &&
            button.getAttribute("aria-label") === "Start playback",
        );
        button.blur();
      },
      async replay(t) {
        const button = t.find("button[aria-pressed]");

        t.click(button);
        t.click(button);
        t.click(button);
        t.check(
          "rapid icon reversal follows the latest pressed state",
          button.getAttribute("aria-pressed") === "true" && button.getAttribute("aria-label") === "Pause playback",
        );
        t.click(button);
      },
      async disposed(t) {
        const button = t.find("button[aria-pressed]");
        const before = t.fingerprint(button);

        t.click(button);
        t.check("disposed icon swap ignores activation", t.fingerprint(button) === before);
      },
    },

    "input-clear-dissolve": {
      async primary(t) {
        const input = t.find("input");
        const mirror = t.find("[data-mirror]");
        const placeholder = t.find("[data-placeholder]");
        const glow = t.find("[data-glow]");
        const button = t.find("[data-clear-button]");
        const currentText = "Current dynamic search";

        t.input(input, currentText);
        input.focus();
        t.pointer(button, "pointerdown", { pointerType: "mouse" });
        t.click(button);
        await t.frame(2);
        if (matchMedia(REDUCED_QUERY).matches) {
          t.check(
            "native reduced motion clears directly to the final field state",
            input.value === "" &&
              mirror.textContent === "" &&
              placeholder.style.opacity === "1" &&
              input.style.color === "" &&
              glow.style.cssText === "" &&
              button.disabled,
          );
          return;
        }
        t.check(
          "clear animation captures the exact current text",
          input.value === "" &&
            mirror.textContent === currentText &&
            mirror.style.transform !== "" &&
            glow.style.background !== "",
        );
        t.check(
          "clear keeps input focus and disables reentry",
          document.activeElement === input && button.disabled,
        );
        await t.wait(650);
        t.check(
          "clear settles into an empty usable field",
          input.value === "" &&
            mirror.textContent === "" &&
            placeholder.style.opacity === "1" &&
            input.style.color === "" &&
            glow.style.cssText === "" &&
            button.disabled,
        );
      },
      async replay(t) {
        const input = t.find("input");
        const mirror = t.find("[data-mirror]");
        const button = t.find("[data-clear-button]");

        t.input(input, "Interrupted query");
        t.click(button);
        await t.frame(2);
        t.input(input, "Replacement query");
        await t.wait(650);
        t.check(
          "typing during dissolve preserves the replacement text",
          input.value === "Replacement query" && mirror.textContent === "" && !button.disabled,
        );

        t.click(button);
        await t.frame(2);
        t.check(
          "replay follows the active motion preference",
          matchMedia(REDUCED_QUERY).matches
            ? input.value === "" && mirror.textContent === ""
            : mirror.textContent === "Replacement query",
        );
        await t.wait(650);
        t.check("replay returns to the empty state", input.value === "" && mirror.textContent === "" && button.disabled);
      },
      async disposed(t) {
        const input = t.find("input");
        const mirror = t.find("[data-mirror]");
        const button = t.find("[data-clear-button]");

        t.input(input, "Still editable");
        button.disabled = false;
        t.click(button);
        await t.frame(2);
        t.check(
          "disposed clear button has no scripted response",
          input.value === "Still editable" && mirror.textContent === "" && !button.disabled,
        );
      },
      async controlledReduce(t) {
        const input = t.find("input");
        const mirror = t.find("[data-mirror]");
        const placeholder = t.find("[data-placeholder]");
        const glow = t.find("[data-glow]");
        const button = t.find("[data-clear-button]");

        t.input(input, "Reduced while clearing");
        t.click(button);
        await t.frame(2);
        t.check("dissolve is active before reduction", mirror.textContent === "Reduced while clearing" && mirror.style.transform !== "");
        t.setReduced(true);
        await t.frame();
        t.check(
          "live reduced motion reaches a clean empty state",
          input.value === "" &&
            mirror.textContent === "" &&
            mirror.style.transform === "" &&
            placeholder.style.transform === "" &&
            placeholder.style.opacity === "1" &&
            glow.style.cssText === "" &&
            input.style.color === "" &&
            button.disabled,
        );
      },
    },

    "learn-more-hover": {
      async primary(t) {
        const link = t.find('a[href="#learn-more-destination"]');
        const icon = link.querySelector("svg");
        const arms = [...icon.querySelectorAll("path")];

        t.expectTransition(icon, ["translate"]);
        arms.forEach((arm) => t.expectTransition(arm, ["rotate"]));
        link.focus();
        t.check(
          "keyboard focus keeps the destination usable",
          document.activeElement === link && link.getAttribute("href") === "#learn-more-destination",
        );
        t.pointer(link, "pointerenter", { pointerType: "mouse" });
        t.pointer(link, "pointerleave", { pointerType: "mouse" });
        t.check("pointer acknowledgement never changes link meaning", link.getAttribute("href") === "#learn-more-destination");
        link.blur();
      },
      async replay(t) {
        const link = t.find('a[href="#learn-more-destination"]');
        const initialDirection = t.root.getAttribute("dir");

        t.root.setAttribute("dir", "rtl");
        link.focus();
        t.check(
          "RTL replay preserves focus and destination semantics",
          document.activeElement === link &&
            t.style(link).direction === "rtl" &&
            link.getAttribute("href") === "#learn-more-destination",
        );
        link.blur();
        if (initialDirection === null) t.root.removeAttribute("dir");
        else t.root.setAttribute("dir", initialDirection);
      },
      async disposed(t) {
        const link = t.find('a[href="#learn-more-destination"]');

        link.focus();
        t.check(
          "CSS-only link remains keyboard reachable after disposal",
          document.activeElement === link && link.getAttribute("href") === "#learn-more-destination",
        );
        link.blur();
      },
    },

    "like-button": {
      async primary(t) {
        const button = t.find("[data-like]");
        const label = t.find("[data-label]");
        const particleField = t.find("[data-particles]");
        const particles = [...particleField.querySelectorAll("i")];
        const heartWrapper = button.querySelector("span");
        const heart = button.querySelector("svg");

        t.expectTransition(heart, ["fill", "color"]);
        t.check(
          "particle vectors are distinct and fully initialized",
          particles.length === 8 &&
            new Set(particles.map((particle) => `${particle.style.getPropertyValue("--particle-x")},${particle.style.getPropertyValue("--particle-y")}`)).size === 8,
        );
        t.click(button);
        t.check(
          "liking updates its complete semantic state",
          button.getAttribute("aria-pressed") === "true" &&
            button.getAttribute("aria-label") === "Unlike this item" &&
            label.textContent === "Liked" &&
            particleField.classList.contains("is-bursting"),
        );
        t.check(
          "like motion follows the native preference",
          matchMedia(REDUCED_QUERY).matches
            ? t.style(heartWrapper).animationName === "none" &&
                particles.every((particle) => t.style(particle).animationName === "none")
            : t.style(heartWrapper).animationName === "control-like-pop",
        );
        button.focus();
        t.key(button, " ");
        t.click(button);
        t.check(
          "unliking reverses state without a burst",
          document.activeElement === button &&
            button.getAttribute("aria-pressed") === "false" &&
            button.getAttribute("aria-label") === "Like this item" &&
            label.textContent === "Like" &&
            !particleField.classList.contains("is-bursting"),
        );
        button.blur();
      },
      async replay(t) {
        const button = t.find("[data-like]");
        const particleField = t.find("[data-particles]");

        t.click(button);
        t.click(button);
        t.click(button);
        t.check(
          "rapid relike owns the current celebration timer",
          button.getAttribute("aria-pressed") === "true" && particleField.classList.contains("is-bursting"),
        );
        await t.wait(800);
        t.check("latest celebration settles once", !particleField.classList.contains("is-bursting"));
        t.click(button);
      },
      async disposed(t) {
        const button = t.find("[data-like]");
        const before = t.fingerprint(button);

        t.click(button);
        await t.frame();
        t.check("disposed like button ignores activation", t.fingerprint(button) === before);
      },
    },

    "tabs-sliding": {
      async primary(t) {
        const tablist = t.find("[data-tablist]");
        const pill = t.find("[data-tab-pill]");
        const tabs = [...tablist.querySelectorAll('[role="tab"]')];

        await new Promise((resolve) => {
          const observer = new ResizeObserver(() => {
            observer.disconnect();
            requestAnimationFrame(resolve);
          });
          observer.observe(tablist);
        });
        t.expectTransition(pill, ["transform", "width"]);
        t.check(
          "pill starts under the selected Plan tab without stale geometry",
          pill.style.width === `${tabs[0].offsetWidth}px` &&
            pill.style.transform === `translateX(${tabs[0].offsetLeft}px)` &&
            tabs[0].getAttribute("aria-selected") === "true",
        );

        t.click(tabs[2]);
        t.check(
          "pointer selection exposes only its controlled panel",
          tabs[2].getAttribute("aria-selected") === "true" &&
            tabs[2].tabIndex === 0 &&
            tabs.every((tab) => t.find(`#${tab.getAttribute("aria-controls")}`).hidden === (tab !== tabs[2])) &&
            pill.style.width === `${tabs[2].offsetWidth}px` &&
            pill.style.transform === `translateX(${tabs[2].offsetLeft}px)`,
        );

        const originalLabel = tabs[2].textContent;
        tabs[2].textContent = "Ask a much wider question";
        await t.frame(3);
        t.check(
          "selected-tab resize refreshes pill width and offset",
          pill.style.width === `${tabs[2].offsetWidth}px` && pill.style.transform === `translateX(${tabs[2].offsetLeft}px)`,
        );
        tabs[2].textContent = originalLabel;
        await t.frame(3);

        tabs[2].focus();
        t.key(tabs[2], "ArrowLeft");
        t.check(
          "ArrowLeft moves selection and keyboard focus",
          tabs[1].getAttribute("aria-selected") === "true" && document.activeElement === tabs[1],
        );
        t.key(tabs[1], "Home");
        t.check(
          "Home returns selection to the first tab",
          tabs[0].getAttribute("aria-selected") === "true" && document.activeElement === tabs[0],
        );
      },
      async replay(t) {
        const tablist = t.find("[data-tablist]");
        const pill = t.find("[data-tab-pill]");
        const tabs = [...tablist.querySelectorAll('[role="tab"]')];

        tabs[0].focus();
        t.key(tabs[0], "End");
        t.key(tabs[2], "ArrowRight");
        t.key(tabs[0], "ArrowRight");
        t.check(
          "rapid keyboard selection settles on the latest tab",
          tabs[1].getAttribute("aria-selected") === "true" &&
            document.activeElement === tabs[1] &&
            pill.style.width === `${tabs[1].offsetWidth}px` &&
            pill.style.transform === `translateX(${tabs[1].offsetLeft}px)`,
        );
        t.key(tabs[1], "Home");
      },
      async disposed(t) {
        const tablist = t.find("[data-tablist]");
        const tabs = [...tablist.querySelectorAll('[role="tab"]')];
        const before = t.fingerprint(t.root);

        t.click(tabs[1]);
        t.key(tabs[0], "End");
        await t.frame(2);
        t.check("disposed tabs ignore pointer and keyboard selection", t.fingerprint(t.root) === before);
      },
    },

    toggle: {
      async primary(t) {
        const input = t.find("[data-toggle]");
        const thumb = t.find("[data-toggle-thumb]");
        const status = t.find("[data-toggle-status]");
        const track = input.nextElementSibling;

        input.checked = false;
        status.textContent = "Off";
        thumb.classList.remove("animate-control-toggle-on", "animate-control-toggle-off");
        t.expectTransition(track, ["background-color", "box-shadow"]);
        t.check("toggle starts off without an entrance animation", !input.checked && status.textContent === "Off" && t.style(thumb).animationName === "none");

        t.click(input);
        t.check(
          "pointer activation starts the on bounce and updates live status",
          input.checked && status.textContent === "On" && thumb.classList.contains("animate-control-toggle-on"),
        );
        input.focus();
        t.key(input, " ");
        t.click(input);
        t.check(
          "focused keyboard path starts the off bounce",
          document.activeElement === input &&
            !input.checked &&
            status.textContent === "Off" &&
            thumb.classList.contains("animate-control-toggle-off") &&
            !thumb.classList.contains("animate-control-toggle-on"),
        );
        await t.wait(500);
        t.check("toggle settles at the native off state", !input.checked && !thumb.classList.contains("animate-control-toggle-off"));
        input.blur();
      },
      async replay(t) {
        const input = t.find("[data-toggle]");
        const thumb = t.find("[data-toggle-thumb]");
        const status = t.find("[data-toggle-status]");

        t.click(input);
        t.click(input);
        t.click(input);
        t.check(
          "rapid toggle reversal retains only the latest animation",
          input.checked &&
            status.textContent === "On" &&
            thumb.classList.contains("animate-control-toggle-on") &&
            !thumb.classList.contains("animate-control-toggle-off"),
        );
        await t.wait(500);
        t.check("latest toggle timer settles without stale removal", input.checked && !thumb.classList.contains("animate-control-toggle-on"));
        t.click(input);
        await t.wait(500);
      },
      async disposed(t) {
        const input = t.find("[data-toggle]");
        const thumb = t.find("[data-toggle-thumb]");
        const status = t.find("[data-toggle-status]");
        const beforeStatus = status.textContent;

        input.checked = false;
        t.click(input);
        await t.frame();
        t.check(
          "disposed toggle keeps native switching without scripted motion",
          input.checked &&
            status.textContent === beforeStatus &&
            !thumb.classList.contains("animate-control-toggle-on") &&
            !thumb.classList.contains("animate-control-toggle-off"),
        );
        input.checked = false;
      },
    },
  };
})();
