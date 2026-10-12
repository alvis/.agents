# Contrast and readability protocol

Measure rendered, composited contrast in the browser. Never trust declared CSS: elements inherit, overlay, and composite. This protocol produces evidence for the **Accessibility and input access** readiness check in `web:directions/evaluation.md`; DES-COLR-02 owns the thresholds.

## Capture

1. Open the target in the isolated Chrome DevTools session (`list_pages`, then `new_page <url>`), and attach `agent-browser --cdp <port>` when CLI automation is needed.
2. Take a DOM snapshot, then render each viewport the coverage contract requires (DES-RESP-01) and screenshot it.
3. For every color mode the product supports, set it (for example `data-theme="light"` and `"dark"` through `evaluate_script`). Wait about twice the longest transition duration so the measurement doesn't capture a mid-transition color, then measure. A mode the product does not support is N/A; a supported mode left unmeasured is unverified.

## Measure

Use the canonical audit script, `web:scripts/audits/wcag-text-audit.js`; never keep a private copy. Either run the full `web:audit` CLI, or inject that file's contents through `evaluate_script` and return `window.runWcagTextAudit({ quiet: true })`.

The script walks visible leaf text, samples the stacked backgrounds at each element, composites translucent text and surfaces, converts any computed color syntax (including `oklch()`, `lab()`, and `color()`) to sRGB, and applies the DES-COLR-02 thresholds for normal and large text.

## Interpret

- `issues` with `ruleId: "contrast"` are measured failures. Record the selector, text, foreground, background, ratio, and threshold before fixing.
- `manualReview` items are **unverified**, never passes. They cover a text color the script could not convert, transparent text fills (gradient or image text), text over background images, gradients, filters, backdrop filters, blend modes, or opacity, and a composited translucent surface whose result is near the threshold. Resolve each one by inspecting a crop at the worst-case point, or by sampling pixels, and record the method.
- Text that passes but reads poorly (low opacity, a thin face on a busy surface, small text just above its minimum) is a Craft finding, not a pass to defend.
- Lighthouse and other automated scores are secondary signals. If a score passes but the rendered evidence shows unreadable text, the text fails. If a score fails but the rendered evidence confirms adequate contrast, record that evidence.

For a deeper look at one element, inspect its computed `color`, `background-color`, `background-image`, and `opacity`, alpha at every ancestor, `font-size` and `font-weight`, and the token behind each value.
