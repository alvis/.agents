# Contrast and Readability Protocol

This protocol is a hard requirement: no design is complete until every step
passes. Always measure rendered composited values in the browser — never trust
declared CSS, because elements inherit, overlay, and composite.

## Standard capture sequence

The single definition of the browser capture procedure. Every evaluation cycle
follows this exact sequence:

1. Confirm the chrome-devtools MCP Chrome is running and navigate:
   - `list_pages` — confirm Chrome is running; capture the port from
     `webSocketDebuggerUrl`.
   - `new_page <url>` — open the target in the isolated Chrome.
   - `agent-browser --cdp <port> open <url>` — attach the CLI to the same
     Chrome when CLI-side automation is needed.
2. `take_snapshot` — capture DOM structure.
3. `take_screenshot` — desktop viewport screenshot.
4. `emulate("iPhone 14")` → `take_screenshot` — mobile viewport screenshot.
5. `evaluate_script` — run the WCAG contrast script below.

When the page is themed, run the contrast script twice — once with
`data-theme="light"` and once with `data-theme="dark"` set via
`evaluate_script` — and both must pass. Let CSS transitions settle after
setting the attribute (wait roughly 2× the longest transition duration) before
measuring; a synchronous read reports the previous mode's colors
mid-transition.

## WCAG contrast script

Use this script verbatim with `evaluate_script` to check every visible text
element:

```javascript
(() => {
  function luminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  function contrastRatio(l1, l2) {
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function parseColor(str) {
    const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
  }

  function compositeAlpha(fg, bg) {
    return {
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1
    };
  }

  function resolveBackground(el) {
    let current = el;
    while (current) {
      const bg = parseColor(getComputedStyle(current).backgroundColor);
      if (bg && bg.a > 0) return bg;
      current = current.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 }; // default white
  }

  function getSelector(el) {
    if (el.id) return `#${el.id}`;
    const tag = el.tagName.toLowerCase();
    const cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
    return tag + cls;
  }

  const results = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    { acceptNode: (node) =>
      node.textContent.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    }
  );

  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    const el = textNode.parentElement;
    if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) continue;

    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || +style.opacity === 0) continue;

    const fgColor = parseColor(style.color);
    if (!fgColor) continue;

    const bgColor = resolveBackground(el);
    const effectiveFg = fgColor.a < 1 ? compositeAlpha(fgColor, bgColor) : fgColor;
    const effectiveBg = bgColor;

    const fgLum = luminance(effectiveFg.r, effectiveFg.g, effectiveFg.b);
    const bgLum = luminance(effectiveBg.r, effectiveBg.g, effectiveBg.b);
    const ratio = contrastRatio(fgLum, bgLum);

    const fontSize = parseFloat(style.fontSize);
    const fontWeight = parseInt(style.fontWeight, 10) || 400;
    const isLargeText = fontSize >= 24 || (fontSize >= 18.67 && fontWeight >= 700);
    const threshold = isLargeText ? 3.0 : 4.5;

    const hasGradient = style.backgroundImage && style.backgroundImage !== 'none';

    results.push({
      selector: getSelector(el),
      text: textNode.textContent.trim().substring(0, 50),
      fg: `rgb(${Math.round(effectiveFg.r)},${Math.round(effectiveFg.g)},${Math.round(effectiveFg.b)})`,
      bg: `rgb(${Math.round(effectiveBg.r)},${Math.round(effectiveBg.g)},${Math.round(effectiveBg.b)})`,
      ratio: Math.round(ratio * 100) / 100,
      threshold,
      pass: ratio >= threshold,
      fontSize: Math.round(fontSize * 10) / 10,
      fontWeight,
      hasGradient
    });
  }

  return JSON.stringify({
    total: results.length,
    passing: results.filter(r => r.pass).length,
    failing: results.filter(r => !r.pass),
    needsManualReview: results.filter(r => r.hasGradient),
    allResults: results
  });
})()
```

## Interpreting results

- **Normal text**: minimum 4.5:1 contrast ratio (WCAG AA).
- **Large text** (≥24px, or ≥18.67px bold): minimum 3:1 (WCAG AA).
- For each failing element, record selector, text, computed foreground and
  background, ratio, and threshold before fixing.
- Elements with `hasGradient: true` — plus any glassmorphism, backdrop-blur,
  or overlay surface — cannot be scored automatically: visually verify the
  screenshot at the worst-case point of the gradient or blur.
- Perceived readability check: review desktop and mobile screenshots for text
  that technically passes but feels dim or hard to read — low-opacity text,
  thin fonts on busy backgrounds, small text near the 4.5:1 boundary — and
  iterate until it is clearly readable.

For individual element deep-dives beyond the script, inspect via
`evaluate_script`: computed `color` and `background-color`,
`background-image` (gradients, overlays), `opacity` and alpha at every
ancestor, `font-size`/`font-weight` for the large-text threshold, and class
names to trace back to design tokens.

## Lighthouse is secondary

- Lighthouse accessibility scores are a secondary signal only.
- If Lighthouse passes but the script or screenshot shows unreadable text, the
  element fails.
- If Lighthouse fails but rendered values and screenshots confirm adequate
  contrast, the element passes.
- Always prefer `evaluate_script` + screenshot evidence over Lighthouse.
