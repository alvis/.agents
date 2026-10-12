/**
 * Visual composition and layout rhythm audit.
 *
 * Browser-injectable, framework-agnostic module.
 * Checks hero balance, TOC placement, and mobile boxed-fragmentation patterns.
 *
 * Usage (injected via <script src>):
 *   const report = window.runVisualLayoutAudit({ quiet: true });
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // DES rule-ID mapping for visual-layout issues
  // ---------------------------------------------------------------------------
  var DES_RULE_MAP = {
    'hero-visual-balance':       'DES-COMP-01',
    'detached-desktop-toc':      'DES-COMP-01',
    'mobile-boxed-fragmentation': 'DES-SPAC-01',
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  var getRect = function (node) {
    if (!node) return null;
    var rect = node.getBoundingClientRect();
    return {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
  };

  var selectorHint = function (element) {
    if (!element) return null;
    if (element.id) return '#' + element.id;
    var classNames = Array.from(element.classList || []).slice(0, 3);
    return classNames.length > 0
      ? element.tagName.toLowerCase() + '.' + classNames.join('.')
      : element.tagName.toLowerCase();
  };

  // ---------------------------------------------------------------------------
  // Main audit
  // ---------------------------------------------------------------------------

  window.runVisualLayoutAudit = function (options) {
    options = options || {};

    var settings = {
      quiet: true,
      desktopMinWidth: 1100,
      mobileMaxWidth: 520,
      heroHeightRatio: 1.4,
      heroBottomOverflow: 48,
      tocDetachedGap: 28,
      tocMinWidth: 220,
      mobileFragmentationCount: 10,
      mobileScrollLengthRatio: 6,
      mobileCardMinHeight: 72,
      mobileCardMaxHeight: 420,
      mobileCardMinRadius: 12,
      selectors: {
        navbar: 'nav, header nav, [role="navigation"]',
        sidebar: 'aside, [role="complementary"], .sidebar',
        footer: 'footer, [role="contentinfo"]',
        main: 'main, [role="main"], #content',
        // Generic TOC selectors -- no longer Docusaurus-specific
        toc: '[role="navigation"][aria-label*="table"], .toc, .table-of-contents, nav.toc',
        tocDesktop: '[role="navigation"][aria-label*="table"], .toc, .table-of-contents, nav.toc',
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

    var issues = [];
    var manualReview = [];

    var createManualReviewEntry = function (opts) {
      return {
        selector: opts.selector,
        summary: opts.summary,
        reason: opts.reason,
        aiPrompt: opts.aiPrompt,
        humanReview: {
          area: opts.humanArea,
          checklist: opts.humanChecks,
        },
        cropPath: '',
      };
    };

    // -----------------------------------------------------------------------
    // Hero balance analysis (desktop only)
    // -----------------------------------------------------------------------
    var analyzeHeroBalance = function () {
      if (window.innerWidth < settings.desktopMinWidth) return;

      // Use generic main selector
      var mainEl = document.querySelector(settings.selectors.main.split(',')[0].trim());
      if (!mainEl) mainEl = document.querySelector('main');
      var heroSection = mainEl?.querySelector('section');
      var heading = heroSection?.querySelector('h1');

      // Generic hero artwork detection -- not Docusaurus-specific
      var visual = heroSection?.querySelector(
        '[class*="hero" i] img, [class*="artwork" i], [class*="media" i] img, ' +
        'section > img, section > div > img, section > picture img'
      );

      if (!heroSection || !heading || !visual) return;

      // Walk up from heading to find the copy container generically
      var copy = heading.parentElement;
      var heroRect = getRect(heroSection);
      var copyRect = getRect(copy);
      var visualRect = getRect(visual);
      if (!heroRect || !copyRect || !visualRect) return;

      var heightRatio = visualRect.height / Math.max(copyRect.height, 1);
      var overflow = heroRect.bottom - window.innerHeight;

      if (heightRatio >= settings.heroHeightRatio && overflow >= settings.heroBottomOverflow) {
        issues.push({
          category: 'visual',
          ruleId: 'hero-visual-balance',
          desRuleId: DES_RULE_MAP['hero-visual-balance'],
          severity: 'medium',
          title: 'Hero artwork dominates the first screen',
          summary:
            'Hero media is ' + heightRatio.toFixed(2) +
            'x taller than the copy block and pushes the first section ' +
            Math.round(overflow) + 'px below the fold.',
          details:
            'The opening composition feels visually underweighted on the text side, which makes the page read sparse instead of deliberate.',
          selector: selectorHint(heroSection),
          tags: ['layout', 'hierarchy', 'hero'],
          wcagCriteria: [],
          evidence: {
            heroHeight: Math.round(heroRect.height),
            copyHeight: Math.round(copyRect.height),
            visualHeight: Math.round(visualRect.height),
            visualToCopyHeightRatio: Number(heightRatio.toFixed(2)),
            belowFoldOverflow: Math.round(overflow),
          },
        });
      } else if (heightRatio >= settings.heroHeightRatio - 0.12) {
        manualReview.push(createManualReviewEntry({
          selector: selectorHint(heroSection),
          summary: 'Hero composition may be visually imbalanced.',
          reason:
            'Artwork-to-copy height ratio is ' + heightRatio.toFixed(2) +
            ' with ' + Math.max(0, Math.round(overflow)) + 'px below the fold.',
          aiPrompt:
            'Review this hero crop for composition balance. Look for undersized copy, oversized artwork, dead space, and whether the first screen feels sparse or awkward.',
          humanArea: 'Opening hero composition',
          humanChecks: [
            'Does the copy block carry enough visual weight relative to the artwork?',
            'Does the first screen feel intentional rather than sparse?',
            'Is important content visible without requiring a scroll?',
          ],
        }));
      }
    };

    // -----------------------------------------------------------------------
    // Desktop TOC analysis (generic -- not Docusaurus-specific)
    // -----------------------------------------------------------------------
    var analyzeDesktopToc = function () {
      if (window.innerWidth < settings.desktopMinWidth) return;

      // Try each selector from the configurable tocDesktop list
      var tocSelectors = settings.selectors.tocDesktop.split(',').map(function (s) { return s.trim(); });
      var tocWrap = null;
      for (var i = 0; i < tocSelectors.length; i++) {
        tocWrap = document.querySelector(tocSelectors[i]);
        if (tocWrap) break;
      }

      // Also try to find the inner list of contents
      var toc = tocWrap?.querySelector('ul, ol') || tocWrap;
      var article = document.querySelector('article') ||
        document.querySelector(settings.selectors.main.split(',')[0].trim()) ||
        document.querySelector('main');

      if (!tocWrap || !toc || !article) return;

      var tocRect = getRect(tocWrap);
      var articleRect = getRect(article);
      var tocStyle = getComputedStyle(tocWrap);
      if (!tocRect || !articleRect || tocStyle.display === 'none' || tocRect.width < 1) return;

      var gap = tocRect.left - articleRect.right;

      if (gap > settings.tocDetachedGap || tocRect.width < settings.tocMinWidth) {
        issues.push({
          category: 'visual',
          ruleId: 'detached-desktop-toc',
          desRuleId: DES_RULE_MAP['detached-desktop-toc'],
          severity: gap > settings.tocDetachedGap + 16 ? 'medium' : 'low',
          title: 'Desktop table of contents feels detached from the article',
          summary:
            'Desktop TOC sits ' + Math.round(gap) +
            'px away from the article and is ' + Math.round(tocRect.width) + 'px wide.',
          details:
            'The right-rail navigation reads like a disconnected gutter element instead of an intentional reading aid.',
          selector: selectorHint(tocWrap),
          tags: ['layout', 'navigation', 'docs'],
          wcagCriteria: [],
          evidence: {
            tocWidth: Math.round(tocRect.width),
            articleWidth: Math.round(articleRect.width),
            tocGap: Math.round(gap),
          },
        });
      } else {
        manualReview.push(createManualReviewEntry({
          selector: selectorHint(tocWrap),
          summary: 'Desktop TOC placement should be visually grounded.',
          reason:
            'TOC width is ' + Math.round(tocRect.width) +
            'px with a ' + Math.round(gap) + 'px article gap.',
          aiPrompt:
            'Review this TOC crop for visual grounding. Check whether it feels attached to the reading surface, properly sized, and easy to scan.',
          humanArea: 'Desktop right-rail TOC',
          humanChecks: [
            'Does the TOC feel visually connected to the article?',
            'Is the TOC wide enough to scan without awkward wrapping?',
            'Does the right rail look intentional rather than leftover whitespace?',
          ],
        }));
      }
    };

    // -----------------------------------------------------------------------
    // Mobile boxed-fragmentation analysis
    // -----------------------------------------------------------------------
    var analyzeMobileFragmentation = function () {
      if (window.innerWidth > settings.mobileMaxWidth) return;

      var mainEl = document.querySelector(settings.selectors.main.split(',')[0].trim());
      if (!mainEl) mainEl = document.querySelector('main');
      if (!mainEl) return;

      var candidateElements = Array.from(
        mainEl.querySelectorAll('article, a, div, section')
      ).filter(function (element) {
        var style = getComputedStyle(element);
        var rect = getRect(element);
        var borderRadius = parseFloat(style.borderRadius || '0') || 0;
        var hasVisibleBorder = ['Top', 'Right', 'Bottom', 'Left'].some(function (edge) {
          return parseFloat(style['border' + edge + 'Width'] || '0') > 0.5;
        });
        var textLength = (element.textContent || '').trim().length;

        return (
          rect &&
          rect.width >= window.innerWidth * 0.7 &&
          rect.height >= settings.mobileCardMinHeight &&
          rect.height <= settings.mobileCardMaxHeight &&
          borderRadius >= settings.mobileCardMinRadius &&
          textLength >= 18 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          (style.boxShadow !== 'none' || hasVisibleBorder)
        );
      });

      var pageHeightRatio = document.documentElement.scrollHeight / Math.max(window.innerHeight, 1);

      if (
        candidateElements.length >= settings.mobileFragmentationCount &&
        pageHeightRatio >= settings.mobileScrollLengthRatio
      ) {
        issues.push({
          category: 'visual',
          ruleId: 'mobile-boxed-fragmentation',
          desRuleId: DES_RULE_MAP['mobile-boxed-fragmentation'],
          severity: 'medium',
          title: 'Mobile page is over-segmented into boxed panels',
          summary:
            'The page stacks ' + candidateElements.length +
            ' wide boxed panels across ' + pageHeightRatio.toFixed(1) + ' viewport heights.',
          details:
            'The layout reads as a long sequence of repeated cards instead of a paced narrative, which makes mobile scanning feel dense and repetitive.',
          selector: selectorHint(candidateElements[0]),
          tags: ['layout', 'mobile', 'density'],
          wcagCriteria: [],
          evidence: {
            boxedPanelCount: candidateElements.length,
            pageHeightRatio: Number(pageHeightRatio.toFixed(1)),
          },
        });
      } else if (candidateElements.length >= settings.mobileFragmentationCount - 2) {
        manualReview.push(createManualReviewEntry({
          selector: selectorHint(candidateElements[0]),
          summary: 'Mobile page may feel overly boxed and repetitive.',
          reason:
            'Detected ' + candidateElements.length +
            ' boxed panels across ' + pageHeightRatio.toFixed(1) + ' viewport heights.',
          aiPrompt:
            'Review this mobile crop for layout rhythm. Check whether repeated boxed panels make the page feel dense, repetitive, or exhausting to scan.',
          humanArea: 'Mobile content rhythm',
          humanChecks: [
            'Does the page feel like too many repeated cards in sequence?',
            'Would some sections read better as lighter rows or grouped lists?',
            'Is scrolling paced, or does the page feel long and low-signal?',
          ],
        }));
      }
    };

    // -----------------------------------------------------------------------
    // Nav section crop (all viewports)
    // -----------------------------------------------------------------------
    var analyzeNavSection = function () {
      var navSelectors = settings.selectors.navbar.split(',').map(function (s) { return s.trim(); });
      var navEl = null;
      for (var i = 0; i < navSelectors.length; i++) {
        navEl = document.querySelector(navSelectors[i]);
        if (navEl) break;
      }
      if (!navEl) return;

      var navRect = getRect(navEl);
      if (!navRect || navRect.height < 1) return;

      manualReview.push(createManualReviewEntry({
        selector: selectorHint(navEl),
        summary: 'Nav section should be reviewed for hierarchy and legibility.',
        reason:
          'Nav spans ' + Math.round(navRect.width) +
          'x' + Math.round(navRect.height) + 'px at the top of the page.',
        aiPrompt:
          'Review this nav crop for hierarchy, density, and active-state legibility.',
        humanArea: 'Primary navigation',
        humanChecks: [
          'Is the active state clearly distinguishable from inactive items?',
          'Does the nav feel appropriately dense without crowding?',
          'Is the brand mark balanced against the nav items?',
        ],
      }));
    };

    // -----------------------------------------------------------------------
    // Mid-page section crop (all viewports)
    // -----------------------------------------------------------------------
    var analyzeMidSection = function () {
      var mainEl = document.querySelector(settings.selectors.main.split(',')[0].trim());
      if (!mainEl) mainEl = document.querySelector('main');
      if (!mainEl) return;

      var pageHeight = document.documentElement.scrollHeight;
      var midRect = getRect(mainEl);
      if (!midRect || pageHeight < window.innerHeight * 1.5) return;

      manualReview.push(createManualReviewEntry({
        selector: selectorHint(mainEl),
        summary: 'Mid-page rhythm and content density should be reviewed.',
        reason:
          'Page is ' + Math.round(pageHeight) +
          'px tall; sampling viewport centered at scrollY=' +
          Math.round(pageHeight * 0.5) + 'px.',
        aiPrompt:
          'Review this mid-page crop for rhythm, scannability, and content density.',
        humanArea: 'Mid-page content rhythm',
        humanChecks: [
          'Does content flow with intentional rhythm or feel monotonous?',
          'Are sections scannable with clear visual anchors?',
          'Is density appropriate for the content type?',
        ],
      }));
    };

    // -----------------------------------------------------------------------
    // Footer section crop (all viewports)
    // -----------------------------------------------------------------------
    var analyzeFooterSection = function () {
      var footerSelectors = settings.selectors.footer.split(',').map(function (s) { return s.trim(); });
      var footerEl = null;
      for (var i = 0; i < footerSelectors.length; i++) {
        footerEl = document.querySelector(footerSelectors[i]);
        if (footerEl) break;
      }
      if (!footerEl) return;

      var footerRect = getRect(footerEl);
      if (!footerRect || footerRect.height < 1) return;

      manualReview.push(createManualReviewEntry({
        selector: selectorHint(footerEl),
        summary: 'Footer should be reviewed for grouping and brand resolution.',
        reason:
          'Footer spans ' + Math.round(footerRect.width) +
          'x' + Math.round(footerRect.height) + 'px at the page tail.',
        aiPrompt:
          'Review this footer crop for grouping clarity, link density, and brand resolution.',
        humanArea: 'Page footer',
        humanChecks: [
          'Are link groups clearly delineated with readable headings?',
          'Is link density manageable rather than overwhelming?',
          'Does the brand close the page with appropriate weight?',
        ],
      }));
    };

    // -----------------------------------------------------------------------
    // Run analyses
    // -----------------------------------------------------------------------
    analyzeHeroBalance();
    analyzeDesktopToc();
    analyzeMobileFragmentation();
    analyzeNavSection();
    analyzeMidSection();
    analyzeFooterSection();

    // -----------------------------------------------------------------------
    // Build report
    // -----------------------------------------------------------------------
    var report = {
      auditId: 'visual-layout-audit',
      label: 'Visual Composition',
      issueCount: issues.length,
      issues: issues,
      manualReview: manualReview,
      stats: {
        url: window.location.href,
        title: document.title,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        manualReviewCount: manualReview.length,
      },
    };

    return report;
  };
})();
