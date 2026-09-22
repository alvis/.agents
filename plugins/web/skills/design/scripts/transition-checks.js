(() => {
  "use strict";

  const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
  const REQUIRED_PHASES = new Set(["primary", "replay", "disposed"]);
  const VALID_PHASES = new Set([
    ...REQUIRED_PHASES,
    "controlled_js_reduce",
    "controlled_css_reduce",
    "native_reduce",
    "overflow",
  ]);

  globalThis.__transitionCheckDomains ??= {};

  const wait = (milliseconds) =>
    new Promise((resolve) => window.setTimeout(resolve, milliseconds));

  const frame = async (count = 1) => {
    for (let index = 0; index < count; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  };

  const resolveElement = (root, selectorOrElement) => {
    if (typeof selectorOrElement !== "string") return selectorOrElement;
    const element = root.querySelector(selectorOrElement);
    if (!element) throw new Error(`Missing element: ${selectorOrElement}`);
    return element;
  };

  const splitList = (value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

  const transitionIncludes = (style, property) => {
    const properties = splitList(style.transitionProperty);
    return properties.includes(property);
  };

  const isNeutralTranslate = (value) =>
    value === "none" || /^0(?:px)?(?: 0(?:px)?)?(?: 0(?:px)?)?$/.test(value);

  const isNeutralScale = (value) =>
    value === "none" || value === "1" || value === "1 1" || value === "1 1 1";

  const checkIndividualTransitionAlignment = (check, root) => {
    const patterns = [
      ["translate", /(?:^|:)-?translate-(?:x|y|none|\[)/],
      ["scale", /(?:^|:)scale-(?:x|y|none|\[|\d)/],
      ["rotate", /(?:^|:)-?rotate-(?:\[|\d)/],
    ];
    for (const [index, element] of [...root.querySelectorAll("[class]")].entries()) {
      const className = element.getAttribute("class") ?? "";
      const tokens = className.split(/\s+/);
      const style = getComputedStyle(element);
      if (style.transitionProperty === "none" || isZeroTimeList(style.transitionDuration)) continue;
      for (const [property, pattern] of patterns) {
        if (
          !tokens.some(
            (token) =>
              token.includes(":") &&
              !token.startsWith("motion-reduce:") &&
              pattern.test(token),
          )
        ) {
          continue;
        }
        check(
          `${property} utility ${index} is transitioned as an individual property`,
          transitionIncludes(style, property),
          { className, transitionProperty: style.transitionProperty },
        );
      }
    }
  };

  const motionSnapshot = (element, pseudoElement) => {
    const style = getComputedStyle(element, pseudoElement);
    return {
      animationDuration: style.animationDuration,
      animationName: style.animationName,
      filter: style.filter,
      rotate: style.rotate,
      scale: style.scale,
      transform: style.transform,
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
      translate: style.translate,
    };
  };

  const isZeroTimeList = (value) =>
    splitList(value).every((part) => Number.parseFloat(part) === 0);

  const isSuppressedChange = (before, after) => {
    if (
      before.animationName !== after.animationName ||
      before.animationDuration !== after.animationDuration
    ) {
      if (after.animationName === "none" || isZeroTimeList(after.animationDuration)) {
        return true;
      }
    }
    if (
      before.transitionProperty !== after.transitionProperty ||
      before.transitionDuration !== after.transitionDuration
    ) {
      if (
        after.transitionProperty === "none" ||
        isZeroTimeList(after.transitionDuration)
      ) {
        return true;
      }
    }
    if (before.translate !== after.translate) {
      if (isNeutralTranslate(after.translate)) {
        return true;
      }
    }
    if (before.scale !== after.scale) {
      if (isNeutralScale(after.scale)) {
        return true;
      }
    }
    if (before.rotate !== after.rotate) {
      if (after.rotate === "none" || after.rotate === "0deg") return true;
    }
    if (before.transform !== after.transform && after.transform === "none") return true;
    if (before.filter !== after.filter && after.filter === "none") return true;
    return false;
  };

  const collectReducedCss = () => {
    const css = [];
    const inaccessible = [];

    const extractRule = (rule, insideReducedMedia = false) => {
      const isReducedMedia =
        rule.type === CSSRule.MEDIA_RULE &&
        /prefers-reduced-motion\s*:\s*reduce/i.test(rule.conditionText);
      if (isReducedMedia) {
        return [...rule.cssRules]
          .map((child) => extractRule(child, true))
          .filter(Boolean)
          .join("\n");
      }

      const children = "cssRules" in rule && rule.cssRules ? [...rule.cssRules] : [];
      if (insideReducedMedia) {
        if (rule.selectorText || children.length === 0) return rule.cssText;
        const inner = children
          .map((child) => extractRule(child, true))
          .filter(Boolean)
          .join("\n");
        if (!inner) return "";
        const header = rule.cssText.slice(0, rule.cssText.indexOf("{")).trim();
        return `${header}{${inner}}`;
      }

      if (children.length === 0) return "";
      const inner = children
        .map((child) => extractRule(child, false))
        .filter(Boolean)
        .join("\n");
      if (!inner) return "";
      if (rule.selectorText) return `${rule.selectorText}{${inner}}`;
      const header = rule.cssText.slice(0, rule.cssText.indexOf("{")).trim();
      return `${header}{${inner}}`;
    };

    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          const extracted = extractRule(rule);
          if (extracted) css.push(extracted);
        }
      } catch (error) {
        inaccessible.push({ href: sheet.href, message: String(error) });
      }
    }
    return { css: css.join("\n"), inaccessible };
  };

  const makeControlledMotionQuery = (originalMatchMedia) => {
    const target = new EventTarget();
    let matches = false;
    let onchange = null;
    const legacyListeners = new Set();

    Object.defineProperties(target, {
      matches: { get: () => matches },
      media: { value: REDUCED_QUERY },
      onchange: {
        get: () => onchange,
        set: (listener) => {
          onchange = typeof listener === "function" ? listener : null;
        },
      },
    });
    target.addListener = (listener) => legacyListeners.add(listener);
    target.removeListener = (listener) => legacyListeners.delete(listener);

    let eventListenerCount = 0;
    const nativeAddEventListener = target.addEventListener.bind(target);
    const nativeRemoveEventListener = target.removeEventListener.bind(target);
    target.addEventListener = (type, listener, options) => {
      if (type === "change" && listener) eventListenerCount += 1;
      nativeAddEventListener(type, listener, options);
      if (options?.signal) {
        options.signal.addEventListener(
          "abort",
          () => {
            if (type === "change" && listener) eventListenerCount = Math.max(0, eventListenerCount - 1);
          },
          { once: true },
        );
      }
    };
    target.removeEventListener = (type, listener, options) => {
      if (type === "change" && listener) eventListenerCount = Math.max(0, eventListenerCount - 1);
      nativeRemoveEventListener(type, listener, options);
    };

    const setMatches = (nextMatches) => {
      if (matches === Boolean(nextMatches)) return;
      matches = Boolean(nextMatches);
      const event = new Event("change");
      Object.defineProperty(event, "matches", { value: matches });
      Object.defineProperty(event, "media", { value: REDUCED_QUERY });
      target.dispatchEvent(event);
      for (const listener of legacyListeners) listener.call(target, event);
      onchange?.call(target, event);
    };

    return {
      matchMedia(query) {
        return query === REDUCED_QUERY ? target : originalMatchMedia(query);
      },
      listenerCount() {
        return eventListenerCount + legacyListeners.size + (onchange ? 1 : 0);
      },
      setMatches,
    };
  };

  const findAdapter = (id) => {
    for (const domain of Object.values(globalThis.__transitionCheckDomains)) {
      if (domain && Object.hasOwn(domain, id)) return domain[id];
    }
    return undefined;
  };

  const makeContext = ({ checks, fixture, phase, controlledMotion }) => {
    const { root } = fixture;
    const check = (name, condition, details) => {
      const pass = Boolean(condition);
      checks.push({ name, pass, ...(details === undefined ? {} : { details }) });
      return pass;
    };
    const element = (selectorOrElement) => resolveElement(root, selectorOrElement);

    return {
      root,
      fixture,
      id: fixture.id,
      find: (selector) => element(selector),
      all: (selector) => [...root.querySelectorAll(selector)],
      click: (selectorOrElement) => element(selectorOrElement).click(),
      input(selectorOrElement, value) {
        const control = element(selectorOrElement);
        control.value = value;
        control.dispatchEvent(new Event("input", { bubbles: true }));
      },
      change(selectorOrElement, value) {
        const control = element(selectorOrElement);
        if (value !== undefined) {
          if ("checked" in control && typeof value === "boolean") control.checked = value;
          else control.value = value;
        }
        control.dispatchEvent(new Event("change", { bubbles: true }));
      },
      key(selectorOrElement, key, init = {}) {
        const control = element(selectorOrElement);
        control.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init }),
        );
      },
      pointer(selectorOrElement, type, init = {}) {
        const control = element(selectorOrElement);
        const EventConstructor = globalThis.PointerEvent ?? MouseEvent;
        const event = new EventConstructor(type, {
          bubbles: type !== "pointerenter" && type !== "pointerleave",
          cancelable: true,
          ...init,
        });
        if (!("pointerType" in event) && init.pointerType) {
          Object.defineProperty(event, "pointerType", { value: init.pointerType });
        }
        control.dispatchEvent(event);
      },
      frame,
      wait,
      style: (selectorOrElement) => getComputedStyle(element(selectorOrElement)),
      check,
      expectTransition(selectorOrElement, properties) {
        const control = element(selectorOrElement);
        const style = getComputedStyle(control);
        for (const property of properties) {
          if (phase === "native_reduce" && matchMedia(REDUCED_QUERY).matches) {
            check(
              `${property} interpolation is suppressed`,
              style.transitionProperty === "none" || isZeroTimeList(style.transitionDuration),
              {
                selector: typeof selectorOrElement === "string" ? selectorOrElement : undefined,
                transitionDuration: style.transitionDuration,
                transitionProperty: style.transitionProperty,
              },
            );
          } else {
            check(
              `${property} is an explicitly transitioned property`,
              transitionIncludes(style, property),
              {
                selector: typeof selectorOrElement === "string" ? selectorOrElement : undefined,
                transitionDuration: style.transitionDuration,
                transitionProperty: style.transitionProperty,
              },
            );
          }
        }
      },
      fingerprint(selectorOrElement = root) {
        const control = element(selectorOrElement);
        const values = [...control.querySelectorAll("input,select,textarea")].map((item) => ({
          checked: "checked" in item ? item.checked : undefined,
          value: item.value,
        }));
        return JSON.stringify({ html: control.outerHTML, values });
      },
      setReduced(matches) {
        if (!controlledMotion) {
          throw new Error("setReduced is available only in controlled_js_reduce");
        }
        controlledMotion.setMatches(matches);
      },
    };
  };

  const exerciseFirstControl = async (root) => {
    const control =
      root.querySelector('button:not([disabled]):not([data-pause]), [role="tab"]') ??
      root.querySelector("select:not([disabled])") ??
      root.querySelector("input:not([disabled]), textarea:not([disabled])") ??
      root.querySelector('[tabindex="0"]');
    if (!control) return false;
    if (control instanceof HTMLSelectElement && control.options.length > 1) {
      control.selectedIndex = 1;
      control.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      control.click();
    }
    await frame(2);
    return true;
  };

  const runControlledCss = async ({ check, fixture }) => {
    fixture.mount();
    await exerciseFirstControl(fixture.root);
    const elements = [fixture.root, ...fixture.root.querySelectorAll("*")];
    const motionTargets = elements.flatMap((element) => [
      { element, pseudoElement: null },
      { element, pseudoElement: "::before" },
      { element, pseudoElement: "::after" },
    ]);
    const before = motionTargets.map(({ element, pseudoElement }) =>
      motionSnapshot(element, pseudoElement),
    );
    const reduced = collectReducedCss();
    if (!reduced.css) {
      if (reduced.inaccessible.length > 0) {
        check("compiled reduced-motion rules are readable", false, {
          inaccessible: reduced.inaccessible,
        });
        return true;
      }
      return false;
    }
    check("compiled reduced-motion rules are readable", reduced.css.length > 0, {
      inaccessible: reduced.inaccessible,
    });

    const style = document.createElement("style");
    style.dataset.transitionControlledReduce = "";
    style.textContent = reduced.css;
    document.head.appendChild(style);
    try {
      await frame(2);
      const after = motionTargets.map(({ element, pseudoElement }) =>
        motionSnapshot(element, pseudoElement),
      );
      const changed = after
        .map((snapshot, index) => ({ before: before[index], after: snapshot }))
        .filter(({ before: earlier, after: later }) => JSON.stringify(earlier) !== JSON.stringify(later));
      check("compiled reduced-motion declarations affect the fixture", changed.length > 0, {
        changedElements: changed.length,
      });
      check(
        "changed motion styles reach a non-interpolating fallback",
        changed.some(({ before: earlier, after: later }) => isSuppressedChange(earlier, later)),
        { changedElements: changed.length },
      );
      const reducedTransformElements = elements.filter((element) => {
        const className = element.getAttribute?.("class") ?? "";
        return (
          className.includes("motion-reduce:transform-none") ||
          className.includes("motion-reduce:translate-none") ||
          className.includes("motion-reduce:translate-x-0") ||
          className.includes("motion-reduce:translate-y-0") ||
          className.includes("motion-reduce:scale-100")
        );
      });
      for (const [index, element] of reducedTransformElements.entries()) {
        const className = element.getAttribute("class");
        const style = getComputedStyle(element);
        const usesTranslate = /(?:^|\s)(?:[^\s:]+:)*-?translate-[xy]-/.test(className);
        const usesScale = /(?:^|\s)(?:[^\s:]+:)*scale-/.test(className);
        if (
          className.includes("motion-reduce:translate-none") ||
          className.includes("motion-reduce:translate-x-0") ||
          className.includes("motion-reduce:translate-y-0") ||
          (className.includes("motion-reduce:transform-none") && usesTranslate)
        ) {
          check(`reduced transform ${index} resets actual translate`, isNeutralTranslate(style.translate), {
            className,
            translate: style.translate,
          });
        }
        if (
          className.includes("motion-reduce:scale-100") ||
          (className.includes("motion-reduce:transform-none") && usesScale)
        ) {
          check(`reduced transform ${index} resets actual scale`, isNeutralScale(style.scale), {
            className,
            scale: style.scale,
          });
        }
      }
    } finally {
      style.remove();
      fixture.mount();
    }
    return true;
  };

  const checkOverflow = (check, root) => {
    const viewportWidth = document.documentElement.clientWidth;
    const rootBox = root.getBoundingClientRect();
    check(
      "fixture does not create document-level horizontal overflow",
      document.documentElement.scrollWidth <= viewportWidth + 1,
      { scrollWidth: document.documentElement.scrollWidth, viewportWidth },
    );
    check(
      "fixture root remains inside the viewport",
      rootBox.left >= -1 && rootBox.right <= viewportWidth + 1,
      { left: rootBox.left, right: rootBox.right, viewportWidth },
    );
  };

  globalThis.__runTransitionChecks = async ({ phase = "primary" } = {}) => {
    const fixture = globalThis.__transitionFixture;
    if (!fixture?.root || typeof fixture.mount !== "function" || typeof fixture.dispose !== "function") {
      throw new Error("Missing __transitionFixture lifecycle API");
    }
    if (!VALID_PHASES.has(phase)) throw new Error(`Unknown transition check phase: ${phase}`);

    const checks = [];
    const errors = [];
    let status = "passed";
    const recordError = (error) => {
      errors.push({ message: error?.message ?? String(error), stack: error?.stack });
    };
    const onError = (event) => recordError(event.error ?? event.message);
    const onUnhandledRejection = (event) => recordError(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    let controlledMotion;
    let restoreMatchMedia;
    try {
      const adapter = findAdapter(fixture.id);
      const baseContext = makeContext({ checks, fixture, phase });
      const { check } = baseContext;
      if (!adapter) {
        check("recipe has a registered behavior oracle", false, { id: fixture.id });
      } else if (phase === "controlled_css_reduce") {
        const isApplicable = await runControlledCss({ check, fixture });
        if (!isApplicable) status = "not_applicable";
      } else if (phase === "controlled_js_reduce") {
        if (typeof adapter.controlledReduce !== "function") {
          status = "not_applicable";
        } else {
          fixture.dispose();
          const originalMatchMedia = window.matchMedia.bind(window);
          controlledMotion = makeControlledMotionQuery(originalMatchMedia);
          restoreMatchMedia = () => {
            window.matchMedia = originalMatchMedia;
          };
          window.matchMedia = controlledMotion.matchMedia;
          fixture.mount();
          const context = makeContext({ checks, fixture, phase, controlledMotion });
          await adapter.controlledReduce(context);
          fixture.dispose();
          check(
            "controlled reduced-motion listeners are removed on disposal",
            controlledMotion.listenerCount() === 0,
            { listenerCount: controlledMotion.listenerCount() },
          );
          restoreMatchMedia();
          restoreMatchMedia = undefined;
          fixture.mount();
        }
      } else if (phase === "native_reduce") {
        if (!matchMedia(REDUCED_QUERY).matches) {
          status = "unverified";
          checks.push({
            name: "native reduced-motion media query is active",
            pass: null,
            status: "unverified",
            details: "The browser reports no native reduced-motion preference.",
          });
        } else {
          fixture.mount();
          const handler = adapter.primary;
          if (typeof handler !== "function") {
            check("recipe has a primary oracle for native reduced motion", false);
          } else {
            await handler(baseContext);
          }
        }
      } else if (phase === "disposed") {
        if (typeof adapter.disposed !== "function") {
          check("recipe has a disposal oracle", false, { id: fixture.id });
        } else {
          fixture.dispose();
          await adapter.disposed(baseContext);
          fixture.mount();
        }
      } else if (phase === "overflow") {
        checkOverflow(check, fixture.root);
      } else {
        const handler = adapter[phase];
        if (typeof handler !== "function") {
          check(`recipe has a ${phase} oracle`, !REQUIRED_PHASES.has(phase), { id: fixture.id });
        } else {
          fixture.mount();
          await handler(baseContext);
          checkIndividualTransitionAlignment(check, fixture.root);
        }
      }
      if (phase !== "overflow") checkOverflow(check, fixture.root);
      await wait(0);
    } catch (error) {
      recordError(error);
    } finally {
      if (restoreMatchMedia) restoreMatchMedia();
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    }

    if (errors.length > 0 || checks.some((entry) => entry.pass === false)) {
      status = "failed";
    }
    return {
      id: fixture.id,
      phase,
      status,
      checks,
      errors,
      viewport: {
        height: document.documentElement.clientHeight,
        width: document.documentElement.clientWidth,
      },
    };
  };
})();
