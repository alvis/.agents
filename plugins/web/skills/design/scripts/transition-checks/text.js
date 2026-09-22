(() => {
  "use strict";

  const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
  const LONG_STREAM_TEXT =
    "A narrow response should wrap onto additional lines while preserving every literal word and remaining fully readable without clipping.";
  const UNSAFE_TEXT = "Literal <img src=x onerror=alert(1)> & text";

  const isReduced = () => matchMedia(REDUCED_QUERY).matches;
  const text = (element) => element.textContent ?? "";
  const visualNumberText = (element) => text(element).replaceAll("\u00a0", " ");
  const isVisibleWord = (element) => element.dataset.visible === "true";
  const isRestingFilter = (value) => value === "none" || value === "blur(0px)";
  const isRestingTransform = (value) => value === "none" || value === "matrix(1, 0, 0, 1, 0, 0)";

  globalThis.__transitionCheckDomains ??= {};
  globalThis.__transitionCheckDomains.text = {
    "number-pop-in": {
      async primary(t) {
        const output = t.find("[data-value-output]");
        const digits = t.find("[data-digits]");
        const initialValue = "$1,249.30";
        t.check("initial number is one semantic value", text(output) === initialValue);
        t.check("initial number is visible without an entrance", text(digits) === initialValue);
        t.check(
          "initial glyphs do not animate",
          t.all("[data-digits] .animate-number-pop-in").length === 0,
        );

        const nextValue = "-12.50";
        t.input("[data-value-input]", nextValue);
        t.click("[data-replay]");
        const glyphs = t.all("[data-digits] > span");
        t.check("negative decimal value remains literal", text(digits) === nextValue);
        t.check("semantic value receives the complete update", text(output) === nextValue);
        t.check("one visual glyph is built per character", glyphs.length === nextValue.length);
        t.check(
          "glyph entrances are present only when motion is allowed",
          isReduced()
            ? glyphs.every((glyph) => !glyph.classList.contains("animate-number-pop-in"))
            : glyphs.every((glyph) => glyph.classList.contains("animate-number-pop-in")),
        );
      },
      async replay(t) {
        t.input("[data-value-input]", "$999.99");
        t.click("[data-replay]");
        t.input("[data-value-input]", UNSAFE_TEXT);
        t.click("[data-replay]");
        const digits = t.find("[data-digits]");
        t.check("rapid replay keeps only the latest value", visualNumberText(digits) === UNSAFE_TEXT);
        t.check("latest value reaches the semantic output", text(t.find("[data-value-output]")) === UNSAFE_TEXT);
        t.check("untrusted value creates no elements", digits.children.length === UNSAFE_TEXT.length);
        t.check("untrusted markup is rendered literally", digits.querySelector("img") === null);
      },
      async disposed(t) {
        const output = t.find("[data-value-output]");
        const digits = t.find("[data-digits]");
        const before = `${text(output)}|${text(digits)}|${digits.childElementCount}`;
        t.input("[data-value-input]", "-7.25");
        t.click("[data-replay]");
        const after = `${text(output)}|${text(digits)}|${digits.childElementCount}`;
        t.check("disposed number control cannot rebuild glyphs", after === before);
      },
      async controlledReduce(t) {
        const nextValue = "-98.76";
        t.input("[data-value-input]", nextValue);
        t.click("[data-replay]");
        t.check(
          "number entrance starts before reduction",
          t.all("[data-digits] .animate-number-pop-in").length === nextValue.length,
        );
        t.setReduced(true);
        await t.frame();
        t.check("reduction preserves the complete number", text(t.find("[data-digits]")) === nextValue);
        t.check("reduction preserves the semantic value", text(t.find("[data-value-output]")) === nextValue);
        t.check(
          "reduction removes every glyph animation",
          t.all("[data-digits] .animate-number-pop-in").length === 0,
        );
      },
    },

    "spinning-counter": {
      async primary(t) {
        const output = t.find("[data-counter-output]");
        const reel = t.find("[data-reel]");
        t.check("counter mounts as static readable text", text(reel) === "128" && text(output) === "128");
        t.check("counter does not spin during mount", t.all(".text-reel-strip").length === 0);

        t.input("[data-counter-input]", "-12.3abc");
        t.click("[data-spin]");
        await t.frame(2);
        if (isReduced()) {
          t.check("reduced counter commits sanitized digits", text(reel) === "123" && text(output) === "123");
        } else {
          const strips = t.all(".text-reel-strip");
          t.check("counter sanitizes unsupported sign and decimal characters", strips.length === 3);
          t.check(
            "each digit owns a bounded four-cycle reel",
            strips.every((strip) => strip.children.length === 40),
          );
          for (const strip of strips) t.expectTransition(strip, ["transform"]);
          await t.wait(750);
          t.check("counter settles to plain sanitized text", text(reel) === "123" && reel.children.length === 0);
          t.check("counter announces the complete final number", text(output) === "123");
        }
      },
      async replay(t) {
        t.input("[data-counter-input]", "999999");
        t.click("[data-spin]");
        t.input("[data-counter-input]", "42");
        t.click("[data-spin]");
        await t.frame(2);
        t.check("rapid spin rebuilds only the latest columns", t.all(".text-reel-strip").length === 2);
        await t.wait(700);
        t.check("stale settle cannot overwrite the latest counter", text(t.find("[data-reel]")) === "42");
        t.check("latest counter is announced once as a complete value", text(t.find("[data-counter-output]")) === "42");
      },
      async disposed(t) {
        const output = t.find("[data-counter-output]");
        const reel = t.find("[data-reel]");
        const before = `${text(output)}|${text(reel)}|${reel.childElementCount}`;
        t.input("[data-counter-input]", "654321");
        t.click("[data-spin]");
        await t.frame(2);
        t.check("disposed spin control leaves static counter unchanged", `${text(output)}|${text(reel)}|${reel.childElementCount}` === before);
      },
      async controlledReduce(t) {
        const nextValue = "654321";
        t.input("[data-counter-input]", nextValue);
        t.click("[data-spin]");
        await t.frame(2);
        t.check("counter reels start before reduction", t.all(".text-reel-strip").length === nextValue.length);
        t.setReduced(true);
        await t.frame();
        t.check("reduction lands every pending digit", text(t.find("[data-reel]")) === nextValue);
        t.check("reduction commits one semantic number", text(t.find("[data-counter-output]")) === nextValue);
        t.check("reduction removes intermediate reel cells", t.all(".text-reel-strip").length === 0);
      },
    },

    "streaming-text": {
      async primary(t) {
        const output = t.find("[data-stream-output]");
        const visual = t.find("[data-stream-visual]");
        t.check("initial stream is complete and semantic", text(visual) === text(output));
        t.check(
          "initial words mount fully visible",
          t.all(".streaming-word").every(isVisibleWord),
        );

        t.input("[data-stream-input]", UNSAFE_TEXT);
        t.click("[data-stream]");
        const words = t.all(".streaming-word");
        t.check("stream updates its semantic response before animation", text(output) === UNSAFE_TEXT);
        t.check("untrusted stream text creates no markup", visual.querySelector("img") === null);
        t.check("untrusted stream text remains literal", text(visual) === UNSAFE_TEXT);
        if (!isReduced()) {
          t.check("stream starts with pending words", words.some((word) => !isVisibleWord(word)));
          t.expectTransition(words[0], ["opacity", "filter"]);
          t.click("[data-complete]");
        }
        t.check("complete action reveals every word", t.all(".streaming-word").every(isVisibleWord));
        t.check("complete action disables itself", t.find("[data-complete]").disabled);

        const initialHeight = visual.getBoundingClientRect().height;
        const priorWidth = visual.style.width;
        visual.style.width = "15rem";
        t.input("[data-stream-input]", LONG_STREAM_TEXT);
        t.click("[data-stream]");
        if (!isReduced()) t.click("[data-complete]");
        await t.frame(2);
        const narrowHeight = visual.getBoundingClientRect().height;
        t.check("stream text grows to its natural wrapped height", narrowHeight > initialHeight);
        t.check("wrapped stream text is not vertically clipped", visual.scrollHeight <= visual.clientHeight + 1);
        t.check("wrapped stream text does not overflow horizontally", visual.scrollWidth <= visual.clientWidth + 1);
        visual.style.width = priorWidth;
      },
      async replay(t) {
        t.input("[data-stream-input]", LONG_STREAM_TEXT);
        t.click("[data-stream]");
        t.input("[data-stream-input]", "Latest response wins.");
        t.click("[data-stream]");
        await t.frame(2);
        t.check("replayed stream removes stale words", text(t.find("[data-stream-visual]")) === "Latest response wins.");
        t.check("replayed stream replaces the semantic response", text(t.find("[data-stream-output]")) === "Latest response wins.");
        t.click("[data-complete]");
        await t.wait(100);
        t.check("canceled timer cannot restore the stale stream", text(t.find("[data-stream-visual]")) === "Latest response wins.");
      },
      async disposed(t) {
        const output = t.find("[data-stream-output]");
        const visual = t.find("[data-stream-visual]");
        const before = `${text(output)}|${text(visual)}|${visual.childElementCount}`;
        t.input("[data-stream-input]", "Disposed text");
        t.click("[data-stream]");
        t.click("[data-complete]");
        t.check("disposed stream controls cannot change the response", `${text(output)}|${text(visual)}|${visual.childElementCount}` === before);
        t.check("disposed stream remains completely visible", t.all(".streaming-word").every(isVisibleWord));
      },
      async controlledReduce(t) {
        const nextValue = LONG_STREAM_TEXT;
        t.input("[data-stream-input]", nextValue);
        t.click("[data-stream]");
        await t.frame();
        t.check("stream has pending words before reduction", t.all(".streaming-word").some((word) => !isVisibleWord(word)));
        t.setReduced(true);
        await t.frame();
        t.check("reduction reveals every pending word", t.all(".streaming-word").every(isVisibleWord));
        t.check("reduction keeps the complete literal response", text(t.find("[data-stream-visual]")) === nextValue);
        t.check("reduction leaves a complete semantic response", text(t.find("[data-stream-output]")) === nextValue);
        t.check("reduction closes the completion control", t.find("[data-complete]").disabled);
      },
    },

    "text-states-swap": {
      async primary(t) {
        const output = t.find("[data-state-output]");
        const visual = t.find("[data-state-visual]");
        t.check("initial status is stable and semantic", text(visual) === "Ready to save" && text(output) === "Ready to save");
        t.click('[data-state="Saving changes"]');
        if (isReduced()) {
          t.check("reduced status commits immediately", text(visual) === "Saving changes" && text(output) === "Saving changes");
        } else {
          t.check("status begins its exit before replacement", visual.classList.contains("animate-text-state-exit"));
          await t.wait(180);
          t.check("status commits the selected semantic state", text(output) === "Saving changes");
          t.check("selected status enters from its final footprint", text(visual) === "Saving changes" && visual.classList.contains("animate-text-state-enter"));
          await t.wait(180);
          const style = t.style(visual);
          t.check("final status is fully visible", style.opacity === "1" && isRestingFilter(style.filter));
          t.check("final status rests at its baseline", isRestingTransform(style.transform));
        }
      },
      async replay(t) {
        t.click('[data-state="Saving changes"]');
        t.click('[data-state="Changes saved"]');
        await t.wait(180);
        t.check("rapid state changes commit only the latest visual label", text(t.find("[data-state-visual]")) === "Changes saved");
        t.check("rapid state changes announce only the latest complete state", text(t.find("[data-state-output]")) === "Changes saved");
        await t.wait(180);
        t.check("stale state timer cannot overwrite the final label", text(t.find("[data-state-visual]")) === "Changes saved");
      },
      async disposed(t) {
        const before = `${text(t.find("[data-state-output]"))}|${text(t.find("[data-state-visual]"))}`;
        t.click('[data-state="Changes saved"]');
        await t.wait(180);
        t.check("disposed state buttons cannot schedule replacement", `${text(t.find("[data-state-output]"))}|${text(t.find("[data-state-visual]"))}` === before);
      },
      async controlledReduce(t) {
        t.click('[data-state="Changes saved"]');
        t.check("status exit starts before reduction", t.find("[data-state-visual]").classList.contains("animate-text-state-exit"));
        t.setReduced(true);
        await t.frame();
        const visual = t.find("[data-state-visual]");
        t.check("reduction commits the pending visual status", text(visual) === "Changes saved");
        t.check("reduction commits the pending semantic status", text(t.find("[data-state-output]")) === "Changes saved");
        t.check("reduction removes status animation classes", !visual.classList.contains("animate-text-state-exit") && !visual.classList.contains("animate-text-state-enter"));
      },
    },

    "texts-reveal": {
      async primary(t) {
        const message = t.find("[data-message]");
        const lines = t.all(".text-reveal-line");
        t.check("reveal starts with meaningful semantic text", text(message).includes("Your workspace is ready"));
        t.check("reveal message starts shown", !message.hidden);
        if (!isReduced()) {
          t.check("each line owns its entrance", lines.every((line) => t.style(line).animationName === "texts-reveal-enter"));
          t.check("supporting line follows the heading", t.style(lines[1]).animationDelay !== t.style(lines[0]).animationDelay);
        }
        t.click("[data-hide]");
        if (!isReduced()) {
          t.check("dismissal uses one quiet message fade", message.classList.contains("animate-texts-reveal-exit"));
          await t.wait(180);
        }
        t.check("dismissed message leaves layout and accessibility tree", message.hidden);
        t.click("[data-show]");
        t.check("replay restores the complete message", !message.hidden && text(message).includes("Invite collaborators"));
      },
      async replay(t) {
        const message = t.find("[data-message]");
        t.click("[data-hide]");
        t.click("[data-show]");
        await t.wait(200);
        t.check("rapid replay cancels stale dismissal", !message.hidden);
        t.check("replayed message remains complete", text(message).includes("Your workspace is ready") && text(message).includes("Invite collaborators"));
      },
      async disposed(t) {
        const message = t.find("[data-message]");
        const before = `${message.hidden}|${message.className}`;
        t.click("[data-hide]");
        await t.wait(180);
        t.check("disposed reveal controls cannot hide the message", `${message.hidden}|${message.className}` === before);
      },
      async controlledReduce(t) {
        const message = t.find("[data-message]");
        t.click("[data-hide]");
        t.click("[data-show]");
        t.check("message entrance restarts before reduction", !message.hidden);
        t.setReduced(true);
        await t.frame();
        t.check("reduction preserves the intended shown state", !message.hidden);
        t.check("reduced message remains readable", text(message).includes("Your workspace is ready") && text(message).includes("Invite collaborators"));
      },
    },

    "shimmer-text": {
      async primary(t) {
        const shimmer = t.find("[data-shimmer]");
        const pause = t.find("[data-pause]");
        t.check("shimmer visual and semantic labels agree", text(shimmer) === text(t.find('[role="status"] .sr-only')));
        if (isReduced()) {
          t.check("reduced shimmer is paused and readable", shimmer.dataset.paused === "true" && t.style(shimmer).animationName === "none");
          t.check("reduced shimmer disables its motion control", pause.disabled && text(pause) === "Motion reduced");
          return;
        }
        t.check("shimmer starts as a persistent animation", t.style(shimmer).animationName === "shimmer-text" && t.style(shimmer).animationIterationCount === "infinite");
        t.click(pause);
        t.check("pause persists on the animated layer", shimmer.dataset.paused === "true" && pause.getAttribute("aria-pressed") === "true");
        t.check("paused shimmer offers resume", text(pause) === "Resume shimmer");
        t.click(pause);
        t.check("resume returns to the same persistent loop", shimmer.dataset.paused === "false" && text(pause) === "Pause shimmer");
      },
      async replay(t) {
        const shimmer = t.find("[data-shimmer]");
        const pause = t.find("[data-pause]");
        t.click(pause);
        await t.wait(100);
        t.click(pause);
        t.click(pause);
        t.check("repeated control leaves one persistent paused state", shimmer.dataset.paused === "true");
        t.check("repeated control keeps pressed state synchronized", pause.getAttribute("aria-pressed") === "true" && text(pause) === "Resume shimmer");
      },
      async disposed(t) {
        const shimmer = t.find("[data-shimmer]");
        const pause = t.find("[data-pause]");
        t.check("cleanup leaves persistent shimmer stopped", shimmer.dataset.paused === "true");
        t.click(pause);
        t.check("disposed shimmer control cannot resume motion", shimmer.dataset.paused === "true");
      },
      async controlledReduce(t) {
        const shimmer = t.find("[data-shimmer]");
        const pause = t.find("[data-pause]");
        t.check("shimmer is moving before reduction", shimmer.dataset.paused === "false" && t.style(shimmer).animationName === "shimmer-text");
        t.setReduced(true);
        await t.frame();
        t.check("reduction stops persistent shimmer", shimmer.dataset.paused === "true");
        t.check("reduction disables the obsolete pause control", pause.disabled && text(pause) === "Motion reduced");
      },
    },

    "reasoning-stream": {
      async primary(t) {
        const scroll = t.find("[data-scroll]");
        const pause = t.find("[data-pause]");
        const restart = t.find("[data-restart]");
        t.check("reasoning stream mounts one visual clone", scroll.children.length === 2);
        t.check("complete reasoning transcript exists once semantically", text(t.find(".sr-only")).includes("Completing validation."));
        if (isReduced()) {
          t.check("reduced reasoning stream stays at its first state", isRestingTransform(t.style(scroll).transform));
          t.check("reduced reasoning controls are disabled", pause.disabled && restart.disabled);
          return;
        }
        await t.wait(900);
        const moved = scroll.style.transform;
        t.check("reasoning stream advances by two lines", moved === "translateY(-48px)", { transform: moved });
        t.expectTransition(scroll, ["transform"]);
        t.click(pause);
        const pausedTransform = scroll.style.transform;
        await t.wait(1150);
        t.check("pause holds the current stream offset", scroll.style.transform === pausedTransform);
        t.check("pause exposes a persistent pressed state", pause.getAttribute("aria-pressed") === "true" && text(pause) === "Resume activity");
      },
      async replay(t) {
        const scroll = t.find("[data-scroll]");
        const pause = t.find("[data-pause]");
        await t.wait(900);
        t.click("[data-restart]");
        t.click(pause);
        t.check("restart returns to the first reasoning line", scroll.style.transform === "translateY(0px)" || scroll.style.transform === "translateY(0)");
        const restartedTransform = scroll.style.transform;
        await t.wait(1150);
        t.check("paused restart cancels pending stream timers", scroll.style.transform === restartedTransform);
        t.check("restart retains one visual clone", scroll.children.length === 2);
      },
      async disposed(t) {
        const scroll = t.find("[data-scroll]");
        t.check("cleanup removes the reasoning clone", scroll.children.length === 1);
        t.check("cleanup restores the first reasoning line", scroll.style.transform === "translateY(0px)" || scroll.style.transform === "translateY(0)");
        const before = scroll.style.transform;
        t.click("[data-restart]");
        t.click("[data-pause]");
        await t.wait(950);
        t.check("disposed reasoning controls schedule no movement", scroll.style.transform === before);
      },
      async controlledReduce(t) {
        const scroll = t.find("[data-scroll]");
        await t.wait(900);
        t.check("reasoning motion starts before reduction", scroll.style.transform === "translateY(-48px)");
        t.setReduced(true);
        await t.frame();
        const pause = t.find("[data-pause]");
        const restart = t.find("[data-restart]");
        t.check("reduction resets reasoning to its meaningful first state", scroll.style.transform === "translateY(0px)" || scroll.style.transform === "translateY(0)");
        t.check("reduction disables persistent motion controls", pause.disabled && restart.disabled);
        t.check("reduction labels the stopped activity", text(pause) === "Motion reduced");
        const stoppedTransform = scroll.style.transform;
        await t.wait(1150);
        t.check("reduction clears pending reasoning timers", scroll.style.transform === stoppedTransform);
      },
    },
  };
})();
