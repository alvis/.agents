/**
 * Unused & redundant CSS audit.
 *
 * Browser-injectable, framework-agnostic module.
 * Detects bloated stylesheets, inline-style overrides of class rules,
 * duplicate inline style blocks, empty style attributes, and unused
 * custom CSS properties.
 *
 * Usage (injected via <script src>):
 *   const report = window.runUnusedCssAudit({ quiet: true });
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  /** Hard cap on total CSS selectors we will query during Rule 1. */
  var MAX_SCAN_SELECTORS = 2000;

  /** Cap on elements scanned for inline-style override detection (Rule 2). */
  var MAX_OVERRIDE_SCAN = 500;

  /** Tailwind / browser-level custom-property prefixes to exclude from Rule 5. */
  var SKIP_VAR_PATTERNS = [
    /^--tw-/,
    /^--webkit-/,
    /^--moz-/,
    /^--chrome-/
  ];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Human-readable CSS selector (tag#id.class, max 80 chars). */
  var getSelectorHint = function (element) {
    if (!element) return null;
    var hint = element.tagName.toLowerCase();
    if (element.id) {
      hint = hint + '#' + element.id;
    }
    var classNames = Array.from(element.classList || []).slice(0, 3);
    if (classNames.length > 0) {
      hint = hint + '.' + classNames.join('.');
    }
    if (hint.length > 80) {
      hint = hint.substring(0, 77) + '...';
    }
    return hint;
  };

  /** True when a selector cannot be reliably tested via querySelectorAll. */
  function isSkippableSelector(sel) {
    return /:{1,2}[\w-]+/.test(sel) || sel.trim() === '*' ||
           /:root/.test(sel) || /:is\(|:where\(|:has\(/.test(sel);
  }

  /** Remove pseudo-elements / pseudo-classes and their argument parens. */
  function stripPseudo(sel) {
    return sel.replace(/:{1,2}[\w-]+(\([^)]*\))?/g, '').trim();
  }

  /** Short label for a stylesheet (filename or "inline <style>"). */
  function getSheetLabel(sheet) {
    return sheet.href ? sheet.href.split('/').pop() : 'inline <style>';
  }

  /** True when a custom property name matches an excluded prefix. */
  function isSkippableVar(name) {
    for (var i = 0; i < SKIP_VAR_PATTERNS.length; i++) {
      if (SKIP_VAR_PATTERNS[i].test(name)) return true;
    }
    return false;
  }

  /**
   * Recursively collect all CSSStyleRule entries (type === 1) inside a
   * stylesheet or grouping rule, descending into @media and @supports blocks.
   */
  function collectStyleRules(container, sink) {
    var rules;
    try {
      rules = container.cssRules;
    } catch (err) {
      return; // CORS / security exception — skip silently
    }
    if (!rules) return;

    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (!rule) continue;
      // CSSStyleRule
      if (rule.type === 1) {
        sink.push(rule);
      } else if (typeof CSSMediaRule !== 'undefined' && rule instanceof CSSMediaRule) {
        collectStyleRules(rule, sink);
      } else if (typeof CSSSupportsRule !== 'undefined' && rule instanceof CSSSupportsRule) {
        collectStyleRules(rule, sink);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Main audit
  // ---------------------------------------------------------------------------

  window.runUnusedCssAudit = function (options) {
    options = options || {};

    var settings = {
      quiet: true,
      maxIssues: 200,
      ignoreSelectors: [],
      exclude: [],
      viewport: 'desktop'
    };

    Object.keys(options).forEach(function (key) {
      settings[key] = options[key];
    });

    var issues = [];
    var manualReview = [];

    var pushIssue = function (issue) {
      if (issues.length >= settings.maxIssues) return;
      issues.push(issue);
    };

    var createIssue = function (opts) {
      return {
        category: 'css',
        ruleId: opts.ruleId,
        severity: opts.severity,
        title: opts.title,
        summary: opts.summary,
        details: opts.details,
        selector: opts.selector || null,
        tags: opts.tags || [],
        wcagCriteria: opts.wcagCriteria || [],
        evidence: opts.evidence || {}
      };
    };

    // -----------------------------------------------------------------------
    // Rule 1: unused-stylesheet-selector
    // -----------------------------------------------------------------------
    var scannedSelectors = 0;
    var globalTruncated = false;

    var checkUnusedStylesheetSelectors = function () {
      var sheets = document.styleSheets;

      for (var si = 0; si < sheets.length; si++) {
        var sheet = sheets[si];
        if (!sheet) continue;

        // Shadow-DOM sheets: owner node root is not the main document
        try {
          if (sheet.ownerNode && sheet.ownerNode.getRootNode &&
              sheet.ownerNode.getRootNode() !== document) {
            continue;
          }
        } catch (err) {
          continue;
        }

        // Collect all CSSStyleRule entries (handles @media/@supports)
        var styleRules = [];
        collectStyleRules(sheet, styleRules);
        if (styleRules.length === 0) continue;

        var unusedCount = 0;
        var totalTested = 0;
        var topUnused = [];
        var sheetTruncated = false;

        for (var ri = 0; ri < styleRules.length; ri++) {
          if (scannedSelectors >= MAX_SCAN_SELECTORS) {
            sheetTruncated = true;
            globalTruncated = true;
            break;
          }

          var selectorText;
          try {
            selectorText = styleRules[ri].selectorText;
          } catch (err) {
            continue;
          }
          if (!selectorText) continue;

          var parts = selectorText.split(',');
          for (var pi = 0; pi < parts.length; pi++) {
            if (scannedSelectors >= MAX_SCAN_SELECTORS) {
              sheetTruncated = true;
              globalTruncated = true;
              break;
            }

            var raw = parts[pi].trim();
            if (!raw) continue;
            if (isSkippableSelector(raw)) continue;

            var stripped = stripPseudo(raw);
            if (!stripped) continue;

            scannedSelectors++;
            totalTested++;

            var matchCount = 0;
            try {
              matchCount = document.querySelectorAll(stripped).length;
            } catch (err) {
              continue; // invalid selector after strip — skip
            }

            if (matchCount === 0) {
              unusedCount++;
              if (topUnused.length < 10) {
                topUnused.push(raw);
              }
            }
          }
        }

        if (totalTested === 0 || unusedCount === 0) continue;

        var unusedRatio = unusedCount / totalTested;
        var severity;
        if (unusedRatio > 0.20) {
          severity = 'high';
        } else if (unusedRatio >= 0.05) {
          severity = 'medium';
        } else if (unusedCount >= 1 && unusedCount <= 4) {
          severity = 'low';
        } else {
          severity = 'low';
        }

        var label = getSheetLabel(sheet);

        pushIssue(createIssue({
          ruleId: 'unused-stylesheet-selector',
          severity: severity,
          title: 'Stylesheet has unused selectors',
          summary:
            label + ' has ' + unusedCount + ' of ' + totalTested +
            ' tested selectors that match no DOM elements (' +
            Math.round(unusedRatio * 100) + '%).',
          details:
            'Unused CSS rules inflate stylesheet size, slow parse/parser ' +
            'layout, and obscure which rules actually style the page. ' +
            'Consider pruning dead selectors or splitting per-page bundles.',
          selector: label,
          tags: ['css', 'performance'],
          wcagCriteria: [],
          evidence: {
            stylesheet: label,
            unusedCount: unusedCount,
            totalTested: totalTested,
            unusedRatio: Number(unusedRatio.toFixed(3)),
            topUnusedSelectors: topUnused,
            truncated: sheetTruncated
          }
        }));
      }
    };

    // -----------------------------------------------------------------------
    // Rule 2: inline-style-overrides-class
    // -----------------------------------------------------------------------
    var checkInlineStyleOverrides = function () {
      var candidates = document.querySelectorAll('[style][class]');
      var scanned = 0;

      for (var i = 0; i < candidates.length && scanned < MAX_OVERRIDE_SCAN; i++) {
        var el = candidates[i];
        // Visibility check
        var style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        var inlineStyle = el.style;
        if (!inlineStyle || inlineStyle.length === 0) continue;
        scanned++;

        var overrides = [];

        for (var pi = 0; pi < inlineStyle.length; pi++) {
          var prop = inlineStyle[pi];
          if (!prop) continue;

          var inlineValue = inlineStyle.getPropertyValue(prop);
          var inlinePriority = inlineStyle.getPropertyPriority(prop);

          var classValue = '';
          try {
            inlineStyle.removeProperty(prop);
            classValue = getComputedStyle(el).getPropertyValue(prop);
          } catch (err) {
            // swallow — restored below
          } finally {
            try {
              inlineStyle.setProperty(prop, inlineValue, inlinePriority);
            } catch (restoreErr) {
              // nothing more we can do
            }
          }

          if (!classValue || classValue === 'initial' || classValue === 'inherit') {
            continue;
          }

          var inlineComputed = '';
          try {
            inlineComputed = getComputedStyle(el).getPropertyValue(prop);
          } catch (err) {
            continue;
          }

          if (inlineComputed && classValue && inlineComputed !== classValue) {
            overrides.push({
              property: prop,
              inlineValue: inlineValue,
              classValue: classValue
            });
          }
        }

        if (overrides.length === 0) continue;

        pushIssue(createIssue({
          ruleId: 'inline-style-overrides-class',
          severity: 'medium',
          title: 'Inline style overrides class-based rule',
          summary:
            getSelectorHint(el) + ' uses inline style to override ' +
            overrides.length + ' class-declared propert' +
            (overrides.length === 1 ? 'y' : 'ies') + '.',
          details:
            'Inline styles circumvent the cascade and are harder to theme, ' +
            'override in responsive media queries, or audit. Prefer moving ' +
            'these declarations into a stylesheet or utility class.',
          selector: getSelectorHint(el),
          tags: ['css', 'maintainability'],
          wcagCriteria: [],
          evidence: {
            element: getSelectorHint(el),
            overrides: overrides
          }
        }));
      }
    };

    // -----------------------------------------------------------------------
    // Rule 3: duplicate-inline-styles
    // -----------------------------------------------------------------------
    var checkDuplicateInlineStyles = function () {
      var candidates = document.querySelectorAll('[style]');
      var groups = {};

      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        var raw = el.getAttribute('style');
        if (!raw) continue;
        var normalized = raw.replace(/\s+/g, ' ').trim();
        if (!normalized) continue;

        if (!groups[normalized]) {
          groups[normalized] = { count: 0, samples: [] };
        }
        groups[normalized].count++;
        if (groups[normalized].samples.length < 3) {
          groups[normalized].samples.push(getSelectorHint(el));
        }
      }

      var keys = Object.keys(groups);
      for (var k = 0; k < keys.length; k++) {
        var g = groups[keys[k]];
        if (g.count < 3) continue;

        pushIssue(createIssue({
          ruleId: 'duplicate-inline-styles',
          severity: 'low',
          title: 'Duplicate inline style repeated across elements',
          summary:
            'The inline style "' + (keys[k].length > 60 ? keys[k].substring(0, 57) + '...' : keys[k]) +
            '" appears on ' + g.count + ' elements.',
          details:
            'Repeated inline styles indicate a missing utility class or ' +
            'component abstraction. Extract the declarations into a shared ' +
            'class to improve maintainability and caching.',
          selector: g.samples.join(', '),
          tags: ['css', 'maintainability'],
          wcagCriteria: [],
          evidence: {
            style: keys[k],
            count: g.count,
            sampleSelectors: g.samples
          }
        }));
      }
    };

    // -----------------------------------------------------------------------
    // Rule 4: empty-style-attribute
    // -----------------------------------------------------------------------
    var checkEmptyStyleAttribute = function () {
      var candidates = document.querySelectorAll('[style]');
      var emptyCount = 0;
      var samples = [];

      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        var raw = el.getAttribute('style');
        if (raw === null) continue;
        if (raw.trim() !== '') continue;
        emptyCount++;
        if (samples.length < 10) {
          samples.push(getSelectorHint(el));
        }
      }

      if (emptyCount === 0) return;

      pushIssue(createIssue({
        ruleId: 'empty-style-attribute',
        severity: 'info',
        title: 'Empty style attribute present',
        summary:
          emptyCount + ' element' + (emptyCount === 1 ? '' : 's') +
          ' carry an empty style="" attribute.',
        details:
          'Empty style attributes add DOM noise and may indicate a ' +
          'framework clearing styles without removing the attribute. ' +
          'Safe to strip on server render or in a cleanup pass.',
        selector: samples.join(', '),
        tags: ['css', 'maintainability'],
        wcagCriteria: [],
        evidence: {
          count: emptyCount,
          sampleSelectors: samples
        }
      }));
    };

    // -----------------------------------------------------------------------
    // Rule 5: unused-css-variable
    // -----------------------------------------------------------------------
    var checkUnusedCssVariables = function () {
      var declarations = {}; // name -> context string
      var referencedNames = {};

      var VAR_REF_PATTERN = /var\(\s*(--[\w-]+)/g;

      var processDeclaration = function (name, value, context) {
        if (!name || !name.indexOf || name.indexOf('--') !== 0) return;
        if (isSkippableVar(name)) return;
        if (!declarations[name]) {
          declarations[name] = context;
        }
        // Harvest any var() refs inside the declaration's value
        if (value) {
          var match;
          VAR_REF_PATTERN.lastIndex = 0;
          while ((match = VAR_REF_PATTERN.exec(value)) !== null) {
            referencedNames[match[1]] = true;
          }
        }
      };

      var processStyleDecl = function (styleDecl, context) {
        if (!styleDecl) return;
        for (var i = 0; i < styleDecl.length; i++) {
          var prop = styleDecl[i];
          var value = '';
          try {
            value = styleDecl.getPropertyValue(prop);
          } catch (err) {
            value = '';
          }
          if (prop && prop.indexOf('--') === 0) {
            processDeclaration(prop, value, context);
          } else if (value) {
            // harvest var() refs from standard properties
            var match;
            VAR_REF_PATTERN.lastIndex = 0;
            while ((match = VAR_REF_PATTERN.exec(value)) !== null) {
              referencedNames[match[1]] = true;
            }
          }
        }
      };

      // Walk every accessible stylesheet
      var sheets = document.styleSheets;
      for (var si = 0; si < sheets.length; si++) {
        var sheet = sheets[si];
        if (!sheet) continue;

        try {
          if (sheet.ownerNode && sheet.ownerNode.getRootNode &&
              sheet.ownerNode.getRootNode() !== document) {
            continue;
          }
        } catch (err) {
          continue;
        }

        var styleRules = [];
        collectStyleRules(sheet, styleRules);
        var label = getSheetLabel(sheet);

        for (var ri = 0; ri < styleRules.length; ri++) {
          var rule = styleRules[ri];
          if (!rule || !rule.style) continue;
          processStyleDecl(rule.style, label + ' { ' + (rule.selectorText || '') + ' }');
        }
      }

      // Walk inline styles
      var inlineEls = document.querySelectorAll('[style]');
      for (var ie = 0; ie < inlineEls.length; ie++) {
        processStyleDecl(inlineEls[ie].style, 'inline on ' + getSelectorHint(inlineEls[ie]));
      }

      // Diff declared vs referenced
      var unused = [];
      var names = Object.keys(declarations);
      for (var n = 0; n < names.length; n++) {
        if (!referencedNames[names[n]]) {
          unused.push({ name: names[n], context: declarations[names[n]] });
        }
      }

      if (unused.length === 0) return;

      pushIssue(createIssue({
        ruleId: 'unused-css-variable',
        severity: 'low',
        title: 'Declared CSS custom property is never referenced',
        summary:
          unused.length + ' custom propert' + (unused.length === 1 ? 'y is' : 'ies are') +
          ' declared but never referenced via var().',
        details:
          'Unused custom properties are dead design tokens — they drift ' +
          'from the real rendered values and confuse maintainers. Remove ' +
          'them or add the intended var() references.',
        selector: null,
        tags: ['css', 'maintainability'],
        wcagCriteria: [],
        evidence: {
          unusedCount: unused.length,
          unusedVars: unused.slice(0, 20)
        }
      }));
    };

    // -----------------------------------------------------------------------
    // Run all checks
    // -----------------------------------------------------------------------
    checkUnusedStylesheetSelectors();
    checkInlineStyleOverrides();
    checkDuplicateInlineStyles();
    checkEmptyStyleAttribute();
    checkUnusedCssVariables();

    // -----------------------------------------------------------------------
    // Build report
    // -----------------------------------------------------------------------
    var bySeverity = { high: 0, medium: 0, low: 0, info: 0 };
    for (var i = 0; i < issues.length; i++) {
      var sev = issues[i].severity;
      if (bySeverity[sev] === undefined) bySeverity[sev] = 0;
      bySeverity[sev]++;
    }

    return {
      auditId: 'unused-css',
      label: 'Unused & Redundant CSS',
      issueCount: issues.length,
      issues: issues,
      manualReview: manualReview,
      stats: {
        totalIssues: issues.length,
        bySeverity: bySeverity,
        scannedSelectors: scannedSelectors,
        truncated: globalTruncated
      }
    };
  };
})();
