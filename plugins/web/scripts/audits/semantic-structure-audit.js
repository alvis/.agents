/**
 * Semantic structure and baseline accessibility audit.
 *
 * Browser-injectable, framework-agnostic module.
 * Checks heading hierarchy, landmark regions, ARIA usage, images, forms.
 *
 * Usage (injected via <script src>):
 *   const report = window.runSemanticStructureAudit({ quiet: true });
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // DES rule-ID mapping for semantic-structure issues
  // ---------------------------------------------------------------------------
  var DES_RULE_MAP = {
    'document-title':            'DES-A11Y-01',
    'document-title-specificity': 'DES-A11Y-01',
    'meta-description':          'DES-A11Y-01',
    'meta-description-length':   'DES-A11Y-01',
    'landmark-main':             'DES-A11Y-01',
    'landmark-main-unique':      'DES-A11Y-01',
    'skip-link':                 'DES-A11Y-01',
    'heading-h1':                'DES-HIER-01',
    'heading-h1-unique':         'DES-HIER-01',
    'heading-order':             'DES-HIER-01',
    'duplicate-id':              'DES-A11Y-02',
    'image-alt':                 'DES-A11Y-03',
    'control-accessible-name':   'DES-A11Y-02',
    'form-label':                'DES-A11Y-02',
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Build a short, JSON-safe CSS selector for an element. */
  var getSelectorHint = function (element) {
    if (!element) return null;
    if (element.id) return '#' + element.id;

    var classNames = Array.from(element.classList || []).slice(0, 3);
    if (classNames.length > 0) {
      return element.tagName.toLowerCase() + '.' + classNames.join('.');
    }
    return element.tagName.toLowerCase();
  };

  /** Resolve aria-labelledby to text content. */
  var getLabelledByText = function (element) {
    return (element.getAttribute('aria-labelledby') || '')
      .split(/\s+/)
      .filter(Boolean)
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean)
      .map(function (node) { return (node.innerText || node.textContent || '').trim(); })
      .filter(Boolean)
      .join(' ')
      .trim();
  };

  /** Compute the accessible name of an element via the simplified name computation. */
  var getAccessibleName = function (element) {
    if (!element) return '';

    var ariaLabel = (element.getAttribute('aria-label') || '').trim();
    if (ariaLabel) return ariaLabel;

    var labelledBy = getLabelledByText(element);
    if (labelledBy) return labelledBy;

    var alt = (element.getAttribute('alt') || '').trim();
    if (alt) return alt;

    var title = (element.getAttribute('title') || '').trim();
    if (title) return title;

    if (element.id) {
      var label = document.querySelector('label[for="' + CSS.escape(element.id) + '"]');
      var labelText = (label?.innerText || label?.textContent || '').trim();
      if (labelText) return labelText;
    }

    var wrappedLabelText = (element.closest('label')?.innerText || '').trim();
    if (wrappedLabelText) return wrappedLabelText;

    var value = typeof element.value === 'string' ? element.value.trim() : '';
    if (value) return value;

    var placeholder = (element.getAttribute('placeholder') || '').trim();
    if (placeholder) return placeholder;

    return (element.innerText || element.textContent || '').trim();
  };

  // ---------------------------------------------------------------------------
  // Main audit
  // ---------------------------------------------------------------------------

  window.runSemanticStructureAudit = function (options) {
    options = options || {};

    var settings = {
      quiet: true,
      maxIssues: 200,
      ignoreSelectors: [],
      minTitleLength: 18,
      minMetaDescriptionLength: 70,
      maxMetaDescriptionLength: 170,
      selectors: {
        navbar: 'nav, header nav, [role="navigation"]',
        sidebar: 'aside, [role="complementary"], .sidebar',
        footer: 'footer, [role="contentinfo"]',
        main: 'main, [role="main"], #content',
        toc: '[role="navigation"][aria-label*="table"], .toc, .table-of-contents',
      },
      exclude: [],
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
        category: 'structure',
        ruleId: opts.ruleId,
        desRuleId: DES_RULE_MAP[opts.ruleId] || 'DES-A11Y-01',
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
    // Document title
    // -----------------------------------------------------------------------
    var pageTitle = document.title.trim();
    if (!pageTitle) {
      pushIssue(createIssue({
        ruleId: 'document-title',
        severity: 'high',
        title: 'Missing document title',
        summary: 'The page has no document title.',
        details: 'A missing title weakens orientation, browser history labels, and search previews.',
        selector: 'head > title',
        tags: ['wcag', 'seo', 'orientation'],
        wcagCriteria: ['2.4.2'],
      }));
    } else if (pageTitle.length < settings.minTitleLength) {
      pushIssue(createIssue({
        ruleId: 'document-title-specificity',
        severity: 'low',
        title: 'Document title is underspecified',
        summary: 'The title is only ' + pageTitle.length + ' characters long.',
        details: 'Short titles often miss page-specific context, especially on documentation pages.',
        selector: 'head > title',
        tags: ['seo', 'orientation'],
        evidence: { title: pageTitle },
      }));
    }

    // -----------------------------------------------------------------------
    // Meta description
    // -----------------------------------------------------------------------
    var metaDescription = (
      document.querySelector('meta[name="description"]')?.getAttribute('content') || ''
    ).trim();

    if (!metaDescription) {
      pushIssue(createIssue({
        ruleId: 'meta-description',
        severity: 'low',
        title: 'Missing meta description',
        summary: 'The page is missing a meta description.',
        details: 'This weakens search result previews and makes content intent harder to scan outside the page.',
        selector: 'meta[name="description"]',
        tags: ['seo', 'content'],
      }));
    } else if (
      metaDescription.length < settings.minMetaDescriptionLength ||
      metaDescription.length > settings.maxMetaDescriptionLength
    ) {
      pushIssue(createIssue({
        ruleId: 'meta-description-length',
        severity: 'low',
        title: 'Meta description length is off target',
        summary: 'The meta description is ' + metaDescription.length + ' characters long.',
        details: 'The current description is likely too short or too long to communicate value cleanly in search results.',
        selector: 'meta[name="description"]',
        tags: ['seo', 'content'],
        evidence: { length: metaDescription.length },
      }));
    }

    // -----------------------------------------------------------------------
    // Main landmark (uses generic selectors)
    // -----------------------------------------------------------------------
    var mains = Array.from(
      document.querySelectorAll(settings.selectors.main)
    ).filter(function (el) { return !matchesIgnoredSelector(el); });

    if (mains.length === 0) {
      pushIssue(createIssue({
        ruleId: 'landmark-main',
        severity: 'high',
        title: 'Missing main landmark',
        summary: 'No main landmark was found on the page.',
        details: 'Screen-reader users and keyboard users rely on a single main region to jump into the primary content.',
        selector: 'main',
        tags: ['wcag', 'structure'],
        wcagCriteria: ['1.3.1', '2.4.1'],
      }));
    } else if (mains.length > 1) {
      pushIssue(createIssue({
        ruleId: 'landmark-main-unique',
        severity: 'medium',
        title: 'Multiple main landmarks',
        summary: 'Found ' + mains.length + ' main landmarks.',
        details: 'Pages should expose one clear main content region to avoid orientation ambiguity.',
        selector: mains.map(getSelectorHint).join(', '),
        tags: ['wcag', 'structure'],
        wcagCriteria: ['1.3.1'],
      }));
    }

    // -----------------------------------------------------------------------
    // Skip link
    // -----------------------------------------------------------------------
    var skipLink = Array.from(document.querySelectorAll('a[href^="#"]')).find(function (anchor) {
      var text = (anchor.innerText || anchor.textContent || '').trim().toLowerCase();
      return text.includes('skip') && !matchesIgnoredSelector(anchor);
    });

    if (!skipLink) {
      pushIssue(createIssue({
        ruleId: 'skip-link',
        severity: 'medium',
        title: 'Missing skip link',
        summary: 'No visible skip link was detected.',
        details: 'A skip link is important on pages with persistent navigation and search chrome.',
        selector: 'a[href^="#"]',
        tags: ['wcag', 'navigation'],
        wcagCriteria: ['2.4.1'],
      }));
    }

    // -----------------------------------------------------------------------
    // Heading hierarchy
    // -----------------------------------------------------------------------
    var headings = Array.from(
      document.querySelectorAll('h1, h2, h3, h4, h5, h6')
    ).filter(function (el) { return !matchesIgnoredSelector(el); });

    var h1s = headings.filter(function (el) { return el.tagName === 'H1'; });

    if (h1s.length === 0) {
      pushIssue(createIssue({
        ruleId: 'heading-h1',
        severity: 'high',
        title: 'Missing H1 heading',
        summary: 'The page has no H1 heading.',
        details: 'Primary pages should have one clear page-level heading that matches the user\'s mental model of where they are.',
        selector: 'h1',
        tags: ['wcag', 'hierarchy'],
        wcagCriteria: ['1.3.1', '2.4.6'],
      }));
    } else if (h1s.length > 1) {
      pushIssue(createIssue({
        ruleId: 'heading-h1-unique',
        severity: 'medium',
        title: 'Multiple H1 headings',
        summary: 'Found ' + h1s.length + ' H1 headings.',
        details: 'Multiple H1s often flatten the page hierarchy and reduce scannability.',
        selector: h1s.map(getSelectorHint).join(', '),
        tags: ['wcag', 'hierarchy'],
        wcagCriteria: ['1.3.1', '2.4.6'],
      }));
    }

    var previousHeadingLevel = 0;
    for (var i = 0; i < headings.length; i++) {
      var heading = headings[i];
      var level = parseInt(heading.tagName.slice(1), 10);
      if (previousHeadingLevel > 0 && level - previousHeadingLevel > 1) {
        pushIssue(createIssue({
          ruleId: 'heading-order',
          severity: 'medium',
          title: 'Heading level jump',
          summary: 'Heading order jumps from H' + previousHeadingLevel + ' to H' + level + '.',
          details: 'Skipped heading levels make the structure harder to scan visually and with assistive technology.',
          selector: getSelectorHint(heading),
          tags: ['wcag', 'hierarchy'],
          wcagCriteria: ['1.3.1', '2.4.6'],
          evidence: { heading: (heading.innerText || '').trim().slice(0, 120) },
        }));
      }
      previousHeadingLevel = level;
    }

    // -----------------------------------------------------------------------
    // Duplicate IDs
    // -----------------------------------------------------------------------
    var duplicateIdCounts = {};
    Array.from(document.querySelectorAll('[id]')).forEach(function (element) {
      if (matchesIgnoredSelector(element)) return;
      duplicateIdCounts[element.id] = (duplicateIdCounts[element.id] || 0) + 1;
    });

    Object.keys(duplicateIdCounts).forEach(function (id) {
      var count = duplicateIdCounts[id];
      if (count <= 1) return;
      pushIssue(createIssue({
        ruleId: 'duplicate-id',
        severity: 'medium',
        title: 'Duplicate id attribute',
        summary: 'The id "' + id + '" appears ' + count + ' times.',
        details: 'Duplicate IDs break label relationships, fragment navigation, and scripted focus management.',
        selector: '#' + id,
        tags: ['wcag', 'dom-integrity'],
        wcagCriteria: ['4.1.1', '4.1.2'],
      }));
    });

    // -----------------------------------------------------------------------
    // Image alt text
    // -----------------------------------------------------------------------
    var images = Array.from(document.querySelectorAll('img')).filter(function (el) {
      return !matchesIgnoredSelector(el);
    });

    images.forEach(function (image) {
      var role = image.getAttribute('role');
      var hidden = image.getAttribute('aria-hidden') === 'true';
      var alt = image.getAttribute('alt');
      if (hidden || role === 'presentation') return;

      if (alt == null || alt.trim() === '') {
        pushIssue(createIssue({
          ruleId: 'image-alt',
          severity: 'high',
          title: 'Image without useful alt text',
          summary: 'An image is missing alt text.',
          details: 'Content and UI images need text alternatives unless they are explicitly decorative.',
          selector: getSelectorHint(image),
          tags: ['wcag', 'media'],
          wcagCriteria: ['1.1.1'],
        }));
      }
    });

    // -----------------------------------------------------------------------
    // Interactive controls without accessible names
    // -----------------------------------------------------------------------
    var interactiveSelector = [
      'a[href]', 'button', 'summary',
      'input:not([type="hidden"])', 'select', 'textarea',
      '[role="button"]', '[role="link"]',
    ].join(', ');

    Array.from(document.querySelectorAll(interactiveSelector)).forEach(function (element) {
      if (matchesIgnoredSelector(element)) return;
      if (element.closest('[aria-hidden="true"]')) return;

      var name = getAccessibleName(element);
      if (!name) {
        pushIssue(createIssue({
          ruleId: 'control-accessible-name',
          severity: 'high',
          title: 'Interactive control without accessible name',
          summary: 'An interactive element has no accessible name.',
          details: 'Buttons, links, form fields, and disclosure controls need a programmatic label that matches what users see.',
          selector: getSelectorHint(element),
          tags: ['wcag', 'forms', 'controls'],
          wcagCriteria: ['4.1.2', '2.5.3'],
        }));
      }
    });

    // -----------------------------------------------------------------------
    // Form controls without labels
    // -----------------------------------------------------------------------
    var formControls = Array.from(
      document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'
      )
    ).filter(function (el) { return !matchesIgnoredSelector(el); });

    formControls.forEach(function (element) {
      var label = getAccessibleName(element);
      if (!label) {
        pushIssue(createIssue({
          ruleId: 'form-label',
          severity: 'high',
          title: 'Form control without label',
          summary: 'A form control is missing a visible or programmatic label.',
          details: 'Placeholder-only labeling breaks accessibility and generally performs poorly for comprehension.',
          selector: getSelectorHint(element),
          tags: ['wcag', 'forms'],
          wcagCriteria: ['3.3.2', '4.1.2'],
        }));
      }
    });

    // -----------------------------------------------------------------------
    // Build report
    // -----------------------------------------------------------------------
    var report = {
      auditId: 'semantic-structure-audit',
      label: 'Semantic Structure',
      issueCount: issues.length,
      issues: issues,
      manualReview: [],
      stats: {
        url: window.location.href,
        title: document.title,
        headingCount: headings.length,
        h1Count: h1s.length,
        mainCount: mains.length,
        imageCount: images.length,
        interactiveCount: document.querySelectorAll(interactiveSelector).length,
      },
    };

    return report;
  };
})();
