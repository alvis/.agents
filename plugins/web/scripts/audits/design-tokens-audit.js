(function() {
  'use strict';

  /**
   * Design Tokens & Consistency Audit
   *
   * Checks CSS custom property (design token) adoption, border-radius consistency,
   * spacing grid alignment, box-shadow consistency, and hardcoded color detection.
   *
   * DES Rules: DES-CONS-01 (consistency), DES-SPAC-01 (spacing)
   *
   * @param {Object} options
   * @param {boolean} options.quiet - Suppress console output (always true when injected)
   * @param {Object} options.selectors - CSS selector overrides for landmark regions
   * @param {string[]} options.exclude - CSS selectors to exclude from analysis
   * @param {string} options.viewport - 'desktop' | 'tablet' | 'mobile'
   * @returns {Object} Audit result conforming to the standard audit interface
   */
  window.runDesignTokensAudit = function(options) {
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
        // offsetParent is null for hidden elements (except body/html)
        var style = window.getComputedStyle(el);
        if (style.display === 'none' || style.position === 'fixed' || style.position === 'sticky') {
          // fixed/sticky elements have null offsetParent but may be visible
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
     * Prefers id, then tag + classes, then positional nth-child.
     */
    function getCSSSelector(el) {
      if (!el || el === document.body) return 'body';
      if (el.id) return '#' + el.id;

      var tag = el.tagName.toLowerCase();
      var classes = el.className && typeof el.className === 'string'
        ? el.className.trim().split(/\s+/).filter(function(c) { return c.length > 0; })
        : [];
      // Use up to 2 classes for readability
      var classStr = classes.length > 0
        ? '.' + classes.slice(0, 2).join('.')
        : '';
      var selector = tag + classStr;

      // Check uniqueness within parent
      if (el.parentElement) {
        var siblings = el.parentElement.querySelectorAll(':scope > ' + selector);
        if (siblings.length > 1) {
          var index = Array.prototype.indexOf.call(el.parentElement.children, el) + 1;
          selector = tag + ':nth-child(' + index + ')' + classStr;
        }
      }

      // Prepend parent context for specificity (up to 2 levels)
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
     * Normalize a color string for deduplication.
     * Converts rgb(r,g,b) and rgba with alpha=1 to a canonical form.
     * Returns lowercase trimmed string.
     */
    function normalizeColor(color) {
      if (!color) return '';
      color = color.trim().toLowerCase();
      // Normalize rgba(r, g, b, 1) to rgb(r, g, b)
      var rgba = color.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*1(?:\.0*)?\s*\)$/);
      if (rgba) {
        return 'rgb(' + rgba[1] + ', ' + rgba[2] + ', ' + rgba[3] + ')';
      }
      return color;
    }

    /**
     * Check if a color value is transparent / effectively invisible.
     */
    function isTransparent(color) {
      if (!color) return true;
      var c = color.trim().toLowerCase();
      if (c === 'transparent' || c === 'rgba(0, 0, 0, 0)') return true;
      var m = c.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/);
      if (m && parseFloat(m[1]) === 0) return true;
      return false;
    }

    /**
     * Parse a spacing value string (e.g., "16px") to a number in px.
     * Returns NaN for non-px or unresolvable values.
     */
    function parsePx(value) {
      if (!value || value === 'auto' || value === 'normal') return NaN;
      var m = value.match(/^([\d.]+)px$/);
      return m ? parseFloat(m[1]) : NaN;
    }

    /**
     * Check whether an inline style attribute contains a hardcoded color.
     * Returns array of {property, value} for each hardcoded color found.
     */
    function findInlineHardcodedColors(el) {
      var styleAttr = el.getAttribute('style');
      if (!styleAttr) return [];
      var results = [];
      // Match hex colors
      var hexPattern = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/g;
      // Match rgb/rgba/hsl/hsla
      var funcPattern = /(?:rgb|hsl)a?\([^)]+\)/gi;

      var hexMatches = styleAttr.match(hexPattern) || [];
      var funcMatches = styleAttr.match(funcPattern) || [];

      hexMatches.forEach(function(match) {
        results.push({ property: 'inline-style', value: match });
      });
      funcMatches.forEach(function(match) {
        results.push({ property: 'inline-style', value: match });
      });
      return results;
    }

    // -----------------------------------------------------------------------
    // Audit logic
    // -----------------------------------------------------------------------

    var issues = [];
    var manualReview = [];

    // Broad selector covering most visible content elements
    var allSelector = 'body *';
    var elements = getVisibleElements(allSelector);
    var totalScanned = elements.length;

    // ---- 1. Color collection and CSS variable usage heuristic (DES-CONS-01) ----

    var colorProps = ['color', 'background-color', 'border-color', 'border-top-color',
      'border-right-color', 'border-bottom-color', 'border-left-color'];
    var uniqueColors = {};    // normalized color -> count
    var totalColorValues = 0;

    // Heuristic: We count unique non-transparent computed colors.
    // A high number of unique colors (>8) without a token system is suspicious.
    elements.forEach(function(el) {
      var computed = window.getComputedStyle(el);
      colorProps.forEach(function(prop) {
        var val = computed.getPropertyValue(prop);
        if (val && !isTransparent(val)) {
          totalColorValues++;
          var normalized = normalizeColor(val);
          uniqueColors[normalized] = (uniqueColors[normalized] || 0) + 1;
        }
      });
    });

    var uniqueColorCount = Object.keys(uniqueColors).length;

    // Estimate var() usage: Walk stylesheets to count declarations using var()
    // vs hardcoded values for color properties. This is a best-effort heuristic
    // since getComputedStyle resolves all variables.
    var varDeclarations = 0;
    var totalDeclarations = 0;
    try {
      var sheets = document.styleSheets;
      for (var s = 0; s < sheets.length; s++) {
        try {
          var rules = sheets[s].cssRules;
          if (!rules) continue;
          for (var r = 0; r < rules.length && totalDeclarations < 2000; r++) {
            var rule = rules[r];
            if (!rule.style) continue;
            colorProps.forEach(function(prop) {
              var val = rule.style.getPropertyValue(prop);
              if (val && val.trim()) {
                totalDeclarations++;
                if (val.indexOf('var(') !== -1) {
                  varDeclarations++;
                }
              }
            });
            // Also check shorthand 'background' and 'border'
            ['background', 'border'].forEach(function(prop) {
              var val = rule.style.getPropertyValue(prop);
              if (val && val.trim()) {
                // Only count if it contains color-like values
                if (val.match(/#[0-9a-fA-F]|rgb|hsl|var\(/i)) {
                  totalDeclarations++;
                  if (val.indexOf('var(') !== -1) {
                    varDeclarations++;
                  }
                }
              }
            });
          }
        } catch (e) {
          // Cross-origin stylesheets throw SecurityError, skip them
        }
      }
    } catch (e) {
      // Stylesheet access failed entirely
    }

    var varUsagePercent = totalDeclarations > 0
      ? Math.round((varDeclarations / totalDeclarations) * 100)
      : -1; // -1 indicates unable to determine

    // Flag low token adoption: <60% var() usage for color declarations
    if (varUsagePercent >= 0 && varUsagePercent < 60) {
      issues.push({
        category: 'Consistency & Tokens',
        ruleId: 'color-var-usage',
        desRuleId: 'DES-CONS-01',
        severity: 'medium',
        title: 'Low CSS variable adoption for colors',
        summary: 'Only ' + varUsagePercent + '% of color declarations use CSS custom properties (var()). Design tokens improve maintainability and consistency.',
        details: varDeclarations + ' of ' + totalDeclarations + ' color-related declarations use var(). Target: at least 60% adoption.',
        selector: ':root',
        tags: ['design-tokens', 'css-variables', 'colors'],
        wcagCriteria: [],
        evidence: {
          varDeclarations: varDeclarations,
          totalDeclarations: totalDeclarations,
          varUsagePercent: varUsagePercent,
          threshold: 60
        }
      });
    }

    // Flag excessive unique hardcoded colors (>8 unique colors)
    if (uniqueColorCount > 8) {
      // Sort colors by frequency for evidence
      var colorList = Object.keys(uniqueColors).map(function(c) {
        return { color: c, count: uniqueColors[c] };
      }).sort(function(a, b) { return b.count - a.count; });

      issues.push({
        category: 'Consistency & Tokens',
        ruleId: 'excessive-unique-colors',
        desRuleId: 'DES-CONS-01',
        severity: 'medium',
        title: 'Too many unique color values (' + uniqueColorCount + ')',
        summary: uniqueColorCount + ' unique color values detected. This suggests a lack of a disciplined color token system. Consider consolidating into a design token palette.',
        details: 'Found ' + uniqueColorCount + ' distinct computed color values across ' + totalScanned + ' elements. A well-tokenized system typically uses fewer unique resolved colors.',
        selector: 'body',
        tags: ['design-tokens', 'colors', 'consistency'],
        wcagCriteria: [],
        evidence: {
          uniqueColorCount: uniqueColorCount,
          topColors: colorList.slice(0, 15),
          threshold: 8
        }
      });
    }

    // ---- 2. Border Radius Consistency (DES-CONS-01) ----
    // Collect unique non-zero border-radius values. Flag if >4 unique values.

    var borderRadiusMap = {};  // value string -> count
    elements.forEach(function(el) {
      var computed = window.getComputedStyle(el);
      var br = computed.getPropertyValue('border-radius');
      if (br && br !== '0px') {
        var normalized = br.trim();
        borderRadiusMap[normalized] = (borderRadiusMap[normalized] || 0) + 1;
      }
    });

    var uniqueRadii = Object.keys(borderRadiusMap);
    var uniqueRadiiCount = uniqueRadii.length;

    if (uniqueRadiiCount > 4) {
      var radiiList = uniqueRadii.map(function(r) {
        return { value: r, count: borderRadiusMap[r] };
      }).sort(function(a, b) { return b.count - a.count; });

      issues.push({
        category: 'Consistency & Tokens',
        ruleId: 'border-radius-inconsistency',
        desRuleId: 'DES-CONS-01',
        severity: 'medium',
        title: 'Inconsistent border-radius values (' + uniqueRadiiCount + ' unique)',
        summary: uniqueRadiiCount + ' unique border-radius values found. The design standard recommends a maximum of 4 distinct radius values (e.g., sm, md, lg, full).',
        details: 'Define a radius scale such as --radius-sm (4px), --radius-md (8px), --radius-lg (12px), --radius-full (9999px) and consolidate all usages.',
        selector: 'body',
        tags: ['design-tokens', 'border-radius', 'consistency'],
        wcagCriteria: [],
        evidence: {
          uniqueCount: uniqueRadiiCount,
          values: radiiList,
          threshold: 4,
          recommendation: ['4px', '8px', '12px', '9999px']
        }
      });
    }

    // ---- 3. Spacing Grid Alignment (DES-SPAC-01) ----
    // Check padding, margin, and gap values on layout elements.
    // Determine base unit (typically 4px) and flag off-grid values.

    var spacingProps = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'gap',
      'row-gap', 'column-gap'];
    var spacingValues = [];      // all numeric spacing values in px
    var spacingFrequency = {};   // value -> count
    var offGridValues = [];      // { element selector, property, value }

    // Focus on layout-significant elements rather than every leaf node
    var layoutSelector = 'div, section, article, aside, main, header, footer, nav, ul, ol, li, form, fieldset, figure, details, summary, p, h1, h2, h3, h4, h5, h6, a, button, input, select, textarea, table, tr, td, th';
    var layoutElements = getVisibleElements(layoutSelector);

    layoutElements.forEach(function(el) {
      var computed = window.getComputedStyle(el);
      spacingProps.forEach(function(prop) {
        var val = computed.getPropertyValue(prop);
        var px = parsePx(val);
        if (!isNaN(px) && px > 0) {
          spacingValues.push(px);
          spacingFrequency[px] = (spacingFrequency[px] || 0) + 1;
        }
      });
    });

    // Determine base spacing unit: the most common smallest value, typically 4 or 8.
    // Look at all values that are <= 8px and pick the most frequent among common bases.
    var baseUnit = 4; // default assumption per DES-SPAC-01
    var candidateBases = [4, 8];
    var bestBaseScore = 0;
    candidateBases.forEach(function(base) {
      var alignedCount = 0;
      spacingValues.forEach(function(v) {
        // Allow 2px as acceptable (hairline borders) per edge case in DES-SPAC-01
        if (v <= 2 || v % base === 0) alignedCount++;
      });
      if (alignedCount > bestBaseScore) {
        bestBaseScore = alignedCount;
        baseUnit = base;
      }
    });

    // Flag values not on the detected grid (excluding values <= 2px per edge case)
    var offGridCount = 0;
    layoutElements.forEach(function(el) {
      var computed = window.getComputedStyle(el);
      spacingProps.forEach(function(prop) {
        var val = computed.getPropertyValue(prop);
        var px = parsePx(val);
        if (!isNaN(px) && px > 2 && px % baseUnit !== 0) {
          offGridCount++;
          if (offGridValues.length < 20) {
            offGridValues.push({
              selector: getCSSSelector(el),
              property: prop,
              value: px + 'px',
              nearestGridValue: Math.round(px / baseUnit) * baseUnit + 'px'
            });
          }
        }
      });
    });

    var spacingTotalCount = spacingValues.length;
    var offGridPercent = spacingTotalCount > 0
      ? Math.round((offGridCount / spacingTotalCount) * 100)
      : 0;

    // Threshold: flag if >25% of spacing values are off-grid
    if (offGridPercent > 25) {
      issues.push({
        category: 'Spacing & Grid',
        ruleId: 'spacing-off-grid',
        desRuleId: 'DES-SPAC-01',
        severity: 'medium',
        title: 'Spacing values not aligned to ' + baseUnit + 'px grid (' + offGridPercent + '% off-grid)',
        summary: offGridCount + ' of ' + spacingTotalCount + ' spacing values are not multiples of the ' + baseUnit + 'px base unit. Arbitrary values like 5px, 7px, 13px violate the spacing scale.',
        details: 'Use spacing tokens aligned to a ' + baseUnit + 'px grid: ' + baseUnit + 'px, ' + (baseUnit * 2) + 'px, ' + (baseUnit * 3) + 'px, ' + (baseUnit * 4) + 'px, etc. Values <= 2px are allowed for hairline separators.',
        selector: 'body',
        tags: ['spacing', 'grid-alignment', 'design-tokens'],
        wcagCriteria: [],
        evidence: {
          baseUnit: baseUnit,
          offGridCount: offGridCount,
          totalSpacingValues: spacingTotalCount,
          offGridPercent: offGridPercent,
          threshold: 25,
          examples: offGridValues
        }
      });
    }

    // Also flag individual egregious off-grid values even if overall percentage is OK
    offGridValues.forEach(function(item) {
      var px = parseFloat(item.value);
      // Flag truly arbitrary values (odd numbers, primes) as individual low-severity issues
      if (px > 2 && px % 2 !== 0 && offGridPercent <= 25) {
        issues.push({
          category: 'Spacing & Grid',
          ruleId: 'spacing-arbitrary-value',
          desRuleId: 'DES-SPAC-01',
          severity: 'low',
          title: 'Arbitrary spacing value: ' + item.value,
          summary: item.property + ' uses ' + item.value + ' which is not on the ' + baseUnit + 'px grid. Nearest grid value: ' + item.nearestGridValue + '.',
          details: 'Element: ' + item.selector + '. Replace ' + item.value + ' with ' + item.nearestGridValue + ' or the nearest spacing token.',
          selector: item.selector,
          tags: ['spacing', 'grid-alignment'],
          wcagCriteria: [],
          evidence: {
            property: item.property,
            value: item.value,
            nearestGridValue: item.nearestGridValue,
            baseUnit: baseUnit
          }
        });
      }
    });

    // ---- 4. Box Shadow Consistency (DES-CONS-01) ----
    // Collect unique box-shadow values. Flag if >3 unique non-none styles.

    var boxShadowMap = {};  // normalized shadow -> count
    elements.forEach(function(el) {
      var computed = window.getComputedStyle(el);
      var shadow = computed.getPropertyValue('box-shadow');
      if (shadow && shadow !== 'none') {
        var normalized = shadow.trim();
        boxShadowMap[normalized] = (boxShadowMap[normalized] || 0) + 1;
      }
    });

    var uniqueShadows = Object.keys(boxShadowMap);
    var uniqueShadowCount = uniqueShadows.length;

    if (uniqueShadowCount > 3) {
      var shadowList = uniqueShadows.map(function(s) {
        return { value: s, count: boxShadowMap[s] };
      }).sort(function(a, b) { return b.count - a.count; });

      issues.push({
        category: 'Consistency & Tokens',
        ruleId: 'box-shadow-inconsistency',
        desRuleId: 'DES-CONS-01',
        severity: 'low',
        title: 'Inconsistent box-shadow values (' + uniqueShadowCount + ' unique)',
        summary: uniqueShadowCount + ' unique box-shadow values found. A consistent elevation system uses at most 3-4 shadow levels.',
        details: 'Define an elevation scale with tokens: --shadow-sm (subtle lift), --shadow-md (card elevation), --shadow-lg (overlay/dropdown), --shadow-xl (modal/floating).',
        selector: 'body',
        tags: ['design-tokens', 'box-shadow', 'elevation', 'consistency'],
        wcagCriteria: [],
        evidence: {
          uniqueCount: uniqueShadowCount,
          values: shadowList,
          threshold: 3,
          recommendation: 'Define 3-4 elevation levels as CSS custom properties'
        }
      });
    }

    // ---- 5. Hardcoded Color Detection in Inline Styles (DES-CONS-01) ----
    // Scan for inline style attributes containing hardcoded hex, rgb, or hsl colors.

    var inlineColorIssues = [];
    elements.forEach(function(el) {
      var found = findInlineHardcodedColors(el);
      if (found.length > 0) {
        found.forEach(function(f) {
          inlineColorIssues.push({
            selector: getCSSSelector(el),
            value: f.value
          });
        });
      }
    });

    if (inlineColorIssues.length > 0) {
      // Individual instances are low severity; >10 total bumps to medium
      var inlineSeverity = inlineColorIssues.length > 10 ? 'medium' : 'low';

      issues.push({
        category: 'Consistency & Tokens',
        ruleId: 'inline-hardcoded-colors',
        desRuleId: 'DES-CONS-01',
        severity: inlineSeverity,
        title: 'Hardcoded colors in inline styles (' + inlineColorIssues.length + ' instances)',
        summary: inlineColorIssues.length + ' inline style attributes contain hardcoded color values (#hex, rgb(), hsl()). Use CSS custom properties instead.',
        details: 'Inline hardcoded colors bypass the design token system and make global theme changes impossible. Replace with var(--color-*) tokens.',
        selector: inlineColorIssues.length > 0 ? inlineColorIssues[0].selector : 'body',
        tags: ['design-tokens', 'inline-styles', 'colors', 'hardcoded'],
        wcagCriteria: [],
        evidence: {
          totalInstances: inlineColorIssues.length,
          examples: inlineColorIssues.slice(0, 15),
          severityThreshold: '10 instances triggers medium severity'
        }
      });
    }

    // -----------------------------------------------------------------------
    // Stats
    // -----------------------------------------------------------------------

    var stats = {
      totalElementsScanned: totalScanned,
      uniqueColors: uniqueColorCount,
      uniqueBorderRadii: uniqueRadiiCount,
      uniqueBoxShadows: uniqueShadowCount,
      spacingBaseUnit: baseUnit,
      spacingOffGridCount: offGridCount,
      spacingTotalCount: spacingTotalCount,
      varUsagePercent: varUsagePercent
    };

    return {
      auditId: 'design-tokens-audit',
      label: 'Design Tokens & Consistency',
      issueCount: issues.length,
      issues: issues,
      manualReview: manualReview,
      stats: stats
    };
  };
})();
