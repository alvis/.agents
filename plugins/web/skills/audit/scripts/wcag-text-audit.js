/**
 * WCAG text contrast and readability audit.
 *
 * Browser-injectable, framework-agnostic module.
 * Audits rendered leaf text elements for contrast ratio (WCAG AA/AAA),
 * font sizing, line metrics, collapsed-width detection, frame clearance,
 * and navbar control geometry.
 *
 * Preserves the original relative-luminance calculation and contrast-ratio
 * math exactly -- these are the WCAG 2.x reference formulas.
 *
 * Usage (injected via <script src>):
 *   const report = window.runWcagTextAudit({ quiet: true });
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // DES rule-ID mapping for WCAG text issues
  // ---------------------------------------------------------------------------
  var DES_RULE_MAP = {
    'contrast':                'DES-COLR-02',
    'collapsed-width':         'DES-TYPO-02',
    'narrow-heading-width':    'DES-TYPO-02',
    'tight-frame-spacing':     'DES-SPAC-01',
    'tight-label-spacing':     'DES-SPAC-01',
    'control-height-too-small': 'DES-RESP-02',
    'cramped-pill-aspect':     'DES-COMP-01',
    'cramped-search-width':    'DES-COMP-01',
    'inconsistent-control-heights': 'DES-COMP-01',
  };

  // ---------------------------------------------------------------------------
  // Main audit
  // ---------------------------------------------------------------------------

  window.runWcagTextAudit = function (options) {
    options = options || {};

    var settings = {
      quiet: true,
      includePassing: false,
      minTextLength: 2,
      maxFailures: 250,
      maxManualReview: 250,
      maxIssues: 500,
      sampleXRatio: 0.35,
      sampleYRatio: 0.5,
      selectorBackgrounds: [],
      ignoreSelectors: [],
      manualReviewContrastBuffer: 0.75,
      minReliableSurfaceAlpha: 0.6,
      minCollapsedLineCount: 4,
      minAverageWordsPerLine: 2.6,
      minAverageCharsPerLine: 14,
      minExpandableWidthGain: 120,
      minExpandableWidthRatio: 1.45,
      maxComfortableLineLength: 72,
      minFrameClearance: 12,
      maxContainerDepth: 7,
      minNarrowHeadingLineCount: 4,
      maxNarrowHeadingCharsPerLine: 18,
      minNarrowHeadingWidthGain: 160,
      minNarrowHeadingWidthRatio: 1.7,
      minControlHeight: 44,
      minDesktopSearchWidth: 240,
      maxNavbarControlHeightDelta: 6,
      minPillAspectRatio: 1.55,
      maxShortControlChars: 12,
      minSingleLineLabelClearance: 10,
      // Generic selectors -- no framework-specific defaults
      selectors: {
        navbar: 'nav, header nav, [role="navigation"]',
        sidebar: 'aside, [role="complementary"], .sidebar',
        footer: 'footer, [role="contentinfo"]',
        main: 'main, [role="main"], #content',
        toc: '[role="navigation"][aria-label*="table"], .toc, .table-of-contents',
      },
      // Navbar control selectors -- generic replacements for Docusaurus classes
      navbarControlSelector:
        'nav button, nav [role="button"], nav a, header nav button, header nav a, ' +
        'nav input[type="search"], nav input[type="text"], [role="navigation"] button',
      searchInputSelector: 'input[type="search"], input[name="search"], input[aria-label*="search" i]',
      exclude: [],
      viewport: 'desktop',
    };

    // Merge caller options
    Object.keys(options).forEach(function (key) {
      if (key === 'selectors' && typeof options.selectors === 'object') {
        Object.keys(options.selectors).forEach(function (sk) {
          settings.selectors[sk] = options.selectors[sk];
        });
      } else {
        settings[key] = options[key];
      }
    });

    var ignoredSelectors = (settings.ignoreSelectors || []).filter(Boolean)
      .concat((settings.exclude || []).filter(Boolean));

    // -----------------------------------------------------------------------
    // Color utilities
    // -----------------------------------------------------------------------

    var isTransparentValue = function (value) {
      return !value || value === 'transparent' || value === 'none';
    };

    /** Parse an rgb()/rgba() string, comma or space separated, into { r, g, b, a }. */
    var parseRgbFunction = function (value) {
      var match = value.match(/^rgba?\(([^)]+)\)$/);
      if (!match) return null;
      var parts = match[1].split(/[\s,\/]+/).filter(Boolean);
      if (parts.length < 3 || parts.some(function (p) { return p.indexOf('%') !== -1 || p === 'none'; })) return null;
      var numbers = parts.map(function (p) { return parseFloat(p); });
      if (numbers.some(function (n) { return isNaN(n); })) return null;
      var a = numbers.length > 3 ? numbers[3] : 1;
      return { r: numbers[0], g: numbers[1], b: numbers[2], a: a };
    };

    // Chrome serializes colors declared in oklch(), lab(), color(), and other
    // modern syntaxes in that syntax, so normalize them to sRGB by painting one
    // canvas pixel; a value the canvas rejects stays unparsed.
    var colorCanvas = null;
    var parseWithCanvas = function (value) {
      try {
        if (!colorCanvas) {
          var canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          colorCanvas = canvas.getContext('2d', { willReadFrequently: true });
        }
        if (!colorCanvas) return null;
        var sentinels = ['#010203', '#040506'];
        var accepted = sentinels.every(function (sentinel) {
          colorCanvas.fillStyle = sentinel;
          colorCanvas.fillStyle = value;
          return colorCanvas.fillStyle !== sentinel;
        });
        if (!accepted) return null;
        colorCanvas.clearRect(0, 0, 1, 1);
        colorCanvas.fillRect(0, 0, 1, 1);
        var pixel = colorCanvas.getImageData(0, 0, 1, 1).data;
        return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] / 255 };
      } catch (error) {
        return null;
      }
    };

    /** Convert any computed CSS color to sRGB { r, g, b, a }, with alpha 0 for transparent; null when unconvertible. */
    var toSrgb = function (value) {
      if (isTransparentValue(value)) return { r: 0, g: 0, b: 0, a: 0 };
      return parseRgbFunction(value) || parseWithCanvas(value);
    };

    /** A visible color in sRGB; null when transparent or unconvertible. */
    var parseColor = function (value) {
      var color = toSrgb(value);
      return color && color.a > 0 ? color : null;
    };

    /** Alpha-composite foreground over background. */
    var composite = function (fg, bg) {
      var a = fg.a + bg.a * (1 - fg.a);
      return {
        r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
        g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
        b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
        a: a,
      };
    };

    var toRgbString = function (c) {
      return 'rgb(' + Math.round(c.r) + ', ' + Math.round(c.g) + ', ' + Math.round(c.b) + ')';
    };

    var toHex = function (c) {
      return '#' + [c.r, c.g, c.b].map(function (v) {
        return Math.round(v).toString(16).padStart(2, '0');
      }).join('');
    };

    var toFixedNumber = function (value, digits) {
      if (digits === undefined) digits = 2;
      return Number(value.toFixed(digits));
    };

    /**
     * WCAG relative luminance.
     * Uses the exact sRGB linearization from WCAG 2.x specification.
     */
    var luminance = function (c) {
      var vals = [c.r, c.g, c.b].map(function (ch) {
        var n = ch / 255;
        return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2];
    };

    /** WCAG contrast ratio between two opaque colors. */
    var getContrastRatio = function (fg, bg) {
      var lighter = Math.max(luminance(fg), luminance(bg));
      var darker = Math.min(luminance(fg), luminance(bg));
      return (lighter + 0.05) / (darker + 0.05);
    };

    // -----------------------------------------------------------------------
    // Background resolution
    // -----------------------------------------------------------------------

    var getBodyBackground = function () {
      var bodyColor = parseColor(getComputedStyle(document.body).backgroundColor);
      return bodyColor || { r: 255, g: 255, b: 255, a: 1 };
    };

    var normalizeOverride = function (override) {
      if (typeof override === 'string') {
        return {
          selector: override,
          backgroundColor: null,
          backgroundSelector: override,
          label: override,
        };
      }
      return {
        selector: override.selector,
        backgroundColor: override.backgroundColor || null,
        backgroundSelector: override.backgroundSelector || override.selector,
        label: override.label || override.selector,
      };
    };

    var selectorBackgrounds = settings.selectorBackgrounds.map(normalizeOverride);

    var matchesIgnoredSelector = function (element) {
      return ignoredSelectors.some(function (sel) { return element.closest(sel); });
    };

    // -----------------------------------------------------------------------
    // Visibility and leaf-text detection
    // -----------------------------------------------------------------------

    var isVisibleLeafTextElement = function (element) {
      // Only consider true leaf elements (no child elements with text). This
      // cheap check runs first because every div on the page reaches it.
      for (var i = 0; i < element.children.length; i++) {
        var child = element.children[i];
        if ((child.textContent || '').trim() && (child.innerText || '').trim()) return false;
      }

      var text = (element.innerText || element.textContent || '').trim().replace(/\s+/g, ' ');
      if (text.length < settings.minTextLength) return false;

      var style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (parseFloat(style.opacity || '1') === 0) return false;

      var rect = element.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 8) return false;
      return true;
    };

    // -----------------------------------------------------------------------
    // Sample point for elementsFromPoint
    // -----------------------------------------------------------------------

    var getSamplePoint = function (rect) {
      var x = Math.max(1, Math.min(
        window.innerWidth - 1,
        rect.left + Math.min(Math.max(rect.width * settings.sampleXRatio, 4), rect.width - 1)
      ));
      var y = Math.max(1, Math.min(
        window.innerHeight - 1,
        rect.top + Math.min(Math.max(rect.height * settings.sampleYRatio, 4), rect.height - 1)
      ));
      return { x: x, y: y };
    };

    // -----------------------------------------------------------------------
    // Effective background via elementsFromPoint stack
    // -----------------------------------------------------------------------

    var getEffectiveBackground = function (target, samplePoint) {
      var stack = document.elementsFromPoint(samplePoint.x, samplePoint.y);
      var bg = getBodyBackground();

      // Off-screen, covered, or pointer-events:none text is missing from the
      // hit-test stack, so composite its own ancestors instead of whatever
      // happens to sit at the sample point.
      if (stack.indexOf(target) === -1) {
        var ancestors = [];
        for (var node = target; node && node !== document.documentElement; node = node.parentElement) {
          ancestors.push(node);
        }
        for (var j = ancestors.length - 1; j >= 0; j--) {
          var layer = parseColor(getComputedStyle(ancestors[j]).backgroundColor);
          if (layer) bg = composite(layer, bg);
        }
        return bg;
      }

      for (var i = stack.length - 1; i >= 0; i--) {
        var el = stack[i];
        var color = parseColor(getComputedStyle(el).backgroundColor);
        if (color && color.a > 0) {
          bg = composite(color, bg);
        }
        if (el === target) break;
      }
      return bg;
    };

    // -----------------------------------------------------------------------
    // Reliable surface fallback (walks up to find a solid ancestor)
    // -----------------------------------------------------------------------

    var getReliableSurfaceBackground = function (element) {
      var current = element;
      var depth = 0;
      // Translucent layers found on the way up sit above the solid surface,
      // so they are composited over it once that surface is known.
      var translucentLayers = [];

      while (current && current !== document.documentElement && depth < 12) {
        var style = getComputedStyle(current);
        var color = parseColor(style.backgroundColor);
        var hasStrongEffects =
          (style.backgroundImage && style.backgroundImage !== 'none') ||
          (style.backdropFilter && style.backdropFilter !== 'none') ||
          (style.filter && style.filter !== 'none') ||
          (style.mixBlendMode && style.mixBlendMode !== 'normal');

        if (color && color.a >= settings.minReliableSurfaceAlpha && !hasStrongEffects) {
          var surface = composite(color, getBodyBackground());
          for (var i = translucentLayers.length - 1; i >= 0; i--) {
            surface = composite(translucentLayers[i], surface);
          }
          return {
            color: surface,
            source: 'solid-surface-fallback',
            selector: getSelectorHint(current),
          };
        }
        if (color && color.a > 0) {
          translucentLayers.push(color);
        }
        current = current.parentElement;
        depth++;
      }
      return null;
    };

    // -----------------------------------------------------------------------
    // Complex surface flags (gradient, backdrop-filter, pseudo backgrounds, etc.)
    // -----------------------------------------------------------------------

    var getComplexSurfaceFlags = function (element) {
      var flags = [];
      var current = element;
      var depth = 0;

      while (current && current !== document.documentElement && depth < 12) {
        var style = getComputedStyle(current);
        var bgRaw = toSrgb(style.backgroundColor);
        var bgColor = bgRaw && bgRaw.a > 0 ? bgRaw : null;
        var beforeStyle = getComputedStyle(current, '::before');
        var afterStyle = getComputedStyle(current, '::after');
        var isRoot = current === document.body || current === document.documentElement;
        var tag = current.tagName.toLowerCase();

        var hasOpaqueSolid =
          bgColor && bgColor.a >= 0.98 &&
          (!style.backgroundImage || style.backgroundImage === 'none') &&
          (!style.backdropFilter || style.backdropFilter === 'none') &&
          (!style.filter || style.filter === 'none');

        if (!isRoot && style.backgroundImage && style.backgroundImage !== 'none') {
          flags.push('background-image on ' + tag);
        }
        if (!isRoot && style.backdropFilter && style.backdropFilter !== 'none') {
          flags.push('backdrop-filter on ' + tag);
        }
        if (!isRoot && style.filter && style.filter !== 'none') {
          flags.push('filter on ' + tag);
        }
        if (!isRoot && style.mixBlendMode && style.mixBlendMode !== 'normal') {
          flags.push('mix-blend-mode on ' + tag);
        }
        if (!isRoot && bgColor && bgColor.a > 0 && bgColor.a < 1) {
          flags.push('transparent background on ' + tag);
        }
        if (!bgRaw) {
          flags.push('unparsed background color on ' + tag);
        }
        if (!isRoot && parseFloat(style.opacity || '1') < 1) {
          flags.push('opacity on ' + tag);
        }

        var pseudos = [['::before', beforeStyle], ['::after', afterStyle]];
        for (var p = 0; p < pseudos.length; p++) {
          var pseudoName = pseudos[p][0];
          var pseudoStyle = pseudos[p][1];
          var pseudoBg = parseColor(pseudoStyle.backgroundColor);

          if (!isRoot && pseudoStyle.backgroundImage && pseudoStyle.backgroundImage !== 'none') {
            flags.push(pseudoName + ' background-image on ' + tag);
          }
          if (!isRoot && pseudoBg && pseudoBg.a > 0) {
            flags.push(pseudoName + ' background on ' + tag);
          }
          if (!isRoot && pseudoStyle.filter && pseudoStyle.filter !== 'none') {
            flags.push(pseudoName + ' filter on ' + tag);
          }
        }

        if (hasOpaqueSolid) break;
        current = current.parentElement;
        depth++;
      }

      // An opaque surface hides what lies behind it, but opacity, filters, and
      // blend modes above it still change the rendered result.
      for (var outer = current && current.parentElement; outer && outer !== document.body && outer !== document.documentElement; outer = outer.parentElement) {
        var outerStyle = getComputedStyle(outer);
        var outerTag = outer.tagName.toLowerCase();
        if (outerStyle.filter && outerStyle.filter !== 'none') flags.push('filter on ' + outerTag);
        if (outerStyle.mixBlendMode && outerStyle.mixBlendMode !== 'normal') flags.push('mix-blend-mode on ' + outerTag);
        if (parseFloat(outerStyle.opacity || '1') < 1) flags.push('opacity on ' + outerTag);
      }

      // Deduplicate
      var seen = {};
      return flags.filter(function (f) {
        if (seen[f]) return false;
        seen[f] = true;
        return true;
      });
    };

    // Translucent solid colors are composited into the measurement, so only they
    // may still be measured; every other flag hides the real backdrop.
    var isCompositedFlag = function (flag) {
      return /^(transparent background|::before background|::after background) on /.test(flag);
    };

    // -----------------------------------------------------------------------
    // Override backgrounds (caller-provided selector hints)
    // -----------------------------------------------------------------------

    var getOverrideBackground = function (element) {
      var override = null;
      for (var i = 0; i < selectorBackgrounds.length; i++) {
        var entry = selectorBackgrounds[i];
        if (element.matches(entry.selector) || element.closest(entry.selector)) {
          override = entry;
          break;
        }
      }
      if (!override) return null;

      if (override.backgroundColor) {
        var parsed = parseColor(override.backgroundColor);
        if (parsed) {
          return { source: 'override-color', label: override.label, color: parsed };
        }
      }

      var bgEl = element.closest(override.backgroundSelector);
      if (!bgEl) return null;
      var st = getComputedStyle(bgEl);
      var parsed2 = parseColor(st.backgroundColor);
      if (!parsed2) return null;
      return { source: 'override-selector', label: override.label, color: parsed2 };
    };

    // -----------------------------------------------------------------------
    // WCAG threshold (large-text vs normal)
    // -----------------------------------------------------------------------

    var getThreshold = function (style) {
      var size = parseFloat(style.fontSize || '16');
      var weight = parseInt(style.fontWeight || '400', 10);
      var isLarge = size >= 24 || (size >= 18.66 && weight >= 700);
      return {
        size: size,
        weight: weight,
        largeText: isLarge,
        minimum: isLarge ? 3 : 4.5,
      };
    };

    // -----------------------------------------------------------------------
    // Selector hint
    // -----------------------------------------------------------------------

    var getSelectorHint = function (element) {
      if (element.id) return '#' + element.id;
      var classNames = Array.from(element.classList).slice(0, 3);
      if (classNames.length > 0) {
        return element.tagName.toLowerCase() + '.' + classNames.join('.');
      }
      return element.tagName.toLowerCase();
    };

    // -----------------------------------------------------------------------
    // Pseudo-element text detection
    // -----------------------------------------------------------------------

    var getPseudoText = function (style) {
      var raw = style.content;
      if (!raw || raw === 'none' || raw === 'normal') return null;
      var text = raw.replace(/^['"]|['"]$/g, '').replace(/\\"/g, '"').replace(/\\A/g, ' ').trim();
      return text || null;
    };

    // -----------------------------------------------------------------------
    // Canvas-based text width measurement
    // -----------------------------------------------------------------------

    var _measureCanvas = null;
    var measureTextWidth = function (text, style) {
      if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
      var ctx = _measureCanvas.getContext('2d');
      var fontStyle = style.fontStyle || 'normal';
      var fontVariant = style.fontVariant || 'normal';
      var fontWeight = style.fontWeight || '400';
      var fontSize = style.fontSize || '16px';
      var fontFamily = style.fontFamily || 'sans-serif';
      ctx.font = fontStyle + ' ' + fontVariant + ' ' + fontWeight + ' ' + fontSize + ' ' + fontFamily;
      return ctx.measureText(text).width;
    };

    // -----------------------------------------------------------------------
    // Content-box rect (excluding padding and border)
    // -----------------------------------------------------------------------

    var getContentBoxRect = function (element) {
      var rect = element.getBoundingClientRect();
      var style = getComputedStyle(element);
      var bL = parseFloat(style.borderLeftWidth || '0') || 0;
      var bR = parseFloat(style.borderRightWidth || '0') || 0;
      var bT = parseFloat(style.borderTopWidth || '0') || 0;
      var bB = parseFloat(style.borderBottomWidth || '0') || 0;
      var pL = parseFloat(style.paddingLeft || '0') || 0;
      var pR = parseFloat(style.paddingRight || '0') || 0;
      var pT = parseFloat(style.paddingTop || '0') || 0;
      var pB = parseFloat(style.paddingBottom || '0') || 0;

      return {
        left: rect.left + bL + pL,
        right: rect.right - bR - pR,
        top: rect.top + bT + pT,
        bottom: rect.bottom - bB - pB,
        width: Math.max(0, rect.width - bL - bR - pL - pR),
        height: Math.max(0, rect.height - bT - bB - pT - pB),
      };
    };

    // -----------------------------------------------------------------------
    // Pseudo-element rect estimation
    // -----------------------------------------------------------------------

    var getPseudoRect = function (element, pseudoName, pseudoStyle) {
      var contentRect = getContentBoxRect(element);
      var width = contentRect.width;
      var lineHeight = parseFloat(pseudoStyle.lineHeight || pseudoStyle.fontSize || '16') || 16;
      var fontSize = parseFloat(pseudoStyle.fontSize || '16') || 16;
      var text = getPseudoText(pseudoStyle);
      var measuredWidth = measureTextWidth(text, pseudoStyle);
      var lineCount = Math.max(1, width > 0 ? Math.ceil(measuredWidth / Math.max(width, 1)) : 1);
      var usedWidth = Math.min(width || measuredWidth, measuredWidth || width);
      var usedHeight = Math.max(lineHeight * lineCount, fontSize);
      var marginTop = parseFloat(pseudoStyle.marginTop || '0') || 0;
      var marginBottom = parseFloat(pseudoStyle.marginBottom || '0') || 0;

      var isAfter = pseudoName === '::after';
      var top = isAfter
        ? contentRect.bottom - usedHeight - marginBottom
        : contentRect.top + marginTop;

      return {
        left: contentRect.left,
        top: top,
        right: contentRect.left + usedWidth,
        bottom: top + usedHeight,
        width: usedWidth,
        height: usedHeight,
        lineCount: lineCount,
      };
    };

    // -----------------------------------------------------------------------
    // Line-level metrics via Range.getClientRects
    // -----------------------------------------------------------------------

    var collectLineRects = function (element) {
      var range = document.createRange();
      range.selectNodeContents(element);
      return Array.from(range.getClientRects())
        .map(function (r) {
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        })
        .filter(function (r) { return r.width >= 2 && r.height >= 4; });
    };

    var getUnionRect = function (rects, fallbackRect) {
      if (rects.length === 0) {
        return {
          left: fallbackRect.left, top: fallbackRect.top,
          right: fallbackRect.right, bottom: fallbackRect.bottom,
          width: fallbackRect.width, height: fallbackRect.height,
        };
      }
      var left = Math.min.apply(null, rects.map(function (r) { return r.left; }));
      var top = Math.min.apply(null, rects.map(function (r) { return r.top; }));
      var right = Math.max.apply(null, rects.map(function (r) { return r.right; }));
      var bottom = Math.max.apply(null, rects.map(function (r) { return r.bottom; }));
      return { left: left, top: top, right: right, bottom: bottom, width: right - left, height: bottom - top };
    };

    var getWords = function (text) { return text.split(/\s+/).filter(Boolean); };

    var getLineMetrics = function (element, rect, text, style) {
      var lineRects = collectLineRects(element);
      var bounds = getUnionRect(lineRects, rect);
      var words = getWords(text);
      var characters = text.replace(/\s+/g, '').length;
      var lineCount = lineRects.length || 1;
      var maxLineWidth = lineRects.length > 0
        ? Math.max.apply(null, lineRects.map(function (r) { return r.width; }))
        : rect.width;
      var minLineWidth = lineRects.length > 0
        ? Math.min.apply(null, lineRects.map(function (r) { return r.width; }))
        : rect.width;
      var averageLineWidth = lineRects.length > 0
        ? lineRects.reduce(function (s, r) { return s + r.width; }, 0) / lineRects.length
        : rect.width;
      var fontSize = parseFloat(style.fontSize || '16');

      return {
        lineRects: lineRects,
        bounds: bounds,
        lineCount: lineCount,
        words: words,
        wordCount: words.length,
        characters: characters,
        averageWordsPerLine: words.length / lineCount,
        averageCharsPerLine: characters / lineCount,
        maxLineWidth: maxLineWidth,
        minLineWidth: minLineWidth,
        averageLineWidth: averageLineWidth,
        widthPerCharacter: characters > 0 ? bounds.width / characters : bounds.width,
        maxEstimatedCharactersPerLine:
          fontSize > 0 ? bounds.width / Math.max(fontSize * 0.58, 1) : bounds.width / 9,
      };
    };

    // -----------------------------------------------------------------------
    // Framing surface detection
    // -----------------------------------------------------------------------

    var hasFramingSurface = function (style) {
      var bg = parseColor(style.backgroundColor);
      var visibleBorders = ['Top', 'Right', 'Bottom', 'Left'].filter(function (edge) {
        var bw = parseFloat(style['border' + edge + 'Width'] || '0');
        return bw > 0 && style['border' + edge + 'Style'] !== 'none';
      });
      var hasVisibleBorder = visibleBorders.length >= 2;
      var hasBackground = bg && bg.a > 0.08;
      var hasRadius = parseFloat(style.borderRadius || '0') > 0;
      return hasBackground || hasVisibleBorder || (hasRadius && visibleBorders.length >= 1);
    };

    // -----------------------------------------------------------------------
    // Expandable container detection
    // -----------------------------------------------------------------------

    var getExpandableContainer = function (element) {
      var elementRect = element.getBoundingClientRect();
      var current = element.parentElement;
      var depth = 0;

      while (current && current !== document.body && depth < settings.maxContainerDepth) {
        var style = getComputedStyle(current);
        var contentRect = getContentBoxRect(current);
        var widthGain = contentRect.width - elementRect.width;
        var widthRatio = contentRect.width / Math.max(elementRect.width, 1);
        var canExpand =
          contentRect.width > 0 &&
          widthGain >= settings.minExpandableWidthGain &&
          widthRatio >= settings.minExpandableWidthRatio &&
          style.display !== 'inline' && style.display !== 'contents';

        if (canExpand) {
          return {
            selector: getSelectorHint(current),
            contentRect: contentRect,
            widthGain: widthGain,
            widthRatio: widthRatio,
            freeLeft: Math.max(0, elementRect.left - contentRect.left),
            freeRight: Math.max(0, contentRect.right - elementRect.right),
          };
        }
        current = current.parentElement;
        depth++;
      }
      return null;
    };

    // -----------------------------------------------------------------------
    // Framing container (walks up for the nearest visual frame)
    // -----------------------------------------------------------------------

    var getFramingContainer = function (element) {
      var textRect = element.getBoundingClientRect();
      var elStyle = getComputedStyle(element);

      if (['fixed', 'absolute', 'sticky'].indexOf(elStyle.position) !== -1) return element;
      if (hasFramingSurface(elStyle)) return element;

      var current = element.parentElement;
      var depth = 0;

      while (current && current !== document.body && depth < settings.maxContainerDepth) {
        var style = getComputedStyle(current);
        var rect = current.getBoundingClientRect();
        var containsText =
          rect.width > textRect.width + 4 &&
          rect.height > textRect.height + 4 &&
          rect.left <= textRect.left &&
          rect.right >= textRect.right &&
          rect.top <= textRect.top &&
          rect.bottom >= textRect.bottom;

        if (containsText && hasFramingSurface(style)) return current;
        current = current.parentElement;
        depth++;
      }
      return null;
    };

    // -----------------------------------------------------------------------
    // Frame clearance (distance from text bounds to frame edges)
    // -----------------------------------------------------------------------

    var getFrameClearance = function (element, textBounds) {
      var frame = getFramingContainer(element);
      if (!frame) return null;

      var frameRect = frame.getBoundingClientRect();
      var fs = getComputedStyle(frame);
      var bL = parseFloat(fs.borderLeftWidth || '0') || 0;
      var bR = parseFloat(fs.borderRightWidth || '0') || 0;
      var bT = parseFloat(fs.borderTopWidth || '0') || 0;
      var bB = parseFloat(fs.borderBottomWidth || '0') || 0;

      var inner = {
        left: frameRect.left + bL,
        right: frameRect.right - bR,
        top: frameRect.top + bT,
        bottom: frameRect.bottom - bB,
      };

      return {
        selector: getSelectorHint(frame),
        left: Math.max(0, textBounds.left - inner.left),
        right: Math.max(0, inner.right - textBounds.right),
        top: Math.max(0, textBounds.top - inner.top),
        bottom: Math.max(0, inner.bottom - textBounds.bottom),
      };
    };

    // -----------------------------------------------------------------------
    // Layout issue detectors
    // -----------------------------------------------------------------------

    /** Detect collapsed-width issue (text wraps too aggressively). */
    var getMeasureIssue = function (lineMetrics, expandableContainer) {
      if (!expandableContainer) return null;
      if (lineMetrics.lineCount < settings.minCollapsedLineCount) return null;

      var avgChars = lineMetrics.averageCharsPerLine;
      var avgWords = lineMetrics.averageWordsPerLine;
      var availableChars = Math.min(
        settings.maxComfortableLineLength,
        lineMetrics.maxEstimatedCharactersPerLine * expandableContainer.widthRatio
      );
      var looksCollapsed =
        avgWords < settings.minAverageWordsPerLine &&
        avgChars < settings.minAverageCharsPerLine &&
        availableChars - avgChars >= 8;

      if (!looksCollapsed) return null;

      return {
        issueType: 'collapsed-width',
        severity:
          avgWords <= settings.minAverageWordsPerLine * 0.7 ||
          avgChars <= settings.minAverageCharsPerLine * 0.7
            ? 'high' : 'medium',
        details:
          'Text wraps too aggressively (' + toFixedNumber(avgWords, 1) +
          ' words/line, ' + toFixedNumber(avgChars, 1) +
          ' chars/line) while ' + Math.round(expandableContainer.widthGain) +
          'px of extra width is available in ' + expandableContainer.selector + '.',
        containerSelector: expandableContainer.selector,
        containerWidth: Math.round(expandableContainer.contentRect.width),
        widthGain: Math.round(expandableContainer.widthGain),
        widthRatio: toFixedNumber(expandableContainer.widthRatio),
        freeLeft: Math.round(expandableContainer.freeLeft),
        freeRight: Math.round(expandableContainer.freeRight),
        averageWordsPerLine: toFixedNumber(avgWords, 1),
        averageCharsPerLine: toFixedNumber(avgChars, 1),
        lineCount: lineMetrics.lineCount,
      };
    };

    /** Detect narrow heading that could use more width. */
    var getNarrowHeadingIssue = function (element, style, lineMetrics, expandableContainer) {
      if (!expandableContainer) return null;
      var tag = element.tagName.toUpperCase();
      var size = parseFloat(style.fontSize || '16');
      var isHeading = /^H[1-6]$/.test(tag) || size >= 22;
      if (!isHeading) return null;
      if (lineMetrics.lineCount < settings.minNarrowHeadingLineCount) return null;
      if (lineMetrics.averageCharsPerLine > settings.maxNarrowHeadingCharsPerLine) return null;
      if (expandableContainer.widthGain < settings.minNarrowHeadingWidthGain) return null;
      if (expandableContainer.widthRatio < settings.minNarrowHeadingWidthRatio) return null;

      return {
        issueType: 'narrow-heading-width',
        severity:
          lineMetrics.lineCount >= settings.minNarrowHeadingLineCount + 2 ||
          lineMetrics.averageCharsPerLine <= settings.maxNarrowHeadingCharsPerLine * 0.7
            ? 'high' : 'medium',
        details:
          'Heading wraps into ' + lineMetrics.lineCount +
          ' lines at only ' + toFixedNumber(lineMetrics.averageCharsPerLine, 1) +
          ' chars/line while ' + Math.round(expandableContainer.widthGain) +
          'px of extra width is available in ' + expandableContainer.selector + '.',
        containerSelector: expandableContainer.selector,
        containerWidth: Math.round(expandableContainer.contentRect.width),
        widthGain: Math.round(expandableContainer.widthGain),
        widthRatio: toFixedNumber(expandableContainer.widthRatio),
        lineCount: lineMetrics.lineCount,
        averageCharsPerLine: toFixedNumber(lineMetrics.averageCharsPerLine, 1),
      };
    };

    /** Detect tight frame spacing (text too close to container edge). */
    var getClearanceIssue = function (clearance, lineMetrics) {
      if (!clearance) return null;
      if (!lineMetrics || lineMetrics.lineCount < 2) return null;
      var minimum = Math.min(clearance.left, clearance.right, clearance.top, clearance.bottom);
      if (minimum >= settings.minFrameClearance) return null;

      var failingSides = ['left', 'right', 'top', 'bottom'].filter(function (side) {
        return clearance[side] < settings.minFrameClearance;
      });

      return {
        issueType: 'tight-frame-spacing',
        severity: minimum < settings.minFrameClearance * 0.5 ? 'high' : 'medium',
        details:
          'Text sits only ' + Math.round(minimum) + 'px from the ' +
          failingSides.join('/') + ' edge(s) of ' + clearance.selector + '.',
        containerSelector: clearance.selector,
        clearanceLeft: Math.round(clearance.left),
        clearanceRight: Math.round(clearance.right),
        clearanceTop: Math.round(clearance.top),
        clearanceBottom: Math.round(clearance.bottom),
        minClearance: Math.round(minimum),
        failingSides: failingSides,
      };
    };

    /** Detect tight label spacing for single-line label-like text. */
    var getSingleLineLabelClearanceIssue = function (clearance, lineMetrics, style) {
      if (!clearance) return null;
      if (!lineMetrics || lineMetrics.lineCount !== 1) return null;

      var isLabelLike =
        parseFloat(style.fontSize || '16') <= 14 &&
        (parseInt(style.fontWeight || '400', 10) >= 600 ||
          (style.textTransform && style.textTransform !== 'none'));
      if (!isLabelLike) return null;

      var minimum = Math.min(clearance.left, clearance.right, clearance.top, clearance.bottom);
      if (minimum >= settings.minSingleLineLabelClearance) return null;

      var failingSides = ['left', 'right', 'top', 'bottom'].filter(function (side) {
        return clearance[side] < settings.minSingleLineLabelClearance;
      });

      return {
        issueType: 'tight-label-spacing',
        severity: minimum < settings.minSingleLineLabelClearance * 0.5 ? 'high' : 'medium',
        details:
          'Label sits only ' + Math.round(minimum) + 'px from the ' +
          failingSides.join('/') + ' edge(s) of ' + clearance.selector + '.',
        containerSelector: clearance.selector,
        clearanceLeft: Math.round(clearance.left),
        clearanceRight: Math.round(clearance.right),
        clearanceTop: Math.round(clearance.top),
        clearanceBottom: Math.round(clearance.bottom),
        minClearance: Math.round(minimum),
        failingSides: failingSides,
      };
    };

    // -----------------------------------------------------------------------
    // Candidate collection
    // -----------------------------------------------------------------------

    var createElementCandidates = function () {
      return Array.from(
        document.querySelectorAll(
          'a, p, h1, h2, h3, h4, h5, h6, li, span, strong, em, b, i, small, mark, code, kbd, time, abbr, cite, q, blockquote, button, label, legend, summary, td, th, caption, figcaption, dt, dd, output, div'
        )
      ).filter(function (el) {
        return isVisibleLeafTextElement(el) && !matchesIgnoredSelector(el);
      }).map(function (el) {
        var style = getComputedStyle(el);
        var rect = el.getBoundingClientRect();
        var text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 180);
        return {
          kind: 'element',
          element: el,
          style: style,
          rect: rect,
          text: text,
          selector: getSelectorHint(el),
          tag: el.tagName,
          className: String(el.className || '').slice(0, 180),
        };
      });
    };

    var createPseudoCandidates = function () {
      var results = [];
      var allElements = Array.from(document.querySelectorAll('*')).filter(function (el) {
        return !matchesIgnoredSelector(el);
      });

      allElements.forEach(function (el) {
        ['::before', '::after'].forEach(function (pseudoName) {
          var style = getComputedStyle(el, pseudoName);
          var text = getPseudoText(style);
          if (!text || text.length < settings.minTextLength) return;
          if (style.display === 'none' || style.visibility === 'hidden') return;
          if (parseFloat(style.opacity || '1') === 0) return;

          var rect = getPseudoRect(el, pseudoName, style);
          if (rect.width < 4 || rect.height < 8) return;

          results.push({
            kind: 'pseudo',
            element: el,
            pseudoName: pseudoName,
            style: style,
            rect: rect,
            text: text.slice(0, 180),
            selector: getSelectorHint(el) + pseudoName,
            tag: el.tagName + pseudoName,
            className: String(el.className || '').slice(0, 180),
          });
        });
      });
      return results;
    };

    // -----------------------------------------------------------------------
    // Candidate line metrics
    // -----------------------------------------------------------------------

    var getCandidateLineMetrics = function (candidate) {
      if (candidate.kind === 'pseudo') {
        var words = getWords(candidate.text);
        var characters = candidate.text.replace(/\s+/g, '').length;
        var lineCount = candidate.rect.lineCount || 1;
        var fontSize = parseFloat(candidate.style.fontSize || '16') || 16;

        return {
          lineRects: [],
          bounds: candidate.rect,
          lineCount: lineCount,
          words: words,
          wordCount: words.length,
          characters: characters,
          averageWordsPerLine: words.length / Math.max(lineCount, 1),
          averageCharsPerLine: characters / Math.max(lineCount, 1),
          maxLineWidth: candidate.rect.width,
          minLineWidth: candidate.rect.width,
          averageLineWidth: candidate.rect.width,
          widthPerCharacter: characters > 0 ? candidate.rect.width / characters : candidate.rect.width,
          maxEstimatedCharactersPerLine:
            fontSize > 0 ? candidate.rect.width / Math.max(fontSize * 0.58, 1) : candidate.rect.width / 9,
        };
      }
      return getLineMetrics(candidate.element, candidate.rect, candidate.text, candidate.style);
    };

    // -----------------------------------------------------------------------
    // Row builder (JSON-safe -- no DOM refs)
    // -----------------------------------------------------------------------

    var buildRow = function (
      candidate, threshold, foreground, background, samplePoint,
      lineMetrics, clearance, complexSurfaceFlags, backgroundSource, backgroundLabel
    ) {
      return {
        text: candidate.text,
        tag: candidate.tag,
        selector: candidate.selector,
        className: candidate.className,
        color: toRgbString(foreground),
        colorHex: toHex(foreground),
        background: toRgbString(background),
        backgroundHex: toHex(background),
        backgroundSource: backgroundSource,
        backgroundLabel: backgroundLabel,
        contrast: Number(getContrastRatio(foreground, background).toFixed(2)),
        minimum: threshold.minimum,
        largeText: threshold.largeText,
        fontSize: candidate.style.fontSize,
        fontWeight: candidate.style.fontWeight,
        sampleX: Math.round(samplePoint.x),
        sampleY: Math.round(samplePoint.y),
        lineCount: lineMetrics.lineCount,
        averageWordsPerLine: toFixedNumber(lineMetrics.averageWordsPerLine, 1),
        averageCharsPerLine: toFixedNumber(lineMetrics.averageCharsPerLine, 1),
        maxLineWidth: Math.round(lineMetrics.maxLineWidth),
        minLineWidth: Math.round(lineMetrics.minLineWidth),
        minFrameClearance: clearance
          ? Math.round(Math.min(clearance.left, clearance.right, clearance.top, clearance.bottom))
          : null,
        collapsedWidthRisk: false,
        tightFrameSpacingRisk: false,
        complexSurface: complexSurfaceFlags.length > 0,
        complexSurfaceReasons: complexSurfaceFlags,
        needsManualReview: false,
        pseudoElement: candidate.pseudoName || null,
      };
    };

    // -----------------------------------------------------------------------
    // Navbar control geometry analysis (generic selectors)
    // -----------------------------------------------------------------------

    var collectNavbarControls = function () {
      return Array.from(
        document.querySelectorAll(settings.navbarControlSelector)
      ).filter(function (el) {
        if (!el || matchesIgnoredSelector(el)) return false;
        var style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        var rect = el.getBoundingClientRect();
        return rect.width >= 16 && rect.height >= 16;
      });
    };

    var createControlIssue = function (element, issueType, details, extra) {
      extra = extra || {};
      var base = {
        text: (element?.innerText || element?.value || element?.getAttribute?.('aria-label') || '').trim().slice(0, 180),
        tag: element?.tagName || 'CONTROL',
        selector: element ? getSelectorHint(element) : 'navbar',
        className: String(element?.className || '').slice(0, 180),
        color: null,
        colorHex: null,
        background: null,
        backgroundHex: null,
        backgroundSource: 'component',
        backgroundLabel: null,
        contrast: null,
        minimum: null,
        largeText: false,
        fontSize: element ? getComputedStyle(element).fontSize : null,
        fontWeight: element ? getComputedStyle(element).fontWeight : null,
        sampleX: null,
        sampleY: null,
        lineCount: null,
        averageWordsPerLine: null,
        averageCharsPerLine: null,
        maxLineWidth: null,
        minLineWidth: null,
        minFrameClearance: null,
        collapsedWidthRisk: false,
        tightFrameSpacingRisk: false,
        complexSurface: false,
        complexSurfaceReasons: [],
        needsManualReview: false,
        issueType: issueType,
        severity: 'medium',
        details: details,
      };
      Object.keys(extra).forEach(function (k) { base[k] = extra[k]; });
      return base;
    };

    var analyzeControlGeometry = function () {
      var controlIssues = [];
      var controls = collectNavbarControls();

      controls.forEach(function (control) {
        var rect = control.getBoundingClientRect();
        var style = getComputedStyle(control);
        var text = (control.innerText || control.value || control.getAttribute('aria-label') || '').trim();
        var borderRadius = parseFloat(style.borderRadius || '0') || 0;
        var isPillLike = borderRadius >= 20;
        var aspectRatio = rect.height > 0 ? rect.width / rect.height : Infinity;

        // Generic search detection (not Docusaurus-specific)
        var isSearch = control.matches(settings.searchInputSelector);

        if (rect.height < settings.minControlHeight) {
          controlIssues.push(createControlIssue(
            control,
            'control-height-too-small',
            'Control height is ' + Math.round(rect.height) +
              'px; expected at least ' + settings.minControlHeight + 'px for navbar controls.',
            { height: Math.round(rect.height), width: Math.round(rect.width) }
          ));
        }

        if (
          isPillLike && text &&
          text.length <= settings.maxShortControlChars &&
          rect.height >= settings.minControlHeight &&
          aspectRatio < settings.minPillAspectRatio
        ) {
          controlIssues.push(createControlIssue(
            control,
            'cramped-pill-aspect',
            'Pill control is too close to circular at ' + toFixedNumber(aspectRatio) + ':1 for label "' + text + '".',
            { width: Math.round(rect.width), height: Math.round(rect.height), aspectRatio: toFixedNumber(aspectRatio) }
          ));
        }

        if (isSearch && window.innerWidth >= 1000 && rect.width < settings.minDesktopSearchWidth) {
          controlIssues.push(createControlIssue(
            control,
            'cramped-search-width',
            'Search control is only ' + Math.round(rect.width) +
              'px wide on desktop; expected at least ' + settings.minDesktopSearchWidth + 'px.',
            { width: Math.round(rect.width), height: Math.round(rect.height) }
          ));
        }
      });

      // Check height consistency across navbar controls
      var heights = controls.map(function (c) {
        return {
          text: (c.innerText || c.value || c.getAttribute('aria-label') || c.tagName).trim(),
          height: Math.round(c.getBoundingClientRect().height),
        };
      });

      if (heights.length >= 2) {
        var minH = Math.min.apply(null, heights.map(function (h) { return h.height; }));
        var maxH = Math.max.apply(null, heights.map(function (h) { return h.height; }));
        if (maxH - minH > settings.maxNavbarControlHeightDelta) {
          controlIssues.push(createControlIssue(
            null,
            'inconsistent-control-heights',
            'Navbar controls vary from ' + minH + 'px to ' + maxH +
              'px tall, exceeding the ' + settings.maxNavbarControlHeightDelta + 'px tolerance.',
            {
              controls: heights.map(function (h) { return h.text + ':' + h.height; }).join(', '),
            }
          ));
        }
      }

      return controlIssues;
    };

    // -----------------------------------------------------------------------
    // Main analysis loop
    // -----------------------------------------------------------------------

    var results = [];
    var failures = [];
    var manualReviewItems = [];
    var allIssues = [];
    var allCandidates = createElementCandidates().concat(createPseudoCandidates());

    var analyzeCandidate = function (candidate) {
      // -webkit-text-fill-color paints the glyphs when set; it computes to the
      // color value otherwise.
      var fillValue = candidate.style.webkitTextFillColor || candidate.style.color;
      var foreground = toSrgb(fillValue);
      if (!foreground || foreground.a === 0) {
        var unmeasuredSelector = candidate.selector;
        var reason = foreground
          ? 'transparent text fill (gradient or image text): ' + fillValue
          : 'unparsed text color: ' + fillValue;
        manualReviewItems.push({
          selector: unmeasuredSelector,
          summary: 'Text color could not be measured -- contrast is unverified.',
          reason: reason,
          aiPrompt: 'Measure the contrast of the text at ' + unmeasuredSelector +
            ' manually at its worst-case point; ' + reason + '.',
          humanReview: {
            checklist: [
              'Does the text meet the WCAG contrast minimum against its rendered background?',
            ],
          },
          cropPath: '',
          estimatedContrast: null,
        });
        return;
      }
      // Translucent text blends with whatever is behind it, so measure the
      // composited color rather than the declared one.
      var visibleForeground = function (background) {
        return foreground.a < 1 ? composite(foreground, background) : foreground;
      };

      var samplePoint = getSamplePoint(candidate.rect);
      var backgroundOverride = getOverrideBackground(candidate.element);
      var sampledBackground = getEffectiveBackground(candidate.element, samplePoint);
      var complexSurfaceFlags = backgroundOverride ? [] : getComplexSurfaceFlags(candidate.element);
      var fallbackSurface = backgroundOverride ? null : getReliableSurfaceBackground(candidate.element);
      var threshold = getThreshold(candidate.style);
      var lineMetrics = getCandidateLineMetrics(candidate);
      var expandableContainer = getExpandableContainer(candidate.element);
      var clearance = getFrameClearance(candidate.element, lineMetrics.bounds);
      var isCodeText = candidate.element.tagName === 'CODE';

      var sampledRatio = getContrastRatio(visibleForeground(sampledBackground), sampledBackground);
      var fallbackRatio = fallbackSurface
        ? getContrastRatio(visibleForeground(fallbackSurface.color), fallbackSurface.color)
        : null;

      var hasUnmeasurableSurface = complexSurfaceFlags.some(function (flag) { return !isCompositedFlag(flag); });
      var useFallbackSurface =
        Boolean(fallbackSurface) &&
        !hasUnmeasurableSurface &&
        complexSurfaceFlags.length > 0 &&
        fallbackRatio !== null &&
        fallbackRatio >= threshold.minimum + settings.manualReviewContrastBuffer;

      var background = backgroundOverride?.color ??
        (useFallbackSurface ? fallbackSurface.color : sampledBackground);
      var ratio = getContrastRatio(visibleForeground(background), background);

      var measureIssue = isCodeText ? null : getMeasureIssue(lineMetrics, expandableContainer);
      var narrowHeadingIssue = isCodeText ? null : getNarrowHeadingIssue(candidate.element, candidate.style, lineMetrics, expandableContainer);
      var clearanceIssue = isCodeText ? null : getClearanceIssue(clearance, lineMetrics);
      var singleLineLabelIssue = isCodeText ? null : getSingleLineLabelClearanceIssue(clearance, lineMetrics, candidate.style);

      var row = buildRow(
        candidate, threshold, visibleForeground(background), background, samplePoint,
        lineMetrics, clearance, complexSurfaceFlags,
        backgroundOverride?.source ?? (useFallbackSurface ? fallbackSurface.source : 'sampled'),
        backgroundOverride?.label ?? fallbackSurface?.selector ?? null
      );

      row.needsManualReview =
        !backgroundOverride &&
        (hasUnmeasurableSurface ||
          (!useFallbackSurface &&
            complexSurfaceFlags.length > 0 &&
            sampledRatio < threshold.minimum + settings.manualReviewContrastBuffer));

      row.collapsedWidthRisk = Boolean(measureIssue || narrowHeadingIssue);
      row.tightFrameSpacingRisk = Boolean(clearanceIssue || singleLineLabelIssue);
      results.push(row);

      // Contrast failure issue
      var contrastIssue = !row.needsManualReview && ratio < threshold.minimum
        ? {
            issueType: 'contrast',
            severity: ratio < threshold.minimum * 0.75 ? 'high' : 'medium',
            details: 'Contrast ratio ' + toFixedNumber(ratio) +
              ' is below the required minimum of ' + threshold.minimum + '.',
            contrast: toFixedNumber(ratio),
            minimum: threshold.minimum,
          }
        : null;

      // Collect all sub-issues into allIssues
      [contrastIssue, measureIssue, narrowHeadingIssue, clearanceIssue, singleLineLabelIssue].forEach(function (issue) {
        if (!issue) return;
        var merged = {};
        Object.keys(row).forEach(function (k) { merged[k] = row[k]; });
        Object.keys(issue).forEach(function (k) { merged[k] = issue[k]; });
        allIssues.push(merged);
      });

      if (row.needsManualReview) {
        manualReviewItems.push({
          selector: row.selector,
          summary: 'Complex surface behind text -- contrast may be unreliable.',
          reason: row.complexSurfaceReasons.join('; '),
          aiPrompt: 'Verify contrast ratio for text at ' + row.selector +
            '. Estimated contrast: ' + row.contrast + '.',
          humanReview: {
            checklist: [
              'Is the text readable against its background?',
              'Does the surface behind the text use gradients, images, or blend modes?',
            ],
          },
          cropPath: '',
          estimatedContrast: row.contrast,
        });
        return;
      }

      if (ratio < threshold.minimum) {
        failures.push(row);
      }
    };

    allCandidates.forEach(analyzeCandidate);

    // Add control geometry issues
    var controlIssues = analyzeControlGeometry();
    controlIssues.forEach(function (ci) { allIssues.push(ci); });

    // -----------------------------------------------------------------------
    // Reshape issues to match the standard report schema with desRuleId
    // -----------------------------------------------------------------------
    var standardIssues = allIssues.slice(0, settings.maxIssues).map(function (raw) {
      return {
        category: 'wcag-text',
        ruleId: raw.issueType || raw.ruleId || 'contrast',
        desRuleId: DES_RULE_MAP[raw.issueType] || DES_RULE_MAP[raw.ruleId] || 'DES-COLR-02',
        severity: raw.severity || 'medium',
        title: raw.title || issueTitleFor(raw.issueType),
        summary: raw.details || '',
        details: raw.details || '',
        selector: raw.selector || null,
        tags: raw.tags || ['wcag', 'text'],
        wcagCriteria: raw.wcagCriteria || [],
        evidence: extractEvidence(raw),
      };
    });

    // -----------------------------------------------------------------------
    // Build report
    // -----------------------------------------------------------------------
    var issueCounts = {};
    allIssues.forEach(function (issue) {
      var key = issue.issueType || 'unknown';
      issueCounts[key] = (issueCounts[key] || 0) + 1;
    });

    var report = {
      auditId: 'wcag-text-audit',
      label: 'WCAG Text Contrast & Readability',
      issueCount: standardIssues.length,
      issues: standardIssues,
      manualReview: manualReviewItems.slice(0, settings.maxManualReview),
      stats: {
        url: window.location.href,
        title: document.title,
        totalTextElements: results.length,
        failingTextElements: failures.length,
        manualReviewTextElements: manualReviewItems.length,
        issueCounts: issueCounts,
      },
    };

    return report;
  };

  // -----------------------------------------------------------------------
  // Issue title helper
  // -----------------------------------------------------------------------
  function issueTitleFor(issueType) {
    var titles = {
      'contrast': 'Insufficient text contrast',
      'collapsed-width': 'Text wraps too aggressively',
      'narrow-heading-width': 'Heading is unnecessarily narrow',
      'tight-frame-spacing': 'Text too close to frame edge',
      'tight-label-spacing': 'Label too close to frame edge',
      'control-height-too-small': 'Navbar control is too short',
      'cramped-pill-aspect': 'Pill control aspect ratio too circular',
      'cramped-search-width': 'Search input too narrow on desktop',
      'inconsistent-control-heights': 'Navbar controls have inconsistent heights',
    };
    return titles[issueType] || 'Text readability issue';
  }

  // -----------------------------------------------------------------------
  // Evidence extractor (strips non-serializable fields)
  // -----------------------------------------------------------------------
  function extractEvidence(raw) {
    var evidence = {};
    var keys = [
      'contrast', 'minimum', 'color', 'colorHex', 'background', 'backgroundHex',
      'backgroundSource', 'backgroundLabel', 'largeText', 'fontSize', 'fontWeight',
      'lineCount', 'averageWordsPerLine', 'averageCharsPerLine',
      'maxLineWidth', 'minLineWidth', 'minFrameClearance',
      'containerSelector', 'containerWidth', 'widthGain', 'widthRatio',
      'freeLeft', 'freeRight', 'clearanceLeft', 'clearanceRight',
      'clearanceTop', 'clearanceBottom', 'minClearance', 'failingSides',
      'height', 'width', 'aspectRatio', 'controls',
      'complexSurface', 'complexSurfaceReasons',
      'collapsedWidthRisk', 'tightFrameSpacingRisk',
      'sampleX', 'sampleY', 'text',
    ];
    keys.forEach(function (k) {
      if (raw[k] !== undefined && raw[k] !== null) {
        evidence[k] = raw[k];
      }
    });
    return evidence;
  }
})();
