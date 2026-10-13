/**
 * Navigation audit — Current Page Non-Link Affordance (DES-NAVI-03).
 *
 * Browser-injectable, framework-agnostic module.
 * Flags nav/hamburger items that represent the current page yet still behave
 * as clickable links (causing a reload/navigation) or omit `aria-current`.
 *
 * Usage (injected via <script src>):
 *   const report = window.runNavigationAudit({ quiet: true });
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // DES rule-ID mapping for navigation issues
  // ---------------------------------------------------------------------------
  var DES_RULE_MAP = {
    'current-page-is-link':       'DES-NAVI-03',
    'current-page-missing-aria':  'DES-NAVI-03',
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

  var resolvePath = function (anchor) {
    try {
      return new URL(anchor.href, window.location.origin).pathname;
    } catch (err) {
      return null;
    }
  };

  var isHomeLogo = function (anchor) {
    // Allow the "home" logo link to remain a link on the home page (convention).
    if (!anchor) return false;
    if (anchor.closest('[role="banner"], header')) {
      var hasLogo =
        anchor.querySelector('img, svg') !== null ||
        /logo|brand|home/i.test(anchor.className || '') ||
        /logo|brand|home/i.test(anchor.getAttribute('aria-label') || '');
      if (hasLogo) return true;
    }
    return false;
  };

  // ---------------------------------------------------------------------------
  // Main audit
  // ---------------------------------------------------------------------------

  window.runNavigationAudit = function (options) {
    options = options || {};

    var settings = {
      quiet: true,
      maxIssues: 100,
      ignoreSelectors: [],
      navSelector: 'nav a[href], [role="navigation"] a[href]',
      exclude: [],
      viewport: 'desktop',
    };

    Object.keys(options).forEach(function (key) {
      settings[key] = options[key];
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
        category: 'navigation',
        ruleId: opts.ruleId,
        desRuleId: DES_RULE_MAP[opts.ruleId] || 'DES-NAVI-03',
        severity: opts.severity,
        title: opts.title,
        summary: opts.summary,
        details: opts.details,
        selector: opts.selector || null,
        tags: opts.tags || [],
        wcagCriteria: opts.wcagCriteria || [],
        evidence: opts.evidence || {},
        recommendation: opts.recommendation || null,
      };
    };

    // -----------------------------------------------------------------------
    // Collect nav anchors whose resolved path matches the current pathname
    // -----------------------------------------------------------------------
    var currentPath = window.location.pathname;
    var anchors = Array.from(document.querySelectorAll(settings.navSelector))
      .filter(function (anchor) {
        if (matchesIgnoredSelector(anchor)) return false;
        return true;
      });

    var currentPageAnchors = anchors.filter(function (anchor) {
      var path = resolvePath(anchor);
      if (path === null) return false;
      if (path !== currentPath) return false;
      if (isHomeLogo(anchor)) return false;
      return true;
    });

    // -----------------------------------------------------------------------
    // Flag each current-page anchor as a DES-NAVI-03 violation
    // -----------------------------------------------------------------------
    currentPageAnchors.forEach(function (anchor) {
      var ariaCurrent = anchor.getAttribute('aria-current');
      var hasAriaCurrent = ariaCurrent === 'page' || ariaCurrent === 'true';
      var snippet = (anchor.outerHTML || '').slice(0, 200);

      // Primary violation: still a clickable <a href>
      pushIssue(createIssue({
        ruleId: 'current-page-is-link',
        severity: 'medium',
        title: 'Current page is still a clickable link',
        summary: 'Nav item for the active route "' + currentPath + '" is rendered as <a href> and will reload the page when clicked.',
        details: 'The current-page nav item should be non-navigable: use <span> or <button aria-current="page" disabled> instead of <a href>. Keep visibly distinct treatment matching DES-NAVI-02.',
        selector: getSelectorHint(anchor),
        tags: ['navigation', 'a11y'],
        wcagCriteria: ['2.4.8'],
        evidence: {
          dom_value: snippet,
          href: anchor.getAttribute('href'),
          pathname: currentPath,
          aria_current: ariaCurrent || null,
        },
        recommendation: {
          action: "Replace <a> with <span> or <button aria-current='page' disabled>",
          code_suggestion: "<span aria-current='page'>" + (anchor.textContent || '').trim() + "</span>",
          rule_ref: 'DES-NAVI-03',
        },
      }));

      // Secondary violation: missing aria-current
      if (!hasAriaCurrent) {
        pushIssue(createIssue({
          ruleId: 'current-page-missing-aria',
          severity: 'medium',
          title: 'Current page nav item missing aria-current',
          summary: 'Nav item for "' + currentPath + '" lacks aria-current="page"; assistive tech cannot identify the active route.',
          details: 'Add aria-current="page" to the nav item representing the current route so screen readers announce it as the active location.',
          selector: getSelectorHint(anchor),
          tags: ['navigation', 'a11y', 'aria'],
          wcagCriteria: ['4.1.2'],
          evidence: {
            dom_value: snippet,
            pathname: currentPath,
            aria_current: ariaCurrent || null,
          },
          recommendation: {
            action: "Add aria-current='page' to the current-route nav item",
            code_suggestion: "<span aria-current='page'>" + (anchor.textContent || '').trim() + "</span>",
            rule_ref: 'DES-NAVI-03',
          },
        }));
      }
    });

    // -----------------------------------------------------------------------
    // Build report
    // -----------------------------------------------------------------------
    var report = {
      auditId: 'navigation-audit',
      label: 'Navigation & Current-Page Affordance',
      issueCount: issues.length,
      issues: issues,
      manualReview: [],
      stats: {
        url: window.location.href,
        title: document.title,
        navAnchorCount: anchors.length,
        currentPageAnchorCount: currentPageAnchors.length,
      },
    };

    return report;
  };
})();
