(function() {
  'use strict';

  /**
   * Typography & Type Scale Audit
   *
   * Checks typeface count, type scale ratio consistency, font weight distribution,
   * line height readability, line length / measure, and heading size progression.
   *
   * DES Rules: DES-TYPO-01 (type scale), DES-TYPO-02 (readability), DES-HIER-01 (hierarchy)
   *
   * @param {Object} options
   * @param {boolean} options.quiet - Suppress console output (always true when injected)
   * @param {Object} options.selectors - CSS selector overrides for landmark regions
   * @param {string[]} options.exclude - CSS selectors to exclude from analysis
   * @param {string} options.viewport - 'desktop' | 'tablet' | 'mobile'
   * @returns {Object} Audit result conforming to the standard audit interface
   */
  window.runTypographyAudit = function(options) {
    options = options || {};
    var excludeSelectors = options.exclude || [];

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /** Maximum elements to scan per query to avoid page freeze on large DOMs. */
    var SCAN_LIMIT = 500;

    /**
     * Check whether an element is visible in the viewport.
     * Skips display:none, visibility:hidden, opacity:0, and zero-dimension elements.
     */
    function isVisible(el) {
      if (!el || !el.offsetParent && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
        var style = window.getComputedStyle(el);
        if (style.display === 'none' || style.position === 'fixed' || style.position === 'sticky') {
          if (style.display === 'none') return false;
        } else {
          return false;
        }
      }
      var style = window.getComputedStyle(el);
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden') return false;
      if (parseFloat(style.opacity) === 0) return false;
      if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
      return true;
    }

    /**
     * Returns true if the element matches any of the exclude selectors.
     */
    function isExcluded(el, selectors) {
      if (!selectors || selectors.length === 0) return false;
      for (var i = 0; i < selectors.length; i++) {
        try {
          if (el.matches(selectors[i])) return true;
          if (el.closest(selectors[i])) return true;
        } catch (e) {
          // Invalid selector, skip
        }
      }
      return false;
    }

    /**
     * Query visible elements matching a CSS selector, capped at SCAN_LIMIT.
     */
    function getVisibleElements(selector) {
      var all = document.querySelectorAll(selector);
      var results = [];
      for (var i = 0; i < all.length && results.length < SCAN_LIMIT; i++) {
        if (isVisible(all[i]) && !isExcluded(all[i], excludeSelectors)) {
          results.push(all[i]);
        }
      }
      return results;
    }

    /**
     * Generate a readable, unique CSS selector for an element.
     */
    function getCSSSelector(el) {
      if (!el || el === document.body) return 'body';
      if (el.id) return '#' + el.id;

      var tag = el.tagName.toLowerCase();
      var classes = el.className && typeof el.className === 'string'
        ? el.className.trim().split(/\s+/).filter(function(c) { return c.length > 0; })
        : [];
      var classStr = classes.length > 0
        ? '.' + classes.slice(0, 2).join('.')
        : '';
      var selector = tag + classStr;

      if (el.parentElement) {
        var siblings = el.parentElement.querySelectorAll(':scope > ' + selector);
        if (siblings.length > 1) {
          var index = Array.prototype.indexOf.call(el.parentElement.children, el) + 1;
          selector = tag + ':nth-child(' + index + ')' + classStr;
        }
      }

      var parent = el.parentElement;
      if (parent && parent !== document.body && parent !== document.documentElement) {
        var parentTag = parent.tagName.toLowerCase();
        var parentId = parent.id ? '#' + parent.id : '';
        var parentCls = parent.className && typeof parent.className === 'string'
          ? parent.className.trim().split(/\s+/).filter(function(c) { return c.length > 0; })
          : [];
        var parentSelector = parentId
          ? parentTag + parentId
          : parentTag + (parentCls.length > 0 ? '.' + parentCls[0] : '');
        selector = parentSelector + ' > ' + selector;
      }

      return selector;
    }

    /**
     * Normalize a font-family string: strip quotes, take first family from the stack.
     * Filters out generic families and icon/symbol fonts.
     */
    function normalizeFontFamily(fontFamily) {
      if (!fontFamily) return '';
      // Split on comma, take the first non-generic family
      var families = fontFamily.split(',').map(function(f) {
        return f.trim().replace(/^["']|["']$/g, '').trim();
      });
      var genericFamilies = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
        'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
        'emoji', 'math', 'fangsong'];
      // Return the first non-generic family
      for (var i = 0; i < families.length; i++) {
        if (genericFamilies.indexOf(families[i].toLowerCase()) === -1 && families[i].length > 0) {
          return families[i];
        }
      }
      // If all generic, return the first one
      return families[0] || '';
    }

    /**
     * Check if an element contains meaningful text content (not just whitespace).
     */
    function hasTextContent(el) {
      // Check direct text nodes
      for (var i = 0; i < el.childNodes.length; i++) {
        if (el.childNodes[i].nodeType === Node.TEXT_NODE && el.childNodes[i].textContent.trim().length > 0) {
          return true;
        }
      }
      return false;
    }

    // -----------------------------------------------------------------------
    // Audit logic
    // -----------------------------------------------------------------------

    var issues = [];
    var manualReview = [];

    // Selector for text-bearing elements
    var textSelector = 'p, span, a, li, td, th, dd, dt, label, blockquote, figcaption, caption, ' +
      'h1, h2, h3, h4, h5, h6, button, input, select, textarea, pre, code, ' +
      'strong, em, b, i, small, sub, sup, mark, del, ins, cite, q, abbr, address, time';
    var textElements = getVisibleElements(textSelector);
    var totalTextElements = textElements.length;

    // ---- 1. Typeface Count (DES-TYPO-01) ----
    // Collect unique font-family computed values. Threshold: >3 unique typefaces.

    var typefaceMap = {};  // normalized family -> count
    textElements.forEach(function(el) {
      var computed = window.getComputedStyle(el);
      var family = normalizeFontFamily(computed.fontFamily);
      if (family) {
        typefaceMap[family] = (typefaceMap[family] || 0) + 1;
      }
    });

    var uniqueTypefaces = Object.keys(typefaceMap);
    var uniqueTypefaceCount = uniqueTypefaces.length;

    if (uniqueTypefaceCount > 3) {
      var typefaceList = uniqueTypefaces.map(function(f) {
        return { family: f, count: typefaceMap[f] };
      }).sort(function(a, b) { return b.count - a.count; });

      issues.push({
        category: 'Typography',
        ruleId: 'typeface-count',
        desRuleId: 'DES-TYPO-01',
        severity: 'medium',
        title: 'Too many typefaces (' + uniqueTypefaceCount + ')',
        summary: uniqueTypefaceCount + ' unique typeface families detected. The design standard recommends a maximum of 2-3 typefaces for a systematic type scale.',
        details: 'Choose 1-2 typeface families (one for headings, one for body, or a single versatile family). Monospace for code blocks is an acceptable third typeface.',
        selector: 'body',
        tags: ['typography', 'type-scale', 'font-family'],
        wcagCriteria: [],
        evidence: {
          uniqueCount: uniqueTypefaceCount,
          typefaces: typefaceList,
          threshold: 3
        }
      });
    }

    // ---- 2. Type Scale Ratio (DES-TYPO-01) ----
    // Collect unique font sizes, sort, compute consecutive ratios.
    // A consistent scale has ratios within 20% of each other.

    var fontSizeMap = {};  // px value -> count
    textElements.forEach(function(el) {
      var computed = window.getComputedStyle(el);
      var size = parseFloat(computed.fontSize);
      if (!isNaN(size) && size > 0) {
        // Round to 1 decimal to avoid floating point noise
        var rounded = Math.round(size * 10) / 10;
        fontSizeMap[rounded] = (fontSizeMap[rounded] || 0) + 1;
      }
    });

    var uniqueFontSizes = Object.keys(fontSizeMap).map(Number).sort(function(a, b) { return a - b; });
    var uniqueFontSizeCount = uniqueFontSizes.length;

    // Compute ratios between consecutive sizes
    var typeScaleRatios = [];
    for (var i = 1; i < uniqueFontSizes.length; i++) {
      var ratio = uniqueFontSizes[i] / uniqueFontSizes[i - 1];
      // Only consider meaningful steps (ratio > 1.05) to filter out sub-pixel differences
      if (ratio > 1.05) {
        typeScaleRatios.push(Math.round(ratio * 1000) / 1000);
      }
    }

    if (typeScaleRatios.length >= 3) {
      // Compute median ratio as the "expected" ratio
      var sortedRatios = typeScaleRatios.slice().sort(function(a, b) { return a - b; });
      var medianRatio = sortedRatios[Math.floor(sortedRatios.length / 2)];

      // Check if ratios vary by more than 20% from the median
      var inconsistentRatios = typeScaleRatios.filter(function(r) {
        return Math.abs(r - medianRatio) / medianRatio > 0.2;
      });

      if (inconsistentRatios.length > 0) {
        issues.push({
          category: 'Typography',
          ruleId: 'type-scale-ratio',
          desRuleId: 'DES-TYPO-01',
          severity: 'medium',
          title: 'Inconsistent type scale ratios',
          summary: 'Font size ratios between consecutive steps vary by more than 20%. A well-designed type scale uses a consistent ratio (e.g., 1.25 Major Third).',
          details: 'Found ' + typeScaleRatios.length + ' size steps with ratios: ' + typeScaleRatios.join(', ') + '. Median ratio: ' + medianRatio + '. ' + inconsistentRatios.length + ' ratios deviate >20% from median. Recommended ratios: 1.125 (Major Second), 1.25 (Major Third), 1.333 (Perfect Fourth).',
          selector: 'body',
          tags: ['typography', 'type-scale', 'font-size'],
          wcagCriteria: [],
          evidence: {
            fontSizes: uniqueFontSizes,
            ratios: typeScaleRatios,
            medianRatio: medianRatio,
            inconsistentRatios: inconsistentRatios,
            recommendedRatios: [1.125, 1.25, 1.333, 1.5],
            varianceThreshold: '20%'
          }
        });
      }
    }

    // ---- 3. Font Weight Distribution (DES-HIER-01) ----
    // Collect font-weight values and frequency. Flag >5 unique or only 1 weight.

    var fontWeightMap = {};  // weight -> count
    textElements.forEach(function(el) {
      var computed = window.getComputedStyle(el);
      var weight = parseInt(computed.fontWeight, 10) || 400;
      fontWeightMap[weight] = (fontWeightMap[weight] || 0) + 1;
    });

    var uniqueWeights = Object.keys(fontWeightMap).map(Number).sort(function(a, b) { return a - b; });
    var uniqueWeightCount = uniqueWeights.length;

    if (uniqueWeightCount > 5) {
      var weightList = uniqueWeights.map(function(w) {
        return { weight: w, count: fontWeightMap[w] };
      });

      issues.push({
        category: 'Visual Hierarchy',
        ruleId: 'font-weight-overuse',
        desRuleId: 'DES-HIER-01',
        severity: 'low',
        title: 'Too many font weight variations (' + uniqueWeightCount + ')',
        summary: uniqueWeightCount + ' unique font-weight values found. Excessive weight variation weakens visual hierarchy. Use weights purposefully: 700 for headings, 600 for subheadings, 400 for body.',
        details: 'Consolidate to 2-3 deliberate weights that reinforce the content hierarchy.',
        selector: 'body',
        tags: ['typography', 'font-weight', 'hierarchy'],
        wcagCriteria: [],
        evidence: {
          uniqueCount: uniqueWeightCount,
          weights: weightList,
          threshold: 5
        }
      });
    }

    if (uniqueWeightCount === 1) {
      issues.push({
        category: 'Visual Hierarchy',
        ruleId: 'font-weight-monotone',
        desRuleId: 'DES-HIER-01',
        severity: 'medium',
        title: 'Single font weight across entire page',
        summary: 'Only font-weight ' + uniqueWeights[0] + ' is used across all ' + totalTextElements + ' text elements. This creates a flat visual hierarchy with no weight differentiation.',
        details: 'Use at least 2-3 font weights to establish hierarchy: 700 for headings, 400 for body text, optionally 600 for subheadings.',
        selector: 'body',
        tags: ['typography', 'font-weight', 'hierarchy'],
        wcagCriteria: [],
        evidence: {
          singleWeight: uniqueWeights[0],
          totalTextElements: totalTextElements
        }
      });
    }

    // ---- 4. Line Height Check (DES-TYPO-02) ----
    // For body text elements, check line-height ratio. Acceptable: 1.3 to 1.8.

    var bodyTextSelector = 'p, li, dd, td, blockquote';
    var bodyTextElements = getVisibleElements(bodyTextSelector);
    var lineHeightIssues = [];
    var lineHeightRatios = [];

    bodyTextElements.forEach(function(el) {
      if (!hasTextContent(el)) return;

      var computed = window.getComputedStyle(el);
      var fontSize = parseFloat(computed.fontSize);
      var lineHeight = parseFloat(computed.lineHeight);

      if (isNaN(fontSize) || isNaN(lineHeight) || fontSize === 0) return;

      var ratio = Math.round((lineHeight / fontSize) * 100) / 100;
      lineHeightRatios.push(ratio);

      // Body text acceptable range: 1.3 to 1.8
      if (ratio < 1.3 || ratio > 1.8) {
        if (lineHeightIssues.length < 10) {
          lineHeightIssues.push({
            selector: getCSSSelector(el),
            fontSize: fontSize,
            lineHeight: lineHeight,
            ratio: ratio,
            tooTight: ratio < 1.3,
            tooLoose: ratio > 1.8
          });
        }
      }
    });

    if (lineHeightIssues.length > 0) {
      issues.push({
        category: 'Typography',
        ruleId: 'line-height-body',
        desRuleId: 'DES-TYPO-02',
        severity: 'medium',
        title: 'Body text line-height outside readable range (' + lineHeightIssues.length + ' elements)',
        summary: lineHeightIssues.length + ' body text elements have line-height ratios outside the 1.3-1.8 range. This affects readability.',
        details: 'Set body text line-height to 1.5 (acceptable range: 1.4-1.6). Heading line-height can be tighter (1.1-1.3).',
        selector: lineHeightIssues[0].selector,
        tags: ['typography', 'line-height', 'readability'],
        wcagCriteria: ['1.4.12'],
        evidence: {
          issueCount: lineHeightIssues.length,
          examples: lineHeightIssues,
          acceptableRange: { min: 1.3, max: 1.8 },
          recommendedBody: 1.5
        }
      });
    }

    // Also check headings for extremely tight line-height (< 1.0)
    var headingSelector = 'h1, h2, h3, h4, h5, h6';
    var headingElements = getVisibleElements(headingSelector);
    var headingLineHeightIssues = [];

    headingElements.forEach(function(el) {
      var computed = window.getComputedStyle(el);
      var fontSize = parseFloat(computed.fontSize);
      var lineHeight = parseFloat(computed.lineHeight);
      if (isNaN(fontSize) || isNaN(lineHeight) || fontSize === 0) return;

      var ratio = Math.round((lineHeight / fontSize) * 100) / 100;
      // Heading acceptable: 1.1-1.3, but flag if extremely tight (< 1.0) or very loose (> 1.6)
      if (ratio < 1.0 || ratio > 1.6) {
        if (headingLineHeightIssues.length < 5) {
          headingLineHeightIssues.push({
            selector: getCSSSelector(el),
            heading: el.tagName.toLowerCase(),
            fontSize: fontSize,
            lineHeight: lineHeight,
            ratio: ratio
          });
        }
      }
    });

    if (headingLineHeightIssues.length > 0) {
      issues.push({
        category: 'Typography',
        ruleId: 'line-height-heading',
        desRuleId: 'DES-TYPO-02',
        severity: 'low',
        title: 'Heading line-height outside recommended range',
        summary: headingLineHeightIssues.length + ' heading elements have line-height outside the 1.0-1.6 range.',
        details: 'Set heading line-height to 1.2 (acceptable range: 1.1-1.3). Avoid extremely tight line-height that causes text overlap on multi-line headings.',
        selector: headingLineHeightIssues[0].selector,
        tags: ['typography', 'line-height', 'headings'],
        wcagCriteria: [],
        evidence: {
          examples: headingLineHeightIssues,
          recommendedHeading: 1.2
        }
      });
    }

    // ---- 5. Line Length / Measure (DES-TYPO-02) ----
    // For paragraph elements, estimate characters per line.
    // Method: element.offsetWidth / (fontSize * 0.5) as rough ch estimate.
    // Threshold: >75 chars = medium, <30 chars = low.

    var paragraphElements = getVisibleElements('p');
    var lineLengthIssues = [];
    var lineLengths = [];

    paragraphElements.forEach(function(el) {
      if (!hasTextContent(el)) return;

      var computed = window.getComputedStyle(el);
      var fontSize = parseFloat(computed.fontSize);
      if (isNaN(fontSize) || fontSize === 0) return;

      var width = el.offsetWidth;
      // Rough character estimate: average character width ~ 0.5em
      var estimatedChars = Math.round(width / (fontSize * 0.5));
      lineLengths.push(estimatedChars);

      if (estimatedChars > 75) {
        if (lineLengthIssues.length < 10) {
          lineLengthIssues.push({
            selector: getCSSSelector(el),
            width: width,
            fontSize: fontSize,
            estimatedChars: estimatedChars,
            issue: 'too-wide'
          });
        }
      } else if (estimatedChars < 30 && width > 100) {
        // Only flag narrow lines if the element has meaningful width (>100px)
        // to avoid flagging short one-line labels
        if (lineLengthIssues.length < 10) {
          lineLengthIssues.push({
            selector: getCSSSelector(el),
            width: width,
            fontSize: fontSize,
            estimatedChars: estimatedChars,
            issue: 'too-narrow'
          });
        }
      }
    });

    var tooWide = lineLengthIssues.filter(function(i) { return i.issue === 'too-wide'; });
    var tooNarrow = lineLengthIssues.filter(function(i) { return i.issue === 'too-narrow'; });

    if (tooWide.length > 0) {
      issues.push({
        category: 'Typography',
        ruleId: 'line-length-wide',
        desRuleId: 'DES-TYPO-02',
        severity: 'medium',
        title: 'Line length exceeds 75 characters (' + tooWide.length + ' paragraphs)',
        summary: tooWide.length + ' paragraph elements have an estimated line length exceeding 75 characters. Long lines are difficult to scan back to the next line start.',
        details: 'Constrain content containers to max-width: 65ch for optimal readability (50-75 character range). Use CSS max-width on text containers.',
        selector: tooWide[0].selector,
        tags: ['typography', 'line-length', 'readability', 'measure'],
        wcagCriteria: ['1.4.8'],
        evidence: {
          issueCount: tooWide.length,
          examples: tooWide,
          threshold: 75,
          recommendation: '50-75 characters per line'
        }
      });
    }

    if (tooNarrow.length > 0) {
      issues.push({
        category: 'Typography',
        ruleId: 'line-length-narrow',
        desRuleId: 'DES-TYPO-02',
        severity: 'low',
        title: 'Line length below 30 characters (' + tooNarrow.length + ' paragraphs)',
        summary: tooNarrow.length + ' paragraph elements have an estimated line length below 30 characters. Very narrow text columns are uncomfortable to read.',
        details: 'Ensure text containers are at least 30ch wide for comfortable reading.',
        selector: tooNarrow[0].selector,
        tags: ['typography', 'line-length', 'readability', 'measure'],
        wcagCriteria: [],
        evidence: {
          issueCount: tooNarrow.length,
          examples: tooNarrow,
          threshold: 30
        }
      });
    }

    // ---- 6. Heading Size Progression (DES-HIER-01) ----
    // Collect h1-h6 computed font sizes, verify each level is smaller than previous.
    // Flag inversions (high severity) and insufficient difference <2px (medium severity).

    var headingSizes = { h1: null, h2: null, h3: null, h4: null, h5: null, h6: null };
    var headingLevels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

    headingLevels.forEach(function(tag) {
      var els = getVisibleElements(tag);
      if (els.length > 0) {
        // Use the first visible instance as the representative size
        var computed = window.getComputedStyle(els[0]);
        var size = parseFloat(computed.fontSize);
        if (!isNaN(size) && size > 0) {
          headingSizes[tag] = Math.round(size * 10) / 10;
        }
      }
    });

    // Check heading progression: each level should be smaller than the previous
    var headingInversions = [];
    var headingInsufficientDiff = [];
    var presentHeadings = headingLevels.filter(function(h) { return headingSizes[h] !== null; });

    for (var h = 1; h < presentHeadings.length; h++) {
      var prevLevel = presentHeadings[h - 1];
      var currLevel = presentHeadings[h];
      var prevSize = headingSizes[prevLevel];
      var currSize = headingSizes[currLevel];

      if (currSize > prevSize) {
        // Inversion: lower heading level is bigger than higher level
        headingInversions.push({
          higherLevel: prevLevel,
          higherSize: prevSize,
          lowerLevel: currLevel,
          lowerSize: currSize
        });
      } else if (prevSize - currSize < 2 && prevSize !== currSize) {
        // Insufficient differentiation: <2px difference
        headingInsufficientDiff.push({
          higherLevel: prevLevel,
          higherSize: prevSize,
          lowerLevel: currLevel,
          lowerSize: currSize,
          difference: Math.round((prevSize - currSize) * 10) / 10
        });
      }
    }

    if (headingInversions.length > 0) {
      issues.push({
        category: 'Visual Hierarchy',
        ruleId: 'heading-size-inversion',
        desRuleId: 'DES-HIER-01',
        severity: 'high',
        title: 'Heading size hierarchy inversion',
        summary: headingInversions.length + ' heading level inversion(s) detected where a lower-level heading is larger than a higher-level heading. This breaks visual hierarchy.',
        details: 'Heading sizes must decrease monotonically: h1 > h2 > h3 > h4 > h5 > h6. Each level should be visually distinct.',
        selector: headingInversions[0].lowerLevel,
        tags: ['typography', 'headings', 'hierarchy', 'visual-hierarchy'],
        wcagCriteria: [],
        evidence: {
          inversions: headingInversions,
          headingSizes: headingSizes
        }
      });
    }

    if (headingInsufficientDiff.length > 0) {
      issues.push({
        category: 'Visual Hierarchy',
        ruleId: 'heading-size-insufficient-diff',
        desRuleId: 'DES-HIER-01',
        severity: 'medium',
        title: 'Insufficient heading size differentiation',
        summary: headingInsufficientDiff.length + ' consecutive heading level pair(s) have less than 2px size difference. Headings are too similar to establish clear hierarchy.',
        details: 'Ensure at least 4px (or one type-scale step) difference between consecutive heading levels for clear visual scanning.',
        selector: headingInsufficientDiff[0].lowerLevel,
        tags: ['typography', 'headings', 'hierarchy', 'visual-hierarchy'],
        wcagCriteria: [],
        evidence: {
          pairs: headingInsufficientDiff,
          headingSizes: headingSizes,
          minimumDifference: '2px'
        }
      });
    }

    // -----------------------------------------------------------------------
    // Stats
    // -----------------------------------------------------------------------

    var avgLineHeightRatio = lineHeightRatios.length > 0
      ? Math.round((lineHeightRatios.reduce(function(a, b) { return a + b; }, 0) / lineHeightRatios.length) * 100) / 100
      : 0;

    var avgLineLength = lineLengths.length > 0
      ? Math.round(lineLengths.reduce(function(a, b) { return a + b; }, 0) / lineLengths.length)
      : 0;

    var stats = {
      totalTextElements: totalTextElements,
      uniqueTypefaces: uniqueTypefaceCount,
      uniqueFontSizes: uniqueFontSizeCount,
      uniqueFontWeights: uniqueWeightCount,
      typeScaleRatios: typeScaleRatios,
      avgLineHeightRatio: avgLineHeightRatio,
      avgLineLength: avgLineLength,
      headingSizes: headingSizes
    };

    return {
      auditId: 'typography-audit',
      label: 'Typography & Type Scale',
      issueCount: issues.length,
      issues: issues,
      manualReview: manualReview,
      stats: stats
    };
  };
})();
