/**
 * Interaction and action clarity audit.
 *
 * Browser-injectable, framework-agnostic module.
 * Checks interactive element labels, touch target sizes, and generic CTA patterns.
 *
 * Usage (injected via <script src>):
 *   const report = window.runInteractionAudit({ quiet: true });
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // DES rule-ID mapping for interaction issues
  // ---------------------------------------------------------------------------
  var DES_RULE_MAP = {
    'target-size':      'DES-RESP-01',
    'generic-cta-label': 'DES-COPY-01',
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  var getSelectorHint = function (element) {
    if (!element) return null;
    if (element.id) return '#' + element.id;

    var classNames = Array.from(element.classList || []).slice(0, 3);
    if (classNames.length > 0) {
      return element.tagName.toLowerCase() + '.' + classNames.join('.');
    }
    return element.tagName.toLowerCase();
  };

  var getVisibleText = function (element) {
    return (element.innerText || element.textContent || element.getAttribute('aria-label') || '')
      .trim()
      .replace(/\s+/g, ' ');
  };

  var getRenderedBox = function (element) {
    var rect = element.getBoundingClientRect();
    var width = Math.max(rect.width, element.offsetWidth || 0, element.clientWidth || 0);
    var height = Math.max(rect.height, element.offsetHeight || 0, element.clientHeight || 0);
    return { rect: rect, width: width, height: height };
  };

  var isOnScreen = function (rect) {
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  };

  // ---------------------------------------------------------------------------
  // Main audit
  // ---------------------------------------------------------------------------

  window.runInteractionAudit = function (options) {
    options = options || {};

    var settings = {
      quiet: true,
      maxIssues: 200,
      ignoreSelectors: [],
      minTargetSize: 44,
      maxGenericLabelOccurrences: 2,
      selectors: {
        navbar: 'nav, header nav, [role="navigation"]',
        sidebar: 'aside, [role="complementary"], .sidebar',
        footer: 'footer, [role="contentinfo"]',
        main: 'main, [role="main"], #content',
        toc: '[role="navigation"][aria-label*="table"], .toc, .table-of-contents',
      },
      exclude: [],
      viewport: 'desktop',
    };

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

    var matchesIgnoredSelector = function (element) {
      return ignoredSelectors.some(function (selector) {
        return element?.matches?.(selector) || element?.closest?.(selector);
      });
    };

    var issues = [];

    var pushIssue = function (issue) {
      if (issues.length >= settings.maxIssues) return;
      issues.push(issue);
    };

    var createIssue = function (opts) {
      return {
        category: 'interaction',
        ruleId: opts.ruleId,
        desRuleId: DES_RULE_MAP[opts.ruleId] || 'DES-COPY-01',
        severity: opts.severity,
        title: opts.title,
        summary: opts.summary,
        details: opts.details,
        selector: opts.selector || null,
        tags: opts.tags || [],
        wcagCriteria: opts.wcagCriteria || [],
        evidence: opts.evidence || {},
      };
    };

    // -----------------------------------------------------------------------
    // Collect visible, interactive elements
    // -----------------------------------------------------------------------
    var interactiveElements = Array.from(
      document.querySelectorAll(
        'a[href], button, input:not([type="hidden"]), select, textarea, summary, ' +
        '[role="button"], [role="link"], [tabindex]:not([tabindex="-1"])'
      )
    ).filter(function (element) {
      if (matchesIgnoredSelector(element)) return false;
      var style = getComputedStyle(element);
      var box = getRenderedBox(element);

      return (
        box.width >= 8 &&
        box.height >= 8 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        parseFloat(style.opacity || '1') > 0 &&
        style.pointerEvents !== 'none' &&
        isOnScreen(box.rect)
      );
    });

    // -----------------------------------------------------------------------
    // Touch target size check (WCAG 2.5.8)
    // -----------------------------------------------------------------------
    interactiveElements.forEach(function (element) {
      var style = getComputedStyle(element);
      var box = getRenderedBox(element);
      var minDimension = Math.min(box.width, box.height);
      var shortfall = settings.minTargetSize - minDimension;
      var isLinkLike = element.tagName === 'A' || element.getAttribute('role') === 'link';

      // Detect whether the link has visual chrome (background, border, padding)
      var hasVisualChrome =
        style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
        ['solid', 'dashed', 'double'].includes(style.borderTopStyle) ||
        parseFloat(style.paddingLeft || '0') > 4 ||
        parseFloat(style.paddingRight || '0') > 4;

      var isInlineTextLink = isLinkLike && !hasVisualChrome && box.height < 32;

      // On mobile viewports, check all non-inline-text interactive elements;
      // on desktop, only check non-link elements (inline text links are exempt).
      var shouldCheckTargetSize = window.innerWidth < 768
        ? !isInlineTextLink
        : !isLinkLike;

      if (shouldCheckTargetSize && shortfall > 0) {
        pushIssue(createIssue({
          ruleId: 'target-size',
          severity: shortfall >= 12 ? 'high' : 'medium',
          title: 'Interactive target is too small',
          summary: 'Target measures ' + Math.round(box.width) + 'x' + Math.round(box.height) + 'px.',
          details: 'Interactive targets should generally be at least ' + settings.minTargetSize + 'px in both dimensions.',
          selector: getSelectorHint(element),
          tags: ['wcag', 'touch', 'mobile'],
          wcagCriteria: ['2.5.8'],
          evidence: { width: Math.round(box.width), height: Math.round(box.height) },
        }));
      }
    });

    // -----------------------------------------------------------------------
    // Generic / ambiguous CTA labels
    // -----------------------------------------------------------------------
    var genericLabels = {};
    var genericPattern = /^(learn more|read more|more|click here|get started|details)$/i;

    interactiveElements.forEach(function (element) {
      var label = getVisibleText(element);
      if (!genericPattern.test(label)) return;

      var key = label.toLowerCase();
      if (!genericLabels[key]) genericLabels[key] = [];
      genericLabels[key].push({
        element: element,
        label: label,
        href: element.getAttribute('href') || null,
      });
    });

    Object.keys(genericLabels).forEach(function (label) {
      var entries = genericLabels[label];
      if (entries.length <= settings.maxGenericLabelOccurrences) return;

      var uniqueTargets = {};
      entries.forEach(function (entry) {
        uniqueTargets[entry.href || getSelectorHint(entry.element)] = true;
      });
      if (Object.keys(uniqueTargets).length <= 1) return;

      pushIssue(createIssue({
        ruleId: 'generic-cta-label',
        severity: 'medium',
        title: 'Repeated generic action labels',
        summary: '"' + label + '" appears ' + entries.length + ' times with different targets.',
        details: 'Repeated generic labels reduce scan speed and make it harder to distinguish actions in dense content.',
        selector: entries.map(function (e) { return getSelectorHint(e.element); }).slice(0, 5).join(', '),
        tags: ['content', 'cta'],
        wcagCriteria: ['2.4.4'],
        evidence: { count: entries.length },
      }));
    });

    // -----------------------------------------------------------------------
    // Build report
    // -----------------------------------------------------------------------
    var report = {
      auditId: 'interaction-audit',
      label: 'Interaction Quality',
      issueCount: issues.length,
      issues: issues,
      manualReview: [],
      stats: {
        url: window.location.href,
        title: document.title,
        interactiveCount: interactiveElements.length,
      },
    };

    return report;
  };
})();
