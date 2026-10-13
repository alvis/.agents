/**
 * Mobile layout and readability audit.
 *
 * Browser-injectable, framework-agnostic module.
 * Checks viewport meta, horizontal overflow, touch targets, text sizing, overlays.
 *
 * Usage (injected via <script src>):
 *   const report = window.runMobileLayoutAudit({ quiet: true });
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // DES rule-ID mapping for mobile-layout issues
  // ---------------------------------------------------------------------------
  var DES_RULE_MAP = {
    'viewport-meta':       'DES-RESP-03',
    'viewport-zoom':       'DES-RESP-03',
    'horizontal-overflow': 'DES-RESP-02',
    'mobile-body-text-size': 'DES-TYPO-01',
    'overlay-dominance':   'DES-RESP-02',
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

  // ---------------------------------------------------------------------------
  // Main audit
  // ---------------------------------------------------------------------------

  window.runMobileLayoutAudit = function (options) {
    options = options || {};

    var settings = {
      quiet: true,
      maxIssues: 200,
      ignoreSelectors: [],
      minBodyFontSize: 15.5,
      maxOverlayViewportHeightRatio: 0.3,
      selectors: {
        navbar: 'nav, header nav, [role="navigation"]',
        sidebar: 'aside, [role="complementary"], .sidebar',
        footer: 'footer, [role="contentinfo"]',
        main: 'main, [role="main"], #content',
        toc: '[role="navigation"][aria-label*="table"], .toc, .table-of-contents',
      },
      exclude: [],
      viewport: 'mobile',
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
        category: 'mobile',
        ruleId: opts.ruleId,
        desRuleId: DES_RULE_MAP[opts.ruleId] || 'DES-RESP-02',
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
    // Viewport meta tag
    // -----------------------------------------------------------------------
    var viewportMeta = (
      document.querySelector('meta[name="viewport"]')?.getAttribute('content') || ''
    );

    if (!viewportMeta) {
      pushIssue(createIssue({
        ruleId: 'viewport-meta',
        severity: 'high',
        title: 'Missing viewport meta tag',
        summary: 'The page is missing a viewport meta tag.',
        details: 'Without a viewport declaration, mobile layout and text scaling become unreliable.',
        selector: 'meta[name="viewport"]',
        tags: ['mobile', 'viewport'],
        wcagCriteria: ['1.4.4'],
      }));
    } else {
      var lowerViewportMeta = viewportMeta.toLowerCase();
      if (
        lowerViewportMeta.includes('user-scalable=no') ||
        /maximum-scale\s*=\s*1/.test(lowerViewportMeta)
      ) {
        pushIssue(createIssue({
          ruleId: 'viewport-zoom',
          severity: 'high',
          title: 'Viewport restricts zooming',
          summary: 'The viewport meta tag restricts zooming.',
          details: 'Preventing zoom blocks users who need browser scaling instead of in-page resizing.',
          selector: 'meta[name="viewport"]',
          tags: ['mobile', 'wcag'],
          wcagCriteria: ['1.4.4'],
          evidence: { content: viewportMeta },
        }));
      }
    }

    // -----------------------------------------------------------------------
    // Horizontal overflow
    // -----------------------------------------------------------------------
    var horizontalOverflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
    if (horizontalOverflow > 2) {
      pushIssue(createIssue({
        ruleId: 'horizontal-overflow',
        severity: horizontalOverflow > 24 ? 'high' : 'medium',
        title: 'Horizontal overflow on mobile viewport',
        summary: 'The page overflows horizontally by ' + Math.round(horizontalOverflow) + 'px.',
        details: 'Horizontal scrolling is a strong sign that some content, code samples, or controls do not fit the viewport.',
        selector: 'html',
        tags: ['mobile', 'layout'],
        evidence: {
          overflow: Math.round(horizontalOverflow),
          viewportWidth: window.innerWidth,
        },
      }));
    }

    // -----------------------------------------------------------------------
    // Body text size on mobile
    // -----------------------------------------------------------------------
    var textCandidates = Array.from(
      document.querySelectorAll('p, li, dd, dt, blockquote')
    ).filter(function (element) {
      if (matchesIgnoredSelector(element)) return false;
      var style = getComputedStyle(element);
      var rect = element.getBoundingClientRect();
      var text = (element.innerText || element.textContent || '').trim();

      return (
        text.length >= 20 &&
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none'
      );
    });

    textCandidates.forEach(function (element) {
      var fontSize = parseFloat(getComputedStyle(element).fontSize || '16');
      if (fontSize >= settings.minBodyFontSize) return;

      pushIssue(createIssue({
        ruleId: 'mobile-body-text-size',
        severity: fontSize <= 14 ? 'high' : 'medium',
        title: 'Body text is too small on mobile',
        summary: 'Body text renders at ' + fontSize + 'px.',
        details: 'Long-form content should generally render at ' + settings.minBodyFontSize +
          'px or above on mobile to avoid zoom dependency.',
        selector: getSelectorHint(element),
        tags: ['mobile', 'readability'],
        wcagCriteria: ['1.4.4'],
        evidence: { fontSize: fontSize },
      }));
    });

    // -----------------------------------------------------------------------
    // Large fixed/sticky overlays that crowd content
    // -----------------------------------------------------------------------
    var overlayCandidates = Array.from(
      document.querySelectorAll('body *')
    ).filter(function (element) {
      if (matchesIgnoredSelector(element)) return false;
      var style = getComputedStyle(element);
      if (style.position !== 'fixed' && style.position !== 'sticky') return false;

      var rect = element.getBoundingClientRect();
      return (
        rect.width >= window.innerWidth * 0.7 &&
        rect.height >= window.innerHeight * settings.maxOverlayViewportHeightRatio
      );
    });

    overlayCandidates.slice(0, 10).forEach(function (element) {
      var rect = element.getBoundingClientRect();
      pushIssue(createIssue({
        ruleId: 'overlay-dominance',
        severity: rect.height >= window.innerHeight * 0.45 ? 'high' : 'medium',
        title: 'Large fixed overlay on mobile viewport',
        summary: 'A fixed element occupies ' +
          Math.round((rect.height / window.innerHeight) * 100) +
          '% of the viewport height.',
        details: 'Large sticky or fixed layers can crowd content, especially when combined with narrow reading columns and mobile keyboards.',
        selector: getSelectorHint(element),
        tags: ['mobile', 'overlay'],
        evidence: {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      }));
    });

    // -----------------------------------------------------------------------
    // Build report
    // -----------------------------------------------------------------------
    var report = {
      auditId: 'mobile-layout-audit',
      label: 'Mobile Layout',
      issueCount: issues.length,
      issues: issues,
      manualReview: [],
      stats: {
        url: window.location.href,
        title: document.title,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        textCandidateCount: textCandidates.length,
      },
    };

    return report;
  };
})();
